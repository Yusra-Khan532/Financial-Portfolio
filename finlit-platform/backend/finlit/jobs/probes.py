"""Cheap questions the supervisor asks before it starts an expensive job: is there anything to do? (True/False; an error means unknown, so the job follows its clock)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Optional

BEHIND_SHARE = 0.02      # more than 2% of the reports behind the newest session = work to do (a few companies Dhan has no candles for are normal)


def build(store: Any) -> Dict[str, Callable[[], Awaitable[Optional[bool]]]]:
    async def technicals() -> Optional[bool]:
        from ..prism_technical import current_target
        target = await current_target(store.redis, datetime.now(timezone.utc))
        async with store.pool.acquire() as conn:
            total = await conn.fetchval("SELECT count(DISTINCT symbol) FROM prism_reports")
            behind = await conn.fetchval("SELECT count(*) FROM (SELECT symbol, min(COALESCE(card->>'technicalBarDate', report #>> '{technicalAssessment,asOf}')) AS bar "
                                         "FROM prism_reports GROUP BY symbol) t WHERE bar IS NULL OR bar < $1", target.isoformat())
        return bool(total) and behind / total > BEHIND_SHARE

    async def prism() -> Optional[bool]:
        from .. import prism as prism_mod
        return bool(await prism_mod._pending(store, "consolidated", 7, 1, []))

    async def ath() -> Optional[bool]:
        async with store.pool.acquire() as conn:   # a company with a stored report but no stored all-time high
            return bool(await conn.fetchval("SELECT EXISTS (SELECT 1 FROM (SELECT DISTINCT symbol FROM snapshots WHERE section = 'price-MAX') s "
                                            "LEFT JOIN price_history_long h ON h.symbol = s.symbol WHERE h.symbol IS NULL OR h.ath IS NULL)"))

    async def candles() -> Optional[bool]:
        from .. import candles as candles_mod   # task #394: Dhan has a session (confirmed by the technicals run) the candle store does not hold yet
        return await candles_mod.has_new_session(store)

    async def presets() -> Optional[bool]:
        from ..presets import listday   # task #394: the candles hold a newer list day than the lists were built on (the charts moved, the lists must too)
        return await listday.has_work(store)

    async def price_sections() -> Optional[bool]:
        from .. import price_sections as ps   # task #394: candles were stored after the charts were last rewritten
        return await ps.has_work(store)

    async def scores_live() -> Optional[bool]:
        from .. import scorelive
        return await scorelive.has_work(store)

    async def macro_outlook() -> Optional[bool]:
        from ..macro_outlook import store as mo
        return await mo.has_new_data(store)

    async def discovery() -> Optional[bool]:
        from ..discovery import service as discovery_service   # the last run stopped with presentations it never reached
        return await discovery_service.has_work(store)

    async def stress() -> Optional[bool]:
        from ..stress import service as stress_service      # the last run stopped at its time cap with covered companies it never reached
        return await stress_service.has_work(store)

    async def eod_candles() -> Optional[bool]:
        from .. import eod_bhav   # today's end-of-day file of NSE or BSE is not loaded yet (16:30 to 23:30 IST on weekdays)
        return await eod_bhav.has_work(store)

    async def scores_export() -> Optional[bool]:
        from .. import scores_export as sx   # the presets job has finished a day that has no export file yet (or, at night, a back-fill day waits)
        return await sx.has_work(store)

    async def lab_scanner() -> Optional[bool]:
        from ..lab import scanner   # the candle store holds a newer session than the latest Setup scanner run was made on
        return await scanner.has_work(store)

    async def sectors_view() -> Optional[bool]:
        # task #192: the live sector set was built before the Sectors view existed; the sector job adds it in a few minutes (only in its weekend-night hours)
        import asyncio
        from .. import sector_data as sd
        rel = await asyncio.to_thread(sd.live_release)
        return bool(rel) and not await asyncio.to_thread(lambda: (rel / sd.LEVELS_DIR / "sectors" / "_board.json").is_file())

    return {"sectors-view": sectors_view, "macro-outlook": macro_outlook, "technicals": technicals, "prism": prism, "ath": ath, "candles": candles, "presets": presets, "eod-candles": eod_candles, "price-sections": price_sections, "scores-live": scores_live, "stress": stress, "discovery": discovery, "scores-export": scores_export, "lab-scanner": lab_scanner}
