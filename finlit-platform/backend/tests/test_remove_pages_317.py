"""Task #317 (developer file 23, 22 Nov 2026): /commodities answers a 301 to /macro and /premium/fundamentals a 301 to /research; the sitemap no
longer lists /commodities."""
from datetime import date

from finlit import seo


def test_old_addresses_move_for_good():
    assert seo.redirect_for("/commodities") == "/macro"
    assert seo.redirect_for("/premium/fundamentals") == "/research"
    assert seo.redirect_for("/premium/fundamentals/") == "/research"


def test_the_sitemap_has_no_commodities_page():
    xml = seo.sitemap_xml("https://finlitventures.com", [], date(2026, 11, 22))
    assert "https://finlitventures.com/commodities<" not in xml and "/premium/fundamentals" not in xml
    assert "https://finlitventures.com/macro<" in xml
