"""Load the analyst's filled company sheet (launch/company-rows-first-50.csv) into the Stress Lab exposure table (task 79).

    python scripts/stress_company_rows.py filled.csv            # check only: prints what would change, writes nothing
    python scripts/stress_company_rows.py filled.csv --write    # also writes finlit_technicals/data/industry_exposure.json

Rules (so a wrong or unsourced number cannot get in):
  * a setting is loaded only when its `<setting>_new` cell is filled AND its `<setting>_where_found` cell says where (report and page);
  * a row with any new value needs `annual_report_year`;
  * values are shares from 0 to 1 (a trailing % is accepted: 12% = 0.12);
  * the raw-material shares (crude, imported, metal, farm) and the revenue shares (export, crude-linked) are one mix each, so when one of
    a mix is given the others are kept at their current value (the `<setting>_now` cell), never reset to 0;
  * every row must still build a valid exposure (shares of a mix add up to 1 or less), or the whole file is refused.
Blank cells keep the industry value. Nothing is guessed.
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from typing import Dict, List, Tuple

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
from finlit_technicals import stress as S  # noqa: E402

TABLE = BACKEND / "finlit_technicals" / "data" / "industry_exposure.json"
SETTINGS = ("export_rev", "import_rm", "crude_rm", "metal_rm", "agri_rm", "energy_opex", "floating_debt", "crude_rev")
MIXES = (("crude_rm", "import_rm", "metal_rm", "agri_rm"), ("export_rev", "crude_rev"))


def share(text: str, where: str) -> float:
    t = text.strip().replace(",", "")
    try:
        v = float(t[:-1]) / 100 if t.endswith("%") else float(t)
    except ValueError:
        raise ValueError(f"{where}: '{text}' is not a number")
    if not 0.0 <= v <= 1.0:
        raise ValueError(f"{where}: {text} is outside 0 to 1 (write 12% or 0.12)")
    return v


def rows_from_csv(path: Path) -> Tuple[Dict[str, dict], List[str]]:
    """-> ({SYMBOL: company entry}, [errors])."""
    out: Dict[str, dict] = {}
    errors: List[str] = []
    with open(path, newline="", encoding="utf-8-sig") as fh:
        for n, row in enumerate(csv.DictReader(fh), start=2):
            sym = (row.get("symbol") or "").strip().upper()
            if not sym:
                continue
            given: Dict[str, float] = {}
            where: Dict[str, str] = {}
            bad = False
            for k in SETTINGS:
                new = (row.get(f"{k}_new") or "").strip()
                if not new:
                    continue
                src = (row.get(f"{k}_where_found") or "").strip()
                if not src:
                    errors.append(f"row {n} {sym}: {k} has a value but no 'where found' (report and page)")
                    bad = True
                    continue
                try:
                    given[k] = share(new, f"row {n} {sym} {k}")
                    where[k] = src
                except ValueError as exc:
                    errors.append(str(exc))
                    bad = True
            if bad or not given:
                continue
            year = (row.get("annual_report_year") or "").strip()
            if not year:
                errors.append(f"row {n} {sym}: annual_report_year is empty")
                continue
            entry = dict(given)
            for mix in MIXES:                                  # one mix: the parts not given keep their current value
                if any(k in given for k in mix):
                    for k in mix:
                        if k not in given:
                            try:
                                entry[k] = share(row.get(f"{k}_now") or "0", f"row {n} {sym} {k}_now")
                            except ValueError as exc:
                                errors.append(str(exc))
            entry["note"] = f"{year} annual report: " + "; ".join(f"{k} {src}" for k, src in where.items())
            out[sym] = entry
    return out, errors


def check(table: dict, rows: Dict[str, dict]) -> List[str]:
    """Each row must give a valid exposure on top of the table (the shares of a mix add up to 1 or less)."""
    errors = []
    probe = {**table, "companies": {**table.get("companies", {}), **rows}}
    t = S.ExposureTable(probe)
    for sym in rows:
        try:
            t.lookup(symbol=sym)
        except ValueError as exc:
            errors.append(f"{sym}: {exc}")
    return errors


def write_companies(path: Path, rows: Dict[str, dict]) -> None:
    """Replace only the `companies` block, which is the last key of the file, so the rest of the hand-formatted table is untouched."""
    raw = path.read_text(encoding="utf-8")
    cut = raw.index('  "companies":')
    merged = {**json.loads(raw).get("companies", {}), **rows}
    lines = ",\n".join(f"    {json.dumps(k)}: {json.dumps(merged[k], ensure_ascii=False)}" for k in sorted(merged))
    block = '  "companies": {\n' + lines + "\n  }\n}\n" if merged else '  "companies": {}\n}\n'
    path.write_text(raw[:cut] + block, encoding="utf-8")
    json.loads(path.read_text(encoding="utf-8"))          # still valid JSON, or this raises


def main(argv: List[str]) -> int:
    if not argv or argv[0].startswith("-"):
        print(__doc__)
        return 2
    rows, errors = rows_from_csv(Path(argv[0]))
    table = json.loads(TABLE.read_text(encoding="utf-8"))
    errors += check(table, rows) if not errors else []
    for e in errors:
        print("ERROR", e)
    if errors:
        print(f"{len(errors)} problem(s): nothing written.")
        return 1
    print(f"{len(rows)} company row(s) ready: {', '.join(sorted(rows)) or 'none'}")
    if "--write" in argv:
        write_companies(TABLE, rows)
        print(f"written to {TABLE.relative_to(BACKEND)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
