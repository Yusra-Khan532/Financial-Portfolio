"""Discovery (task #221): the founder's keyword buckets and scoring (keywords.py), the nightly read of each company's newest investor presentation
(service.py, real Postgres and Redis, the exchange faked with httpx.MockTransport and real PDFs), the page's route, the job, FinLit AI's tool, and
the shared fetcher's fix (NSE's nseindia.in links, NSE's archive dropping a non-browser agent, the relay when the connection is dropped)."""

import json
from datetime import date, timedelta

import httpx
import pytest

from earnings_fakes import make_pdf
from finlit.discovery import keywords as K
from finlit.discovery import service as D
from finlit.earnings import transcripts as T
from test_integration import make_settings, store  # noqa: F401  (fixture)


async def nosleep(_):
    return None


# ------------------------------------------------------------------------------------------------ the founder's rules (keywords.py)
def test_the_21_buckets_of_the_notes_are_all_there():
    assert len(K.BUCKETS) == 21 and sum(map(len, K.BUCKETS.values())) == 254
    assert {"AI & GenAI", "Defence & Aerospace", "Solar Technology", "Nuclear Energy", "Space & Drone Technology"} <= set(K.BUCKETS)


def test_short_acronyms_match_in_capitals_only_and_whole_words_only():
    s = K.analyse("The campaign was a success. Cam ess ems. Our EMS and PCB lines; PCBA, OLED.", min_distinct=1, min_total=1)
    terms = s["Mobile & Electronics Manufacturing"]["terms"]
    # the PDF's concepts: EMS, PCB, PCBA and OLED each counted once, under the directory's keyword; not 'campaign', 'Cam', 'ess', 'ems'; PCB not in PCBA
    assert terms == {"Electronics manufacturing services": 1, "Printed circuit board": 1, "PCB assembly": 1, "Display modules": 1}
    assert "Electrodes & Advanced Materials" not in s and "Battery & Energy Storage" not in s
    long_term = K.analyse("generative ai and GENERATIVE AI and GenAI and AI tools", min_distinct=1, min_total=1)
    assert long_term["AI & GenAI"]["terms"] == {"Generative AI": 3, "Artificial intelligence": 1}   # one concept, its related terms; no double count


def test_a_bucket_needs_two_keywords_or_five_mentions_and_scores_as_the_notes_say():
    assert K.analyse("We make solar cells. " * 4) == {}                               # one keyword, 4 mentions: noise
    five = K.analyse("We make solar cells. " * 5)["Solar Technology"]
    assert five == {"distinct": 1, "total": 5, "score": 2 * 1 + 5 * 0.5, "terms": {"Solar cell technology": 5}}
    two = K.analyse("TOPCon line and a solar module plant.")["Solar Technology"]
    assert two["distinct"] == 2 and two["score"] == 2 * 2 + 2 * 0.5
    many = K.analyse("Capex " * 40)["Industrial Manufacturing & Capex"]
    assert many["score"] == 2 * 1 + 20 * 0.5                                         # mentions count up to 20


def test_the_directory_pdf_is_the_structure_166_keywords_with_related_terms_and_what_to_verify():
    rows = [c for cs in K.DIRECTORY.values() for c in cs]
    assert len(K.DIRECTORY) == 21 and len(rows) == 175                                # the PDF's 166 + 9 of the notes' terms no row holds
    assert sum(1 for c in rows if c["verify"]) == 166
    drones = {c["name"]: c for c in K.DIRECTORY["Space & Drone Technology"]}
    assert {"Anti-drone", "CUAS"} <= set(drones["Counter-drone systems"]["aliases"])
    assert drones["Counter-drone systems"]["verify"].startswith("Verify procurement stage, trials, orders")
    notes = {t.lower() for ts in K.BUCKETS.values() for t in ts}                      # every term of the notes is matched by some concept
    aliases = {a.lower() for c in rows for a in c["aliases"]}
    assert notes <= aliases
    assert K.analyse("Counter-drone systems. Anti-drone guns. CUAS radars. ", min_distinct=1, min_total=1)["Space & Drone Technology"]["terms"] == {
        "Counter-drone systems": 3}                                                   # a keyword and its related terms are one concept


