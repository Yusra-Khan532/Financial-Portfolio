"""Sorting exchange filings into results, documents and news, and into FinLit topics. The texts are real NSE filings from 14-21 Nov 2026."""
from datetime import date
from types import SimpleNamespace

import pytest

from finlit.feed import TOPIC_KEYS, classify, resort, rows_from_announcements, topic_of, truncated_title

SPURT = ("Spurt in Volume: Significant increase in volume has been observed in Ghcl Textiles Limited. The Exchange, in order to ensure that "
         "the investors have latest relevant information about the company and to inform the market about such events")


@pytest.mark.parametrize("category,text,kind", [
    # the exchange's own queries are news, though their text says "investors"
    ("Spurt in Volume", SPURT, "news"),
    ("Price movement", "Significant movement in price has been observed. The Exchange, in order to ensure that investors have", "news"),
    ("Updates", "National Fertilizers Limited has informed the Exchange regarding 'Transfer of Shares to Investor Education and Protection Fund'", "news"),
    # NSE's results format, which never says "result" in its category
    ("Integrated Filing- Financial", "Integrated Filing - Financials", "result"),
    ("Integrated Filing- Financial", "unaudited financials for half year ended 30 sept 2026", "result"),
    ("Financial Results", "Outcome of board meeting", "result"),
    ("Outcome of Board Meeting", "Outcome of Board Meeting Unaudited Financial Statement", "result"),
    ("Outcome of Board Meeting", "Approved the unaudited financial results; the investor presentation is attached", "result"),
    ("Press Release", "Press Release on unaudited financial results for the quarter ended September 30, 2026", "result"),
    # "quarter ended" alone is not a results filing
    ("Monitoring Agency Report", "Monitoring Agency Report for the quarter ended 30.09.2026", "news"),
    # calls, transcripts and presentations of the results are documents
    ("Analysts/Institutional Investor Meet/Con. Call Updates", "Senco Gold Limited has informed the Exchange about Earnings Call Transcript of Q2 & H1 FY 27- Financial Results.", "document"),
    ("General Updates", "Polyplex Corporation Limited has informed the Exchange about Investor presentation on the Consolidated Financial Results", "document"),
    ("Updates", "Q-Line Biotech Limited has informed the Exchange regarding 'Submission of audio recording of Earnings Conference Call-13.11.2026'.", "document"),
    ("General Updates", "Polycab India Limited has informed the Exchange about Analyst(s)/Investor(s) meet.", "document"),
    ("Analyst / Investor Meet", "Presentation to analysts", "document"),
    ("Updates", "Copy of Newspapers dated 13.11.2026-Extract of Unaudited results", "document"),
    ("Credit Rating", "informed the Exchange about Credit Rating", "news"),
    ("General Updates", "Venky's (India) Limited has informed the Exchange about Updated Investor Information.", "news"),
])
def test_classify(category, text, kind):
    assert classify(category, text) == kind


def test_resort_never_drops_a_result_and_trusts_a_cut_title_only_for_moves_it_can_see():
    long_title = "Press Release: " + "x" * 140
    assert truncated_title("Press Release", long_title)
    assert resort("result", "Press Release", long_title) == "result"            # the cut text lost "financial results": stays a result
    assert resort("document", "Updates", "Updates: " + "y" * 140) == "document"  # the cut text lost its document words: stays
    assert resort("document", "Spurt in Volume", SPURT) == "news"                 # the category decides
    assert resort("document", "Updates", "Updates: National Fertilizers Limited has informed the Exchange regarding 'Transfer of Shares to "
                  "Investor Education and Protection Fund pursuant to S") == "news"
    assert resort("result", "Analysts/Institutional Investor Meet/Con. Call Updates", "Transcript of Earnings Conference Call") == "document"
    assert resort("news", "Integrated Filing- Financial", "Revised Integrated Filing- Financial") == "result"


