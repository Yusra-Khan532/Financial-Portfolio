"""Task #128: holdings are read by ISIN, never by a name that can differ. Unit tests of the rules, then the resolver and the search list against Postgres."""
import gzip
import io
import os
import zipfile
from datetime import date
from pathlib import Path

import pytest

from finlit import isin as I


def check(prefix: str) -> str:
    """The valid ISIN that starts with these 11 characters."""
    for d in "0123456789":
        if I.valid(prefix + d):
            return prefix + d
    raise AssertionError(prefix)


def test_check_digit_real_isins_pass_and_a_typo_fails():
    for real in ("INE002A01018", "INE467B01029", "INE040A01034", "INF204KB14I2", "IN0020230085"):   # Reliance, TCS, HDFC Bank, an ETF, a G-sec
        assert I.valid(real), real
    assert not I.valid("INE002A01019")          # one digit wrong
    assert not I.valid("INE002A0101")           # too short
    assert not I.valid("US0378331005")          # a valid ISIN, but not an Indian one: not read here


def test_kind_from_cfi_or_from_the_isin_itself():
    assert I.kind_of("INE002A01018", "ESVUFR") == "share"
    assert I.kind_of("INE002A01018") == "share"                      # type 01, no CFI
    assert I.kind_of("INE002A07023") == "other"                      # type 07: a debenture of the same company
    assert I.kind_of("INF204KB14I2") == "fund"
    assert I.kind_of("IN0020230085") == "govt"
    assert I.kind_of("INE123A14AB5", "DYZUXN") == "other"            # commercial paper
    assert I.kind_of("INE397D04010", "EPNXXR") == "preference"       # Bharti Airtel's 0% preference share: not its ordinary share


def test_list_date_from_both_file_names():
    assert I.list_date("ISIN_DETAILS_12-Nov-2026.csv") == date(2026, 11, 12)
    assert I.list_date("nsdl_isin_2026-11-12.csv.gz") == date(2026, 11, 12)
    assert I.list_date("holdings.csv") is None


NSDL_HEAD = "ISIN,NAME_OF_ISSUER,SECURITY_DESCRIPTION,CURRENCY,INTEREST_RATE,MATURITY_DATE,FISN,CFI\n"


def test_reads_nsdls_own_layout_keeps_shares_and_fund_units_only():
    text = NSDL_HEAD + (
        '"INE002A01018","RELIANCE  INDUSTRIES LIMITED","RELIANCE INDUSTRIES LIMITED EQ","INR","","","","ESVUFR"\n'
        '"INE002A07023","RELIANCE INDUSTRIES LIMITED","RIL 8.5 NCD","INR","8.5","01-Jan-2030","","DBFUTN"\n'
        '"INF204KB14I2","NIPPON LIFE INDIA ASSET MANAGEMENT LIMITED","NIPPON INDIA ETF NIFTY BEES","INR","","","","CEOGEU"\n'
        '"BADISIN","X","Y","INR","","","",""\n')
    rows = list(I.read_master(io.StringIO(text)))
    assert [r[0] for r in rows] == ["INE002A01018", "INF204KB14I2"]
    assert rows[0][1] == "RELIANCE INDUSTRIES LIMITED"               # spaces tidied


def test_the_shipped_list_is_the_attached_nsdl_file_and_complete():
    path = I.shipped()
    assert path is not None and I.list_date(path.name) == date(2026, 11, 12)
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        rows = list(I.read_master(fh))
    by = {r[0]: r for r in rows}
    assert len(rows) > 200_000
    assert by["INE002A01018"][1] == "RELIANCE INDUSTRIES LIMITED"
    assert sum(1 for r in rows if r[3].startswith("E")) > 100_000 and sum(1 for r in rows if r[0].startswith("INF")) > 50_000


# ---------------------------------------------------------------------------------------------------------- against Postgres

