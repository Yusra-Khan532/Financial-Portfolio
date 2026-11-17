"""Ask FinLit AI (finlit/ask): answers from FinLit's own data, streamed. Claude is replaced by a scripted fake here (no key, no cost); everything else is real:
Postgres and Redis, signed-in Basic / Silver / Gold members, the website's own routes called in-process as the member.

What must hold: Silver and Gold members only (Basic keeps the listed questions); the monthly allowance per plan (Silver 50, Gold 100) is taken atomically, given back when no answer was
written, and a repeated first question is answered from the cache without using it; the AI reads data with the member's own session, so a plan never
sees more than on the website; tool results are small; an advice-like answer is withdrawn; the answer streams as events; no key = 503 not_enabled."""

import dataclasses
import json
from types import SimpleNamespace as NS
from typing import Any, Dict, List

import anthropic
import httpx
import pytest

from finlit.ask import api as ask_api, quota, service, tools as T
from finlit.ask.gateway import MemberGateway
from finlit.auth.service import Ctx, cookie_name
from finlit.mcp.gateway import ToolError
from test_auth import anon, app, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401


# ------------------------------------------------------------------------------------------------------------------ a scripted Claude

def usage(i=100, o=20, cr=0, cw=0):
    return NS(input_tokens=i, output_tokens=o, cache_read_input_tokens=cr, cache_creation_input_tokens=cw)


class FakeStream:
    def __init__(self, turn):
        self.turn = turn

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    def __aiter__(self):
        async def gen():
            for t in self.turn.get("text", []):
                yield NS(type="text", text=t)
        return gen()

    async def get_final_message(self):
        blocks = [NS(type="text", text="".join(self.turn.get("text", [])))] if self.turn.get("text") else []
        blocks += [NS(type="tool_use", id=f"tu{i}", name=n, input=a) for i, (n, a) in enumerate(self.turn.get("tools", []))]
        return NS(content=blocks, stop_reason=self.turn.get("stop", "tool_use" if self.turn.get("tools") else "end_turn"), usage=usage())


class FakeClient:
    """Answers each request with the next scripted turn and keeps every request's parameters."""

    def __init__(self, turns: List[Dict[str, Any]], fail: Exception = None):
        self.turns, self.fail, self.calls = list(turns), fail, []
        self.messages = self

    def stream(self, **params):
        if self.fail:
            raise self.fail
        self.calls.append({**params, "messages": list(params["messages"])})
        return FakeStream(self.turns.pop(0))


class FakeGateway:
    def __init__(self, answers: Dict[str, Any]):
        self.answers, self.paths = answers, []

    async def json(self, path, params=None, *, method="GET", body=None, subject="That"):
        self.paths.append(path)
        a = self.answers.get(path)
        if isinstance(a, Exception):
            raise a
        if a is None:
            raise ToolError(f"{subject} was not found in FinLit's data.")
        return a


async def collect(client, gw, question="What is TCS's ROE?"):
    events: List[tuple] = []

    async def emit(e, d):
        events.append((e, d))
    res = await service.answer(client, "claude-haiku-5-5", gw, service.build_messages([], question, None, "silver"), emit)
    return res, events


RATIOS = {"latest": {"roe": {"label": "ROE", "value": 41.2, "unit": "%", "period": "FY2026"}}, "history": {}, "meta": {"generatedAt": "2026-11-14T10:00:00"}}


# ------------------------------------------------------------------------------------------------------------------ the answer loop (no database)

async def test_reads_figures_with_a_tool_then_streams_the_answer_and_says_what_it_read():
    client = FakeClient([{"tools": [("get_ratios", {"symbol": "tcs"})]}, {"text": ["TCS's ROE was ", "41.2% in FY2026."]}])
    gw = FakeGateway({"/api/stocks/TCS/ratios": RATIOS})
    res, events = await collect(client, gw)
    assert res["text"] == "TCS's ROE was 41.2% in FY2026." and res["tools"] == ["get_ratios"] and res["stop"] == "end_turn"
    assert ("status", {"text": "Reading the ratios (TCS)"}) in events
    assert [d["text"] for e, d in events if e == "text"] == ["TCS's ROE was ", "41.2% in FY2026."]
    # the second request carries the tool result, with FinLit's figure, its source and the symbol cleaned to upper case
    tr = client.calls[1]["messages"][-1]["content"][0]
    assert tr["type"] == "tool_result" and tr["tool_use_id"] == "tu0" and "41.2" in tr["content"] and "FinLit" in tr["content"] and not tr.get("is_error")
    assert gw.paths == ["/api/stocks/TCS/ratios"]
    assert "visitor" not in tr["content"] and "this member's plan includes" in tr["content"]      # the MCP's visitor wording is said for the member


