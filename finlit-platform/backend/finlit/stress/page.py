"""The JSON the Stress Lab page reads: GET /api/stress/SYM/page (and the compare view's second company).

Builds on finlit_technicals.stress (v2.1.1). Adds the fields the new page needs and the engine does not
return yet: where each company setting came from, the Today inputs table with its source lines, the value under the
other persistence, the share-price falls in past shocks (from NSE closes) and the back-test.

    from . import engine

S = engine()
    import stress_page_api as P
    co = S.company_from_pack(pack, beta=beta)
    today = S.load_today(today_inputs, co.base_end, as_of="2026-11-04")
    payload = P.page_payload(pack, co, today, closes=closes, nifty=nifty, last_close="2026-10-29")

Everything here is descriptive. No buy / sell / hold wording; no forecasts in our own voice.
"""
from __future__ import annotations

import json
from dataclasses import replace
from typing import Any, Dict, List, Optional, Sequence, Tuple

from . import engine

S = engine()

# Past shocks: Nifty 50 peak-to-trough windows (the prototype's). The 2026 row runs from 1 Jan to the latest close.
EPISODES: List[Tuple[str, str, str]] = [
    ("2018 credit scare (IL&FS)", "2018-08-28", "2018-10-26"),
    ("2020 Covid demand collapse", "2020-01-14", "2020-03-23"),
    ("2022 oil and rate shock", "2022-01-17", "2022-06-17"),
    ("2026 so far", "2026-01-01", "2026-12-31"),
]

BASED_ON = {
    "today": "Brent, the rupee, inflation, the repo rate and GDP growth now, against their average over the 12 months "
             "of the company's last four quarters ({w0} to {w1}), held for a year.",
    "today_eia": "The same as Today, except that crude follows the U.S. EIA outlook for the next four quarters.",
    "2022": "FY22 to FY23: Brent rose from US$45 a barrel (FY21) to US$81 and then US$96, the rupee went from 74 to 80 "
            "a dollar, and the RBI raised the repo rate from 4.0% to 6.5%.",
    "2020": "April to June 2020: the lockdown stopped demand, crude collapsed and the RBI cut the repo rate to 4.0%.",
    "oil": "A supply shock on its own, like 2026: crude up by half with a slightly weaker rupee.",
    "rupee": "The rupee loses about 9% against the dollar; imported materials cost more.",
    "rates": "Borrowing costs rise 150 bp; nothing else moves.",
    "slowdown": "Volumes fall 10% for the average company and rates are eased 50 bp.",
}
SHORT = {"today": "Today", "today_eia": "Today, crude eases", "2022": "2022 commodity and rate shock",
         "2020": "2020 lockdown", "oil": "Oil spike", "rupee": "Rupee slide", "rates": "Rates up",
         "slowdown": "Demand slowdown"}


def field_sources(co: S.Company, table: Optional[S.ExposureTable] = None, *, symbol: str = "", basic: str = "",
                  industry: str = "", sector: str = "") -> Dict[str, str]:
    """For each exposure setting, the level its value came from (the last level that sets it wins, as in lookup())."""
    t = (table or S.exposures()).table
    levels = [("sectors", sector, f"{sector} sector"), ("industries", industry, f"{industry} industry"),
              ("basic_industries", basic, f"{basic} industry"), ("companies", symbol, "This company (from its reports)")]
    norm = {lvl: {S._norm(k): v for k, v in t.get(lvl, {}).items()} for lvl, _, _ in levels}
    out = {}
    for k in sorted(S._EXPOSURE_KEYS - {"excluded"}):
        src = "Default for all companies"
        for lvl, name, word in levels:
            if name and k in (norm[lvl].get(S._norm(name)) or {}):
                src = word
        out[k] = src
    return out  # calibrated settings are worded on the page from company.calibration


def scenario_json(key: str, sc: S.Scenario, window: Tuple[str, str]) -> Dict[str, Any]:
    return {"id": key, "name": SHORT.get(key, sc.name), "crude": sc.crude, "usdinr": sc.usdinr, "cpi": sc.cpi,
            "wpi": sc.wpi, "rate_bp": sc.rate_bp, "demand": sc.demand, "erp_bp": sc.erp_bp, "metals": sc.metals,
            "agri": sc.agri, "persistence": sc.persistence,
            "based_on": BASED_ON.get(key, sc.description).format(w0=window[0], w1=window[1])}


def today_eia(today: S.Scenario, eia_brent_next4: Sequence[float]) -> S.Scenario:
    """Today with crude on the EIA outlook (average of the next four quarters) instead of today's level."""
    avg = sum(eia_brent_next4) / len(eia_brent_next4)
    return replace(today, name="Today, crude eases", crude=round((avg / today.inputs["brent_base"] - 1) * 100, 2))


