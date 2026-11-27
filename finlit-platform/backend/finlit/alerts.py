"""Watchlist target alerts, run from the worker every few minutes in market hours (the alert job, `check-alerts --kind live`).

Task #408: the older rule ("crossed your target", once a day) is replaced by the Watchlists page's "Price near your target": the price comes within
5% of the target, once per crossing, re-armed only after it moves more than 5% away, at most once a day per stock (finlit/targetalerts.py). Same
schedule and the same reads as before.
"""

from __future__ import annotations

from .auth.mailer import Mailer


async def check_alerts(pool, mailer: Mailer, site_url: str) -> int:
    from .targetalerts import auto_target_alerts
    return await auto_target_alerts(pool, mailer, site_url)
