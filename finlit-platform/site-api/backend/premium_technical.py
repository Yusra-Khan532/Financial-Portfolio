"""Scoring-only ST/LT v14.3 port; additive to the financial-health model.

Pine defines formulas; FinEdge, calculations and Upstox supply the observations.
No missing signal is filled or silently removed from the denominator.
"""
from datetime import date, timedelta
from pathlib import Path
import hashlib
import json
import logging
import os
import shutil
import subprocess

try:
    from .technical_series import ema, rma, rsi, macd, atr_adx, obv, weekly_closes, fit_range
except ImportError:
    from technical_series import ema, rma, rsi, macd, atr_adx, obv, weekly_closes, fit_range

try:
    from .financial_records import field_date, first, items, num
except ImportError:
    from financial_records import field_date, first, items, num


MODEL_VERSION = "st-lt-14.3"
SOURCE_SHA256 = "8fd234be9c7c76f750eb315530f525e9a8b8359ee90efbb183e524f8e618e078"
# Keys, reader labels and source weights. The last slot is reserved for a reason.
ST = (
    ("ema_stack", "EMA alignment", 10, None),
    ("price_ema20", "Price and short-term trend", 8, None),
    ("macd", "Daily MACD", 6, None),
    ("rsi", "Daily RSI", 8, None),
    ("obv", "Buying and selling volume", 4, None),
    ("rs_rating", "Relative strength rating", 8, None),
    ("extension", "Price extension", 4, None),
    ("consolidation", "9 EMA consolidation", 10, None),
    ("squeeze", "Volatility squeeze", 5, None),
    ("gap", "Opening gap", 3, None),
    ("sector", "Sector relative strength", 4, None),
    ("candles", "Candle and price action", 10, None),
    ("sfp", "Swing failure", 8, None),
    ("leadership", "Relative strength leadership", 6, None),
    ("value_migration", "Value-area migration", 6, None),
)
LT = (
    ("stage", "Market stage", 18, None),
    ("rs_rating", "Relative strength rating", 12, None),
    ("leadership", "Relative strength leadership", 10, None),
    ("sector", "Sector relative strength", 8, None),
    ("price_ema200", "Price vs long-term trend", 7, None),
    ("volume_persistence", "Breakout volume persistence", 7, None),
    ("sfp", "Major swing failure", 6, None),
    ("ema200_slope", "Long-term trend direction", 5, None),
    ("ema50_200", "Medium vs long-term trend", 5, None),
    ("weekly_rsi", "Weekly RSI", 5, None),
    ("weekly_macd", "Weekly MACD", 5, None),
    ("structure", "52-week price structure", 5, None),
    ("obv_trend", "Long-term volume trend", 5, None),
    ("ema100_200", "Long-term EMA alignment", 2, None),
)


def normalise_bars(payload, as_of):
    """Preserve missing/invalid observations; never manufacture OHLC from close."""
    result = {}
    for row in items(payload, "price", "quotes", "data", "prices"):
        day = field_date(row)
        if not day or day > as_of:
            continue
        aliased = {
            "open": ("open", "open_price", "openPrice"),
            "high": ("high", "high_price", "highPrice"),
            "low": ("low", "low_price", "lowPrice"),
            "close": ("close", "close_price", "closePrice"),
            "volume": ("volume", "tradedVolume"),
        }
        # The provider pads days it has no trading record for (a holiday, a missed feed) with an all-zero row. That is not a session and the chart
        # has no bar there: keep it out, as the financial-health inputs already do (premium_data). A zero beside real prices or volume stays a bad bar,
        # and a row with missing (not zero) values stays a gap. (Before this, one such row, e.g. on 3 Sep 2026, cut the usable history to the
        # bars after it and withheld both scores.)
        if all(first(row, *names) == 0 for names in aliased.values()):
            continue
        bar = {"date": day.isoformat()}
        for key, aliases in aliased.items():
            value = first(row, *aliases)
            bar[key] = value if value is not None and (value >= 0 if key == "volume" else value > 0) else None
        if all(bar[k] is not None for k in ("open", "high", "low", "close")):
            fitted = fit_range(bar["open"], bar["high"], bar["low"], bar["close"])
            if fitted is None:
                bar.update(open=None, high=None, low=None)
            else:
                bar["high"], bar["low"] = fitted
        result[day] = bar
    return [result[day] for day in sorted(result)]


