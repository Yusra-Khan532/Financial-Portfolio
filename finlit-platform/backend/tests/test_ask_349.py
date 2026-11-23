"""Task #349 (PR 1): Ask FinLit AI never gives an empty or a silent answer. One test (or more) per cause the evaluation found, on the scripted model of
test_ask.py (no key, no cost), and the endpoint with real Postgres and Redis for what only the stream shows.

A  the output room was 1,100 tokens and the (adaptive) thinking counts against it: "no text", or an answer cut silently
B  the advice check withdrew plain facts: "RBI's inflation target of 4%", "FinLit does not say which is the best fund"
C  an earlier turn over 4,000 characters made every later follow-up a 422
D  the 40 s deadline ran out in the middle of a tool round: no text, or a cut answer shown as done
E  the reads before the model were outside any budget and the question's stream had no keep-alive
G  a paused web search (pause_turn) used up a round: on the last round, no text
H  every 400 was taken for a web-search refusal
I  a refusal after some text was shown as a finished answer
L  the lead-in words of a tool round were glued to the answer
cache  the web search carried each question type's allowed_domains, so each type made its own cache entry
"""

import asyncio
import json
import logging
import time
from types import SimpleNamespace as NS
from typing import Any, Dict, List

import anthropic
import httpx
import pytest

from finlit import config
from finlit.ask import api as ask_api, routing, service, tools as T
from test_ask import RATIOS, FakeClient, FakeGateway, FakeStream, ask, collect, enable, pg
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401

TOOL_ROUND = {"tools": [("get_ratios", {"symbol": "TCS"})]}
GW = {"/api/stocks/TCS/ratios": RATIOS}


def bad_request(msg: str) -> anthropic.BadRequestError:
    return anthropic.BadRequestError(msg, response=httpx.Response(400, request=httpx.Request("POST", "https://api.anthropic.com/v1/messages")), body=None)


def texts(events: List[tuple]) -> str:
    return "".join(d["text"] for e, d in events if e == "text")


# ------------------------------------------------------------------------------------------------ A. room for thinking, tool calls and the answer

async def test_A_the_room_is_for_thinking_tools_and_answer_and_the_length_is_set_in_the_instructions():
    client = FakeClient([{"text": ["P/E is price over earnings."]}])
    await collect(client, FakeGateway({}), "What is P/E?")
    assert client.calls[0]["max_tokens"] == service.MAX_TOKENS == 6000
    assert "Length: the whole answer at most about 200 words" in service.SYSTEM
    client = FakeClient([{"text": ["x"]}])
    await service.answer(client, "m", FakeGateway({}), service.build_messages([], "What is P/E?", None, "gold"), _quiet, max_tokens=8000)
    assert client.calls[0]["max_tokens"] == 8000                                   # Settings.ask_max_tokens reaches the request


def test_A_the_token_setting_is_read_and_kept_in_bounds():
    assert config._ask_max_tokens("") == 6000 and config._ask_max_tokens("nonsense") == 6000
    assert config._ask_max_tokens("9000") == 9000 and config._ask_max_tokens("500") == 2000 and config._ask_max_tokens("99999") == 16000


async def test_A_out_of_room_before_any_text_is_asked_once_more_with_no_tools_and_writes_from_what_was_read():
    client = FakeClient([TOOL_ROUND, {"stop": "max_tokens"}, {"text": ["TCS's ROE was 41.2% in FY2026."]}])
    res, _ = await collect(client, FakeGateway(GW))
    assert res["text"] == "TCS's ROE was 41.2% in FY2026." and res["stop"] == "end_turn"
    assert len(client.calls) == 3 and client.calls[2]["tool_choice"] == {"type": "none"}
    assert client.calls[2]["messages"] == client.calls[1]["messages"]              # the empty turn is not sent back


