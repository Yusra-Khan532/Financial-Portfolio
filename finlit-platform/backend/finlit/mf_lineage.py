"""Task #281 round 2: the whole NAV history of a scheme whose AMFI code changed when its fund house was taken over.

Why: when HSBC Mutual Fund took over L&T Mutual Fund's schemes in November 2022, AMFI gave the merged schemes new codes. HSBC Small Cap Fund (151130) was
L&T Emerging Businesses Fund (Direct Growth code 129220) until then, but FinLit's history of 151130 started on 28 Nov 2022, so its 5-year return, largest
fall and the Mutual Fund Score's long-window measures were blank for 42 HSBC Growth funds older than five years. The old codes stopped publishing; their
NAVs (2014 to 24 Nov 2022 for 129220) are still served by the public mirror of AMFI's data (api.mfapi.in), and the new code starts at the same NAV.

How a link is made (conservative: a wrong link would show a wrong return, so no link is better than a doubtful one):
1. Successors: active Growth schemes of a fund house in LINEAGE whose stored history starts well after the scheme's launch date (AMFI's own launch date,
   mf_facts.launch_date): the history was cut, not the fund new.
2. Candidates: codes on the mirror's scheme list whose names start with one of that house's predecessor names (for HSBC: "L&T" and "HSBC"), Growth
   options only, that are not active here. Each is asked for its last NAV once (kept in mf_lineage_cands).
3. continuity(): same plan (Direct / Regular), the old code's last NAV at most MAX_GAP_DAYS before the new code's first NAV, the two NAVs within
   MAX_GAP_PCT, and the same category when both are known. More than one candidate passing, and the closest not clearly closer than the rest -> no link.
4. The old code's full history is fetched and checked again on its real last NAV, then put BEFORE the successor's own history: no day the successor has
   is ever replaced. The returns, risk, month-end NAVs (SIP, fall, the score's inputs) are worked out again from the joined series.
A link is kept in mf_predecessors with its evidence; the fund page names the earlier scheme. A history rebuilt later without the earlier part is joined
again on the next run (`reapply`). Runs inside the nightly refresh-mf, time-limited, and carries on where it stopped on the next run."""
from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, List, Optional, Sequence, Tuple

import httpx

from . import mf

log = logging.getLogger("finlit.mf_lineage")

MIRROR_LIST_URL = "https://api.mfapi.in/mf"     # every code the mirror knows (about 38,000 names), stopped ones included
MAX_GAP_DAYS = 10            # old code's last NAV to new code's first NAV (a long weekend and a holiday around a transfer date)
MAX_GAP_PCT = 2.0            # % between the two NAVs: two or three days of market moves; a re-based unit (new face value) fails it
CLEAR_MARGIN = 3.0           # with several candidates passing, the closest must be this many times closer than the next, else no link
CUT_DAYS = 90                # a history starting more than this after the launch date was cut (a scheme's first NAV comes days after launch)
DIRECT_PLANS_FROM = date(2013, 2, 1)   # Direct plans began on 1 Jan 2013 and FinLit's history on 1 Apr 2006: a history starting before this date is not
                                       # a cut one (an older scheme's Direct plan, or a scheme older than the history), so it is not looked at

# Fund houses whose schemes changed codes in a takeover, and the names their earlier schemes carried (the mirror's names start with these).
LINEAGE: Dict[str, Dict[str, Any]] = {
    "hsbc": {"prefixes": ("L&T ", "L & T ", "L&T-", "HSBC "),
             "note": "HSBC Mutual Fund took over L&T Mutual Fund's schemes in November 2022; AMFI gave the merged schemes new codes."},
}


@dataclass
class Cand:
    old_code: int
    name: str
    house: Optional[str]
    category: Optional[str]
    plan: str
    option: str
    last_day: Optional[date]
    last_nav: Optional[float]


_LAST = re.compile(r"\s*[-\u2013]\s*")
_GROWTH = re.compile(r"(direct |regular )?(plan )?growth( option| plan)?")


