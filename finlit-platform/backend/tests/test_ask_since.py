"""Task #349 PR 3: "Since you last asked" (finlit/ask/memory.py section 6, finlit/ask/api.py since_lookup; docs/ASK-AI.md).

Real Postgres and Redis, signed-in Silver and Gold members and the scripted model of test_ask.py. What must hold: the same question asked again
after a while carries a <since_last_asked> block (price before and after with both dates, FinLit Prism moves, new filings since then) in the note
with the question, and a `since` event reaches the member before the words; <said_before> only for the same topic; nothing within the hour, with
remembering off, for a follow-up, or with `fresh`; a plan downgrade is said as "not included in your plan now", never as a change; a member with no
earlier question gets the very same request and cache key as before; the 30-minute cache is skipped only when the since block applies."""

import dataclasses
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

import pytest

from finlit.ask import api as ask_api, memory, service
from finlit.auth.service import Ctx
from test_ask import FakeClient, enable, store_prism
from test_ask_memory import asked, memtable, rows_of, uid_of  # noqa: F401
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401


def pg(f):
    return pytest.mark.integration(pytest.mark.usefixtures("memtable")(f))


async def earlier(app, uid: str, *, topic: str = "company:RELIANCE:prism", ago: timedelta = timedelta(hours=2), figures: Dict[str, Any] = None,
                  points: List[str] = None, plan: str = "gold", question: str = "prism score?") -> None:
    sk, sid, intent = topic.split(":")
    async with app.state.store.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO ai_question_memory (user_id, asked_at, topic_key, subject_kind, subject_id, intent, question, points, figures, plan) "
            "VALUES ($1, now() - make_interval(secs => $2), $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)",
            uid, ago.total_seconds(), topic, sk, sid, intent, question, json.dumps(points or ["FinLit Prism 80 (Strong) [FinLit company page]"]),
            json.dumps(figures if figures is not None else FIGS), plan)


FIGS = {"companies": {"RELIANCE": {"price": {"value": 1000.0, "asOf": "2026-09-20T15:30:00"},
                                   "prism": {"score": 68.0, "label": "Healthy", "parts": {"quality": 80.0, "risk": 84.0}, "asOf": "2026-11-20"}}}}


def since_of(ev) -> Dict[str, Any]:
    return next(d for e, d in ev if e == "since")


def sent(client, i: int = 0) -> str:
    return client.calls[i]["messages"][-1]["content"]


async def clear_cache(app) -> None:
    for k in await app.state.store.redis.keys("ask:answer:*"):
        await app.state.store.redis.delete(k)


async def ask_q(m, q="prism score?", **kw):
    return await asked(m, q, symbol="RELIANCE", **kw)


# ------------------------------------------------------------------------------------------------------------------ 1. two hours apart

@pg
async def test_the_same_question_two_hours_later_carries_the_since_block_and_the_event_comes_before_the_words(app):
    await store_prism(app, final=71, label="Strong")
    client = FakeClient([{"text": ["Since you last asked (…): FinLit Prism rose."]}])
    enable(app, client)
    m = await signed_in(app, "since-1@example.com", plan="gold")
    await earlier(app, await uid_of(m))
    r, ev = await ask_q(m)
    assert r.status_code == 200 and ev[-1][0] == "done"
    names = [e for e, _ in ev]
    assert "since" in names and names.index("since") < names.index("text")                     # since before text
    s = since_of(ev)
    price = next(c for c in s["changes"] if c.startswith("Price"))
    assert re.match(r"Price ₹1,000 → ₹[\d,.]+, [+−]₹[\d,.]+ \([+−±][\d.]+%\) \(20 Sep 2026 → \d{1,2} \w{3} \d{4}\)$", price), price
    assert s["question"] == "prism score?" and s["match"] == "strong" and s["said"] == ["FinLit Prism 80 (Strong) [FinLit company page]"]
    text = sent(client)
    assert "<since_last_asked asked=\"" in text and "</since_last_asked>" in text and price in text
    assert "Since you last asked (" in text and "Do not repeat a <said_before> point unless its figure changed." in text
    rows = await rows_of(app, await uid_of(m))
    assert len(rows) == 2 and rows[-1]["topic_key"] == "company:RELIANCE:prism"                    # the repeat is kept: the next one compares with it