async def test_fast_settings_low_effort_cached_prefix_and_the_same_tools_for_everyone():
    client = FakeClient([{"text": ["P/E is price divided by earnings per share."]}])
    await collect(client, FakeGateway({}), "What is P/E?")
    p = client.calls[0]
    assert p["model"] == "claude-haiku-5-5" and p["output_config"] == {"effort": "low"} and p["max_tokens"] <= 2000
    assert p["system"][0]["cache_control"] == {"type": "ephemeral"} and p["cache_control"] == {"type": "ephemeral"}
    assert [t["name"] for t in p["tools"]] == [t["name"] for t in T.definitions()]          # one fixed list: the cache stays warm
    assert "Today is" not in p["system"][0]["text"] and "Today is" in p["messages"][-1]["content"]   # the date is after the cached prefix


async def test_several_tools_of_one_round_are_read_together_and_a_failed_one_is_reported_as_an_error():
    client = FakeClient([{"tools": [("get_ratios", {"symbol": "TCS"}), ("get_shareholding", {"symbol": "TCS"})]}, {"text": ["Done."]}])
    gw = FakeGateway({"/api/stocks/TCS/ratios": RATIOS})       # the ownership section is missing
    await collect(client, gw)
    results = client.calls[1]["messages"][-1]["content"]
    assert len(results) == 2 and not results[0].get("is_error") and results[1]["is_error"] is True and "not found" in results[1]["content"]


async def test_a_tool_result_is_kept_small():
    big = {"rows": [{"period": f"Q{i}", "sales": i * 1000.5, "note": "x" * 40} for i in range(2000)]}
    out = await T.run(FakeGateway({"/api/stocks/TCS/financials": big}), "get_financials", {"symbol": "TCS", "period": "annual"})
    assert len(out["text"].encode()) <= T.RESULT_CAP + 2000


async def test_wrong_arguments_and_unknown_tools_are_errors_in_plain_words():
    assert (await T.run(FakeGateway({}), "get_ratios", {"symbol": "bad symbol!!"}))["error"] is True
    assert (await T.run(FakeGateway({}), "get_ratios", {"ticker": "TCS"}))["text"].startswith("Invalid arguments: Unknown argument")
    assert (await T.run(FakeGateway({}), "drop_tables", {}))["error"] is True


async def test_after_the_last_round_the_answer_must_be_written_from_what_was_read():
    turns = [{"tools": [("get_ratios", {"symbol": "TCS"})]} for _ in range(service.MAX_ROUNDS)] + [{"text": ["From what was read: ROE 41.2%."]}]
    client = FakeClient(turns)
    res, _ = await collect(client, FakeGateway({"/api/stocks/TCS/ratios": RATIOS}))
    assert len(client.calls) == service.MAX_ROUNDS + 1 and client.calls[-1]["tool_choice"] == {"type": "none"}
    assert all("tool_choice" not in c for c in client.calls[:-1]) and res["text"].startswith("From what was read")


@pytest.mark.parametrize("text", ["You should buy TCS now.", "Our target price for INFY is Rs 2,000.", "This could be a multibagger.",
                                  "I recommend holding it.", "These are the best stocks to buy.", "A strong buy rating."])
async def test_an_answer_that_reads_like_advice_is_withdrawn(text):
    res, events = await collect(FakeClient([{"text": [text]}]), FakeGateway({}))
    assert res["stop"] == "withdrawn" and res["text"] == service.WITHDRAWN and events[-1] == ("replace", {"text": service.WITHDRAWN})


@pytest.mark.parametrize("text", ["FIIs were net buyers of Rs 1,200 crore on 14 Nov 2026.", "Promoters hold 50.3% as of Sep 2026.",
                                  "FinLit does not give advice on what to buy or sell; here are the figures.", "Its best year for sales was FY2025."])
def test_descriptive_sentences_are_not_taken_for_advice(text):
    assert not service.reads_like_advice(text)


def test_the_instructions_keep_the_founders_rules():
    s = service.SYSTEM
    for must in ("must come from a tool result", "never advise", "Silver or Gold", "Never guess", "Do not add a disclaimer"):
        assert must in s
    assert service.DISCLAIMER == "Describes the company's financial health from its filings and prices; not a recommendation. Information only, not investment advice."


