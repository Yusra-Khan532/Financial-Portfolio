"""Discovery signals (task #221 upgrade, owner 18 Nov 2026: "the same bucketing for all other companies' news coming in our documents section",
"sentiment kind of analysis"): every exchange filing FinLit stores (feed_items: news, results filings, documents) gets
  - an EVENT type, from NSE's own category and the headline (order win, capacity / commissioning, acquisition / merger, partnership / MoU,
    fund raising, credit rating, results, management change, legal / regulatory, default / delay, payout, investor meet, other);
  - the Discovery THEMES its headline names (keywords.themes_in: the same 21 buckets and concepts as the presentations);
  - a TONE of +1, 0 or -1: the event's usual direction (an order won +1, a penalty -1, a credit rating by the words up / down), else the
    headline's own finance words. It describes what was filed, nothing more.
Database only (no download): the nightly job tags the filings of the last 180 days that are not tagged yet."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from . import keywords as K

LOOKBACK_DAYS = 180
VERSION_KEY = "discovery:signals:version"

# (event, label, tone, pattern over "category | headline"); the first match wins, so the specific ones come first.
EVENTS: List[Tuple[str, str, int, re.Pattern]] = [
    ("default", "Default / payment delay", -1, re.compile(r"\b(default|delay in (?:payment|servicing)|non-payment|insolvency|ibc|nclt admit\w*)\b", re.I)),
    ("legal", "Legal / regulatory action", -1, re.compile(r"\b(penalt(?:y|ies)|show cause|litigation|fined|tax demand|demand order|sebi order|"
                                                       r"adjudicat\w*|arbitration|court|search and seizure|raid|suspension|disput\w*)\b", re.I)),
    ("rating", "Credit rating", 0, re.compile(r"\bcredit rating|\brating\b", re.I)),
    ("order", "Order win", 1, re.compile(r"\b(bagging|receiving of orders?|orders? (?:received|win|won|bagged|worth)|contracts? (?:awarded|won|received|worth)|"
                                         r"letter of award|\bloa\b|work order|purchase order|l1 bidder|lowest bidder|"
                                         r"(?:wins?|won|bags?|bagged|secures?|secured|receives?|received)\b.{0,60}\b(?:orders?|contracts?))\b", re.I)),
    ("capacity", "Capacity / commissioning", 1, re.compile(r"\b(commission\w*|commercial (?:production|operation)|capacity (?:expansion|addition)|"
                                                          r"new (?:plant|facility|unit)|capex|expansion project|start of production)\b", re.I)),
    ("mna", "Acquisition / merger", 0, re.compile(r"\b(acqui\w+|amalgamation|merger|scheme of arrangement|demerger|takeover|open offer|divest\w*|"
                                                  r"sale of (?:stake|business|undertaking)|slump sale)\b", re.I)),
    ("partnership", "Partnership / MoU", 0, re.compile(r"\b(joint venture|\bjv\b|strategic (?:partnership|alliance)|mou|memorandum of understanding|"
                                                       r"collaborat\w*|tie[- ]up|agreement with)\b", re.I)),
    ("fundraise", "Fund raising / allotment", 0, re.compile(r"\b(allotment|preferential|qip|qualified institutions? placement|rights issue|warrants?|"
                                                            r"debentures?|ncds?|fund raising|raising of funds|private placement|conversion)\b", re.I)),
    ("payout", "Dividend / buyback / bonus", 1, re.compile(r"\b(dividend|buy[- ]?back|bonus|stock split|sub-division)\b", re.I)),
    ("results", "Results", 0, re.compile(r"\b(financial results|results for|quarterly results|audited results|unaudited)\b", re.I)),
    ("management", "Management change", 0, re.compile(r"\b(resign\w*|change in (?:director|management|kmp|auditor)|appoint\w*|cessation|"
                                                      r"re-?designation|chief executive|managing director)\b", re.I)),
    ("meet", "Investor meet / presentation", 0, re.compile(r"\b(analysts?|institutional investor|investor (?:meet|presentation|call)|con\.? call|"
                                                           r"earnings call|presentation|transcript)\b", re.I)),
]
OTHER = ("other", "Other filing", 0)
EVENT_LABEL = {e[0]: e[1] for e in EVENTS} | {OTHER[0]: OTHER[1]}
RATING_UP = re.compile(r"\b(upgrad\w*|revised (?:to|upward)\w*|positive outlook|outlook (?:revised )?to positive)\b", re.I)
RATING_DOWN = re.compile(r"\b(downgrad\w*|negative outlook|outlook (?:revised )?to negative|watch with negative|withdrawn)\b", re.I)
RESIGN_TOP = re.compile(r"\bresign\w*\b.*\b(auditor|chief executive|ceo|cfo|chief financial|managing director|md)\b|"
                        r"\b(auditor|chief executive|ceo|cfo|chief financial|managing director)\b.*\bresign\w*", re.I)


# NSE headlines: "<Company> Limited has informed the Exchange about <category>". Themes are read only from what the filing says about the business,
# never from the company's own name ("Emmvee Photovoltaic Power Ltd", "Om Power Transmission Ltd") or NSE's category label ("Capacity addition" is
# filed for hotel rooms and hospital beds too): found live on 18 Nov 2026, the first night's run.
BOILER = re.compile(r"^.*?\bhas informed the exchange\s+(?:about|regarding|that|on)?\s*", re.I)
TAG_VERSION = "2"     # bump to re-tag every stored filing once (the rules changed)


def subject_of(title: str, category: Optional[str], company: Optional[str] = None) -> str:
    """The words of a filing that describe the business: the headline without the company's name, NSE's boilerplate and its category label."""
    t = title or ""
    if company:
        t = re.sub(re.escape(company), " ", t, flags=re.I)
    t = BOILER.sub("", t)
    t = re.sub(r"^a press release\b.*?\btitled\s*", "", t, flags=re.I)
    t = re.sub(r"^[^:]{0,60}:\s*", "", t) if category and t.lower().startswith(category.lower()) else t   # "Press Release: ..." -> its title
    if category:
        t = re.sub(r"(?<![A-Za-z])" + re.escape(category.strip()) + r"(?![A-Za-z])", " ", t, flags=re.I)
    t = re.sub(r"\b[A-Z][A-Za-z&.\-]*(?:\s+[A-Z][A-Za-z&.\-]*)*\s+(?:Limited|Ltd\.?)\b", " ", t)       # any other company's name
    return " ".join(t.split()).strip(" .,'\"")


def tag(category: Optional[str], title: str, summary: Optional[str] = None, company: Optional[str] = None) -> Dict[str, Any]:
    """One filing -> {event, label, tone, themes {bucket: [concepts]}, stage}. The event reads NSE's category and the headline; the themes and the
    stage read only what the filing says about the business (subject_of)."""
    text = f"{category or ''} | {title or ''}"
    full = f"{text} {summary or ''}" if summary and summary != "None" else text
    event, label, t = OTHER
    for name, lab, base, rx in EVENTS:
        if rx.search(text):
            event, label, t = name, lab, base
            break
    if event == "rating":
        t = 1 if RATING_UP.search(full) else -1 if RATING_DOWN.search(full) else 0
    elif event == "management" and RESIGN_TOP.search(full):
        t = -1
    elif t == 0 and event not in ("rating",):
        pos, neg = len(K.POSITIVE.findall(full)), len(K.NEGATIVE.findall(full))
        t = 1 if pos > neg else -1 if neg > pos else 0
    subject = subject_of(title, category, company)
    if summary and summary != "None":
        subject = f"{subject} {summary}"
    return {"event": event, "label": label, "tone": t, "themes": K.themes_in(subject) if subject else {}, "stage": K.stage_of(subject) if subject else None}


PENDING_SQL = """
SELECT f.id, f.kind, f.title, f.symbol, f.company, f.link, f.item_date, f.category, f.summary
FROM feed_items f
LEFT JOIN discovery_signals s ON s.feed_id = f.id
WHERE s.feed_id IS NULL AND f.symbol IS NOT NULL AND f.item_date >= current_date - $1::int
ORDER BY f.item_date DESC, f.id DESC
LIMIT $2
"""
INSERT_SQL = """
INSERT INTO discovery_signals (feed_id, symbol, item_date, kind, event, tone, themes, stage, title, link)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (feed_id) DO NOTHING
"""


async def tag_new(store, limit: int = 20000) -> Dict[str, Any]:
    """Tag the filings of the last 180 days not tagged yet (database only, seconds), and forget tags older than the window."""
    async with store.pool.acquire() as conn:
        retag = False
        try:
            retag = (await store.redis.get(VERSION_KEY)) not in (TAG_VERSION, TAG_VERSION.encode())
        except Exception:   # nosec B110 - without Redis the stored tags stay; new filings are still tagged
            pass
        if retag:            # the rules changed: every stored filing is tagged again with them (database only, seconds)
            await conn.execute("TRUNCATE discovery_signals")
        rows = await conn.fetch(PENDING_SQL, LOOKBACK_DAYS, limit)
        out = []
        events: Dict[str, int] = {}
        for r in rows:
            t = tag(r["category"], r["title"], r["summary"], r["company"])
            events[t["event"]] = events.get(t["event"], 0) + 1
            out.append((r["id"], r["symbol"], r["item_date"], r["kind"], t["event"], t["tone"], sorted(t["themes"]), t["stage"], r["title"][:400], r["link"]))
        if out:
            await conn.executemany(INSERT_SQL, out)
        gone = await conn.execute("DELETE FROM discovery_signals WHERE item_date < current_date - $1::int", LOOKBACK_DAYS)
    if retag:
        try:
            await store.redis.set(VERSION_KEY, TAG_VERSION)
        except Exception:   # nosec B110 - tried again next run
            pass
    return {"tagged": len(out), "events": events, "dropped": int(gone.split()[-1]) if gone else 0, "retagged": retag}