def test_stage_follows_the_screening_discipline_and_the_most_advanced_wins():
    assert K.stage_of("We commissioned a 2 GW module line in Q2.") == "operating"
    assert K.stage_of("The 1 GW cell line is under construction.") == "execution"
    assert K.stage_of("Defence order inflow of Rs 12,000 crore in H1.") == "execution"          # orders in hand: under execution, not yet delivered
    assert K.stage_of("We plan to set up a 5 GWh battery plant by FY28.") == "planned"
    assert K.stage_of("Signed an MoU with the state for a pilot plant.") == "mou_pilot"
    assert K.stage_of("A nice picture of the board.") is None
    assert K.most_advanced(["planned", "mou_pilot", "operating"]) == "operating" and K.most_advanced([None]) is None
    plan = K.classify("Company overview and highlights for shareholders, segments in detail. " * 4 +
                      "We plan to set up 5 GWh of battery cell manufacturing by FY28. An MoU for sodium-ion batteries was signed in 2026.")
    assert plan["primary"] == "Battery & Energy Storage" and plan["stage"]["stage"] == "planned" and plan["stage"]["label"] == "Planned"


def test_tone_counts_positive_and_negative_finance_words():
    up = K.tone("Record revenue and strong growth; margins improved; we won new orders.")
    assert up["label"] == "Positive" and up["score"] == 1.0
    down = K.tone("Revenue declined on weak demand; losses widened; project delays and penalty.")
    assert down["label"] == "Negative" and down["score"] < 0
    assert K.tone("Revenue grew and margins improved, but demand was weak.")["label"] == "Mixed"
    assert K.tone("A plain sentence.")["score"] is None


def test_every_filing_gets_an_event_themes_and_tone():
    from finlit.discovery import signals as SG
    o = SG.tag("Bagging/Receiving of orders/contracts", "BEL has informed the Exchange about receiving orders worth Rs 572 crore for radar systems")
    assert o["event"] == "order" and o["tone"] == 1 and "Defence & Aerospace" in o["themes"]
    up = SG.tag("Credit Rating", "ICRA upgraded the long-term rating to AA+ with stable outlook")
    down = SG.tag("Credit Rating", "CARE downgraded the rating to BBB")
    flat = SG.tag("Credit Rating", "UltraTech Cement Limited has informed the Exchange about Credit Rating")
    assert (up["tone"], down["tone"], flat["tone"]) == (1, -1, 0) and up["event"] == "rating"
    assert SG.tag("Updates", "Show cause notice and penalty from SEBI")["tone"] == -1
    assert SG.tag("Change in Director(s)", "Resignation of Chief Financial Officer")["tone"] == -1
    assert SG.tag("Change in Director(s)", "Appointment of an independent director")["tone"] == 0
    assert SG.tag("Amalgamation/Merger", "Bharat Forge Limited has informed the Exchange about Amalgamation/Merger")["event"] == "mna"
    assert SG.tag("Allotment of Securities", "Allotment of 12,24,265 securities pursuant to Preferential Issue")["event"] == "fundraise"
    mou = SG.tag("General Updates", "MoU signed for a green hydrogen pilot plant")
    assert mou["event"] == "partnership" and mou["stage"] == "mou_pilot" and "Renewable Energy & Power" in mou["themes"]
    assert SG.tag("Updates", "Change in corporate office of RTA")["event"] == "other"
    assert SG.tag("Press Release", "Fine chemicals plant output")["event"] != "legal"