async def test_A_a_tool_call_cut_in_half_is_never_sent_back_and_its_lead_in_is_cleared():
    client = FakeClient([{"text": ["Let me read the ratios."], "tools": [("get_ratios", {"symbol": "TC"})], "stop": "max_tokens"},
                         {"text": ["TCS's ROE was 41.2% in FY2026."]}])
    res, events = await collect(client, FakeGateway(GW))
    assert res["text"] == "TCS's ROE was 41.2% in FY2026." and ("replace", {"text": ""}) in events
    assert client.calls[1]["tool_choice"] == {"type": "none"} and client.calls[1]["messages"][-1]["role"] == "user"


async def test_A_twice_out_of_room_is_still_no_answer_rather_than_a_loop():
    client = FakeClient([{"stop": "max_tokens"}, {"stop": "max_tokens"}])
    res, _ = await collect(client, FakeGateway({}))
    assert res["text"] == "" and res["stop"] == "max_tokens" and len(client.calls) == 2


async def test_A_an_answer_cut_by_the_room_says_so():
    res, events = await collect(FakeClient([{"text": ["1. Business growth\n- Sales rose 12%"], "stop": "max_tokens"}]), FakeGateway({}))
    assert res["text"].endswith("\n\n" + service.CUT_SHORT) and texts(events).endswith(service.CUT_SHORT) and res["stop"] == "max_tokens"


async def test_A_each_request_logs_its_stop_reason_and_output_tokens(caplog):
    caplog.set_level(logging.INFO, logger="finlit.ask")
    await collect(FakeClient([{"stop": "max_tokens"}, {"text": ["Done."]}]), FakeGateway({}))
    lines = [r.getMessage() for r in caplog.records]
    assert "ask: request 1 stop=max_tokens output tokens=20 tool calls=0" in lines and "ask: request 2 stop=end_turn output tokens=20 tool calls=0" in lines


# ------------------------------------------------------------------------------------------------ B. the advice check: real advice only

ADVICE = ["You should buy TCS now.", "Our target price for INFY is Rs 2,000.", "Brokers see a price target of Rs 900.", "Brokers rate it a buy.",
          "Motilal has a buy rating on the stock.", "Jefferies gave a sell call.", "We maintain an accumulate rating.", "Kotak has a reduce call on it.",
          "Investors should buy the dip.", "It is a top pick for 2027.", "This could be a multibagger.", "It is the best stock to buy now.",
          "These are the best stocks to buy.", "HDFC Bank is the best stock in banking.", "Analysts' target of Rs 1,690 implies upside.",
          "The consensus target is Rs 3,000.", "I recommend holding it.", "Buy now before results.", "A strong buy rating.", "CLSA upgraded it to outperform.",
          "One consensus snapshot rated the stock a buy, with an average target of 1,690 INR.", "You may want to accumulate on dips."]
NOT_ADVICE = ["RBI's inflation target of 4%", "The fiscal deficit target of 4.4% of GDP for FY2027", "A capex target of Rs 5,000 crore for FY2027.",
              "Inflation stayed inside a target range of 2% to 6%.", "FinLit does not say which is the best fund.", "Its best year for sales was FY2025.",
              "FinLit does not say whether you should buy TCS.", "The RBI raised the repo rate to reduce inflation.", "Promoters hold 50.3% as of Sep 2026.",
              "FIIs were net buyers of Rs 1,200 crore on 14 Nov 2026.", "The company's net-zero target is 2035.", "Management's margin target is 20% by FY2028.",
              "The board approved a buyback at Rs 1,500.", "What is the best fund? FinLit does not pick one.", "The disinvestment target of Rs 50,000 crore",
              "FinLit does not give advice on what to buy or sell; here are the figures.", "A credit rating of AA+ from CRISIL.", "Its revenue target for FY2030."]


@pytest.mark.parametrize("text", ADVICE)
async def test_B_real_advice_is_still_withdrawn(text):
    assert service.reads_like_advice(text)
    res, events = await collect(FakeClient([{"text": [text]}]), FakeGateway({}))
    assert res["stop"] == "withdrawn" and res["text"] == service.WITHDRAWN and events[-1] == ("replace", {"text": service.WITHDRAWN})


