"""Task #266: the document scorer against the team's "Document Scoring Workflow" v2. Section 8.1's thirteen unit-test sentences (every component and the
score), the 39 worked-example points of section 7 (their printed scores), the three worked documents (65.9 green, 68.3 green, 57.2 yellow) and the company
composite (63.3). The workflow says these are the regression test: after any change to the word lists or weights they must still give the same result."""

import pytest

from finlit.docscore import lexicon as L
from finlit.docscore.scorer import Point, band, company_score, score_document, score_point

UNIT = [  # type, sentence, D, M, E, X, C, T, score, hard trigger
    ("R", "There was no revenue growth in the quarter.", -8, 0, 0, 0, 0, 2, 44, False),
    ("R", "The auditors did not issue a qualified opinion.", 12.5, 0, 0, 0, 0, 0, 62.5, False),
    ("R", "The auditor's report includes a material uncertainty related to going concern.", -35, 0, 0, 0, 0, 0, 15, True),
    ("C", "Despite supply chain disruption, the Phase 2 line was commissioned in Q2 FY27.", 6, 0, 6, 6, 0, 2, 70, False),
    ("C", "Sales declined 18% YoY.", -10, -8, 6, 0, 0, 0, 38, False),
    ("C", "Revenue grew 6% YoY.", 8, 2, 6, 0, 0, 0, 66, False),
    ("P", "A MoU was signed with a customer.", -6, 0, 0, 0, 0, 0, 44, False),
    ("P", "The company is exploring a possible MoU, subject to approvals.", -18, 0, 0, -6, 0, 0, 26, False),
    ("C", "We may see some improvement, and we believe margins could hold.", 0, 0, 0, 0, -3, 0, 47, False),
    ("P", "The company will deliver 20% revenue growth by 2030.", 8, 6, 4, 0, 2, -2, 68, False),
    ("P", "Several large opportunities are in the pipeline.", 0, 0, -3, 0, 0, 0, 47, False),
    ("P", "Order cancellations of Rs 300 crore were recorded.", -15, 0, 4, 0, 0, 0, 39, False),
    ("R", "There is no risk of default on borrowings.", 10, 0, 0, 0, 0, 0, 60, False),
]


@pytest.mark.parametrize("doctype,text,D,M,E,X,C,T,score,hard", UNIT)
def test_the_workflow_unit_tests(doctype, text, D, M, E, X, C, T, score, hard):
    p = score_point(text, doctype)
    assert (p.D, p.M, p.E, p.X, p.C, p.T, p.score, bool(p.hard)) == (D, M, E, X, C, T, score, hard)


