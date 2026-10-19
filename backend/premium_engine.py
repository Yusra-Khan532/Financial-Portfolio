"""Deterministic implementation of the owner's v3.6 rules, hardened for missing inputs.
No network, database or wall-clock dependencies. Corrections are versioned 3.6.3.
"""
import math
import statistics
try:
    from backend.premium_model_config import (
        GROUPS, PART_WEIGHTS, FILL_DEFAULT, FILL_OVERRIDES, TRADING_VALUE_STEPS,
    )
except ImportError:
    from premium_model_config import (
        GROUPS, PART_WEIGHTS, FILL_DEFAULT, FILL_OVERRIDES, TRADING_VALUE_STEPS,
    )

MODEL_VERSION = "3.6.3"
BASELINE_VERSION = "3.6-simple"
FILL_VERSION = "2026-10-14"
LABELS = {
    "SALES_STREAK": "Sales streak", "PROFIT_STREAK": "Profit streak",
    "SALES_GROWTH": "Sales growth (12 months)", "PROFIT_GROWTH": "Profit growth (12 months)",
    "SALES_CAGR": "Sales CAGR", "PROFIT_CAGR": "Profit CAGR", "MARGIN_CHANGE": "Operating margin change",
    "LOAN_GROWTH": "Loan growth", "NETWORTH_GROWTH": "Net worth growth",
    "DEBT_TO_EQUITY": "Debt / equity", "INTEREST_COVER": "Interest cover", "ROE": "Return on equity",
    "CASH_CONVERSION": "Cash conversion", "GROSS_NPA": "Gross NPA", "NET_NPA": "Net NPA",
    "CAPITAL_ADEQUACY": "Capital adequacy", "ROA": "Return on assets", "SOLVENCY": "Solvency ratio",
    "PE_VS_INDUSTRY": "P/E vs industry", "PE_VS_HISTORY": "P/E vs own history", "PEG": "PEG",
    "PB_VS_INDUSTRY": "P/B vs industry", "PB_VS_HISTORY": "P/B vs own history",
    "EV_EBITDA_VS_INDUSTRY": "EV/EBITDA vs industry", "VOLATILITY": "Annualised volatility",
    "BIGGEST_FALL": "Maximum drawdown (1 year)", "TRADING_VALUE": "Daily trading value (Cr)",
    "PLEDGE": "Promoter pledged shares",
}
PERCENT_METRICS = {"SALES_GROWTH", "PROFIT_GROWTH", "SALES_CAGR", "PROFIT_CAGR", "LOAN_GROWTH", "NETWORTH_GROWTH", "ROE", "GROSS_NPA", "NET_NPA", "CAPITAL_ADEQUACY", "ROA", "VOLATILITY", "BIGGEST_FALL", "PLEDGE"}
STATES = {"A": "Actual", "Z": "Negative / loss rule", "S": "Substituted", "F": "Filled", "N": "Not applicable", "L": "Not supplied"}

def num(value):
    if value is None or isinstance(value, bool) or value == "":
        return None
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (TypeError, ValueError):
        return None


def scale(value, worst, best):
    return min(100., max(0., (value - worst) / (best - worst) * 100))


def fill(group, metric):
    return FILL_OVERRIDES.get(group, {}).get(metric, FILL_DEFAULT)


def complete_sum(values, length):
    values = values[-length:]
    return sum(values) if len(values) == length and all(num(v) is not None for v in values) else None


def recent(series, annual):
    if len(series) >= 8:
        return complete_sum(series[-4:], 4), complete_sum(series[-8:-4], 4), "Trailing 4 quarters vs previous 4 quarters"
    if len(series) >= 5:
        return num(series[-1]), num(series[-5]), "Latest quarter vs same quarter last year (short-history fallback)"
    return (num(annual[-1]), num(annual[-2]), "Latest financial year vs previous year (short-history fallback)") if len(annual) >= 2 else (None, None, "Insufficient history")


def growth(new, old, years, limits):
    if new is None or old is None:
        return None, None, "Missing comparison"
    if old <= 0:
        points = 70. if new > 0 else 30. if new > old else 0.
        return points, None, "Loss to profit" if new > 0 else "Loss narrowed" if new > old else "Loss not narrowed"
    value = ((new / old) ** (1 / years) - 1) * 100 if new > 0 else -100.
    return scale(value, *limits), value, None


