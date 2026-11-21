"""Task #283 PR C (21 Nov 2026): FinLit IQ is retired and FinLit Prism is FinLit's only company score, so the server stops sending the IQ.

No browser-facing answer (the screener universe, the company summary, ratios and peers, the search quotes, the watchlist state, the Equity portfolio,
the browser extension's card and the MCP server) carries the retired score's fields (`overall`, `pillar_*`, `score_change`) or the words "FinLit IQ",
for any plan; its two own routes (score history, the ranked list) answer 410; the assistant's tools no longer offer or return it; and the
administrators' data-health panel counts the listed companies that have the retired score but no FinLit Prism score. The IQ job keeps writing the
`scores` table (hidden, for a rollback): only serving stops."""
import json
import re
import time

import pytest

from finlit.auth import crypto
from finlit.auth.entitlements import RETIRED_ROW_FIELDS, redact_universe, strip_retired_score
from test_auth import app, make_admin, new_client, signed_in  # noqa: F401  (fixtures + helpers)
from test_integration import ingested, make_settings, store  # noqa: F401

IQ_KEY = re.compile(r'"(overall|pillar_quality|pillar_growth|pillar_profitability|pillar_balance|pillar_technical|score_change|finlitIQ|iqInputs)"\s*:')
IQ_WORDS = re.compile(r"finlit\s*iq", re.I)


def assert_no_iq(text: str, where: str) -> None:
    assert not IQ_KEY.search(text), (where, IQ_KEY.search(text))
    assert not IQ_WORDS.search(text), (where, IQ_WORDS.search(text))


# ------------------------------------------------------------------------------------------------ unit: the strip helpers
def test_a_universe_row_loses_the_retired_fields_for_every_plan_and_prism_stays_with_gold():
    row = {"symbol": "ABC", "overall": 72, "band": "healthy", "pillar_quality": 70, "pillar_growth": 60, "pillar_profitability": 65, "pillar_balance": 50,
           "pillar_technical": 40, "score_change": 3, "strengths_count": 2, "watchouts_count": 1, "pe": 20.0, "prism_final": 81.0}
    for plan in ("basic", "silver", "gold"):
        out = redact_universe([dict(row)], plan, set())[0]
        assert not set(RETIRED_ROW_FIELDS) & set(out), plan
        assert out["pe"] == 20.0
        assert out["prism_final"] == (81.0 if plan == "gold" else None)


def test_the_stored_sections_lose_the_retired_score_and_keep_the_rest():
    s = strip_retired_score("summary", {"meta": {"scoreModel": "v1", "symbol": "ABC"}, "score": {"overall": 70, "pillars": []}, "thesis": "A sound business.",
                                        "iqInputs": {}, "strengths": [{"key": "a"}], "keyMetrics": []})
    assert set(s) == {"meta", "strengths", "keyMetrics"} and s["meta"] == {"symbol": "ABC"}
    r = strip_retired_score("ratios", {"meta": {}, "score": {"pillars": []}, "latest": {"pe": {}}})
    assert "score" not in r and r["latest"] == {"pe": {}}
    p = strip_retired_score("peers", {"meta": {}, "symbols": ["A"], "items": [{"symbol": "A", "overall": 60, "band": "mixed", "pe": 9.0}]})
    assert p["items"] == [{"symbol": "A", "pe": 9.0}]


# ------------------------------------------------------------------------------------------------ integration: every browser-facing answer
async def _clients(app):  # noqa: F811
    admin = await make_admin(app, "iq283a@example.com")
    return {"visitor": new_client(app), "basic": await signed_in(app, "iq283b@example.com", plan="basic"),
            "silver": await signed_in(app, "iq283s@example.com", plan="silver"), "gold": await signed_in(app, "iq283g@example.com", plan="gold"), "admin": admin}


