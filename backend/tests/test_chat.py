"""Local, provider-mocked checks for the FinLit AI endpoint."""
import asyncio
import sys
import types
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend import server


def install_fake_genai(monkeypatch, generate_content):
    fake_types = SimpleNamespace(GenerateContentConfig=lambda **kwargs: kwargs)
    fake_genai = SimpleNamespace(
        Client=lambda **kwargs: SimpleNamespace(
            models=SimpleNamespace(generate_content=generate_content)
        ),
        types=fake_types,
    )
    google_module = types.ModuleType("google")
    google_module.genai = fake_genai
    monkeypatch.setitem(sys.modules, "google", google_module)
    monkeypatch.setitem(sys.modules, "google.genai", fake_genai)


def request():
    return SimpleNamespace(
        client=SimpleNamespace(host="test-chat-client"),
        headers={},
    )


def test_chat_returns_gemini_response_and_passes_bounded_context(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    server._chat_attempts.clear()
    captured = {}

    def generate_content(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(text="This is general financial education.")

    install_fake_genai(monkeypatch, generate_content)
    payload = server.ChatRequest(
        message="What was the concept we discussed?",
        history=[
            server.ChatTurn(role="user", content="Explain diversification."),
            server.ChatTurn(role="assistant", content="It spreads exposure."),
        ],
    )
    result = asyncio.run(server.chat(payload, request()))

    assert result.response == "This is general financial education."
    assert captured["model"] == "gemini-3.8-flash"
    assert [turn["role"] for turn in captured["contents"]] == ["user", "assistant", "user"]
    assert "personalized investment advice" in captured["config"]["system_instruction"]


def test_chat_returns_useful_error_when_key_is_missing(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    server._chat_attempts.clear()
    with pytest.raises(HTTPException) as error:
        asyncio.run(server.chat(server.ChatRequest(message="Hello"), request()))
    assert error.value.status_code == 503


def test_chat_hides_provider_error_details(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    server._chat_attempts.clear()
    install_fake_genai(monkeypatch, lambda **kwargs: (_ for _ in ()).throw(RuntimeError("secret provider detail")))
    with pytest.raises(HTTPException) as error:
        asyncio.run(server.chat(server.ChatRequest(message="Hello"), request()))
    assert error.value.status_code == 502
    assert "secret provider detail" not in error.value.detail


def test_chat_rate_limit_is_enforced():
    server._chat_attempts.clear()
    for index in range(server.CHAT_MAX_REQUESTS_PER_MINUTE):
        assert not server.chat_rate_limit_exceeded("test", float(index))
    assert server.chat_rate_limit_exceeded("test", 9.5)


def test_chat_rejects_overlong_message():
    with pytest.raises(ValueError):
        server.ChatRequest(message="x" * 2001)