def streak(series, best, group, metric):
    series = series[-14:]
    pairs = [(i, num(series[i]), num(series[i - 4])) for i in range(4, len(series))]
    judged = sum(new is not None and old is not None for _, new, old in pairs)
    if not judged:
        return None, {"good": 0, "slips": 0, "judged": 0, "medianYoY": None}, 0.
    run, last_bad = [], None
    for index, new, old in reversed(pairs):
        if new is None or old is None:
            last_bad = None
            continue
        good = new > old
        if not good and last_bad == index + 1:
            run.pop()
            break
        p, yoy, _ = growth(new, old, 1, (0, best))
        run.append((good, p, yoy))
        last_bad = None if good else index
    while run and not run[-1][0]:
        run.pop()
    good = sum(item[0] for item in run)
    slips = len(run) - good
    magnitude = statistics.median([item[1] for item in run if item[0]]) if good else 0.
    base = max(0., 10 * good - 5 * slips) * 10 / judged
    own = base * (.8 + .2 * magnitude / 100)
    credibility = judged / 10
    yoys = [item[2] for item in run if item[0] and item[2] is not None]
    return own * credibility + fill(group, metric) * (1 - credibility), {
        "good": good, "slips": slips, "judged": judged, "base": base,
        "ownPoints": own, "magnitudePoints": magnitude, "credibility": credibility, "fillPoints": fill(group, metric), "medianYoY": statistics.median(yoys) if yoys else None,
    }, credibility


def label(score):
    return "STRONG" if score >= 80 else "HEALTHY" if score >= 65 else "AVERAGE" if score >= 50 else "WEAK" if score >= 35 else "POOR"


