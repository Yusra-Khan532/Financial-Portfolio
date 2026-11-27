"""Task #349 PR 4: holdings-aware answers (finlit/ask/mine.py, finlit/ask/api.py relation_lookup, service.ADVICE; docs/ASK-AI.md "Your holdings").

Real Postgres and Redis (TEST_DATABASE_URL, TEST_REDIS_URL), signed-in Silver and Gold members and the scripted model of test_ask.py. What must hold:
a share without the owned flag gives no quantity; the cost is used only when the member entered it (a statement's rate is said as such); ETF and
mutual fund look-through give the company's % and the file's date; the watchlist and alert tags are right; the weight is the Equity portfolio
page's own (portfolio_page.score.weights_of); a member with no link gets the very same request and cache key as before; the 30-minute cache is
skipped only when a relation block applies; personal advice is withdrawn while describing the position is not; member A never sees member B's data."""

import datetime as dt
import json
from typing import Any, Dict, List

import pytest

from finlit.ask import api as ask_api, mine, service
from finlit.auth.service import Ctx
from finlit.portfolio_page.score import weights_of
from test_ask import FakeClient, FakeGateway, collect, enable
from test_ask_memory import asked, memtable, uid_of  # noqa: F401
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401

RIL_ISIN, TCS_ISIN = "INE002A01018", "INE467B01029"
CLOSE_ON = dt.date(2026, 11, 21)
DISC_ON = dt.date(2026, 10, 31)


def pg(f):
    return pytest.mark.integration(pytest.mark.usefixtures("memtable")(f))


def h(symbol: str, qty: float, price: float = 0, **kw) -> Dict[str, Any]:
    return {"id": f"{symbol.lower()[:8]}{int(qty) % 1000}", "symbol": symbol, "qty": qty, "price": price, **kw}


async def put_state(app, uid: str, holdings: List[Dict[str, Any]] = None, lists: List[Dict[str, Any]] = None, prefs: Dict[str, Any] = None) -> None:
    async with app.state.store.pool.acquire() as c:
        await c.execute("""INSERT INTO user_state (user_id, portfolio, watchlist, prefs, updated_at) VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, now())
                           ON CONFLICT (user_id) DO UPDATE SET portfolio = EXCLUDED.portfolio, watchlist = EXCLUDED.watchlist, prefs = EXCLUDED.prefs,
                           updated_at = now()""",
                        uid, json.dumps({"holdings": holdings or []}), json.dumps({"lists": lists or []}), json.dumps(prefs or {}))


async def closes(app, prices: Dict[str, float], on: dt.date = CLOSE_ON) -> None:
    async with app.state.store.pool.acquire() as c:
        for s, p in prices.items():
            await c.execute("DELETE FROM price_daily WHERE symbol = $1 AND day >= $2", s, on)
            await c.execute("INSERT INTO price_daily (symbol, day, close) VALUES ($1, $2, $3)", s, on, p)


async def isins(app) -> None:
    async with app.state.store.pool.acquire() as c:
        for i, s in ((RIL_ISIN, "RELIANCE"), (TCS_ISIN, "TCS")):
            await c.execute("INSERT INTO disclosure_isin (isin, symbol) VALUES ($1, $2) ON CONFLICT (isin) DO UPDATE SET symbol = EXCLUDED.symbol", i, s)


async def fund(app, *, code: int, name: str, isin: str, family: str, nav: float, pct: float, other_pct: float = 3.0) -> None:
    """A scheme, its family's monthly file of 31 Oct 2026 (RELIANCE at `pct`, TCS at `other_pct`) and an older file that must not be read."""
    async with app.state.store.pool.acquire() as c:
        await c.execute("""INSERT INTO mf_schemes (code, name, isin, amc, scheme_type, category, plan, option_class, family, nav, nav_date)
                           VALUES ($1, $2, $3, 'Test AMC', 'Open Ended', 'Equity Scheme - Flexi Cap Fund', 'Direct', 'Growth', $4, $5, $6)
                           ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, isin = EXCLUDED.isin, family = EXCLUDED.family, nav = EXCLUDED.nav,
                           nav_date = EXCLUDED.nav_date""", code, name, isin, family, nav, CLOSE_ON)
        for on, p in ((DISC_ON, pct), (dt.date(2026, 9, 30), pct + 5)):
            rows = [["Reliance Industries Ltd", RIL_ISIN, "Petroleum", "e", p, 100, 10.0], ["Tata Consultancy Services", TCS_ISIN, "IT", "e", other_pct, 10, 1.0]]
            await c.execute("""INSERT INTO disclosure_portfolios (fkey, as_of, amc, scheme_name, source, source_url, pct_total, n, holdings)
                               VALUES ($1, $2, 'Test AMC', $3, 'test', 'https://example.invalid', 100, 2, $4::jsonb)
                               ON CONFLICT (fkey, as_of) DO UPDATE SET holdings = EXCLUDED.holdings""", family, on, name, json.dumps(rows))


