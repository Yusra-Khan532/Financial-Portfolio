"""Task #432 (27 Nov 2026, the team: "Make AI summaries more detailed and comprehensive, using multiple relevant main headings with bullet points under
each. Do not use paragraphs or predefined headings ... source page references ..."): the Concall Monitor's AI summary. The prompt asks for headings the
model chooses ("## "), optional subheadings ("### ") and points with page references; the cleaner drops advice, prose, points whose citations do not
check out and headings left empty; a summary kept in the old short form is written again once in the new form without using anyone's summaries."""

import dataclasses

import pytest

from finlit.concall import api as A
from finlit.concall import service as S
from test_auth import app, signed_in  # noqa: E402,F401  (fixtures and helpers)
from test_integration import ingested, store  # noqa: E402,F401  (fixtures)

PAGES = {1: "Q2 FY27 Total Income 115.79 crore, EBITDA 11.66 crore, Net Profit 3.87 crore",
         2: "Order book of 1,234 crore; new plant at Pune adds 20% capacity",
         3: "Management: demand steady; raw material costs rose"}


def test_the_prompt_lets_the_model_choose_its_headings_and_asks_for_points_with_pages():
    p = A.PROMPT
    assert "## " in p and "### " in p and "do not use a fixed list" in p and "(p. 5)" in p and "no paragraphs" in p
    for must in ("financial figures", "business developments", "commentary", "growth plans", "risks", "outlook"):
        assert must in p
    assert "never advise" in p and "target price" in p and "no figure the document does not state" in p
    for fixed in ("**What the quarter looked like**", "**Outlook as management stated it**"):   # the old fixed headings are gone
        assert fixed not in p
    assert A.SUMMARY_TOKENS >= 2000


def test_points_whose_citation_does_not_check_out_are_dropped():
    t = ("## Quarter figures\n- Total income 115.79 crore (p. 1)\n- EBITDA 99.99 crore (p. 1)\n- Cash 500 crore (p. 9)\n"
         "## Orders and capacity\n### Orders\n- Order book 1,234 crore (pp. 1-2)\n### Plants\n- Made-up 777 tonnes (p. 2)\n"
         "## What management said\n- Demand was steady (p. 3)")
    out = A.clean_summary(t, PAGES)
    assert "115.79" in out and "1,234" in out and "Demand was steady" in out
    assert "99.99" not in out          # a figure not on the page it cites
    assert "(p. 9)" not in out         # a page the model was not given
    assert "### Plants" not in out     # a subheading left with no point
    assert "### Orders" in out and "## Orders and capacity" in out


def test_advice_prose_and_empty_headings_are_dropped():
    t = ("Here is the summary of the call.\n## Figures\n- Revenue 115.79 crore (p. 1)\n- Investors should buy the stock now (p. 1)\n"
         "## Valuation\n- Target price of 500 (p. 2)\n## Outlook\nManagement was upbeat overall.")
    out = A.clean_summary(t, PAGES)
    assert out == "## Figures\n- Revenue 115.79 crore (p. 1)"


def test_page_references_are_read_in_every_form():
    assert A._refs("a (p. 5)") == [5] and A._refs("a (pp. 5, 7)") == [5, 7] and A._refs("a (pp. 5-7)") == [5, 6, 7]
    assert A.is_sectioned("## A\n- b") and not A.is_sectioned("**What the quarter looked like**\n- b")


@pytest.mark.integration
async def test_an_old_short_summary_is_written_again_once_in_the_new_form_without_using_a_summary(app, monkeypatch):
    from test_concall_278 import LETTERS, _seed
    await _seed(app)

    async def pages_of(link):
        return [p.replace("{up}", "November 30, 2026") for p in LETTERS.get(link, ["No call."])]

    await S.run(app.state.store, pages_of=pages_of)
    link = "https://nsearchives.nseindia.com/corporate/RELIANCE_tr.pdf"
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("INSERT INTO concall_summaries (link, symbol, source_kind, text, pages, model) VALUES ($1,'RELIANCE','transcript',$2,3,'old')",
                           link, "**What the quarter looked like**\n- Revenue grew (p. 1)")
    calls = []

    async def fake_write(request, row, pages, name):
        calls.append(row["link"])
        return "## Revenue and margins\n- Revenue grew (p. 1)\n## Orders\n- New orders came in (p. 2)"
    monkeypatch.setattr(A, "_write_summary", fake_write)
    app.state.settings = dataclasses.replace(app.state.settings, anthropic_api_key=app.state.settings.anthropic_api_key or "test-key")
    gold = await signed_in(app, "cc432g@example.com", plan="gold")
    first = (await gold.post("/api/concalls/summary", json={"link": link})).json()
    assert first["text"].startswith("## Revenue and margins") and first["rewritten"] is True and first["used"] == 0   # nobody's summary used
    again = (await gold.post("/api/concalls/summary", json={"link": link})).json()
    assert again["cached"] is True and again["used"] == 0 and "## Orders" in again["text"] and calls == [link]       # rewritten once, then kept


