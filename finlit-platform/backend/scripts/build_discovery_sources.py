"""Build finlit/discovery/sources.json from the Investor Presentation Keyword Directory v3 (task #267): Part 2 "Earnings Call Transcript Keywords"
(8 "Call: ..." buckets, 87 keywords) and Part 3 "Results Filing Keywords" (7 "Results: ..." buckets, 101 keywords). Part 1 (the 21 investor
presentation themes, 166 keywords) stays in directory.json as it is.

    python scripts/build_discovery_sources.py directory.pdf     # needs poppler's pdftotext

The tables are read from the word positions (`pdftotext -tsv`), not from the text layout: each word goes to the column whose header ("Keyword /
phrase", "Related terms", "What to verify") it sits under, a row ends at the gap before the next one, and a row that runs over a page break is
joined (its "What to verify" has not ended with a full stop yet). Bucket headings are the 11 pt lines; a heading that wraps is joined. The build
stops unless it finds the PDF's own counts: 8 + 7 buckets, 87 + 101 keywords, every keyword with at least 10 related terms and a "What to verify"."""
from __future__ import annotations

import json
import re
import subprocess  # nosec B404 - runs poppler's pdftotext on a local file, fixed arguments
import sys
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List

OUT = Path(__file__).resolve().parents[1] / "finlit" / "discovery" / "sources.json"
EXPECTED = {"calls": (8, 87), "results": (7, 101)}
PART = {"Part 2": "calls", "Part 3": "results"}


def words_of(pdf: str) -> List[tuple]:
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "w.tsv"
        subprocess.run(["pdftotext", "-tsv", pdf, str(out)], check=True)  # nosec B603 B607 - fixed arguments
        lines = out.read_text(encoding="utf-8").splitlines()
    ws = []
    for line in lines:
        f = line.split("\t")
        if f[0] != "5" or float(f[7]) > 800:          # words only; the page footer sits below 800 pt
            continue
        ws.append((int(f[1]), round(float(f[7]), 1), float(f[6]), float(f[9]), f[11]))
    return ws


def parse(ws: List[tuple]) -> Dict[str, List[Dict[str, Any]]]:
    lines: Dict[tuple, list] = defaultdict(list)
    for p, t, left, h, x in ws:
        lines[(p, t)].append((left, h, x))
    parts: Dict[str, List[Dict[str, Any]]] = {}
    part = bucket = cols = prev = head = None
    for key in sorted(lines):
        row = sorted(lines[key])
        h, text = max(w[1] for w in row), " ".join(w[2] for w in row)
        if h > 14:                                    # "Part 2: Earnings Call Transcript Keywords"
            part = PART.get(text[:6])
            bucket = prev = None
            if part:
                parts[part] = []
            continue
        if part is None:
            continue
        if 10.5 < h < 11.5:                           # a bucket heading; a second line close under it continues it
            if head and bucket is not None and not bucket["rows"] and key[0] == head[0] and key[1] - head[1] < 16:
                bucket["name"] += " " + text
            else:
                bucket = {"name": text, "rows": []}
                parts[part].append(bucket)
            head, prev = key, None
            continue
        if bucket is None or h > 7.2:                 # the part's subtitle, the screening discipline
            continue
        if text.startswith("Keyword / phrase"):
            cols = ([w[0] for w in row if w[2] == "Related"][0], [w[0] for w in row if w[2] == "What"][0])
            continue
        kw, rel, ver = [], [], []
        for left, _, x in row:
            (kw if left < cols[0] - 4 else rel if left < cols[1] - 4 else ver).append(x)
        new_page = prev is not None and key[0] != prev[0]
        start = prev is None or (not new_page and key[1] - prev[1] > 12)
        if new_page and bucket["rows"]:
            start = " ".join(bucket["rows"][-1]["verify"]).rstrip().endswith(".")
        if start or not bucket["rows"]:
            bucket["rows"].append({"keyword": [], "related": [], "verify": []})
        r = bucket["rows"][-1]
        r["keyword"] += kw
        r["related"] += rel
        r["verify"] += ver
        prev = key
    clean = lambda ws_: re.sub(r"\s+", " ", " ".join(ws_)).strip()  # noqa: E731
    out: Dict[str, List[Dict[str, Any]]] = {}
    for name, buckets in parts.items():
        out[name] = [{"name": b["name"], "keywords": [{"keyword": clean(r["keyword"]), "related": [t.strip() for t in clean(r["related"]).split(";") if t.strip()],
                                                       "verify": clean(r["verify"])} for r in b["rows"]]} for b in buckets]
    return out


def check(out: Dict[str, List[Dict[str, Any]]]) -> None:
    for src, (nb, nk) in EXPECTED.items():
        bs = out.get(src) or []
        got = sum(len(b["keywords"]) for b in bs)
        if len(bs) != nb or got != nk:
            raise SystemExit(f"{src}: {len(bs)} buckets and {got} keywords read; the PDF says {nb} and {nk}")
        for b in bs:
            for k in b["keywords"]:
                if len(k["related"]) < 10 or not k["verify"] or not k["keyword"]:
                    raise SystemExit(f"{b['name']}: {k['keyword']!r} has {len(k['related'])} related terms / no verify line")


def main(argv: List[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    out = parse(words_of(argv[1]))
    check(out)
    data = {"source": "Investor Presentation Keyword Directory v3 (task #267 attachment): Part 2, Earnings Call Transcript Keywords (87 keywords in 8 "
                      "buckets) and Part 3, Results Filing Keywords (101 keywords in 7 buckets), each keyword with its related terms and what to verify, "
                      "read from the PDF's tables by scripts/build_discovery_sources.py.",
            **{src: {"buckets": {b["name"]: b["keywords"] for b in out[src]}} for src in EXPECTED}}
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    for src in EXPECTED:
        print(src, len(out[src]), "buckets,", sum(len(b["keywords"]) for b in out[src]), "keywords")
        for b in out[src]:
            print("   ", b["name"], len(b["keywords"]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
