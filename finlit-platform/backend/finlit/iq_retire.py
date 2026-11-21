"""Task #283 PR D (21 Nov 2026): members' saved items on the retired FinLit IQ, converted once to FinLit Prism, FinLit's only company score.

What is converted (the team brief, section 3):
- Saved screens (`user_state.screens`, /api/me/screens) and query-builder baskets (`query_baskets`): a rule on the retired overall score becomes a rule
  on the FinLit Prism score (`prism_final`) with its number moved to the nearest Prism band edge (Average 50, Healthy 65, Strong 80; a tie goes to the
  lower edge, and 0 and 100, the ends of both scales, stay); the retired rating words Strong and Healthy stay, Mixed becomes Average, Watch becomes Weak;
  a rule on a part of the retired score (`pillar_*`, `score_change`, the strengths and watch-outs counts) has no Prism twin and is removed. A saved screen
  that names a retired ready-made screen (screener.ready.RETIRED_SCREENS, accepted on save but never run since PR B) is removed.
- Alerts: an alert on the overall score becomes a FinLit Prism score alert at the nearest band edge (alertengine.METRICS["prism_final"]); an alert on a
  part of the retired score is paused, never deleted, with the reason (`alerts.paused_reason`).
- Watchlist label alerts ("Tell me when a label changes") fire on the weekly peer labels (Leader / In line / Laggard, finlit/labelalerts.py), never on a
  band of the retired score, so the saved lists hold nothing to convert; the Watchlist page's Weak-band line reads FinLit Prism since PR A.

Each converted item keeps what it was (`converted`: {on, was, text}), and each member whose items changed gets ONE notice in the site's notification
centre (kind "notice"), shown once: the page shows it as a card until the member closes it, which marks it read on the server.

How it runs: Store.migrate() calls `run_once` after the SQL migrations. It takes a Postgres advisory lock (a second process starting at the same moment
skips it), converts member by member (each in its own transaction, the member's rows locked), and records VERSION in schema_migrations only when every
member converted; a member that fails is logged and tried again at the next start, while the members already done are left alone (the rules are
idempotent: a converted item has nothing left to convert, and the notice is sent once per member, deduped in auto_alert_sent). A failure never stops a
deploy or a job. `convert_screens` also runs on every PUT /api/me/screens, so a browser that still holds an old copy cannot bring a retired rule back.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("finlit.iq_retire")

VERSION = "123_iq_to_prism"            # schema_migrations row written once the conversion finished for every member
DAY, DAY_TEXT = "2026-11-21", "21 Nov 2026"
OLD = "FinLit IQ"
PRISM = "prism_final"
SCORE = "overall"
PRISM_NAME = "FinLit Prism score"
EDGES = ((50.0, "Average"), (65.0, "Healthy"), (80.0, "Strong"))
WORDS = {"mixed": "average", "watch": "weak"}      # strong and healthy keep their word
WORD_TEXT = {"strong": "Strong", "healthy": "Healthy", "mixed": "Mixed", "watch": "Watch", "average": "Average", "weak": "Weak", "poor": "Poor"}
# the parts of the retired score: no FinLit Prism twin
NO_TWIN = {"pillar_quality": "Quality", "pillar_growth": "Growth", "pillar_profitability": "Profitability", "pillar_balance": "Balance sheet",
           "pillar_technical": "Technical", "score_change": "change since last quarter", "strengths_count": "strengths found",
           "watchouts_count": "watch-outs found"}
RETIRED_KEYS = {SCORE, *NO_TWIN}
NOTICE_KIND = "notice"
NOTICE_TITLE = f"{OLD} has been retired"
NOTICE_LIST_MAX = 20
CHECK = "The two scores' scales differ: please check the levels."
PAUSED_REASON = (f"Paused on {DAY_TEXT}: this alert watched a part of {OLD}, which has been retired. FinLit Prism, FinLit's only company score, "
                 "has no matching part, so the alert is kept paused. You can delete it, or set a new alert on the FinLit Prism score.")


# ------------------------------------------------------------------------------------------------------------------------------ the rules
def edge(v: Optional[float]) -> Optional[float]:
    """The nearest FinLit Prism band edge (50, 65, 80) to a level of the retired score; a tie goes to the lower edge. 0 and 100 (and anything outside)
    are the ends of both scales and stay as they are."""
    if v is None:
        return None
    v = float(v)
    if v <= 0 or v >= 100:
        return v
    return min(EDGES, key=lambda e: (abs(e[0] - v), e[0]))[0]


def _n(v: float) -> str:
    return f"{float(v):g}"


BELOW = {50.0: "Weak", 65.0: "Average", 80.0: "Healthy"}     # the band just under each edge


def _band(v: Optional[float], below: bool = False) -> str:
    """' (Healthy)' for 65 or more; ' (Average)' for below 65; '' when the level is not a band edge."""
    if v is None:
        return ""
    w = BELOW.get(float(v)) if below else dict(EDGES).get(float(v))
    return f" ({w})" if w else ""


def range_text(name: str, lo: Optional[float], hi: Optional[float], words: bool = False) -> str:
    """'FinLit IQ 70 or more', 'FinLit Prism score 65 or more (Healthy)', 'FinLit IQ 60 to 75'."""
    if lo is not None and hi is not None:
        return f"{name} {_n(lo)} to {_n(hi)}"
    if lo is not None:
        return f"{name} {_n(lo)} or more" + (_band(lo) if words else "")
    if hi is not None:
        return f"{name} {_n(hi)} or less"
    return f"{name} (any level)"


def part_name(key: str) -> str:
    return f"{OLD} {NO_TWIN[key]}" if key in ("score_change", "strengths_count", "watchouts_count") else f"{OLD} {NO_TWIN[key]} part"


def _removed(key: str, rg: Dict[str, Any]) -> str:
    return f"{range_text(part_name(key), rg.get('min'), rg.get('max'))}: removed (FinLit Prism has no matching part)"


def convert_state(state: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """One saved screen's filters on FinLit Prism, and what changed (empty: nothing to convert). Pure; never changes `state`."""
    st, was = dict(state or {}), []
    ranges = dict(st.get("ranges") or {})
    if SCORE in ranges:
        rg = ranges.pop(SCORE) or {}
        lo, hi = edge(rg.get("min")), edge(rg.get("max"))
        if PRISM in ranges:
            was.append(f"{range_text(OLD, rg.get('min'), rg.get('max'))}: removed (the screen already has a {PRISM_NAME} rule)")
        else:
            ranges[PRISM] = {"min": lo, "max": hi}
            was.append(f"{range_text(OLD, rg.get('min'), rg.get('max'))} → {range_text(PRISM_NAME, lo, hi, words=True)}")
    for k in NO_TWIN:
        if k in ranges:
            was.append(_removed(k, ranges.pop(k) or {}))
    if was:
        st["ranges"] = ranges
    bands = list(st.get("bands") or [])
    if any(b in WORDS for b in bands):
        out: List[str] = []
        for b in bands:
            nb = WORDS.get(b, b)
            if b in WORDS:
                was.append(f"{OLD} rating {WORD_TEXT[b]} → FinLit Prism rating {WORD_TEXT[nb]}")
            if nb not in out:
                out.append(nb)
        st["bands"] = out
    if st.get("sort") == SCORE:
        st["sort"] = PRISM
        was.append(f"sorted by {OLD} → sorted by {PRISM_NAME}")
    elif st.get("sort") in NO_TWIN:
        was.append(f"sorted by {part_name(st['sort'])}: the sort was removed")
        st["sort"], st["dir"] = None, None
    cols = list(st.get("cols") or [])
    if any(c in RETIRED_KEYS for c in cols):
        new_cols: List[str] = []
        for c in cols:
            c2 = PRISM if c == SCORE else None if c in NO_TWIN else c
            if c2 and c2 not in new_cols:
                new_cols.append(c2)
        st["cols"] = new_cols
        was.append(f"the {OLD} columns: shown as the {PRISM_NAME} column" if SCORE in cols else f"the {OLD} part columns: removed")
    return st, was