def last_completed_session(now):
    """The date of the last COMPLETED daily session at `now` (any timezone): today's from 16:00 IST (the exchange closes 15:30), else yesterday's.
    Weekends and holidays are not guessed: the newest bar a provider holds up to this date is the session. The Indian date is used, never the
    container's or UTC's (a report made at 02:00 IST is still on the previous Indian day)."""
    from zoneinfo import ZoneInfo
    ist = now.astimezone(ZoneInfo("Asia/Kolkata"))
    return ist.date() if (ist.hour, ist.minute) >= (16, 0) else ist.date() - timedelta(days=1)


def has_ohlcv(bars, count=252):
    return len(bars) >= count and all(all(row[k] is not None for k in ("open", "high", "low", "close", "volume")) for row in bars[-count:])


def resolve_technical_prices(primary, provider, as_of, fallback=None):
    """Choose one series; never splice exchanges or fill absent candle values."""
    bars = normalise_bars(primary, as_of)
    provider = "Upstox" if "upstox" in str(provider).lower() else "FinEdge" if "finedge" in str(provider).lower() else provider
    notes = []
    fresh = lambda rows: bool(rows) and 0 <= (as_of - date.fromisoformat(rows[-1]["date"])).days <= 10
    if (not has_ohlcv(bars) or not fresh(bars)) and fallback:
        try:
            candidate = normalise_bars(fallback(), as_of)
            if has_ohlcv(candidate) and fresh(candidate):
                bars, provider = candidate, "Upstox"
                notes.append("Daily candles use one Upstox series because the dashboard price source did not provide complete OHLCV history.")
            else:
                notes.append("The secondary provider did not supply sufficient complete daily candles.")
        except Exception:
            notes.append("The secondary daily-candle request was unavailable.")
    return {"bars": bars, "provider": provider or "Unavailable", "notes": notes, "throughDate": as_of.isoformat()}


def score_rating(score):
    if score is None:
        return "Unavailable"
    return "Strong Buy" if score >= 50 else "Buy" if score >= 20 else "Hold" if score > -20 else "Reduce" if score > -50 else "Sell"


def combine_verdict(st, lt):
    if st is None or lt is None:
        return {"label": "Unavailable", "tone": "muted"}
    band = lambda x: 0 if x >= 20 else 2 if x <= -20 else 1
    labels = (("STRONG BUY", "BUY", "BOUNCE ONLY, DON'T INVEST"),
              ("ACCUMULATE ON DIPS", "HOLD", "REDUCE"),
              ("BUY THE DIP, WAIT FOR ST TURN", "REDUCE", "SELL / AVOID"))
    tones = (("positive", "positive", "caution"), ("positive", "caution", "negative"), ("positive", "negative", "negative"))
    a, b = band(st), band(lt)
    return {"label": labels[a][b], "tone": tones[a][b]}


# A short price history (a recent listing, a demerged company, or history cut after an unadjusted corporate action). The long-term relative-strength
# rating ranks the stock's own 252-session excess return against the 252 sessions before it, so it needs about 505 daily candles (two years); other
# signals need 50 to 252 (technical_scoring.HISTORY_NEED). Task #247 (19 Nov 2026, Fractal Analytics and the Vedanta demerged companies): a horizon
# whose ONLY missing signals are ones the company's history is too short for, with at least PROVISIONAL_MIN_SHARE of the weight available (and, for
# the long term, the market stage known), is worked out from the available signals' weights and marked provisional. Any other gap still withholds it.
PROVISIONAL_BELOW_BARS = 505
PROVISIONAL_MIN_SHARE = 0.75
PROVISIONAL_NOTE = ("Provisional: this company has {bars} sessions of daily prices; {missing}. So this score uses the other {n} signals and counts their "
                    "weights only. It is shown as provisional and is not used by the screeners.")
HISTORY_NOTE = ("Not available yet: this company has {bars} sessions of daily prices, from {since}. This view is shown from about {need} sessions, "
                "about {more} more trading sessions.")


def _needs_text(rows, needs):
    """'the relative strength rating needs 505' / 'the daily RSI needs 200 and the relative strength rating needs 252'."""
    parts = []
    for row in rows:
        label = row["label"] if row["label"][:2].isupper() else row["label"][0].lower() + row["label"][1:]
        parts.append(f"the {label} needs {needs[row['key']]}" if needs and row["key"] in needs else f"the {label} needs a longer history")
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]


