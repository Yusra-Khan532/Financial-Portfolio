"""Task #349 PR 5: follow-ups keep the earlier figures (docs/ASK-AI.md "Follow-ups keep the earlier figures").

Only the words of the last three exchanges are carried into a follow-up; the tool results are not, so "and its margins?" read everything again or
lost the numbers. Each written answer now carries a compact "figures read" summary (at most CHARS characters: the key figures with their dates,
taken from the tool results that answer read, no model), sent with the `done` event. The panel keeps it on the answer and sends it back with that
turn of the history; the server puts the summaries in `<figures_read>` in the note with the follow-up question (never the system prompt, so the
system prompt and the tool list stay byte for byte the same)."""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from . import memory

CHARS = 600
INSTRUCTION = ("[<figures_read> holds the figures FinLit read for the earlier answers in this chat, each with its date. Answer a follow-up from "
               "them when they hold what is asked, with their dates; read again only what they lack.]")
_UNSAFE = re.compile(r"[<>\[\]\x00-\x1f]+")


def clean(text: Optional[str]) -> Optional[str]:
    """A summary sent back by the panel: plain text of at most CHARS characters (no tags or brackets, so it cannot close or open a block)."""
    if not isinstance(text, str):
        return None
    t = re.sub(r"\s+", " ", _UNSAFE.sub(" ", text)).strip()
    if not t:
        return None
    return t if len(t) <= CHARS else t[:CHARS - 1].rstrip(" ;,") + "…"


def _num(v: Any) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _value(v: float, unit: str) -> str:
    u = (unit or "").strip()
    if u == "Cr":
        return f"{memory.inr(round(v))} crore"
    if u == "₹":
        return memory.inr(v)
    n = f"{v:.2f}".rstrip("0").rstrip(".") if abs(v) < 1000 else f"{v:,.0f}"   # as the page states it (16.65, not 16.6)
    return f"{n}{u}" if u in ("%", "x", "×") else f"{n} {u}".strip()


def _metrics(rows: Any) -> List[str]:
    """keyMetrics (a list of {key, label, value, unit, period}) or get_ratios' `latest` (key -> {label, value, unit, period})."""
    items = rows if isinstance(rows, list) else [{"key": k, **v} for k, v in rows.items() if isinstance(v, dict)] if isinstance(rows, dict) else []
    out = []
    for r in items:
        if not isinstance(r, dict) or _num(r.get("value")) is None:
            continue
        name = str(r.get("label") or r.get("key") or "").strip()[:28]
        if not name:
            continue
        period = str(r.get("period") or "").strip()[:24]
        out.append(f"{name} {_value(_num(r['value']), str(r.get('unit') or ''))}" + (f" ({period})" if period else ""))
    return out


def _company_parts(sym: str, fig: Dict[str, Any], metrics: List[str], read_on: Optional[str]) -> Tuple[str, List[str]]:
    head = f"{sym}" + (f", read {read_on}" if read_on else "")
    parts: List[str] = []
    p = fig.get("price") or {}
    if _num(p.get("value")) is not None:
        when = memory.moment_of(p.get("asOf")) or memory.day_of(p.get("asOf")) or ""
        parts.append(f"price {memory.inr(p['value'])}" + (f" ({when})" if when else ""))
    pr = fig.get("prism") or {}
    if _num(pr.get("score")) is not None:
        on = memory.day_of(pr.get("asOf"))
        parts.append(f"FinLit Prism {memory._num_text(float(pr['score']))}" + (f" {pr['label']}" if pr.get("label") else "") + (f" ({on})" if on else ""))
    parts += metrics
    r52 = fig.get("range52") or {}
    if _num(r52.get("low")) is not None and _num(r52.get("high")) is not None:
        on = memory.day_of(r52.get("asOf"))
        parts.append(f"52-week {memory.inr(r52['low'])}–{memory.inr(r52['high'])}" + (f" ({on})" if on else ""))
    res = fig.get("results") or {}
    if res.get("filed"):
        parts.append(f"results filing {res.get('title') or res.get('period') or ''}".strip() + f" (filed {memory.day_of(res['filed'])})")
    for d in fig.get("documents") or []:
        if d.get("filed"):
            parts.append(f"{d.get('document') or 'document'} (filed {memory.day_of(d['filed'])})")
    return head, parts


def summary(tool_results: Iterable[Tuple[str, Dict[str, Any], Any]]) -> str:
    """The figures an answer read, at most CHARS characters: per company (at most two) its price, FinLit Prism, the key ratios with their periods,
    the 52-week range and the documents read, each with its date. Empty when the answer read no company figure."""
    results = list(tool_results)
    figs = (memory.extract_figures(results).get("companies") or {})
    metrics: Dict[str, List[str]] = {}
    read_on: Dict[str, str] = {}
    order: List[str] = []
    for name, args, text in results:
        env = memory._parse(text)
        if not env:
            continue
        data = env.get("data") if isinstance(env.get("data"), dict) else {}
        sym = memory._clean_id(str(data.get("symbol") or (args or {}).get("symbol") or "").upper())
        if not sym:
            continue
        if sym not in order:
            order.append(sym)
        rows = data.get("keyMetrics") if data.get("keyMetrics") is not None else data.get("latest") if name == "get_ratios" else None
        got = [m for m in _metrics(rows) if m not in metrics.get(sym, [])] if rows is not None else []
        if got:
            metrics.setdefault(sym, []).extend(got)
        if env.get("asOf") and sym not in read_on and memory.day_of(env.get("asOf")):
            read_on[sym] = memory.day_of(env["asOf"]) or ""
    lines: List[str] = []
    for sym in [s for s in order if s in figs or s in metrics][:2]:
        head, parts = _company_parts(sym, figs.get(sym, {}), metrics.get(sym, []), read_on.get(sym))
        if parts:
            lines.append(f"{head}: " + "; ".join(parts))
    text = " | ".join(lines)
    if len(text) <= CHARS:
        return text
    cut = text[:CHARS - 1]
    cut = cut[:cut.rfind("; ")] if "; " in cut else cut
    return cut.rstrip(" ;,") + "…"


def about(carried: str, symbol: str) -> bool:
    """True when the carried summaries hold figures of this company ("RELIANCE, read 23 Nov 2026: ..." or "RELIANCE: ...")."""
    return bool(re.search(r"(?:^|[-|] )" + re.escape(symbol) + r"(?:, read [^:]{1,40})?: ", carried or "", re.M))


def note(history: Sequence[Any]) -> str:
    """<figures_read> for a follow-up: the summaries the panel sent back with the earlier answers, oldest first, and the one instruction. Empty when
    no earlier answer carries one (the request is then exactly as before)."""
    rows: List[str] = []
    for t in history:
        role = t.get("role") if isinstance(t, dict) else getattr(t, "role", None)
        figs = clean(t.get("figures") if isinstance(t, dict) else getattr(t, "figures", None))
        if role == "assistant" and figs and figs not in rows:
            rows.append(figs)
    if not rows:
        return ""
    return "<figures_read>\n" + "\n".join(f"- {r}" for r in rows) + "\n</figures_read>\n" + INSTRUCTION