@pytest.mark.integration
async def test_no_browser_facing_answer_carries_the_retired_score_for_any_plan(app):  # noqa: F811
    clients = await _clients(app)
    for showcase in (["RELIANCE"], ["SOMETHINGELSE"]):          # the free showcase company (fully open) and a company trimmed to the plan
        app.state.settings.showcase_symbols[:] = showcase
        await app.state.store.redis.delete("universe:basic", "universe:silver", "universe:gold", "search-quotes:basic", "search-quotes:silver")
        for who, c in clients.items():
            u = await c.get("/api/screener/universe")
            assert u.status_code == 200
            rows = u.json()["rows"]
            assert rows and all(not set(RETIRED_ROW_FIELDS) & set(r) for r in rows), who
            assert_no_iq(u.text, f"universe as {who}")
            s = await c.get("/api/stocks/RELIANCE")
            assert s.status_code == 200 and s.json()["profile"]["name"]
            assert not {"score", "thesis", "iqInputs"} & set(s.json()), who
            assert_no_iq(s.text, f"summary as {who}")
            for section in ("ratios", "peers"):
                r = await c.get(f"/api/stocks/RELIANCE/{section}")
                if r.status_code == 200:
                    assert "score" not in r.json() or section == "peers", (who, section)
                    assert_no_iq(r.text, f"{section} as {who}")
            q = await c.get("/api/search/quotes")
            assert q.status_code == 200 and q.json()["rows"]
            assert all(row[4] is None and row[5] is None for row in q.json()["rows"]), who        # the score and band positions held the IQ
            assert_no_iq(q.text, f"search quotes as {who}")
            for path in ("/api/stocks/RELIANCE/score-history", "/api/screener/top"):
                gone = await c.get(path)
                assert gone.status_code == 410 and gone.json()["status"] == "retired", (who, path)
                assert_no_iq(gone.text, path)
            e = await c.get("/api/ext/company/RELIANCE")
            assert e.status_code == 200
            assert not {"score", "band", "fundamental", "technical", "take"} & set(e.json()), who
            assert e.json()["model"] in ("prism", None)
            assert_no_iq(e.text, f"extension card as {who}")
            if who != "visitor":
                st = await c.get("/api/me/state")
                assert st.status_code == 200
                assert_no_iq(st.text, f"watchlist state as {who}")
            if who in ("silver", "gold", "admin"):
                pf = await c.post("/api/portfolio/overview", json={"symbols": ["RELIANCE"]})
                assert pf.status_code == 200
                h = pf.json()["holdings"][0]
                assert "finlit" not in h and ("prism" in h) == (who != "silver"), who
                assert_no_iq(pf.text, f"portfolio overview as {who}")
    for c in clients.values():
        await c.aclose()


@pytest.mark.integration
async def test_the_mcp_score_tool_returns_finlit_prism_or_says_it_needs_a_plan(app):  # noqa: F811
    from test_mcp import ok
    app.state.settings.showcase_symbols[:] = ["SOMETHINGELSE"]
    async with new_client(app) as c:
        res = await ok(c, "get_finlit_score", {"symbol": "RELIANCE"})
        text = json.dumps(res)
        assert res["data"]["locked"] is True and res["data"]["score"] is None and "FinLit Prism" in res["data"]["message"]
        assert_no_iq(text, "mcp get_finlit_score")
        listing = (await c.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})).text
        assert_no_iq(listing, "mcp tools/list")


