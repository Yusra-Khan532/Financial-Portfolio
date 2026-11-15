"""Task #132 and the site rule "no cut-offs, weights, formulas or look-back lengths on pages": the Health Score texts never name a look-back window, and texts
already stored by an earlier scoring run are cleaned on the way out."""
import json
import re
from pathlib import Path

from finlit.mfscore.api import _plain_lines, plain_text

TEXTS = json.loads((Path(__file__).parent.parent / "finlit" / "mfscore" / "reasons.json").read_text(encoding="utf-8"))
LOOKBACK = re.compile(r"three years|months compared|\{why\}|of the weight", re.I)


def test_no_reason_text_names_a_look_back_window():
    bad = [(k, side, t) for k, spec in TEXTS["metrics"].items() if isinstance(spec, dict) for side in ("strong", "weak") if isinstance((t := spec.get(side)), str)
           and LOOKBACK.search(t) and k != "EXIT_LOAD"]
    assert bad == []


def test_texts_stored_before_are_cleaned_on_the_way_out():
    assert plain_text("It did at least as well as the median similar fund in 44% of the months compared (36 months compared).") == \
        "It did at least as well as the median similar fund in 44% of months."
    assert plain_text("Its biggest month-end fall over three years, 10.0%, is smaller than the similar-fund median of 16.4%.") == \
        "Its biggest month-end fall, 10.0%, is smaller than the similar-fund median of 16.4%."
    assert plain_text("Its worst month in the last three years was -8.1%, mild for this kind of fund.") == "Its worst month was -8.1%, mild for this kind of fund."
    assert plain_text("It spent 40% of the last three years below its previous high.") == "It spent 40% of the time below its previous high."
    assert plain_text("Its 3-year return of 17.9% a year is 2.1 pp above the median of 35 similar funds (15.8%).") == \
        "Its 3-year return of 17.9% a year is 2.1 pp above the median of 35 similar funds (15.8%)."     # a return's own period is what it measures: kept
    lines = _plain_lines([{"id": "HIT_RATE", "label": "Months", "text": "in 44% of the months compared (36 months compared)."}, "not a dict"])
    assert lines[0]["text"] == "in 44% of months." and lines[1] == "not a dict"
