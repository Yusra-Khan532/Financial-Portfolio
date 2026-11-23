"""QA pass of 23 Nov 2026 (Advanced screener, item 5): the Top 10 card text says what the list shows, the ten strongest first and then every company
that passes, in the same words as the screen's own list text."""
from types import SimpleNamespace

from finlit.presets import api as P


def test_top10_card_text_says_every_company_that_passes_is_listed():
    p = SimpleNamespace(kind="rules", top10=True, limit=10)
    assert P._list_text(p, {"count": 33}) == "33 pass · the top 10 first"
    assert P._list_text(SimpleNamespace(kind="rules", top10=False, limit=10), {"count": 33}) is None
    assert P._list_text(p, None) is None