OLD, CUR = check("INE9Z9A0102"), check("INE9Z9A0103")      # a company's ISIN before and after a face-value split
BSE_ONLY = check("INE9Z9B0101")
PARTLY = check("INE9Z9C0202")                               # not on any exchange list; same issuer as CUR2
CUR2 = check("INE9Z9C0101")
NAMED = check("INE9Z9D0101")                                # only the depository knows it; its issuer is named exactly as one company
UNLISTED = check("INE9Z9E0101")
BOND = check("INE9Z9A0702")
FUND, ETF = check("INF9Z9A01A1"), check("INF9Z9B01B2")
NOWHERE = check("INE9Z9F0101")
PREF = check("INE9Z9C0401")                                    # a preference share of the company behind CUR2: never offered as that company
ETF2, REIT = check("INF9Z9C01C3"), check("INE9Z9G2501")        # listed on the exchange, but not as a company's share
LISTED_NEW = check("INE9Z9H0101")                             # a listed share our company list does not have yet
SYMS = ["ZZKNOW", "ZZBSE", "ZZPART", "ZZNAMED", "ZZATLANTA", "ZZATLANTAE"]


@pytest.fixture
async def db():
    from finlit.config import Settings
    from finlit.store import Store
    s = Settings(finedge_api_key="t", finedge_mode="fixtures", database_url=os.getenv("TEST_DATABASE_URL", "postgresql://finlit:finlit@localhost:5432/finlit_test"),
                 redis_url=os.getenv("TEST_REDIS_URL", "redis://localhost:6379/15"))
    try:
        st = await Store.connect(s, migrate=True)
    except Exception as exc:  # pragma: no cover
        pytest.skip(f"postgres/redis not available: {exc}")
    isins = [OLD, CUR, BSE_ONLY, PARTLY, CUR2, NAMED, UNLISTED, BOND, FUND, ETF, NOWHERE, ETF2, REIT, LISTED_NEW, PREF]

    async def clean(conn):
        await conn.execute("DELETE FROM companies WHERE symbol = ANY($1)", SYMS)
        await conn.execute("DELETE FROM dhan_instruments WHERE isin = ANY($1)", isins)
        await conn.execute("DELETE FROM disclosure_isin WHERE isin = ANY($1)", isins)
        await conn.execute("DELETE FROM isin_master WHERE isin = ANY($1)", isins)
        await conn.execute("DELETE FROM mf_schemes WHERE code = 9999901")
        await conn.execute("DELETE FROM etf_funds WHERE symbol = 'ZZBEES'")

    async with st.pool.acquire() as conn:
        await clean(conn)
        await conn.executemany("INSERT INTO companies (symbol, name, nse_code, bse_code) VALUES ($1, $2, $3, $4)", [
            ("ZZKNOW", "Zz Knowledge Marine Ltd", "ZZKNOW", "999101"), ("ZZBSE", "Zz Bse Only Ltd", None, "999102"),
            ("ZZPART", "Zz Partly Ltd", "ZZPART", None), ("ZZNAMED", "Zz Named Industries Ltd", None, "999104"),
            ("ZZATLANTA", "Zz Atlanta Ltd", None, "999105"), ("ZZATLANTAE", "Zz Atlanta Electricals Ltd", "ZZATLANTAE", None)])
        await conn.executemany("INSERT INTO dhan_instruments (exch, security_id, symbol, isin, name, series) VALUES ($1, $2, $3, $4, $5, $6)", [
            ("NSE", "z1", "ZZKNOW", CUR, "Zz Knowledge", "EQ"), ("BSE", "999102", "ZZBSE", BSE_ONLY, "Zz Bse", "B"), ("NSE", "z3", "ZZPART", CUR2, "Zz Partly", "EQ")])
        await conn.executemany("INSERT INTO dhan_instruments (exch, security_id, symbol, isin, name, series, inst_type) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
            ("NSE", "z4", "ZZGOLDBEES", ETF2, "Zz Gold BeES", "EQ", "ETF"), ("NSE", "z5", "ZZREIT", REIT, "Zz Office REIT", "RR", "REIT"),
            ("NSE", "z6", "ZZNEWCO", LISTED_NEW, "Zz New Co", "EQ", "ES")])
        await conn.execute("INSERT INTO disclosure_isin (isin, symbol) VALUES ($1, 'ZZKNOW')", OLD)
        await conn.executemany("INSERT INTO isin_master (isin, issuer, description, cfi) VALUES ($1, $2, $3, $4)", [
            (PARTLY, "ZZ PARTLY LIMITED", "ZZ PARTLY LIMITED EQ PARTLY PAID UP", "ESVUFN"), (CUR2, "ZZ PARTLY LIMITED", "ZZ PARTLY LIMITED EQ", "ESVUFN"),
            (NAMED, "ZZ NAMED INDUSTRIES LIMITED", "ZZ NAMED INDUSTRIES LIMITED EQ", "ESVUFN"),
            (UNLISTED, "ZZ PRIVATE HOLDINGS PRIVATE LIMITED", "ZZ PRIVATE HOLDINGS EQ", "ESNUFN"),
            (PREF, "ZZ PARTLY LIMITED", "ZZ PARTLY LIMITED 8% PREF", "EPNXXR"),
            (BOND, "ZZ KNOWLEDGE MARINE LIMITED", "ZZ KNOWLEDGE 9.5 NCD 2029", "DBFUTN"), (FUND, "ZZ AMC LIMITED", "ZZ FLEXI CAP FUND DIRECT GROWTH", "CIOGEU")])
        await conn.execute("INSERT INTO mf_schemes (code, name, isin, amc, scheme_type, category, plan, option_class, family) "
                           "VALUES (9999901, 'Zz Flexi Cap Fund - Direct Plan - Growth', $1, 'Zz AMC', 'Open Ended', 'Equity Scheme - Flexi Cap Fund', 'Direct', 'Growth', 'zz')", FUND)
        await conn.execute("INSERT INTO etf_funds (symbol, isin, instrument_key, exchange_name, display_name) VALUES ('ZZBEES', $1, 'NSE_EQ|x', 'ZZBEES', 'Zz Nifty BeES')", ETF)
    I._CACHE.clear()
    st.test_settings = s
    try:
        yield st
    finally:
        async with st.pool.acquire() as conn:
            await clean(conn)
        await st.invalidate_search()
        await st.close()


