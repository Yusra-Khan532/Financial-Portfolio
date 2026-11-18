"""Task #203: turn the team's question bank (docs/design/mf-etf-questions/mf_etf_question_bank.xlsx, sheet "Question bank") into the FinLit AI theme
"Mutual funds & ETFs" (frontend/src/content/mfQuestionBank.json). Run it again whenever the sheet changes:

    python3 scripts/mf_question_bank.py

Each row keeps the team's ID, segment, sub-segment, question, the field it is answered from, the data status and the page. Templated questions keep their
slots ({fund}, {fund2}, {etf}); the panel asks for the fund or ETF before answering. Nothing is invented here: the text is the sheet's, word for word."""
import json
import pathlib
import re

import openpyxl

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "docs/design/mf-etf-questions/mf_etf_question_bank.xlsx"
OUT = ROOT / "frontend/src/content/mfQuestionBank.json"


def main() -> None:
    rows = list(openpyxl.load_workbook(SRC, read_only=True)["Question bank"].iter_rows(values_only=True))
    head, body = rows[0], rows[1:]
    assert head[:7] == ("ID", "Segment", "Sub-segment", "Question (template)", "Answered from (field / source)", "Data status", "Page / route"), head
    segs: list = []
    for qid, seg, sub, text, src, status, route in (r[:7] for r in body if r and r[0]):
        m = re.match(r"^(\d+)\.\s*(.+)$", seg)
        n, title = int(m.group(1)), m.group(2).strip()
        if not segs or segs[-1]["n"] != n:
            segs.append({"n": n, "title": title, "subs": []})
        s = segs[-1]
        if not s["subs"] or s["subs"][-1]["name"] != sub:
            s["subs"].append({"name": sub, "qs": []})
        s["subs"][-1]["qs"].append([qid, " ".join(str(text).split()), src or "", status or "", route or ""])
    OUT.write_text(json.dumps({"source": SRC.name, "segments": segs}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{sum(len(q['qs']) for s in segs for q in s['subs'])} questions in {len(segs)} segments -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
