"""Task #278 (Concall Monitor): reading companies' call filings (finlit/concall/parse.py), grouping them into one card per call with a reason for every
button that has nothing to open (service.py), the `concalls` job and GET /api/concalls (all / portfolio / watchlist, latest / upcoming, search),
/transcript, /file and POST /summary (Silver and Gold; written once and kept)."""

import json
from datetime import date, timedelta

import pytest

from finlit.concall import parse as P
from finlit.concall import service as S

# Real letters filed on NSE in November 2026 (the opening sentences, as their PDFs read).
PRICOL = ("Sub: Audio Recording link of Investor Conference Call We are enclosing herewith Audio Recording Link of the Investor Conference Call for the "
          "Analysts and Investors held on Thursday, 19th November 2026 at 04:00 PM (IST) pertaining to the stake sale in Pricol Autotech Limited. "
          "Weblink: https://pricol.com/wp-content/uploads/2026/11/Concall-PRICOL-Limited-19112026.mp3 This is for your information and records.")
MIDHANI = ("November 19, 2026 BSE Limited Sub: Intimation of Audio Recording of Analysts/Institutional Investor Meet/Con. Call 1. This is to inform you "
           "that, Analysts and Investors Meet/ Conference Call on 'Q2 Results' was held today i.e., November 19, 2026 at 1100 hrs. and concluded at 1200 hrs. "
           "2. The audio recording of the call is available on the Company's websit e at the following path: Investors Investor Meet 2026-27 Quarter 2")
KRISHANA = ("Date: 18.11.2026 Sub: Audio recording of Earnings Conference call for the quarter ended September 30, 2026 Dear Sir/Madam, In continuation "
            "to our intimation letter dated July 11th, 2026 we hereby inform that the Q2 FY27 ended September 30, 202 6 Earnings Conference Call was held "
            "today i.e. Wednesday, November 18, 2026 at 12 .00 Noon and audio recording of the same is available at "
            "https://krishnaphoschem.com/financial-and-reports.html#webcast")
NUPUR = ("Date: 19.11.2026 Sub: Transcript of the Conference Call Please find enclosed herewith, the Transcript of the conference call for the Analysts/ "
         "Investors, which was held on Monday, November 16, 2026 (said conference call), to discuss the Unaudited Standalone and Consolidated Financial "
         "Results of the Company for the quarter ended on September 30, 2026")
CONFERENCE = ("November 19, 2026 Subject: Intimation of Schedule of Analyst / Institutional Investor Meeting please find below the schedule of investor/ "
              "analyst meeting/ conference: Date Details Location Mode of Meeting Type of Meeting December 9, 2026 Centrum Broking: Orion V Conference "
              "Mumbai In-Person One on One/ Group Meeting")
EARNINGS_SCHEDULE = ("November 20, 2026 Sub: Intimation of Earnings Conference Call Pursuant to Regulation 30 we wish to inform that the Company will "
                     "host an Earnings Conference Call on Tuesday, November 24, 2026 at 3:30 p.m. IST to discuss the Unaudited Financial Results for the "
                     "quarter and half year ended September 30, 2026 (Q2 FY27).")


def test_kind_of_reads_the_filing_title():
    cat = "Analysts/Institutional Investor Meet/Con. Call Updates"
    assert P.kind_of(cat, "Pricol Limited has informed the Exchange about Link of Recording") == "recording"
    assert P.kind_of(cat, "Nupur Recyclers Limited has informed the Exchange about Transcript") == "transcript"
    assert P.kind_of(cat, "X has informed the Exchange about Transcript and Link of Recording") == "transcript"
    assert P.kind_of(cat, "Tips Music Limited has informed the Exchange about Schedule of meet") == "schedule"
    assert P.kind_of("Investor Presentation", "Pricol Limited has informed the Exchange about Investor Presentation") == "presentation"
    assert P.kind_of(cat, "IndusInd Bank Limited has informed the Exchange about Outcome of Analysts/institutional investors meet") is None
    assert P.kind_of(cat, "Mahindra & Mahindra Limited has informed the Exchange about Participation in Investor Meeting") is None
    assert P.kind_of("Updates", "National Fertilizers Limited: Transfer of Shares to Investor Education and Protection Fund") is None


def test_a_recording_letter_gives_the_calls_date_time_and_audio_file():
    L = P.read_letter(PRICOL, "recording", date(2026, 11, 19))
    assert (L.call_date, L.call_time) == (date(2026, 11, 19), "16:00")
    assert L.audio == ["https://pricol.com/wp-content/uploads/2026/11/Concall-PRICOL-Limited-19112026.mp3"]
    L = P.read_letter(MIDHANI, "recording", date(2026, 11, 19))           # "held today ... at 1100 hrs"
    assert (L.call_date, L.call_time) == (date(2026, 11, 19), "11:00") and L.earnings
    L = P.read_letter(KRISHANA, "recording", date(2026, 11, 18))          # "Q2 FY27 ended September 30, 202 6" is the period, not the call
    assert (L.call_date, L.call_time, L.quarter) == (date(2026, 11, 18), "12:00", "Q2 FY27")
    assert L.audio == [] and L.links == ["https://krishnaphoschem.com/financial-and-reports.html#webcast"]