def test_primary_secondary_evidence_and_status():
    text = ("Company overview and highlights of the quarter for our shareholders, with the business segments described in detail below. " * 2 +
            "We commissioned a 2 GW TOPCon solar cell line in Q2 FY27. Solar module capacity is now 5 GW. Bifacial modules lead sales. "
            "Our order book stands at Rs 4,200 crore. We also run a small EPC arm for rooftop solar.")
    r = K.classify(text)
    assert r["primary"] == "Solar Technology" and r["status"] == "ok"
    assert r["evidence"][0].startswith("We commissioned a 2 GW TOPCon") and len(r["evidence"]) == 2
    assert r["stage"]["stage"] == "operating" and r["tone"]["label"] == "Too few words to tell"
    assert r["scores"]["Solar Technology"]["verify"]                                  # the directory's "what to verify" for the keywords found
    assert all(any(ch.isdigit() for ch in e) for e in r["evidence"])
    sec = K.classify(text + " Capex of Rs 900 crore for a greenfield plant and a brownfield line.")
    assert "Industrial Manufacturing & Capex" in sec["secondary"]
    words = K.classify("A long overview of the company and its history, written in words only. " * 4 + "TOPCon and bifacial modules. Solar module plans.")
    assert words["status"] == "keyword_only_no_figures" and words["evidence"] == []   # the notes' bug: this used to be "ok" always
    assert K.classify("short")["status"] == "no_text_layer"
    assert K.classify("Plain words about the business with no theme at all. " * 10)["status"] == "no_bucket_match"


# ------------------------------------------------------------------------------------------------ the shared fetcher (earnings/transcripts.py)
def test_nse_in_links_are_read_from_the_com_archive():
    assert T.Fetcher.canonical("https://nsearchives.nseindia.in/corporate/A_1.pdf") == "https://nsearchives.nseindia.com/corporate/A_1.pdf"
    assert T.Fetcher.canonical("https://nsearchives.nseindia.com/corporate/A_1.pdf") == "https://nsearchives.nseindia.com/corporate/A_1.pdf"
    assert T.Fetcher.canonical("https://evil.in/x.pdf") == "https://evil.in/x.pdf"
    assert T.Fetcher.canonical("http://nsearchives.nseindia.in/x.pdf") == "http://nsearchives.nseindia.in/x.pdf"     # https only, as before
    assert not T.Fetcher.host_ok(T.Fetcher.canonical("https://nseindia.in.evil.com/x.pdf"))


def nse_archive(seen, relay_ok=True):
    """NSE's archive as seen from a cloud address: a non-browser agent gets the connection dropped; robots.txt is 404 (no rules)."""
    def handler(req: httpx.Request):
        seen.append((req.url.host, req.url.path, req.headers.get("user-agent", ""), req.url.params.get("u")))
        if req.url.host == "relay.example.workers.dev":
            if not relay_ok:
                return httpx.Response(502, headers={"x-relay-error": "upstream"})
            return httpx.Response(200, content=make_pdf([["Relayed deck"]]), headers={"x-relay": "1"})
        if "Mozilla" not in req.headers.get("user-agent", ""):
            raise httpx.RemoteProtocolError("Server disconnected without sending a response.", request=req)
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(200, content=make_pdf([["Deck page one"]]))
    return httpx.MockTransport(handler)


async def test_nse_files_are_asked_for_with_the_browser_agent_and_robots_too():
    seen = []
    f = T.Fetcher(transport=nse_archive(seen), sleep=nosleep, pause=0, relay=None)
    try:
        pdf = await f.pdf("https://nsearchives.nseindia.in/corporate/ARHAM_1.pdf", T.DOC_PDF_BYTES)
    finally:
        await f.aclose()
    assert pdf.startswith(b"%PDF")
    assert [(h, p) for h, p, _, _ in seen] == [("nsearchives.nseindia.com", "/robots.txt"), ("nsearchives.nseindia.com", "/corporate/ARHAM_1.pdf")]
    assert all("Mozilla" in ua for _, _, ua, _ in seen)


async def test_a_dropped_connection_is_asked_again_through_the_relay():
    seen = []
    f = T.Fetcher(transport=nse_archive(seen), sleep=nosleep, pause=0, relay=("https://relay.example.workers.dev", "k"))
    try:
        r = await f._get_once("https://nsearchives.nseindia.com/x.pdf", {"User-Agent": T.USER_AGENT})
    finally:
        await f.aclose()
    assert r.status_code == 200 and r.headers["x-relay"] == "1"
    assert seen[-1][0] == "relay.example.workers.dev" and seen[-1][3] == "https://nsearchives.nseindia.com/x.pdf"