async def test_each_isin_is_answered_by_the_right_list_and_never_by_its_name(db):
    async with db.pool.acquire() as conn:
        out = await I.resolve(conn, [CUR, OLD, BSE_ONLY, PARTLY, NAMED, UNLISTED, BOND, FUND, ETF, NOWHERE, ETF2, REIT, LISTED_NEW, PREF, "INE9Z9A01020"])
    assert (out[CUR]["status"], out[CUR]["symbol"], out[CUR]["how"]) == ("matched", "ZZKNOW", "isin")
    assert (out[OLD]["status"], out[OLD]["symbol"], out[OLD]["how"]) == ("matched", "ZZKNOW", "old_isin")      # the old ISIN still finds the company
    assert (out[BSE_ONLY]["status"], out[BSE_ONLY]["symbol"]) == ("matched", "ZZBSE")                          # BSE share, by its scrip code
    assert (out[PARTLY]["status"], out[PARTLY]["symbol"], out[PARTLY]["how"]) == ("check", "ZZPART", "issuer")  # same issuer, said plainly
    assert "PARTLY PAID" in out[PARTLY]["note"]
    assert (out[NAMED]["status"], out[NAMED]["symbol"], out[NAMED]["how"]) == ("check", "ZZNAMED", "issuer_name")
    assert out[UNLISTED]["status"] == "not_found" and "ZZ PRIVATE HOLDINGS PRIVATE LIMITED" in out[UNLISTED]["note"]
    assert out[BOND]["status"] == "not_share" and out[BOND]["symbol"] is None and "NCD" in out[BOND]["note"]    # a bond of a listed company is not its share
    assert out[FUND]["status"] == "not_share" and "Zz Flexi Cap Fund - Direct Plan - Growth" in out[FUND]["note"] and "MF portfolio" in out[FUND]["note"]
    assert out[FUND]["scheme"]["code"] == 9999901
    assert out[ETF]["status"] == "not_share" and "Zz Nifty BeES" in out[ETF]["note"]
    assert out[NOWHERE]["status"] == "not_found" and "check it against your statement" in out[NOWHERE]["note"]
    assert out["INE9Z9A01020"]["status"] == "invalid"
    assert out[ETF2]["status"] == "not_share" and "exchange-traded fund (Zz Gold BeES)" in out[ETF2]["note"]
    assert out[REIT]["status"] == "not_share" and out[REIT]["note"].startswith("A REIT unit")
    assert out[PREF]["status"] == "not_share" and out[PREF]["symbol"] is None and "preference share" in out[PREF]["note"]
    assert out[LISTED_NEW]["status"] == "not_found" and "listed on NSE as ZZNEWCO" in out[LISTED_NEW]["note"]
    for a in out.values():                                                     # every blank says why
        assert a["symbol"] or a["note"]