def test_a_transcript_letter_gives_the_calls_date_and_quarter():
    L = P.read_letter(NUPUR, "transcript", date(2026, 11, 19))
    assert L.call_date == date(2026, 11, 16) and L.call_time is None and L.quarter == "Q2 FY27" and L.earnings


def test_a_broker_conference_is_not_an_earnings_call_but_an_earnings_schedule_is():
    L = P.read_letter(CONFERENCE, "schedule", date(2026, 11, 19))
    assert not P.is_earnings_schedule(L, "Nippon Life India Asset Management Limited has informed the Exchange about Schedule of meet")
    L = P.read_letter(EARNINGS_SCHEDULE, "schedule", date(2026, 11, 20))
    assert P.is_earnings_schedule(L, "X has informed the Exchange about Schedule of meet")
    assert (L.call_date, L.call_time, L.quarter) == (date(2026, 11, 24), "15:30", "Q2 FY27")
    # the exchange's own category words in a title never make a meeting an earnings call
    assert not P.is_earnings_schedule(P.read_letter(CONFERENCE, "schedule", date(2026, 11, 19)),
                                      "Analysts/Institutional Investor Meet/Con. Call Updates: Plant visit")


def test_nothing_is_guessed_a_time_at_night_or_a_far_date_is_dropped():
    assert P.time_after("held at 0 hrs", 0) is None and P.time_label("16:00") == "04:00 PM" and P.time_label(None) is None
    L = P.read_letter("Transcript of the call held on Monday, June 2, 2026.", "transcript", date(2026, 11, 19))   # months before its filing: a misread
    assert L.call_date is None


def test_a_summary_line_that_reads_as_advice_is_dropped():
    from finlit.concall.api import clean_summary
    t = clean_summary("**What the quarter looked like**\n- Revenue rose 12% (p. 3)\n- You should buy the stock now\n**Outlook as management stated it**\n- Target price of 500")
    assert t == "**What the quarter looked like**\n- Revenue rose 12% (p. 3)"


def _row(kind, sym="ACME", filed=date(2026, 11, 19), call=None, t=None, earnings=True, audio=(), links=(), link=None):
    return {"link": link or f"https://nsearchives.nseindia.com/{sym}_{kind}_{filed}.pdf", "symbol": sym, "kind": kind, "title": kind, "filed": filed,
            "call_date": call, "call_time": t, "earnings": earnings, "quarter": "Q2 FY27", "audio": list(audio), "links": list(links), "pages": 3}


def test_filings_join_into_one_card_per_call_and_every_empty_button_says_why():
    today = date(2026, 11, 20)
    rows = [_row("schedule", filed=date(2026, 11, 12), call=date(2026, 11, 19), t="16:00"),
            _row("presentation", filed=date(2026, 11, 18)),
            _row("recording", filed=date(2026, 11, 19), call=date(2026, 11, 19), audio=["https://acme.in/q2.mp3"]),
            _row("schedule", sym="UPC", filed=date(2026, 11, 20), call=date(2026, 11, 24), t="15:30"),
            _row("schedule", sym="CONF", filed=date(2026, 11, 19), call=date(2026, 12, 9), earnings=False),     # a broker conference: left out
            _row("transcript", sym="OLD", filed=date(2026, 11, 3), call=None)]                                   # no date stated
    cards = {c["symbol"]: c for c in (S.card(c, {"ACME": "Acme Ltd"}, today) for c in S.group(rows))}
    assert set(cards) == {"ACME", "UPC", "OLD"}
    a = cards["ACME"]
    assert (a["name"], a["date"], a["timeLabel"], a["upcoming"]) == ("Acme Ltd", "2026-11-19", "04:00 PM", False)
    assert a["listen"]["audio"] == "https://acme.in/q2.mp3" and a["ppt"]["doc"]["filed"] == "2026-11-18"
    assert "within 5 working days" in a["transcript"]["why"] and a["summary"]["source"] == "presentation"   # the deck, until the transcript is filed
    u = cards["UPC"]
    assert u["upcoming"] and u["timeLabel"] == "03:30 PM" and "24 Nov 2026" in u["listen"]["why"] and "transcript" in u["transcript"]["why"]
    assert u["ppt"]["why"] == "No investor presentation filed with this call." and "neither is filed yet" in u["summary"]["why"]
    o = cards["OLD"]
    assert o["date"] is None and "do not state the call's date" in o["dateNote"] and o["timeNote"] == "Time not stated in the filings"
    assert o["transcript"]["doc"] and o["listen"]["why"] == "No recording link filed with the exchange for this call."


