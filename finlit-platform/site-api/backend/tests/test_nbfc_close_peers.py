"""Task #160: the Prism report of an NBFC (Bajaj Finance, Capri Global) had no P/E vs industry. The provider files NBFCs in a finance industry
list of ~580 companies, above the on-demand limit of 500, so no peer median was ever calculated (banks sit in a list of ~40 and were fine).
Now the provider's shorter close-peer list of the company is used, and the page says so; a blank names its reason."""
import gzip
import json
from datetime import date
from pathlib import Path

from backend import premium_benchmarks
from backend.premium_benchmarks import PEER_UNIVERSE_LIMIT, close_peers, resolve_report_benchmarks
from backend.premium_presentation import benchmark_disclosure

ASOF = date(2026, 10, 26)
INDUSTRY = {"peers": ["NBFC0"] + [f"FIN{i}" for i in range(600)]}
CLOSE = ["NBFC0", "PEERA", "PEERB", "PEERC", "PEERD", "PEERE", "PEERF"]
PE = {"PEERA": 10, "PEERB": 20, "PEERC": 30, "PEERD": 40, "PEERE": 50, "PEERF": 60, "NBFC0": 999}


def provider(close=CLOSE, calls=None):
    def get(path, params):
        if calls is not None: calls.append(path)
        if path == "/peers/NBFC0" and params == {}:
            if close is None: raise RuntimeError("no list")
            return {"peers": close}
        if path.startswith("/daily-price-ratios/"):
            s = path.rsplit("/", 1)[-1]
            return {"price_ratios": [{"quote_date": "2026-10-24", "pe": PE.get(s), "pb": 2.0}]} if s in PE else {}
        raise AssertionError("unexpected " + path)
    return get


def setup_function():
    premium_benchmarks._BENCHMARK_OBSERVATIONS.clear()


def test_a_finance_industry_list_above_the_limit_falls_back_to_close_peers_and_gives_a_pe_median():
    assert len(INDUSTRY["peers"]) > PEER_UNIVERSE_LIMIT
    calls = []
    values, meta = resolve_report_benchmarks(provider(calls=calls), {"peers": INDUSTRY}, "consolidated", ASOF, "NBFC", symbol="NBFC0")
    assert values["industry_median_pe"] == 35          # median of the six close peers; the company itself is left out
    pe = meta["metrics"]["industry_median_pe"]
    assert pe["peerSet"] == "close" and pe["industryUniverseCount"] == 601 and pe["universeCount"] == 6
    assert not any(c.startswith("/daily-price-ratios/FIN") for c in calls), "the 600-company list is never looked up peer by peer"


def test_the_page_says_the_median_comes_from_close_peers():
    values, meta = resolve_report_benchmarks(provider(), {"peers": INDUSTRY}, "consolidated", ASOF, "NBFC", symbol="NBFC0")
    report = {"inputs": {**values, "benchmark_details": meta["metrics"]}, "calculationTrace": {"latest": [{"key": "pe", "value": 32.0}]}}
    item = benchmark_disclosure({"metric": "PE_VS_INDUSTRY", "status": "A", "points": 40}, {"summary": "", "label": "P/E vs industry"}, report)
    assert "Industry peer median: 35.00x" in item["comparisonText"]
    assert "close peers (the full industry list of 601 companies is too long to look up on demand)" in item["comparisonText"]


def test_without_a_close_peer_list_the_blank_names_its_reason():
    values, meta = resolve_report_benchmarks(provider(close=None), {"peers": INDUSTRY}, "consolidated", ASOF, "NBFC", symbol="NBFC0")
    assert "industry_median_pe" not in values
    report = {"inputs": {"benchmark_details": meta["metrics"]}}
    item = benchmark_disclosure({"metric": "PE_VS_INDUSTRY", "status": "F", "points": 46.3}, {"summary": "", "label": "P/E vs industry"}, report)
    assert item["summary"].startswith("The provider's industry list has 601 companies, too many to look up on demand")


def test_a_short_industry_list_is_used_as_before():
    small = {"peers": CLOSE}
    assert close_peers(provider(), "NBFC0", small) is None
    values, meta = resolve_report_benchmarks(provider(), {"peers": small}, "consolidated", ASOF, "BANK", symbol="NBFC0")
    assert values["industry_median_pe"] == 40          # the industry list (company included), unchanged behaviour
    assert "peerSet" not in meta["metrics"]["industry_median_pe"]


def test_the_recorded_bajaj_finance_industry_list_is_above_the_limit_and_its_close_peer_list_is_not():
    rec = json.load(gzip.open(Path(__file__).parent / "fixtures" / "premium_replay" / "BAJFINANCE.json.gz"))["recorded"]
    industry = rec[json.dumps(["/peers/BAJFINANCE", {"group": "industry"}], sort_keys=True)]
    close = rec[json.dumps(["/peers/BAJFINANCE", {}], sort_keys=True)]
    assert len(industry["peers"]) > PEER_UNIVERSE_LIMIT >= len(close["peers"]) >= 5


def test_an_nbfc_npa_blank_says_why_and_a_bank_npa_is_untouched():
    from backend.premium_presentation import factor
    row = {"metric": "GROSS_NPA", "status": "F", "label": "Gross NPA", "points": 50.0, "value": None, "details": {}}
    bucket, item = factor(row, "NBFC")
    assert bucket == "unavailable" and item["valueText"] == "Not available"
    assert item["summary"].startswith("Gross NPA is not in the provider's data for NBFCs") and item["summary"].endswith("An estimate is used in the assessment.")
    assert factor({**row, "metric": "NET_NPA", "label": "Net NPA"}, "NBFC")[1]["summary"].startswith("Net NPA is not in the provider's data for NBFCs")
    assert factor(row, "BANK")[1]["summary"] == "Not reported; an estimate is used in the assessment."
