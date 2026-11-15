"""Task #138 (founder, 14 Nov 2026): FinLit AI has no language model. The website answers its listed questions itself; the old model chat is switched
off, so nothing can spend the Gemini key's quota through it."""
import asyncio

import pytest
from fastapi import HTTPException

from backend import server


@pytest.mark.parametrize("endpoint", [server.chat_switched_off, server.chat_stream_switched_off])
def test_the_model_chat_is_switched_off_and_says_why(monkeypatch, endpoint):
    monkeypatch.setenv("GEMINI_API_KEY", "set-but-never-used")
    with pytest.raises(HTTPException) as e:
        asyncio.run(endpoint())
    assert e.value.status_code == 410 and "listed questions" in e.value.detail


def test_no_model_is_called_from_the_site_backend():
    src = open(server.__file__, encoding="utf-8").read()
    assert "google.genai" not in src and "generate_content" not in src and "GEMINI_API_KEY" not in src
