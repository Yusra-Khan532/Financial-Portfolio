"""Task #273 (the team's Discover fixes, 20 Nov 2026): the data the portfolio pages, the company report, Watchlists and Alerts now read from Discover.

1. Tax, customs and appeal orders are Legal and regulatory, never Capacity or an Order win (Nestle India, Lenskart, Protean eGov); a results filing
   stays Results (FSN E-Commerce was under Acquisitions).
2. A bank, finance company, broker or insurer has a technology theme only as a mention, unless its sentences show revenue, orders or a product.
3. No passage is a cover letter, a signature block or a biography (Apollo Micro Systems).
4. One label per theme, from one place, in every API.
5. Split and glued words are mended ("rolled out to12,500+", "operat ional").
6. The company's filings carry the latest of each kind, not only the newest 12 (Welspun Corp's 3 order wins had a count and no subject)."""

from datetime import timedelta

import httpx

from finlit.discovery import board as B
from finlit.discovery import keywords as K
from finlit.discovery import quotes as Q
from finlit.discovery import service as D
from finlit.discovery import signals as S
from test_discovery import TODAY, exchange, seed
from test_integration import make_settings, store  # noqa: F401  (fixture)

ORDERS = "Bagging/Receiving of orders/contracts"


# ------------------------------------------------------------------------------------------------ 1. the filing sorter
def test_tax_customs_and_appeal_orders_are_legal_never_capacity_or_an_order_win():
    found = [  # the team's examples, found on 20 Nov
        ("Updates", "Nestle India Limited has informed the Exchange about Intimation regarding receipt of an Order from the Office of the Principal "
                    "Commissioner of Central Goods and Services Tax (VAT order)"),
        (ORDERS, "Lenskart Solutions Limited has informed the Exchange about Receipt of order from the Office of the Principal Commissioner of Customs"),
        ("Updates", "Protean eGov Technologies Limited has informed the Exchange about Receipt of Order-In-Appeal from the Office of the Commissioner of Central Tax"),
        ("Updates", "Order passed by the Income Tax Appellate Tribunal (ITAT)"),
        ("Updates", "Receipt of a show cause notice and demand order from the GST department"),
        (ORDERS, "Penalty imposed by the Customs, Excise and Service Tax Appellate Tribunal (CESTAT)"),
    ]
    for cat, title in found:
        t = S.tag(cat, title)
        assert t["event"] == "legal" and t["tone"] == -1, title
        assert t["event"] not in ("order", "capacity")                    # an order-win alert never fires on these


def test_real_order_wins_capacity_and_results_keep_their_kind():
    assert S.tag(ORDERS, "Company bags order worth Rs 120 crore (excluding GST) from NHAI")["event"] == "order"
    assert S.tag(ORDERS, "Receipt of Letter of Award worth Rs 45 crore inclusive of GST")["event"] == "order"
    assert S.tag("Press Release", "Strong demand drives record order inflow; company bags order worth Rs 300 crore")["event"] == "order"
    assert S.tag("Updates", "Commissioning of 50 MW solar plant at Bikaner")["event"] == "capacity"
    assert S.tag("Updates", "Commissioned the new unit; commercial production started")["event"] == "capacity"
    # FSN E-Commerce's results filing was under Acquisitions ("customer acquisition"); NSE's results category wins, and "profit after tax" is not a tax order
    assert S.tag("Financial Result Updates", "FSN E-Commerce Ventures Limited has informed the Exchange about financial results: customer acquisition up, "
                 "profit after tax Rs 30 crore")["event"] == "results"
    assert S.TAG_VERSION == "3"                                           # every stored filing is sorted again once with the new rule


# ------------------------------------------------------------------------------------------------ 2. lenders and technology themes
SCORES = {"AI & GenAI": {"score": 9.0, "terms": {"Artificial intelligence": 5}}, "Financial Services & Trading": {"score": 4.0, "terms": {"Brokerage": 3}},
          "Corporate Catalysts & Growth Signals": {"score": 6.0, "terms": {"Joint venture": 2}}}
OPS = ["We use artificial intelligence to speed up loan approvals and collections across our 1,900 branches.",
       "GenAI tools help our relationship managers answer customer queries faster."]


def test_a_lenders_ai_theme_is_only_a_mention_without_business_sentences():
    for ind in ("Banks", "Finance", "Capital Markets", "Insurance"):
        main, also, moved = K.seat("AI & GenAI", ["Corporate Catalysts & Growth Signals"], SCORES, OPS, ind)
        assert (main, moved) == ("Financial Services & Trading", True), ind      # the strongest non-technology business theme
        assert "AI & GenAI" in also and main not in also                          # the technology theme stays, as a mention
    # no other theme it qualified for: not placed (the mention stays)
    assert K.seat("Cloud & Data Centres", [], {"Cloud & Data Centres": {"score": 5}}, OPS, "Banks")[0] is None
    # only a catalysts theme left: that one, as classify() does when nothing else qualifies
    assert K.seat("AI & GenAI", [], {"AI & GenAI": {"score": 9}, "Corporate Catalysts & Growth Signals": {"score": 2}}, OPS, "Finance")[0] == \
        "Corporate Catalysts & Growth Signals"