def mirror_option(name: str) -> str:
    """Growth, IDCW or Other from a mirror name's last part. The mirror's older names join parts with a bare hyphen ('L&T India Value Fund-Regular
    Plan-Growth'), which mf.clean_option (it splits on ' - ' only) reads as 'not stated'; here any hyphen splits."""
    parts = [p for p in _LAST.split(name or "") if p.strip()]
    last = re.sub(r"\s+", " ", parts[-1]).strip().lower() if len(parts) > 1 else ""
    if last and mf._IDCW.search(last):
        return "IDCW"
    return "Growth" if last and _GROWTH.fullmatch(last) else "Other"


def house_key(amc: str) -> Optional[str]:
    stem = mf.house_stem(amc or "")
    return next((k for k in LINEAGE if stem == k or stem.startswith(k + " ")), None)


def _sub(category: Optional[str]) -> Optional[str]:
    """The sub-category key of an AMFI category name ('Equity Scheme - Small Cap Fund' and 'Equity Schemes - Small Cap Fund' both give the small-cap key);
    None when it cannot be told (old-style names land in a catch-all and are not compared)."""
    if not category:
        return None
    tab, key, _ = mf.classify(category)
    return None if key.endswith("-other") else key


def continuity(plan: str, category: Optional[str], first_day: date, first_nav: float, cands: Sequence[Cand]) -> Tuple[Optional[Cand], Optional[float], List[str]]:
    """(the candidate whose NAVs join the successor's, its gap in %, why each other candidate failed). The rule is in the module docstring."""
    passing: List[Tuple[float, Cand]] = []
    why: List[str] = []
    sub = _sub(category)
    for c in cands:
        if c.option != "Growth" or c.plan != plan:
            continue
        if c.last_day is None or c.last_nav is None or c.last_nav <= 0:
            continue
        gap_days = (first_day - c.last_day).days
        if not 0 < gap_days <= MAX_GAP_DAYS:
            continue
        gap = abs(first_nav / c.last_nav - 1) * 100
        if gap > MAX_GAP_PCT:
            why.append(f"{c.old_code} {c.name}: NAV {c.last_nav} on {c.last_day} vs {first_nav} ({gap:.1f}% apart)")
            continue
        csub = _sub(c.category)
        if sub and csub and sub != csub:
            why.append(f"{c.old_code} {c.name}: category {c.category} differs")
            continue
        passing.append((gap, c))
    if not passing:
        return None, None, why
    passing.sort(key=lambda t: t[0])
    if len(passing) > 1 and passing[1][0] < CLEAR_MARGIN * max(passing[0][0], 0.01):
        why.append("ambiguous: " + "; ".join(f"{c.old_code} {c.name} ({g:.2f}%)" for g, c in passing[:3]))
        return None, None, why
    return passing[0][1], passing[0][0], why


def join(own: Tuple[List[int], List[float]], earlier: Tuple[List[int], List[float]]) -> Tuple[List[int], List[float]]:
    """The earlier code's NAVs before the successor's first day, then the successor's own series unchanged (its days always win)."""
    days, navs = own
    if not days:
        return list(days), list(navs)
    cut = days[0]
    keep = [(d, v) for d, v in zip(*earlier) if d < cut]
    return mf.trim([d for d, _ in keep] + list(days), [v for _, v in keep] + list(navs))


def note_for(old_name: str, first: date) -> str:
    return f"Includes the NAV history of {old_name} before {first.day} {first.strftime('%b %Y')}, when AMFI gave the scheme a new code."


async def _mirror_names(client: httpx.AsyncClient) -> List[dict]:
    r = await client.get(MIRROR_LIST_URL)
    r.raise_for_status()
    return r.json()


async def _latest(client: httpx.AsyncClient, code: int) -> Optional[dict]:
    try:
        r = await client.get(f"{mf.MIRROR_URL}/{code}/latest")
        if r.status_code != 200:
            return None
        j = r.json()
        if int(j["meta"]["scheme_code"]) != code or not j.get("data"):
            return None
        dd, mm, yy = j["data"][0]["date"].split("-")
        return {"house": j["meta"].get("fund_house"), "category": j["meta"].get("scheme_category"), "day": date(int(yy), int(mm), int(dd)),
                "nav": mf.parse_nav(str(j["data"][0]["nav"]))}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return None