async def hold_fund(app, uid: str, code: int, units: float, sold: float = 0) -> None:
    async with app.state.store.pool.acquire() as c:
        hid = await c.fetchval("INSERT INTO mf_holdings (user_id, code) VALUES ($1, $2) RETURNING id", uid, code)
        await c.execute("INSERT INTO mf_holding_lots (holding_id, units, invested, bought_on, side) VALUES ($1, $2, 1000, '2025-01-01', 'buy')", hid, units)
        if sold:
            await c.execute("INSERT INTO mf_holding_lots (holding_id, units, invested, bought_on, side, pos) VALUES ($1, $2, 500, '2025-06-01', 'sell', 1)", hid, sold)


async def etf(app, uid: str, *, symbol: str, isin: str, family: str, qty: float, price: float, pct: float) -> None:
    await fund(app, code=900000 + len(symbol), name=f"{symbol} scheme", isin=isin, family=family, nav=price, pct=pct)
    async with app.state.store.pool.acquire() as c:
        await c.execute("""INSERT INTO etf_funds (symbol, isin, instrument_key, exchange_name, display_name, price, price_date)
                           VALUES ($1, $2, $3, $1, $4, $5, $6) ON CONFLICT (symbol) DO UPDATE SET isin = EXCLUDED.isin, display_name = EXCLUDED.display_name,
                           price = EXCLUDED.price, price_date = EXCLUDED.price_date""", symbol, isin, f"NSE_EQ|{isin}", f"{symbol} ETF", price, CLOSE_ON)
        await c.execute("INSERT INTO etf_holdings (user_id, symbol, qty, isin) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, symbol) DO UPDATE SET qty = EXCLUDED.qty",
                        uid, symbol, qty, isin)


async def alert(app, uid: str, symbol: str = "RELIANCE", value: float = 3000, status: str = "active") -> None:
    async with app.state.store.pool.acquire() as c:
        await c.execute("INSERT INTO alerts (user_id, symbol, metric, op, value, status) VALUES ($1, $2, 'price', 'above', $3, $4)", uid, symbol, value, status)


async def rel_of(app, uid: str, symbols=("RELIANCE",)) -> Dict[str, Any]:
    return await mine.relation(app.state.store.pool, uid, list(symbols), redis=app.state.store.redis)


async def member(app, email: str, plan: str = "gold"):
    m = await signed_in(app, email, plan=plan)
    return m, await uid_of(m)


def sent(client, i: int = 0) -> str:
    return next(m["content"] for m in reversed(client.calls[i]["messages"]) if m["role"] == "user" and isinstance(m["content"], str))   # the question's turn


async def clear_cache(app) -> None:
    for pat in ("ask:answer:*", "ask:rel:*"):
        for k in await app.state.store.redis.keys(pat):
            await app.state.store.redis.delete(k)


async def ask_q(m, q="how is reliance doing?", **kw):
    return await asked(m, q, symbol="RELIANCE", **kw)


# ------------------------------------------------------------------------------------------------------------------ 1. the owned flag

