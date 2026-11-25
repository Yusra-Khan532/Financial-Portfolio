"""All my investments (task #137, 15 Nov 2026 pack): the member's shares, mutual funds and ETFs read together, looking through each fund and ETF to the
companies inside it.

Pure Python: no database, no network. Inputs are plain dicts gathered by api.py from the three lists the member already keeps (Equity portfolio,
MF portfolio, ETF portfolio) and from the data those portfolio pages already use.

Weights ("How the numbers are worked out", README of the pack):
- with quantities: value = quantity x last price (shares, ETFs) or units x NAV (funds); the share of everything is value / total;
- without quantities: each kind counts the same (1/3 each when all three are held, 1/2 with two kinds) and each holding counts the same inside its kind.
  Task #391 (developer file 35, fault 1): the money decides for every kind with at least one holding that has a quantity and a price (it used to decide
  only when EVERY holding of EVERY kind had one, so one fund without units sent all three kinds to 1/3). Inside such a kind a holding without a quantity
  weighs 0 in the split but stays listed and named (`noQuantity`); only a kind with no quantity at all takes the equal part (1/3 with three kinds), the
  kinds with values sharing the rest by value. `byValue` is true when every kind held has a value; the page says how many holdings are counted.

Look-through: your share of a company through a fund = your share of that fund x the company's weight in the fund's latest monthly file, added up across
funds, and the same way for ETFs. All together = direct + through funds + through ETFs. Every equity line of each file is counted.

Beta: each kind's beta is the value-weighted beta of its holdings against the Nifty 500 (the shares' beta is worked out by the Equity portfolio's own
calculation in api.py); beta together = sum of (share of money x beta of the kind); a kind's share of the market risk = (share x beta) / beta together.

Describes the past and the present mix; not a forecast and not a recommendation. Information only, not investment advice.
"""

from __future__ import annotations

import math
import re
from collections import defaultdict
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

KINDS = ("shares", "funds", "etfs")
PART_WORD = {"shares": "shares", "funds": "mutual funds", "etfs": "ETFs"}
QTY = {"shares": ("qty", "price"), "funds": ("units", "nav"), "etfs": ("qty", "price")}

# What it is made of (step 2): the five rows of the pack, plus "Other holdings" for lines that are none of them (REITs, InvITs, derivatives), shown only
# when a file has such lines, so the rows always add up to 100% of everything.
MIX_ROWS = (("indian", "Indian shares"), ("abroad", "Shares abroad"), ("gold", "Gold and silver"), ("debt", "Debt and cash"), ("other", "Other holdings"),
            ("notLoaded", "File not loaded yet"))
GOLD_RE = re.compile(r"\b(gold|silver)\b", re.I)
ABROAD_RE = re.compile(r"\b(foreign|overseas|international|global|nasdaq|s&p|us equity|world)\b", re.I)
TYPE_BUCKET = {"gold": "gold", "silver": "gold", "debt": "debt", "liquid": "debt", "international": "abroad"}   # an ETF whose kind fixes what it holds

# Company sizes by FinLit's one rupee rule (finlit/sizes.py, task #262): large above Rs 75,000 Cr, mid 25,000-75,000, small 10,000-25,000, micro below 10,000.
from ..sizes import SIZES as _FOUR, size_of as _size_of
SIZES = _FOUR + ("Listed abroad", "Not sized")   # task #262: four sizes (finlit/sizes.py), then the two that are not sized by FinLit

# The owner's beta bands (README step 6): the edge is the upper limit of each band. Task #391 (developer file 35, fault 7): the same six ranges as the
# shared scale (mfportfolio.bench.BANDS, the MF and ETF pages'), sent by KEY (less, defensive, similar, more, high, very_high) beside the word, so the page
# names each range from portfolio/shared/words.ts BETA_RANGE_WORD ("Much less sensitive" below 0.65, "Less sensitive" 0.65 to 0.90, ...), as the MF and
# ETF pages do. `band` and `bandLine` keep the scale's stored words until every reader has moved to the key; BAND_WORD and `bandSays` carry the new words.
from ..mfportfolio.bench import BANDS as _SCALE
BETA_BANDS = tuple((edge, word) for edge, _k, word in _SCALE)
BETA_KEYS = tuple((edge, key) for edge, key, _w in _SCALE)
BAND_WORD = {"less": "Much less sensitive", "defensive": "Less sensitive", "similar": "Similar", "more": "More sensitive", "high": "High", "very_high": "Very high"}
# Task #277 (live number fix 6): what each band says, so the word and the sentence under it come from the same band ("0.79 · Defensive" sat over "Similar moves")
SAYS = {"less": "moves much less than the market", "defensive": "moves a little less than the market", "similar": "moves about with the market",
        "more": "moves more than the market", "high": "moves much more than the market", "very_high": "moves far more than the market"}