@pytest.mark.parametrize("kind,category,title,topic", [
    ("result", "Outcome of Board Meeting", "Financial results for the quarter", "results"),
    ("document", "Investor Presentation", "Q2 deck", "documents"),
    ("news", "Bagging/Receiving of orders/contracts", "Receiving of order.", "orders"),
    ("news", "General Updates", "Jupiter Wagons Limited secures repeat order worth over INR 128 crore from JSW (South) Rail Logistics", "orders"),
    ("news", "Updates", "Simca Advertising Limited has informed the Exchange regarding 'Securing Advertisement Rights Contract", "orders"),
    ("news", "Action(s) taken or orders passed", "Share India Securities Limited has informed the Exchange about Action(s) taken or orders passed", "legal"),
    ("news", "Scheme of Arrangement", "Raymond Limited has informed the Exchange about Order passed by Hon'ble NCLT", "deals"),
    ("news", "General Updates", "IndusInd Bank Limited has informed the Exchange about Grant of Stock Options under the Employee Stock Option Scheme", "capital"),
    ("news", "ESOP/ESOS/ESPS", "ICICI Bank Limited has informed the Exchange regarding Allotment of 37828 Shares.", "capital"),
    ("news", "General Updates", "E2E Networks Limited has informed the Exchange about incorporation of wholly owned subsidiary in State of Delaware", "deals"),
    ("news", "General Updates", "CARE Ratings Limited has informed the Exchange about incorporation of Joint Venture Company.", "deals"),
    ("news", "Resignation of Director/KMP/SMP", "Indo Count Industries Limited has informed the Exchange about Resignation of Director/KMP/SMP", "people"),
    ("news", "Change in Company Secretary/Compliance Officer", "appointment of Ms. Dimple Chauhan as Compliance Officer", "people"),
    ("news", "Credit Rating- Revision", "Punjab National Bank has informed the Exchange about Credit Rating- Revision", "rating"),
    ("news", "Spurt in Volume", SPURT, "legal"),
    ("news", "General Updates", "Transport Corporation of India Limited has informed the Exchange about cut-off date for Postal Ballot", "meetings"),
    ("news", "Outcome of Board Meeting", "GRM Overseas Limited has informed the Exchange regarding Outcome of Board Meeting held on November 20, 2026.", "meetings"),
    ("news", "Press Release", "Press Release: Arvind Limited has informed the Exchange regarding a press release titled \"Arvind Becomes First\"", "business"),
    ("news", "Updates", "Waaree Energies Limited has informed the Exchange regarding 'Execution of Power Purchase Agreement'", "business"),
    ("news", "Monitoring Agency Report", "Monitoring Agency Report for the quarter ended 30.09.2026", "compliance"),
    ("news", "General Updates", "Aksh Optifibre Limited has informed the Exchange about change in the Corporate Office of the Company s Registrar", "compliance"),
    ("news", "Disclosure under SEBI Takeover Regulations", "Disclosure under Regulation 31(1) and 31 (2)", "compliance"),
    ("news", "General Updates", "Deepak Nitrite Limited has informed the Exchange about General Updates", "other"),
])
def test_topic_of(kind, category, title, topic):
    assert topic_of(kind, category, title) == topic
    assert topic in TOPIC_KEYS


def test_rows_carry_the_topic_before_the_dedupe_key():
    a = [{"date": "2026-11-20", "category": "Bagging/Receiving of orders/contracts", "description": "Rossell Techsys Limited has informed the Exchange about Receiving of orders.",
          "link": "https://x.example/o.pdf"}]
    row = rows_from_announcements("ROSSTECH", "Rossell Techsys Ltd", a)[0]
    assert row[0] == "news" and row[4] == "Exchange filing" and row[11] == "orders" and len(row) == 13


class _Conn:
    def __init__(self, seen):
        self.seen = seen

    async def fetch(self, sql, *args):
        self.seen.append((sql, args))
        return [{"id": 9, "kind": "result", "title": "Financial results", "symbol": "GVPTECH", "company": "GVP Infotech Ltd", "source": "Exchange filing",
                 "link": None, "item_date": date(2026, 11, 20), "category": "Outcome of Board Meeting", "period": None, "summary": None, "auto": True, "topic": None}]


class _Pool:
    def __init__(self, seen):
        self.seen = seen

    def acquire(self):
        conn = _Conn(self.seen)

        class _Ctx:
            async def __aenter__(self):
                return conn

            async def __aexit__(self, *exc):
                return False
        return _Ctx()


@pytest.fixture()
def client():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from finlit.auth.routes import router
    app = FastAPI()
    app.include_router(router)
    seen: list = []
    app.state.store = SimpleNamespace(pool=_Pool(seen))
    c = TestClient(app)
    c.seen = seen
    c.fapp = app
    return c


def _path(client):
    return "/api/feed"


def test_feed_reads_news_and_results_filings_together(client):
    r = client.get(_path(client), params={"kind": "news,result", "filed": "true", "limit": 150})
    assert r.status_code == 200
    sql, args = client.seen[-1]
    assert "kind = ANY($1::text[])" in sql and args[0] == ["news", "result"]
    assert "(kind <> 'result' OR (auto AND source = $2))" in sql and args[1] == "Exchange filing"
    assert r.json()["items"][0]["topic"] == "results"   # a row stored before the topic column is filled still gets its topic


def test_feed_continues_after_the_last_item_and_filters_topics(client):
    r = client.get(_path(client), params={"kind": "news,result", "filed": "true", "topic": "orders,deals", "before": "2026-11-14", "before_id": 3384150, "limit": 60})
    assert r.status_code == 200
    sql, args = client.seen[-1]
    assert "topic = ANY($3::text[])" in sql and args[2] == ["orders", "deals"]
    assert "(item_date, id) < ($4, $5)" in sql and args[3] == date(2026, 11, 14) and args[4] == 3384150


def test_feed_refuses_unknown_kinds_and_topics(client):
    assert client.get(_path(client), params={"kind": "news,rumours"}).status_code == 422
    assert client.get(_path(client), params={"topic": "gossip"}).status_code == 400
    assert client.get(_path(client), params={"kind": "result"}).status_code == 200   # one kind still works as before


def test_nse_integrated_financial_filing_counts_as_a_results_declaration():
    from finlit.results import is_declaration
    assert is_declaration("Exchange filing", "Integrated Filing- Financial", "Integrated Filing - Financials")
    assert is_declaration("Exchange filing", "Outcome of Board Meeting", "Financial results for the quarter ended 30 September 2026")
    assert not is_declaration("Exchange filing", "Integrated Filing- Governance", "Integrated Filing - Governance")
    assert not is_declaration("Exchange filing", "Integrated Filing- Financial", "Clarification on the integrated filing")
    assert not is_declaration("FinEdge results calendar", "Results date", "board meeting for results")
