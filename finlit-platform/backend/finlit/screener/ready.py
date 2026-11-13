"""The Stock screener's ready-made screens (task #64, file 04): one list for the page, the counts and the queries, kept on the server.

A metric screen is the visitor's own rules on public figures: its rules are sent and load into "Your rules", where they can be changed.
A screen on the FinLit model is described in words only. Its cut-offs stay here: the page asks for it by id (`model_screen`), the server applies
them, and no response ever carries them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

Rules = Dict[str, Dict[str, Optional[float]]]


@dataclass(frozen=True)
class Ready:
    id: str
    label: str
    says: str
    tier: str                       # basic | silver | gold: the plan that may run it
    group: str                      # everyday | silver | model: the tab it is listed under
    rules: Rules = field(default_factory=dict)
    caps: Tuple[str, ...] = ()
    bands: Tuple[str, ...] = ()     # a FinLit rating word (strong, healthy, mixed, watch): shown, since the user filters by the word
    model: bool = False             # True: the rules are the model's cut-offs and never leave the server
    score: str = ""                 # "iq" (Silver's FinLit IQ) or "prism" (Gold's FinLit Prism) for a screen on a FinLit score; "" for a screen on public figures


def _r(**kw: Tuple[Optional[float], Optional[float]]) -> Rules:
    return {k: {"min": lo, "max": hi} for k, (lo, hi) in kw.items()}


READY: List[Ready] = [
    # Everyday (free)
    Ready("large", "Large, established companies", "Market cap above ₹1,00,000 Cr", "basic", "everyday", _r(market_cap=(100000, None))),
    Ready("lowdebt", "Low debt", "Debt to equity below 0.5×", "basic", "everyday", _r(debt_to_equity=(None, 0.5))),
    Ready("div", "Dividend payers", "Dividend yield above 2%", "basic", "everyday", _r(dividend_yield=(2, None))),
    Ready("roe", "High return on equity", "ROE above 15% and ROCE above 15%", "basic", "everyday", _r(roe=(15, None), roce=(15, None))),
    # Silver
    Ready("value", "Value picks", "P/E under 15× and P/B under 2×", "silver", "silver", _r(pe=(0.1, 15), pb=(0.1, 2))),
    Ready("garp", "Growth at a fair price", "PEG under 1.5, profit growth 5Y above 15%, ROE above 15%", "silver", "silver",
          _r(peg=(0.01, 1.5), profit_cagr_5y=(15, None), roe=(15, None))),
    Ready("cheap_own", "Cheap against its own history", "P/E at least 15% below its own average, profit still growing", "silver", "silver",
          _r(pe_vs_median_5y=(None, -15), profit_growth=(0, None), pe=(0.1, None))),
    Ready("cheap_sector", "Cheaper than its sector", "P/E 20% below the sector median with ROE above 12%", "silver", "silver", _r(pe_vs_sector=(None, -20), roe=(12, None))),
    Ready("netcash", "Net cash balance sheet", "More cash and investments than debt, interest cover above 5×", "silver", "silver", _r(net_debt=(None, 0), interest_coverage=(5, None))),
    Ready("cashrich", "Profits backed by cash", "Operating cash above 90% of profit, free cash flow positive", "silver", "silver",
          _r(cfo_to_pat=(90, None), fcf=(0.01, None), net_profit=(0.01, None))),
    Ready("compounder", "Steady compounders", "Sales and profit growth above 12% for 5 years, ROCE above 15%", "silver", "silver",
          _r(sales_cagr_5y=(12, None), profit_cagr_5y=(12, None), roce=(15, None))),
    Ready("surge", "Quarterly profit surge", "Profit up 25%+ on last year's quarter, sales also rising", "silver", "silver", _r(q_profit_yoy=(25, None), q_sales_yoy=(5, None))),
    Ready("steadyq", "Four strong quarters", "Sales and profit beat the year-ago quarter in each of the last four", "silver", "silver", _r(q_sales_up=(4, None), q_profit_up=(4, None))),
    Ready("divgrow", "Reliable dividend growers", "Paid dividends in 6 of 6 years, growing, yield above 1%", "silver", "silver",
          _r(div_years=(6, None), dps_cagr=(5, None), dividend_yield=(1, None))),
    Ready("buying", "Promoters and funds buying", "Promoters and institutions both added to their stake this year", "silver", "silver",
          _r(own_promoters_chg_1y=(0.25, None), own_inst_chg_1y=(0.5, None))),
    Ready("resultsseason", "Results-season standouts", "Latest quarter: sales up 20%+ and profit up 25%+ on the year-ago quarter, market cap ₹1,000 Cr or more", "silver", "silver",
          _r(q_sales_yoy=(20, None), q_profit_yoy=(25, None), market_cap=(1000, None))),
    Ready("steadydiv", "Steady dividend payers", "Yield 2.5%+, paid in all of the last 6 years, payout 75% or less, at most 1 red flag, market cap ₹1,000 Cr or more", "silver", "silver",
          _r(dividend_yield=(2.5, None), div_years=(6, None), dividend_payout=(None, 75), flag_count=(None, 1), market_cap=(1000, None))),
    Ready("instbuying", "Institutions buying", "Foreign and domestic institutions each added 0.5 point or more last quarter; promoters down no more than 1 point in a year", "silver", "silver",
          _r(own_fii_chg_1q=(0.5, None), own_dii_chg_1q=(0.5, None), own_promoters_chg_1y=(-1, None))),
    Ready("newhigh", "Near a 52-week high with volume", "Within 3% of the high and trading 1.5× average volume", "silver", "silver", _r(near_high=(1, None), volume_vs_avg=(1.5, None))),
    Ready("oversold", "Oversold quality", "RSI under 35 but ROE above 12% and debt under 1×", "silver", "silver", _r(rsi14=(None, 35), roe=(12, None), debt_to_equity=(None, 1))),
    Ready("clean", "No red flags", "None of the eight warnings apply, large and mid companies", "silver", "silver", _r(flag_count=(None, 0)), caps=("Large", "Mid")),
    # On the FinLit IQ (Silver): words only
    Ready("strong", "FinLit IQ Strong", "Companies the FinLit IQ rates Strong", "silver", "model", bands=("strong",), score="iq"),
    Ready("modelcompound", "Quality compounders (model)", "Companies the FinLit IQ rates high on both quality and growth", "silver", "model",
          _r(pillar_quality=(70, None), pillar_growth=(60, None)), model=True, score="iq"),
    Ready("safe", "Safe and profitable (model)", "Companies the FinLit IQ rates high on both balance sheet and profitability", "silver", "model",
          _r(pillar_balance=(70, None), pillar_profitability=(60, None)), model=True, score="iq"),
    Ready("improving", "Improving scores", "Companies whose FinLit IQ rose clearly since last quarter", "silver", "model", _r(score_change=(5, None), overall=(50, None)), model=True, score="iq"),
    Ready("outfavour", "Sound but out of favour", "Companies the FinLit IQ rates sound on quality while the price trend is weak", "silver", "model",
          _r(pillar_quality=(55, None), pillar_technical=(None, 35)), model=True, score="iq"),
    # On FinLit Prism (Gold, who never sees the FinLit IQ): words only, the cut-offs stay here
    Ready("pz_strong", "Prism Strong", "Companies FinLit Prism rates Strong", "gold", "model", bands=("strong",), score="prism"),
    Ready("pz_compound", "Quality and growth (Prism)", "Companies Prism rates high on both Quality and Growth & Profitability", "gold", "model",
          _r(prism_quality=(70, None), prism_fundamental=(60, None)), model=True, score="prism"),
    Ready("pz_safe", "Lower risk, sound quality (Prism)", "Companies Prism rates high on Risk (lower risk) and sound on Quality", "gold", "model",
          _r(prism_risk=(70, None), prism_quality=(60, None)), model=True, score="prism"),
    Ready("pz_modest", "Modest price, sound business (Prism)", "Companies Prism rates well on Valuation and sound on Quality", "gold", "model",
          _r(prism_valuation=(65, None), prism_quality=(55, None)), model=True, score="prism"),
    Ready("pz_outfavour", "Sound but out of favour (Prism)", "Companies Prism rates sound on Quality while the long-term price trend is down", "gold", "model",
          _r(prism_quality=(55, None), prism_lt_score=(None, -20)), model=True, score="prism"),
]
BY_ID: Dict[str, Ready] = {r.id: r for r in READY}
MODEL: Dict[str, Ready] = {r.id: r for r in READY if r.model}


def shown_to(r: Ready, plan: str) -> bool:
    """A screen on a FinLit score is listed only for the plan that has that score: the FinLit IQ below Gold, FinLit Prism for Gold and up."""
    gold = plan in ("gold", "admin", "platinum")
    return not r.score or (r.score == "prism") == gold


def public(r: Ready, count: Optional[int]) -> dict:
    """What the page is sent for one screen: never a model screen's rules."""
    out = {"id": r.id, "label": r.label, "says": r.says, "tier": r.tier, "group": r.group, "count": count}
    if not r.model:
        out["state"] = {"ranges": {k: {kk: vv for kk, vv in v.items() if vv is not None} for k, v in r.rules.items()},
                        **({"caps": list(r.caps)} if r.caps else {}), **({"bands": list(r.bands)} if r.bands else {})}
    return out
