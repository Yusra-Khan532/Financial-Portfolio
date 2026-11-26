"""Trading Lab > Market mood (docs/GLOBAL-MARKETS.md, step 2; founder, 26 Nov 2026: "what is going on in the market ... news, sentiment").

Two parts, both from the financial-news language model FinLit already runs (finlit/sentiment.py, task #365):

  * India: every news item and exchange filing on the site already carries a score from -1 (clearly negative) to +1 (clearly positive). Per
    day over the last 30 days: how many items were positive (score >= +0.1), neutral, negative (<= -0.1), and the mood index
    = (positive - negative) / all x 100, from -100 to +100. The same for each sector over the last 7 days, and the most positive and most
    negative items of the last 3 days.
  * World: headlines from Google News for a fixed list of topics that move Indian markets (the Fed, crude oil, the dollar and rupee, US and
    Chinese markets, foreign investors in India, ...). The `market-mood` job reads them every 30 minutes in the day, scores each headline
    with the same model and keeps the last 48 hours per topic (macro_meta "mood:world"). The founder's decision of 26 Nov 2026 (internal,
    invite-only Lab) covers reading the headlines; FinLit names itself in the User-Agent.

It describes the tone of what was published. It never says where the market will go: that would be a forecast (the describe-only rule).
"""
from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET  # nosec B405 - the RSS is parsed without DTDs or entities (ElementTree does not resolve external entities)
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional, Tuple

import httpx
import orjson
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from ..auth.service import Ctx
from ..dhan import IST
from .access import lab_ctx

log = logging.getLogger("finlit.lab.mood")
router = APIRouter()

POS, NEG = 0.1, -0.1                 # the sentiment plan's neutral band edges (finlit/sentiment.band)
DAYS, SECTOR_DAYS, TOP_DAYS, TOP_N = 30, 7, 3, 6
GN_URL = "https://news.google.com/rss/search"
WORLD_KEY = "mood:world"
KEEP_HOURS = 48
TOPICS: List[Tuple[str, str, str]] = [
    ("india", "Indian markets", "Sensex OR Nifty OR \"Indian stock market\""),
    ("fii", "Foreign investors in India", "FII OR FPI India equities"),
    ("rbi", "RBI and rupee", "RBI OR rupee dollar"),
    ("fed", "US Federal Reserve", "\"Federal Reserve\" OR Fed rates"),
    ("us", "US stock market", "\"Wall Street\" OR \"S&P 500\" OR Nasdaq stocks"),
    ("crude", "Crude oil", "crude oil OR Brent OR OPEC"),
    ("china", "China economy and markets", "China economy OR \"China stocks\""),
    ("global", "Global economy", "\"global economy\" OR recession OR inflation"),
]
# The Global switch (founder, 26 Nov 2026: "the same things for the global market"): US sectors, read by the same job, US English edition.
US_TOPICS: List[Tuple[str, str, str]] = [
    ("us_tech", "US technology", "Nvidia OR Apple OR Microsoft OR \"tech stocks\""),
    ("us_banks", "US banks and finance", "JPMorgan OR \"bank stocks\" OR \"Goldman Sachs\""),
    ("us_energy", "US energy", "Exxon OR Chevron OR \"energy stocks\""),
    ("us_health", "US healthcare", "\"Eli Lilly\" OR UnitedHealth OR \"healthcare stocks\""),
    ("us_consumer", "US consumer", "Amazon OR Walmart OR \"consumer stocks\""),
    ("us_industrials", "US industrials", "Boeing OR Caterpillar OR \"industrial stocks\""),
    ("us_auto", "Electric vehicles and autos", "Tesla OR \"electric vehicles\" OR \"auto stocks\""),
    ("us_crypto", "Crypto", "Bitcoin OR crypto"),
]
EDITION = {**{k: ("en-IN", "IN", "IN:en") for k, _n, _q in TOPICS}, **{k: ("en-US", "US", "US:en") for k, _n, _q in US_TOPICS}}


def band(score: Optional[float]) -> str:
    if score is None:
        return "neutral"
    return "positive" if score >= POS else "negative" if score <= NEG else "neutral"


def tally(scores: List[float]) -> dict:
    p = sum(1 for s in scores if s >= POS)
    n = sum(1 for s in scores if s <= NEG)
    t = len(scores)
    return {"pos": p, "neg": n, "neu": t - p - n, "total": t, "index": round((p - n) / t * 100) if t else None}


