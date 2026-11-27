"""Build finlit/data/nse_classification.json from NSE Indices' "Industry Classification Structure" (task #192, 15 Nov sector pack).

NSE's four levels, each in the next: Macro-Economic Sector (12) > Sector (22) > Industry (59) > Basic Industry (197), with NSE's own codes
(IN01 > IN0101 > IN010101 > IN010101001). The lists are read from NSE's file, never typed by hand.

    python scripts/build_nse_classification.py                 # downloads the PDF (needs poppler's pdftotext)
    python scripts/build_nse_classification.py structure.pdf   # or reads a copy

Names keep NSE's spelling with its commas ("Oil, Gas & Consumable Fuels"); words the PDF wraps inside a cell are joined
("Telecommunic" + "ation"). The build stops unless it finds exactly 12 / 22 / 59 / 197 and every level has a parent.
"""
from __future__ import annotations

import csv
import io
import json
import re
import shutil
import subprocess  # nosec B404 - runs poppler's pdftotext on a local file, fixed arguments
import sys
import tempfile
import urllib.request
from pathlib import Path

URL = ("https://www.niftyindices.com/docs/default-source/default-document-library/industry-classification/"
       "nse-indices_industry-classification-structure-2023-07.pdf")
EDITION = "July 2023"
OUT = Path(__file__).resolve().parents[1] / "finlit" / "data" / "nse_classification.json"
EXPECTED = {"macro_sector": 12, "sector": 22, "industry": 59, "basic_industry": 197}

# Each level is a code column and a name column; x positions (points) of NSE's table, the same on every page.
COLUMNS = {"macro_sector": ((0, 118), (118, 195)), "sector": ((195, 248), (248, 322)),
           "industry": ((322, 375), (375, 463)), "basic_industry": ((463, 540), (540, 630))}
CODE = {"macro_sector": r"^IN\d{2}$", "sector": r"^IN\d{4}$", "industry": r"^IN\d{6}$", "basic_industry": r"^IN\d{9}$"}
FOOTER_TOP = 550          # the page footer ("NSE Indices ... Classification Structure")
HEADER_LINES = 32         # the column header is three lines tall ("Macro / Economic / Sector")
JOINERS = {"and", "of", "other", "&", "-"}   # lower-case words that really are words in these names


def words_of(pdf: Path) -> list:
    exe = shutil.which("pdftotext")
    if not exe:
        sys.exit("pdftotext (poppler) is needed: apt-get install poppler-utils")
    out = subprocess.run([exe, "-tsv", str(pdf), "-"], check=True, capture_output=True, text=True).stdout  # nosec B603
    rows = csv.DictReader(io.StringIO(out), delimiter="\t", quoting=csv.QUOTE_NONE)
    return [r for r in rows if r["level"] == "5" and r["text"].strip()]


JOINED: list = []   # every word joined across a line break, printed by main() so a wrong join is seen


def join(parts: list, whole: set) -> str:
    """Words of one cell in reading order, as (text, line top). A word the PDF broke at the cell's edge ("Telecommunic" at the end of
    one line, "ation" at the start of the next) is joined: a lower-case start of a new line after a word that ends in lower case and is
    not a whole word anywhere else in NSE's table, and the new line's word is not one either ("Diversified", "line" and "services" are, so
    "Diversified consumer products" and "Fixed line services" keep their words)."""
    out: list = []
    last_top = None
    for text, top in parts:
        new_line = last_top is not None and abs(top - last_top) > 1
        if (out and new_line and text[:1].islower() and text not in JOINERS and out[-1][-1:].islower()
                and out[-1].strip(",").lower() not in whole and text.strip(",").lower() not in whole):
            JOINED.append(out[-1] + "|" + text)
            out[-1] += text
        else:
            out.append(text)
        last_top = top
    return " ".join(out)


def parse(words: list) -> dict:
    header_bottom = {w["page_num"]: float(w["top"]) + HEADER_LINES for w in words if w["text"] == "MES_Code"}
    current = {k: None for k in COLUMNS}
    cells = {k: {} for k in COLUMNS}
    for w in sorted(words, key=lambda w: (int(w["page_num"]), round(float(w["top"])), float(w["left"]))):
        page, top, x, text = w["page_num"], float(w["top"]), float(w["left"]), w["text"]
        if page not in header_bottom or top <= header_bottom[page] or top >= FOOTER_TOP:
            continue
        for level, ((c0, c1), (n0, n1)) in COLUMNS.items():
            if c0 <= x < c1 and re.match(CODE[level], text):
                current[level] = text
                cells[level].setdefault(text, [])
            elif n0 <= x < n1 and current[level]:
                cells[level][current[level]].append((text, top))
    # a word counts as whole when it appears in the table other than at the end of a line that the next line could continue
    whole = set()
    for d in cells.values():
        for parts in d.values():
            for i, (text, top) in enumerate(parts):
                ends_line = i + 1 == len(parts) or abs(parts[i + 1][1] - top) > 1
                if not ends_line:
                    whole.add(text.strip(",").lower())
    names = {level: {code: join(parts, whole) for code, parts in d.items()} for level, d in cells.items()}
    counts = {level: len(d) for level, d in names.items()}
    if counts != EXPECTED:
        sys.exit(f"unexpected counts {counts}, expected {EXPECTED}: has NSE changed the file's layout?")
    rows = []
    for code, name in sorted(names["basic_industry"].items()):
        row = {"basic_industry_code": code, "basic_industry": name,
               "industry_code": code[:8], "industry": names["industry"].get(code[:8]),
               "sector_code": code[:6], "sector": names["sector"].get(code[:6]),
               "macro_sector_code": code[:4], "macro_sector": names["macro_sector"].get(code[:4])}
        if None in row.values() or "" in row.values():
            sys.exit(f"incomplete row: {row}")
        rows.append(row)
    return {"source": URL, "edition": EDITION, "counts": counts, "basic_industries": rows}


def main() -> None:
    if len(sys.argv) > 1:
        pdf = Path(sys.argv[1])
    else:
        pdf = Path(tempfile.mkdtemp()) / "structure.pdf"
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (FinLit classification build)"})
        with urllib.request.urlopen(req, timeout=60) as r, open(pdf, "wb") as fh:  # nosec B310 - fixed https URL
            fh.write(r.read())
    data = parse(words_of(pdf))
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT}: {data['counts']}; words joined across a line break: {sorted(set(JOINED)) or 'none'}")


if __name__ == "__main__":
    main()