def mark(item: Dict[str, Any], was: List[str]) -> Dict[str, Any]:
    """`converted` on a converted item: the day, every change (earlier ones kept) and the sentence the page shows."""
    before = list(((item.get("converted") or {}).get("was")) or [])
    allw = before + [w for w in was if w not in before]
    return {"on": DAY, "was": allw, "text": f"Converted from {OLD} on {DAY_TEXT}: " + "; ".join(allw) + f". {CHECK}"}


def convert_screens(screens: List[Dict[str, Any]], drop_retired_model: bool = True) -> Tuple[List[Dict[str, Any]], List[str]]:
    """A member's saved screens on FinLit Prism, and one line per changed screen (for the notice). `drop_retired_model`: a screen naming a retired
    ready-made screen is removed (the one-time conversion); a save (PUT /api/me/screens) keeps it, as PR B does, since it never runs."""
    from .screener.ready import RETIRED_SCREENS
    out, lines = [], []
    for s in screens or []:
        if not isinstance(s, dict):
            out.append(s)
            continue
        st = s.get("state") or {}
        if drop_retired_model and st.get("model") in RETIRED_SCREENS:
            lines.append(f"saved screen “{s.get('name')}”: removed (it was a ready-made screen on {OLD})")
            continue
        new, was = convert_state(st)
        if not was:
            out.append(s)
            continue
        s2 = {**s, "state": new}
        s2["converted"] = mark(s, was)
        out.append(s2)
        lines.append(f"saved screen “{s.get('name')}”: " + "; ".join(was))
    return out, lines