def ready_from(specs, needs, sector_enabled=False, value_enabled=True, has_stage=False):
    """The fewest sessions from which every signal this horizon has can exist with at least PROVISIONAL_MIN_SHARE of the weight (and the stage)."""
    enabled = [(key, weight) for key, _label, weight, _rule in specs
               if not ((key == "sector" and not sector_enabled) or (key == "value_migration" and not value_enabled))]
    total = sum(weight for _key, weight in enabled)
    for need in sorted({needs.get(key, 0) for key, _w in enabled}):
        share = sum(weight for key, weight in enabled if needs.get(key, 0) <= need) / total
        if share >= PROVISIONAL_MIN_SHARE and (not has_stage or needs.get("stage", 0) <= need):
            return need
    return None


def summarise_signals(specs, signals, sector_enabled=False, value_enabled=True, stage=None, allow_provisional=False, history_gaps=(), bars=None,
                      since=None, needs=None):
    """Only explicitly disabled options leave the PDF denominator. `allow_provisional` (a short price history): when every missing signal is in
    `history_gaps` (the history is too short for it), at least PROVISIONAL_MIN_SHARE of the weight is available and, where the horizon has a market
    stage, it is known, the score is worked out from the available signals' weights and marked provisional. Every other gap still withholds it.
    A horizon withheld only for its history gets `historyNote` (from `needs`: when it will be shown)."""
    rows = []
    for key, label, weight, rule in specs:
        disabled = (key == "sector" and not sector_enabled) or (key == "value_migration" and not value_enabled)
        signal, detail = signals.get(key, (None, rule or "Required complete daily OHLCV history is unavailable or too short for this signal."))
        signal = num(signal)
        if signal is not None and not -1 <= signal <= 1:
            signal, detail = None, "Signal is outside the model's permitted range."
        rows.append({"key": key, "label": label, "weight": weight, "signal": None if disabled else signal,
                     "status": "disabled" if disabled else "available" if signal is not None else "unavailable",
                     "detail": "Optional factor is switched off." if disabled else detail})
    enabled = [row for row in rows if row["status"] != "disabled"]
    known = [row for row in enabled if row["signal"] is not None]
    denominator = sum(row["weight"] for row in enabled)
    complete = len(known) == len(enabled)
    # LT stage is a mandatory safeguard as well as a scored component.
    has_stage = any(row["key"] == "stage" for row in enabled)
    if has_stage and stage not in (1, 2, 3, 4):
        complete = False
    stage_ok = not has_stage or stage in (1, 2, 3, 4)
    missing = [row for row in enabled if row["signal"] is None]
    only_history = bool(missing) and all(row["key"] in set(history_gaps) for row in missing)
    share = sum(row["weight"] for row in known) / denominator if denominator else 0
    provisional = (not complete) and allow_provisional and stage_ok and only_history and share >= PROVISIONAL_MIN_SHARE
    history_note = None
    if not complete and not provisional and only_history and bars is not None and needs:
        need = ready_from(specs, needs, sector_enabled, value_enabled, has_stage)
        if need is not None and need > bars:
            history_note = HISTORY_NOTE.format(bars=bars, since=since or "its first session", need=need, more=need - bars)
    if provisional:
        denominator = sum(row["weight"] for row in known)
    raw_score = 100 * sum(row["weight"] * row["signal"] for row in known) / denominator if (complete or provisional) else None
    score = min(raw_score, 19) if raw_score is not None and has_stage and stage in (3, 4) else raw_score
    capped = score is not None and score != raw_score
    return {"score": score, "rating": score_rating(score),
            "status": "ready" if (complete or provisional) else "incomplete", "availableCount": len(known), "requiredCount": len(enabled),
            "stageCapped": capped, **({"uncappedScore": raw_score} if capped else {}),
            **({"provisional": True, "provisionalNote": PROVISIONAL_NOTE.format(bars=bars if bars is not None else "fewer", missing=_needs_text(missing, needs), n=len(known))} if provisional else {}),
            **({"historyNote": history_note} if history_note else {}), "factors": rows}


# Task #247: a stock whose history is shorter than the model's full window (PROVISIONAL_BELOW_BARS) is scored exactly as the ST/LT v14.3 indicator
# scores it on the chart (finlit_technicals.young: young-listing mode, a row with no value read as its formula reads it, the full divisor), in a
# short-lived process of the research API's Python (it has pandas and numpy; this process does not load them). If that is not possible, the strict
# view below is used (provisional where only history is short, else withheld with the reason).
YOUNG_SECONDS = 30
log = logging.getLogger("premium.technical")
YOUNG_NOTE = ("Young listing: this company has {bars} sessions of daily prices, from {since}. As on the chart, the indicator's short-history rule is "
              "used: the rows that need a longer history (EMA 200, the 52-week figures, the relative-strength ratings, the market stage) read what they "
              "can for now, and a reading with no value yet counts as the formula counts it (0 or -1); the divisor stays the same. Shown as provisional "
              "and not used by the screeners.")


