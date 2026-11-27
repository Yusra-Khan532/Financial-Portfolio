"""26 Nov 2026 (the founder): after the 15:30 close the screens must move to that day's data as fast as possible, use whatever closes are loaded, and say
when something fails.

  * eod_bhav: the exchanges' own end-of-day files (UDiFF bhavcopy, NSE zipped, BSE plain) give every company's official close in one download each;
    NSE first, BSE only for a company with no NSE code; a file not out yet (404) is the normal wait, not a failure; a refused request goes through the relay.
  * listday: a day counts once a quarter of the market has its close (was half); rows still waiting say "still loading", not "no trade".
  * presets probe: the lists are rebuilt as more closes of the same day arrive.
  * freshness: a "Closing prices (every company)" line goes late and stale, which the admin bell reports."""
import io
import json
import zipfile
from datetime import date, datetime, timezone

import httpx
import pytest

from finlit import eod_bhav
from finlit.jobs import freshness, probes
from finlit.jobs.registry import by_name
from finlit.presets import listday
from finlit.presets.registry import REGISTRY_VERSION
from test_integration import store  # noqa: F401  (fixture)

D26 = date(2026, 11, 26)
HEAD = ("TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,"
        "ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4")


def line(day, fid, sym, series, o, h, lo, c, vol, tp="STK"):
    return f"{day},{day},CM,NSE,{tp},{fid},INE000000000,{sym},{series},,,,,{sym} LTD,{o},{h},{lo},{c},{c},{o},,,,,{vol},1,1,F1,1,,,,,"


def nse_zip(lines):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("BhavCopy_NSE_CM_0_0_0_20261126_F_0000.csv", "\n".join([HEAD, *lines]))
    return buf.getvalue()


NSE_FILE = nse_zip([
    line("2026-11-26", 2885, "RELIANCE", "EQ", 1500, 1520, 1490, 1512.4, 9000000),
    line("2026-11-26", 2885, "RELIANCE", "N1", 100, 100, 100, 100, 5),          # a bond line of the same symbol: never the share's close
    line("2026-11-26", 11536, "TCS", "BE", 3900, 3950, 3880, 3941.0, 1200000),
    line("2026-11-26", 1, "NOTOURS", "EQ", 10, 11, 9, 10.5, 100),
])
BSE_FILE = "\n".join([HEAD,
                      line("2026-11-26", 540084, "SPICY", "X", 20, 21, 19, 20.75, 3000),
                      line("2026-11-26", 500325, "RELIANCE", "A", 1501, 1519, 1491, 1511.9, 400000)]).encode()   # an NSE company: its NSE close wins


def getter(answers):
    seen = []

    async def get(url, referer):
        seen.append(url)
        for k, v in answers.items():
            if k in url:
                return v
        return 404, b""
    get.seen = seen
    return get


# ------------------------------------------------------------------------------------------------------------- the files
def test_the_nse_file_gives_each_shares_own_series_and_official_close():
    rows = eod_bhav.parse(NSE_FILE, "NSE", D26)
    assert rows["RELIANCE"]["close"] == 1512.4 and rows["RELIANCE"]["series"] == "EQ" and rows["RELIANCE"]["volume"] == 9000000
    assert rows["TCS"]["series"] == "BE"


def test_the_bse_file_is_keyed_by_scrip_code():
    rows = eod_bhav.parse(BSE_FILE, "BSE", D26)
    assert rows["540084"]["close"] == 20.75 and "500325" in rows


def test_a_file_of_another_day_is_not_taken_for_today():
    with pytest.raises(ValueError):
        eod_bhav.parse(nse_zip([line("2026-11-25", 2885, "RELIANCE", "EQ", 1, 1, 1, 1, 1)]), "NSE", D26)


def test_the_hours_the_job_looks():
    ist = lambda h, m, d=26: datetime(2026, 11, d, h, m, tzinfo=eod_bhav.IST)   # noqa: E731
    assert eod_bhav.looking(ist(16, 29)) is None and eod_bhav.looking(ist(16, 30)) == D26 and eod_bhav.looking(ist(23, 29)) == D26
    assert eod_bhav.looking(ist(23, 30)) is None and eod_bhav.looking(ist(18, 0, 28)) is None          # 28 Nov 2026 is a Saturday


