"""Calculate on-demand reports from explicit model inputs without storing report history."""
from datetime import datetime, timezone, date
import hashlib
import json
try:
    from .premium_data import fetch_inputs, adapt_inputs, peer_benchmark, profile_from
    from .premium_engine import score_company
    from .premium_trace import build_calculation_trace
    from .premium_recovery import recover_inputs
except ImportError:
    from premium_data import fetch_inputs, adapt_inputs, peer_benchmark, profile_from
    from premium_engine import score_company
    from premium_trace import build_calculation_trace
    from premium_recovery import recover_inputs


def generate_report(get, symbol, name, statement_type, report_id, created_at, fallback_load=None):
    now = datetime.now(timezone.utc)
    raw, sources = fetch_inputs(get, symbol, statement_type, now)
    recovery = []
    if fallback_load:
        raw, recovery = recover_inputs(raw, statement_type, now.date(), lambda section: fallback_load(symbol, profile_from(raw), statement_type, section))
    inputs, group, profile, meta, warnings, trends = adapt_inputs(raw, symbol, now.date(), statement_type)
    meta['dataRecovery'] = recovery
    if any('recovered periods' in note or 'complete Upstox' in note for note in recovery):
        sources.append({"section": "Upstox recovery (see data-quality notes for inputs and periods)", "available": True,
                        "retrievedAt": now.isoformat(), "notes": recovery})
    warnings.extend(recovery)
    # Match benchmark observations to the report price date, not a later market close.
    try: benchmark_date = date.fromisoformat(meta.get("priceAsOf") or now.date().isoformat())
    except ValueError: benchmark_date = now.date()
    benchmarks, benchmark_meta = peer_benchmark(get, raw.get("peers", {}), statement_type, min(benchmark_date, now.date()))
    inputs.update(benchmarks)
    rating = score_company(inputs, group)
    if any(not source["available"] for source in sources):
        warnings.append("Some provider requests failed. Missing metrics are explicitly identified in the scorecard; values were not guessed.")
    if not benchmarks:
        warnings.append("No verified industry valuation medians were available. Corresponding valuation metrics use group fills and reduce data confidence.")
    return {"id": report_id, "state": "ready", "createdAt": created_at, "completedAt": datetime.now(timezone.utc).isoformat(),
            "statementType": statement_type, "company": {"symbol": symbol, "name": profile.get("name") or name or symbol,
                "industry": profile.get("industry"), "sector": profile.get("sector"), "description": profile.get("description")},
            "rating": rating, "calculationTrace": build_calculation_trace(inputs, rating, meta), "inputs": inputs, "inputMeta": meta, "warnings": warnings,
            "sources": sources, "trends": trends, "benchmark": benchmark_meta,
            "inputHash": hashlib.sha256(json.dumps(inputs, sort_keys=True, allow_nan=False).encode()).hexdigest()}