@pytest.mark.parametrize("text", NOT_ADVICE)
async def test_B_targets_of_policy_and_plans_and_saying_finlit_does_not_pick_are_not_advice(text):
    assert not service.reads_like_advice(text)
    res, _ = await collect(FakeClient([{"text": [text]}]), FakeGateway({}))
    assert res["stop"] == "end_turn" and res["text"] == text


# ------------------------------------------------------------------------------------------------ C. a long earlier answer never blocks a follow-up

def test_C_an_earlier_turn_over_4000_characters_is_cut_not_refused():
    long = "1. Growth\n- " + "Sales rose. " * 600
    body = ask_api.AskIn(question="And its debt?", history=[{"role": "user", "content": "How is TCS doing?"}, {"role": "assistant", "content": long}])
    assert len(long) > 4000 and len(body.history[1].content) == ask_api.TURN_CHARS and body.history[1].content.endswith("…")
    with pytest.raises(ValueError):
        ask_api.AskIn(question="x?", history=[{"role": "user", "content": ""}, {"role": "assistant", "content": "y"}])   # empty is still refused


@pg
async def test_C_a_follow_up_after_an_answer_over_4000_characters_is_answered(app):  # noqa: F811
    client = FakeClient([{"text": ["TCS has no borrowings."]}])
    enable(app, client)
    m = await signed_in(app, "c349@example.com", plan="silver")
    history = [{"role": "user", "content": "How is TCS doing?"}, {"role": "assistant", "content": "- Sales rose 12%. " * 400}]
    r, ev = await ask(m, "And its debt?", history=history)
    assert r.status_code == 200 and ev[-1][0] == "done" and texts(ev) == "TCS has no borrowings."
    assert len(client.calls[0]["messages"][1]["content"]) == ask_api.TURN_CHARS


# ------------------------------------------------------------------------------------------------ D / E. the deadline, the tool cut-off, the budget, pings

class SlowGateway(FakeGateway):
    async def json(self, path, params=None, **kw):
        await asyncio.sleep(5)
        return await super().json(path, params, **kw)


async def test_D_tools_stop_after_the_cut_off_and_the_answer_is_written_from_what_was_read(monkeypatch):
    monkeypatch.setattr(service, "TOOLS_UNTIL", 0.3)
    client = FakeClient([TOOL_ROUND, {"text": ["The ratios could not be read in time; TCS is an IT company."]}])
    t0 = time.monotonic()
    res, _ = await collect(client, SlowGateway(GW))
    assert time.monotonic() - t0 < 2 and res["stop"] == "end_turn" and res["text"].startswith("The ratios could not")
    tr = client.calls[1]["messages"][-1]["content"][0]
    assert tr["is_error"] is True and "not read in time" in tr["content"] and client.calls[1]["tool_choice"] == {"type": "none"}


class DragStream(FakeStream):
    """Writes the first words, then stalls (a provider gone quiet)."""

    def __aiter__(self):
        async def gen():
            yield NS(type="text", text="1. Business growth\n- Sales rose 12% [results filing]")
            await asyncio.sleep(10)
        return gen()


class DragClient(FakeClient):
    def stream(self, **params):
        self.calls.append(params)
        return DragStream({})


async def test_D_text_cut_by_the_deadline_is_marked_cut_short_not_shown_as_whole(monkeypatch):
    monkeypatch.setattr(service, "DEADLINE", 2.4)
    res, events = await collect(DragClient([]), FakeGateway({}))
    assert res["stop"] == "deadline" and res["text"].endswith(service.CUT_SHORT) and texts(events).endswith(service.CUT_SHORT)


