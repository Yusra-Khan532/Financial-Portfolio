"""Which listed companies a question names ("prism score of jsw steels?", "How is TCS doing?"), so their company cards are read before the model starts:
whatever the wording, the answer starts from what the company page shows, in one round.

Conservative on purpose (a wrong company would be worse than none; the model can still search):
  - a company's name, without Ltd / Limited / the trailing words of its legal name, appears in the question as whole words (a plural is fine: "steels");
  - or its NSE symbol is written in capitals ("TCS", "M&M") or contains a digit;
  - longer names win over shorter ones inside them ("Tata Motors" over "Tata"), and at most `limit` companies are taken.
The company list is the website's own search index (the same names and symbols as the search box), kept in memory for an hour."""

from __future__ import annotations

import re
import time
from typing import Dict, List, Optional, Tuple

from ..mcp.gateway import Gateway, ToolError

TTL = 3600.0
_cache: Dict[str, object] = {"at": 0.0, "names": [], "symbols": set()}
_TAIL = re.compile(r"\b(limited|ltd|the|corporation|corp|company|inc|plc)\b\.?", re.I)    # never "india": "Coal India" must not become "coal"
_WORD = re.compile(r"[a-z0-9&]+")


# Words that also describe whole groups of companies ("indian banks", "life insurance companies"): a LOOSE match (a plural, or a short name) must
# have at least one word outside this list, so "indian banks" never becomes the company Indian Bank. An exact full name still matches ("coal india").
COMMON = set("""indian india national state bank banks life insurance general power steel oil gas energy finance financial capital auto metal metals cement
pharma chemical chemicals textile textiles sugar paper tea coal gold silver sun star new global united central union city first max money housing home
infra infrastructure industries industrial engineering electric electricals construction realty estate investment investments services tech technologies
software systems solutions products foods agro paints tyres motors ports airlines hotels hospital hospitals healthcare health bharat hindustan of & co""".split())
_SAME = {"pharmaceutical": "pharma", "pharmaceuticals": "pharma", "and": "&"}     # words people shorten ("Sun Pharma", "Adani Ports & SEZ")


# Task #255: the short names people use for the best-known companies ("what does Reliance's presentation say", "tvs ki ppt"). Each is the company the
# market means by that word; used only when its symbol is in the company list, after the full names (a longer name, e.g. "reliance power", wins).
ALIASES = {"reliance": "RELIANCE", "ril": "RELIANCE", "tvs": "TVSMOTOR", "tvs motors": "TVSMOTOR", "hul": "HINDUNILVR", "l&t": "LT", "larsen": "LT",
           "sbi": "SBIN", "airtel": "BHARTIARTL", "m&m": "M&M", "mahindra": "M&M", "infy": "INFY", "kotak": "KOTAKBANK", "maruti": "MARUTI",
           "nestle": "NESTLEIND", "bajaj finance": "BAJFINANCE", "bajaj auto": "BAJAJ-AUTO", "hdfc bank": "HDFCBANK", "icici bank": "ICICIBANK",
           "axis bank": "AXISBANK", "itc": "ITC", "tcs": "TCS", "wipro": "WIPRO", "ongc": "ONGC", "ntpc": "NTPC", "bel": "BEL", "hal": "HAL",
           "bhel": "BHEL", "irctc": "IRCTC", "zomato": "ETERNAL", "eternal": "ETERNAL", "paytm": "PAYTM", "nykaa": "NYKAA", "titan": "TITAN",
           "asian paints": "ASIANPAINT", "ultratech": "ULTRACEMCO", "jsw steel": "JSWSTEEL", "tata steel": "TATASTEEL", "tata motors": "TMCV",
           "sun pharma": "SUNPHARMA", "dr reddy": "DRREDDY", "dr reddys": "DRREDDY", "adani ports": "ADANIPORTS", "adani green": "ADANIGREEN",
           # task #279 (20 Nov 2026, "why is icici low on last quarter" asked on HCLTECH's page): the one word the market uses for the bank of a
           # group of listed companies; a longer name in the question ("icici prudential", "hdfc life") still wins
           "icici": "ICICIBANK", "hdfc": "HDFCBANK", "pnb": "PNB", "lic": "LICI", "idfc first": "IDFCFIRSTB"}


def norm(text: str) -> str:
    """Lower case words with punctuation dropped: 'Larsen & Toubro Ltd.' -> 'larsen & toubro ltd'; 'Sun Pharmaceutical' -> 'sun pharma'."""
    return " ".join(_SAME.get(w, w) for w in _WORD.findall((text or "").lower()))


def name_key(name: str) -> str:
    """The name as people write it: legal endings dropped ('JSW Steel Ltd' -> 'jsw steel', 'Reliance Industries Limited' -> 'reliance industries')."""
    key = norm(_TAIL.sub(" ", name or ""))
    one_word = " " not in key
    return key if (len(key) >= 5 if one_word else len(key) >= 4) else ""      # a one-word name needs 5 letters ("wipro", "titan")


def distinctive(key: str) -> bool:
    return any(w not in COMMON for w in key.split())