@pg
async def test_an_equity_holding_without_the_owned_flag_gives_no_quantity(app):
    _, uid = await member(app, "hold-1@example.com")
    await closes(app, {"RELIANCE": 2950})
    await put_state(app, uid, [h("RELIANCE", 40, 2400)])                    # qty 40 typed in the list, but never marked owned
    eq = (await rel_of(app, uid))["RELIANCE"]["equity"]
    assert eq["qty"] is None and "value" not in eq and "weight" not in eq and "cost" not in eq
    # task #349 fix F: "RELIANCE is on your Equity portfolio (no quantity saved)", never "You hold" without a quantity
    assert mine.lines((await rel_of(app, uid))["RELIANCE"], "RELIANCE") == ["RELIANCE is on your Equity portfolio (no quantity saved), so no shares are counted."]
    block = mine.note(await rel_of(app, uid))
    assert "RELIANCE is on your Equity portfolio (no quantity saved)" in block and "you hold" not in block.split("</member_relation>")[0].lower()
    assert 'Say "You hold" only with the number of shares' in mine.INSTRUCTION
    assert mine.tags(await rel_of(app, uid))[0] == {"kind": "hold", "text": "In your portfolio list", "tip": "On your Equity portfolio with no quantity saved"}
    await put_state(app, uid, [h("RELIANCE", 40, 2400, owned=True), h("RELIANCE", 10, 0)])   # only the owned row counts
    assert (await rel_of(app, uid))["RELIANCE"]["equity"]["qty"] == 40


@pg
async def test_sales_are_matched_first_in_first_out_and_a_sold_out_share_is_said_so(app):
    _, uid = await member(app, "hold-1b@example.com")
    await closes(app, {"RELIANCE": 2950})
    await put_state(app, uid, [h("RELIANCE", 40, 2400, owned=True, date="2025-01-01"), h("RELIANCE", 15, 2800, owned=True, side="sell", date="2025-06-01")])
    assert (await rel_of(app, uid))["RELIANCE"]["equity"]["qty"] == 25
    await put_state(app, uid, [h("RELIANCE", 40, 2400, owned=True, date="2025-01-01"), h("RELIANCE", 40, 2800, owned=True, side="sell", date="2025-06-01")])
    assert mine.lines((await rel_of(app, uid))["RELIANCE"])[0].endswith("so none is held now.")


# ------------------------------------------------------------------------------------------------------------------ 2. the cost

@pg
async def test_cost_is_used_only_when_entered_and_a_statement_rate_is_labelled(app):
    _, uid = await member(app, "hold-2@example.com")
    await closes(app, {"RELIANCE": 2950})
    await put_state(app, uid, [h("RELIANCE", 40, 2400, owned=True)])
    f = (await rel_of(app, uid))["RELIANCE"]
    assert f["equity"]["cost"] == {"kind": "entered", "invested": 96000.0, "avg": 2400.0}
    assert mine.lines(f) == ["Equity portfolio: 40 shares; ₹1,18,000 at ₹2,950 (close 21 Nov 2026); 100.0% of the Equity portfolio by value, the largest of 1.",
                             "Average buy price you entered ₹2,400; gain ₹22,000 (+22.9%) at the close of 21 Nov 2026."]
    await put_state(app, uid, [h("RELIANCE", 40, 0, owned=True)])          # no price entered
    f = (await rel_of(app, uid))["RELIANCE"]
    assert "cost" not in f["equity"] and mine.lines(f)[1] == "No buy price entered, so no gain or loss is worked out."
    await put_state(app, uid, [h("RELIANCE", 40, 2700, owned=True, priceFrom="rate", priceOn="2026-11-20")])   # the statement's Rate, not what was paid
    f = (await rel_of(app, uid))["RELIANCE"]
    assert f["equity"]["cost"]["kind"] == "rate" and f["equity"]["cost"]["on"] == "2026-11-20"
    line = mine.lines(f)[1]
    assert line.startswith("Buy price from your statement's rate (statement rate of 20 Nov 2026) ₹2,700, not a price you entered;") and "gain" not in line
    await put_state(app, uid, [h("RELIANCE", 20, 2400, owned=True), h("RELIANCE", 20, 2700, owned=True, priceFrom="rate", priceOn="2026-11-20")])
    assert (await rel_of(app, uid))["RELIANCE"]["equity"]["cost"]["kind"] == "rate"   # one open buy without an entered price: no entered cost


# ------------------------------------------------------------------------------------------------------------------ 3. ETF and mutual fund look-through