PRES = [
    ("Order book grew 32% YoY to Rs 4,200 crore, with fresh orders signed in defence and data centre segments.", 94, "OE"),
    ("The new greenfield plant was successfully commissioned in Q2 FY27 and capacity utilisation improved to 74%.", 94, "OE"),
    ("Export orders of Rs 610 crore were received from two European customers during the quarter.", 66, "OE"),
    ("EBITDA margin expanded by 220 bps to 18.4% on a richer mix and cost savings.", 78, "PM"),
    ("Revenue grew 21% YoY to Rs 1,860 crore on strong demand in the industrial segment.", 78, "GD"),
    ("Customer concentration remains high, with the top 3 clients contributing 61% of revenue.", 47, "GD"),
    ("Commissioning of the Phase 2 line was delayed by two quarters due to supplier shortages.", 40, "OE"),
    ("The company is exploring a possible MoU with a technology partner for solid-state cells, subject to approvals.", 26, "SC"),
    ("Management plans to enter the counter-drone segment and is evaluating acquisition targets.", 36, "SC"),
    ("A definitive agreement was signed for a 51% stake in a precision engineering business, and the acquisition completed in October.", 72, "SC"),
    ("Several large opportunities are in the pipeline and the company aims to be a leading player by 2030.", 52, None),
    ("Input cost inflation and pricing pressure may affect margins in the second half.", 31, "PM"),
    ("Net debt reduced to Rs 140 crore from Rs 390 crore, and the company remains confident of achieving its capex plan on schedule.", 73, "BL"),
]
CALL = [
    ("We delivered a record quarter with revenue growth of 21% year on year to Rs 1,860 crore.", 93, "GD"),
    ("EBITDA margin improved by 220 bps to 18.4% on better mix and cost optimisation.", 79, "PM"),
    ("We are raising our full-year guidance to 18-20% revenue growth, as capacity utilisation improved to 74% after the Phase 1 commissioning.", 97, "GO"),
    ("Fresh orders of Rs 1,150 crore were received in the quarter and the order book stands at Rs 4,200 crore, which gives us clear visibility for the next year.", 74, "OE"),
    ("Net debt reduced to Rs 140 crore and free cash flow was Rs 215 crore.", 68, "BL"),
    ("Receivable days increased to 82 from 74 because of delayed payments from two public sector customers.", 40, "OE"),
    ("We faced headwinds from input cost inflation and pricing pressure in the industrial segment, but we expect margins to hold in the second half.", 23, "PM"),
    ("One order of Rs 45 crore was cancelled in the quarter, which is less than 1% of the order book.", 50, "OE"),
    ("We are not in a position to comment on the customer.", 47, "GO"),
    ("We are in discussions with a global OEM for a long-term supply arrangement, subject to approvals, and it is too early to quantify.", 27, "SC"),
    ("We expect capex of around Rs 400 crore, and we believe we will fund it mostly from internal accruals.", 53, None),
    ("Despite supply chain disruption, the Phase 2 line is expected to be commissioned by the end of the third quarter.", 68, "OE"),
    ("Going forward, we remain cautiously optimistic and will wait and watch on the tariff situation.", 44, "GO"),
]
RES = [
    ("Revenue from operations increased 18% to Rs 1,860 crore from Rs 1,576 crore in the corresponding quarter of the previous year.", 70, "GD"),
    ("Profit after tax rose 24% to Rs 212 crore, and the board has declared an interim dividend of Rs 2 per share.", 72, "PM"),
    ("Finance costs decreased to Rs 21 crore from Rs 34 crore as borrowings were repaid.", 64, "BL"),
    ("An exceptional loss of Rs 18 crore was recognised on impairment of an overseas subsidiary.", 34, "PM"),
    ("Other income increased to Rs 42 crore due to treasury gains.", 56, "PM"),
    ("Segment revenue of the industrial segment increased 26% while the electronics segment declined 9% year on year.", 56, "GD"),
    ("Trade receivables increased to Rs 780 crore, and an expected credit loss of Rs 14 crore was provided.", 49, "BL"),
    ("Capital work-in-progress stands at Rs 410 crore for the Phase 2 line.", 54, None),
    ("The statutory auditors have issued a limited review report with an emphasis of matter paragraph relating to a tax demand of Rs 63 crore under dispute.", 38, "GA"),
    ("The auditors' report does not contain a qualified conclusion.", 62.5, "GA"),
    ("Credit rating was reaffirmed by the agency with a stable outlook, and the rating upgrade of the long-term facility was received in October.", 60, "BL"),
    ("A show-cause notice was received from the tax authority relating to GST demand of Rs 11 crore, which the company is contesting.", 36, "RL"),
    ("Related party transactions were approved by the audit committee and are on arm's length terms.", 47, "GA"),
    ("The board approved capital expenditure of Rs 400 crore for the expansion at the existing plant.", 54, None),
    ("Outcome of board meeting: the company will hold an earnings call on 5 November 2026.", 54, None),
]


@pytest.mark.parametrize("doctype,rows", [("P", PRES), ("C", CALL), ("R", RES)])
def test_the_worked_example_points_score_as_printed(doctype, rows):
    for text, want, theme in rows:
        p = score_point(text, doctype)
        assert (p.score, p.theme) == (want, theme), (text, p.rules())