def score_company(d, group):
    if group not in GROUPS:
        raise ValueError("Unsupported model group")
    config = GROUPS[group]
    limits = config["limits"]
    points, values, statuses, details, credits = {}, {}, {}, {}, {}

    def put(metric, value, status="A", detail=None, explicit_points=None):
        value = num(value)
        values[metric] = value
        if value is not None or explicit_points is not None:
            points[metric] = explicit_points if explicit_points is not None else scale(value, *limits[metric])
            statuses[metric] = status
        if detail:
            details[metric] = detail

    def ratio(a, b):
        a, b = num(a), num(b)
        return a / b if a is not None and b is not None and b > 0 else None

    sales_q, profit_q = d.get("sales_q", [])[-14:], d.get("net_profit_q", [])[-14:]
    op_q = d.get("operating_profit_q", [])[-14:]
    for prefix, q, annual_key in (("SALES", sales_q, "sales_y"), ("PROFIT", profit_q, "net_profit_y")):
        metric = prefix + "_STREAK"
        p, info, credit = streak(q, limits[prefix + "_GROWTH"][1], group, metric)
        put(metric, info["good"] if p is not None else None, explicit_points=p, detail=info)
        if p is None:
            points.pop(metric, None)
        credits[metric] = credit
        annual = d.get(annual_key, [])[-6:]
        new, old, basis = recent(q, annual)
        p, value, note = growth(new, old, 1, limits[prefix + "_GROWTH"])
        put(prefix + "_GROWTH", value, detail={"basis": basis, "note": note, "current": new, "previous": old}, explicit_points=p)
        cagr_annual = annual
        n = len(annual) - 1
        p, value, note = growth(num(annual[-1]), num(annual[0]), n, limits[prefix + "_CAGR"]) if n >= 3 and all(num(v) is not None for v in annual) else (None, None, "At least 4 consecutive year-ends required")
        put(prefix + "_CAGR", value, detail={"years": max(0, n), "note": note, "current": cagr_annual[-1] if cagr_annual else None, "previous": cagr_annual[0] if cagr_annual else None}, explicit_points=p)

    nw, debt = num(d.get("net_worth")), num(d.get("total_debt"))
    annual_nw = nw  # Supplied model uses latest net worth, not average or prior year-end equity.
    annual_assets = d.get("total_assets")
    annual_profit = num(d.get("net_profit_y", [None])[-1]) if d.get("net_profit_y") else None
    if group in ("BANK", "NBFC"):
        value = ratio(d.get("loans_now"), d.get("loans_1y_ago"))
        put("LOAN_GROWTH", (value - 1) * 100 if value is not None else None)
        for metric, key in (("GROSS_NPA", "gross_npa_pct"), ("NET_NPA", "net_npa_pct"), ("CAPITAL_ADEQUACY", "capital_adequacy_pct")):
            put(metric, d.get(key))
        if group == "BANK" and num(d.get("capital_adequacy_pct")) is None:
            interest, pbt = num(d.get("interest_cost")), num(d.get("profit_before_tax"))
            # Do not bypass the BANK fallback with the non-bank debt/equity rule.
            # Both source inputs must be available; negative interest is invalid.
            if interest is not None and interest >= 0 and pbt is not None:
                put("INTEREST_COVER", (pbt + interest) / interest if interest > 0 else None,
                    explicit_points=100. if interest == 0 else None)
        value = ratio(annual_profit, annual_assets)
        put("ROA", value * 100 if value is not None else None)
    elif group == "INSURANCE":
        value = ratio(nw, d.get("net_worth_1y_ago"))
        put("NETWORTH_GROWTH", (value - 1) * 100 if value is not None else None)
        put("SOLVENCY", d.get("solvency_ratio"))
        value = ratio(annual_profit, annual_nw)
        put("ROE", value * 100 if value is not None else None, explicit_points=0. if annual_nw is not None and annual_nw <= 0 else None)
    else:
        sn, so, _ = recent(sales_q, [])
        on, oo, _ = recent(op_q, [])
        now, before = ratio(on, sn), ratio(oo, so)
        put("MARGIN_CHANGE", (now - before) * 100 if now is not None and before is not None else None)
        de = ratio(debt, nw)
        put("DEBT_TO_EQUITY", de, explicit_points=0. if nw is not None and nw <= 0 else None)
        if de is not None and de < .1:
            statuses["INTEREST_COVER"] = "N"
            details["INTEREST_COVER"] = {"note": "Debt / equity is below 0.1"}
        else:
            interest, pbt = num(d.get("interest_cost")), num(d.get("profit_before_tax"))
            put("INTEREST_COVER", (pbt + interest) / interest if pbt is not None and interest is not None and interest > 0 else None,
                explicit_points=100. if interest == 0 else None)
        value = ratio(annual_profit, annual_nw)
        put("ROE", value * 100 if value is not None else None, explicit_points=0. if annual_nw is not None and annual_nw <= 0 else None)
        p3 = complete_sum(d.get("net_profit_y", []), 3)
        c3 = complete_sum(d.get("operating_cash_flow_y", []), 3)
        if p3 is not None and p3 <= 0 and c3 is not None:
            put("CASH_CONVERSION", None, "Z", {"note": "Three-year loss; operating cash flow " + ("positive" if c3 > 0 else "non-positive")}, 50. if c3 > 0 else 0.)
        else:
            put("CASH_CONVERSION", ratio(c3, p3))

    price, shares = num(d.get("price")), num(d.get("shares"))
    eq = d.get("eps_q", [])
    eps = complete_sum(eq, 4) if len(eq) >= 4 else num(d.get("eps_ttm"))
    if eps is None and len(eq) < 4:
        eps = num(d.get("eps_fy"))
    pe = ratio(price, eps) if price is not None and price > 0 else None
    pb = ratio(price * shares, nw) if price is not None and price > 0 and shares is not None and shares > 0 else None
    loss, negative_nw = eps is not None and eps <= 0, nw is not None and nw <= 0
    for prefix, current, negative in (("PE", pe, loss), ("PB", pb, negative_nw)):
        industry, history = num(d.get(f"industry_median_{prefix.lower()}")), num(d.get(f"own_5y_median_{prefix.lower()}"))
        for suffix, benchmark in (("INDUSTRY", industry), ("HISTORY", history)):
            metric = prefix + "_VS_" + suffix
            if negative:
                put(metric, None, "Z", {"note": "Non-positive EPS" if prefix == "PE" else "Non-positive net worth"}, 0.)
            elif suffix == "HISTORY" and (benchmark is None or benchmark <= 0) and industry is not None and industry > 0:
                put(metric, ratio(current, industry), "S", {"note": "Industry median substituted for unavailable own history"})
            else:
                put(metric, ratio(current, benchmark))
    g = values.get("PROFIT_CAGR")
    if g is None:
        g = values.get("PROFIT_GROWTH")
    core = group in ("LIGHT", "MFG")
    if loss or (pe is not None and g is not None and g <= 0):
        put("PEG", None, "Z", {"note": "Loss-making or non-positive profit growth"}, 0.)
    elif pe is not None and g is not None and g > 0 and (core or details["PROFIT_STREAK"]["good"] >= 6):
        put("PEG", pe / min(g, 40), detail={"growthUsed": min(g, 40), "note": "Core group" if core else "At least 6 actual good profit quarters"})
    elif not core:
        statuses["PEG"] = "N"
        details["PEG"] = {"note": "Optional PEG eligibility requirements not met"}
    if group not in ("BANK", "NBFC", "INSURANCE"):
        ebitda = complete_sum(op_q, 4)
        if ebitda is not None and ebitda <= 0:
            put("EV_EBITDA_VS_INDUSTRY", None, "Z", {"note": "Non-positive EBITDA"}, 0.)
        else:
            ev = price * shares + debt - num(d.get("cash")) if all(v is not None for v in (price, shares, debt, num(d.get("cash")))) else None
            put("EV_EBITDA_VS_INDUSTRY", ratio(ratio(ev, ebitda), d.get("industry_median_ev_ebitda")))
    for metric, key in (("VOLATILITY", "volatility_pct"), ("BIGGEST_FALL", "biggest_fall_pct"), ("TRADING_VALUE", "trading_value_cr"), ("PLEDGE", "promoter_pledged_pct")):
        value = num(d.get(key))
        if metric == "PLEDGE" and value is None:
            statuses[metric] = "L"
            continue
        if metric == "TRADING_VALUE" and value is not None:
            put(metric, value, explicit_points=next((p for threshold, p in TRADING_VALUE_STEPS if value >= threshold), 0))
        else:
            put(metric, value)

    effective_weights = {part: dict(weights) for part, weights in config["weights"].items()}
    fallbacks = {}
    # Owner-requested BANK overrides: replace the original slot rather than add
    # a second contribution. A genuine zero/loss score is available data.
    if group == "BANK" and points.get("PE_VS_INDUSTRY") is None and points.get("PE_VS_HISTORY") is not None:
        effective_weights["valuation"] = {
            ("PE_VS_HISTORY" if metric == "PE_VS_INDUSTRY" else metric): weight
            for metric, weight in effective_weights["valuation"].items()
        }
        fallbacks["PE_VS_HISTORY"] = "PE_VS_INDUSTRY"
    if group == "BANK" and points.get("PB_VS_INDUSTRY") is None:
        roe = ratio(annual_profit, annual_nw)
        put("ROE", roe * 100 if roe is not None else None)
        if points.get("ROE") is not None:
            effective_weights["valuation"] = {
                ("ROE" if metric == "PB_VS_INDUSTRY" else metric): weight
                for metric, weight in effective_weights["valuation"].items()
            }
            fallbacks["ROE"] = "PB_VS_INDUSTRY"
    if group == "BANK" and points.get("CAPITAL_ADEQUACY") is None and points.get("INTEREST_COVER") is not None:
        effective_weights["quality"] = {
            ("INTEREST_COVER" if metric == "CAPITAL_ADEQUACY" else metric): weight
            for metric, weight in effective_weights["quality"].items()
        }
        fallbacks["INTEREST_COVER"] = "CAPITAL_ADEQUACY"

    parts, coverage, rows = {}, {}, []
    for part, weights in effective_weights.items():
        base = sum(w for metric, w in weights.items() if statuses.get(metric) != "N")
        denominator = sum(w for metric, w in weights.items() if statuses.get(metric) not in ("N", "L"))
        numerator = real = 0.
        for metric, weight in weights.items():
            state = statuses.get(metric, "A")
            if state not in ("N", "L"):
                if points.get(metric) is None:
                    points[metric], state = fill(group, metric), "F"
                else:
                    real += weight * credits.get(metric, 1.)
                numerator += weight * points[metric]
            statuses[metric] = state
            share = weight / denominator if denominator and state not in ("N", "L") else 0.
            lower, upper = limits.get(metric, (None, None))
            rows.append({"part": part, "metric": metric, "label": LABELS[metric], "value": values.get(metric),
                         "points": points.get(metric) if state not in ("N", "L") else None,
                         "status": state, "statusLabel": STATES[state], "weight": weight, "share": share,
                         "details": details.get(metric, {}), "fallbackFor": fallbacks.get(metric), "worst": lower, "best": upper,
                         "unit": "%" if metric in PERCENT_METRICS else "pp" if metric == "MARGIN_CHANGE" else "quarters" if metric.endswith("STREAK") else "Cr" if metric == "TRADING_VALUE" else "x",
                         "redBoundary": lower + (upper - lower) * .4 if lower is not None else None,
                         "greenBoundary": lower + (upper - lower) * .7 if lower is not None else None})
        parts[part] = numerator / denominator if denominator else None
        coverage[part] = real / base if base else 1.
    cap = 0.
    if parts["valuation"] is not None and parts["valuation"] > 60 and any(parts[p] is not None and parts[p] < 35 for p in ("fundamental", "quality")):
        cap = .3 * (parts["valuation"] - 60)
        parts["valuation"] = 60.
    total_weight = sum(w for p, w in PART_WEIGHTS.items() if parts[p] is not None)
    final = sum(PART_WEIGHTS[p] * value for p, value in parts.items() if value is not None) / total_weight
    confidence = min(1., max(0., sum(PART_WEIGHTS[p] * value for p, value in coverage.items())))
    judged = min(details["SALES_STREAK"]["judged"], details["PROFIT_STREAK"]["judged"])
    enough = sum(num(v) is not None for v in sales_q) >= 4 or sum(num(v) is not None for v in d.get("sales_y", [])) >= 2
    status = "NOT RATED" if confidence < .5 or not enough else "PROVISIONAL" if confidence < .8 or judged < 6 else "RATED"
    if d.get("rating_blockers"):
        status = "NOT RATED"
    rating = "NOT RATED" if status == "NOT RATED" else label(final)
    if status == "PROVISIONAL" and rating == "STRONG":
        rating = "HEALTHY"
    for row in rows:
        share = PART_WEIGHTS[row["part"]] / total_weight * row["share"]
        row["pointsEarned"] = share * (row["points"] or 0)
        row["pointsLost"] = share * (100 - (row["points"] or 0)) if row["share"] else 0.
        row["severity"] = "NO DATA" if row["status"] in ("F", "L") else "NOT APPLICABLE" if row["status"] == "N" else "RED" if row["points"] < 40 else "AMBER" if row["points"] < 70 else "GREEN"
    actual = [row for row in rows if row["status"] in ("A", "Z", "S")]
    strengths = sorted([row for row in actual if row["points"] >= 70], key=lambda row: -row["pointsEarned"])[:3]
    weaknesses = sorted([row for row in actual if row["points"] < 40], key=lambda row: -row["pointsLost"])[:3]
    alerts = list(d.get("rating_blockers", [])) + list(d.get("rating_cautions", []))
    if status != "RATED": alerts.append(f"{status}: {confidence * 100:.0f}% data confidence and {judged} comparable quarters.")
    filled = [row["label"] for row in rows if row["status"] == "F"]
    if filled: alerts.append("Filled using the supplied group snapshot: " + ", ".join(filled) + ".")
    if statuses.get("PLEDGE") == "L": alerts.append("Promoter pledge is unknown; excluded from the Risk score and counted as missing in confidence.")
    if values.get("PLEDGE") is not None and values["PLEDGE"] >= 25: alerts.append("Promoter pledged shares are at least 25%.")
    if loss: alerts.append("Trailing EPS is zero or negative.")
    if negative_nw: alerts.append("Net worth is zero or negative.")
    if values.get("INTEREST_COVER") is not None and values["INTEREST_COVER"] < 1.5: alerts.append("Interest cover is below 1.5 times.")
    if cap: alerts.append("Weak-business rule capped Valuation at 60.")
    if judged < 10: alerts.append(f"Short record: streak scores reflect the available comparable quarters ({judged}/10 minimum across sales and profit).")
    for metric, series in (("Sales", sales_q), ("Net profit", profit_q)):
        if len(series) >= 6 and all(num(series[i]) is not None for i in (-1, -2, -5, -6)) and series[-1] <= series[-5] and series[-2] <= series[-6]:
            alerts.append(f"{metric} did not beat last year in either of the latest two quarters; the growth run is broken.")
    best_part = max(parts, key=lambda p: PART_WEIGHTS[p] * (parts[p] or 0))
    worst_part = max(parts, key=lambda p: PART_WEIGHTS[p] * (100 - (parts[p] or 0)))
    headline = "Not rated: insufficient verified inputs or unresolved data integrity issues." if status == "NOT RATED" else f"{rating.title()} assessment: {best_part.title()} contributes most to the score; {worst_part.title()} accounts for the largest shortfall."
    return {"modelVersion": "3.6.5-bank" if group == "BANK" else MODEL_VERSION, "baselineVersion": BASELINE_VERSION, "fillVersion": FILL_VERSION,
            "group": group, "final": final if status != "NOT RATED" else None, "label": rating, "status": status,
            "confidence": confidence, "coverage": coverage, "dataIntegrityStatus": "REVIEW REQUIRED" if d.get("rating_cautions") or d.get("rating_blockers") else "PASS", "parts": parts, "partWeights": PART_WEIGHTS,
            "judgedQuarters": judged, "metrics": rows, "strengths": strengths, "weaknesses": weaknesses,
            "flags": [row for row in actual if row["points"] < 70], "alerts": alerts,
            "valuationCapped": bool(cap), "capPointsLost": cap, "headline": headline}