async def _old_summary(app, monkeypatch, write, email="cc432f@example.com"):
    """An old short summary kept for RELIANCE's transcript, the AI call replaced by `write`, a Gold member; the rewrite marks cleared."""
    from test_concall_278 import LETTERS, _seed
    await _seed(app)

    async def pages_of(link):
        return [p.replace("{up}", "November 30, 2026") for p in LETTERS.get(link, ["No call."])]

    await S.run(app.state.store, pages_of=pages_of)
    link = "https://nsearchives.nseindia.com/corporate/RELIANCE_tr.pdf"
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("INSERT INTO concall_summaries (link, symbol, source_kind, text, pages, model) VALUES ($1,'RELIANCE','transcript',$2,3,'old') "
                           "ON CONFLICT (link) DO UPDATE SET text = EXCLUDED.text", link, "**What the quarter looked like**\n- Revenue grew (p. 1)")
    await app.state.store.redis.delete(A._ukey("failed", link), A._ukey("lock", link))
    A._local.clear()
    monkeypatch.setattr(A, "_write_summary", write)
    app.state.settings = dataclasses.replace(app.state.settings, anthropic_api_key=app.state.settings.anthropic_api_key or "test-key")
    return link, await signed_in(app, email, plan="gold")


@pytest.mark.integration
async def test_a_failed_rewrite_is_not_tried_again_for_a_day_and_the_old_summary_is_shown(app, monkeypatch):
    calls = []

    async def failing(request, row, pages, name):
        calls.append(row["link"])
        raise RuntimeError("the model is down")
    link, m = await _old_summary(app, monkeypatch, failing)
    first = (await m.post("/api/concalls/summary", json={"link": link})).json()
    assert first["text"].startswith("**What the quarter looked like**") and first["cached"] is True and first["used"] == 0 and "rewritten" not in first
    for _ in range(3):
        again = (await m.post("/api/concalls/summary", json={"link": link})).json()
        assert again["text"].startswith("**What the quarter looked like**")
    assert calls == [link]                                                    # one paid call, never repeated on every open
    assert 0 < await app.state.store.redis.ttl(A._ukey("failed", link)) <= A.UPGRADE_BACKOFF

    calls.clear()                                                             # every point dropped by the checks counts as a failure too

    async def empty(request, row, pages, name):
        calls.append(row["link"])
        return ""
    link, m = await _old_summary(app, monkeypatch, empty, "cc432e@example.com")
    for _ in range(2):
        await m.post("/api/concalls/summary", json={"link": link})
    assert calls == [link]


@pytest.mark.integration
async def test_while_one_rewrite_runs_another_request_makes_no_call(app, monkeypatch):
    calls = []

    async def write(request, row, pages, name):
        calls.append(row["link"])
        return "## Revenue\n- Revenue grew (p. 1)"
    link, m = await _old_summary(app, monkeypatch, write)
    await app.state.store.redis.set(A._ukey("lock", link), "someone-else", ex=60)   # another member's rewrite is running
    r = (await m.post("/api/concalls/summary", json={"link": link})).json()
    assert r["text"].startswith("**What the quarter looked like**") and calls == []
    assert await app.state.store.redis.get(A._ukey("lock", link)) in ("someone-else", b"someone-else")   # not taken from its owner
    await app.state.store.redis.delete(A._ukey("lock", link))
    r = (await m.post("/api/concalls/summary", json={"link": link})).json()
    assert r["text"].startswith("## Revenue") and r["rewritten"] is True and calls == [link]
    assert not await app.state.store.redis.exists(A._ukey("lock", link))      # the lock is let go after the rewrite


class _Down:
    """A Redis that cannot be reached."""
    async def exists(self, *a): raise ConnectionError("down")
    async def set(self, *a, **k): raise ConnectionError("down")
    async def get(self, *a): raise ConnectionError("down")
    async def delete(self, *a): raise ConnectionError("down")


class _NoRedisStore:
    redis = _Down()


async def test_without_redis_the_backoff_and_the_lock_are_kept_in_this_process():
    A._local.clear()
    link, other = "https://nsearchives.nseindia.com/x.pdf", "https://nsearchives.nseindia.com/y.pdf"
    assert not await A._upgrade_blocked(_NoRedisStore, link)
    await A._upgrade_failed(_NoRedisStore, link)
    assert await A._upgrade_blocked(_NoRedisStore, link)
    tok = await A._upgrade_lock(_NoRedisStore, other)
    assert tok and await A._upgrade_lock(_NoRedisStore, other) is None       # a second request at once: no call
    await A._upgrade_unlock(_NoRedisStore, other, tok)
    assert await A._upgrade_lock(_NoRedisStore, other)
    A._local.clear()


async def test_the_backoff_ends_after_its_time():
    A._local.clear()
    link = "https://nsearchives.nseindia.com/z.pdf"
    await A._upgrade_failed(_NoRedisStore, link)
    A._local[A._ukey("failed", link)] = A.time.monotonic() - 1                 # a day later
    assert not await A._upgrade_blocked(_NoRedisStore, link)
    A._local.clear()