def test_the_three_worked_documents_and_the_company_composite():
    docs = {t: score_document([Point(x[0]) for x in rows], t) for t, rows in (("P", PRES), ("C", CALL), ("R", RES))}
    assert (docs["P"]["score"], docs["P"]["band"]) == (65.9, "green")
    assert (docs["C"]["score"], docs["C"]["band"]) == (68.3, "green")
    assert (docs["R"]["score"], docs["R"]["band"]) == (57.2, "yellow")
    p = {x["id"]: x["value"] for x in docs["P"]["params"]}
    assert (p["P1"], p["P2"], p["P3"], p["P4"], p["P5"], p["P6"]) == (62.1, 65.4, 100.0, 60.0, 70.0, None)   # P6 not used: no reference figures given
    assert docs["P"]["share"] == {"green": 53.8, "yellow": 23.1, "red": 23.1} and docs["P"]["confidence"] == "Low"
    assert {t["theme"]: t["score"] for t in docs["R"]["themes"] if t["score"] is not None} == {"GD": 63.0, "PM": 54.0, "BL": 57.7, "GA": 49.2, "RL": 36.0}
    assert company_score({k: v["score"] for k, v in docs.items()})["score"] == 63.3


def test_a_hard_trigger_caps_the_point_and_keeps_the_document_off_green():
    d = score_document([Point("Revenue grew 21% YoY to Rs 1,860 crore on strong demand."), Point("Record revenue and record profit in the quarter, up 40% YoY."),
                        Point("The auditor's report includes a material uncertainty related to going concern.")], "R")
    assert d["hardTriggers"] == 1 and d["score"] <= 64 and d["band"] != "green"
    assert [x["score"] for x in d["points"] if x.get("hard")] == [15.0]


def test_no_signal_boilerplate_headings_and_duplicates_are_listed_not_scored():
    d = score_document([Point("Safe harbour: this presentation has been prepared by the company."), Point("Our journey", kind="heading", status="heading"),
                        Point("We thank everyone."), Point("Revenue grew 6% YoY."), Point("Revenue grew 6% YoY.")], "P")
    assert [x["status"] for x in d["points"]] == ["excluded: boilerplate", "heading", "no signal", "scored", "duplicate"]
    assert d["counts"]["scored"] == 1


def test_the_bands_and_never_a_sentiment_word():
    assert [band(v) for v in (100, 65, 64.9, 40, 39.9, 0)] == ["green", "green", "yellow", "yellow", "red", "red"]
    assert (L.GREEN_FROM, L.YELLOW_FROM) == (65.0, 40.0)
    out = str(score_document([Point(x[0]) for x in RES], "R")).lower()
    assert "positive" not in out and "negative" not in out.replace("negative net worth", "") and "neutral" not in out


# ------------------------------------------------------------------------------------------------ the three filings from Section 18
import json  # noqa: E402

from finlit.docscore import service  # noqa: E402
from finlit.docscore.segment import segment  # noqa: E402
from test_auth import app, new_client  # noqa: E402,F401
from test_integration import ingested, make_settings, store  # noqa: E402,F401