async def test_a_dropped_connection_without_a_working_relay_is_still_a_network_failure():
    for relay, ok in ((None, True), (("https://relay.example.workers.dev", "k"), False)):
        f = T.Fetcher(transport=nse_archive([], relay_ok=ok), sleep=nosleep, pause=0, relay=relay)
        try:
            with pytest.raises(httpx.TransportError):
                await f._get_once("https://nsearchives.nseindia.com/x.pdf", {"User-Agent": T.USER_AGENT})
        finally:
            await f.aclose()


async def test_a_presentation_over_the_transcript_cap_is_read_with_the_document_cap():
    big = make_pdf([["x" * 80] * 40] * 3)

    def handler(req):
        return httpx.Response(404) if req.url.path == "/robots.txt" else httpx.Response(200, content=big)
    f = T.Fetcher(transport=httpx.MockTransport(handler), sleep=nosleep, pause=0, relay=None)
    try:
        with pytest.raises(T.FetchFailed):
            await f.pdf("https://nsearchives.nseindia.com/a.pdf", cap=len(big) - 1)
        assert (await f.pdf("https://nsearchives.nseindia.com/a.pdf", cap=len(big))) == big
    finally:
        await f.aclose()


# ------------------------------------------------------------------------------------------------ the nightly job (service.py), real Postgres and Redis
SOLAR = [["Acme Solar Investor Presentation Q2 FY27. Company overview, strategy and highlights of the quarter for shareholders."],
         ["We commissioned a 2 GW TOPCon solar cell line in Q2 FY27. Solar module capacity is now 5 GW.",
          "Bifacial modules were 60% of sales. Order book of Rs 4,200 crore."]]
DEFENCE = [["Bharat Shield Investor Presentation. Company overview, our history, strategy and the highlights of the quarter."],
           ["Defence order inflow of Rs 1,250 crore in H1 FY27, led by radar system and electronic warfare programmes.",
            "Avionics revenue grew 30%. Missile system work continues."]]
TODAY = date.today()


def exchange(seen=None, fail=()):
    def handler(req: httpx.Request):
        (seen if seen is not None else []).append(req.url.path)
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        if any(x in req.url.path for x in fail):
            return httpx.Response(404)
        if "SOLAR" in req.url.path:
            return httpx.Response(200, content=make_pdf(SOLAR))
        if "SHIELD" in req.url.path:
            return httpx.Response(200, content=make_pdf(DEFENCE))
        return httpx.Response(200, content=make_pdf([["A short note."]]))
    return T.Fetcher(transport=httpx.MockTransport(handler), sleep=nosleep, pause=0, relay=None)


async def seed(st):
    async with st.pool.acquire() as conn:
        await conn.execute("TRUNCATE discovery_companies, discovery_signals, feed_items RESTART IDENTITY CASCADE")
        rows = [
            ("ACMESOLAR", "Acme Solar Ltd", "Investor Presentation", "Acme Solar has informed the Exchange about Investor Presentation",
             "https://nsearchives.nseindia.in/corporate/ACMESOLAR_SOLAR_new.pdf", TODAY - timedelta(days=1)),
            ("ACMESOLAR", "Acme Solar Ltd", "Investor Presentation", "Older presentation", "https://nsearchives.nseindia.in/corporate/ACMESOLAR_SOLAR_old.pdf",
             TODAY - timedelta(days=90)),
            ("BSHIELD", "Bharat Shield Ltd", "General Updates", "Bharat Shield has informed the Exchange about Investor Presentation",
             "https://nsearchives.nseindia.in/corporate/BSHIELD_SHIELD.pdf", TODAY - timedelta(days=2)),
            ("MEETONLY", "Meet Only Ltd", "Analysts/Institutional Investor Meet/Con. Call Updates", "Meet Only has informed the Exchange about a meet",
             "https://nsearchives.nseindia.in/corporate/MEETONLY.pdf", TODAY),
            ("ARONLY", "Annual Only Ltd", "Annual Report", "Annual report with investor presentation", "https://nsearchives.nseindia.in/corporate/AR.pdf", TODAY),
            ("OLDCO", "Old Co Ltd", "Investor Presentation", "Investor Presentation", "https://nsearchives.nseindia.in/corporate/OLD.pdf",
             TODAY - timedelta(days=500)),
        ]
        for i, (sym, co, cat, title, link, d) in enumerate(rows):
            await conn.execute("INSERT INTO feed_items (kind, title, symbol, company, link, item_date, category, auto, dedupe) "
                               "VALUES ('document', $1, $2, $3, $4, $5, $6, true, $7)", title, sym, co, link, d, cat, f"d{i}")


