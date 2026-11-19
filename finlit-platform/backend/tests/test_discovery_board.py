"""Task #251 (the 19 Nov Discover pack): GET /api/discovery/board, the Discover page's one read, and the display rules it applies (finlit/discovery/board.py):
Renewable Power shown inside Renewable Energy & Power, the two broad groups flagged (the page puts them last), filing titles cleaned."""

from datetime import timedelta

import httpx

from finlit.discovery import board as B
from finlit.discovery import keywords as K
from finlit.discovery import service as D
from test_discovery import TODAY, exchange, seed
from test_integration import make_settings, store  # noqa: F401  (fixture)


def test_filing_titles_lose_the_exchange_boilerplate_and_a_cut_title_ends_with_an_ellipsis():
    assert B.clean_title('a press release dated November 12, 2026, titled "LTM Brings AI-Powered Quantum Error Mitigat') == "LTM Brings AI-Powered Quantum Error Mitigat…"
    assert B.clean_title("1. To consider and approve the raising of funds") == "To consider and approve the raising of funds"
    assert B.clean_title("HCLTech and Cohere partner to build and deliver sovereign AI '.") == "HCLTech and Cohere partner to build and deliver sovereign AI"
    assert B.clean_title("- order received worth Rs 120 crore") == "Order received worth Rs 120 crore"
    assert B.clean_title("Short and complete.") == "Short and complete."
    assert B.clean_title(None) == ""


def test_renewable_power_is_shown_inside_renewable_energy_and_the_broad_groups_are_named():
    assert B.theme_of("Renewable Power") == "Renewable Energy & Power" and B.theme_of("AI & GenAI") == "AI & GenAI"
    assert set(B.BROAD) == {"Corporate Catalysts & Growth Signals", "Industrial Manufacturing & Capex"} and set(B.BROAD) <= set(K.BUCKETS)
    assert B.DISPLAY["Industrial Manufacturing & Capex"] == "Industrial manufacturing & capex"
    assert "legal" in B.EVENTS and B.EVENTS[:4] == ("order", "capacity", "partnership", "mna")


async def test_the_board_lists_every_placed_company_once_with_its_theme_as_shown_and_counts_that_add_up(store):  # noqa: F811
    from finlit.api import create_app
    await seed(store)
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM company_classification WHERE symbol = ANY($1::text[])", ["BSHIELD", "ACMESOLAR"])
        await conn.execute("INSERT INTO company_classification (symbol, macro_sector, sector, industry, rule_version) VALUES "
                           "('BSHIELD', 'Industrials', 'Capital Goods', 'Aerospace & Defense', 1), ('ACMESOLAR', 'Power', 'Power', 'Power', 1)")
        for i, (cat, title, d) in enumerate([("Bagging/Receiving of orders/contracts", "Bharat Shield has received orders worth Rs 400 crore for radar systems", 1),
                                             ("Credit Rating", "CARE downgraded the long-term rating to A-", 3)]):
            await conn.execute("INSERT INTO feed_items (kind, title, symbol, company, link, item_date, category, auto, dedupe) VALUES "
                               "('news', $1, 'BSHIELD', 'Bharat Shield Ltd', 'https://nsearchives.nseindia.com/x.pdf', $2, $3, true, $4)",
                               title, TODAY - timedelta(days=d), cat, f"n{i}")
    await D.run(store, fetcher=exchange())
    async with store.pool.acquire() as conn:     # a company the job placed under Renewable Power is shown under Renewable Energy & Power
        await conn.execute("UPDATE discovery_companies SET primary_bucket = 'Renewable Power', secondary = '{\"Renewable Energy & Power\"}' WHERE symbol = 'ACMESOLAR'")
    app = create_app(make_settings(), store=store)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get("/api/discovery/board")
            assert r.status_code == 200 and r.headers["cache-control"] == "public, max-age=600"
            d = r.json()
    assert d["companies"] == len(d["rows"]) == 2 and d["days"] == 90 and "not proof" in d["caution"]
    rows = {x["s"]: x for x in d["rows"]}
    acme, shield = rows["ACMESOLAR"], rows["BSHIELD"]
    assert acme["th"] == "Renewable Energy & Power" and acme["sec"] == []          # merged, and not listed again as its own other theme
    assert shield["th"] == "Defence & Aerospace" and shield["mac"] == "Industrials" and shield["ind"] == "Aerospace & Defense"
    assert shield["ev"] == {"order": 1, "rating": 1} and shield["fc"] >= 2 and shield["st"] in ("Operating", "Under execution")
    assert shield["lf"]["el"] == "Order win" and shield["lf"]["t"].startswith("Bharat Shield has received orders")
    names = [t["name"] for t in d["themes"]]
    assert "Renewable Power" not in names and len(names) == len(K.BUCKETS) - 1
    ren = next(t for t in d["themes"] if t["name"] == "Renewable Energy & Power")
    assert ren["n"] == 1 and ren["merged"] == ["Renewable Power"]
    assert sum(t["n"] for t in d["themes"]) == d["companies"]                       # every company counted once, under its theme as shown
    broad = [t for t in d["themes"] if t["broad"]]
    assert {t["label"] for t in broad} == {"Corporate developments", "Industrial manufacturing & capex"}
    assert d["efil"]["order"][0]["s"] == "BSHIELD" and d["tfil"].get("Defence & Aerospace")
    assert set(d["eventsTracked"]) == set(B.EVENTS)                                # every event card of the pack is a filing type signals.py sorts
