"""Task #138, second part (14 Nov 2026: "even the first question ... takes a lot of time"): a first question about a company needs one model call,
look-ups run at the same time, the answer's words stream as they are written, and a question never waits for the tool list."""
import asyncio
import json
import sys
import threading
import time
import types
from types import SimpleNamespace

import pytest

from backend import mcp_tools, server
from tests.test_chat_tools import FakeGemini, FakeMcp, asks, ok_result, request, says

PREFETCH_NAMES = {n for n, _a, _l in server.CHAT_PREFETCH}
TOOLS = [{"name": n, "description": n, "inputSchema": {"type": "object", "properties": {"symbol": {"type": "string"}, "period": {"type": "string"}}, "required": ["symbol"]}}
         for n in sorted(PREFETCH_NAMES | {"get_price_history"})]


@pytest.fixture(autouse=True)
def fresh(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("MCP_INTERNAL_URL", "http://mcp.test/mcp")
    server._chat_attempts.clear()
    mcp_tools.reset_cache()
    yield
    mcp_tools.reset_cache()


def envelope(name, args):
    return ok_result({"tool": name, "data": {"symbol": args.get("symbol"), "period": args.get("period"), "value": 1}})


class SlowMcp(FakeMcp):
    """Each tool call takes `delay` seconds and records when it ran."""
    def __init__(self, delay=0.3):
        super().__init__(tools=TOOLS, results={n: (lambda a, n=n: envelope(n, a)) for n in PREFETCH_NAMES | {"get_price_history"}})
        self.delay, self.spans, self.lock = delay, [], threading.Lock()

    def __call__(self, url, data=None, **kw):
        body = json.loads(data)
        if body["method"] == "tools/call":
            start = time.monotonic(); time.sleep(self.delay)
            with self.lock:
                self.spans.append((start, time.monotonic()))
        return super().__call__(url, data=data, **kw)


def ask(message, company=None):
    return asyncio.run(server.chat(server.ChatRequest(message=message, company=company), request()))


def test_a_company_question_is_answered_with_one_model_call_from_data_looked_up_first(monkeypatch):
    mcp = SlowMcp(delay=0.3); monkeypatch.setattr(mcp_tools.requests, "post", mcp)
    gem = FakeGemini(lambda n, kw: says("Reliance's revenue grew 8% a year over five years.")); gem.install(monkeypatch)
    t = time.monotonic()
    out = ask("How has RELIANCE's revenue grown over the last five years?", company="RELIANCE")
    took = time.monotonic() - t
    assert len(gem.calls) == 1                                                    # one model call, not two or three
    sent = gem.calls[0]["contents"][-1]["parts"]
    assert "FinLit data already looked up for RELIANCE" in sent[-1]["text"]
    for label in ("profile", "ratios", "annual statements", "quarterly statements", "shareholding", "FinLit score", "quote"):
        assert f'"{label}"' in sent[-1]["text"]
    assert len(mcp.spans) == len(server.CHAT_PREFETCH) and took < 0.3 * 3      # 7 look-ups of 0.3 s ran at the same time
    assert out.response.startswith("Reliance's revenue grew") and "Data from FinLit tools: " in out.response


def test_about_prefix_names_the_company_when_the_page_sends_none(monkeypatch):
    mcp = SlowMcp(delay=0); monkeypatch.setattr(mcp_tools.requests, "post", mcp)
    gem = FakeGemini(lambda n, kw: says("Debt has fallen.")); gem.install(monkeypatch)
    ask("About TCS: How is the debt trend?")
    assert "FinLit data already looked up for TCS" in gem.calls[0]["contents"][-1]["parts"][-1]["text"]


def test_a_general_question_looks_nothing_up_first(monkeypatch):
    mcp = SlowMcp(delay=0); monkeypatch.setattr(mcp_tools.requests, "post", mcp)
    gem = FakeGemini(lambda n, kw: says("A P/E ratio compares price with earnings.")); gem.install(monkeypatch)
    ask("What is a P/E ratio?")
    assert mcp.spans == [] and len(gem.calls[0]["contents"][-1]["parts"]) == 1


def test_slow_data_never_holds_the_answer_back(monkeypatch):
    mcp = SlowMcp(delay=0.5); monkeypatch.setattr(mcp_tools.requests, "post", mcp)
    monkeypatch.setattr(server, "CHAT_PREFETCH_SECONDS", 0.1)
    gem = FakeGemini(lambda n, kw: says("Answer without the data block.")); gem.install(monkeypatch)
    assert ask("How did INFY do?", company="INFY").response.startswith("Answer without")
    assert len(gem.calls[0]["contents"][-1]["parts"]) == 1                       # timed out: the model's own tools remain


def test_the_look_ups_of_one_tool_round_run_at_the_same_time(monkeypatch):
    mcp = SlowMcp(delay=0.4); monkeypatch.setattr(mcp_tools.requests, "post", mcp)
    gem = FakeGemini(lambda n, kw: asks(("get_price_history", {"symbol": "TCS"}), ("get_price_history", {"symbol": "INFY"}), ("get_price_history", {"symbol": "WIPRO"})) if n == 1 else says("Compared."))
    gem.install(monkeypatch)
    t = time.monotonic(); ask("Compare the price moves of TCS, INFY and WIPRO"); took = time.monotonic() - t
    assert len(mcp.spans) == 3 and took < 0.4 * 2                                # three 0.4 s look-ups together, not 1.2 s


def test_a_stale_tool_list_answers_at_once_and_refreshes_in_the_background(monkeypatch):
    calls = []
    def post(url, data=None, **kw):
        body = json.loads(data); calls.append(body["method"])
        if len(calls) > 1: time.sleep(0.5)
        return SimpleNamespace(status_code=200, json=lambda: {"jsonrpc": "2.0", "id": 1, "result": {"tools": TOOLS}})
    monkeypatch.setattr(mcp_tools.requests, "post", post)
    assert len(mcp_tools.get_tools()) == len(TOOLS)
    t0 = mcp_tools.monotonic()
    monkeypatch.setattr(mcp_tools, "monotonic", lambda: t0 + mcp_tools.CACHE_SECONDS + 1)
    t = time.monotonic(); assert len(mcp_tools.get_tools()) == len(TOOLS); assert time.monotonic() - t < 0.1   # no wait for the slow refresh
    for th in list(mcp_tools._refresh_thread): th.join(timeout=5)
    assert calls.count("tools/list") == 2


class StreamGemini(FakeGemini):
    """generate_content_stream yields the script's chunks; generate_content is the ordinary call."""
    def __init__(self, stream_script, plain_script):
        super().__init__(plain_script); self.stream_script, self.streamed = stream_script, 0

    def generate_content_stream(self, **kwargs):
        self.streamed += 1
        yield from self.stream_script(self.streamed, kwargs)

    def install(self, monkeypatch):
        fake_types = SimpleNamespace(GenerateContentConfig=lambda **kw: kw, Tool=lambda **kw: {"tool": kw}, FunctionDeclaration=lambda **kw: kw, AutomaticFunctionCallingConfig=lambda **kw: kw)
        models = SimpleNamespace(generate_content=self.generate_content, generate_content_stream=self.generate_content_stream)
        fake = SimpleNamespace(Client=lambda **kw: SimpleNamespace(models=models), types=fake_types)
        g = types.ModuleType("google"); g.genai = fake
        monkeypatch.setitem(sys.modules, "google", g); monkeypatch.setitem(sys.modules, "google.genai", fake)


def chunk(text=None, calls=None, finish=None):
    return SimpleNamespace(text=text, function_calls=calls, candidates=[SimpleNamespace(finish_reason=finish)] if finish else None)


def stream_events(message, company=None):
    async def read():
        resp = await server.chat_stream(server.ChatRequest(message=message, company=company), request())
        return "".join([c if isinstance(c, str) else c.decode() async for c in resp.body_iterator])
    out = []
    for block in asyncio.run(read()).strip().split("\n\n"):
        kind = block.split("\n")[0].removeprefix("event: ")
        out.append((kind, json.loads(block.split("\n")[1].removeprefix("data: "))))
    return out


def test_the_streamed_answer_arrives_word_by_word_then_the_full_answer(monkeypatch):
    monkeypatch.setenv("MCP_INTERNAL_URL", "off")
    gem = StreamGemini(lambda n, kw: iter([chunk("A P/E ratio "), chunk("compares price "), chunk("with earnings.", finish="STOP")]), lambda n, kw: says("unused"))
    gem.install(monkeypatch)
    ev = stream_events("What is a P/E ratio?")
    assert [d["text"] for k, d in ev if k == "delta"] == ["A P/E ratio ", "compares price ", "with earnings."]
    assert ev[-1][0] == "answer" and ev[-1][1]["response"] == "A P/E ratio compares price with earnings." and gem.calls == []


def test_a_streamed_call_that_turns_to_the_tools_is_taken_back_and_made_the_ordinary_way(monkeypatch):
    mcp = SlowMcp(delay=0); monkeypatch.setattr(mcp_tools.requests, "post", mcp)
    tool_call = [SimpleNamespace(name="get_price_history", args={"symbol": "TCS"})]
    gem = StreamGemini(lambda n, kw: iter([chunk("Let me check "), chunk(calls=tool_call)]) if n == 1 else iter([chunk("TCS rose 4% in 90 days.", finish="STOP")]),
                       lambda n, kw: asks(("get_price_history", {"symbol": "TCS"})))
    gem.install(monkeypatch)
    ev = stream_events("How has TCS's price moved in 90 days?")
    kinds = [k for k, _ in ev]
    assert kinds.index("retract") > kinds.index("delta")                         # the partial text was taken back
    assert len(gem.calls) == 1                                                   # the tool turn came from an ordinary call (its content kept exactly)
    assert ev[-1][1]["response"].startswith("TCS rose 4%")


class QuotaError(Exception):
    code = 429


QUOTA_TEXT = ("429 RESOURCE_EXHAUSTED. {'error': {'code': 429, 'message': 'You exceeded your current quota ... Quota exceeded for metric: "
              "generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash ... Please retry in 9h32m44.5s.', "
              "'details': [{'quotaId': 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'}, {'@type': 'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '34364s'}]}}")


def test_when_every_model_has_used_its_daily_limit_the_visitor_is_told_at_once(monkeypatch):
    monkeypatch.setenv("MCP_INTERNAL_URL", "off")
    server._chat_quota_until.clear(); server._chat_model_cooldown.clear()
    calls = []
    def gen(**kw):
        calls.append(kw["model"])
        raise QuotaError(QUOTA_TEXT)
    FakeGemini(lambda n, kw: None).install(monkeypatch)
    monkeypatch.setattr(FakeGemini, "generate_content", lambda self, **kw: gen(**kw))
    with pytest.raises(server.HTTPException) as first:
        ask("What is a bond?")
    assert first.value.status_code == 503 and "used today's limit" in first.value.detail and "India time" in first.value.detail
    tried = len(calls)
    t = time.monotonic()
    with pytest.raises(server.HTTPException) as again:
        ask("What is a debenture?")
    assert len(calls) == tried and time.monotonic() - t < 0.5       # no model is tried again until Google's reset time: the answer is immediate
    assert server.daily_quota_seconds(QuotaError(QUOTA_TEXT)) == 34364
    server._chat_quota_until.clear(); server._chat_model_cooldown.clear()


def test_a_busy_model_is_not_mistaken_for_a_used_up_daily_limit():
    assert server.daily_quota_seconds(QuotaError("429 RESOURCE_EXHAUSTED: requests per minute")) is None