async def test_a_refused_request_goes_through_the_relay():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if request.url.host == "relay.example":
            assert request.headers["x-relay-key"] == "k"
            return httpx.Response(200, content=b"file", headers={"x-relay": "1"})
        return httpx.Response(403)
    get, close = eod_bhav.make_getter(relay=("https://relay.example", "k"), transport=httpx.MockTransport(handler))
    try:
        assert await get(eod_bhav.urls(D26)["BSE"], "https://www.bseindia.com/") == (200, b"file")
    finally:
        await close()
    assert calls[0].startswith("https://www.bseindia.com/") and calls[1].startswith("https://relay.example/fetch")


# ------------------------------------------------------------------------------------------------------------- the store
@pytest.fixture
async def market(store):  # noqa: F811
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM daily_candles")
        await conn.execute("DELETE FROM preset_results")
        await conn.execute("DELETE FROM preset_meta WHERE key = 'last_run'")
        await conn.execute("INSERT INTO companies (symbol, name, nse_code, bse_code) VALUES ('RELIANCE', 'Reliance', 'RELIANCE', '500325'), "
                           "('TCS', 'TCS', 'TCS', '532540'), ('SPICY', 'Spicy', '', '540084') "
                           "ON CONFLICT (symbol) DO UPDATE SET nse_code = EXCLUDED.nse_code, bse_code = EXCLUDED.bse_code")
    await store.redis.delete(*[eod_bhav.DONE_KEY.format(day=D26.isoformat(), exch=x) for x in ("NSE", "BSE")])
    return store


async def test_both_files_land_in_daily_candles_nse_first(market):
    res = await eod_bhav.load(market, D26, get=getter({"nsearchives": (200, NSE_FILE), "bseindia": (200, BSE_FILE)}))
    assert res["NSE"] == {"status": "loaded", "rows": 3, "companies": 2} and res["BSE"]["companies"] == 1 and res["written"] == 3
    async with market.pool.acquire() as conn:
        got = {r["symbol"]: (r["close"], r["exch"]) for r in await conn.fetch("SELECT symbol, close, exch FROM daily_candles WHERE day = $1", D26)}
    assert got == {"RELIANCE": (1512.4, "NSE"), "TCS": (3941.0, "NSE"), "SPICY": (20.75, "BSE")}     # Reliance's BSE line is not used
    assert await market.redis.get(eod_bhav.DONE_KEY.format(day="2026-11-26", exch="NSE"))


async def test_a_file_not_out_yet_is_the_normal_wait_and_the_probe_asks_again(market):
    evening = datetime(2026, 11, 26, 12, 0, tzinfo=timezone.utc)          # 17:30 IST
    for x in ("NSE", "BSE"):                                               # the day before is loaded: only today's files are in question here
        await market.redis.set(eod_bhav.DONE_KEY.format(day="2026-11-25", exch=x), 1)
    res = await eod_bhav.load(market, D26, get=getter({"bseindia": (200, BSE_FILE)}))
    assert res["NSE"] == {"status": "not out yet"} and res["BSE"]["status"] == "loaded"
    assert await eod_bhav.has_work(market, evening) is True                # NSE still missing: asked again in 10 minutes
    await eod_bhav.load(market, D26, get=getter({"nsearchives": (200, NSE_FILE)}), only=["NSE"])
    assert await eod_bhav.has_work(market, evening) is False


async def test_a_refusal_is_a_failure_that_the_job_reports(market):
    res = await eod_bhav.load(market, D26, get=getter({"nsearchives": (403, b""), "bseindia": (200, BSE_FILE)}))
    assert res["NSE"] == {"status": "failed", "why": "HTTP 403"} and res["BSE"]["status"] == "loaded"


def test_the_job_is_registered_with_its_probe(store):  # noqa: F811
    job = by_name()["eod-candles"]
    assert job.probe == "eod-candles" and job.min_gap_min == 10 and job.cls != "bulk"
    assert "eod-candles" in probes.build(store)