@pg
async def test_etf_and_mutual_fund_look_through_give_the_right_percent_and_date(app):
    _, uid = await member(app, "hold-3@example.com")
    await isins(app)
    await fund(app, code=880001, name="Parag Parikh Flexi Cap Fund", isin="INF879O01027", family="fam:ppfas-flexi", nav=80.0, pct=4.1)
    await fund(app, code=880002, name="Other Large Cap Fund", isin="INF000A01011", family="fam:other-large", nav=50.0, pct=7.25)
    await hold_fund(app, uid, 880001, units=2000)                            # 2,000 x ₹80 = ₹1,60,000; 4.1% of it = ₹6,560
    await hold_fund(app, uid, 880002, units=300, sold=100)                   # 200 units left
    await etf(app, uid, symbol="NIFTYBEES", isin="INF204KB14I2", family="fam:niftybees", qty=180, price=280.0, pct=9.8)
    f = (await rel_of(app, uid))["RELIANCE"]
    pp = next(x for x in f["funds"] if x["code"] == 880001)
    assert pp["pct"] == 4.1 and pp["asOf"] == "2026-10-31" and round(pp["amount"]) == 6560 and pp["navOn"] == "2026-11-21"   # the latest file, not September's
    other = next(x for x in f["funds"] if x["code"] == 880002)
    assert other["pct"] == 7.25 and round(other["amount"]) == round(200 * 50 * 0.0725)
    e = f["etfs"][0]
    assert e["symbol"] == "NIFTYBEES" and e["pct"] == 9.8 and e["asOf"] == "2026-10-31" and round(e["amount"]) == round(180 * 280 * 0.098)
    ls = mine.lines(f)
    assert "Through funds: Parag Parikh Flexi Cap Fund holds 4.1% (31 Oct 2026 disclosure), about ₹6,560 of your units (NAV 21 Nov 2026)" in ls[0]
    assert ls[1] == "Through ETFs: NIFTYBEES ETF holds 9.8% (31 Oct 2026 disclosure), about ₹4,939 of your units (price 21 Nov 2026)."
    t = {x["kind"]: x for x in mine.tags({"RELIANCE": f})}
    assert t["fund"]["text"] == "In 2 of your funds" and t["etf"]["text"] == "In your ETF" and "31 Oct 2026 disclosure" in t["fund"]["tip"]
    assert (await rel_of(app, uid, ["TCS"]))["TCS"]["funds"][0]["pct"] == 3.0   # the same files, another company


# ------------------------------------------------------------------------------------------------------------------ 4. watchlists and alerts

@pg
async def test_the_watchlist_and_alert_tags_are_right(app):
    _, uid = await member(app, "hold-4@example.com")
    await put_state(app, uid, lists=[{"id": "a", "name": "Energy", "symbols": ["RELIANCE", "ONGC"]}, {"id": "b", "name": "IT", "symbols": ["TCS"]}],
                    prefs={"sectorAlerts": ["state:sectors:oil-gas-consumable-fuels", "box:sectors:information-technology"]})
    await alert(app, uid, value=3000)
    await alert(app, uid, value=2000, status="paused")                       # a paused alert is not said
    async with app.state.store.pool.acquire() as c:
        await c.execute("""INSERT INTO company_classification (symbol, isin, macro_sector, sector, industry, basic_industry, rule_version)
                           VALUES ('RELIANCE', $1, 'Energy', 'Oil Gas & Consumable Fuels', 'Petroleum Products', 'Refineries & Marketing', 1)
                           ON CONFLICT (symbol) DO UPDATE SET sector = EXCLUDED.sector, macro_sector = EXCLUDED.macro_sector""", RIL_ISIN)
    f = (await rel_of(app, uid))["RELIANCE"]
    assert f["watchlists"] == ["Energy"] and len(f["alerts"]) == 1 and f["sectorAlerts"] == [{"kind": "state", "view": "sectors", "name": "Oil Gas & Consumable Fuels"}]
    assert mine.lines(f) == ["Watchlist 'Energy'. Alert: price above ₹3,000, active, not fired yet. Sector Pulse alert on Oil Gas & Consumable Fuels "
                             "(when its state changes)."]
    tags = mine.tags({"RELIANCE": f})
    assert [t["kind"] for t in tags] == ["watch", "alert"] and tags[0] == {"kind": "watch", "text": "On your watchlist", "tip": "Energy"}
    assert tags[1]["text"] == "Alert set" and tags[1]["tip"].startswith("price above ₹3,000, active, not fired yet")
    assert "RELIANCE" not in await rel_of(app, uid, ["INFY"]) and (await rel_of(app, uid, ["TCS"]))["TCS"] == {"watchlists": ["IT"]}


