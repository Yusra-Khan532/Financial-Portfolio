"""Task #328 (24 Nov 2026): why RELIANCE and HDFCBANK ended as "writer_failed", and the fix.
- the writer (a thinking Gemini model) spends its output budget on thinking AND the answer; with a long annual report the JSON was cut off (finishReason
  MAX_TOKENS) or came back empty, and every such end was recorded as "did not pass the citation checks";
- the provider now sends a small thinking setting in the field the model family takes, reads finishReason and the token counts, and raises Truncated;
- the brief asks once more with fewer pages after a cut-off answer, and records each way an attempt ends with its own state, reason and page message;
- a writing service that did not answer is not counted toward the attempts; migration 140 lets the old failed_output companies be tried again.
Needs Postgres and Redis for the job tests."""
import asyncio
import json
from pathlib import Path

import httpx
import pytest

from finlit.company_brief import api as A
from finlit.company_brief import config as C
from finlit.company_brief import service as S
from finlit.earnings.provider import GeminiProvider, ProviderError, Truncated, thinking_config
from test_company_brief_job import FakeLlm, brief_json, row, run, seed
from test_integration import store  # noqa: F401  (fixture)


# ------------------------------------------------------------------------------------------------ the provider
def reply(text=None, finish="STOP", thought=None, usage=None):
    parts = ([{"text": thought, "thought": True}] if thought else []) + ([{"text": text}] if text is not None else [])
    cand = {"finishReason": finish, **({"content": {"parts": parts}} if parts else {})}
    return {"candidates": [cand], "usageMetadata": usage or {"promptTokenCount": 50000, "candidatesTokenCount": 120, "thoughtsTokenCount": 16000}}


def provider(handler, model="gemini-3.8-flash", thinking="low"):
    return GeminiProvider("k", model, transport=httpx.MockTransport(handler), max_output_tokens=16384, thinking=thinking)


def test_the_thinking_setting_goes_in_the_field_the_model_family_takes():
    assert thinking_config("gemini-3.8-flash", "low") == {"thinkingLevel": "low"}
    assert thinking_config("gemini-2.5-flash", "minimal") == {"thinkingBudget": 0}
    assert thinking_config("gemini-2.5-pro", "minimal") == {"thinkingBudget": 128}       # Pro cannot think 0 tokens
    assert thinking_config("gemini-2.0-flash", "low") is None and thinking_config("gemini-3.8-flash", "") is None
    assert C.thinking({}) == "low" and C.thinking({"BRIEF_THINKING": "off"}) == "" and C.thinking({"BRIEF_THINKING": "High"}) == "high"


