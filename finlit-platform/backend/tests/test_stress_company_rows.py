"""The company-rows loader (task 79): a value gets in only with its source, a mix is never reset by accident, an impossible row is refused."""
import csv
import importlib.util
import json
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("stress_company_rows", BACKEND / "scripts" / "stress_company_rows.py")
L = importlib.util.module_from_spec(spec)
spec.loader.exec_module(L)

COLS = ["symbol"] + [f"{k}_{s}" for k in L.SETTINGS for s in ("now", "new", "where_found")] + ["annual_report_year"]


def sheet(tmp_path, *rows):
    p = tmp_path / "rows.csv"
    with open(p, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=COLS)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    return p


TABLE = json.loads(L.TABLE.read_text(encoding="utf-8"))


def test_a_sourced_value_is_loaded_and_the_rest_of_its_mix_keeps_its_current_value(tmp_path):
    p = sheet(tmp_path, {"symbol": "TITAN", "crude_rm_now": "0.1", "import_rm_now": "0.3", "metal_rm_now": "0.2", "agri_rm_now": "0",
                         "import_rm_new": "55%", "import_rm_where_found": "Board report p.41", "energy_opex_new": "0.04", "energy_opex_where_found": "Note 29 p.210", "annual_report_year": "FY26"})
    rows, errors = L.rows_from_csv(p)
    assert errors == []
    e = rows["TITAN"]
    assert e["import_rm"] == 0.55 and e["crude_rm"] == 0.1 and e["metal_rm"] == 0.2 and e["energy_opex"] == 0.04   # the mix keeps what it had
    assert "FY26 annual report" in e["note"] and "Board report p.41" in e["note"]
    assert L.check(TABLE, rows) == []


def test_a_value_without_its_source_or_the_report_year_is_refused(tmp_path):
    _, errors = L.rows_from_csv(sheet(tmp_path, {"symbol": "A", "export_rev_new": "0.2", "annual_report_year": "FY26"}))
    assert any("no 'where found'" in e for e in errors)
    _, errors = L.rows_from_csv(sheet(tmp_path, {"symbol": "B", "export_rev_new": "0.2", "export_rev_where_found": "p.3"}))
    assert any("annual_report_year" in e for e in errors)


def test_out_of_range_and_impossible_rows_are_refused_and_blank_rows_change_nothing(tmp_path):
    _, errors = L.rows_from_csv(sheet(tmp_path, {"symbol": "C", "export_rev_new": "20", "export_rev_where_found": "p.3", "annual_report_year": "FY26"}))
    assert any("outside 0 to 1" in e for e in errors)
    rows, errors = L.rows_from_csv(sheet(tmp_path, {"symbol": "D", "annual_report_year": "FY26"}))
    assert rows == {} and errors == []
    rows, _ = L.rows_from_csv(sheet(tmp_path, {"symbol": "E", "crude_rm_new": "0.7", "crude_rm_where_found": "p.1", "import_rm_now": "0.5", "annual_report_year": "FY26"}))
    assert L.check(TABLE, rows)      # 70% crude + 50% imported is more than all of the raw materials


def test_writing_replaces_only_the_companies_block(tmp_path):
    copy = tmp_path / "industry_exposure.json"
    copy.write_text(L.TABLE.read_text(encoding="utf-8"), encoding="utf-8")
    before = copy.read_text(encoding="utf-8")
    L.write_companies(copy, {"TITAN": {"import_rm": 0.55, "note": "FY26 annual report: import_rm p.41"}})
    after = copy.read_text(encoding="utf-8")
    cut = before.index('  "companies":')
    assert after[:cut] == before[:cut]                                  # everything above is byte for byte the same
    assert json.loads(after)["companies"]["TITAN"]["import_rm"] == 0.55
    assert L.S.ExposureTable(json.loads(after)).lookup(symbol="TITAN").import_rm == 0.55