# ------------------------------------------------------------------------------------------------------------------ 2. ten minutes apart

@pg
async def test_ten_minutes_apart_there_is_no_since_block(app):
    await store_prism(app)
    client = FakeClient([{"text": ["Reliance's Prism is 85.4."]}])
    enable(app, client)
    m = await signed_in(app, "since-2@example.com", plan="gold")
    uid = await uid_of(m)
    await earlier(app, uid, ago=timedelta(days=2))
    await earlier(app, uid, ago=timedelta(minutes=10))                                           # just read: the newest row counts
    _, ev = await ask_q(m)
    assert "since" not in [e for e, _ in ev] and "<since_last_asked" not in sent(client)


# ------------------------------------------------------------------------------------------------------------------ 3. FinLit Prism

@pg
async def test_prism_68_to_71_is_plus_3_with_its_dates(app):
    await store_prism(app, final=71, label="Strong")
    enable(app, FakeClient([{"text": ["Up."]}]))
    m = await signed_in(app, "since-3@example.com", plan="gold")
    await earlier(app, await uid_of(m))
    _, ev = await ask_q(m)
    ch = since_of(ev)["changes"]
    assert any(c.startswith("FinLit Prism 68 → 71 (+3) (20 Nov 2026 → ") for c in ch), ch
    assert any(c.startswith("FinLit Prism label Healthy → Strong") for c in ch)
    assert any(c.startswith("Prism parts: quality 80 → 90 (+10)") for c in ch) and not any("risk 84" in c for c in ch)   # risk 84 → 84: not moved


def test_a_different_prism_model_version_gives_the_formula_line_only_when_both_are_known():
    prev = {"companies": {"TCS": {"prism": {"score": 68, "modelVersion": "prism-2", "asOf": "2026-11-01"}}}}
    now = {"companies": {"TCS": {"prism": {"score": 71, "modelVersion": "prism-3", "asOf": "2026-11-22T02:00:00+00:00"}}}}
    texts = [f["text"] for f in memory.diff(prev, now, subject="TCS")]
    assert texts[0] == "FinLit updated the Prism formula on 22 Nov 2026, so the score is not like for like"
    assert texts[1] == "FinLit Prism 68 → 71 (+3) (1 Nov 2026 → 22 Nov 2026)"
    del now["companies"]["TCS"]["prism"]["modelVersion"]
    assert not any("formula" in f["text"] for f in memory.diff(prev, now, subject="TCS"))          # unknown: never guessed
    same = {"companies": {"TCS": {"prism": {"score": 68.4, "asOf": "2026-11-22"}}}}
    assert memory.diff(prev, same, subject="TCS") == []                                           # under 1 point: not a change


# ------------------------------------------------------------------------------------------------------------------ 4. a plan downgrade

@pg
async def test_a_plan_downgrade_is_said_as_not_included_never_as_a_change(app):
    await store_prism(app)
    app.state.settings = dataclasses.replace(app.state.settings, showcase_symbols=[])            # Reliance's Prism: Gold only now
    client = FakeClient([{"text": ["Prism is part of Gold."]}])
    enable(app, client)
    m = await signed_in(app, "since-4@example.com", plan="silver")
    await earlier(app, await uid_of(m), plan="gold")
    _, ev = await ask_q(m)
    ch = since_of(ev)["changes"]
    assert "FinLit Prism: not included in your plan now" in ch
    assert not any(re.search(r"Prism \d", c) or "68" in c for c in ch)
    assert "FinLit Prism: not included in your plan now" in sent(client)


def test_a_downgrade_without_a_marker_and_a_figure_simply_not_read():
    prev = {"companies": {"TCS": {"pe": {"value": 25}, "prism": {"score": 70}}}}
    assert [f["text"] for f in memory.diff(prev, {"companies": {"TCS": {}}}, subject="TCS", prev_plan="gold", now_plan="silver")] == \
        ["FinLit Prism: not included in your plan now", "P/E: not included in your plan now"]
    assert memory.diff(prev, {"companies": {"TCS": {}}}, subject="TCS", prev_plan="gold", now_plan="gold") == []   # not read: no change claimed


# ------------------------------------------------------------------------------------------------------------------ 5. filings since then