def test_history_must_alternate_and_is_cut_to_the_last_three_exchanges():
    turns = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"m{i}"} for i in range(10)]
    body = ask_api.AskIn(question="And its debt?", history=turns, symbol="tcs")
    assert [t.content for t in body.history] == ["m4", "m5", "m6", "m7", "m8", "m9"] and body.symbol == "TCS"
    with pytest.raises(ValueError):
        ask_api.AskIn(question="x?", history=[{"role": "user", "content": "a"}, {"role": "user", "content": "b"}])
    with pytest.raises(ValueError):
        ask_api.AskIn(question="x?", symbol="DROP TABLE")
    with pytest.raises(ValueError):
        ask_api.AskIn(question="x?", extra="no")


def test_allowance_per_plan_and_the_month_in_india():
    from datetime import date, datetime, timezone
    assert [quota.allowance(Ctx(plan=p)) for p in ("basic", "silver", "gold")] == [0, 50, 100]
    assert quota.allowance(Ctx(plan="gold", role="admin")) == 100
    assert quota.month_of(datetime(2026, 11, 30, 19, 0, tzinfo=timezone.utc)) == date(2026, 12, 1)    # 00:30 on 1 Dec in India
    assert quota.next_month(date(2026, 12, 1)) == date(2027, 1, 1)
    assert quota.status(5, 7, date(2026, 11, 1)) == {"limit": 5, "used": 5, "left": 0, "resets": "2026-12-01"}


# ------------------------------------------------------------------------------------------------------------------ the endpoint (Postgres, Redis, members)

pg = pytest.mark.integration


def events_of(text: str) -> List[tuple]:
    out = []
    for chunk in text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in chunk.split("\n") if ": " in line)
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def enable(app, client):
    app.state.settings = dataclasses.replace(app.state.settings, anthropic_api_key="sk-test")
    ask_api._clients["sk-test"] = client


async def ask(c, q="What is P/E?", **kw):
    r = await c.post("/api/ask", json={"question": q, **kw})
    return r, (events_of(r.text) if r.status_code == 200 else [])


@pg
async def test_without_a_key_it_says_not_switched_on(app, anon):  # noqa: F811
    m = await signed_in(app, "k@example.com")
    r, _ = await ask(m)
    assert r.status_code == 503 and r.json()["detail"]["status"] == "not_enabled"
    assert (await m.get("/api/ask/quota")).json()["enabled"] is False


@pg
async def test_visitors_must_sign_in_and_origin_and_csrf_are_checked(app, anon):  # noqa: F811
    enable(app, FakeClient([]))
    assert (await anon.post("/api/ask", json={"question": "What is P/E?"})).status_code == 401
    assert (await anon.get("/api/ask/quota")).json() == {"enabled": True, "signedIn": False}       # a visitor learns only that it is on
    m = await signed_in(app, "o@example.com")
    bad = new_client(app, cookies=m.cookies, headers={"Origin": "http://test"})
    assert (await bad.post("/api/ask", json={"question": "What is P/E?"})).json()["detail"]["status"] == "bad_csrf"


@pg
async def test_basic_has_no_written_answers_only_the_listed_questions(app):
    client = FakeClient([])
    enable(app, client)
    m = await signed_in(app, "b0@example.com")
    r, _ = await ask(m)
    d = r.json()["detail"]
    assert r.status_code == 403 and d["status"] == "plan_required" and d["plan"] == "silver" and "Silver plan (50 a month)" in d["detail"] and "Gold plan (100" in d["detail"]
    assert client.calls == []                                                    # nothing reached the model
    q = (await m.get("/api/ask/quota")).json()
    assert q["enabled"] and (q["limit"], q["used"], q["left"]) == (0, 0, 0)


