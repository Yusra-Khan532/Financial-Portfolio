"""The "FinLit final pages" pack (13 Nov 2026): fields the new Sector Pulse page needs, published as plain figures only."""
from finlit.sector_api import _pub as P


def test_held_up_is_published_as_the_figure_only_and_the_private_name_never_leaves():
    row = {"name": "Finance", "slug": "finance", "state_code": "thrust_cap", "breadth": {"above_9": 86.6, "above_20": 67.2, "above_50": 44.8}, "higher_low_share": 17.04}
    out = P._row(row)
    assert out["held_up"] == 17.0 and "higher_low_share" not in out
    assert P.check_public({"rows": [out]}) == []
    assert P._row({**row, "higher_low_share": None})["held_up"] is None
    assert P._row({**row, "higher_low_share": float("nan")})["held_up"] is None
