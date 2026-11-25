"""Task #382 (24 Nov 2026): the FinLit AI summary explains the meaning behind every number, read off the method's own bands and words."""
import json
import re
from pathlib import Path

from finlit.ask import prism_meaning as M
from finlit.ask import service

ROOT = Path(__file__).resolve().parents[2]
FORBIDDEN = re.compile(json.loads((ROOT / "backend" / "finlit" / "technical_wording.json").read_text(encoding="utf-8"))["forbidden"], re.I)
# The task's own example card (the team's screenshot): 58.5 Average Rated; Risk 85.5, Quality 76.6, Fundamental 58.1, Valuation 37.8; +39.1 / -31.5.
CARD = {"score": 58.5, "label": "Average", "status": "RATED", "parts": {"fundamental": 58.1, "valuation": 37.8, "quality": 76.6, "risk": 85.5},
        "technical": {"shortTerm": {"score": 39.1, "rating": "Uptrend"}, "longTerm": {"score": -31.5, "rating": "Downtrend"}, "alignment": "Bounce in a downtrend"},
        "topCons": ["Weighs on the assessment. 1 growth quarters across 10 comparable quarters."]}


def test_every_figure_of_the_task_example_has_its_band_and_meaning():
    s = "\n".join(M.meaning(CARD))
    for want in ("Overall 58.5 (Average, Rated", "Average means some parts are sound while others weigh on it",
                 "Fundamental and growth 58.1 (Average)", "Valuation 37.8 (Weak)", "the share price looks high against its earnings and its own history",
                 "Quality 76.6 (Healthy)", "Risk 85.5 (Strong)", "a higher Risk score means LOWER risk",
                 "Short-term trend +39.1 (Uptrend)", "price has mostly been rising", "Long-term trend -31.5 (Downtrend)", "price has mostly been falling",
                 "Alignment, Bounce in a downtrend", "Price has risen in recent weeks, but the longer trend is still down",
                 "the same quarter a year before", "keep them apart"):
        assert want in s, want
    # rule 2: what a high, moderate and low score is, which way is better, and what it is measured against; the trend has its own scale
    assert "Strong 80 and above, Healthy 65 to 79, Average 50 to 64, Weak 35 to 49, Poor below 35" in s and "Higher is better on all five" in s
    assert "not ranked against other companies" in s and "-100 to +100" in s and "Downtrend above -50 up to -20" in s
    assert "CANNOT" not in s and not FORBIDDEN.search(s) and not re.search(r"\b(should|consider|recommend|best)\b", s, re.I)


def test_the_bands_are_the_cards_own_at_every_edge():
    edges = re.search(r"RATING_BANDS = (\(\(.*?\)\))", (ROOT / "site-api" / "backend" / "premium_model_config.py").read_text(encoding="utf-8")).group(1)
    assert [(e, w.title()) for e, w in eval(edges)] == list(M.BANDS)       # the model's own band edges, word for word
    for v, w in ((100, "Strong"), (80, "Strong"), (79.9, "Healthy"), (65, "Healthy"), (64.9, "Average"), (50, "Average"), (49.9, "Weak"), (35, "Weak"),
                 (34.9, "Poor"), (0, "Poor"), (None, None), (float("nan"), None)):
        assert M.band(v) == w, v
    for score, word in ((50, "Strong uptrend"), (49.9, "Uptrend"), (20, "Uptrend"), (19.9, "Sideways"), (-19.9, "Sideways"), (-20, "Downtrend"),
                        (-49.9, "Downtrend"), (-50, "Strong downtrend")):     # a rating the reader does not know falls back to the score's band
        line = next(x for x in M.meaning({**CARD, "technical": {"shortTerm": {"score": score, "rating": "??"}}}) if x.startswith("Short-term"))
        assert f"({word})" in line, (score, line)
    line = next(x for x in M.meaning({**CARD, "technical": {"longTerm": {"score": -31.5, "rating": "Reduce"}}}) if x.startswith("Long-term"))
    assert "(Downtrend)" in line                                              # the model's own stored word ("Reduce") is read through the alias


def test_a_figure_that_cannot_be_read_is_flagged_never_guessed():
    s = "\n".join(M.meaning({"score": None, "label": "NOT RATED", "status": "NOT RATED", "parts": {"risk": None},
                             "technical": {"shortTerm": {"score": None}, "longTerm": {"score": -40.0, "rating": "Downtrend"}}}))
    assert "Overall: CANNOT BE INTERPRETED. Not rated" in s and "Risk: CANNOT BE INTERPRETED, no score" in s
    assert "Short-term trend: CANNOT BE INTERPRETED" in s and "Alignment: CANNOT BE INTERPRETED, not available (it needs both trend scores)" in s
    assert M.meaning({"unavailable": "Gold plan"}) == [] and M.meaning(None) == []
    prov = "\n".join(M.meaning({**CARD, "status": "PROVISIONAL", "technical": {"shortTerm": {"score": 30, "rating": "Uptrend", "provisional": True}}}))
    assert "Provisional: a first view" in prov and "short trading history" in prov


def test_the_server_sheet_and_the_page_say_the_same():
    ts = (ROOT / "frontend" / "src" / "stock" / "prismMeaning.ts").read_text(encoding="utf-8")
    for key, p in M.PARTS.items():
        for k in ("measures", "high", "mid", "low", "matters"):
            phrase = p[k].replace("LOWER", "lower")
            assert phrase in ts, (key, k, phrase)
    for text in M.OVERALL.values():
        assert text in ts
    assert M.BAND_RULE in ts and M.SCALE in ts


def test_the_summary_asks_for_each_figure_with_its_meaning_from_the_sheet():
    q = service.summary_question("SEDEMAC")
    assert service.SUMMARY_VERSION == "v5"                                     # an older cached summary (numbers only) is not served again
    assert "whatEachFigureMeans" in q and "**Valuation 37.8 (Weak)**" in q and "why it matters" in q
    assert "CANNOT BE INTERPRETED" in q and "never guess" in q and "a higher Risk score means lower risk" in q
    assert "price, not the business" in q and "apart" in q and "nothing that would fit any company" in q and "Describe, never advise" in q