DECK = "https://nsearchives.nseindia.com/corporate/DSX_15102026_Outcome.pdf"
CALLT = "https://nsearchives.nseindia.com/corporate/DSX_21102026_transcript.pdf"
OUTCOME_PAGES = [
    "Outcome of Board Meeting\nThe Board approved the audited financial results for the quarter ended September 30, 2026.",
    "Revenue from operations increased 18% to Rs 1,860 crore from Rs 1,576 crore in the corresponding quarter of the previous year.\n"
    "Profit after tax rose 24% to Rs 212 crore, and the board has declared an interim dividend of Rs 2 per share.",
    "Independent Auditor's Report\nThe management is responsible for assessing the company's ability to continue as a going concern, disclosing matters related to "
    "going concern and using the going concern basis of accounting.\nOur opinion is not modified in respect of these matters.",
    "Press Release\nCopyright 2026 DSX. All rights reserved.\nRecord quarter for DSX.",
    "Earnings Presentation\nQ2 FY27",
    "Order book grew 32% YoY to Rs 4,200 crore, with fresh orders signed in defence and data centre segments.\n\n"
    "The new greenfield plant was successfully commissioned in Q2 FY27 and capacity utilisation improved to 74%.",
]
CALL_PAGES = ["Moderator: Ladies and gentlemen, good day. Participants are in listen-only mode. I now hand over to Mr. Rao.\n"
              "Ravi Rao: We delivered a record quarter with revenue growth of 21% year on year to Rs 1,860 crore. We are raising our full-year guidance to "
              "18-20% revenue growth, as capacity utilisation improved to 74% after the Phase 1 commissioning.\n"
              "Moderator: The next question is from the line of Priya Shah from ABC Securities. Please go ahead.\n"
              "Priya Shah: Is there a risk of default on your borrowings? Has the order book declined?\n"
              "Ravi Rao: Net debt reduced to Rs 140 crore and free cash flow was Rs 215 crore."]
ANNS = [{"date": "2026-10-21", "time": "20:57", "category": "Analysts/Institutional Investor Meet/Con. Call Updates", "description": "DSX Limited has informed the Exchange about Transcript", "link": CALLT},
        {"date": "2026-10-18", "time": "10:00", "category": "Analysts/Institutional Investor Meet/Con. Call Updates", "description": "DSX Limited has informed the Exchange about Schedule of meet", "link": "https://nsearchives.nseindia.com/corporate/DSX_meet.pdf"},
        {"date": "2026-10-15", "time": "17:09", "category": "Investor Presentation", "description": "DSX Limited has informed the Exchange about Investor Presentation", "link": DECK},
        {"date": "2026-10-15", "time": "16:56", "category": "Outcome of Board Meeting", "description": "DSX Limited has submitted to the Exchange, the financial results for the period ended September 30, 2026.", "link": DECK}]


def test_which_section18_announcement_is_which():
    assert [service.kind_of(a["category"], a["description"]) for a in ANNS] == ["C", None, "P", "R"]
    assert service.kind_of("Board Meeting Intimation", "intimation of board meeting for results") is None


def test_a_combined_outcome_file_is_split_into_the_results_and_the_presentation():
    assert service.split_combined(OUTCOME_PAGES, "R") == OUTCOME_PAGES[:3]
    assert service.split_combined(OUTCOME_PAGES, "P") == OUTCOME_PAGES[4:]
    assert service.split_combined(CALL_PAGES, "C") == CALL_PAGES


def test_a_transcript_scores_management_only():
    pts = segment(CALL_PAGES, "C")
    assert {p.speaker for p in pts if p.status == "scored"} == {"Ravi Rao"}
    assert any("risk of default" in p.text and p.status.startswith("excluded") for p in pts)   # the analyst's question never fires a hard trigger