async def test_E_reads_before_the_model_share_one_budget_and_a_late_one_is_left_out():
    async def slow():
        await asyncio.sleep(5)
        return "late"

    async def fast():
        return "ok"

    async def broken():
        raise RuntimeError("no")
    t0 = time.monotonic()
    assert await ask_api.within([fast(), slow(), broken()], time.monotonic() + 0.2) == ["ok", None, None]
    assert time.monotonic() - t0 < 1 and await ask_api.within([], 0) == []


class QuietClient(FakeClient):
    """Thinks for a while before the first word."""

    def stream(self, **params):
        self.calls.append(params)
        turn = self.turns.pop(0)

        class S(FakeStream):
            def __aiter__(self):
                async def gen():
                    await asyncio.sleep(0.3)
                    for t in turn.get("text", []):
                        yield NS(type="text", text=t)
                return gen()
        return S(turn)


@pg
async def test_E_a_question_gets_keep_alive_pings_and_a_slow_read_before_the_model_never_holds_it(app, monkeypatch):  # noqa: F811
    monkeypatch.setattr(ask_api, "PING_SECONDS", 0.05)
    monkeypatch.setattr(ask_api, "PREREAD_SECONDS", 0.2)

    async def slow_named(*a, **k):
        await asyncio.sleep(5)
        return []
    monkeypatch.setattr(ask_api.companies, "named_in", slow_named)
    enable(app, QuietClient([{"text": ["P/E is price over earnings."]}]))
    m = await signed_in(app, "e349@example.com", plan="silver")
    t0 = time.monotonic()
    r, ev = await ask(m, "What does a high P/E tell us about a company?")
    assert time.monotonic() - t0 < 3 and ev[-1][0] == "done" and ("ping", {}) in ev
    assert texts(ev) == "P/E is price over earnings."


# ------------------------------------------------------------------------------------------------ G. a paused web search is not a round

async def test_G_a_pause_on_the_last_round_still_ends_in_an_answer():
    turns = [TOOL_ROUND for _ in range(service.MAX_ROUNDS)] + [{"web": True, "stop": "pause_turn"}, {"text": ["From what was read: ROE 41.2%."]}]
    client = FakeClient(turns)
    res, _ = await collect(client, FakeGateway(GW))
    assert res["text"] == "From what was read: ROE 41.2%." and res["stop"] == "end_turn" and len(client.calls) == service.MAX_ROUNDS + 2
    assert client.calls[-1]["messages"][-1]["role"] == "assistant"                 # the paused turn was sent back to carry on


async def test_G_pauses_do_not_use_up_tool_rounds():
    client = FakeClient([{"web": True, "stop": "pause_turn"}, {"web": True, "stop": "pause_turn"}, TOOL_ROUND, {"text": ["ROE 41.2%."]}])
    res, _ = await collect(client, FakeGateway(GW))
    assert res["text"] == "ROE 41.2%." and all("tool_choice" not in c for c in client.calls)


# ------------------------------------------------------------------------------------------------ H. only a web-search refusal drops the web

class Refusing(FakeClient):
    def __init__(self, msg, turns=()):
        super().__init__(list(turns))
        self.msg, self.tries = msg, []

    def stream(self, **params):
        self.tries.append(params)
        if any(t.get("name") == "web_search" for t in params["tools"]):
            raise bad_request(self.msg)
        return super().stream(**params)


async def test_H_a_refusal_that_names_the_web_search_is_asked_again_without_it():
    c = Refusing("tools.43.web_search: this tool is not available for this request", [{"text": ["P/E is price over earnings."]}])
    res, _ = await collect(c, FakeGateway({}), "What is P/E?")
    assert res["text"].startswith("P/E") and len(c.tries) == 2 and not any(t.get("name") == "web_search" for t in c.tries[1]["tools"])