@pg
async def test_silver_uses_its_fifty_then_gets_a_clear_message(app):
    enable(app, FakeClient([{"text": ["Answer 49."]}, {"text": ["Answer 50."]}]))
    m = await signed_in(app, "s49@example.com", plan="silver")
    uid = (await m.get("/api/auth/me")).json()["user"]["id"]
    async with app.state.store.pool.acquire() as conn:          # 48 already asked this month
        await conn.execute("INSERT INTO ai_usage (user_id, month, used) VALUES ($1, $2, 48)", uid, quota.month_of())
    for n in (49, 50):
        r, ev = await ask(m, f"Question number {n}?")
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
        assert ev[0] == ("meta", {"limit": 50, "used": n, "left": 50 - n, "resets": ev[0][1]["resets"], "cached": False})
        assert ev[-1][0] == "done" and "not investment advice" in ev[-1][1]["disclaimer"]
    r, _ = await ask(m, "One more?")
    d = r.json()["detail"]
    assert r.status_code == 429 and d["status"] == "quota_used" and "all 50" in d["detail"] and "Gold includes 100" in d["detail"] and d["left"] == 0
    q = (await m.get("/api/ask/quota")).json()
    assert (q["limit"], q["used"], q["left"]) == (50, 50, 0)


@pg
async def test_silver_and_gold_allowances(app):
    enable(app, FakeClient([]))
    s = await signed_in(app, "s50@example.com", plan="silver")
    g = await signed_in(app, "g100@example.com", plan="gold")
    assert (await s.get("/api/ask/quota")).json()["limit"] == 50
    assert (await g.get("/api/ask/quota")).json()["limit"] == 100


@pg
async def test_a_question_that_could_not_be_answered_is_given_back(app):
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    enable(app, FakeClient([], fail=anthropic.APIConnectionError(request=req)))
    m = await signed_in(app, "gb@example.com", plan="silver")
    r, ev = await ask(m)
    assert ev[0][0] == "meta" and ev[-1] == ("error", {"code": "unavailable", "text": "FinLit AI could not be reached just now. Please try again."})
    assert (await m.get("/api/ask/quota")).json()["used"] == 0


@pg
async def test_a_repeated_first_question_comes_from_the_cache_at_once_and_uses_nothing(app):
    client = FakeClient([{"text": ["P/E is price over earnings per share."]}])
    enable(app, client)
    m = await signed_in(app, "c@example.com", plan="silver")
    _, ev1 = await ask(m, "What is P/E?")
    _, ev2 = await ask(m, "  what is   p/e? ")
    assert ev1[0][1]["cached"] is False and ev2[0][1]["cached"] is True and len(client.calls) == 1
    assert [d["text"] for e, d in ev2 if e == "text"] == ["P/E is price over earnings per share."]
    assert (await m.get("/api/ask/quota")).json()["used"] == 1


@pg
async def test_the_ai_reads_data_as_the_member_so_a_plan_never_sees_more_than_on_the_website(app):
    """The same call through the member gateway: Basic is refused the Silver route with a plan message; Silver gets it. Session and CSRF go with it."""
    st = app.state.settings

    async def gateway_for(c):
        me = (await c.get("/api/auth/me")).json()
        return MemberGateway(app, "test", "127.0.0.1", cookie_name=cookie_name(st), cookie=c.cookies.get(cookie_name(st)), csrf=me["csrf"], origin="http://test")
    basic = await gateway_for(await signed_in(app, "gb1@example.com"))
    silver = await gateway_for(await signed_in(app, "gs1@example.com", plan="silver"))
    with pytest.raises(ToolError) as e:
        await basic.json("/api/portfolio/overview", method="POST", body={"symbols": ["RELIANCE"]}, subject="Your Equity portfolio")
    assert "not included in this member's plan" in str(e.value)
    ok = await silver.json("/api/portfolio/overview", method="POST", body={"symbols": ["RELIANCE"]}, subject="Your Equity portfolio")
    assert ok["plan"] == "silver" and ok["holdings"][0]["symbol"] == "RELIANCE"
    # and the member's own saved list is theirs: an empty portfolio is said plainly
    out = await T.run(silver, "get_my_portfolio", {})
    assert not out["error"] and "has no shares" in out["text"]
    await basic.aclose()
    await silver.aclose()


@pg
async def test_personal_answers_are_never_cached(app):
    client = FakeClient([{"tools": [("get_my_watchlists", {})]}, {"text": ["You have no watchlists yet."]},
                         {"tools": [("get_my_watchlists", {})]}, {"text": ["You have no watchlists yet."]}])
    enable(app, client)
    m = await signed_in(app, "p@example.com", plan="silver")
    _, ev1 = await ask(m, "What is on my watchlist?")
    _, ev2 = await ask(m, "What is on my watchlist?")
    assert ev2[0][1]["cached"] is False and len(client.calls) == 4
    assert ("status", {"text": "Reading your watchlists"}) in ev1