@pytest.mark.integration
async def test_the_admin_data_health_counts_companies_with_the_retired_score_but_no_prism(app):  # noqa: F811
    silver = await signed_in(app, "iq283h@example.com", plan="silver")
    assert (await silver.get("/api/admin/data-health")).status_code == 403          # never public
    admin = await make_admin(app, "iq283adm@example.com")
    secret = (await admin.post("/api/me/mfa/setup")).json()["secret"]
    await admin.post("/api/me/mfa/enable", json={"code": crypto.totp_code(secret, int(time.time()) // 30)})
    async with app.state.store.pool.acquire() as conn:
        listed = await conn.fetchval("SELECT count(*) FROM companies")
        retired = await conn.fetchval("SELECT count(DISTINCT c.symbol) FROM companies c JOIN scores s ON s.symbol = c.symbol AND s.model = 'v1' AND s.overall IS NOT NULL")
        prism = await conn.fetchval("SELECT count(DISTINCT c.symbol) FROM companies c JOIN prism_reports p ON p.symbol = c.symbol AND p.final IS NOT NULL AND p.status <> 'NOT RATED'")
        gap = await conn.fetchval("SELECT count(DISTINCT c.symbol) FROM companies c JOIN scores s ON s.symbol = c.symbol AND s.model = 'v1' AND s.overall IS NOT NULL "
                                  "WHERE NOT EXISTS (SELECT 1 FROM prism_reports p WHERE p.symbol = c.symbol AND p.final IS NOT NULL AND p.status <> 'NOT RATED')")
    g = (await admin.get("/api/admin/data-health")).json()["prismGap"]
    assert g == {"listed": listed, "retiredScored": retired, "prismScored": prism, "retiredNoPrism": gap}
    assert retired >= 1 and g["retiredNoPrism"] <= g["retiredScored"]
    for c in (silver, admin):
        await c.aclose()


# ------------------------------------------------------------------------------------------------ the assistant
def test_the_assistant_no_longer_offers_or_describes_the_retired_score():
    from finlit.ask import pages as P, service, tools as T
    defs = T.definitions()
    text = json.dumps(defs)
    assert_no_iq(text, "assistant tool definitions")
    assert '"iq"' not in text and "iq_history" not in text and "score-screener" not in text and "Basic stock screener" not in text
    sbs = next(d for d in defs if d["name"] == "screen_by_finlit_score")
    assert "score" not in sbs["input_schema"]["properties"]                     # FinLit Prism only: there is no score to choose
    assert "iq_history" not in T.SECTIONS
    assert "FinLit IQ has been retired and FinLit Prism is FinLit's only company score" in service.SYSTEM
    assert "finlitIQ" not in service.SYSTEM and "Basic stock screener" not in service.SYSTEM and "/score-screener" not in service.SYSTEM
    assert all(x["to"] != "/score-screener" for x in P.page_links([("screen_by_finlit_score", {}), ("screen_by_finlit_score", {"score": "iq"})]))
    assert T.DOING["get_finlit_score"] == "Reading FinLit Prism"


async def test_the_assistant_tools_return_prism_and_never_the_retired_score():
    from finlit.ask import tools as T
    from finlit.mcp.gateway import ToolError

    class Gw:
        def __init__(self, answers):
            self.answers = answers

        async def json(self, path, params=None, *, method="GET", body=None, subject="That"):
            a = self.answers.get(path)
            if isinstance(a, Exception):
                raise a
            if a is None:
                raise ToolError(f"{subject} was not found in FinLit's data.")
            return a

    summary = {"meta": {"generatedAt": "2026-11-20T10:00:00Z", "statement": "consolidated"}, "profile": {"name": "Abc Ltd"}, "quote": {"price": 10},
               "keyMetrics": [], "returns": [], "strengths": [], "watchouts": []}
    prism = {"summary": {"final": 72.5, "label": "Healthy", "status": "RATED", "parts": {"quality": 70}, "generatedAt": "2026-11-20T10:00:00Z"}}
    gw = Gw({"/api/stocks/ABC": summary, "/api/prism/reports/latest": prism})
    card = await T.run(gw, "get_company_card", {"symbol": "ABC"})
    assert not card["error"]
    data = json.loads(card["text"])["data"]
    assert "finlitIQ" not in data and "thesis" not in data and data["finlitPrism"]["score"] == 72.5
    assert_no_iq(card["text"], "get_company_card")
    sc = await T.run(gw, "get_finlit_score", {"symbol": "ABC"})
    got = json.loads(sc["text"])["data"]
    assert not sc["error"] and got["locked"] is False and got["score"]["name"] == "FinLit Prism" and got["score"]["final"] == 72.5
    assert_no_iq(sc["text"], "get_finlit_score")
    locked = Gw({"/api/prism/reports/latest": ToolError("FinLit Prism is part of the Gold plan. It is not available through this free server.")})
    sc = await T.run(locked, "get_finlit_score", {"symbol": "ABC"})
    got = json.loads(sc["text"])["data"]
    assert not sc["error"] and got["locked"] is True and got["score"] is None and "plan with FinLit Prism" in got["message"]
    u = {"rows": [{"symbol": "A", "name": "A", "overall": 90, "prism_final": 70.0, "prism_label": "Healthy", "market_cap": 5}], "as_of": None}
    r = await T.run(Gw({"/api/screener/universe": u}), "screen_by_finlit_score", {})
    assert not r["error"] and json.loads(r["text"])["data"]["rows"][0]["prism_final"] == 70.0
    assert_no_iq(r["text"], "screen_by_finlit_score")
    old = await T.run(Gw({"/api/screener/universe": u}), "screen_by_finlit_score", {"score": "iq"})
    assert old["error"]                                                          # the retired choice is refused, never answered with the IQ
