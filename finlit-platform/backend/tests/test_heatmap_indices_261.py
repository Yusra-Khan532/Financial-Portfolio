"""Task #261 (team pack "05 Dashboard · Index heatmap", 20 Nov 2026): every index the dashboard's Index heatmap offers is one the nightly index
refresh downloads from NSE (screener/catalog INDEX_LISTS), under the file name NSE publishes. Before, Nifty Midcap 50, Midcap Select, Smallcap 50
and Microcap 250 were missing, and the India Manufacturing file name was wrong (a 404), so that list never loaded."""
import re
from pathlib import Path

from finlit.screener.catalog import INDEX_LISTS

HEATMAP = Path(__file__).resolve().parents[2] / "frontend" / "src" / "components" / "dashboard" / "heatmapLogic.ts"


def test_every_heatmap_index_is_downloaded_from_nse():
    codes = re.findall(r'code: "([A-Z0-9]+)"', HEATMAP.read_text())
    assert len(codes) == 25
    assert [c for c in codes if c not in INDEX_LISTS] == []


def test_the_new_lists_use_nses_file_names():
    assert INDEX_LISTS["NIFTYMIDCAP50"] == ("NIFTY Midcap 50", "ind_niftymidcap50list")
    assert INDEX_LISTS["NIFTYMIDCAPSELECT"] == ("NIFTY Midcap Select", "ind_niftymidcapselect_list")
    assert INDEX_LISTS["NIFTYSMALLCAP50"] == ("NIFTY Smallcap 50", "ind_niftysmallcap50list")
    assert INDEX_LISTS["NIFTYMICROCAP250"] == ("NIFTY Microcap 250", "ind_niftymicrocap250_list")
    assert INDEX_LISTS["NIFTYMANUFACTURING"][1] == "ind_niftyindiamanufacturing_list"     # was ...manufacturinglist, which NSE answers 404
