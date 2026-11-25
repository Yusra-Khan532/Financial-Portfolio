"""Task #349 PR 5: "What's new for me" (finlit/ask/whatsnew.py, memory.asks_whatsnew, api.whatsnew_lookup; docs/ASK-AI.md "What's new for me").

Real Postgres and Redis, signed-in Silver and Gold members and the scripted model of test_ask.py. What must hold: "anything new in my holdings?",
"what changed in my portfolio this week" and "kya naya hai mere stocks mein" are the intent mine:-:whatsnew, and a how-to is not; at most 5
companies, the Equity portfolio by weight first, then the watchlists; each is compared with its last memory row, or with the last 7 days, with
both dates on every figure; the biggest change leads; FinLit Prism follows the plan; a member with no holdings and no watchlist gets a plain
answer without the model or a question used; Basic is refused as before; the answer is kept so the next "what's new" starts from it."""

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List

import pytest

from finlit.ask import api as ask_api, memory, service, whatsnew
from finlit.auth.service import Ctx
from test_ask import FakeClient, enable, store_prism
from test_ask_holdings import alert, clear_cache, h, member, put_state, sent  # noqa: F401
from test_ask_memory import asked, memtable, rows_of, uid_of  # noqa: F401
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401


def pg(f):
    return pytest.mark.integration(pytest.mark.usefixtures("memtable")(f))


TODAY = datetime.now(service.IST).date()


def d(n: int) -> date:
    return TODAY - timedelta(days=n)


def label(x: date) -> str:
    return f"{x.day} {x.strftime('%b %Y')}"


async def prices(app, rows: Dict[str, List[tuple]]) -> None:
    """Every stored close of each symbol replaced by (day, close) pairs."""
    async with app.state.store.pool.acquire() as c:
        for s, pairs in rows.items():
            await c.execute("DELETE FROM price_daily WHERE symbol = $1", s)
            for day, close in pairs:
                await c.execute("INSERT INTO price_daily (symbol, day, close) VALUES ($1, $2, $3)", s, day, close)


async def filing(app, symbol: str, title: str, on: date, kind: str = "news") -> None:
    async with app.state.store.pool.acquire() as c:
        await c.execute("INSERT INTO feed_items (kind, title, symbol, company, link, item_date, category, auto, dedupe) "
                        "VALUES ($1, $2, $3, $3, 'https://www.nseindia.com/x.pdf', $4, 'General Updates', true, $5) ON CONFLICT (dedupe) DO NOTHING",
                        kind, title, symbol, on, f"wn-{symbol}-{title}-{on}")


async def row(app, uid: str, symbol: str, ago: timedelta, figures: Dict[str, Any], plan: str = "gold", topic: str = None) -> None:
    topic = topic or f"company:{symbol}:overview"
    sk, sid, intent = topic.split(":")
    async with app.state.store.pool.acquire() as c:
        await c.execute("INSERT INTO ai_question_memory (user_id, asked_at, topic_key, subject_kind, subject_id, intent, question, figures, plan) "
                        "VALUES ($1, now() - make_interval(secs => $2), $3, $4, $5, $6, 'how is it doing?', $7::jsonb, $8)",
                        uid, ago.total_seconds(), topic, sk, sid, intent, json.dumps({"companies": {symbol: figures}}), plan)


def note_of(client, i: int = 0) -> str:
    return sent(client, i)


# ------------------------------------------------------------------------------------------------------------------ 1. the intent

@pytest.mark.parametrize("q", ["anything new in my holdings?", "what changed in my portfolio this week", "kya naya hai mere stocks mein",
                               "Any news on my watchlist?", "What's new for me?", "what happened to my shares today", "mere portfolio mein kya badla",
                               "What's new in my holdings?"])
def test_these_questions_are_the_whatsnew_intent(q):
    assert memory.asks_whatsnew(q)
    assert memory.topic_of(q, ["TCS"], "RELIANCE", None, ["news"])[0] == "mine:-:whatsnew"
    assert memory.since_miss_reason("question", [], False, memory.topic_of(q)) == "whatsnew"


@pytest.mark.parametrize("q", ["how do I add a new share to my portfolio?", "what is new in TCS?", "what is my portfolio worth?", "news on reliance",
                               "import my holdings from a statement", "what changed in the repo rate"])