# ------------------------------------------------------------------------------------------------------------------ India (from the site's own feed)
DAILY_SQL = """
SELECT f.item_date AS d, s.score FROM feed_items f JOIN feed_sentiment s ON s.feed_id = f.id
WHERE f.item_date >= $1"""
SECTOR_SQL = """
SELECT COALESCE(NULLIF(c.sector, ''), 'Other') AS sector, s.score FROM feed_items f JOIN feed_sentiment s ON s.feed_id = f.id
LEFT JOIN companies c ON c.symbol = f.symbol
WHERE f.item_date >= $1 AND f.symbol IS NOT NULL"""
TOP_SQL = """
SELECT f.id, f.title, f.kind, f.symbol, COALESCE(c.name, f.company) AS company, c.nse_code, f.source, f.link, f.item_date, s.score
FROM feed_items f JOIN feed_sentiment s ON s.feed_id = f.id LEFT JOIN companies c ON c.symbol = f.symbol
WHERE f.item_date >= $1 ORDER BY s.score {dir}, f.item_date DESC, f.id DESC LIMIT $2"""


def by_day(rows: List[Any], today: date) -> List[dict]:
    days: Dict[date, List[float]] = {}
    for r in rows:
        days.setdefault(r["d"], []).append(float(r["score"]))
    return [{"day": d.isoformat(), **tally(v)} for d, v in sorted(days.items()) if d <= today]


async def india(conn, today: date) -> dict:
    rows = await conn.fetch(DAILY_SQL, today - timedelta(days=DAYS - 1))
    days = by_day(rows, today)
    srows = await conn.fetch(SECTOR_SQL, today - timedelta(days=SECTOR_DAYS - 1))
    sec: Dict[str, List[float]] = {}
    for r in srows:
        sec.setdefault(r["sector"], []).append(float(r["score"]))
    sectors = sorted(({"sector": k, **tally(v)} for k, v in sec.items() if len(v) >= 3), key=lambda s: (-(s["index"] or 0), s["sector"]))

    def item(r) -> dict:
        return {"id": r["id"], "title": r["title"], "kind": r["kind"], "company": r["company"], "symbol": r["nse_code"], "source": r["source"],
                "link": r["link"], "day": r["item_date"].isoformat(), "score": round(float(r["score"]), 2), "band": band(float(r["score"]))}
    since = today - timedelta(days=TOP_DAYS - 1)
    top_pos = [item(r) for r in await conn.fetch(TOP_SQL.format(dir="DESC"), since, TOP_N) if float(r["score"]) >= POS]
    top_neg = [item(r) for r in await conn.fetch(TOP_SQL.format(dir="ASC"), since, TOP_N) if float(r["score"]) <= NEG]
    week = tally([float(r["score"]) for r in rows if r["d"] > today - timedelta(days=7)])
    return {"days": days, "latest": days[-1] if days else None, "week": week, "sectors": sectors, "mostPositive": top_pos, "mostNegative": top_neg}


# ------------------------------------------------------------------------------------------------------------------ world (Google News, the job)
TAG = re.compile(r"<[^>]+>")


def parse_rss(text: str) -> List[dict]:
    """Google News RSS items: title (the " - Source" ending removed), source, link and publication time (UTC ISO)."""
    try:
        root = ET.fromstring(text)  # nosec B314 - see the import note
    except ET.ParseError:
        return []
    out = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        source = (it.findtext("source") or "").strip()
        if source and title.endswith(" - " + source):
            title = title[: -len(source) - 3].strip()
        try:
            at = parsedate_to_datetime(it.findtext("pubDate") or "").astimezone(timezone.utc)
        except (TypeError, ValueError):
            continue
        if title:
            out.append({"title": TAG.sub("", title)[:300], "source": source[:80] or None, "link": (it.findtext("link") or "").strip()[:500] or None,
                        "at": at.isoformat(timespec="minutes")})
    return out