# ---- query baskets: the query is parsed (finlit/screener/ql.py), changed as a tree and written back in full with the real ratio names
def _cmp_parts(c) -> Tuple[Any, Any, bool]:
    """(metric node, number node, metric on the left) of a 'metric op number' condition, else (None, None, False)."""
    from .screener.ql import Met, Num
    if isinstance(c.l, Met) and isinstance(c.r, Num):
        return c.l, c.r, True
    if isinstance(c.r, Met) and isinstance(c.l, Num):
        return c.r, c.l, False
    return None, None, False


def _op_text(op: str, left: bool) -> str:
    if not left:
        op = {">": "<", ">=": "<=", "<": ">", "<=": ">="}.get(op, op)
    return {">": "above", ">=": "at least", "<": "below", "<=": "at most", "=": "equal to", "!=": "not equal to"}[op]


def _cmp_band(op: str, left: bool, v: float) -> str:
    if not left:
        op = {">": "<", ">=": "<=", "<": ">", "<=": ">="}.get(op, op)
    return _band(v) if op in (">", ">=") else _band(v, below=True) if op == "<" else ""


def _tree(node, was: List[str]):
    """The tree with the retired score's conditions converted and its parts' conditions removed (None: nothing is left)."""
    from .screener.ql import Bool, Cmp, Num, metrics_in, walk, Met
    if isinstance(node, Bool):
        items = [x for x in (_tree(i, was) for i in node.items) if x is not None]
        if not items:
            return None
        return items[0] if len(items) == 1 else Bool(node.kind, items, node.lines)
    if isinstance(node, Cmp):
        keys = metrics_in(node)
        if any(k in NO_TWIN for k in keys):
            from .screener.ql import canonical
            was.append(f"“{canonical(node)}”: removed (FinLit Prism has no matching part)")
            return None
        if SCORE in keys:
            met, num, left = _cmp_parts(node)
            if met is not None and met.key == SCORE:
                old, new = num.value, edge(num.value)
                n2 = Num(new, num.unit, num.start, num.end, _n(new))
                m2 = Met(PRISM, met.start, met.end, met.text)
                was.append(f"{OLD} {_op_text(node.op, left)} {_n(old)} → {PRISM_NAME} {_op_text(node.op, left)} {_n(new)}{_cmp_band(node.op, left, new)}")
                return Cmp(node.op, m2 if left else n2, n2 if left else m2, node.op_start, node.op_end)
            for x in walk(node):           # the score inside a sum or a ratio: the name changes, the numbers stay (said in the notice)
                if isinstance(x, Met) and x.key == SCORE:
                    x.key = PRISM
            was.append(f"a calculation on {OLD} now reads the {PRISM_NAME}")
    return node


def convert_query(text: str) -> Tuple[Optional[str], List[str]]:
    """A basket's query on FinLit Prism and what changed. (text, []) when it uses nothing retired; (None, was) when nothing would be left."""
    from .screener.ql import Met, analyze, canonical, walk
    a = analyze(text or "", "gold")
    if a.root is None or not any(isinstance(n, Met) and n.key in RETIRED_KEYS for n in walk(a.root)):
        return text, []
    was: List[str] = []
    root = _tree(a.root, was)
    return (canonical(root) if root is not None else None), was