def _young_runtime():
    """(python, folder holding finlit_technicals) or None."""
    here = Path(__file__).resolve()
    roots = [os.environ.get("FINLIT_TECHNICALS_DIR"), str(here.parents[2] / "backend"), str(here.parents[2])]
    root = next((r for r in roots if r and (Path(r) / "finlit_technicals" / "young.py").is_file()), None)
    if root is None:
        return None
    pythons = [os.environ.get("FINLIT_TECHNICALS_PYTHON"), str(Path(root) / ".venv" / "bin" / "python"), "/usr/local/bin/python3", shutil.which("python3")]
    py = next((x for x in pythons if x and Path(x).is_file()), None)
    return (py, root) if py else None


def young_assessment(bars, benchmarks, shares_cr):
    """finlit_technicals.young's answer for these bars, or None (the reason is logged)."""
    runtime = _young_runtime()
    if runtime is None:
        log.warning("young-listing scores unavailable: finlit_technicals or its Python was not found")
        return None
    payload = {"bars": [{k: row[k] for k in ("date", "open", "high", "low", "close", "volume")} for row in bars],
               "benchmarks": {name: [{"date": row["date"], "close": row["close"]} for row in value.get("bars") or [] if row.get("close") is not None]
                              for name, value in (benchmarks or {}).items() if isinstance(value, dict) and value.get("bars")},
               "sharesCr": shares_cr}
    try:
        done = subprocess.run([runtime[0], "-m", "finlit_technicals.young"], input=json.dumps(payload), capture_output=True, text=True,
                              timeout=YOUNG_SECONDS, cwd=runtime[1], check=False)   # nosec B603 - fixed module, our own interpreter, no shell
        out = json.loads(done.stdout or "{}")
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        log.warning("young-listing scores failed: %s", type(exc).__name__)
        return None
    if done.returncode != 0 or not isinstance(out, dict) or "error" in out or out.get("stScore") is None or out.get("ltScore") is None:
        log.warning("young-listing scores not used: %s", (out.get("error") if isinstance(out, dict) else None) or done.stderr[-300:])
        return None
    return out


def young_horizon(specs, rows, score, note, horizon, stage_capped=False, uncapped=None):
    """One horizon in the shape summarise_signals gives, from the indicator's rows (in the model's order and labels)."""
    by_key = {}
    for row in rows:
        by_key.setdefault(row["key"], row)          # "sector" appears once per horizon
    factors = []
    for key, label, weight, _rule in specs:
        row = by_key.get(key)
        on = bool(row and row.get("on"))
        signal = num(row.get("signal")) if on else None
        factors.append({"key": key, "label": label, "weight": weight, "signal": signal,
                        "status": "disabled" if not on else "available" if signal is not None else "unavailable",
                        "detail": "Optional factor is switched off." if not on else (row.get("reading") or "")})
    enabled = [f for f in factors if f["status"] != "disabled"]
    complete = [f for f in enabled if f["status"] == "available" and "n/a" not in f["detail"]]
    return {"score": score, "rating": score_rating(score), "status": "ready", "availableCount": len(complete), "requiredCount": len(enabled),
            "stageCapped": stage_capped, **({"uncappedScore": uncapped} if stage_capped else {}), "provisional": True, "provisionalNote": note,
            "youngListing": True, "factors": factors}