async def test_resolve_endpoint_answers_with_its_sources(db):
    import httpx
    from finlit.api import create_app
    app = create_app(db.test_settings, store=db)
    async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as api:
        r = await api.post("/api/isin/resolve", json={"isins": [CUR.lower(), " " + BOND]})
        assert r.status_code == 200
        body = r.json()
        assert body["items"][CUR]["symbol"] == "ZZKNOW" and body["items"][BOND]["status"] == "not_share"
        assert body["sources"]["exchanges"]["source"].startswith("NSE and BSE")
        assert (await api.post("/api/isin/resolve", json={"isins": [CUR], "names": ["x"]})).status_code == 422   # only ISINs are accepted
        assert (await api.post("/api/isin/resolve", json={"isins": []})).status_code == 422


async def test_search_list_carries_the_current_exchange_isin_not_the_old_one(db):
    """KMEW, BNAGROCHEM and GNRL on the live list showed the ISIN from before their face-value change (the disclosure files'); the exchanges' wins now."""
    import orjson
    await db.invalidate_search()
    body, _, _ = await db.search_index()
    doc = orjson.loads(body)
    at = {row[0]: doc["isin"][i] for i, row in enumerate(doc["rows"])}
    assert at["ZZKNOW"] == CUR and at["ZZBSE"] == BSE_ONLY and at["ZZPART"] == CUR2
    assert at["ZZATLANTA"] == ""                                                # no list knows it: empty, not guessed


async def test_search_list_carries_each_bse_scrip_id_a_broker_file_names_a_company_by(db):
    """22 Nov 2026: a broker's holdings report named two BSE-only companies (no NSE listing) by their BSE scrip IDs, which no field of the list held,
    so the shares were "not recognised". The list now carries the scrip ID from the exchange's scrip master, only when it adds a name."""
    import orjson
    async with db.pool.acquire() as conn:
        await conn.execute("INSERT INTO dhan_instruments (exch, security_id, symbol, isin, name, series) VALUES ('BSE', '999104', 'ZZNAMEDID', NULL, 'Zz Named', 'X')")
    try:
        await db.invalidate_search()
        doc = orjson.loads((await db.search_index())[0])
        at = {row[0]: doc["bseId"][i] for i, row in enumerate(doc["rows"])}
        assert len(doc["bseId"]) == len(doc["rows"])
        assert at["ZZNAMED"] == "ZZNAMEDID"          # BSE 999104's scrip ID
        assert at["ZZBSE"] == ""                     # its scrip ID is its symbol already: nothing to add
        assert at["ZZKNOW"] == ""                    # no BSE line in the scrip master
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute("DELETE FROM dhan_instruments WHERE exch = 'BSE' AND security_id = '999104'")
        await db.invalidate_search()


async def test_loader_reads_the_zip_nsdl_sends_and_refuses_a_cut_short_file(db, tmp_path: Path):
    small = tmp_path / "ISIN_DETAILS_01-Dec-2026.zip"
    with zipfile.ZipFile(small, "w") as z:
        z.writestr("ISIN_DETAILS_01-Dec-2026.csv", NSDL_HEAD + '"INE002A01018","RELIANCE INDUSTRIES LIMITED","EQ","INR","","","","ESVUFR"\n')
    with pytest.raises(ValueError, match="incomplete"):
        await I.load_master(db, small)
    async with db.pool.acquire() as conn:
        assert await conn.fetchval("SELECT count(*) FROM isin_master WHERE isin = $1", PARTLY) == 1   # the stored list is kept