# ------------------------------------------------------------------------------------------------------------------ 5. the weight is the portfolio page's

@pg
async def test_the_weight_matches_the_equity_portfolio_pages_function(app):
    _, uid = await member(app, "hold-5@example.com")
    px = {"RELIANCE": 2950.0, "TCS": 3500.0, "INFY": 1500.0}
    await closes(app, px)
    await put_state(app, uid, [h("RELIANCE", 40, 2400, owned=True), h("TCS", 10, 3000, owned=True), h("INFY", 100, 1400, owned=True)])
    eq = (await rel_of(app, uid))["RELIANCE"]["equity"]
    w, basis = weights_of(["RELIANCE", "TCS", "INFY"], {"RELIANCE": 40 * 2950.0, "TCS": 10 * 3500.0, "INFY": 100 * 1500.0})
    assert basis == "value" and abs(eq["weight"] - w["RELIANCE"] * 100) < 1e-9 and eq["rank"] == 2 and eq["of"] == 3
    assert "38.9% of the Equity portfolio by value, the 2nd largest of 3" in mine.lines({"equity": eq})[0]
    await put_state(app, uid, [h("RELIANCE", 40, 2400, owned=True), h("TCS", 1, 0)])   # one share without a quantity: the page counts each the same
    eq = (await rel_of(app, uid))["RELIANCE"]["equity"]
    assert weights_of(["RELIANCE", "TCS"], {"RELIANCE": 40 * 2950.0})[1] == "equal" and "weight" not in eq and eq["basis"] == "equal"
    assert "no weight by value, as not every holding has a quantity and a price" in mine.lines({"equity": eq})[0]


# ------------------------------------------------------------------------------------------------------------------ 6. the whole answer

@pg
async def test_a_holder_gets_the_block_in_the_note_and_the_relation_event_before_the_words(app):
    m, uid = await member(app, "hold-6@example.com")
    await closes(app, {"RELIANCE": 2950})
    await put_state(app, uid, [h("RELIANCE", 40, 2400, owned=True)], lists=[{"id": "a", "name": "Energy", "symbols": ["RELIANCE"]}])
    await alert(app, uid)
    await clear_cache(app)
    client = FakeClient([{"text": ["You hold 40 shares of Reliance; at ₹2,950 they are worth ₹1,18,000."]}])
    enable(app, client)
    r, ev = await ask_q(m)
    assert r.status_code == 200 and ev[-1][0] == "done"
    names = [e for e, _ in ev]
    assert names[0] == "meta" and names[1] == "relation" and names.index("relation") < names.index("text")
    tags = dict(ev)["relation"]["tags"]
    assert [t["text"] for t in tags] == ["You hold this", "On your watchlist", "Alert set"]
    assert tags[0]["tip"] == "40 shares · 100.0% of your Equity portfolio by value (close 21 Nov 2026)"
    text = sent(client)
    assert "<member_relation company=\"RELIANCE\">\n- Equity portfolio: 40 shares; ₹1,18,000 at ₹2,950 (close 21 Nov 2026)" in text
    assert "</member_relation>\n" + mine.INSTRUCTION in text and text.endswith("how is reliance doing?")
    assert client.calls[0]["system"][0]["text"] == service.SYSTEM                 # never in the system prompt (the provider's cache)


# ------------------------------------------------------------------------------------------------------------------ 7. golden: no link, no change

def _plain(calls) -> str:
    return json.dumps(calls, default=lambda o: getattr(o, "__dict__", str(o)), sort_keys=True)


