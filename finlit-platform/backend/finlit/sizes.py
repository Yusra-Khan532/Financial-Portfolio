"""Company size: one rule for the whole site (task #262, the owner's rule of 20 Nov 2026; handoff 06_Company_sizes_whole_site).

Full market cap at the last close, in rupees crore:
  Large  above 75,000          (mcap > 75,000)
  Mid    25,000 to 75,000      (25,000 <= mcap <= 75,000)
  Small  10,000 to 25,000      (10,000 <= mcap < 25,000)
  Micro  below 10,000          (mcap < 10,000)
No market cap: None, shown as "Not known" (the company is left out while a size filter is on).
On the lines: exactly 75,000 and exactly 25,000 are Mid; exactly 10,000 is Small. These are FinLit's own fixed amounts, not SEBI's ranks
(SEBI's top 100 / 101-250 / 251+ stay only inside mutual fund category names). The old rule had three sizes (Large above 50,000, Mid
10,000-50,000, Small below 10,000): that old "Small" is today's "Micro", which is why saved Small filters were moved to Micro (migrate_small).
"""
from __future__ import annotations

import math
from typing import Any, Iterable, List, Optional

LARGE_ABOVE = 75_000.0
MID_FROM = 25_000.0
SMALL_FROM = 10_000.0

SIZES = ("Large", "Mid", "Small", "Micro")                  # the order every page shows them in
LABEL = {"Large": "Large cap", "Mid": "Mid cap", "Small": "Small cap", "Micro": "Micro cap"}
RANGE = {"Large": "above ₹75,000 Cr", "Mid": "₹25,000 to ₹75,000 Cr", "Small": "₹10,000 to ₹25,000 Cr", "Micro": "below ₹10,000 Cr"}
NOT_KNOWN = "Not known"
RULE_TEXT = "Large cap above ₹75,000 Cr, Mid cap ₹25,000 to ₹75,000 Cr, Small cap ₹10,000 to ₹25,000 Cr, Micro cap below ₹10,000 Cr (full market value at the last close)"
CHANGED_ON = "20 Nov 2026"


def size_of(mcap_cr: Any) -> Optional[str]:
    """'Large' | 'Mid' | 'Small' | 'Micro' for a market cap in rupees crore; None when there is none (or it is not a positive number)."""
    try:
        v = float(mcap_cr)
    except (TypeError, ValueError):
        return None
    if math.isnan(v) or v <= 0:
        return None
    if v > LARGE_ABOVE:
        return "Large"
    if v >= MID_FROM:
        return "Mid"
    if v >= SMALL_FROM:
        return "Small"
    return "Micro"


def norm(word: Any) -> Optional[str]:
    """A size word from a filter or a saved setting ('small', 'Small cap', 'MICRO') as one of SIZES, or None."""
    w = str(word or "").strip().lower().replace(" cap", "").replace("-cap", "").replace("cap", "").strip()
    return {"large": "Large", "mid": "Mid", "small": "Small", "micro": "Micro"}.get(w)


def migrate_small(sizes: Iterable[Any]) -> List[str]:
    """A size filter saved before 20 Nov 2026: its 'Small' meant below ₹10,000 Cr, which is now 'Micro'. Returns the list as the new rule reads it,
    so the saved filter returns the same companies (Large and Mid keep their names: their lines moved up, as the owner's rule says)."""
    out: List[str] = []
    for s in sizes:
        n = norm(s)
        if n == "Small":
            n = "Micro"
        if n and n not in out:
            out.append(n)
    return out
