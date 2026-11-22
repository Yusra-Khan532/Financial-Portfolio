"""Task #329 (developer file 29, 23 Nov 2026): one IPOs page at /ipo. /ipo/all answers a 301 to /ipo?view=all keeping its parameters; the sitemap
lists /ipo only, and its head names the merged page."""
from datetime import date

from finlit import seo


def test_all_ipos_moves_to_the_second_view_with_its_parameters():
    assert seo.redirect_for("/ipo/all") == "/ipo?view=all"
    assert seo.redirect_for("/ipo/all/") == "/ipo?view=all"
    assert seo.redirect_for("/ipo/all", "board=sme&year=2025&sort=listingPct") == "/ipo?view=all&board=sme&year=2025&sort=listingPct"
    assert seo.redirect_for("/ipo/all", "view=now&status=listed") == "/ipo?view=all&status=listed"     # the view is always the second one
    assert seo.redirect_for("/ipo") is None and seo.redirect_for("/ipo/1849") is None                    # the page and the issue pages stay
    assert seo.redirect_for("/commodities", "x=1") == "/macro"                                         # other moves still drop the query string


def test_the_sitemap_lists_the_one_page():
    xml = seo.sitemap_xml("https://finlitventures.com", [], date(2026, 11, 23))
    assert "https://finlitventures.com/ipo<" in xml and "/ipo/all" not in xml
    pg = seo.PUBLIC["ipo"]
    assert pg.h1 == "IPOs" and pg.crumb == "IPOs" and "ipo/all" not in seo.PUBLIC
    assert len(pg.title) <= 60 and 120 <= len(pg.description) <= 160