@pg
async def test_a_filing_after_the_earlier_question_is_listed_and_an_older_one_is_not(app):
    await store_prism(app)
    today = datetime.now(service.IST).date()
    async with app.state.store.pool.acquire() as conn:
        for title, d, k in (("Outcome of board meeting on fund raising", today - timedelta(days=1), "n1"), ("Old press release", today - timedelta(days=5), "n2"),
                            ("Same-day notice", today - timedelta(days=2), "n3")):
            await conn.execute("INSERT INTO feed_items (kind, title, symbol, company, link, item_date, category, auto, dedupe) "
                               "VALUES ('news', $1, 'RELIANCE', 'Reliance', 'https://www.nseindia.com/x.pdf', $2, 'General Updates', true, $3)", title, d, k)
    client = FakeClient([{"text": ["New."]}])
    enable(app, client)
    m = await signed_in(app, "since-5@example.com", plan="gold")
    asked_at = datetime.combine(today - timedelta(days=2), datetime.min.time(), tzinfo=service.IST) + timedelta(hours=11)
    await earlier(app, await uid_of(m), ago=datetime.now(timezone.utc) - asked_at)
    _, ev = await ask_q(m)
    items = since_of(ev)["newItems"]
    assert [i["title"] for i in items] == ["Outcome of board meeting on fund raising"]            # older, and the same day as the question: not new
    assert items[0]["to"] == "/stocks/RELIANCE#news" and items[0]["date"] == (today - timedelta(days=1)).isoformat()   # on-site link, never the exchange's
    assert "New filing: Outcome of board meeting on fund raising (" in sent(client)


def test_new_items_compares_days_in_india_time():
    feed = json.dumps({"data": {"items": [{"date": "2026-11-21", "title": "A <b>x</b>", "symbol": "TCS"}, {"date": "2026-11-20", "title": "B"},
                                          {"date": "2026-11-22", "title": "C"}, {"date": "2026-11-23", "title": "D"}, {"date": None, "title": "E"}]}})
    got = memory.new_items(feed, datetime(2026, 11, 20, 20, 0, tzinfo=timezone.utc))              # 21 Nov, 1:30 am IST
    assert [i["title"] for i in got] == ["D", "C"]                                                # 21 Nov is the day it was asked (IST)
    assert memory.new_items(feed, datetime(2026, 11, 19, 10, 0, tzinfo=timezone.utc))[2]["title"] == "A b x /b"


# ------------------------------------------------------------------------------------------------------------------ 6. said_before

@pg
async def test_said_before_only_on_a_strong_match(app):
    await store_prism(app)
    client = FakeClient([{"text": ["One."]}])
    enable(app, client)
    m = await signed_in(app, "since-6@example.com", plan="gold")
    await earlier(app, await uid_of(m), topic="company:RELIANCE:price", question="Reliance share price")
    _, ev = await ask_q(m)                                                                        # prism: the same company, another intent
    s = since_of(ev)
    assert s["match"] == "weak" and s["said"] == [] and s["question"] == "Reliance share price"
    text = sent(client)
    assert "<since_last_asked" in text and "<said_before>" not in text and "Do not repeat" not in text
    assert "asked another question on this subject before" in text


def test_match_rules_without_a_database():
    assert memory.since_miss_reason("question", [{"role": "user"}], False, ("company:TCS:prism", "company", "TCS", "prism")) == "followup"
    assert memory.since_miss_reason("question", [], False, ("concept:pe:concept", "concept", "pe", "concept")) == "concept"
    assert memory.since_miss_reason("question", [], False, ("general:all:overview", "general", "all", "overview")) == "no_subject"
    assert memory.since_miss_reason("question", [], True, ("company:TCS:prism", "company", "TCS", "prism")) == "fresh"
    assert memory.since_miss_reason("question", [], False, ("company:TCS:prism", "company", "TCS", "prism")) is None


# ------------------------------------------------------------------------------------------------------------------ 7, 8: remembering off, fresh

@pg
async def test_with_remembering_off_there_is_no_since_block(app):
    await store_prism(app)
    client = FakeClient([{"text": ["One."]}])
    enable(app, client)
    m = await signed_in(app, "since-7@example.com", plan="gold")
    await earlier(app, await uid_of(m))
    assert (await m.put("/api/me/prefs", json={"aiMemory": False})).status_code == 200
    _, ev = await ask_q(m)
    assert "since" not in [e for e, _ in ev] and "<since_last_asked" not in sent(client)