async def test_the_job_reads_the_newest_presentation_of_each_company_once(store):  # noqa: F811
    await seed(store)
    todo = await D.pending(store)
    assert [(d["symbol"], d["link"].rsplit("/", 1)[-1]) for d in todo] == [("ACMESOLAR", "ACMESOLAR_SOLAR_new.pdf"), ("BSHIELD", "BSHIELD_SHIELD.pdf")]
    seen = []
    res = await D.run(store, fetcher=exchange(seen))
    assert res["read"] == 2 and res["unreached"] == 0 and res["statuses"] == {"ok": 2}
    async with store.pool.acquire() as conn:
        rows = {r["symbol"]: dict(r) for r in await conn.fetch("SELECT * FROM discovery_companies")}
    assert rows["ACMESOLAR"]["primary_bucket"] == "Solar Technology" and rows["ACMESOLAR"]["pages"] == 2
    assert rows["BSHIELD"]["primary_bucket"] == "Defence & Aerospace"
    assert "Defence order inflow of Rs 1,250 crore" in json.loads(rows["BSHIELD"]["evidence"])[0]
    assert rows["ACMESOLAR"]["doc_link"].endswith("_new.pdf")                       # the feed's own link is kept for the page
    assert await D.pending(store) == [] and await D.has_work(store) is False         # nothing read twice
    again = await D.run(store, fetcher=exchange())
    assert again["read"] == 0


async def test_a_new_presentation_is_read_again_and_a_failed_read_is_retried_after_a_day(store):  # noqa: F811
    await seed(store)
    res = await D.run(store, fetcher=exchange(fail=("SHIELD",)))
    assert res["statuses"] == {"ok": 1, "error": 1} and "BSHIELD" in res["errors"][0]
    assert [d["symbol"] for d in await D.pending(store)] == []                        # not hammered again in the same day
    async with store.pool.acquire() as conn:
        await conn.execute("UPDATE discovery_companies SET read_at = now() - interval '25 hours' WHERE symbol = 'BSHIELD'")
        await conn.execute("INSERT INTO feed_items (kind, title, symbol, company, link, item_date, category, auto, dedupe) VALUES "
                           "('document', 'Investor Presentation Q3', 'ACMESOLAR', 'Acme Solar Ltd', 'https://nsearchives.nseindia.in/corporate/ACMESOLAR_SOLAR_q3.pdf', "
                           "$1, 'Investor Presentation', true, 'q3')", TODAY)
    assert sorted(d["symbol"] for d in await D.pending(store)) == ["ACMESOLAR", "BSHIELD"]


async def test_a_run_that_stops_early_says_work_is_left_for_the_probe(store):  # noqa: F811
    await seed(store)
    res = await D.run(store, limit=1, fetcher=exchange())
    assert res["read"] == 1 and res["unreached"] == 1 and await D.has_work(store) is True
    from finlit.jobs import probes
    assert await probes.build(store)["discovery"]() is True


