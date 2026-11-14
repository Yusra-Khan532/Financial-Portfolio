"""Task #138 (14 Nov 2026, "finlit ai speed"): predefined questions answer at once from FinLit's saved answers, and the page sees each real step."""
import asyncio
import json
import sys
import types
from types import SimpleNamespace

from backend import server


def install(monkeypatch, generate_content):
    fake_types = SimpleNamespace(GenerateContentConfig=lambda **kw: kw)
    fake = SimpleNamespace(Client=lambda **kw: SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)), types=fake_types)
    g = types.ModuleType("google"); g.genai = fake
    monkeypatch.setitem(sys.modules, "google", g); monkeypatch.setitem(sys.modules, "google.genai", fake)


def req():
    return SimpleNamespace(client=SimpleNamespace(host="store-test"), headers={})


def ask(message, history=(), preset=False):
    return asyncio.run(server.chat(server.ChatRequest(message=message, history=list(history), preset=preset), req()))


def test_a_question_asked_again_is_answered_from_the_saved_answer_without_the_model(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "k"); server._chat_attempts.clear()
    calls = []
    install(monkeypatch, lambda **kw: calls.append(1) or SimpleNamespace(text="A P/E ratio compares price with earnings."))
    first = ask("What is a P/E ratio?")
    assert first.response.startswith("A P/E ratio") and first.saved_at is None and len(calls) == 1
    again = ask("  what is a p/e ratio  ")                      # same question, other case, spacing and end mark
    assert again.response == first.response and again.saved_at and len(calls) == 1   # no second model call: instant


def test_a_saved_answer_works_even_while_the_model_is_unavailable(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "k"); server._chat_attempts.clear()
    install(monkeypatch, lambda **kw: SimpleNamespace(text="Diversification spreads money across holdings."))
    ask("What is diversification?")
    monkeypatch.delenv("GEMINI_API_KEY")
    assert ask("What is diversification?").response.startswith("Diversification")


def test_a_follow_up_in_a_conversation_is_not_answered_from_a_saved_answer(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "k"); server._chat_attempts.clear()
    n = [0]
    def gen(**kw):
        n[0] += 1
        return SimpleNamespace(text=f"answer {n[0]}")
    install(monkeypatch, gen)
    ask("Explain that more simply")
    hist = [server.ChatTurn(role="user", content="What is ROE?"), server.ChatTurn(role="assistant", content="Return on equity.")]
    assert ask("Explain that more simply", hist).response == "answer 2"      # depends on the earlier turns: asked afresh


def test_a_tapped_predefined_question_uses_the_saved_answer_even_after_earlier_turns(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "k"); server._chat_attempts.clear()
    n = [0]
    def gen(**kw):
        n[0] += 1
        return SimpleNamespace(text=f"answer {n[0]}")
    install(monkeypatch, gen)
    q = "About TCS: How has TCS's revenue grown over the last five years?"
    assert ask(q, preset=True).response == "answer 1"
    hist = [server.ChatTurn(role="user", content="What is ROE?"), server.ChatTurn(role="assistant", content="Return on equity.")]
    again = ask(q, hist, preset=True)
    assert again.response == "answer 1" and again.saved_at and n[0] == 1


def test_company_answers_are_kept_12_hours_and_general_ones_7_days():
    assert server.chat_store_seconds("About RELIANCE: how did sales grow?", None) == 12 * 3600
    assert server.chat_store_seconds("How did TCS do?", "Company") == 12 * 3600
    assert server.chat_store_seconds("What is a P/E ratio?", "Concept") == 7 * 86400


def test_an_expired_answer_is_not_used(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "k"); server._chat_attempts.clear()
    n = [0]
    def gen(**kw):
        n[0] += 1
        return SimpleNamespace(text=f"answer {n[0]}")
    install(monkeypatch, gen)
    ask("What is EBITDA?")
    for v in server._chat_store_memo.values():
        v["expires"] = 0
    assert ask("What is EBITDA?").response == "answer 2"


def test_the_stream_sends_each_real_step_then_the_answer(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "k"); server._chat_attempts.clear()
    install(monkeypatch, lambda **kw: SimpleNamespace(text="Book value is assets minus liabilities."))

    async def read(message):
        resp = await server.chat_stream(server.ChatRequest(message=message), req())
        out = []
        async for chunk in resp.body_iterator:
            out.append(chunk if isinstance(chunk, str) else chunk.decode())
        return "".join(out)

    def events(text):
        ev = []
        for block in text.strip().split("\n\n"):
            kind = block.split("\n")[0].removeprefix("event: ")
            ev.append((kind, json.loads(block.split("\n")[1].removeprefix("data: "))))
        return ev

    first = events(asyncio.run(read("What is book value?")))
    steps = [d["text"] for k, d in first if k == "step"]
    assert steps[0] == "Checking FinLit's saved answers" and "Asking FinLit AI" in steps
    assert first[-1][0] == "answer" and first[-1][1]["response"].startswith("Book value")
    second = events(asyncio.run(read("What is book value?")))
    assert [d["text"] for k, d in second if k == "step"] == ["Checking FinLit's saved answers", "Found a saved answer"]
    assert second[-1][1]["saved_at"]


def test_the_stream_reports_an_error_as_an_event(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False); server._chat_attempts.clear()

    async def read():
        resp = await server.chat_stream(server.ChatRequest(message="What is a bond?"), req())
        return "".join([c if isinstance(c, str) else c.decode() async for c in resp.body_iterator])

    text = asyncio.run(read())
    assert "event: error" in text and '"status": 503' in text


def test_tool_steps_name_the_data_in_plain_words():
    assert server.tool_step("company_financials", {"symbol": "tcs"}) == "Looking up FinLit data: the company's statements (TCS)"
    assert server.tool_step("get_stock_quote", {}) == "Looking up FinLit data: get stock quote"