def index_from(rows: List[list]) -> Tuple[List[Tuple[str, str, bool]], set]:
    """(name key, symbol, loose) longest first; `loose` marks a short name (the first two words), matched only when distinctive."""
    names: List[Tuple[str, str, bool]] = []
    short: Dict[str, set] = {}
    for r in rows:
        sym, name = str(r[0]).upper(), str(r[1] or "")
        key = name_key(name)
        if key:
            names.append((key, sym, False))
            w = key.split()
            if len(w) > 2 and len(w[0]) >= 3:              # "maruti suzuki india" is written "maruti suzuki"; "adani ports & special ..." "adani ports"
                short.setdefault(" ".join(w[:2]), set()).add(sym)
    full = {k for k, _, _ in names}
    names += [(k, next(iter(v)), True) for k, v in short.items() if len(v) == 1 and k not in full and len(k) >= 8]   # only when no other company starts the same way
    # Task #255: a distinctive first word only one listed company starts with ("sansera" for Sansera Engineering), as a loose name
    first: Dict[str, set] = {}
    for key, sym, _ in list(names):
        w = key.split()
        if len(w) >= 2:
            first.setdefault(w[0], set()).add(sym)
    taken_keys = {k for k, _, _ in names}
    names += [(w, next(iter(v)), True) for w, v in first.items() if len(v) == 1 and len(w) >= 6 and w not in COMMON and w not in taken_keys]
    names.sort(key=lambda x: -len(x[0]))              # longest first, so "tata motors" is tried before "tata"
    return names, {str(r[0]).upper() for r in rows}


async def load(gw: Gateway) -> Tuple[List[Tuple[str, str, bool]], set]:
    if time.monotonic() - float(_cache["at"]) < TTL and _cache["names"]:
        return _cache["names"], _cache["symbols"]     # type: ignore[return-value]
    idx = await gw.json("/api/stocks/search-index", subject="The company list")
    names, symbols = index_from(idx.get("rows") or [])
    _cache.update(at=time.monotonic(), names=names, symbols=symbols)
    return names, symbols


def find(question: str, names: List[Tuple[str, str, bool]], symbols: set, limit: int = 2) -> List[str]:
    q = norm(question)
    words = q.split()
    singular = " ".join(w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in words)   # "jsw steels" -> "jsw steel"
    exact, plural = f" {q} ", f" {singular} "
    found: List[str] = []
    taken: List[str] = []
    for key, sym, loose in names:
        if len(found) >= limit:
            break
        needle = f" {key} "
        hit = (needle in exact and not loose) or ((needle in plural or needle in exact) and distinctive(key))
        if hit and not any(key in t for t in taken) and sym not in found:
            found.append(sym)
            taken.append(key)
    for alias, sym in sorted(ALIASES.items(), key=lambda x: -len(x[0])):
        if len(found) >= limit:
            break
        english = f" {alias} on " in exact or f" {alias} upon " in exact        # "reliance on imports" is the English word, not the company
        if sym in symbols and sym not in found and not english and (f" {alias} " in exact or f" {alias} " in plural) and not any(alias in t for t in taken):
            found.append(sym)
            taken.append(alias)
    for tok in re.findall(r"[A-Za-z0-9&]+", question or ""):
        if len(found) >= limit:
            break
        up = tok.upper()
        if up in symbols and up not in found and len(up) >= 2 and (tok.isupper() or any(c.isdigit() for c in tok)):
            found.append(up)
    return found


async def named_in(gw: Gateway, question: str, limit: int = 2, skip: Optional[str] = None) -> List[str]:
    """The symbols of the companies the question names (not counting `skip`, the page's own company). An unreadable list means none: the model searches."""
    try:
        names, symbols = await load(gw)
    except ToolError:
        return []
    return [s for s in find(question, names, symbols, limit + (1 if skip else 0)) if s != skip][:limit]


# Task #279: the business groups people name with one word ("adani group debt", "tata results", "icici"): several listed companies start with it, so
# no single company is picked, but the question is about that group, not the page's company. A curated list: an open rule took ordinary words
# ("best", "quality", "real", "prime", "net") for companies, and FinLit's own "prism" for Prism Johnson.
GROUPS = set("""icici hdfc tata adani bajaj birla aditya reliance mahindra godrej jindal kotak bharti vedanta piramal muthoot kirloskar torrent zydus
shriram cholamandalam lodha oswal apollo dalmia hero hinduja murugappa ambuja jsw lupin cipla wipro infosys sbi lic idfc bandhan rattanindia
indiabulls emami dabur marico usha raymond""".split())


def group_word(question: str, names: List[Tuple[str, str, bool]], skip: Optional[str] = None) -> Optional[str]:
    """Task #279: a business group's name ("icici", "tata", "adani", "bajaj") that starts the names of two or more listed companies: the question is
    about a company, just not one named precisely enough to pick. Not when that word starts the page company's own name (on Tata Steel's page,
    "tata" is that company). None when there is no such word."""
    first: Dict[str, set] = {}
    for key, sym, _ in names:
        w = key.split()
        if w and w[0] in GROUPS:
            first.setdefault(w[0], set()).add(sym)
    own = {k.split()[0] for k, sym, _ in names if sym == skip and k}
    for w in norm(question).split():
        if len(first.get(w, ())) >= 2 and w not in own:
            return w
    return None


async def other_group(gw: Gateway, question: str, skip: Optional[str] = None) -> Optional[str]:
    """group_word against the company list; None when the list cannot be read."""
    try:
        names, _ = await load(gw)
    except ToolError:
        return None
    return group_word(question, names, skip)


_STRONG = re.compile(r"\b(this|that|the same) (company|stock|share|firm|business|page|one)\b|\bhere\b", re.I)
_WEAK = re.compile(r"\b(its|it'?s|it|this)\b", re.I)


def points_at_page(question: str, strong_only: bool = False) -> bool:
    """Task #279: the question points at the company of the page. Strong: "this company", "this stock", "here". Weak (also): "its margins", "how is
    it doing", which in a follow-up mean the company the conversation is about."""
    q = question or ""
    return bool(_STRONG.search(q)) or (not strong_only and bool(_WEAK.search(q)))