def test_the_brief_sends_its_thinking_setting_and_the_earnings_calls_keep_their_default():
    sent = []

    def handler(req):
        sent.append(json.loads(req.content))
        return httpx.Response(200, json=reply('{"ok": 1}'))

    async def go():
        assert await provider(handler).generate("s", "u") == '{"ok": 1}'
        await GeminiProvider("k", "gemini-3.8-flash", transport=httpx.MockTransport(handler)).generate("s", "u")    # how the earnings job builds it
    asyncio.run(go())
    assert sent[0]["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "low"} and sent[0]["generationConfig"]["maxOutputTokens"] == 16384
    assert "thinkingConfig" not in sent[1]["generationConfig"]


def test_a_reply_cut_off_at_the_limit_raises_truncated_with_its_counts():
    p = provider(lambda req: httpx.Response(200, json=reply('{"about": [{"text": "Reliance is', finish="MAX_TOKENS", thought="planning...")))
    with pytest.raises(Truncated) as e:
        asyncio.run(p.generate("s", "u"))
    assert isinstance(e.value, ProviderError)                       # the earnings job, which catches ProviderError, treats it as before
    assert e.value.partial == '{"about": [{"text": "Reliance is' and e.value.finish_reason == "MAX_TOKENS"
    assert p.last == {"finish": "MAX_TOKENS", "prompt_tokens": 50000, "out_tokens": 120, "thought_tokens": 16000}
    p2 = provider(lambda req: httpx.Response(200, json=reply(None, finish="MAX_TOKENS", thought="all of it")))   # thinking used it all: no answer at all
    with pytest.raises(Truncated):
        asyncio.run(p2.generate("s", "u"))


def test_a_reply_without_text_names_its_finish_reason():
    p = provider(lambda req: httpx.Response(200, json=reply(None, finish="SAFETY")))
    with pytest.raises(ProviderError, match="SAFETY"):
        asyncio.run(p.generate("s", "u"))


def test_a_model_that_refuses_the_thinking_setting_is_asked_again_without_it():
    seen = []

    def handler(req):
        body = json.loads(req.content)
        seen.append("thinkingConfig" in body["generationConfig"])
        if "thinkingConfig" in body["generationConfig"]:
            return httpx.Response(400, json={"error": {"message": "Thinking level is not supported for this model."}})
        return httpx.Response(200, json=reply('{"ok": 1}'))

    p = provider(handler)
    assert asyncio.run(p.generate("s", "u")) == '{"ok": 1}' and p.thinking is None
    asyncio.run(p.generate("s", "u"))
    assert seen == [True, False, False]                               # one wasted request, then never sent again


# ------------------------------------------------------------------------------------------------ the brief job
class CutOnceLlm(FakeLlm):
    """A long prompt is cut off (as RELIANCE's annual report was); the shorter second prompt is answered."""

    def __init__(self, always=False):
        super().__init__()
        self.always = always

    async def generate(self, system, user):
        self.requests += 1
        self.prompts.append(user)
        self.last = {"finish": "MAX_TOKENS", "prompt_tokens": len(user) // 4, "out_tokens": 300, "thought_tokens": 16000}
        if self.always or self.requests == 1:
            raise Truncated('{"about": [', "MAX_TOKENS")
        self.last = {"finish": "STOP", "prompt_tokens": len(user) // 4, "out_tokens": 4000, "thought_tokens": 900}
        return json.dumps(brief_json())


class DownLlm(FakeLlm):
    async def generate(self, system, user):
        self.requests += 1
        raise ProviderError("HTTP 503")


async def source(st, symbol="ACME"):
    async with st.pool.acquire() as conn:
        return dict(await conn.fetchrow("SELECT * FROM company_brief_sources WHERE symbol = $1", symbol))


async def test_a_cut_off_answer_is_asked_again_with_fewer_pages_and_the_draft_is_written(store):  # noqa: F811
    await seed(store)
    llm = CutOnceLlm()
    out = await run(store, llm)
    assert llm.requests == 2 and out["written"] == 1 and out["shorter_retries"] == 1 and out["cut_off"] == 1
    assert len(llm.prompts[1]) <= len(llm.prompts[0])
    assert (await row(store))["status"] == "draft"
    assert out["outcomes"] == [{"symbol": "ACME", "outcome": "written", "finish": "STOP", "prompt_chars": len(llm.prompts[1]), "out_tokens": 4000, "thought_tokens": 900}]
    assert (await source(store))["last_state"] == "written"


async def test_an_answer_cut_off_twice_is_recorded_as_cut_off_and_said_so_on_the_page(store):  # noqa: F811
    await seed(store)
    out = await run(store, CutOnceLlm(always=True))
    src = await source(store)
    assert out.get("written", 0) == 0 and out["failed_cutoff"] == 1 and out["outcomes"][0]["outcome"] == "cut_off"
    assert out["outcomes"][0]["thought_tokens"] == 16000 and src["last_state"] == "failed_cutoff" and src["attempts"] == 1
    v = A.public_view(None, src, "ACME", "Acme")
    assert v["code"] == "writer_cut_off" and "fewer pages" in v["reason"] and "citation" not in v["reason"]


async def test_a_writing_service_that_did_not_answer_is_not_counted_as_an_attempt(store):  # noqa: F811
    await seed(store)
    out = await run(store, DownLlm())
    src = await source(store)
    assert out["failed_writer"] == 1 and out.get("failed", 0) == 0 and out["outcomes"][0]["outcome"] == "writer_error"
    assert src["last_state"] == "failed_writer" and src["attempts"] == 0 and "HTTP 503" in src["last_reason"]
    assert A.public_view(None, src, "ACME", "Acme")["code"] == "writer_unavailable"


async def test_an_unreadable_answer_and_an_empty_one_are_told_apart(store):  # noqa: F811
    await seed(store)

    class Junk(FakeLlm):
        async def generate(self, system, user):
            self.requests += 1
            return "this is not json"
    out = await run(store, Junk())
    src = await source(store)
    assert out["failed"] == 1 and src["last_state"] == "failed_output" and out["outcomes"][0]["outcome"] == "unreadable_answer"
    assert A.public_view(None, src, "ACME", "Acme")["code"] == "writer_unreadable"
    await seed(store)
    await run(store, FakeLlm(lambda u: {"unrelated": 1}))
    src = await source(store)
    assert src["last_state"] == "failed_noparts" and A.public_view(None, src, "ACME", "Acme")["code"] == "writer_empty"


async def test_migration_140_lets_the_old_failed_output_companies_be_tried_again(store):  # noqa: F811
    await seed(store, symbols=("RELIANCE", "HDFCBANK", "TCS"))
    async with store.pool.acquire() as conn:
        await conn.execute("INSERT INTO company_brief_sources (symbol, last_state, attempts, last_tried_at) VALUES ('HDFCBANK','failed_output',3,now()), ('TCS','failed_unreadable',2,now()) "
                           "ON CONFLICT (symbol) DO UPDATE SET last_state = EXCLUDED.last_state, attempts = EXCLUDED.attempts, last_tried_at = now()")
        await conn.execute("UPDATE company_brief_sources SET last_state = 'failed_output', attempts = 2, last_tried_at = now() WHERE symbol = 'RELIANCE'")
        await conn.execute((Path(S.__file__).parents[1] / "migrations" / "140_company_brief_writer_retry.sql").read_text())
        got = {r["symbol"]: (r["attempts"], r["last_tried_at"]) for r in await conn.fetch("SELECT symbol, attempts, last_tried_at FROM company_brief_sources")}
    assert got["RELIANCE"] == (0, None) and got["HDFCBANK"] == (0, None)
    assert got["TCS"][0] == 2                                           # only the writer failures
