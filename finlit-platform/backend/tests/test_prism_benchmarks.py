"""Task #160: the industry median P/E and P/B FinLit sends with each Prism report request."""
import asyncio
import math
from types import SimpleNamespace

from finlit import prism_benchmarks as pb

NAN = math.nan


def table(rows):
    """rows: (symbol, industry, sector_label, sector, pe, pb)"""
    return SimpleNamespace(
        pos={r[0]: i for i, r in enumerate(rows)}, loaded=1763164800,
        industry=[r[1] for r in rows], sector_label=[r[2] for r in rows], sector=[r[3] for r in rows],
        cols={"pe": [r[4] for r in rows], "pb": [r[5] for r in rows]})


NBFC = "Non Banking Financial Company (NBFC)"
ROWS = [("BAJFINANCE", NBFC, NBFC, "Financial Services", 32.0, 5.5)] + [
    (f"N{i}", NBFC, NBFC, "Financial Services", pe, 2.0 + i / 10) for i, pe in enumerate([10, 12, 14, 16, 18, 20, NAN, 900.0])] + [
    ("HDFCBANK", "Private Sector Bank", "Private Sector Bank", "Financial Services", 19.0, 2.7)]


def test_median_of_the_companys_industry_without_itself():
    out = {b["key"]: b for b in pb.industry_benchmarks(table(ROWS), "bajfinance")}
    # positive P/Es of the 8 other NBFCs (the missing one left out): 10,12,14,16,18,20,900 -> median 16; the company's own 32 is not counted
    assert out["pe"] == {"key": "pe", "value": 16.0, "count": 7, "scope": "industry", "group": NBFC, "asOf": "2025-11-15"}
    assert out["pb"]["count"] == 8 and out["pb"]["scope"] == "industry"


def test_falls_back_to_the_sector_when_the_industry_is_too_small():
    out = {b["key"]: b for b in pb.industry_benchmarks(table(ROWS), "HDFCBANK")}
    assert out["pe"]["scope"] == "sector" and out["pe"]["group"] == "Financial Services" and out["pe"]["count"] == 8


def test_nothing_is_sent_without_enough_companies_or_for_an_unknown_symbol():
    small = table(ROWS[:4])
    assert pb.industry_benchmarks(small, "BAJFINANCE") == []
    assert pb.industry_benchmarks(table(ROWS), "NOPE") == []
    losses = table([(s, i, l, sec, -5.0, NAN) for s, i, l, sec, _, _ in ROWS])
    assert pb.industry_benchmarks(losses, "BAJFINANCE") == []


def test_a_failing_table_never_stops_the_report(monkeypatch):
    async def boom(store, force=False):
        raise RuntimeError("db down")
    monkeypatch.setattr("finlit.screener.data.get_table", boom)
    monkeypatch.setattr(pb, "_loading", None)
    assert asyncio.run(pb.for_report(object(), "BAJFINANCE")) == []


def test_for_report_uses_the_table(monkeypatch):
    async def ok(store, force=False):
        return table(ROWS)
    monkeypatch.setattr("finlit.screener.data.get_table", ok)
    monkeypatch.setattr(pb, "_loading", None)
    out = asyncio.run(pb.for_report(object(), "BAJFINANCE"))
    assert [b["key"] for b in out] == ["pe", "pb"]
