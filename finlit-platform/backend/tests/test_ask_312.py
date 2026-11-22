"""Task #312 (developer file 20, change 3, 22 Nov 2026): the AI summary of the FinLit Prism card. Seen live: a summary ended with "done" and no text,
and was counted. Now: never "done" without text (an error, given back); written from the Prism card alone, not the whole company page; one summary per
company per day, the same for every plan, a second press instant and free; a keep-alive on a quiet stream."""
from test_ask import FakeClient, enable, store_prism, summary  # noqa: F401  (helpers)
from test_auth import app, signed_in  # noqa: F401  (fixtures and the sign-in helper)
from test_integration import ingested, store  # noqa: F401  (fixtures)
from test_ask import pg

from finlit.ask import api as ask_api
from finlit.auth.service import Ctx


@pg
async def test_a_summary_with_no_text_is_an_error_and_is_given_back(app):
    await store_prism(app)
    enable(app, FakeClient([{"text": [""]}]))
    m = await signed_in(app, "e312@example.com", plan="gold")
    _, ev = await summary(m)
    assert [e for e, _ in ev][-1] == "error" and ev[-1][1]["code"] == "empty" and "done" not in [e for e, _ in ev]
    assert (await m.get("/api/ask/quota")).json()["summary"]["used"] == 0


@pg
async def test_a_summary_is_written_from_the_prism_card_and_shared_by_every_plan_for_the_day(app):
    await store_prism(app)
    client = FakeClient([{"text": ["- **Overall:** 57.7, Average, Rated."]}])
    enable(app, client)
    s = await signed_in(app, "s312@example.com", plan="silver")
    g = await signed_in(app, "g312@example.com", plan="gold")
    _, ev1 = await summary(s)
    assert ("status", {"text": "Reading the FinLit Prism card"}) in ev1 and ev1[-1][0] == "done"
    _, ev2 = await summary(g)                                                       # another member, another plan: the same day's summary, free
    assert ev2[0][1]["cached"] is True and len(client.calls) == 1
    assert (await g.get("/api/ask/quota")).json()["summary"]["used"] == 0
    a = ask_api.cache_key("m", Ctx(plan="silver"), ask_api.AskIn(kind="summary", symbol="reliance"))
    b = ask_api.cache_key("m", Ctx(plan="gold"), ask_api.AskIn(kind="summary", symbol="RELIANCE"))
    assert a == b and ":RELIANCE:" in a


def test_stream_headers_and_keep_alive():
    assert ask_api.STREAM_HEADERS == {"Cache-Control": "no-store, no-cache", "X-Accel-Buffering": "no"}
    assert ask_api.PING_SECONDS == 10 and ask_api.SUMMARY_CACHE_SECONDS >= 24 * 3600