async def refresh_world(store, client: Optional[httpx.AsyncClient] = None, scorer=None, now: Optional[datetime] = None) -> dict:
    """The `market-mood` job: each topic's headlines of the last day, scored, merged with what is kept (by link or title), the last 48 hours."""
    from ..macro import get_meta, set_meta
    from .. import sentiment
    now = now or datetime.now(timezone.utc)
    scorer = scorer or sentiment.model()
    if scorer is None:
        return {"status": "skipped", "reason": "the sentiment model is not in this image"}
    own = client is None
    client = client or httpx.AsyncClient(timeout=30, follow_redirects=True, headers={"User-Agent": "FinLit (finlitventures.com) market news"})
    async with store.pool.acquire() as conn:
        kept = (await get_meta(conn, WORLD_KEY)) or {}
    topics_out, failed, scored = {}, [], 0
    try:
        for key, name, query in TOPICS + US_TOPICS:
            hl, gl, ceid = EDITION[key]
            try:
                r = await client.get(GN_URL, params={"q": f"{query} when:1d", "hl": hl, "gl": gl, "ceid": ceid})
                fresh = parse_rss(r.text) if r.status_code == 200 else []
            except httpx.HTTPError:
                fresh = []
            if not fresh:
                failed.append(key)
            old = {(i.get("link") or i["title"]): i for i in (kept.get("topics", {}).get(key, {}).get("items") or [])}
            new = [i for i in fresh if (i.get("link") or i["title"]) not in old]
            if new:
                scores = scorer.score([i["title"] for i in new])
                for i, s in zip(new, scores):
                    i["score"] = round(s.score, 3) if s is not None else 0.0
                    old[i.get("link") or i["title"]] = i
                scored += len(new)
            cutoff = now - timedelta(hours=KEEP_HOURS)
            items = sorted((i for i in old.values() if datetime.fromisoformat(i["at"]) >= cutoff), key=lambda i: i["at"], reverse=True)[:60]
            topics_out[key] = {"name": name, "items": items}
    finally:
        if own:
            await client.aclose()
    body = {"topics": topics_out, "at": now.isoformat(timespec="minutes")}
    async with store.pool.acquire() as conn:
        await set_meta(conn, WORLD_KEY, body)
    ok = len(failed) < len(TOPICS) + len(US_TOPICS)
    return {"status": "ok" if ok else "failed", "scored": scored, "failed": failed, **({} if ok else {"error": "Google News did not answer for any topic"})}


def world_view(kept: Optional[dict], now: datetime, topics: Optional[List[Tuple[str, str, str]]] = None) -> Optional[dict]:
    if not kept or not kept.get("topics"):
        return None
    out = []
    day_ago = now - timedelta(hours=24)
    for key, name, _q in (topics or TOPICS):
        t = kept["topics"].get(key)
        if not t:
            continue
        recent = [i for i in t["items"] if datetime.fromisoformat(i["at"]) >= day_ago] or t["items"]
        out.append({"key": key, "name": name, **tally([i.get("score", 0.0) for i in recent]),
                    "items": [{**i, "band": band(i.get("score"))} for i in recent[:8]]})
    allscores = [i.get("score", 0.0) for t in out for i in t["items"]]
    return {"at": kept.get("at"), "topics": out, "overall": tally(allscores)}


@router.get("/api/lab/mood")
async def market_mood(request: Request, m: str = "india", _ctx: Ctx = Depends(lab_ctx)):
    """India: the site's own news and filings plus world topics. Global (?m=global): US sectors and world topics, no India panels."""
    from ..macro import get_meta
    now = datetime.now(timezone.utc)
    today = now.astimezone(IST).date()
    async with request.app.state.store.pool.acquire() as conn:
        kept = await get_meta(conn, WORLD_KEY)
        if m == "global":
            us = world_view(kept, now, US_TOPICS)
            world = world_view(kept, now)
            notes = [] if us else ["US sector headlines load every 30 minutes in the day; none is stored yet."]
            body = {"market": "global", "us": us, "world": world, "asOf": now.astimezone(IST).isoformat(timespec="seconds"), "notes": notes}
            return Response(content=orjson.dumps(body), media_type="application/json", headers={"Cache-Control": "no-store"})
        ind = await india(conn, today)
        world = world_view(kept, now)
    notes = []
    if not ind["days"]:
        notes.append("No scored news or filings in the last 30 days yet: the news-sentiment job scores them each night.")
    if world is None:
        notes.append("World headlines load every 30 minutes in the day; none is stored yet.")
    body = {"india": ind, "world": world, "asOf": now.astimezone(IST).isoformat(timespec="seconds"), "notes": notes}
    return Response(content=orjson.dumps(body), media_type="application/json", headers={"Cache-Control": "no-store"})
