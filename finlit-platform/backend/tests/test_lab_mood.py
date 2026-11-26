"""Trading Lab > Market mood (lab/mood.py): the tone of India's news and filings from the site's own sentiment scores, and world headlines from
Google News scored by the same model. It describes what was published; it never says where the market will go."""
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

from finlit.lab import mood as M
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration
RSS = (Path(__file__).parent / "fixtures/global/google_news_crude.xml").read_text()   # a real answer of 26 Nov 2026, three items kept


def test_bands_and_the_mood_index():
    assert [M.band(s) for s in (0.5, 0.1, 0.09, -0.09, -0.1, None)] == ["positive", "positive", "neutral", "neutral", "negative", "neutral"]
    assert M.tally([0.6, 0.2, 0.0, -0.3]) == {"pos": 2, "neg": 1, "neu": 1, "total": 4, "index": 25}
    assert M.tally([])["index"] is None


def test_days_are_counted_oldest_first_and_never_past_today():
    rows = [{"d": date(2026, 11, 25), "score": 0.5}, {"d": date(2026, 11, 24), "score": -0.5}, {"d": date(2026, 11, 25), "score": 0.0},
            {"d": date(2026, 11, 27), "score": 0.9}]
    got = M.by_day(rows, date(2026, 11, 26))
    assert [d["day"] for d in got] == ["2026-11-24", "2026-11-25"] and got[1]["index"] == 50 and got[0]["index"] == -100


def test_google_news_items_lose_the_source_suffix_and_keep_their_time():
    items = M.parse_rss(RSS)
    assert len(items) == 3
    assert items[0]["title"] == "Oil futures: Crude at 3-wk high on fresh round of Gulf attacks"
    assert items[0]["source"] == "Quantum Commodity Intelligence" and items[0]["at"] == "2026-11-26T18:34+00:00"
    assert items[0]["link"].startswith("https://news.google.com/rss/articles/")
    assert M.parse_rss("<not xml") == []


class FakeScore:
    def __init__(self, s):
        self.score = s


class Scorer:
    def __init__(self):
        self.seen = []

    def score(self, texts):
        self.seen += texts
        return [FakeScore(-0.7 if "attack" in t.lower() else 0.4) for t in texts]


@pg
async def test_world_headlines_are_scored_once_kept_48_hours_and_the_route_is_for_lab_members(app):  # noqa: F811
    store = app.state.store
    scorer = Scorer()
    now = datetime(2026, 11, 26, 19, 0, tzinfo=timezone.utc)

    def h(req):
        return httpx.Response(200, text=RSS) if "crude" in req.url.params["q"] else httpx.Response(503)
    async with httpx.AsyncClient(transport=httpx.MockTransport(h)) as c:
        out = await M.refresh_world(store, client=c, scorer=scorer, now=now)
        assert out["status"] == "ok" and out["scored"] == 3 and "crude" not in out["failed"] and len(out["failed"]) == len(M.TOPICS) - 1
        again = await M.refresh_world(store, client=c, scorer=scorer, now=now + timedelta(minutes=30))
    assert again["scored"] == 0 and len(scorer.seen) == 3                     # a headline already scored is not scored again
    async with store.pool.acquire() as conn:
        late = await M.refresh_world(store, client=httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(503))),
                                     scorer=scorer, now=now + timedelta(hours=60))
        from finlit.macro import get_meta
        kept = await get_meta(conn, M.WORLD_KEY)
    assert late["status"] == "failed" and kept["topics"]["crude"]["items"] == []   # older than 48 hours: gone

    member = await signed_in(app, "mood-member@example.com", plan="gold")
    assert (await member.get("/api/lab/mood")).status_code == 403
    admin = await admin_with_mfa(app, "mood-boss@example.com")
    body = (await admin.get("/api/lab/mood")).json()
    assert set(body) == {"india", "world", "asOf", "notes"} and body["india"]["days"] == []
    assert any("news-sentiment" in n for n in body["notes"])


def test_the_world_view_counts_the_last_day_per_topic():
    now = datetime(2026, 11, 26, 19, 0, tzinfo=timezone.utc)
    kept = {"at": now.isoformat(), "topics": {"crude": {"name": "Crude oil", "items": [
        {"title": "a", "at": (now - timedelta(hours=2)).isoformat(), "score": 0.5},
        {"title": "b", "at": (now - timedelta(hours=5)).isoformat(), "score": -0.6},
        {"title": "c", "at": (now - timedelta(hours=30)).isoformat(), "score": -0.9}]}}}
    v = M.world_view(kept, now)
    t = v["topics"][0]
    assert t["key"] == "crude" and t["total"] == 2 and t["index"] == 0 and [i["band"] for i in t["items"]] == ["positive", "negative"]
    assert M.world_view(None, now) is None


def test_nothing_in_the_answer_reads_as_a_forecast():
    text = (Path(M.__file__).read_text()).lower()
    for w in ("will rise", "will fall", "bullish", "bearish", "buy ", "sell "):
        assert w not in text