@pg
async def test_golden_no_link_means_the_same_request_and_the_same_cache_key(app, monkeypatch):
    redis = app.state.store.redis
    seen: List[str] = []
    await closes(app, {"TCS": 3500})

    async def run(email: str, off: bool = False, other: bool = False):
        await clear_cache(app)
        if off:                                                                       # the code before this PR: no lookup at all
            async def none(*a, **k):
                return None
            monkeypatch.setattr(ask_api, "relation_lookup", none)
        else:
            monkeypatch.undo()
        c = FakeClient([{"text": ["Reliance's figures ", "read as steady."]}])
        enable(app, c)
        m, uid = await member(app, email)
        if other:                                                                     # holdings, lists and alerts, all on another company
            await put_state(app, uid, [h("TCS", 10, 3000, owned=True)], lists=[{"id": "a", "name": "IT", "symbols": ["TCS"]}])
            await alert(app, uid, symbol="TCS")
        _, ev = await ask_q(m)
        seen.append(sorted(k.decode() if isinstance(k, bytes) else k for k in await redis.keys("ask:answer:*"))[0])
        return c, [e for e in ev if e[0] != "meta"]

    before, ev_before = await run("hold-g0@example.com", off=True)
    none_, ev_none = await run("hold-g1@example.com")
    other, ev_other = await run("hold-g2@example.com", other=True)
    assert _plain(before.calls) == _plain(none_.calls) == _plain(other.calls)
    assert ev_before == ev_none == ev_other and seen[0] == seen[1] == seen[2]
    assert "<member_relation" not in sent(other) and "relation" not in [e for e, _ in ev_other]


@pg
async def test_basic_members_are_refused_as_before_and_get_no_relation(app):
    m, uid = await member(app, "hold-basic@example.com", plan="basic")
    await put_state(app, uid, [h("RELIANCE", 40, 2400, owned=True)])
    enable(app, FakeClient([{"text": ["x"]}]))
    r, ev = await ask_q(m)
    assert r.status_code == 403 and ev == []
    assert await ask_api.relation_lookup(None, None, app.state.store, Ctx(user_id=uid, plan="basic"), ask_api.AskIn(question="reliance?"), "reliance?", None) is None


# ------------------------------------------------------------------------------------------------------------------ 8. the cache

@pg
async def test_the_cache_is_bypassed_only_with_a_relation_block(app):
    redis = app.state.store.redis
    holder, uid = await member(app, "hold-c1@example.com")
    plain, _ = await member(app, "hold-c2@example.com")
    await closes(app, {"RELIANCE": 2950})
    await put_state(app, uid, [h("RELIANCE", 40, 2400, owned=True)])
    key = ask_api.cache_key(app.state.settings.ask_model, Ctx(user_id="u", plan="gold"), ask_api.AskIn(question="how is reliance doing?", symbol="RELIANCE"))
    await clear_cache(app)
    await redis.set(key, json.dumps({"text": "CACHED ANSWER", "tools": [], "pages": []}), ex=600)
    client = FakeClient([{"text": ["Your own answer."]}])
    enable(app, client)
    _, ev = await ask_q(holder)
    assert "relation" in [e for e, _ in ev] and "CACHED ANSWER" not in json.dumps(ev) and len(client.calls) == 1   # not read
    assert json.loads(await redis.get(key))["text"] == "CACHED ANSWER"                                             # not written either
    _, ev2 = await ask_q(plain)                                                                                     # no link: the cache as before
    assert ("text", {"text": "CACHED ANSWER"}) in ev2 and len(client.calls) == 1
    rel_keys = [k.decode() if isinstance(k, bytes) else k for k in await redis.keys("ask:rel:*")]
    assert len(rel_keys) == 1 and rel_keys[0].startswith(f"ask:rel:{mine.VERSION}:{uid}:") and rel_keys[0].endswith(":RELIANCE")
    assert 0 < await redis.ttl(rel_keys[0]) <= mine.CACHE_SECONDS
    await clear_cache(app)
    enable(app, FakeClient([{"text": ["Written once."]}]))
    await ask_q(plain)
    assert json.loads(await redis.get(key))["text"] == "Written once."                                              # written as before


@pg
async def test_a_change_to_the_lists_is_read_at_once_despite_the_cache(app):
    _, uid = await member(app, "hold-c3@example.com")
    await put_state(app, uid, lists=[{"id": "a", "name": "Energy", "symbols": ["RELIANCE"]}])
    assert (await rel_of(app, uid))["RELIANCE"] == {"watchlists": ["Energy"]}
    await put_state(app, uid, lists=[{"id": "a", "name": "Oil", "symbols": ["RELIANCE"]}])                          # updated_at moves: a new key
    assert (await rel_of(app, uid))["RELIANCE"] == {"watchlists": ["Oil"]}


