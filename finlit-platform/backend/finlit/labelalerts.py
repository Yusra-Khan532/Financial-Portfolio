"""'Tell me when a label changes' (the Watchlists page): a Silver or Gold member picks, per list, Any change, Only to Laggard or Only to Leader, and is told
when a stock on that list moves to a new published Leader / In line / Laggard label in the weekly check. The choice is saved with the list in the
member's watchlist (`labelAlert` on a list: "any", "laggard" or "leader"). Dedupe is the primary key of auto_alert_sent (user, symbol,
kind = label_change, period = the run's Friday), so a member hears about one change of one stock once, however often the alert run repeats.
Information only: the message says what the label now is and that it describes past prices, never what to do."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Set, Tuple

from .alertengine import deliver
from .auth.mailer import Mailer

log = logging.getLogger("finlit.labelalerts")

CHOICES = ("any", "laggard", "leader")
WORD = {"leader": "Leader", "in_line": "In line", "laggard": "Laggard"}
KIND = "label_change"
PER_RUN = 20          # at most this many per member per run, so a first run cannot flood anyone
FOOTER = "The label describes how the share price did over the last 12 months against similar companies. It is not investment advice."


def choices(raw: Any) -> Dict[str, Set[str]]:
    """symbol -> the label-alert choices of every list it is on (a list without a choice adds nothing)."""
    try:
        data = json.loads(raw) if isinstance(raw, str) else (raw or {})
    except ValueError:
        return {}
    out: Dict[str, Set[str]] = {}
    for lst in (data.get("lists") or []) if isinstance(data, dict) else []:
        if not isinstance(lst, dict) or lst.get("labelAlert") not in CHOICES:
            continue
        for sym in lst.get("symbols") or []:
            if isinstance(sym, str) and sym:
                out.setdefault(sym.upper(), set()).add(lst["labelAlert"])
    return out


def wanted(picked: Set[str], new: str) -> bool:
    return "any" in picked or ("laggard" in picked and new == "laggard") or ("leader" in picked and new == "leader")


def message(row: Dict[str, Any]) -> Tuple[str, str]:
    name, group = row.get("name") or row["symbol"], row.get("group_short") or row.get("group_name") or "similar"
    title = f"{row['symbol']} is now {WORD[row['label']]} against its peers"
    body = (f"{name} moved from {WORD[row['before']]} to {WORD[row['label']]} in the weekly check of {row['as_of'].strftime('%d %b %Y')}. "
            f"It ranks {row['rank']} of {row['ranked']} {group} companies on price over 12 months. {FOOTER}")
    return title, body


async def changes(conn) -> Tuple[Optional[Any], List[Dict[str, Any]]]:
    """The stocks whose published label changed in the latest weekly run, with the label they had before. A stock seen for the first time has no 'before'
    and is not a change."""
    as_of = await conn.fetchval("SELECT max(as_of) FROM leadership")
    if as_of is None:
        return None, []
    rows = await conn.fetch(
        "SELECT l.symbol, l.name, l.label, l.rank, l.ranked, l.group_short, l.group_name, l.as_of, "
        "(SELECT h.label FROM leadership_history h WHERE h.symbol = l.symbol AND h.run_date < l.as_of AND h.label IS NOT NULL ORDER BY h.run_date DESC LIMIT 1) AS before "
        "FROM leadership l WHERE l.as_of = $1 AND l.label_since = $1 AND l.label IS NOT NULL", as_of)
    return as_of, [dict(r) for r in rows if r["before"] and r["before"] != r["label"] and r["label"] in WORD and r["before"] in WORD]


async def auto_label_alerts(pool, mailer: Mailer, site_url: str) -> int:
    sent = 0
    async with pool.acquire() as conn:
        as_of, moved = await changes(conn)
        if not moved:
            return 0
        users = await conn.fetch(
            "SELECT u.id, u.email, s.watchlist, s.prefs FROM users u JOIN user_state s ON s.user_id = u.id "
            "WHERE u.status = 'active' AND u.email_verified_at IS NOT NULL AND u.plan IN ('silver', 'gold') "
            "AND (u.plan_until IS NULL OR u.plan_until > now())")
        for u in users:
            picks = choices(u["watchlist"])
            n = 0
            for row in moved:
                if n >= PER_RUN:
                    break
                if not wanted(picks.get(row["symbol"], set()), row["label"]):
                    continue
                try:
                    new = await conn.fetchval("INSERT INTO auto_alert_sent (user_id, symbol, kind, period) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1",
                                              u["id"], row["symbol"], KIND, as_of.isoformat())
                    if not new:
                        continue
                    title, body = message(row)
                    await deliver(conn, mailer, site_url, {"id": u["id"], "email": u["email"], "prefs": u["prefs"]},
                                  {"id": None, "symbol": row["symbol"], "channels": ["app", "browser", "email"]}, title, body, f"/stocks/{row['symbol']}")
                    n += 1
                    sent += 1
                except Exception:   # one member's trouble must not stop the rest
                    log.exception("label-change alert failed for %s", row["symbol"])
    log.info("label-change alerts: %d sent", sent)
    return sent