async def test_the_page_route_lists_themes_then_one_theme_then_one_company(store):  # noqa: F811
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
    res = await D.run(store, fetcher=exchange())
    assert res["filings"]["tagged"] >= 2 and res["filings"]["events"]["order"] == 1
    app = create_app(make_settings(), store=store)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get("/api/discovery")
            assert r.status_code == 200 and r.headers["cache-control"] == "public, max-age=600"
            d = r.json()
            assert len(d["themes"]) == 21 and d["companies"] == 2 and "not proof of material business exposure" in d["caution"]
            solar = next(t for t in d["themes"] if t["name"] == "Solar Technology")
            assert solar["primary"] == 1 and solar["preview"] == ["Acme Solar Ltd"] and "companies" not in solar
            one = (await c.get("/api/discovery", params={"theme": "Defence & Aerospace"})).json()
            t = next(t for t in one["themes"] if t["name"] == "Defence & Aerospace")
            co = t["companies"][0]
            assert co["symbol"] == "BSHIELD" and co["hasFigures"] and "Defence orders" in co["keywords"]
            assert co["stageLabel"] in ("Operating", "Under execution") and co["tone"]["label"] and co["verify"]
            assert co["sector"] == {"macro": "Industrials", "sector": "Capital Goods", "industry": "Aerospace & Defense"}
            assert co["filings"]["count"] == 3 and co["filings"]["positive"] == 1 and co["filings"]["negative"] == 1
            assert t["sectors"] == {"Industrials": 1} and t["news"]["filings"] >= 1 and t["verify"]
            assert [f["event"] for f in t["recentFilings"]] == ["order"] and t["recentFilings"][0]["company"] == "Bharat Shield Ltd"
            ind = (await c.get("/api/discovery", params={"sector": "Industrials"})).json()
            assert ind["companies"] == 1 and list(ind["bySector"]) == ["Industrials"]
            assert (await c.get("/api/discovery", params={"sector": "<script>"})).status_code == 400
            assert co["document"]["link"].endswith("BSHIELD_SHIELD.pdf") and co["document"]["date"] == (TODAY - timedelta(days=2)).isoformat()
            by_sym = (await c.get("/api/discovery", params={"symbol": "acmesolar"})).json()
            assert [x["name"] for x in by_sym["themes"] if x.get("companies")] == ["Solar Technology"]
            sh = (await c.get("/api/discovery", params={"symbol": "BSHIELD"})).json()
            assert [f["eventLabel"] for f in sh["filings"]] == ["Order win", "Investor meet / presentation", "Credit rating"] and sh["sectorOf"]["macro"] == "Industrials"
            assert (await c.get("/api/discovery", params={"theme": "Tulips"})).status_code == 404
            assert (await c.get("/api/discovery", params={"symbol": "<x>"})).status_code == 400


def test_the_job_is_registered_bulk_nightly_resumable_and_never_weakened():
    from finlit.jobs.registry import build_jobs
    j = next(j for j in build_jobs({}) if j.name == "discovery")
    assert j.args[0] == "refresh-discovery" and j.cls == "bulk" and j.resumable and j.probe == "discovery"
    assert {w.window for w in j.windows} == {"NIGHT", "MORNING"} and j.sla.hours <= 30 and j.max_runtime_min >= 45


# ------------------------------------------------------------------------------------------------ FinLit AI's tool
async def test_finlit_ai_reads_discovery_through_the_page_route():
    from finlit.ask import pages as P, service, tools as TT
    calls = []

    class Gw:
        async def json(self, path, params=None, **kw):
            calls.append((path, params))
            return {"themes": [{"name": "Solar Technology", "primary": 1, "secondary": 0,
                                "companies": [{"symbol": "ACMESOLAR", "company": "Acme Solar Ltd"}] * 40, "alsoMentions": []}], "updated": "2026-11-18T00:00:00+00:00"}
    r = await TT.run(Gw(), "get_discovery", {"theme": "Solar Technology", "limit": 5})
    assert not r["error"] and calls == [("/api/discovery", {"theme": "Solar Technology"})]
    body = json.loads(r["text"])
    assert len(json.dumps(body)) < 20000 and "not proof of material business exposure" in r["text"]
    bad = await TT.run(Gw(), "get_discovery", {"theme": "Tulips"})
    assert bad["error"]
    assert "get_discovery" in service.SYSTEM and TT.label("get_discovery", {}) == "Reading Discovery"
    assert P.page_links([("get_discovery", {})]) == []          # Discovery is a section of the FinLit AI panel, not a page: no "Read on FinLit" link