# ------------------------------------------------------------------------------------------------------------------ 9. the advice check

BANNED = ["You could add more shares at this level, or average down if it falls.",
          "Consider trimming the position, or booking profits after this run.",
          "With results due, it may be time to sell; this is a good time to add for the long run.",
          "You could rebalance your portfolio and reduce your exposure to energy.",
          "It is safe to hold, so keep holding and stay invested.",
          "You are overweight energy, so a smaller position would help; the list is too concentrated, so spread it out."]
ALLOWED = ["You hold 40 shares; at ₹2,950 they are worth ₹1,18,000.",
           "This is 12.4% of your Equity portfolio by value, the largest of your 9 holdings.",
           "Against the average buy price you entered (₹2,400), the price is 22.9% higher.",
           "Two of your funds also hold it: X at 4.1% (31 Oct disclosure).",
           "It is on your 'Energy' watchlist; your price alert at ₹3,000 has not fired.",
           "Since you last asked, results for Q2 FY27 were filed; profit was ₹X, Y% on a year earlier."]
MORE_BANNED = ["Consider exiting before the results.", "Increase your stake gradually.", "Consider reducing your exposure.", "You could buy more on dips.",
               "It's time to book profits.", "Continue holding it."]
MORE_ALLOWED = ["You can add shares in Workspace > Equity portfolio.", "The Nifty rebalance takes effect on 29 Nov 2026.", "Promoters increased their stake to 50.4%.",
                "The company plans to reduce its debt by FY2028.", "FinLit does not say whether you could add more.", "Its weight in the Nifty 50 is 9.8%."]


@pytest.mark.parametrize("text", BANNED + MORE_BANNED)
async def test_personal_advice_is_withdrawn(text):
    assert service.reads_like_advice(text)
    res, events = await collect(FakeClient([{"text": [text]}]), FakeGateway({}))
    assert res["stop"] == "withdrawn" and events[-1] == ("replace", {"text": service.WITHDRAWN})


@pytest.mark.parametrize("text", ALLOWED + MORE_ALLOWED)
async def test_describing_the_position_is_not_advice(text):
    assert not service.reads_like_advice(text)
    res, _ = await collect(FakeClient([{"text": [text]}]), FakeGateway({}))
    assert res["stop"] == "end_turn" and res["text"] == text


# ------------------------------------------------------------------------------------------------------------------ 10. member A never sees member B's

@pg
async def test_member_a_never_sees_member_bs_holdings_funds_etfs_lists_or_alerts(app):
    a, ua = await member(app, "hold-a@example.com")
    _, ub = await member(app, "hold-b@example.com")
    await isins(app)
    await closes(app, {"RELIANCE": 2950, "TCS": 3500})
    await fund(app, code=880011, name="B's Fund", isin="INF000B01011", family="fam:b-fund", nav=10.0, pct=5.0)
    await put_state(app, ub, [h("RELIANCE", 99, 1000, owned=True)], lists=[{"id": "x", "name": "B secret list", "symbols": ["RELIANCE"]}])
    await hold_fund(app, ub, 880011, units=500)
    await etf(app, ub, symbol="BETF", isin="INF000C01011", family="fam:b-etf", qty=10, price=100.0, pct=8.0)
    await alert(app, ub, value=1234)
    await put_state(app, ua, [h("TCS", 5, 3000, owned=True)])
    assert set((await rel_of(app, ub)).get("RELIANCE", {})) == {"equity", "funds", "etfs", "watchlists", "alerts"}
    assert await rel_of(app, ua) == {}                                                           # A holds nothing of RELIANCE
    assert (await rel_of(app, ua, ["TCS"]))["TCS"]["equity"]["qty"] == 5                          # and sees only their own TCS
    await clear_cache(app)
    client = FakeClient([{"text": ["Reliance reads as steady."]}])
    enable(app, client)
    _, ev = await ask_q(a)
    blob = json.dumps(ev, ensure_ascii=False) + sent(client)
    assert "relation" not in [e for e, _ in ev] and "<member_relation" not in sent(client)
    for secret in ("B secret list", "B's Fund", "BETF", "99 shares", "1,234"):
        assert secret not in blob