BAND_SAYS = {word: SAYS[key] for _e, key, word in _SCALE}    # by the stored word (bandLine)


def band_line(beta: Optional[float]) -> Optional[str]:
    """"Defensive: moves a little less than the market. When the Nifty 500 moved 1%, this moved about 0.79%." (None without a beta). The stored word."""
    w = beta_band(beta)
    return None if w is None else f"{w}: {BAND_SAYS[w]}. When the Nifty 500 moved 1%, this moved about {beta:.2f}%."


def band_says(beta: Optional[float]) -> Optional[str]:
    """Task #391: the same sentence in the page's words: "Less sensitive: moves a little less than the market. When the Nifty 500 moved 1%, this moved
    about 0.79%." (None without a beta)."""
    k = beta_band_key(beta)
    return None if k is None else f"{BAND_WORD[k]}: {SAYS[k]}. When the Nifty 500 moved 1%, this moved about {beta:.2f}%."
RISK_RED_POINTS = 10.0     # Key figures: "red when the risk share is more than 10 points above the money share"

PEER_WORD = {"leader": "Leader", "in_line": "In line", "laggard": "Laggard"}
NOT_COMPARED, NOT_ON_LIST = "Not compared", "Not on your list"
TOP_TWO = {"Strong", "Healthy"}      # the top two bands of FinLit Prism, the FinLit IQ and the Fund Health Score
LISTED_ABROAD, NOT_CLASSIFIED = "Listed abroad", "Not classified"


def _num(v: Any) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else None


def r(v: Optional[float], dp: int = 2) -> Optional[float]:
    return None if v is None else round(v, dp)


def and_list(xs: Sequence[str]) -> str:
    """"A, B and C" (the site's list joiner, portfolio/shared/words.ts andList)."""
    xs = list(xs)
    return "".join(xs) if len(xs) <= 1 else ", ".join(xs[:-1]) + " and " + xs[-1]


# ------------------------------------------------------------------------------------------------ weights

def has_value(item: Dict[str, Any], qty_key: str, price_key: str) -> bool:
    """A holding counts in the money split when it has a quantity above 0 and a price above 0."""
    return (_num(item.get(qty_key)) or 0) > 0 and (_num(item.get(price_key)) or 0) > 0


def part_weights(items: Sequence[Dict[str, Any]], qty_key: str, price_key: str) -> Tuple[bool, Optional[float], List[float]]:
    """(valued, total value or None, each item's weight inside the kind). Task #391 (file 35, fault 1): valued when at least one item has a quantity
    and a price; the items without one weigh 0 (they stay in the lists). A kind with no value at all: each item counts the same."""
    if not items:
        return False, None, []
    vals = [(_num(i.get(qty_key)) or 0) * (_num(i.get(price_key)) or 0) if has_value(i, qty_key, price_key) else 0.0 for i in items]
    tot = sum(vals)
    if tot > 0:
        return True, tot, [v / tot for v in vals]
    return False, None, [1 / len(items)] * len(items)


def split_parts(shares: Sequence[Dict[str, Any]], funds: Sequence[Dict[str, Any]], etfs: Sequence[Dict[str, Any]] = ()) -> Dict[str, Any]:
    """The weight of each kind in everything, and how it was decided.
    `byValue`: every kind held has a value (then `total` is the rupee value of everything counted). `missing`: the kinds with no quantity at all (each
    takes the equal part, 1/3 with three kinds; the kinds with values share the rest by value). `noQuantity`: the holdings of a valued kind without a
    quantity or a price ({kind, i}: weight 0 in the split, still listed). Each kind's `counted` / `of`: how many of its holdings the split counts by value."""
    items = {"shares": shares, "funds": funds, "etfs": etfs}
    out: Dict[str, Any] = {}
    for k in KINDS:
        v, tot, w = part_weights(items[k], *QTY[k])
        n = sum(1 for i in items[k] if has_value(i, *QTY[k]))
        out[k] = {"valued": v, "value": tot, "w": w, "counted": n if v else 0, "of": len(items[k])}
    present = [k for k in KINDS if items[k]]
    valued = [k for k in present if out[k]["valued"]]
    missing = [k for k in present if not out[k]["valued"]]
    by_value = bool(present) and not missing
    equal = 1 / len(present) if present else 0.0
    worth = sum(out[k]["value"] or 0 for k in valued)
    rest = 1 - equal * len(missing)               # what the kinds with values share by value
    part = {k: (equal if k in missing else (out[k]["value"] or 0) / worth * rest if k in valued and worth else 0.0) for k in KINDS}
    no_qty = [{"kind": k, "i": j} for k in valued for j, i in enumerate(items[k]) if not has_value(i, *QTY[k])]
    return {"byValue": by_value, "total": worth if by_value else None, "part": part, "present": present, "missing": missing, "noQuantity": no_qty, **out}


