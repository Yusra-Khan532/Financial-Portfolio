"""Task #408 (Watchlists, 05-alerts): "Price near your target".

A member on a paid plan sets a target price on a stock of a watchlist (meta[SYM].target, saved to the account). When the price comes within 5% of the
target, either side, the member is told once, in the app and in the browser if allowed:

    Title  "{SYM} is near your target"
    Body   "{SYM} at ₹{price} is {x}% {below/above} your target of ₹{target} ({list})."

Rules (05-alerts): only for lists whose "Price near your target" was saved On (the list's `alerts.target`; a list never saved through
"Alerts for this list" has no target alert: nothing changes until the member presses Save, though the page shows the pack's default, On), and for stocks whose own box
"Tell me when the price is within 5% of my target" is ticked (meta[SYM].nearAlert; absent means ticked). Once per stock per crossing: alert_state
remembers that the price is near (side NEAR) and the alert re-arms only after the price moves more than 5% away again (side AWAY); a new target
re-arms it too. At most one per stock per day (auto_alert_sent, kind target_near, period = the IST day). A member who switched alerts off in the
preferences hears nothing, as before.

It replaces the older "crossed your target" check (alerts.check_alerts calls it), so it runs on the same schedule with the same reads: the market-hours
alert job every 15 minutes. Information only: a target is the member's own reminder, never a prediction."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from .alertengine import deliver
from .auth.mailer import Mailer

log = logging.getLogger("finlit.targetalerts")

IST = ZoneInfo("Asia/Kolkata")
NEAR = 5.0            # percent, either side of the target
KIND = "target_near"
SIDE_NEAR, SIDE_AWAY = 2, -2   # alert_state.side; the older check stored 1 / -1 (above / below), read here as "not known yet"
PER_RUN = 20          # at most this many per member per run


def inr(v: float) -> str:
    """₹ in Indian grouping with two decimals: 1396.2 -> "1,396.20", 1049215 -> "10,49,215.00"."""
    neg, v = v < 0, abs(v)
    whole, frac = f"{v:.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        whole = ",".join(parts + [tail])
    return ("−" if neg else "") + whole + "." + frac


def distance(price: float, target: float) -> float:
    """How far the target is from the price, in percent of the price: positive when the price is below the target (the page's "4.0% below target")."""
    return (target / price - 1) * 100


def _parse(raw: Any) -> Dict[str, Any]:
    try:
        v = json.loads(raw) if isinstance(raw, str) else (raw or {})
    except ValueError:
        return {}
    return v if isinstance(v, dict) else {}


def targets(watchlist: Any) -> Dict[str, Tuple[float, str]]:
    """symbol -> (target, the name of the first list it is on whose target alerts are On), for stocks with a target and the box ticked."""
    w = _parse(watchlist)
    meta = w.get("meta") if isinstance(w.get("meta"), dict) else {}
    out: Dict[str, Tuple[float, str]] = {}
    for lst in w.get("lists") or []:
        if not isinstance(lst, dict):
            continue
        al = lst.get("alerts") if isinstance(lst.get("alerts"), dict) else {}
        if al.get("target") is not True:
            continue
        for sym in lst.get("symbols") or []:
            if not isinstance(sym, str) or not sym:
                continue
            s = sym.upper()
            m = meta.get(s) or meta.get(sym)
            if s in out or not isinstance(m, dict) or m.get("nearAlert") is False:
                continue
            try:
                t = float(m.get("target") or 0)
            except (TypeError, ValueError):
                continue
            if t > 0:
                out[s] = (t, str(lst.get("name") or "My watchlist"))
    return out


def message(sym: str, price: float, target: float, list_name: str) -> Tuple[str, str]:
    d = distance(price, target)
    return (f"{sym} is near your target",
            f"{sym} at ₹{inr(price)} is {abs(d):.1f}% {'below' if d > 0 else 'above'} your target of ₹{inr(target)} ({list_name}).")


def step(prev_side: Optional[int], prev_target: Optional[float], target: float, price: float) -> Tuple[bool, int]:
    """(fire?, side to store) for one check. Near = within 5% of the target; it fires only when the price was not near at the last check (or the
    target changed, or nothing is known yet), and re-arms once the price is more than 5% away."""
    near = abs(distance(price, target)) <= NEAR
    known = prev_side in (SIDE_NEAR, SIDE_AWAY) and prev_target is not None and abs(float(prev_target) - target) < 0.005
    if not near:
        return False, SIDE_AWAY
    return (not (known and prev_side == SIDE_NEAR)), SIDE_NEAR


async def auto_target_alerts(pool, mailer: Mailer, site_url: str, now: Optional[datetime] = None) -> int:
    day = (now or datetime.now(IST)).astimezone(IST).date().isoformat()
    sent = 0
    async with pool.acquire() as conn:
        users = await conn.fetch(
            "SELECT u.id, u.email, s.watchlist, s.prefs FROM user_state s JOIN users u ON u.id = s.user_id "
            "WHERE u.status = 'active' AND u.email_verified_at IS NOT NULL AND u.plan IN ('silver', 'gold', 'equity', 'combined', 'platinum') "   # the plans with watchlists (the eq area)
            "AND (u.plan_until IS NULL OR u.plan_until > now()) AND s.watchlist <> '{}'::jsonb")
        for u in users:
            prefs = _parse(u["prefs"])
            want = targets(u["watchlist"])
            if not want or prefs.get("alerts") is False:
                continue
            prices = {r["symbol"]: float(r["price"]) for r in await conn.fetch(
                "SELECT DISTINCT ON (symbol) symbol, price FROM scores WHERE symbol = ANY($1::text[]) AND price IS NOT NULL "
                "ORDER BY symbol, updated_at DESC", list(want))}
            n = 0
            for sym, (target, list_name) in want.items():
                price = prices.get(sym)
                if not price or price <= 0:
                    continue
                try:
                    prev = await conn.fetchrow("SELECT side, target FROM alert_state WHERE user_id = $1 AND symbol = $2", u["id"], sym)
                    fire, side = step(prev["side"] if prev else None, float(prev["target"]) if prev else None, target, price)
                    told = False
                    if fire and n < PER_RUN:
                        told = bool(await conn.fetchval("INSERT INTO auto_alert_sent (user_id, symbol, kind, period) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1",
                                                        u["id"], sym, KIND, day))
                        if told:
                            title, body = message(sym, price, target, list_name)
                            await deliver(conn, mailer, site_url, {"id": u["id"], "email": u["email"], "prefs": u["prefs"]},
                                          {"id": None, "symbol": sym, "channels": ["app", "browser"]}, title, body, f"/stocks/{sym}")
                            n += 1
                            sent += 1
                    if fire and not told:
                        # already told today (or the run's limit reached): stays armed, so it is told on a later run once the day allows
                        side = prev["side"] if prev and prev["side"] != SIDE_NEAR else SIDE_AWAY
                    await conn.execute(
                        "INSERT INTO alert_state (user_id, symbol, target, side, alerted_at) VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN now() END) "
                        "ON CONFLICT (user_id, symbol) DO UPDATE SET target = EXCLUDED.target, side = EXCLUDED.side, "
                        "alerted_at = CASE WHEN $5 THEN now() ELSE alert_state.alerted_at END",
                        u["id"], sym, target, side, told)
                except Exception:   # one member's trouble must not stop the rest
                    log.exception("target alert failed for %s", sym)
    log.info("near-target alerts: %d sent", sent)
    return sent