async def test_H_any_other_400_is_not_retried_and_reaches_the_caller_with_its_message(caplog):
    c = Refusing("messages.2.content.0: text content blocks must be non-empty")
    with pytest.raises(anthropic.BadRequestError):
        await collect(c, FakeGateway({}))
    assert len(c.tries) == 1 and any("text content blocks must be non-empty" in r.getMessage() for r in caplog.records)


@pg
async def test_H_the_member_sees_a_clear_error_and_the_question_is_given_back(app):  # noqa: F811
    enable(app, FakeClient([], fail=bad_request("messages.0: an unexpected field")))
    m = await signed_in(app, "h349@example.com", plan="silver")
    r, ev = await ask(m, "What is P/E?")
    assert ev[-1] == ("error", {"code": "refused", "text": "FinLit AI could not take this question just now. Please ask it again, or in other words."})
    assert (await m.get("/api/ask/quota")).json()["used"] == 0


# ------------------------------------------------------------------------------------------------ I. a refusal after some words says it stopped early

async def test_I_a_refusal_after_some_text_is_marked_stopped_early():
    res, events = await collect(FakeClient([{"text": ["1. Business growth\n- Sales rose 12%"], "stop": "refusal"}]), FakeGateway({}))
    assert res["stop"] == "refusal" and res["text"].endswith(service.STOPPED_EARLY) and texts(events).endswith(service.STOPPED_EARLY)


async def test_I_a_refusal_with_no_text_stays_a_plain_decline():
    res, _ = await collect(FakeClient([{"stop": "refusal"}]), FakeGateway({}))
    assert res["text"] == "" and res["stop"] == "refusal"


# ------------------------------------------------------------------------------------------------ L. only the last round's words make the answer

async def test_L_the_lead_in_of_a_tool_round_is_dropped_from_the_answer():
    client = FakeClient([{"text": ["Let me check the ratios."], "tools": [("get_ratios", {"symbol": "TCS"})]}, {"text": ["TCS's ROE was 41.2% in FY2026."]}])
    res, events = await collect(client, FakeGateway(GW))
    assert res["text"] == "TCS's ROE was 41.2% in FY2026."
    i = events.index(("replace", {"text": ""}))                                    # the panel clears the lead-in before the answer streams
    assert events[i - 1] == ("text", {"text": "Let me check the ratios."}) and events[-1] == ("text", {"text": "TCS's ROE was 41.2% in FY2026."})


async def test_L_a_tool_round_without_words_sends_no_clearing_event():
    _, events = await collect(FakeClient([TOOL_ROUND, {"text": ["ROE 41.2%."]}]), FakeGateway(GW))
    assert not any(e == "replace" for e, _ in events)


# ------------------------------------------------------------------------------------------------ cache. one tools payload for every question

QUESTIONS = ["repo rate kya hai", "inflation news today", "what are TCS's margins", "is HDFC Bank's NIM falling", "what is an index fund",
             "sebi rules on f&o", "it sector hiring", "what is DCF", "hello", "why did reliance fall today"]


async def test_cache_the_tools_payload_is_byte_identical_for_every_kind_of_question():
    payloads, systems, kinds_seen = set(), set(), set()
    for q in QUESTIONS:
        kinds = routing.classify(q)
        kinds_seen.add(tuple(kinds))
        client = FakeClient([{"text": ["An answer."]}])
        await service.answer(client, "m", FakeGateway({}), service.build_messages([], q, None, "gold", None, routing.note(kinds)), _quiet)
        payloads.add(json.dumps(client.calls[0]["tools"], ensure_ascii=False))
        systems.add(json.dumps(client.calls[0]["system"], ensure_ascii=False))
    assert len(kinds_seen) >= 6                                                     # the questions really are of different kinds
    assert len(payloads) == 1 and len(systems) == 1 and payloads == {json.dumps(T.definitions(), ensure_ascii=False)}
    assert any(routing.web_domains(list(k)) for k in kinds_seen)                    # and some of them would have carried allowed_domains before


async def _quiet(e: str, d: Dict[str, Any]) -> None:
    return None