async def _history(client: httpx.AsyncClient, code: int) -> Optional[Tuple[List[int], List[float]]]:
    try:
        r = await client.get(f"{mf.MIRROR_URL}/{code}")
        return mf.parse_mirror(r.json(), code) if r.status_code == 200 else None
    except (httpx.HTTPError, ValueError):
        return None


async def successors(conn) -> List[dict]:
    """Active Growth schemes of a LINEAGE house whose stored history starts more than CUT_DAYS after the launch date and that have no link yet."""
    rows = await conn.fetch("""SELECT s.code, s.name, s.amc, s.plan, s.category, h.d0, h.blob, h.complete, f.launch_date
                               FROM mf_schemes s JOIN mf_history h USING (code) JOIN mf_facts f USING (code)
                               WHERE s.active AND s.option_class = 'Growth' AND s.plan IN ('Direct', 'Regular') AND f.launch_date IS NOT NULL
                                 AND h.d0 > f.launch_date + $1::int AND h.d0 >= $2::date AND NOT EXISTS (SELECT 1 FROM mf_predecessors p WHERE p.code = s.code)""", CUT_DAYS, DIRECT_PLANS_FROM)
    return [dict(r) for r in rows if house_key(r["amc"])]


async def link(store, client: httpx.AsyncClient, *, max_seconds: float = 240.0, pause: float = 0.1) -> Dict[str, Any]:
    """Find and write links (see the module docstring), then re-join any linked history that lost its earlier part. Time-limited; resumable."""
    started = time.perf_counter()
    out: Dict[str, Any] = {"successors": 0, "candidatesAsked": 0, "linked": [], "noMatch": [], "rejectedSample": [], "rejoined": 0}
    async with store.pool.acquire() as conn:
        succ = await successors(conn)
        known = {r["old_code"]: r for r in await conn.fetch("SELECT * FROM mf_lineage_cands")}
        active = {r["code"] for r in await conn.fetch("SELECT code FROM mf_schemes WHERE active")}
    out["successors"] = len(succ)
    if succ:
        houses = {house_key(s["amc"]) for s in succ}
        prefixes = tuple(p.upper() for h in houses for p in LINEAGE[h]["prefixes"])
        names = [x for x in await _mirror_names(client) if str(x.get("schemeName") or "").upper().startswith(prefixes)
                 and int(x["schemeCode"]) not in active and mirror_option(str(x["schemeName"])) == "Growth"]
        fresh = []
        for x in names:
            code = int(x["schemeCode"])
            if code in known:
                continue
            if time.perf_counter() - started > max_seconds:
                out["status"] = "partial"
                break
            got = await _latest(client, code)
            out["candidatesAsked"] += 1
            if got is not None:   # a failed request is not remembered, so it is asked again next run
                nm = str(x["schemeName"])
                fresh.append((code, nm, got["house"], got["category"], mf.clean_plan("", nm), "Growth", got["day"], got["nav"]))
            if pause:
                await asyncio.sleep(pause)
        if fresh:
            async with store.pool.acquire() as conn:
                await conn.executemany("""INSERT INTO mf_lineage_cands (old_code, name, house, category, plan, option, last_day, last_nav) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                                          ON CONFLICT (old_code) DO UPDATE SET name = EXCLUDED.name, house = EXCLUDED.house, category = EXCLUDED.category, plan = EXCLUDED.plan,
                                          option = EXCLUDED.option, last_day = EXCLUDED.last_day, last_nav = EXCLUDED.last_nav, checked_at = now()""", fresh)
                known = {r["old_code"]: r for r in await conn.fetch("SELECT * FROM mf_lineage_cands")}
        pool = [Cand(r["old_code"], r["name"], r["house"], r["category"], r["plan"], r["option"], r["last_day"], r["last_nav"]) for r in known.values()]
        for s in succ:
            if time.perf_counter() - started > max_seconds:
                out["status"] = "partial"
                break
            own = mf.unpack_series(bytes(s["blob"]), s["d0"].toordinal())
            first_day, first_nav = date.fromordinal(own[0][0]), own[1][0]
            best, gap, why = continuity(s["plan"], s["category"], first_day, first_nav, pool)
            out["rejectedSample"].extend(why[:2])
            if best is None:
                out["noMatch"].append(f"{s['code']} {s['name']} ({s['plan']}), history from {first_day}")
                continue
            res = await _join_one(store, client, s, own, best, gap)
            (out["linked"] if res else out["noMatch"]).append(f"{s['code']} {s['name']} ({s['plan']}) <- {best.old_code} {best.name}" if res
                                                              else f"{s['code']} {s['name']}: {best.old_code}'s full history did not confirm the join")
    out["rejoined"] = await reapply(store, client)
    out["rejectedSample"] = out["rejectedSample"][:20]
    out["noMatch"] = out["noMatch"][:60]
    out.setdefault("status", "ok")
    out["seconds"] = round(time.perf_counter() - started, 1)
    return out