def build_technical_assessment(price_input, as_of, benchmarks=None, shares_cr=None):
    try:
        from .technical_scoring import scoring_signals
    except ImportError:
        from technical_scoring import scoring_signals
    try:
        from .technical_scoring import HISTORY_NEED
        from .premium_supplied_candles import last_break
    except ImportError:
        from technical_scoring import HISTORY_NEED
        from premium_supplied_candles import last_break
    bars = price_input.get("bars", [])
    last_bad = max((i for i,row in enumerate(bars) if any(row.get(k) is None for k in ("open","high","low","close","volume"))), default=-1)
    valid = bars[last_bad+1:]
    notes = list(price_input.get("notes", []))
    # Task #247: one close-to-close move over 40% (an unadjusted demerger or split, or bad data; Vedanta on 4 May 2026) splits the series into two
    # price bases that do not compare. Whatever the provider, only the sessions after the last such move are scored, and that is said.
    brk = last_break(valid) if len(valid) > 1 else None
    if brk is not None:
        valid = valid[brk["index"]:]
        d = date.fromisoformat(brk["date"])
        cut = f"Daily prices before {d.day} {d.strftime('%b %Y')} are not used: the close moved {brk['movePct']:+.1f}% that day"
        if not any(note.startswith("Daily prices before") for note in notes):
            notes.append(cut + ", as an unadjusted corporate action (such as a demerger or a split) or a data error does. "
                         f"The view uses the {len(valid)} sessions since.")
    fresh = bool(valid) and 0 <= (as_of-date.fromisoformat(valid[-1]["date"])).days <= 10
    st, lt, observations = scoring_signals(valid, benchmarks or {}, shares_cr, as_of) if fresh else ({},{},{})
    gaps = observations.pop("historyGaps", {}) if isinstance(observations, dict) else {}
    short_history = len(valid) < PROVISIONAL_BELOW_BARS
    since = None
    if valid:
        first = date.fromisoformat(valid[0]["date"])
        since = f"{first.day} {first.strftime('%b %Y')}"
    young = young_assessment(valid, benchmarks, shares_cr) if fresh and short_history and len(valid) >= 2 else None
    if young is not None:
        note = YOUNG_NOTE.format(bars=len(valid), since=since)
        short = young_horizon(ST, young["st"], young["stScore"], note, "st")
        capped = bool(young.get("gated")) and young.get("uncappedLt") is not None and young["uncappedLt"] > young["ltScore"]
        long = young_horizon(LT, young["lt"], young["ltScore"], note, "lt", capped, young.get("uncappedLt"))
        observations = {**observations, "stage": young.get("stage"), "youngListing": True, "benchmark": young.get("benchmark") or observations.get("benchmark")}
    else:
        common = dict(allow_provisional=short_history, bars=len(valid) if fresh else None, since=since)
        short = summarise_signals(ST,st,history_gaps=gaps.get("st",()),needs=HISTORY_NEED["st"],**common)
        long = summarise_signals(LT,lt,stage=observations.get("stage"),history_gaps=gaps.get("lt",()),needs=HISTORY_NEED["lt"],**common)
    used_names = observations.get("benchmarksUsed", list((benchmarks or {}).keys()))
    for name, value in (benchmarks or {}).items():
        if name not in used_names:
            continue
        notes.extend(value.get("notes", []))
    if short["score"] is None or long["score"] is None:
        notes.append("An assessment is unavailable where required price or benchmark history is missing. Missing signals are listed below.")
    if not fresh:
        notes.append("Complete daily OHLCV history is missing or more than 10 calendar days old.")
    if last_bad>=0:
        notes.append(f"Only the {len(valid)} consecutive complete candles after the latest data gap can be used; missing candles were not filled.")
    if price_input.get("provider") == "Upstox":
        notes.append("Daily candles use Upstox. Corporate-action adjustment has not been independently verified against FinEdge's adjusted closing-price history.")
    notes.append("Scores use the latest completed daily session; weekly signals use the preceding week.")
    if shares_cr is None:
        notes.append("Shares outstanding are unavailable, so benchmark selection falls back to Nifty 500 under the model's rule.")
    digest = hashlib.sha256(json.dumps({"prices":bars,"benchmarks":benchmarks or {},"shares_cr":shares_cr,"source":SOURCE_SHA256},sort_keys=True,allow_nan=False).encode()).hexdigest()
    return {"modelVersion":MODEL_VERSION, "sourceCodeSha256":SOURCE_SHA256, "inputHash":digest, "status":"ready" if short["score"] is not None and long["score"] is not None else "incomplete",
            "asOf":bars[-1]["date"] if bars else None, "provider":price_input.get("provider","Unavailable"),
            "dailyBars":len(bars), "usableDailyBars":len(valid), "fresh":fresh, "sharesCr":shares_cr,
            "shortTerm":{**short,"horizon":"5–20 sessions"}, "longTerm":{**long,"horizon":"6–18 months"},
            "verdict":combine_verdict(short["score"],long["score"]), "notes":list(dict.fromkeys(notes)),
            "observations":observations,
            "benchmarkSources":{name:{"provider":value.get("provider"), "asOf":value["bars"][-1]["date"] if value.get("bars") else None, "bars":len(value.get("bars",[]))} for name,value in (benchmarks or {}).items()},
            "options":{"sectorRS":False,"valueMigration":True}}