# ------------------------------------------------------------------------------------------------------------- partial closes in the lists
def test_a_quarter_of_the_market_makes_a_session_and_rows_still_waiting_say_so():
    counts = {date(2026, 11, 25): 1000, D26: 300}
    assert listday.sessions_from_counts(counts, D26)[0] == D26              # 30%: used at once (needed 50% before)
    assert listday.sessions_from_counts({date(2026, 11, 25): 1000, D26: 200}, D26)[0] == date(2026, 11, 25)   # 20%: not yet
    m = listday.Market(day=D26, loaded=300, busiest=1000)
    assert not m.complete and listday.Market(day=D26, loaded=950, busiest=1000).complete
    row = {}
    listday.row_price(row, listday.DayClose(day="2026-11-25", close=100.0), "2026-11-26", loading=True)
    assert row["ret_1d_note"] == "The 26 Nov close is still loading; the price is the 25 Nov close" and row["price"] == 100.0
    row = {}
    listday.row_price(row, listday.DayClose(day="2026-11-25", close=100.0), "2026-11-26", loading=False)
    assert row["ret_1d_note"].startswith("No trade on 26 Nov")


async def test_the_lists_are_rebuilt_as_more_closes_of_the_same_day_arrive(market):
    now = datetime(2026, 11, 26, 13, 0, tzinfo=timezone.utc)                # 18:30 IST
    async with market.pool.acquire() as conn:
        rows = [(f"S{i:04d}", date(2026, 11, 25)) for i in range(400)] + [(f"S{i:04d}", D26) for i in range(150)]
        await conn.executemany("INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ($1,$2,1,1,1,1,1,'NSE')", rows)
        await conn.execute("INSERT INTO preset_results (preset_id, chips, registry, as_of, body) VALUES ('top-large','none',$1,$2,'{}'::jsonb)", REGISTRY_VERSION, D26)
        await conn.execute("INSERT INTO preset_meta (key, value) VALUES ('last_run', $1::jsonb)", json.dumps({"asOf": "2026-11-26", "coverage": 150}))
    assert await listday.has_work(market, now) is False                     # nothing more yet
    async with market.pool.acquire() as conn:
        await conn.executemany("INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ($1,$2,1,1,1,1,1,'NSE')",
                               [(f"S{i:04d}", D26) for i in range(150, 400)])
    assert await listday.has_work(market, now) is True                      # 400 now against 150 at the build: rebuild


def test_the_closing_prices_line_goes_late_then_stale():
    exp = {"found_target": D26}
    line_at = lambda h, m, closes: next(d for d in freshness.evaluate_facts({**exp, "closes_day": closes}, datetime(2026, 11, 26, h, m, tzinfo=timezone.utc))["datasets"]  # noqa: E731
                                        if d["key"] == "closing_prices")
    assert line_at(14, 30, date(2026, 11, 26))["status"] == "fresh"
    assert line_at(14, 30, date(2026, 11, 25))["status"] == "late"          # 20:00 IST without the day's closes
    assert line_at(17, 30, date(2026, 11, 25))["status"] == "stale"         # 23:00 IST


# ------------------------------------------------------------------------------------------------------------- 27 Nov 2026: a missed evening is caught up
async def test_a_missed_evening_is_loaded_the_next_morning(market):
    morning = datetime(2026, 11, 27, 0, 0, tzinfo=timezone.utc)            # 27 Nov 05:30 IST: 26 Nov's files were never loaded (the deploys of that night)
    assert eod_bhav.days_to_look(morning) == [D26]
    assert await eod_bhav.has_work(market, morning) is True
    out = await eod_bhav.catch_up(market, morning, get=getter({"nsearchives": (200, NSE_FILE), "bseindia": (200, BSE_FILE)}))
    assert [r["day"] for r in out] == ["2026-11-26"] and out[0]["written"] == 3
    assert await eod_bhav.has_work(market, morning) is False


async def test_a_past_day_without_files_was_a_holiday_and_is_not_asked_again(market):
    morning = datetime(2026, 11, 25, 0, 0, tzinfo=timezone.utc)            # 25 Nov 05:30 IST: 24 Nov, Guru Nanak Jayanti, has no files
    for x in ("NSE", "BSE"):
        await market.redis.delete(eod_bhav.DONE_KEY.format(day="2026-11-24", exch=x))
    out = await eod_bhav.catch_up(market, morning, get=getter({}))         # 404 from both
    assert out[0]["NSE"]["status"].startswith("no session") and out[0]["BSE"]["status"].startswith("no session")
    assert await eod_bhav.has_work(market, morning) is False


def test_a_monday_morning_looks_back_to_friday():
    assert eod_bhav.days_to_look(datetime(2026, 11, 30, 2, 0, tzinfo=timezone.utc)) == [date(2026, 11, 27)]