def convert_basket(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """The changed fields of one basket ({query, columns, sort, was, gone}), or None when it uses nothing retired."""
    query, was = convert_query(row["query"])
    cols = row["columns"] if isinstance(row["columns"], list) else json.loads(row["columns"] or "[]")
    sort = row["sort"] if isinstance(row["sort"], (dict, type(None))) else json.loads(row["sort"])
    if any(c in RETIRED_KEYS for c in cols):
        new_cols: List[str] = []
        for c in cols:
            c2 = PRISM if c == SCORE else None if c in NO_TWIN else c
            if c2 and c2 not in new_cols:
                new_cols.append(c2)
        cols = new_cols
        was.append(f"the {OLD} columns: shown as the {PRISM_NAME} column" if PRISM in cols else f"the {OLD} part columns: removed")
    if sort and sort.get("key") in RETIRED_KEYS:
        if sort["key"] == SCORE:
            sort = {**sort, "key": PRISM}
            was.append(f"sorted by {OLD} → sorted by {PRISM_NAME}")
        else:
            sort = None
            was.append("the sort on a part of the retired score was removed")
    if not was:
        return None
    return {"query": query, "columns": cols, "sort": sort, "was": was, "gone": query is None}


# ---- alerts
def convert_alert(a: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """What happens to one alert: {"action": "prism", "value", "was"} or {"action": "pause", "was"}; None when it is not on the retired score."""
    m = a["metric"]
    sym = a.get("symbol") or ""
    if m == SCORE:
        v = float(a["value"]) if a["value"] is not None else None
        nv = edge(v)
        side = "at or above" if a["op"] == "above" else "at or below"
        return {"action": "prism", "value": nv,
                "was": f"alert on {sym}: {OLD} {side} {_n(v) if v is not None else '?'} → {PRISM_NAME} {side} {_n(nv) if nv is not None else '?'}{_band(nv) if a['op'] == 'above' else ''}"}
    if m in NO_TWIN:
        side = "at or above" if a["op"] == "above" else "at or below"
        v = _n(float(a["value"])) if a["value"] is not None else "?"
        return {"action": "pause", "was": f"alert on {sym}: {part_name(m)} {side} {v}: paused (FinLit Prism has no matching part)"}
    return None


def notice_body(lines: List[str]) -> str:
    n = len(lines)
    shown = lines[:NOTICE_LIST_MAX]
    more = f"; and {n - len(shown)} more" if n > len(shown) else ""
    things = "saved screen or alert" if n == 1 else "saved screens and alerts"
    return (f"{OLD} has been retired; FinLit Prism is now FinLit's only score. We changed {n} of your {things}: " + "; ".join(shown) + more +
            ". Please check their levels. The two scores' scales differ, so each converted screen, basket and alert says it was converted. "
            "Information only, not investment advice.")


# ------------------------------------------------------------------------------------------------------------------------------ the run
async def convert_member(conn, uid) -> List[str]:
    """Convert one member's saved items (inside the caller's transaction) and send the one notice. Returns the notice's lines (empty: nothing changed)."""
    lines: List[str] = []
    st = await conn.fetchrow("SELECT screens FROM user_state WHERE user_id = $1 FOR UPDATE", uid)
    if st is not None:
        screens = json.loads(st["screens"]) if isinstance(st["screens"], str) else st["screens"]
        if isinstance(screens, list):
            new, sl = convert_screens(screens)
            if sl:
                await conn.execute("UPDATE user_state SET screens = $2::jsonb, updated_at = now() WHERE user_id = $1", uid, json.dumps(new))
                same = [x for x in new if x in screens]           # the screens left exactly as they were
                changed = [s.get("name") for s in screens if isinstance(s, dict) and s not in same]
                # a converted or removed screen starts again: its first check only remembers what matches (no burst of "joined" messages)
                if changed:
                    await conn.execute("DELETE FROM screen_state WHERE user_id = $1 AND screen_name = ANY($2::text[])", uid, changed)
                lines += sl
    for b in await conn.fetch("SELECT id, name, query, columns, sort, converted FROM query_baskets WHERE user_id = $1 ORDER BY created_at FOR UPDATE", uid):
        ch = convert_basket(dict(b))
        if not ch:
            continue
        prev = json.loads(b["converted"]) if isinstance(b["converted"], str) else b["converted"]
        if ch["gone"]:
            # every condition was on a part of the retired score: the basket would match every company, so it is removed (listed in the notice)
            await conn.execute("DELETE FROM query_baskets WHERE id = $1", b["id"])
            lines.append(f"query basket “{b['name']}”: removed (all its conditions were on parts of {OLD}: " + "; ".join(ch["was"]) + ")")
            continue
        conv = mark({"converted": prev}, ch["was"])
        await conn.execute("UPDATE query_baskets SET query = $2, columns = $3::jsonb, sort = $4::jsonb, converted = $5::jsonb, last_count = NULL, "
                           "counted_at = NULL, updated_at = now() WHERE id = $1", b["id"], ch["query"], json.dumps(ch["columns"]),
                           json.dumps(ch["sort"]) if ch["sort"] else None, json.dumps(conv))
        lines.append(f"query basket “{b['name']}”: " + "; ".join(ch["was"]))
    for a in await conn.fetch("SELECT id, symbol, metric, op, value, status, converted FROM alerts WHERE user_id = $1 AND metric = ANY($2::text[]) "
                              "ORDER BY created_at FOR UPDATE", uid, sorted(RETIRED_KEYS)):
        ch = convert_alert(dict(a))
        if not ch:
            continue
        prev = json.loads(a["converted"]) if isinstance(a["converted"], str) else a["converted"]
        conv = mark({"converted": prev}, [ch["was"]])
        if ch["action"] == "prism":
            # met and last value are learned again at the next check, so the converted alert never fires by itself
            await conn.execute("UPDATE alerts SET metric = $2, value = $3, converted = $4::jsonb, met = NULL, last_value = NULL WHERE id = $1",
                               a["id"], PRISM, ch["value"], json.dumps(conv))
        else:
            await conn.execute("UPDATE alerts SET status = 'paused', paused_reason = $2, converted = $3::jsonb WHERE id = $1", a["id"], PAUSED_REASON, json.dumps(conv))
        lines.append(ch["was"])
    if lines:
        fresh = await conn.fetchval("INSERT INTO auto_alert_sent (user_id, symbol, kind, period) VALUES ($1, '', 'iq_retired', $2) ON CONFLICT DO NOTHING RETURNING 1",
                                    uid, DAY)
        if fresh:
            await conn.execute("INSERT INTO notifications (user_id, kind, title, body, push) VALUES ($1, $2, $3, $4, false)",
                               uid, NOTICE_KIND, NOTICE_TITLE, notice_body(lines))
    return lines


async def convert_all(pool) -> Dict[str, int]:
    """Every member with a saved item on the retired score, one transaction each. Returns counts; `failed` > 0 means it must run again."""
    async with pool.acquire() as conn:
        uids = [r["uid"] for r in await conn.fetch(
            "SELECT user_id AS uid FROM user_state WHERE jsonb_typeof(screens) = 'array' AND screens <> '[]'::jsonb "
            "UNION SELECT user_id FROM query_baskets "
            "UNION SELECT user_id FROM alerts WHERE metric = ANY($1::text[])", sorted(RETIRED_KEYS))]
    done = {"members": 0, "items": 0, "failed": 0}
    for uid in uids:
        try:
            async with pool.acquire() as conn:
                async with conn.transaction():
                    lines = await convert_member(conn, uid)
            if lines:
                done["members"] += 1
                done["items"] += len(lines)
        except Exception:   # one member's trouble never stops the others; the run is not recorded, so it is tried again at the next start
            log.exception("FinLit IQ conversion failed for a member")
            done["failed"] += 1
    return done


async def run_once(pool, applied: set) -> Optional[Dict[str, int]]:
    """Called by Store.migrate: converts once and records VERSION in schema_migrations. Never raises (a deploy or a job is never stopped by it)."""
    if VERSION in applied:
        return None
    try:
        async with pool.acquire() as conn:
            if not await conn.fetchval("SELECT pg_try_advisory_lock(hashtext($1))", VERSION):
                return None                # another process is converting right now
            try:
                if await conn.fetchval("SELECT 1 FROM schema_migrations WHERE version = $1", VERSION):
                    return None
                done = await convert_all(pool)
                if not done["failed"]:
                    await conn.execute("INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING", VERSION)
                log.info("FinLit IQ saved items converted to FinLit Prism: %s", done)
                return done
            finally:
                await conn.execute("SELECT pg_advisory_unlock(hashtext($1))", VERSION)
    except Exception:
        log.exception("FinLit IQ conversion not run; the next start tries again")
        return None
