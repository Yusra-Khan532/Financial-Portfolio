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