@pytest.mark.integration
async def test_the_endpoint_reads_section18_scores_the_three_and_the_company(app, monkeypatch):  # noqa: F811
    st = app.state.store
    await st.redis.hset("stock:DSX:consolidated", mapping={"events": json.dumps({"announcements": ANNS}), "events:etag": "t"})
    async with st.pool.acquire() as conn:
        await conn.execute("DELETE FROM document_pages WHERE symbol = 'DSX'")
        await conn.execute("INSERT INTO document_pages (link, symbol, kind, filed, pages) VALUES ($1, 'DSX', 'Results filing', '2026-10-15', $2::jsonb)", DECK, json.dumps(OUTCOME_PAGES))
    for k in ("P", "C", "R"):
        for link in (DECK, CALLT):
            await st.redis.delete(service._cache_key(link, k))
    got = []

    async def fake_pages(link):
        got.append(link)
        return CALL_PAGES
    monkeypatch.setattr("finlit.ask.pages._pages_of", fake_pages)
    c = new_client(app)
    b = (await c.get("/api/stocks/DSX/filing-scores")).json()
    assert b["docs"]["P"]["status"] == "scored" and b["docs"]["R"]["status"] == "scored" and b["docs"]["C"]["status"] == "reading" and b["reading"] is True
    assert b["docs"]["P"]["doc"] == {"title": ANNS[2]["description"], "date": "2026-10-15", "link": DECK, "source": "section18"}
    assert b["docs"]["R"]["pages"] == 3 and b["docs"]["P"]["pages"] == 2 and b["docs"]["R"]["hardTriggers"] == 0     # the auditor's standard going-concern text
    import asyncio
    for _ in range(50):
        await asyncio.sleep(0.05)
        if not service._inflight:
            break
    b = (await c.get("/api/stocks/DSX/filing-scores")).json()
    assert got == [CALLT] and b["docs"]["C"]["status"] == "scored" and b["reading"] is False
    assert {p["speaker"] for p in b["docs"]["C"]["points"]} == {"Ravi Rao"}
    for k in ("P", "C", "R"):
        d = b["docs"][k]
        assert d["band"] in ("green", "yellow", "red") and 0 <= d["score"] <= 100 and d["keyPoints"]
    w = b["company"]["weights"]
    assert w == {"P": 25.0, "C": 35.0, "R": 40.0} and b["company"]["band"] in ("green", "yellow", "red")
    text = json.dumps(b).lower()
    assert not any(x in text for x in ("positive", "neutral", "sentiment")) and "negative" not in text.replace("negative net worth", "")
    assert (await c.get("/api/stocks/bad sym!/filing-scores")).status_code in (400, 404)
    await c.aclose()


ROSTER_CALL = ["TO ALL STOCK EXCHANGES\nSub: Transcripts of the earnings call conducted after the Board meeting\nDear Sir/ Madam,\nPlease find enclosed the transcript.",
               "Infosys Limited\nEarnings Conference Call\nCORPORATE PARTICIPANTS:\n\nSalil Parekh\nChief Executive Officer and Managing Director\n\nJayesh Sanghrajka\n"
               "Chief Financial Officer\n\nANALYSTS\n\nJonathan Lee\nGuggenheim Securities\n\nMeghna Sen\nCNBC-TV18",
               "Moderator\nThe next question is from Jonathan Lee from Guggenheim Securities.\nJonathan Lee\nWhat about the order book? Is there a risk of default?\n"
               "Salil Parekh\nWe delivered a record quarter with revenue growth of 21% year on year to Rs 1,860 crore.\nWhich countries are you exploring?\n"
               "Jayesh Sanghrajka\nNet debt reduced to Rs 140 crore and free cash flow was Rs 215 crore."]


def test_a_transcript_with_a_participants_list_and_names_on_their_own_lines():
    """Lexicon 2.1.1 (the Infosys Q2 FY27 transcript): the list names the company's speakers; a name alone on a line starts a turn; the cover letter
    ("Sub:"), the analysts and journalists, the moderator and any question are left out."""
    from finlit.docscore.segment import roster
    mine, others = roster(ROSTER_CALL)
    assert mine == {"salil parekh", "jayesh sanghrajka"} and others == {"jonathan lee", "meghna sen"}
    pts = segment(ROSTER_CALL, "C")
    assert [(p.speaker, p.text[:30]) for p in pts if p.status == "scored"] == [("Salil Parekh", "We delivered a record quarter "), ("Jayesh Sanghrajka", "Net debt reduced to Rs 140 cro")]
    assert {p.status for p in pts if "Sub:" in p.text or "enclosed" in p.text} == {"excluded: before the call"}
    assert any(p.status == "excluded: a question" and "exploring" in p.text for p in pts)
    assert all(p.status.startswith("excluded") for p in pts if p.speaker in ("Jonathan Lee", "Moderator"))