def today_rows(today: S.Scenario, dates: Dict[str, str]) -> List[Dict[str, Any]]:
    """The 'See today's inputs' table, with the source line each series must carry (spec 11.2)."""
    ti = today.inputs
    row = lambda d, now, nd, base, shock, src, extra=None: {  # noqa: E731
        "driver": d, "now": now, "now_date": nd, "base": base, "shock": shock, "source": src, **({"extra": extra} if extra else {})}
    return [
        row("Brent crude, US$ a barrel", "%.2f" % ti["brent_now"], dates.get("brent", ""), "%.2f" % ti["brent_base"],
            ["pct", today.crude], "U.S. EIA"),
        row("Rupees per US dollar", "%.2f" % ti["usdinr_now"], dates.get("usdinr", ""), "%.2f" % ti["usdinr_base"],
            ["pct", today.usdinr], "FBIL", "rupee %.1f%% weaker" % abs(today.rupee_value_pct) if today.usdinr > 0 else None),
        row("Consumer inflation (CPI)", "%.2f%%" % ti["cpi"]["latest"], dates.get("cpi", ""), "%.2f%%" % ti["cpi"]["base_avg"],
            ["pt", today.cpi], "MoSPI"),
        row("Wholesale inflation, manufactured products", "%.2f%%" % ti["wpi_mfg"]["latest"], dates.get("wpi", ""),
            "%.2f%%" % ti["wpi_mfg"]["base_avg"], ["pt", today.wpi], "Office of the Economic Adviser"),
        row("Wholesale inflation, farm and primary goods", "%.2f%%" % ti["wpi_primary"]["latest"], dates.get("wpi", ""),
            "%.2f%%" % ti["wpi_primary"]["base_avg"], ["pt", today.agri], "Office of the Economic Adviser"),
        row("Repo rate", "%.2f%%" % ti["repo"]["latest"], dates.get("repo", ""), "%.2f%%" % ti["repo"]["base_avg"],
            ["bp", today.rate_bp], "RBI"),
        row("Real GDP growth (for demand)", "%.2f%%" % ti["gdp"]["latest"], dates.get("gdp", ""), "%.2f%%" % ti["gdp"]["base_avg"],
            ["pct", today.demand], "NSO, MoSPI"),
        row("Equity risk premium", "–", "", "–", ["bp", 0], "No market series yet: held at zero"),
    ]


def drawdown(closes: Dict[str, float], start: str, end: str) -> Optional[Dict[str, Any]]:
    """Largest fall from a closing high to a later closing low inside [start, end], and the first close back at
    that high (searched to the end of the series). closes = {ISO date: adjusted close}. None if no prices."""
    ds = sorted(d for d in closes if start <= d <= end)
    if not ds:
        return None
    peak, best = None, (0.0, None, None)
    for d in ds:
        if peak is None or closes[d] > closes[peak]:
            peak = d
        fall = closes[d] / closes[peak] - 1
        if fall < best[0]:
            best = (fall, peak, d)
    fall, p, t = best
    back = next((d for d in sorted(closes) if t and d > t and closes[d] >= closes[p]), None) if p else None
    return {"fall_pct": round(fall * 100, 1), "peak": p, "trough": t, "back": back}


def history(symbols_closes: Dict[str, Dict[str, float]], nifty: Dict[str, float]) -> List[Dict[str, Any]]:
    out = []
    for name, a, b in EPISODES:
        row = {"episode": name, "from": a, "to": b, "nifty": drawdown(nifty, a, b)}
        for sym, closes in symbols_closes.items():
            row[sym] = drawdown(closes, a, b)   # None = listed later: the page shows "Listed later"
        out.append(row)
    return out


def golden(co: S.Company, scenarios: Dict[str, S.Scenario]) -> Dict[str, Any]:
    """Raw engine outputs for the front-end test (engine/test_engine.js): fail the build if JavaScript differs by >0.01%."""
    g: Dict[str, Any] = {}
    for k, sc in scenarios.items():
        x, r = S._engine(co, sc), S.run(co, sc)
        g[k] = {"eps1": x["eps1"], "E1": x["E1"], "R1": x["R1"], "I1": x["I1"], "OI1": x["OI1"], "drivers_rs": x["drivers_rs"],
                "score": r["score"], "label": r["label"], "value_move": None if r["value"] is None else r["value"]["move_pct"],
                "value_perm": (S.run(co, replace(sc, persistence="permanent"))["value"] or {}).get("move_pct")}
        for p in (0.4, 0.8):
            g[k][f"eps_chg_pass_{p}"] = S.run(replace(co, exposure=replace(co.exposure, pass_through=p)), sc)["change_pct"]["eps"]
    g["_sens"], g["_bp"] = S.sensitivities(co), S.breaking_points(co)
    return g


