"""Daily volume from NSE's bhavcopy (task #64, fix 8). The provider's candles carry full-day volume until June 2026 and 2 to 10% of it from July, so every volume figure
of the screens (breakout-day volume, usual volume, value traded) is worked out from the official full-day file instead, the one Sector Pulse already keeps
(/data/nse/bhav_<year>.csv.gz: date,symbol,series,isin,open,high,low,close,last,prev_close,volume,value,trades).

Standard library only: the website process never imports pandas. A zero or missing volume is a blank, not a quiet day (averages skip it). A company with no NSE
row for a day (a BSE-only company) has a blank volume that day: never mixed with another exchange's figure."""
from __future__ import annotations

import csv
import glob
import gzip
import logging
import os
from datetime import date, timedelta
from typing import Dict, Optional

log = logging.getLogger("finlit.bhav")
MAIN = ("EQ", "BE", "BZ")
KEEP_DAYS = 400
_cache: Dict[str, object] = {"sig": None, "data": None}


def _dir() -> str:
    return os.environ.get("SECTOR_NSE_DIR") or "/data/nse"


def _load(folder: str, since: str) -> Dict[str, Dict[str, int]]:
    out: Dict[str, Dict[str, int]] = {}
    last: Dict[str, tuple] = {}
    for f in sorted(glob.glob(os.path.join(folder, "bhav_[0-9][0-9][0-9][0-9].csv.gz"))):
        if int(os.path.basename(f)[5:9]) < int(since[:4]):
            continue
        with gzip.open(f, "rt", newline="") as fh:
            for r in csv.DictReader(fh):
                d, s = r.get("date", ""), r.get("symbol", "")
                if r.get("series") not in MAIN or d < since:
                    continue
                try:
                    v = int(float(r.get("volume") or 0))
                    sig = (r.get("open"), r.get("high"), r.get("low"), r.get("close"), r.get("volume"))
                except ValueError:
                    continue
                if last.get(s) == sig:
                    continue              # a day NSE repeats on a holiday: the same values as the day before
                last[s] = sig
                if v > 0:
                    out.setdefault(s, {})[d] = v
    return out


def volumes(today: Optional[date] = None) -> Optional[Dict[str, Dict[str, int]]]:
    """{symbol: {date: full-day volume}} for the last 400 days, or None when there is no bhavcopy on this machine. Read once and kept until a file changes."""
    folder = _dir()
    files = glob.glob(os.path.join(folder, "bhav_[0-9][0-9][0-9][0-9].csv.gz"))
    if not files:
        return None
    sig = tuple(sorted((f, int(os.path.getmtime(f)), os.path.getsize(f)) for f in files))
    if _cache["sig"] == sig:
        return _cache["data"]  # type: ignore[return-value]
    since = ((today or date.today()) - timedelta(days=KEEP_DAYS)).isoformat()
    try:
        data = _load(folder, since)
    except Exception:
        log.exception("the bhavcopy volume could not be read; the candles' own volume is used")
        return None
    _cache["sig"], _cache["data"] = sig, data
    return data


def for_candles(symbol: str, dates, provider) -> list:
    """The volume list for a company's candle dates: NSE's full-day volume where the file has it, a blank (None) where it does not. With no bhavcopy at all the provider's own list stays."""
    data = volumes()
    if data is None:
        return list(provider)
    by = data.get(symbol) or {}
    return [by.get(str(d)[:10]) for d in dates]
