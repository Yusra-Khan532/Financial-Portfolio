"""Which answer style FinLit AI uses: "v1" (today's) or "v2" (answer blueprints, ask/blueprints.py, with the shape check, ask/shape.py, and a little
more thinking). Switched in Console > Data health > Features ("ask_answer_v2", off until the Answer check shows v2 scores better); read at most
once a minute. Administrators can ask either style on purpose (the Answer check does)."""
from __future__ import annotations

import time

FLAG = "ask_answer_v2"
_flag = {"on": False, "at": 0.0}


async def answer_v2_on(pool) -> bool:
    if time.monotonic() - _flag["at"] < 60:
        return bool(_flag["on"])
    try:
        async with pool.acquire() as conn:
            _flag["on"] = bool(await conn.fetchval("SELECT enabled FROM feature_flags WHERE name = $1", FLAG))
    except Exception:   # the switch could not be read: today's style
        _flag["on"] = False
    _flag["at"] = time.monotonic()
    return bool(_flag["on"])


def reset() -> None:
    _flag["at"] = 0.0