@pg
async def test_fresh_gives_the_full_answer_without_the_since_block(app):
    await store_prism(app)
    client = FakeClient([{"text": ["Full."]}])
    enable(app, client)
    m = await signed_in(app, "since-8@example.com", plan="gold")
    await earlier(app, await uid_of(m))
    r, ev = await ask_q(m, fresh=True)
    assert r.status_code == 200 and "since" not in [e for e, _ in ev] and "<since_last_asked" not in sent(client)
    miss = await app.state.store.redis.hgetall(f"ask:memory:miss:{datetime.now(service.IST).date().isoformat()}")
    assert int(miss.get(b"fresh") or miss.get("fresh") or 0) >= 1                                 # misses are counted by reason


# ------------------------------------------------------------------------------------------------------------------ 9. golden: no history, no change

def _plain(calls) -> str:
    return json.dumps(calls, default=lambda o: getattr(o, "__dict__", str(o)), sort_keys=True)


@pg
async def test_golden_no_history_means_the_same_request_and_the_same_cache_key(app, monkeypatch):
    await store_prism(app)
    turns = [{"text": ["Reliance's Prism ", "is 85.4."]}]
    redis = app.state.store.redis
    seen: List[str] = []

    async def run(email: str, off: bool = False, rows: bool = False):
        await clear_cache(app)
        if off:                                                                                    # the code before this PR: no lookup at all
            async def none(*a, **k):
                return None
            monkeypatch.setattr(ask_api, "since_lookup", none)
        else:
            monkeypatch.undo()
        c = FakeClient([dict(t) for t in turns])
        enable(app, c)
        m = await signed_in(app, email, plan="gold")
        if rows:                                                                                   # questions kept, but about another subject
            await earlier(app, await uid_of(m), topic="company:TCS:prism", ago=timedelta(days=3))
        _, ev = await ask_q(m)
        seen.append(sorted(k.decode() if isinstance(k, bytes) else k for k in await redis.keys("ask:answer:*"))[0])
        return c, [e for e in ev if e[0] != "meta"]

    before, ev_before = await run("gold-before@example.com", off=True)
    none_, ev_none = await run("gold-none@example.com")
    other, ev_other = await run("gold-other@example.com", rows=True)
    assert _plain(before.calls) == _plain(none_.calls) == _plain(other.calls)
    assert ev_before == ev_none == ev_other and seen[0] == seen[1] == seen[2]


# ------------------------------------------------------------------------------------------------------------------ 10. the cache

@pg
async def test_the_cache_is_skipped_only_when_the_since_block_applies(app):
    await store_prism(app)
    redis = app.state.store.redis
    m = await signed_in(app, "since-10@example.com", plan="gold")
    other = await signed_in(app, "since-10b@example.com", plan="gold")
    key = ask_api.cache_key(app.state.settings.ask_model, Ctx(user_id="u", plan="gold"), ask_api.AskIn(question="prism score?", symbol="RELIANCE"))
    await clear_cache(app)
    await redis.set(key, json.dumps({"text": "CACHED ANSWER", "tools": [], "pages": []}), ex=600)
    client = FakeClient([{"text": ["Fresh since answer."]}])
    enable(app, client)
    await earlier(app, await uid_of(m))
    _, ev = await ask_q(m)
    assert "since" in [e for e, _ in ev] and "CACHED ANSWER" not in json.dumps(ev) and len(client.calls) == 1   # not read
    assert json.loads(await redis.get(key))["text"] == "CACHED ANSWER"                            # not written either
    _, ev2 = await ask_q(other)                                                                    # no earlier question: the cache as before
    assert ("text", {"text": "CACHED ANSWER"}) in ev2 and len(client.calls) == 1
    await clear_cache(app)
    enable(app, FakeClient([{"text": ["Written once."]}]))
    third = await signed_in(app, "since-10c@example.com", plan="gold")
    await ask_q(third)
    assert json.loads(await redis.get(key))["text"] == "Written once."                            # written as before, with what it read


