"""Task #328 (developer file 27, C): a results filing's key points leave out table rows and name lists; real statements stay."""
from finlit.docscore import service as S


def test_table_rows_and_name_lists_are_listlike():
    assert S.listlike("Payment of Dividend to Equity Holders of the Company Payment of Dividend to Non-Controlling Interest Proceeds from Borrowings Repayment of Borrowings")
    assert S.listlike("(FZE); Rose Entertainment Private Limited; RP Chemica ls (Malaysia) Sdn. Bhd.; Reliance Retail Limited")
    assert S.listlike("Revenue from operations 2,58,027 2,36,217 2,31,535 9,04,000 8,99,041")
    assert S.listlike("Other income 4,876 4,947 3,880 17,978")
    assert S.listlike("Jio Platforms Limited, Reliance Retail Ventures Limited and Reliance New Energy Limited")


def test_statements_are_not_listlike():
    assert not S.listlike("Record quarterly PAT: ₹29,550 crore (+33.8% YoY) PAT hit an all-time high, taking H1 FY27 PAT past the ₹50,000 crore milestone")
    assert not S.listlike("The auditors have expressed an unmodified opinion on the financial results for the quarter ended 30 September 2026.")
    assert not S.listlike("Revenue grew 9.9% to ₹2,58,027 crore, led by higher volumes in the retail and digital businesses.")
    assert not S.listlike("")


def _pt(i, text, score, hard=False, theme="GROWTH"):
    return {"id": i, "page": 1, "section": None, "text": text, "score": score, "band": "green", "theme": theme, "rules": "", "hard": hard, "weight": 1.0, "status": "scored"}


def _doc(points):
    return {"points": points, "themes": [], "score": 60, "band": "yellow", "confidence": "High", "hardTriggers": 0, "capped": False, "mixed": False,
            "boundary": False, "counts": {"scored": len(points), "found": len(points)}, "share": None, "params": None, "lexicon": "x"}


def test_results_filing_key_points_skip_listlike_points_only_for_results():
    row = _pt("a", "Revenue from operations 2,58,027 2,36,217 2,31,535 9,04,000", 95)
    names = _pt("b", "Rose Entertainment Private Limited; RP Chemicals (Malaysia) Sdn. Bhd.", 90, theme="RISK")
    hard = _pt("c", "Material uncertainty related to going concern; Alpha Limited; Beta Limited", 10, hard=True, theme="RISK")
    ok = _pt("d", "Net profit rose 14% from a year ago on higher retail and digital earnings.", 80)
    d = _doc([row, names, hard, ok])
    keys = [p["id"] for p in S.shape(d, "R")["keyPoints"]]
    assert keys == ["c", "d"]                        # the hard trigger always stays; the row and the name list are left out
    assert [p["id"] for p in S.shape(d, "R")["points"]] == ["a", "b", "c", "d"]   # Every point still lists them
    assert {p["id"] for p in S.shape(d, "P")["keyPoints"]} == {"a", "b", "c", "d"}  # other documents unchanged
