"""Checks a scores export file against the format in SPEC.md. Usage: python3 check_export.py scores_2026-11-23.json
Prints OK, or every problem found. Needs only Python 3 (no packages).

Task #326: vendored UNCHANGED from the owner's pack (FinLit_scores_export_22Nov2026/check_export.py), so the nightly export is refused by exactly the
rules the Mac applies when it downloads a day. Only this docstring differs; tests/test_scores_export.py checks the logic against the pack's copy.
Run it on a file:  python -m finlit.scores_export_check scores_2026-11-23.json.gz"""
import gzip
import json
import sys
from datetime import datetime
from typing import List

SCHEMA = 1


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v


def validate(doc) -> List[str]:
    """What is wrong with an export, in plain words (empty = usable). Used here and by the developer's checker."""
    bad: List[str] = []
    if not isinstance(doc, dict):
        return ["the file is not a JSON object"]
    if doc.get("schema") != SCHEMA:
        bad.append(f"schema is {doc.get('schema')!r}, expected {SCHEMA}")
    for k in ("date", "prev_date"):
        try:
            datetime.strptime(str(doc.get(k)), "%Y-%m-%d")
        except ValueError:
            bad.append(f"{k} is {doc.get(k)!r}, expected YYYY-MM-DD")
    if not bad and doc["prev_date"] >= doc["date"]:
        bad.append("prev_date is not before date")
    comp = doc.get("companies")
    if not isinstance(comp, list) or len(comp) < 200:
        bad.append(f"companies has {len(comp) if isinstance(comp, list) else 0} rows, expected every scored company (hundreds)")
        comp = comp if isinstance(comp, list) else []
    seen, miss = set(), {"isin": 0, "symbol": 0, "close": 0, "chg_1d_pct": 0, "prism.final": 0, "tech.st": 0, "tech.lt": 0}
    dup = 0
    for c in comp:
        if not isinstance(c, dict):
            bad.append("a companies row is not an object")
            break
        i = c.get("isin")
        if not isinstance(i, str) or len(i) != 12:
            miss["isin"] += 1
        elif i in seen:
            dup += 1
        seen.add(i)
        if not c.get("symbol"):
            miss["symbol"] += 1
        if not (_num(c.get("close")) and c["close"] > 0):
            miss["close"] += 1
        if not _num(c.get("chg_1d_pct")):
            miss["chg_1d_pct"] += 1
        if not _num((c.get("prism") or {}).get("final")):
            miss["prism.final"] += 1
        for k in ("st", "lt"):
            if not _num((c.get("tech") or {}).get(k)):
                miss[f"tech.{k}"] += 1
    n = max(1, len(comp))
    if miss["isin"] or dup:
        bad.append(f"isin: {miss['isin']} missing or not 12 characters, {dup} repeated")
    for k in ("symbol", "close"):
        if miss[k]:
            bad.append(f"{k}: missing on {miss[k]} companies")
    for k, limit in (("chg_1d_pct", 0.05), ("prism.final", 0.6), ("tech.st", 0.3), ("tech.lt", 0.3)):   # some may be unscored
        if miss[k] / n > limit:
            bad.append(f"{k}: missing on {miss[k]} of {len(comp)} companies")
    scr = doc.get("screens")
    if not isinstance(scr, list) or not scr:
        bad.append("screens is empty")
        scr = []
    ids = set()
    for s in scr:
        if not isinstance(s, dict) or not s.get("id") or not isinstance(s.get("rows"), list):
            bad.append("a screens entry lacks id or rows")
            continue
        if s["id"] in ids:
            bad.append(f"screen {s['id']} appears twice")
        ids.add(s["id"])
        unknown = sum(1 for r in s["rows"] if not isinstance(r, dict) or r.get("isin") not in seen)
        if unknown:
            bad.append(f"screen {s['id']}: {unknown} rows whose isin is not in companies")
        pos = [r.get("pos") for r in s["rows"] if isinstance(r, dict)]
        if any(not isinstance(p, int) for p in pos) or len(set(pos)) != len(pos):
            bad.append(f"screen {s['id']}: pos must be a whole number, different on every row (1 = first)")
    return bad


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python3 check_export.py <file.json or file.json.gz>")
    raw = open(sys.argv[1], "rb").read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    try:
        doc = json.loads(raw.decode("utf-8"))
    except Exception as e:
        sys.exit(f"NOT OK: the file is not valid JSON ({e})")
    bad = validate(doc)
    if bad:
        print("NOT OK:")
        for b in bad:
            print("  -", b)
        sys.exit(1)
    scored = sum(1 for c in doc["companies"] if (c.get("prism") or {}).get("final") is not None)
    print(f"OK  {doc['date']}: {len(doc['companies'])} companies ({scored} with a Prism score), {len(doc['screens'])} screens, "
          f"{sum(len(s['rows']) for s in doc['screens'])} screen rows")
    soft = [k for k in ("size", "mcap_cr", "industry", "sector", "macro_sector") if sum(1 for c in doc["companies"] if c.get(k) in (None, "")) > len(doc["companies"]) * 0.2]
    if soft:
        print("    note: often empty:", ", ".join(soft))


if __name__ == "__main__":
    main()
