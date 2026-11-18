"""Task #183 W7 (Equity portfolio, A4/A5; handed over by task #192): the engine's "sector" is NSE's macro sector (12), so the spread score counts macro sectors,
and the page gets the three NSE levels per share. A company NSE's lists do not place keeps its old label; with none it gets none."""
from finlit.portfolio_page.inputs import build_meta

FACTS = {"INFY": {"name": "Infosys", "sector": "Information Technology", "rank": 20, "mcap": 600000},
         "TCS": {"name": "TCS", "sector": "IT - Software", "rank": 5, "mcap": 1200000},
         "NEWCO": {"name": "New Co", "sector": "Consumer Services", "rank": 900, "mcap": 3000},
         "BLANK": {"name": "Blank", "sector": "", "rank": 1500, "mcap": 900}}
CLASSES = {"INFY": {"macro_sector": "Information Technology", "sector": "Information Technology", "industry": "IT - Software"},
           "TCS": {"macro_sector": "Information Technology", "sector": "Information Technology", "industry": "IT - Software"}}


def test_the_sector_is_nses_macro_sector_with_three_levels():
    m = build_meta(["INFY", "TCS", "NEWCO", "BLANK"], FACTS, {}, CLASSES)
    assert m["INFY"]["sector"] == m["TCS"]["sector"] == "Information Technology"   # one macro sector, whatever the screener's mixed column said ("IT - Software")
    assert m["TCS"]["nse"] == {"macro_sector": "Information Technology", "sector": "Information Technology", "industry": "IT - Software"}
    assert m["NEWCO"]["sector"] == "Consumer Services" and m["NEWCO"]["nse"] == {"macro_sector": None, "sector": None, "industry": None}
    assert m["BLANK"]["sector"] is None


def test_without_the_classification_it_reads_as_before():
    m = build_meta(["TCS"], FACTS, {"IT - Software": "Information Technology"})
    assert m["TCS"]["sector"] == "Information Technology"