def test_these_are_not(q):
    assert not memory.asks_whatsnew(q)


# ------------------------------------------------------------------------------------------------------------------ 2. which companies

@pg
async def test_every_company_the_portfolio_by_weight_first_then_the_watchlists(app):
    _, uid = await member(app, "wn-1@example.com")
    await prices(app, {"RELIANCE": [(d(1), 2950)], "TCS": [(d(1), 3500)], "INFY": [(d(1), 1500)]})
    await put_state(app, uid, [h("RELIANCE", 40, 2400, owned=True), h("TCS", 10, 3000, owned=True), h("INFY", 100, 1400, owned=True)],
                    lists=[{"id": "a", "name": "Banks", "symbols": ["HDFCBANK", "TCS", "ICICIBANK", "SBIN"]}])
    got = await whatsnew.kept(app.state.store.pool, uid)
    # task #349 fix A: every company, not the first 5 (SBIN was cut before)
    assert [x["symbol"] for x in got] == ["INFY", "RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "SBIN"]  # 1,50,000 > 1,18,000 > 35,000; then the list
    assert got[0]["link"] == f"you hold 100 shares; 49.5% of your Equity portfolio by value, close {label(d(1))}"
    assert got[3] == {"symbol": "HDFCBANK", "how": "watch", "link": "on your watchlist 'Banks'"}
    _, other = await member(app, "wn-1b@example.com")
    assert await whatsnew.kept(app.state.store.pool, other) == []                                    # scoped to the member


# ------------------------------------------------------------------------------------------------------------------ 3. the whole answer

@pg
async def test_the_note_carries_each_companys_diff_with_dates_the_biggest_first(app):
    m, uid = await member(app, "wn-2@example.com")
    await prices(app, {"RELIANCE": [(d(9), 2800), (d(1), 2950)], "TCS": [(d(9), 3000), (d(1), 3150)]})
    await put_state(app, uid, [h("RELIANCE", 40, 2400, owned=True)], lists=[{"id": "a", "name": "IT", "symbols": ["TCS"]}])
    await row(app, uid, "RELIANCE", timedelta(days=2), {"price": {"value": 2880.0, "asOf": d(3).isoformat()}})
    await filing(app, "RELIANCE", "Outcome of board meeting", TODAY)
    await filing(app, "TCS", "Financial results for the quarter", d(2), kind="result")
    await filing(app, "TCS", "Old notice", d(12))
    await clear_cache(app)
    client = FakeClient([{"text": ["TCS rose 5% and filed results; Reliance rose 2.4%."]}])
    enable(app, client)
    r, ev = await asked(m, "anything new in my holdings?", symbol="RELIANCE")
    assert r.status_code == 200 and ev[-1][0] == "done" and len(client.calls) == 1
    text = note_of(client)
    block = text[text.index("<whats_new_for_you>"):text.index("</whats_new_for_you>")]
    assert block.index("- TCS (") < block.index("- RELIANCE (")                                       # +5% and results lead +2.4% and a filing
    assert f"- TCS (on your watchlist 'IT'), last 7 days, since {label(d(7))}:" in block
    assert f"  - Price ₹3,000 → ₹3,150, +₹150 (+5%) ({label(d(9))} → {label(d(1))})" in block
    assert f"  - New results filing: Financial results for the quarter ({label(d(2))})" in block and "Old notice" not in block
    assert f"- RELIANCE (you hold 40 shares; 100.0% of your Equity portfolio by value, close {label(d(1))}), since your question of " in block
    assert f"  - Price ₹2,880 → ₹2,950, +₹70 (+2.4%) ({label(d(3))} → {label(d(1))})" in block
    assert f"  - New filing: Outcome of board meeting ({label(TODAY)})" in block
    assert whatsnew.INSTRUCTION in text and text.endswith("anything new in my holdings?")
    assert "<member_relation" not in text and "<since_last_asked" not in text and "<company_card" not in text   # none of the company paths
    assert "page of RELIANCE" not in text                                   # asked on Reliance's page, about all of them: the page is not named
    assert client.calls[0]["system"][0]["text"] == service.SYSTEM
    assert [e for e, _ in ev if e in ("since", "relation")] == []
    assert dict(ev)["done"]["pages"][0] == {"to": "/holdings", "label": "Your Equity portfolio"}
    assert not [k for k in await app.state.store.redis.keys("ask:answer:*")]                          # the member's own answer: never cached
    kept_row = (await rows_of(app, uid))[-1]
    assert kept_row["topic_key"] == "mine:-:whatsnew" and kept_row["subject_kind"] == "mine"
    figs = json.loads(kept_row["figures"])["companies"]
    assert figs["TCS"]["price"] == {"value": 3150.0, "asOf": d(1).isoformat()} and figs["RELIANCE"]["price"]["value"] == 2950.0

    # the next "what's new" starts from that answer: nothing moved since, so no price change is said
    async with app.state.store.pool.acquire() as c:
        await c.execute("UPDATE ai_question_memory SET asked_at = now() - interval '3 hours' WHERE user_id = $1", uid)
    client2 = FakeClient([{"text": ["No change."]}])
    enable(app, client2)
    await asked(m, "what changed in my portfolio this week")
    block2 = note_of(client2)
    assert "since your question of" in block2.split("- TCS (")[1].split("\n")[0] and "₹3,000 → ₹3,150" not in block2
    assert f"Price unchanged at ₹3,150 ({label(d(1))} → {label(d(1))})" in block2


@pg
async def test_hinglish_and_a_watchlist_only_member(app):
    m, uid = await member(app, "wn-3@example.com", plan="silver")
    await prices(app, {"ITC": [(d(10), 400), (d(1), 380)]})
    await put_state(app, uid, lists=[{"id": "a", "name": "FMCG", "symbols": ["ITC"]}])
    client = FakeClient([{"text": ["ITC 5% kam hua."]}])
    enable(app, client)
    _, ev = await asked(m, "kya naya hai mere stocks mein")
    assert ev[-1][0] == "done"
    assert f"  - Price ₹400 → ₹380, −₹20 (−5%) ({label(d(10))} → {label(d(1))})" in note_of(client)


# ------------------------------------------------------------------------------------------------------------------ 4. FinLit Prism and the plan

@pg
async def test_prism_is_compared_only_with_an_earlier_score_and_follows_the_plan(app):
    await store_prism(app, "TCS", final=71, label="Strong")
    await prices(app, {"TCS": [(d(1), 3150)]})
    gold, ug = await member(app, "wn-4g@example.com")
    silver, us = await member(app, "wn-4s@example.com", plan="silver")
    for uid in (ug, us):
        await put_state(app, uid, lists=[{"id": "a", "name": "IT", "symbols": ["TCS"]}])
        await row(app, uid, "TCS", timedelta(days=3), {"prism": {"score": 68.0, "label": "Healthy", "asOf": d(4).isoformat()}})
    c1 = FakeClient([{"text": ["Prism rose."]}])
    enable(app, c1)
    await asked(gold, "anything new in my holdings?")
    assert "  - FinLit Prism 68 → 71 (+3) (" in note_of(c1) and "Prism label Healthy → Strong" in note_of(c1)
    c2 = FakeClient([{"text": ["Prism is a Gold figure."]}])
    enable(app, c2)
    await asked(silver, "anything new in my holdings?")
    assert "  - FinLit Prism: not included in your plan now" in note_of(c2) and "68 → 71" not in note_of(c2)   # never a change, never the score


# ------------------------------------------------------------------------------------------------------------------ 5. nothing kept, Basic, remembering off

@pg
async def test_a_member_with_no_holdings_and_no_watchlist_gets_a_plain_answer_without_the_model(app):
    m, uid = await member(app, "wn-5@example.com")
    client = FakeClient([])
    enable(app, client)
    r, ev = await asked(m, "anything new in my holdings?")
    assert r.status_code == 200 and client.calls == []
    assert [e for e, _ in ev] == ["meta", "text", "done"] and ev[1][1]["text"] == whatsnew.NOTHING_KEPT
    assert "Equity portfolio" in whatsnew.NOTHING_KEPT and "watchlist" in whatsnew.NOTHING_KEPT
    assert ev[0][1]["used"] == 0 and ev[2][1]["pages"] == whatsnew.NOTHING_PAGES                       # no question used
    assert (await m.get("/api/ask/quota")).json()["used"] == 0 and await rows_of(app, uid) == []


@pg
async def test_basic_is_refused_as_before(app):
    m, uid = await member(app, "wn-6@example.com", plan="basic")
    await put_state(app, uid, lists=[{"id": "a", "name": "IT", "symbols": ["TCS"]}])
    enable(app, FakeClient([]))
    r, ev = await asked(m, "anything new in my holdings?")
    assert r.status_code == 403 and ev == []
    assert await ask_api.whatsnew_lookup(app.state.store, Ctx(user_id=uid, plan="basic"), "anything new in my holdings?") is None
    view_as = Ctx(user_id=uid, plan="gold", extra={"view_as": "silver"})
    assert await ask_api.whatsnew_lookup(app.state.store, view_as, "anything new in my holdings?") is None


@pg
async def test_with_remembering_off_every_company_is_read_over_the_last_7_days(app):
    m, uid = await member(app, "wn-7@example.com")
    await prices(app, {"TCS": [(d(9), 3000), (d(1), 3150)]})
    await put_state(app, uid, lists=[{"id": "a", "name": "IT", "symbols": ["TCS"]}], prefs={"aiMemory": False})
    await row(app, uid, "TCS", timedelta(days=2), {"price": {"value": 3100.0, "asOf": d(3).isoformat()}})
    client = FakeClient([{"text": ["TCS rose."]}])
    enable(app, client)
    await asked(m, "anything new in my holdings?")
    assert f"- TCS (on your watchlist 'IT'), last 7 days, since {label(d(7))}:" in note_of(client) and "₹3,000 → ₹3,150" in note_of(client)
    assert len(await rows_of(app, uid)) == 1                                                          # and nothing more is kept


# ------------------------------------------------------------------------------------------------------------------ 6. describe, never advise

@pg
async def test_advice_about_the_members_holdings_is_still_withdrawn(app):
    m, uid = await member(app, "wn-8@example.com")
    await prices(app, {"TCS": [(d(9), 3000), (d(1), 3150)]})
    await put_state(app, uid, [h("TCS", 10, 3000, owned=True)])
    enable(app, FakeClient([{"text": ["TCS rose 5%, so you could add more shares now."]}]))
    _, ev = await asked(m, "anything new in my holdings?")
    assert ("replace", {"text": service.WITHDRAWN}) in ev and ev[-1][0] == "done"


def test_no_stored_price_is_said_with_its_reason():
    plan = {"companies": [{"symbol": "NEWCO", "how": "watch", "link": "on your watchlist 'X'", "since": datetime.now(timezone.utc) - timedelta(days=7),
                           "row": None, "before": None, "now": None}]}
    entries, figs = whatsnew.build(plan, [], "gold")
    assert figs == {} and "No stored close to compare (FinLit holds no daily price for it yet), and no new filing" in whatsnew.note(entries)


# ------------------------------------------------------------------------------------------------------------------ 7. task #349 fix A (Gold QA, 24 Nov)
# "What's new in my holdings" read only the first 5 of 45 holdings (alphabetical A-B) and stale prices ("newest prices from 18 Nov" while the site
# had 23 Nov closes), and missed the real biggest mover. A MADE-UP portfolio of 45 shares, none with a quantity (as the founder's), stored closes
# that stop 6 days ago, newer quotes on the report (and one from the shared latest quote), the biggest mover far down the alphabet.

FAKE = [f"ZQH{i:02d}" for i in range(1, 46)]


async def quote(app, symbol: str, price: float, on: date, prev: float = None) -> None:
    async with app.state.store.pool.acquire() as c:
        await c.execute("INSERT INTO snapshots (symbol, statement, section, body, etag, generated_at) VALUES ($1, 'consolidated', 'summary', $2, 'e', now()) "
                        "ON CONFLICT (symbol, statement, section) DO UPDATE SET body = EXCLUDED.body",
                        symbol, json.dumps({"quote": {"price": price, "previousClose": prev or price, "changePct": 0.5,
                                                      "asOf": f"{on.isoformat()}T15:30:00+05:30"}}))


@pg
async def test_45_holdings_are_all_compared_with_the_latest_close_the_biggest_mover_first(app):
    from finlit import livequote
    m, uid = await member(app, "wn-45@example.com")
    await put_state(app, uid, [h(s, 1, 0) for s in FAKE])                                    # no quantity saved for any of them
    await prices(app, {s: [(d(12), 100.0), (d(6), 101.0)] for s in FAKE})                    # the stored closes stop 6 days ago
    for i, s in enumerate(FAKE):
        await quote(app, s, 100.0 + (i % 7) * 0.3, d(1))                                     # small moves for most, from the report's quote
    await quote(app, "ZQH44", 110.69, d(1))                                                  # the biggest mover, near the end of the alphabet
    await quote(app, "ZQH30", 99.0, d(3), prev=99.0)
    await livequote.save(app.state.store.redis, {"ZQH30": {"price": 93.0, "previousClose": 98.0, "asOf": f"{d(1).isoformat()}T15:30:00+05:30"}})
    await clear_cache(app)
    plan = await whatsnew.lookup(app.state.store.pool, uid, redis=app.state.store.redis)
    assert len(plan["companies"]) == 45 and {c["symbol"] for c in plan["companies"]} == set(FAKE)
    assert all(c["now"][1] == d(1) for c in plan["companies"])                               # the latest close, not the stored one of 6 days ago
    assert {c["symbol"]: c["now"][0] for c in plan["companies"]}["ZQH30"] == 93.0             # the shared latest quote, as /holdings shows it

    client = FakeClient([{"text": ["ZQH44 rose 10.7%."]}])
    enable(app, client)
    r, ev = await asked(m, "What's new in my holdings?")
    assert r.status_code == 200 and ev[-1][0] == "done"
    text = note_of(client)
    block = text[text.index("<whats_new_for_you>"):text.index("</whats_new_for_you>")]
    lines = block.split("\n")
    assert lines[1].startswith("Compared all 45 of your companies (45 on your Equity portfolio, 0 on watchlists only), the biggest price move first")
    assert lines[2] == f"- ZQH44 (on your Equity portfolio, no quantity saved), last 7 days, since {label(d(7))}:"
    assert lines[3].startswith("  - Price ₹100 → ₹110.69, +₹10.69 (+10.7%)") and f"({label(d(12))} → {label(d(1))})" in lines[3]
    assert lines[4].startswith("- ZQH30 ") and "₹93" in lines[5] and f"→ {label(d(1))})" in lines[5]       # −7%, the second biggest
    assert f"- The other 33 (latest prices of {label(d(1))}): smaller moves: " in block
    assert all(s in block for s in FAKE)                                                     # none silently left out
    assert label(d(6)) not in block                                                          # never the stale stored close
    assert "you hold" not in block.lower()                                                   # no quantity: never "you hold"
    assert dict(ev)["meta"]["subject"] == {"kind": "mine", "id": "-"}
    assert dict(ev)["done"]["disclaimer"] == service.disclaimer_for("mine")


def test_the_note_ranks_by_the_size_of_the_move_whatever_the_order_kept():
    since = datetime.now(timezone.utc) - timedelta(days=7)

    def co(s, a, b):
        return {"symbol": s, "how": "list", "link": "on your Equity portfolio, no quantity saved", "since": since, "row": None,
                "before": (a, d(8)), "now": (b, d(1)), "items": []}
    plan = {"companies": [co("AAA", 100, 101), co("BBB", 100, 97), co("SAMBHV", 100, 110.69), co("CCC", 100, 100)]}
    entries, figs = whatsnew.build(plan, [], "gold")
    assert [e["symbol"] for e in entries] == ["SAMBHV", "BBB", "AAA", "CCC"]
    out = whatsnew.note(entries, top=2)
    assert "the 2 biggest are listed one by one, the other 2 on the last line" in out
    assert "- The other 2 (latest prices of " in out and "smaller moves: AAA +1.0%" in out and "price unchanged: CCC" in out
    assert set(figs["companies"]) == {"AAA", "BBB", "SAMBHV", "CCC"}                          # every latest price is kept for the next time