def test_a_lender_keeps_the_ai_theme_when_its_sentences_show_revenue_orders_or_a_product_and_others_never_change():
    sold = OPS + ["Our AI underwriting platform is sold to 40 banks and earns subscription revenue of Rs 120 crore a year."]
    assert K.seat("AI & GenAI", [], SCORES, sold, "Capital Markets") == ("AI & GenAI", [], False)
    assert K.seat("AI & GenAI", ["Corporate Catalysts & Growth Signals"], SCORES, OPS, "IT - Software") == ("AI & GenAI", ["Corporate Catalysts & Growth Signals"], False)
    assert K.seat("Defence & Aerospace", [], SCORES, OPS, "Banks")[2] is False      # only technology themes move
    assert K.seat(None, [], SCORES, OPS, "Banks") == (None, [], False)


def test_a_kpi_slides_revenue_far_from_the_theme_does_not_keep_a_lender_on_ai():
    """Live check after the first deploy (20 Nov): 5paisa, Aditya Birla Capital, Bajaj Finserv, CAMS, Kotak Mahindra Bank and Medi Assist stayed on
    AI & GenAI because a KPI cell on the same slide said "Revenue". The business word must sit in the same sentence or cell as the theme's word."""
    kpi = ["Market Cap Data ₹23,326 Cr GWP | FY2026 ₹1,121 Cr REVENUE | FY2026 ₹150 Cr INVESTED CAPITAL | Enterprise AI Consumer AI AI Governance Agentic AI",
           "Q1 FY27 Customer base 53.4 Lakh FINANCIALS Revenue ₹865 Mn Broking income ₹349 Mn. Our new app is AI driven with pro level tools.",
           "₹191 Cr revenue, ₹42 Cr EBITDA; AI tools live for Paramount clients",
           "Strengthens wallet share and accelerates cross-engine monetisation • Pillar 3: Technology, Digital & AI"]
    assert K.seat("AI & GenAI", [], SCORES, kpi, "Banks")[2] is True
    for t in ("GenAI products for enterprises contributed 18% of revenue in Q2.", "We won orders worth Rs 300 crore for AI data centre build-outs."):
        assert K.seat("AI & GenAI", [], SCORES, [t], "Capital Markets")[2] is False, t
    assert K.seat("Cloud & Data Centres", [], {"Cloud & Data Centres": {"score": 5}, "Financial Services & Trading": {"score": 2}},
                  ["Colocation data centre revenue grew 30% to Rs 400 crore."], "Finance")[2] is False


# ------------------------------------------------------------------------------------------------ 3 and 5. passages
APOLLO_BIO = ("Baddam Karunakar Reddy (Managing Director) He founded Apollo Micro Systems in 1985 and has been instrumental in driving innovation in "
              "defence electronics.")
APOLLO_SIGN = ("Yours sincerely, For Apollo Micro Systems Limited Seshadri Vasan Gollur Company Secretary & Compliance Officer M.No.F11842 APOLLO MICRO "
               "SYSTEMS LTD We Commit, We Deliver EARNINGS PRESENTATION – Q2 & H1 FY27")
APOLLO_BIZ = ("End-to-End Capabilities 1 Explosives 2 Critical Sub-systems / Systems 3 Platforms 4 Weapons 5 Weapon Integration Diversified Portfolio "
              "Missiles Drones Rockets Underwater Weapons")


def test_no_passage_is_a_signature_block_or_a_biography():
    assert Q.clean_q(APOLLO_BIO) is None and Q.clean_q(APOLLO_SIGN) is None
    assert Q.clean_q(APOLLO_BIZ) is not None
    for t in ("He has over 30 years of experience in the defence sector and holds a degree in engineering from IIT Madras.",
              "Dear Sir/Madam, Sub: Investor presentation. Kindly take the same on record. Thanking you, Yours faithfully, Company Secretary"):
        assert Q.clean_q(t) is None, t
    # a management quote about the business stays
    assert Q.clean_q("Mr. Rajesh Kumar, Chairman, said: “We won radar orders worth Rs 500 crore and commissioned the new plant this quarter.”")
    # a deck's legal disclaimer (Welspun Corp's second passage, live check)
    assert Q.clean_q("Reproduction, distribution, republication and retransmission of material contained herein is prohibited without prior written consent of the company.") is None
    assert Q.clean_q("This presentation has been prepared for information purposes only and does not constitute an offer to buy or sell any securities.") is None
    out = Q.passages([APOLLO_BIO, APOLLO_BIZ, APOLLO_SIGN], ["Missile system"])
    assert [p["t"][:22] for p in out] == ["End-to-End Capabilitie"]


def test_split_and_glued_words_are_mended_where_the_text_is_extracted():
    assert Q.mend("The platform was rolled out to12,500+ branches and is fully operat ional across 1,200locations.") == \
        "The platform was rolled out to 12,500+ branches and is fully operational across 1,200 locations."
    assert Q.mend("communic ation and manage ment in FY27, Q2, the 3rd plant, 5x, 10mn, 2GW") == "communication and management in FY27, Q2, the 3rd plant, 5x, 10mn, 2GW"
    c = Q.clean_q("The upgraded app was rolled out to12,500+ branches across India and is now fully operat ional for all of our customers.")
    assert c and "to 12,500+" in c["t"] and "operational" in c["t"]