def company_json(co: S.Company, pack: dict, sources: Dict[str, str], **extra) -> Dict[str, Any]:
    e = co.exposure
    d = {"symbol": co.symbol, "name": co.name, "revenue": co.revenue, "rm": co.rm, "emp": co.emp, "opex": co.opex,
         "other_income": co.other_income, "dep": co.dep, "interest": co.interest, "tax_rate": co.tax_rate,
         "shares": co.shares, "debt": co.debt, "cash": co.cash, "beta": co.beta, "growth": co.growth,
         "base_label": co.base_label, "base_end": co.base_end, "reported_eps": co.reported_eps,
         "exposure": {k: getattr(e, k) for k in sorted(S._EXPOSURE_KEYS - {"excluded"})},
         "exposure_source": e.source, "exposure_notes": e.notes, "notes": co.notes,
         "calibration": {k: co.calibration[k] for k in ("pass_through", "var_opex", "demand_beta") if k in co.calibration},
         "field_source": sources}
    prof = pack.get("profile", {}) or {}
    d.update({"sector": prof.get("sector"), "industry": prof.get("industry"), "market_cap_cr": prof.get("marketCapCr"),
              "price": (pack.get("quote") or {}).get("price"), "statement": (pack.get("dataQuality") or {}).get("statement")})
    d.update(extra)
    return d


def page_payload(pack: dict, co: S.Company, today: S.Scenario, *, eia_brent_next4: Optional[Sequence[float]],
                 today_dates: Dict[str, str], base_window: Tuple[str, str], closes: Dict[str, float],
                 nifty: Dict[str, float], as_of: str, size: str, price_as_of: str, inventory_days: Optional[int],
                 latest_quarter: Optional[dict] = None) -> Dict[str, Any]:
    prof = pack.get("profile", {}) or {}
    basic = prof.get("sector") or prof.get("subIndustry") or ""
    industry = prof.get("industry") or ""
    src = field_sources(co, symbol=co.symbol, basic=basic, industry=industry, sector=S.nse_sector_of(industry) or industry)
    scs = {"today": today, **({"today_eia": today_eia(today, eia_brent_next4)} if eia_brent_next4 else {}), **S.PRESETS}
    bt = S.backtest_years(pack)
    return {
        "as_of": as_of, "model": S.MODEL_VERSION, "disclaimer": S.DISCLAIMER,
        "company": company_json(co, pack, src, size=size, price_as_of=price_as_of, inventory_days_fy26=inventory_days),
        "scenarios": [scenario_json(k, sc, base_window) for k, sc in scs.items()],
        "today_inputs": today.inputs, "today_rows": today_rows(today, today_dates), "base_window": list(base_window),
        "eia_outlook": ({"brent": list(eia_brent_next4), "avg": round(sum(eia_brent_next4) / len(eia_brent_next4), 2)} if eia_brent_next4 else None),
        "history": history({co.symbol: closes}, nifty),
        "backtest": {"years": bt, "summary": S.backtest_summary(bt), "latest_quarter": latest_quarter},
        "calibration_years": co.calibration.get("years", []),
    }


# --------------------------------------------------------------------------------------------- plans and the compare default
SILVER_SCENARIOS = ("today", "today_eia", "2022", "2020")


def plan_payload(payload: Dict[str, Any], plan: str) -> Dict[str, Any]:
    """What each plan receives. Gold: everything. Silver: Today (and Crude eases) plus the 2022 and 2020 presets, and only
    the names of the others so the page can show them locked. /run and /compare answer 403 for Silver."""
    if plan == "gold":
        return {**payload, "plan": "gold"}
    if plan != "silver":
        raise ValueError("Stress Lab is on the Silver and Gold plans")
    return {**payload, "plan": "silver",
            "scenarios": [s for s in payload["scenarios"] if s["id"] in SILVER_SCENARIOS],
            "locked_scenarios": [{"id": s["id"], "name": s["name"]} for s in payload["scenarios"]
                                 if s["id"] not in SILVER_SCENARIOS]}


def default_peer(symbol: str, peers: Sequence[str], covered: Dict[str, Optional[str]]) -> Optional[Dict[str, Any]]:
    """The compare view's second company: the first peer (in /api/stocks/SYM/peers order) that Stress Lab covers and that
    has results to the same quarter as `symbol`, so both face the same Today shock; failing that, the first covered peer
    (the page then shows each company's window under its name). covered = {symbol: base_end} for every company with a
    built Stress Lab page (banks, NBFCs, insurers and companies with under three years of results are not in it)."""
    own = covered.get(symbol)
    cands = [p for p in peers if p != symbol and p in covered]
    for p in cands:
        if own and covered[p] == own:
            return {"symbol": p, "same_quarter": True}
    return {"symbol": cands[0], "same_quarter": False} if cands else None