# ------------------------------------------------------------------------------------------------ look-through

def abroad_isin(isin: Optional[str], item_class: Optional[str] = None) -> bool:
    """A share listed outside India: its ISIN is not Indian, or (no ISIN) it sits in an international fund or ETF."""
    return not str(isin).upper().startswith("IN") if isin else item_class == "international"


def line_key(h: Dict[str, Any]) -> str:
    """One company, however it is reached: its NSE symbol, else its ISIN, else its name."""
    if h.get("stockSymbol"):
        return str(h["stockSymbol"]).upper()
    if h.get("isin"):
        return "isin:" + str(h["isin"]).upper()
    return "name:" + re.sub(r"\s+", " ", str(h.get("name") or "").strip().lower())


def look_through(shares: Sequence[Dict[str, Any]], funds: Sequence[Dict[str, Any]], etfs: Sequence[Dict[str, Any]], split: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Every company counted once: its weight held directly, through funds and through ETFs (each as % of everything), largest first.
    shares: [{symbol, name}]; funds: [{code, short, holdings}]; etfs: [{symbol, assetClass, holdings}]; holdings: [{stockSymbol, isin, name, assetClass, pct,
    macroSector}] with pct as % of the fund's net assets. Only equity lines are companies; the rest of a fund sits in step 2."""
    rows: Dict[str, Dict[str, Any]] = {}

    def row(key: str, symbol: Optional[str], name: str, isin: Optional[str], abroad: bool) -> Dict[str, Any]:
        got = rows.get(key)
        if got is None:
            got = rows[key] = {"key": key, "symbol": symbol, "name": name, "isin": isin, "abroad": abroad, "macro": None,
                               "direct": 0.0, "funds": 0.0, "etfs": 0.0, "viaFunds": [], "viaEtfs": [], "onList": False}
        return got

    for s, w in zip(shares, split["shares"]["w"]):
        x = row(s["symbol"], s["symbol"], s.get("name") or s["symbol"], s.get("isin"), False)
        x["direct"] += split["part"]["shares"] * w * 100
        x["onList"] = True          # task #391 (fault 1): a share held without a quantity weighs 0 but is still held directly (lists, filters, What changed)
    for kind, items, via, ident in (("funds", funds, "viaFunds", "code"), ("etfs", etfs, "viaEtfs", "symbol")):
        for f, w in zip(items, split[kind]["w"]):
            share = split["part"][kind] * w
            if share <= 0:
                continue                # task #391 (fault 1): a fund or ETF without a quantity weighs 0, so its companies are not "held through" it
            for h in f.get("holdings") or []:
                pct = _num(h.get("pct"))
                if pct is None or pct <= 0 or (h.get("assetClass") or "equity") != "equity":
                    continue
                ab = abroad_isin(h.get("isin"), f.get("assetClass"))
                x = row(line_key(h), h.get("stockSymbol") and str(h["stockSymbol"]).upper(), h.get("name") or h.get("stockSymbol") or "", h.get("isin"), ab)
                x[kind] += share * pct
                if x["macro"] is None and h.get("macroSector"):
                    x["macro"] = h["macroSector"]
                if f.get(ident) not in x[via]:
                    x[via].append(f.get(ident))
    out = []
    for x in rows.values():
        x["all"] = x["direct"] + x["funds"] + x["etfs"]
        x["held"] = [m for m, k in (("D", "direct"), ("F", "funds"), ("E", "etfs")) if x[k] > 0 or (k == "direct" and x["onList"])]
        x["ways"] = len(x["held"])
        x["twice"] = x["ways"] >= 2
        out.append(x)
    return sorted(out, key=lambda x: (-x["all"], x["name"]))


THROUGH_MIN = 0.1   # task #277 change 19: a company held only through funds and ETFs joins What changed at 0.1% or more of everything


def changes_list(companies: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """Task #277 (change 19): the companies of "What changed at the companies you own": held directly, or 0.1% or more of everything through funds
    and ETFs. Listed in India only (Discover reads NSE filings); largest first."""
    ok = [c for c in companies if c.get("symbol") and not c.get("abroad")]
    return {"direct": [c["symbol"] for c in ok if direct_held(c)],
            "through": [c["symbol"] for c in ok if not direct_held(c) and c["all"] >= THROUGH_MIN]}


def direct_held(c: Dict[str, Any]) -> bool:
    """Held directly: on the member's share list (with or without a quantity: task #391, fault 1)."""
    return c["direct"] > 0 or bool(c.get("onList"))


def filter_counts(companies: Sequence[Dict[str, Any]]) -> Dict[str, int]:
    """The company table's four filters, each with its count."""
    return {"all": len(companies), "twice": sum(1 for c in companies if c["ways"] >= 2),
            "through": sum(1 for c in companies if not direct_held(c) and c["ways"] == 1), "direct": sum(1 for c in companies if direct_held(c) and c["ways"] == 1)}


def peer_word(raw: Optional[str], direct: bool) -> str:
    """Leader / In line / Laggard, never the stored code; "Not compared" for a share on the list without a label; "Not on your list" for a company held
    only through funds and ETFs."""
    if not direct:
        return NOT_ON_LIST
    return PEER_WORD.get(str(raw or "").strip().lower().replace(" ", "_"), NOT_COMPARED)


def fund_overlap(funds: Sequence[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The highest overlap between two of the member's funds: the share of net assets in the same companies, sum over common companies of the smaller weight."""
    best = None
    eq = [(f, {line_key(h): _num(h.get("pct")) or 0 for h in f.get("holdings") or [] if (h.get("assetClass") or "equity") == "equity"}) for f in funds]
    for i in range(len(eq)):
        for j in range(i + 1, len(eq)):
            a, b = eq[i][1], eq[j][1]
            common = set(a) & set(b)
            ov = sum(min(a[k], b[k]) for k in common)
            if common and (best is None or ov > best["pct"]):
                best = {"pct": round(ov, 1), "a": eq[i][0].get("short") or eq[i][0].get("name"), "b": eq[j][0].get("short") or eq[j][0].get("name"), "n": len(common)}
    return best


# ------------------------------------------------------------------------------------------------ what it is made of (step 2)

def line_bucket(h: Dict[str, Any], item_class: Optional[str]) -> str:
    cls = (h.get("assetClass") or "equity").lower()
    if cls == "equity":
        return "abroad" if abroad_isin(h.get("isin"), item_class) else "indian"
    name = str(h.get("name") or "")
    if GOLD_RE.search(name) and not str(h.get("isin") or "").startswith("INE"):
        return "gold"         # task #277 (fix 2): a silver ETF's file can put its silver under a cash heading; the metal is gold and silver whatever its class says
    if cls in ("debt", "cash"):
        return "debt"
    if GOLD_RE.search(name):
        return "gold"
    if ABROAD_RE.search(name):
        return "abroad"
    return "other"


def item_mix(item: Dict[str, Any]) -> Tuple[Dict[str, float], str]:
    """One fund's or ETF's split over the step-2 rows (fractions adding to 1) and how it was read: "file" (its monthly file), "type" (no file, but its kind
    fixes what it holds: a gold, silver, debt, liquid or international ETF) or "none" (no file: "File not loaded yet")."""
    hs = [h for h in item.get("holdings") or [] if (_num(h.get("pct")) or 0) > 0]
    tot = sum(_num(h.get("pct")) or 0 for h in hs)
    if hs and tot > 0:
        m: Dict[str, float] = defaultdict(float)
        for h in hs:
            m[line_bucket(h, item.get("assetClass"))] += (_num(h.get("pct")) or 0) / tot
        return dict(m), "file"
    t = TYPE_BUCKET.get(str(item.get("category") or "").lower()) or TYPE_BUCKET.get(str(item.get("assetClass") or "").lower())
    if t and item.get("kind") == "etfs":
        return {t: 1.0}, "type"
    return {"notLoaded": 1.0}, "none"


def made_of(shares: Sequence[Dict[str, Any]], funds: Sequence[Dict[str, Any]], etfs: Sequence[Dict[str, Any]], split: Dict[str, Any]) -> Dict[str, Any]:
    """Rows Indian shares, Shares abroad, Gold and silver, Debt and cash, (Other holdings), File not loaded yet; columns From shares, From mutual funds,
    From ETFs and All together, each as % of everything. Also each fund's and ETF's own split (the "How each fund and ETF splits" dropdown)."""
    cols = {k: defaultdict(float) for k in KINDS}
    if shares:
        cols["shares"]["indian"] += split["part"]["shares"] * 100       # the Equity portfolio holds NSE-listed shares
    each, not_loaded, by_type = [], [], []
    for kind, items in (("funds", funds), ("etfs", etfs)):
        for f, w in zip(items, split[kind]["w"]):
            m, how = item_mix({**f, "kind": kind})
            for b, x in m.items():
                cols[kind][b] += split["part"][kind] * w * x * 100
            name = f.get("short") or f.get("symbol") or f.get("name")
            if how == "none":
                not_loaded.append({"kind": kind, "name": name})
            elif how == "type":
                by_type.append({"kind": kind, "name": name})
            each.append({"kind": kind, "name": name, "how": how, "asOf": f.get("asOf"), "mix": {b: round(x * 100, 1) for b, x in m.items()}})
    rows = []
    for key, word in MIX_ROWS:
        vals = {k: cols[k].get(key, 0.0) for k in KINDS}
        tot = sum(vals.values())
        if key == "other" and tot <= 0:
            continue
        rows.append({"key": key, "label": word, **{k: round(v, 2) for k, v in vals.items()}, "all": round(tot, 2)})
    outside = sum(x["all"] for x in rows if x["key"] not in ("indian", "notLoaded"))
    return {"rows": rows, "each": each, "notLoaded": not_loaded, "byType": by_type, "outsideIndianShares": round(outside, 2)}


# ------------------------------------------------------------------------------------------------ macro sectors and sizes (step 3)

def macro_sectors(companies: Sequence[Dict[str, Any]], macro_of: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    """NSE's 12 macro sectors (plus "Listed abroad" and "Not classified"), each with % of everything from your shares, through funds and through ETFs.
    `macro_of`: {symbol: macro sector} from NSE's classification; a fund's own line (taxonomy.holding_level, in its file) fills the rest."""
    by: Dict[str, Dict[str, float]] = defaultdict(lambda: {"direct": 0.0, "funds": 0.0, "etfs": 0.0})
    for c in companies:
        sec = LISTED_ABROAD if c["abroad"] else (macro_of.get(c["symbol"] or "") or c.get("macro") or NOT_CLASSIFIED)
        for k in ("direct", "funds", "etfs"):
            by[sec][k] += c[k]
    out = [{"sector": s, **{k: round(v, 2) for k, v in d.items()}, "all": round(sum(d.values()), 2), "named": s not in (LISTED_ABROAD, NOT_CLASSIFIED)} for s, d in by.items()]
    return sorted(out, key=lambda x: (not x["named"], -x["all"], x["sector"]))


def size_of(cap_cr: Optional[float]) -> Optional[str]:
    """Large, Mid, Small or Micro on the site's one rule (finlit/sizes.py); None without a market value."""
    return _size_of(cap_cr)


def company_sizes(companies: Sequence[Dict[str, Any]], cap_of: Callable[[Dict[str, Any]], Optional[float]]) -> List[Dict[str, Any]]:
    """Large / Mid / Small / Micro (plus Listed abroad and Not sized), each with % of everything from your shares, through funds and through ETFs."""
    by: Dict[str, Dict[str, float]] = {s: {"direct": 0.0, "funds": 0.0, "etfs": 0.0} for s in SIZES}
    for c in companies:
        s = "Listed abroad" if c["abroad"] else (size_of(cap_of(c)) or "Not sized")
        c["size"] = s if s in _FOUR else None
        for k in ("direct", "funds", "etfs"):
            by[s][k] += c[k]
    return [{"size": s, **{k: round(v, 2) for k, v in d.items()}, "all": round(sum(d.values()), 2)} for s, d in by.items() if sum(d.values()) > 0 or s in _FOUR]


# ------------------------------------------------------------------------------------------------ health (step 5)

def weighted_mean(values: Sequence[Optional[float]], weights: Sequence[float]) -> Optional[float]:
    pairs = [(v, w) for v, w in zip(values, weights) if v is not None and w > 0]
    tw = sum(w for _, w in pairs)
    return sum(v * w for v, w in pairs) / tw if pairs and tw else None


def word_case(label: Optional[str]) -> Optional[str]:
    """Task #235 (the 18 Nov pack, live bug E2): Prism stores its labels in capitals ("HEALTHY"); the page and the band list use "Healthy"."""
    if not label or label.upper() == "NOT RATED":
        return None if not label else "Not rated"
    return label[:1].upper() + label[1:].lower()


def band_counts(labels: Sequence[Optional[str]], weights: Sequence[float], order: Sequence[str]) -> Dict[str, Any]:
    """{bands: [{label, count, share}], notRated, topTwoShare}: share = % of the kind (by value with quantities, by count without)."""
    labels = [word_case(l) for l in labels]
    tw = sum(weights) or 1
    out = [{"label": b, "count": sum(1 for l in labels if l == b), "share": round(sum(w for l, w in zip(labels, weights) if l == b) / tw * 100, 1)} for b in order]
    nr = [w for l, w in zip(labels, weights) if l not in order]
    return {"bands": out, "notRated": {"count": len(nr), "share": round(sum(nr) / tw * 100, 1)},
            "topTwoShare": round(sum(w for l, w in zip(labels, weights) if l in TOP_TWO) / tw * 100, 1)}


# ------------------------------------------------------------------------------------------------ risk (step 6)

def beta_band(beta: Optional[float]) -> Optional[str]:
    """The scale's stored word (kept for readers that have not moved to the key)."""
    return None if beta is None else next(w for edge, w in BETA_BANDS if beta < edge)


def beta_band_key(beta: Optional[float]) -> Optional[str]:
    """Task #391 (file 35, fault 7): the range's key on the shared scale (less, defensive, similar, more, high, very_high); the page names it."""
    return None if beta is None else next(k for edge, k in BETA_KEYS if beta < edge)


def kind_beta(betas: Sequence[Optional[float]], weights: Sequence[float]) -> Tuple[Optional[float], float]:
    """(the value-weighted beta of the holdings that have one, the share of the kind they cover in %)."""
    b = weighted_mean(betas, weights)
    cover = sum(w for v, w in zip(betas, weights) if v is not None) / (sum(weights) or 1) * 100
    return b, round(cover, 1)


def risk_together(kinds: Dict[str, Dict[str, Any]], total: Optional[float]) -> Dict[str, Any]:
    """kinds: {kind: {share (0..1), beta}} for the kinds held. Beta together = sum of share x beta; each kind's share of the market risk =
    (share x beta) / beta together. No figure when a kind with money has no beta (the reason names it), never a guess."""
    held = {k: v for k, v in kinds.items() if v.get("share")}
    missing = [k for k, v in held.items() if v.get("beta") is None]
    if not held:
        return {"beta": None, "why": "Nothing on your lists yet.", "parts": []}
    if missing:
        return {"beta": None, "band": None, "bandKey": None, "why": "No beta for your " + and_list([PART_WORD[k] for k in missing]) + " yet, so the figure for everything together cannot be added up.",
                "parts": [{"kind": k, "money": r(v["share"] * 100, 1), "beta": r(v.get("beta")), "riskShare": None, "red": False, "bandKey": beta_band_key(v.get("beta"))} for k, v in held.items()]}
    tog = sum(v["share"] * v["beta"] for v in held.values())
    parts = []
    for k, v in held.items():
        rs = v["share"] * v["beta"] / tog * 100 if tog else None
        parts.append({"kind": k, "money": r(v["share"] * 100, 1), "beta": r(v["beta"]), "band": beta_band(v["beta"]), "bandKey": beta_band_key(v["beta"]), "riskShare": r(rs, 1),
                      "red": rs is not None and rs > v["share"] * 100 + RISK_RED_POINTS})
    top = max(parts, key=lambda p: p["riskShare"] or 0)
    return {"beta": r(tog), "band": beta_band(r(tog)), "bandKey": beta_band_key(r(tog)), "bandLine": band_line(r(tog)), "bandSays": band_says(r(tog)), "why": None, "parts": parts, "largest": top["kind"],
            "fall10": {"pct": r(-tog * 10, 1), "value": r(-total * tog * 0.10, 0) if total else None}}