# ------------------------------------------------------------------------------------------------------------- task #183: ISIN as the key
async def test_every_company_has_its_current_share_isin_from_the_exchange_lists(db):
    import types
    app = types.SimpleNamespace(state=types.SimpleNamespace(store=db))
    got = await I.symbol_isins(app)
    assert got["ZZKNOW"] == CUR and got["ZZBSE"] == BSE_ONLY and got["ZZPART"] == CUR2      # NSE first, BSE by scrip code; never the old disclosure ISIN
    assert "ZZATLANTA" not in got                                                          # no list carries it: absent, not guessed
    assert I.looks_like_isin(" ine040a01034 ") and not I.looks_like_isin("RELIANCE")


async def test_an_isin_reads_as_its_company_in_every_address(db):
    import httpx
    from finlit.api import create_app
    app = create_app(db.test_settings, store=db)
    async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as api:
        for path in (f"/api/isin/{CUR}", f"/api/securities/{CUR.lower()}"):
            a = (await api.get(path)).json()
            assert (a["status"], a["symbol"], a["url"]) == ("matched", "ZZKNOW", "/stocks/ZZKNOW")
        bond = (await api.get(f"/api/securities/{BOND}")).json()
        assert bond["status"] == "not_share" and bond["symbol"] is None and bond["url"] is None and "NCD" in bond["note"]
        r = await api.get(f"/api/stocks/{BOND}")                                               # a company's bond is not its share: said, not guessed
        assert r.status_code == 404 and "NCD" in r.json()["detail"]["detail"]
        r = await api.get(f"/api/stocks/{CUR}")                                                # the share's ISIN reads as ZZKNOW (its report is not built here)
        assert r.status_code != 404 or "ISIN" not in str(r.json())


async def test_the_stock_answer_and_the_screener_rows_carry_the_isin(db):
    import httpx
    import orjson
    from finlit.api import create_app
    from finlit.snapshot import SNAPSHOT_VERSION
    from finlit.store import stock_key
    body = orjson.dumps({"meta": {"symbol": "ZZKNOW", "statement": "consolidated", "version": SNAPSHOT_VERSION}, "quote": {"price": 100.0}, "profile": {"name": "Zz Knowledge Marine Ltd"}})
    await db.redis.hset(stock_key("ZZKNOW", "consolidated"), mapping={"summary": body, "summary:etag": '"zz1"'})
    app = create_app(db.test_settings, store=db)
    try:
        async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as api:
            for path in ("/api/stocks/ZZKNOW", f"/api/stocks/{CUR}"):
                r = await api.get(path)
                assert r.status_code == 200, r.text
                assert r.json()["meta"]["isin"] == CUR and r.json()["quote"]["price"] == 100.0       # the stored answer, with its ISIN added
            rows = {x["symbol"]: x for x in (await api.get("/api/screener/universe")).json()["rows"]}
            if "ZZKNOW" in rows:                                                                    # the universe lists companies with a listing row
                assert rows["ZZKNOW"]["isin"] == CUR
            assert all("isin" in x for x in rows.values())
    finally:
        await db.redis.delete(stock_key("ZZKNOW", "consolidated"))


async def test_search_list_carries_each_company_nse_industry(db, monkeypatch):
    """Task #336 (23 Nov 2026): the company pickers' Filters gain Industry, so the list carries each company's NSE industry as a table of names
    (most companies first) and one code per row (-1: not known), as it does for sectors."""
    import orjson
    from finlit import taxonomy
    monkeypatch.setattr(taxonomy, "quote_pages", lambda: {"ZZKNOW": "Banks", "ZZBSE": "Banks", "ZZPART": "Power"})
    await db.invalidate_search()
    try:
        doc = orjson.loads((await db.search_index())[0])
        assert len(doc["ind"]) == len(doc["rows"])
        assert doc["industries"][:2] == ["Banks", "Power"]            # most companies first
        at = {row[0]: doc["ind"][i] for i, row in enumerate(doc["rows"])}
        assert doc["industries"][at["ZZKNOW"]] == "Banks" and doc["industries"][at["ZZPART"]] == "Power"
        assert at["ZZATLANTA"] == -1                                   # not on NSE's quote pages: not known, never guessed
    finally:
        await db.invalidate_search()