def test_a_web_page_link_opens_in_a_new_tab_and_plain_http_audio_is_never_played_in_page():
    today = date(2026, 11, 20)
    c = S.group([_row("recording", call=date(2026, 11, 18), audio=["http://acme.in/q2.mp3"], links=["https://youtu.be/abc"])])[0]
    card = S.card(c, {}, today)
    assert "audio" not in card["listen"] and card["listen"]["page"] == "https://youtu.be/abc" and "new tab" in card["listen"]["pageNote"]


# ------------------------------------------------------------------------------------------------ the job and the API (database)
from test_auth import app, signed_in  # noqa: E402,F401  (fixtures and helpers)
from test_integration import ingested, store  # noqa: E402,F401  (fixtures)

LETTERS = {"https://nsearchives.nseindia.com/corporate/RELIANCE_rec.pdf": [PRICOL.replace("Pricol Autotech Limited", "a unit")],
           "https://nsearchives.nseindia.com/corporate/RELIANCE_tr.pdf": [NUPUR.replace("Monday, November 16, 2026", "Thursday, November 19, 2026"), "Page two of the call: management said demand grew."],
           "https://nsearchives.nseindia.com/corporate/TCS_sched.pdf": [EARNINGS_SCHEDULE.replace("November 24, 2026", "{up}")]}


async def _seed(app):
    up = (date.today() + timedelta(days=3)).strftime("%B %d, %Y")
    filed = date.today()
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM concall_docs")
        await conn.execute("DELETE FROM concall_summaries")
        cat = "Analysts/Institutional Investor Meet/Con. Call Updates"
        for link, sym, title, d in (
                ("https://nsearchives.nseindia.com/corporate/RELIANCE_rec.pdf", "RELIANCE", "Reliance has informed the Exchange about Link of Recording", date(2026, 11, 19)),
                ("https://nsearchives.nseindia.com/corporate/RELIANCE_tr.pdf", "RELIANCE", "Reliance has informed the Exchange about Transcript", date(2026, 11, 19)),
                ("https://nsearchives.nseindia.com/corporate/TCS_sched.pdf", "TCS", "TCS has informed the Exchange about Schedule of meet", filed)):
            await conn.execute("INSERT INTO feed_items (kind, title, symbol, company, source, link, item_date, category, auto, dedupe) "
                               "VALUES ('document', $1, $2, $2, 'Exchange filing', $3, $4, $5, true, $3) ON CONFLICT (dedupe) DO NOTHING", title, sym, link, d, cat)
    return up


@pytest.mark.integration
async def test_the_job_reads_each_letter_once_and_the_page_lists_latest_and_upcoming(app):
    up = await _seed(app)
    reads = []

    async def pages_of(link):
        reads.append(link)
        return [p.replace("{up}", up) for p in LETTERS.get(link, ["A letter with no call in it."])]

    from finlit.ask import docstore
    res = await S.run(app.state.store, pages_of=pages_of)
    assert res["added"] >= 3 and set(LETTERS) <= set(reads)
    n = len(reads)
    again = await S.run(app.state.store, pages_of=pages_of)
    assert again["added"] == 0 and len(reads) == n                                  # each letter is read once
    assert await docstore.get_pages(app.state.store, "https://nsearchives.nseindia.com/corporate/RELIANCE_tr.pdf")   # the transcript's text is kept
    await app.state.store.redis.delete("concall:cards:v1")
    from test_auth import new_client
    c = new_client(app)
    r = (await c.get("/api/concalls")).json()
    rel = [x for x in r["items"] if x["symbol"] == "RELIANCE" and x["date"] == "2026-11-19"]
    assert rel and "disclaimer" in r
    it = rel[0]
    assert it["kind"] == "Investor call" or it["kind"] == "Earnings call"
    assert it["listen"]["audio"].endswith(".mp3") and it["transcript"]["doc"]["link"].endswith("RELIANCE_tr.pdf")
    u = (await c.get("/api/concalls", params={"tab": "upcoming"})).json()["items"]
    tcs = [x for x in u if x["symbol"] == "TCS"]
    assert tcs and tcs[0]["timeLabel"] == "03:30 PM" and tcs[0]["upcoming"]
    found = (await c.get("/api/concalls", params={"q": "tcs", "tab": "upcoming"})).json()["items"]
    assert found and all(x["symbol"] == "TCS" for x in found)
    p = (await c.get("/api/concalls", params={"scope": "portfolio"})).json()
    assert p["signIn"] and p["items"] == [] and "Sign in" in p["scopeNote"]
    t = (await c.get("/api/concalls/transcript", params={"link": "https://nsearchives.nseindia.com/corporate/RELIANCE_tr.pdf"})).json()
    assert len(t["pages"]) == 2 and "demand grew" in t["pages"][1]
    assert (await c.get("/api/concalls/transcript", params={"link": "https://example.com/x.pdf"})).status_code == 404      # only the page's own filings
    assert (await c.get("/api/concalls/file", params={"link": "https://example.com/x.pdf"})).status_code == 404


