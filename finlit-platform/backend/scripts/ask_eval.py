"""FinLit AI evaluation (task #240): the finance reference's example questions, asked of the real model, each answer checked against the
reference's quality checklist. The reference says to evaluate before any further training; this is that evaluation, run by hand.

Run on the server, inside the API container (the key is in /opt/finlit/.env.aws):
    docker compose -f deploy/aws/docker-compose.aws.yml exec api python scripts/ask_eval.py
    (or, from backend/: python scripts/ask_eval.py --questions 3)
It asks as a visitor would (FinLit's public data; no member's lists), prints each answer with its checks and a summary, and writes nothing to the
database. Each question uses the model once (a few tool rounds); the whole set costs about as much as ten member questions.
Exit code: 0 when every hard check passes, 1 otherwise (a fault to look at, not a job: nothing schedules this)."""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# (question, page symbol or None, checks): each check is (name, hard?, test on the answer text and the tools used)
Check = Tuple[str, bool, Callable[[str, List[str]], bool]]
NUM = re.compile(r"\d")


def has(*words: str) -> Callable[[str, List[str]], bool]:
    return lambda t, _u: all(re.search(w, t, re.I) for w in words)


def any_of(*words: str) -> Callable[[str, List[str]], bool]:
    return lambda t, _u: any(re.search(w, t, re.I) for w in words)


CASES: List[Tuple[str, Any, List[Check]]] = [
    ("What does ROCE mean?", None, [("gives the formula", True, any_of(r"EBIT", r"capital employed")),
                                    ("says how to read it or its limits", False, any_of(r"higher", r"compare", r"limit", r"sector"))]),
    ("Why did PAT fall while revenue rose for Reliance last quarter?", "RELIANCE", [
        ("looks at costs, margins, interest, depreciation, tax or one-offs", True, any_of(r"margin", r"cost", r"interest|finance cost", r"depreciation", r"tax", r"exceptional|one-off")),
        ("gives a period", True, any_of(r"Q[1-4]", r"quarter", r"FY ?20\d\d"))]),
    ("Is a PE of 45 expensive?", None, [("does not judge on P/E alone", True, any_of(r"growth", r"peers?", r"history", r"sector"))]),
    ("Which ratios matter for an NBFC?", None, [("uses NBFC measures", True, any_of(r"asset quality|GNPA|NNPA|NPA", r"capital adequacy|CRAR", r"cost of funds", r"AUM")),
                                                ("does not lead with EBITDA or debt/equity", False, lambda t, _u: not re.search(r"\bEBITDA\b", t))]),
    ("Which numbers matter most for a bank like HDFC Bank?", "HDFCBANK", [("uses bank measures", True, any_of(r"\bNIM\b|net interest margin", r"CASA", r"NPA"))]),
    ("Why did TCS share price fall after results?", "TCS", [
        ("compares results with expectations, guidance or margins", True, any_of(r"expect", r"guidance", r"margin", r"estimate"))]),
    ("Is ITC a value trap?", "ITC", [("describes evidence, gives no verdict", True, any_of(r"growth", r"cash", r"debt|leverage", r"valuation|P/E")),
                                     ("no advice words", True, lambda t, _u: not re.search(r"\b(buy|sell|avoid|accumulate)\b", t, re.I))]),
]
GLOBAL: List[Check] = [
    ("no advice (the final check)", True, lambda t, _u: not re.search(r"\byou should (buy|sell|hold|invest)|target price|multibagger|top pick", t, re.I)),
    ("short (under 160 words)", False, lambda t, _u: len(t.split()) <= 160),
]


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--questions", type=int, default=len(CASES), help="ask only the first N questions")
    args = ap.parse_args()
    import anthropic
    from finlit.api import create_app
    from finlit.ask import service
    from finlit.config import Settings
    from finlit.mcp.gateway import Gateway
    st = Settings()
    if not st.anthropic_api_key:
        print("ANTHROPIC_API_KEY is not set: nothing to evaluate.")
        return 1
    app = create_app(st)
    client = anthropic.AsyncAnthropic(api_key=st.anthropic_api_key, max_retries=1, timeout=60.0)
    report: List[Dict[str, Any]] = []
    async with app.router.lifespan_context(app):
        for q, sym, checks in CASES[: args.questions]:
            gw = Gateway(app, "localhost", "127.0.0.1")
            async def emit(_e: str, _d: Dict[str, Any]) -> None:
                return None
            try:
                res = await service.answer(client, st.ask_model, gw, service.build_messages([], q, sym, "gold"), emit)
            except Exception as e:   # one failed question is reported, the rest still run
                report.append({"question": q, "error": type(e).__name__})
                continue
            finally:
                await gw.aclose()
            text, used = res["text"], res["tools"]
            rows = [(name, hard, bool(fn(text, used))) for name, hard, fn in checks + GLOBAL]
            report.append({"question": q, "answer": text, "tools": used, "checks": rows})
            print(f"\n=== {q}\n{text}\n-- tools: {', '.join(used) or 'none'}")
            for name, hard, ok in rows:
                print(f"   [{'PASS' if ok else ('FAIL' if hard else 'note')}] {name}")
    hard_fail = sum(1 for r in report if r.get("error") or any(h and not ok for _n, h, ok in r.get("checks", [])))
    print(f"\n{len(report)} questions, {hard_fail} with a hard check failing.")
    print(json.dumps({"questions": len(report), "hardFail": hard_fail}))
    return 0 if hard_fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