async def _join_one(store, client: httpx.AsyncClient, s: dict, own: Tuple[List[int], List[float]], best: Cand, gap: float) -> bool:
    earlier = await _history(client, best.old_code)
    if not earlier or not earlier[0]:
        return False
    first_day = own[0][0]
    before = [(d, v) for d, v in zip(*earlier) if d < first_day]
    if not before:
        return False
    last_d, last_v = before[-1]
    if (first_day - last_d) > MAX_GAP_DAYS or abs(own[1][0] / last_v - 1) * 100 > MAX_GAP_PCT:
        return False    # the full history ends somewhere else than the mirror's 'latest' said: no link
    days, navs = join(own, earlier)
    first = date.fromordinal(first_day)
    note = note_for(best.name, first)
    async with store.pool.acquire() as conn, conn.transaction():
        await mf._write_series(conn, [(s["code"], days, navs, bool(s["complete"]))])
        await conn.execute("""INSERT INTO mf_predecessors (code, old_code, old_name, old_house, old_last, old_last_nav, new_first, new_first_nav, gap_pct, source, note)
                              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (code) DO UPDATE SET old_code = EXCLUDED.old_code, old_name = EXCLUDED.old_name,
                              old_house = EXCLUDED.old_house, old_last = EXCLUDED.old_last, old_last_nav = EXCLUDED.old_last_nav, new_first = EXCLUDED.new_first,
                              new_first_nav = EXCLUDED.new_first_nav, gap_pct = EXCLUDED.gap_pct, source = EXCLUDED.source, note = EXCLUDED.note, linked_at = now()""",
                           s["code"], best.old_code, best.name, best.house, date.fromordinal(last_d), last_v, first, own[1][0], round(gap, 4),
                           "api.mfapi.in (mirror of AMFI's NAV data)", note)
    return True


async def reapply(store, client: httpx.AsyncClient) -> int:
    """A linked scheme whose stored history no longer reaches back past the join (rebuilt from AMFI alone) is joined again."""
    async with store.pool.acquire() as conn:
        rows = await conn.fetch("""SELECT p.code, p.old_code, p.new_first, h.blob, h.d0, h.complete FROM mf_predecessors p JOIN mf_history h USING (code)
                                   WHERE h.d0 >= p.new_first""")
    n = 0
    for r in rows:
        earlier = await _history(client, r["old_code"])
        if not earlier:
            continue
        own = mf.unpack_series(bytes(r["blob"]), r["d0"].toordinal())
        days, navs = join(own, earlier)
        if days[0] >= own[0][0]:
            continue
        async with store.pool.acquire() as conn, conn.transaction():
            await mf._write_series(conn, [(r["code"], days, navs, bool(r["complete"]))])
        n += 1
    return n


async def notes(conn, code: int) -> Optional[dict]:
    """The fund page's line about an earlier code, or None."""
    r = await conn.fetchrow("SELECT old_code, old_name, new_first, note FROM mf_predecessors WHERE code = $1", code)
    return {"oldCode": r["old_code"], "oldName": r["old_name"], "joinedOn": r["new_first"].isoformat(), "note": r["note"]} if r else None


__all__ = ["LINEAGE", "Cand", "continuity", "join", "link", "reapply", "notes", "note_for", "house_key", "successors"]