@pytest.mark.integration
async def test_portfolio_and_watchlist_tabs_show_only_the_members_companies(app):
    await _seed(app)

    async def pages_of(link):
        return [p.replace("{up}", (date.today() + timedelta(days=3)).strftime("%B %d, %Y")) for p in LETTERS.get(link, ["No call."])]

    await S.run(app.state.store, pages_of=pages_of)
    await app.state.store.redis.delete("concall:cards:v1")
    m = await signed_in(app, "cc278@example.com", plan="silver")
    async with app.state.store.pool.acquire() as conn:
        uid = await conn.fetchval("SELECT id FROM users WHERE lower(email) = 'cc278@example.com'")
        await conn.execute("INSERT INTO user_state (user_id, watchlist, portfolio) VALUES ($1, $2::jsonb, $3::jsonb) ON CONFLICT (user_id) DO UPDATE SET "
                           "watchlist = EXCLUDED.watchlist, portfolio = EXCLUDED.portfolio", uid,
                           json.dumps({"lists": [{"id": "w", "name": "Mine", "symbols": ["TCS"]}]}), json.dumps({"holdings": [{"symbol": "RELIANCE"}]}))
    p = (await m.get("/api/concalls", params={"scope": "portfolio"})).json()
    assert p["items"] and {x["symbol"] for x in p["items"]} == {"RELIANCE"} and p["counts"]["upcoming"] == 0
    w = (await m.get("/api/concalls", params={"scope": "watchlist", "tab": "upcoming"})).json()
    assert [x["symbol"] for x in w["items"]] == ["TCS"]


@pytest.mark.integration
async def test_ai_summary_is_silver_and_gold_written_once_and_kept(app, monkeypatch):
    await _seed(app)

    async def pages_of(link):
        return [p.replace("{up}", "November 30, 2026") for p in LETTERS.get(link, ["No call."])]

    await S.run(app.state.store, pages_of=pages_of)
    link = "https://nsearchives.nseindia.com/corporate/RELIANCE_tr.pdf"
    basic = await signed_in(app, "cc278b@example.com")
    r = await basic.post("/api/concalls/summary", json={"link": link})
    assert r.status_code == 403 and r.json()["detail"]["status"] == "plan_required"
    import finlit.concall.api as A
    calls = []

    async def fake_write(request, row, pages, name):
        calls.append(row["link"])
        return "**What the quarter looked like**\n- Revenue grew (p. 1)"
    monkeypatch.setattr(A, "_write_summary", fake_write)
    import dataclasses
    app.state.settings = dataclasses.replace(app.state.settings, anthropic_api_key=app.state.settings.anthropic_api_key or "test-key")
    gold = await signed_in(app, "cc278g@example.com", plan="gold")
    first = (await gold.post("/api/concalls/summary", json={"link": link})).json()
    assert first["cached"] is False and first["used"] == 1 and "Revenue grew" in first["text"]
    silver = await signed_in(app, "cc278s@example.com", plan="silver")
    second = (await silver.post("/api/concalls/summary", json={"link": link})).json()
    assert second["cached"] is True and second["used"] == 0 and calls == [link]          # written once; opening it again uses nothing


@pytest.mark.integration
async def test_the_pdf_is_served_for_this_site_to_show_in_place_and_only_the_pages_own_files(app, monkeypatch):
    await _seed(app)

    async def pages_of(link):
        return [p.replace("{up}", "November 30, 2026") for p in LETTERS.get(link, ["No call."])]
    await S.run(app.state.store, pages_of=pages_of)
    from finlit.earnings import transcripts as T

    async def pdf(self, url, cap=None):
        return b"%PDF-1.4 test"
    monkeypatch.setattr(T.Fetcher, "pdf", pdf)
    from test_auth import new_client
    r = await new_client(app).get("/api/concalls/file", params={"link": "https://nsearchives.nseindia.com/corporate/RELIANCE_tr.pdf"})
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf" and r.content.startswith(b"%PDF")
    assert "frame-ancestors 'self'" in r.headers["content-security-policy"] and r.headers["x-frame-options"] == "SAMEORIGIN"