@pg
async def test_a_cached_replay_is_kept_with_the_figures_the_first_answer_read(app):
    await store_prism(app)
    await clear_cache(app)
    enable(app, FakeClient([{"text": ["Reliance's Prism is 85.4."]}]))
    a = await signed_in(app, "since-r1@example.com", plan="gold")
    b = await signed_in(app, "since-r2@example.com", plan="gold")
    await ask_q(a)
    _, ev = await ask_q(b)
    assert ("text", {"text": "Reliance's Prism is 85.4."}) in ev                                  # from the cache
    rows = await rows_of(app, await uid_of(b))
    assert len(rows) == 1 and rows[0]["topic_key"] == "company:RELIANCE:prism"
    assert json.loads(rows[0]["figures"])["companies"]["RELIANCE"]["prism"]["score"] == 85.4


# ------------------------------------------------------------------------------------------------------------------ the words, without a model

def test_the_note_and_the_event_text():
    prev = {"askedAt": datetime(2026, 11, 20, 10, 22, tzinfo=timezone.utc), "question": "TCS price?", "match": "strong",
            "points": ["TCS traded at ₹2,880 [FinLit company page, 20 Nov 2026]"], "figures": {}, "plan": "gold"}
    facts = memory.diff({"companies": {"TCS": {"price": {"value": 2880, "asOf": "2026-11-20T15:30:00"}}}},
                        {"companies": {"TCS": {"price": {"value": 2950, "asOf": "2026-11-23T15:30:00"}}}}, subject="TCS")
    assert [f["text"] for f in facts] == ["Price ₹2,880 → ₹2,950, +₹70 (+2.4%) (20 Nov 2026 → 23 Nov 2026)"]
    items = [{"title": "Board meeting outcome", "date": "2026-11-22", "symbol": "TCS"}]
    note = memory.since_note(prev, facts, items)
    assert note == ("<since_last_asked asked=\"20 Nov 2026, 3:52 pm IST\">\n"
                    "- Price ₹2,880 → ₹2,950, +₹70 (+2.4%) (20 Nov 2026 → 23 Nov 2026)\n"
                    "- New filing: Board meeting outcome (22 Nov 2026)\n"
                    "</since_last_asked>\n"
                    "<said_before>\n- TCS traded at ₹2,880 [FinLit company page, 20 Nov 2026]\n</said_before>\n"
                    "[The member asked this before, on 20 Nov 2026, 3:52 pm IST. First, one line \"Since you last asked (20 Nov 2026, 3:52 pm IST): ...\" "
                    "using only the facts in <since_last_asked>, each with its date. Then the new points and other important current items on the same "
                    "subject. Do not repeat a <said_before> point unless its figure changed.]")
    p = memory.since_payload(prev, facts, items, "TCS")
    assert p["askedAt"] == "2026-11-20T10:22:00+00:00" and p["newItems"] == [{"title": "Board meeting outcome", "date": "2026-11-22", "to": "/stocks/TCS#news"}]
    assert memory.since_payload(prev, [], [], "TCS")["changes"] == [memory.NO_CHANGE]
    assert not service.reads_like_advice(note)
    assert memory.inr(123456.5) == "₹1,23,456.50" and memory.inr(-70) == "-₹70"


def test_new_results_and_sector_moves():
    prev = {"companies": {"TCS": {"results": {"period": "Q1 FY27", "filed": "2026-07-10"}, "sector": {"name": "IT", "box": "Leading", "asOf": "2026-11-01"}}}}
    now = {"companies": {"TCS": {"results": {"period": "Q2 FY27", "filed": "2026-10-09"}, "sector": {"name": "IT", "box": "Weakening", "asOf": "2026-11-22"}}}}
    assert [f["text"] for f in memory.diff(prev, now, subject="TCS")] == ["New results filed: Q2 FY27, filed 9 Oct 2026",
                                                                          "IT: box Leading → Weakening (22 Nov 2026)"]
    assert memory.diff(now, now, subject="TCS") == []
    older = memory.diff({"companies": {"TCS": {"price": {"value": 10, "asOf": "2026-11-20"}}}},
                        {"companies": {"TCS": {"price": {"value": 12, "asOf": "2026-11-18"}}}}, subject="TCS")
    assert older == []                                                                            # a price older than the one compared: no change claimed