# ------------------------------------------------------------------------------------------------ 4. one label
def test_one_label_and_slug_per_theme_from_one_place():
    assert B.label_of("Corporate Catalysts & Growth Signals") == "Corporate developments"
    assert B.label_of("Renewable Power") == "Renewable Energy & Power" and B.label_of("AI & GenAI") == "AI & GenAI"
    assert B.theme_slug("Corporate Catalysts & Growth Signals") == "corporate-catalysts-and-growth-signals"     # the links other pages use keep working
    assert B.theme_slug("AI & GenAI") == "ai-and-genai" and B.theme_slug("EV & Automotive Technology") == "ev-and-automotive-technology"


# ------------------------------------------------------------------------------------------------ the routes, end to end
async def test_board_company_and_overview_agree_on_a_lenders_theme_label_and_every_kind_of_filing(store):  # noqa: F811
    from finlit.api import create_app
    await seed(store)
    await D.run(store, fetcher=exchange())
    async with store.pool.acquire() as conn:
        # a bank whose deck names AI for its own operations (copied from BSHIELD's stored row, then changed)
        await conn.execute(
            "INSERT INTO discovery_companies (symbol, company, doc_title, doc_date, doc_link, status, primary_bucket, secondary, scores, evidence, pages, stage, "
            "tone, tone_label, rules, read_at) SELECT 'LENDER', 'Lender Bank Ltd', doc_title, doc_date, 'https://nsearchives.nseindia.com/corporate/LENDER.pdf', "
            "status, 'AI & GenAI', ARRAY['Corporate Catalysts & Growth Signals'], $1::jsonb, $2::jsonb, pages, stage, tone, tone_label, rules, read_at "
            "FROM discovery_companies WHERE symbol = 'BSHIELD'",
            __import__("json").dumps(SCORES), __import__("json").dumps(OPS))
        await conn.execute("DELETE FROM company_classification WHERE symbol IN ('LENDER', 'BSHIELD')")
        await conn.execute("INSERT INTO company_classification (symbol, macro_sector, sector, industry, rule_version) VALUES "
                           "('LENDER', 'Financial Services', 'Financial Services', 'Banks', 1), ('BSHIELD', 'Industrials', 'Capital Goods', 'Aerospace & Defense', 1)")
        # Bharat Shield: 13 newer management filings, then an older order win and a tax order (fix 6 and fix 1)
        await conn.execute("DELETE FROM discovery_signals")
        await conn.execute("INSERT INTO discovery_signals (feed_id, symbol, item_date, event, title, link) SELECT 500 + g, 'BSHIELD', current_date - g, "
                           "'management', 'Change in key managerial personnel ' || g, NULL FROM generate_series(1, 13) g")
        await conn.execute("INSERT INTO discovery_signals (feed_id, symbol, item_date, event, title, link) VALUES "
                           "(900, 'BSHIELD', current_date - 40, 'order', 'Order worth Rs 90 crore for radar systems', 'https://nsearchives.nseindia.com/corporate/o.pdf')")
    app = create_app(make_settings(), store=store)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            b = (await c.get("/api/discovery/board")).json()
            lender = (await c.get("/api/discovery/company?symbol=LENDER")).json()
            shield = (await c.get("/api/discovery/company?symbol=BSHIELD")).json()
            ov = (await c.get("/api/discovery?symbol=LENDER")).json()
    row = next(r for r in b["rows"] if r["s"] == "LENDER")
    assert row["th"] == "Financial Services & Trading" and "AI & GenAI" in row["sec"]                 # the board
    ai = next(t for t in b["themes"] if t["name"] == "AI & GenAI")
    assert ai["also"] >= 1 and all(r["th"] != "AI & GenAI" for r in b["rows"] if r["ind"] in K.FIN_INDUSTRIES)
    assert lender["theme"] == "Financial Services & Trading" and lender["themeLabel"] == "Financial Services & Trading"   # the company panel
    assert not any("loan approvals" in p["t"] for p in lender["passages"])                            # AI sentences are not shown as its main theme's
    assert [t["name"] for t in ov["themes"] if any(x["symbol"] == "LENDER" for x in t.get("companies") or [])] == ["Financial Services & Trading"]
    cc = next(t for t in b["themes"] if t["name"] == "Corporate Catalysts & Growth Signals")
    assert cc["label"] == "Corporate developments" and cc["slug"] == "corporate-catalysts-and-growth-signals"
    assert all("label" in t for t in ov["themes"])
    # fix 6: the newest 12, plus the latest of every other kind
    assert len(shield["filings"]) == 13 and [f["e"] for f in shield["filings"]][:12] == ["management"] * 12
    assert shield["filings"][12]["e"] == "order" and shield["filings"][12]["t"].startswith("Order worth Rs 90 crore")
    assert shield["themeSlug"] == "defence-and-aerospace"
