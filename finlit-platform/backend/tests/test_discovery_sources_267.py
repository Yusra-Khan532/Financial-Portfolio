"""Task #267: Discover reads earnings-call transcripts and results filings with Part 2 and Part 3 of the keyword directory (finlit/discovery/sources.py).
The directory's counts as the PDF states them, the matching (the presentations' engine: concepts, whole words, capital acronyms, 2 keywords or 5 mentions,
evidence = a keyword AND a figure), the nightly job (kept text read without the exchange, a file downloaded only when no text is kept, re-read only when
a newer one is filed, a failed read retried after a day, resumable), and the route (shape, open on every plan, reasons for every empty bucket).
Real Postgres and Redis; the exchange faked with httpx.MockTransport and real PDFs; the transcript is the synthetic one of earnings_fakes."""

import json
from datetime import date, timedelta

import httpx
import pytest

from earnings_fakes import PAGES, make_pdf
from finlit.discovery import keywords as K
from finlit.discovery import service as D
from finlit.discovery import sources as S
from finlit.earnings import transcripts as T
from test_integration import make_settings, store  # noqa: F401  (fixture)

CALLS = ["Call: Management Guidance & Outlook", "Call: Demand, Orders & Customers", "Call: Margins & Profitability", "Call: Capex, Capacity & Execution",
         "Call: Balance Sheet, Cash Flow & Capital Allocation", "Call: Risks, Headwinds & Cautionary Language", "Call: Strategy & Business Model Language",
         "Call: Analyst Q&A & Management Language Signals"]
RESULTS = ["Results: Income Statement Line Items", "Results: Standalone, Consolidated & Segments", "Results: Balance Sheet & Cash Flow Items",
           "Results: Auditor Report & Quality Flags", "Results: Regulatory Filings & Corporate Actions (SEBI LODR)",
           "Results: Press Release & Investor Highlights", "Results: Sector-Specific KPIs Reported in Filings"]
TODAY = date.today()


# ------------------------------------------------------------------------------------------------ the directory (sources.json, from the PDF)
def test_part_2_and_part_3_are_read_with_the_pdfs_own_counts():
    calls, results = S.SOURCE_JSON["calls"]["buckets"], S.SOURCE_JSON["results"]["buckets"]
    assert list(calls) == CALLS and list(results) == RESULTS                          # all 8 and all 7, in the PDF's order
    assert [len(v) for v in calls.values()] == [10, 12, 12, 12, 11, 12, 10, 8] and sum(map(len, calls.values())) == 87
    assert [len(v) for v in results.values()] == [18, 10, 14, 12, 21, 10, 16] and sum(map(len, results.values())) == 101
    assert 87 + 101 + 166 == 354                                                      # the PDF: 354 keywords in 36 buckets
    for part in (calls, results):
        for ks in part.values():
            for k in ks:
                assert len(k["related"]) >= 10 and k["verify"].endswith(".") and k["keyword"], k
    first = calls["Call: Management Guidance & Outlook"][0]
    assert first["keyword"] == "Forward guidance" and first["related"][:3] == ["Guidance for next year", "full-year outlook", "we expect"]
    assert first["verify"].startswith("Check whether guidance is numeric and time-bound")
    hosp = {k["keyword"]: k for k in results["Results: Sector-Specific KPIs Reported in Filings"]}
    assert "Hospitality and healthcare metrics" in hosp and "ALOS" in hosp["Hospitality and healthcare metrics"]["related"]   # a row over a page break
    assert hosp["Hospitality and healthcare metrics"]["verify"] == "Check occupancy trend and unit economics."
    # Part 1 (the presentations) is unchanged: 21 themes, 166 keywords with what to verify
    assert len(K.DIRECTORY) == 21 and sum(1 for cs in K.DIRECTORY.values() for c in cs if c["verify"]) == 166


def test_the_build_stops_unless_the_counts_match():
    import importlib.util
    from pathlib import Path
    spec = importlib.util.spec_from_file_location("bds", Path(__file__).resolve().parents[1] / "scripts" / "build_discovery_sources.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    good = {src: [{"name": b, "keywords": ks} for b, ks in S.SOURCE_JSON[src]["buckets"].items()] for src in ("calls", "results")}
    mod.check(good)
    short = json.loads(json.dumps(good))
    short["calls"][0]["keywords"].pop()
    with pytest.raises(SystemExit):
        mod.check(short)
    thin = json.loads(json.dumps(good))
    thin["results"][0]["keywords"][0]["related"] = thin["results"][0]["keywords"][0]["related"][:9]
    with pytest.raises(SystemExit):
        mod.check(thin)


def test_aliases_are_the_keywords_own_words_then_its_related_terms():
    assert S.aliases_of("Profit before tax (PBT)", ["pre-tax profit"]) == ["Profit before tax", "PBT", "pre-tax profit"]
    assert S.aliases_of("Debt-free / net cash position", ["Net cash", "net cash position"]) == ["Debt-free", "net cash position", "Net cash"]
    assert S.label_of("Call: Margins & Profitability") == "Margins & Profitability" and S.label_of("Results: Income Statement Line Items") == "Income Statement Line Items"


# ------------------------------------------------------------------------------------------------ the matching (the presentations' engine)
# the synthetic transcript of earnings_fakes, with one more page of a made-up company's call (nothing here is a real company's statement)
CALL_PAGES = PAGES + [["Rahul Mehta: Capex guidance for FY27 is Rs 1,200 crore, mostly growth capex for the new Dahej line.",
                       "The capacity addition of 50,000 tonnes is on schedule and commercial production starts in Q4.",
                       "Capacity utilisation reached 78% this quarter as the volume ramp continued.",
                       "We expect full-year revenue growth of 14% to 16%, and our forward guidance is unchanged."]]
TRANSCRIPT = "\n".join(" ".join(p) for p in CALL_PAGES)


def test_a_transcript_is_matched_with_evidence_sentences_that_hold_figures():
    r = S.read_text(TRANSCRIPT, "calls")
    assert r["status"] == "ok" and r["tone"]["label"]
    for b, v in r["buckets"].items():
        assert b in CALLS and (v["distinct"] >= 2 or v["total"] >= 5)               # 2 different keywords or 5 mentions
        assert len(v["evidence"]) <= 2 and len(v["verify"]) <= 2
        for s in v["evidence"]:
            assert K.NUM_RE.search(s)                                                 # every evidence sentence holds a figure ...
            assert any(S.LEX["calls"].patterns[(b, t)].search(s) for t in v["terms"])   # ... and names one of the bucket's keywords
        assert all(x in {c["verify"] for c in S.LEX["calls"].directory[b]} for x in v["verify"])
    capex = r["buckets"]["Call: Capex, Capacity & Execution"]
    assert any("1,200 crore" in s for s in capex["evidence"])


def test_a_keyword_without_a_figure_is_not_evidence():
    words = ("We remain debt-free and in a net cash position. Free cash flow was healthy and cash conversion improved. "
             "Working capital management stayed tight. ") * 2
    r = S.read_text(words + " Thank you all for joining the call today and for your questions.", "calls")
    b = r["buckets"]["Call: Balance Sheet, Cash Flow & Capital Allocation"]
    assert b["distinct"] >= 2 and b["evidence"] == [] and r["status"] == "keyword_only_no_figures"
    r2 = S.read_text(words + " Net cash stood at Rs 900 crore at the end of the quarter.", "calls")
    assert r2["buckets"]["Call: Balance Sheet, Cash Flow & Capital Allocation"]["evidence"] == ["Net cash stood at Rs 900 crore at the end of the quarter."]


def test_whole_words_plurals_capital_acronyms_and_ordinary_words():
    lex = S.LEX["results"]
    # "PAT" counts in capitals only, "pat" never; "Exceptional items" counts with a plural; "patent" never matches PAT
    got = S.analyse("PAT rose. A pat on the back. The patent was filed. Exceptional items were nil. Other exceptional items.", lex, min_distinct=1, min_total=1)
    terms = got["Results: Income Statement Line Items"]["terms"]
    assert terms == {"Profit after tax (PAT)": 1, "Exceptional items": 2}
    # an ordinary word of every filing ("revenue", "about", "FY") is in the directory but not matched alone
    assert S.analyse("revenue about FY revenue about FY revenue", lex, min_distinct=1, min_total=1) == {}
    assert S.analyse("Revenue from operations grew.", lex, min_distinct=1, min_total=1)["Results: Income Statement Line Items"]["terms"] == {
        "Revenue from operations": 1}


def test_the_trie_patterns_count_exactly_as_the_presentations_engine():
    """The call and results buckets hold 1,400 and more phrases: built as tries (fast), counted exactly as keywords.analyse with compile_buckets."""
    text = TRANSCRIPT + " Revenue from operations of Rs 4,820 crore; PBT of Rs 900 crore; other income Rs 40 crore; CRAR at 18.2%; GNPA 2.1%. " * 3
    for src in ("calls", "results"):
        lex = S.LEX[src]
        slow = K.analyse(text, lex.patterns, buckets=K.compile_buckets(lex.directory, S.TOO_BROAD))
        assert S.analyse(text, lex) == slow and slow


def test_a_rating_or_a_call_on_the_shares_is_never_quoted():
    r = S.read_text("We expect revenue growth of 15% for FY27 and full-year guidance stays. Brokerage One has a price target of Rs 900 and a buy rating "
                    "on our forward guidance of 15%. We are targeting 20% CAGR by FY30 under our strategic roadmap with a three-year plan.", "calls")
    ev = [s for v in r["buckets"].values() for s in v["evidence"]]
    assert ev and not any("price target" in s or "buy rating" in s for s in ev)


# ------------------------------------------------------------------------------------------------ the nightly job, real Postgres and Redis
RESULT_PAGES = [["Bharat Shield Limited. Statement of unaudited financial results for the quarter ended 30 September 2026.",
                 "Revenue from operations for the quarter was Rs 1,250 crore, up 22% year on year. Profit after tax was Rs 210 crore.",
                 "Other income was Rs 35 crore and exceptional items were nil. Earnings per share was Rs 12.4."],
                ["The statutory auditors have carried out a limited review of the results for the quarter ended 30 September 2026.",
                 "The order book stood at Rs 9,800 crore as on 30 September 2026. Highlights of the quarter: record revenue of Rs 1,250 crore."]]


def exchange(seen):
    def handler(req: httpx.Request):
        seen.append(req.url.path)
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        if "FAIL" in req.url.path:
            return httpx.Response(404)
        if "RESULT" in req.url.path:
            return httpx.Response(200, content=make_pdf(RESULT_PAGES))
        return httpx.Response(200, content=make_pdf(CALL_PAGES))
    return T.Fetcher(transport=httpx.MockTransport(handler), sleep=lambda _: _none(), pause=0, relay=None)


async def _none():
    return None


A = "https://nsearchives.nseindia.com/corporate/"


async def seed(st):
    async with st.pool.acquire() as conn:
        await conn.execute("TRUNCATE discovery_companies, discovery_signals, discovery_documents, document_pages, feed_items, earnings_calls RESTART IDENTITY CASCADE")
        rows = [
            # kind, symbol, category, title, link, days ago
            ("document", "ACME", "Analysts/Institutional Investor Meet/Con. Call Updates", "Acme Industries has informed the Exchange about Transcript of the earnings call",
             A + "ACME_T_new.pdf", 3),
            ("document", "ACME", "Analysts/Institutional Investor Meet/Con. Call Updates", "Transcript of the Q1 call", A + "ACME_T_old.pdf", 95),
            ("document", "ACME", "Analysts/Institutional Investor Meet/Con. Call Updates", "Intimation of concall schedule", A + "ACME_SCHED.pdf", 1),
            ("document", "EARNCO", "Analysts/Institutional Investor Meet/Con. Call Updates", "Transcript of earnings call", A + "EARNCO_T.pdf", 5),
            ("document", "FETCHCO", "Analysts/Institutional Investor Meet/Con. Call Updates", "Transcript of earnings call", A + "FETCHCO_T.pdf", 6),
            ("document", "OLDCO", "Analysts/Institutional Investor Meet/Con. Call Updates", "Transcript of earnings call", A + "OLDCO_T.pdf", 450),
            ("result", "BSHIELD", "Financial Results", "Bharat Shield has informed the Exchange about Financial Results for the quarter ended September 2026",
             A + "BSHIELD_RESULT.pdf", 2),
            ("result", "BSHIELD", "Financial Results", "Newspaper publication of financial results", A + "BSHIELD_NEWS.pdf", 1),
            ("result", "BADCO", "Financial Results", "Financial Results for the quarter", A + "BADCO_RESULT_FAIL.pdf", 4),
        ]
        for i, (kind, sym, cat, title, link, ago) in enumerate(rows):
            await conn.execute("INSERT INTO feed_items (kind, title, symbol, company, link, item_date, category, auto, dedupe) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)",
                               kind, title, sym, sym.title() + " Ltd", link, TODAY - timedelta(days=ago), cat, f"s{i}")
        # ACME's transcript text is kept already (the Concall Monitor); EARNCO's by the earnings-call job
        await conn.execute("INSERT INTO document_pages (link, symbol, kind, title, filed, pages) VALUES ($1, 'ACME', 'Call transcript', 't', $2, $3::jsonb)",
                           A + "ACME_T_new.pdf", TODAY - timedelta(days=3), json.dumps(["\n".join(p) for p in CALL_PAGES]))
        cid = await conn.fetchval("INSERT INTO earnings_calls (symbol, fiscal_year, quarter, transcript_url, status) VALUES ('EARNCO', 2027, 2, $1, 'text_ok') "
                                  "RETURNING id", A + "EARNCO_T.pdf")
        await conn.execute("INSERT INTO earnings_call_text (call_id, body) VALUES ($1, $2)", cid, "\f".join("\n".join(p) for p in CALL_PAGES))


async def test_the_documents_are_the_newest_transcript_and_results_filing_of_the_last_400_days(store):  # noqa: F811
    await seed(store)
    calls = {d["symbol"]: d["link"].rsplit("/", 1)[-1] for d in await S.pending(store, "calls")}
    assert calls == {"ACME": "ACME_T_new.pdf", "EARNCO": "EARNCO_T.pdf", "FETCHCO": "FETCHCO_T.pdf"}   # not the schedule letter, not 450 days old
    res = {d["symbol"]: d["link"].rsplit("/", 1)[-1] for d in await S.pending(store, "results")}
    assert res == {"BSHIELD": "BSHIELD_RESULT.pdf", "BADCO": "BADCO_RESULT_FAIL.pdf"}                 # not the newspaper copy


async def test_the_job_reads_kept_text_without_the_exchange_and_downloads_only_the_rest(store):  # noqa: F811
    await seed(store)
    seen = []
    res = await S.run(store, max_minutes=5, fetcher=exchange(seen))
    assert res["read"] == 5 and res["unreached"] == 0 and res["text"] == {"stored": 2, "fetched": 2}   # BADCO's file failed
    pdfs = [p.rsplit("/", 1)[-1] for p in seen if p.endswith(".pdf")]
    assert "ACME_T_new.pdf" not in pdfs and "EARNCO_T.pdf" not in pdfs                             # kept text: no request to the exchange
    assert sorted(set(pdfs)) == ["BADCO_RESULT_FAIL.pdf", "BSHIELD_RESULT.pdf", "FETCHCO_T.pdf"]
    async with store.pool.acquire() as conn:
        rows = {(r["symbol"], r["source"]): dict(r) for r in await conn.fetch("SELECT * FROM discovery_documents")}
        kept = {r["link"].rsplit("/", 1)[-1]: r["kind"] for r in await conn.fetch("SELECT link, kind FROM document_pages")}
    assert rows[("ACME", "calls")]["text_from"] == "stored" and rows[("EARNCO", "calls")]["text_from"] == "stored"
    assert rows[("FETCHCO", "calls")]["text_from"] == "fetched" and kept["FETCHCO_T.pdf"] == "Call transcript"     # downloaded text kept for FinLit AI
    assert kept["BSHIELD_RESULT.pdf"] == "Results filing"
    sh = rows[("BSHIELD", "results")]
    assert sh["status"] == "ok" and "Results: Income Statement Line Items" in sh["matched"]
    b = json.loads(sh["buckets"])["Results: Income Statement Line Items"]
    assert b["evidence"] and all(K.NUM_RE.search(s) for s in b["evidence"]) and b["verify"]
    assert rows[("BADCO", "results")]["status"] == "error" and res["errors"]
    # nothing is read twice; a failed read waits a day; a newer filing is read again
    assert await S.pending(store, "calls") == [] and await S.pending(store, "results") == []
    async with store.pool.acquire() as conn:
        await conn.execute("UPDATE discovery_documents SET read_at = now() - interval '25 hours' WHERE symbol = 'BADCO'")
        await conn.execute("INSERT INTO feed_items (kind, title, symbol, company, link, item_date, category, auto, dedupe) VALUES ('document', "
                           "'Transcript of the Q2 call', 'ACME', 'Acme Ltd', $1, $2, 'Analysts/Institutional Investor Meet/Con. Call Updates', true, 'q2')",
                           A + "ACME_T_q2.pdf", TODAY)
    assert [d["symbol"] for d in await S.pending(store, "calls")] == ["ACME"] and [d["symbol"] for d in await S.pending(store, "results")] == ["BADCO"]


async def test_without_downloads_left_the_run_still_reads_kept_text_and_says_what_is_left(store):  # noqa: F811
    await seed(store)
    seen = []
    f = exchange(seen)
    f.budget = 0                                                                         # the exchange budget is spent
    res = await S.run(store, max_minutes=5, fetcher=f)
    assert res["text"] == {"stored": 2, "fetched": 0} and res["read"] == 2 and res["unreached"] == 3 and seen == []


async def test_the_nightly_job_reads_calls_and_results_after_the_presentations_and_the_probe_continues(store):  # noqa: F811
    await seed(store)
    res = await D.run(store, fetcher=exchange([]))
    assert res["read"] == 0 and res["callsAndResults"]["read"] == 5 and res["sourcesUnreached"] == 0
    assert await D.has_work(store) is False
    await seed(store)
    res = await D.run(store, max_minutes=0, fetcher=exchange([]))                         # no minutes left: nothing read, the probe asks for more
    assert res["callsAndResults"]["read"] == 0 and res["sourcesUnreached"] == 5 and await D.has_work(store) is True
    from finlit.jobs.registry import build_jobs
    job = next(j for j in build_jobs({}) if j.name == "discovery")                        # the job's schedule and limits are the same as before
    assert job.args == ("refresh-discovery", "--max-minutes", "40", "--limit", "300") and job.max_runtime_min == 50 and job.resumable
    assert {w.window for w in job.windows} == {"NIGHT", "MORNING"} and job.max_attempts == 5


# ------------------------------------------------------------------------------------------------ the route
async def test_the_route_lists_buckets_then_one_bucket_then_one_company_open_on_every_plan(store):  # noqa: F811
    from finlit.api import create_app
    await seed(store)
    await S.run(store, max_minutes=5, fetcher=exchange([]))
    app = create_app(make_settings(), store=store)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:   # no sign-in: open on every plan
            r = await c.get("/api/discovery/sources", params={"source": "calls"})
            assert r.status_code == 200 and r.headers["cache-control"] == "public, max-age=600"
            d = r.json()
            assert [b["name"] for b in d["buckets"]] == CALLS and d["read"] == 3 and d["days"] == 400 and d["label"] == "Earnings calls"
            assert "not proof of material business exposure" in d["caution"] and d["method"]
            for b in d["buckets"]:
                assert {"name", "label", "keywords", "companies", "withEvidence", "verify", "reason", "preview"} <= set(b) and "list" not in b
                assert (b["reason"] is None) == (b["companies"] > 0)                       # every empty bucket says why
            capex = next(b for b in d["buckets"] if b["name"] == "Call: Capex, Capacity & Execution")
            assert capex["companies"] == 3 and capex["label"] == "Capex, Capacity & Execution" and capex["verify"]
            one = (await c.get("/api/discovery/sources", params={"source": "calls", "bucket": "Call: Capex, Capacity & Execution"})).json()
            lst = next(b for b in one["buckets"] if b["name"] == "Call: Capex, Capacity & Execution")["list"]
            e = lst[0]
            assert {"symbol", "company", "keywords", "evidence", "verify", "document", "tone", "score"} <= set(e)
            assert e["document"]["link"].startswith("https://nsearchives.nseindia.com/") and e["document"]["date"]
            assert all(K.NUM_RE.search(s) for s in e["evidence"]) and len(e["evidence"]) <= 2 and e["keywords"]
            res = (await c.get("/api/discovery/sources", params={"source": "results"})).json()
            assert [b["name"] for b in res["buckets"]] == RESULTS and res["statuses"] == {"ok": 1, "error": 1}
            empty = next(b for b in res["buckets"] if b["companies"] == 0)
            assert empty["reason"].startswith("None of the 1 results filings read names 2 of this bucket's keywords")
            co = (await c.get("/api/discovery/sources", params={"source": "results", "symbol": "bshield"})).json()
            assert co["status"] == "ok" and co["buckets"][0]["evidence"] and co["document"]["link"].endswith("BSHIELD_RESULT.pdf")
            none = (await c.get("/api/discovery/sources", params={"source": "calls", "symbol": "OLDCO"})).json()
            assert none["status"] == "none" and none["reason"] == "No call transcript filed with NSE in the last 400 days is held for this company."
            bad = (await c.get("/api/discovery/sources", params={"source": "results", "symbol": "BADCO"})).json()
            assert bad["buckets"] == [] and bad["reason"].startswith("The exchange did not give the file")
            assert (await c.get("/api/discovery/sources", params={"source": "calls", "bucket": "Tulips"})).status_code == 404
            assert (await c.get("/api/discovery/sources", params={"source": "news"})).status_code == 422
            assert (await c.get("/api/discovery/sources", params={"source": "calls", "symbol": "<x>"})).status_code == 400


async def test_before_any_read_every_bucket_says_why_it_is_empty(store):  # noqa: F811
    await seed(store)
    d = await S.overview(store, "results")
    assert all(b["companies"] == 0 and b["reason"].startswith("No results filing has been read yet") for b in d["buckets"])
    w = await S.company(store, "calls", "FETCHCO")
    assert w["status"] == "waiting" and "nightly job reads it" in w["reason"]


async def test_a_run_from_before_the_call_and_results_step_makes_the_probe_run_now(store):  # noqa: F811
    """Task #267 follow-up (21 Nov, live): the last run was recorded before the deploy that added calls and results, so its record had no
    sourcesUnreached and the probe said "up to date"; the new views stayed empty until the next window. Now that older record asks for a run."""
    import json as _json
    from finlit.discovery import signals as SG
    await store.redis.set(SG.VERSION_KEY, SG.TAG_VERSION)
    await store.redis.set(D.RUN_KEY, _json.dumps({"read": 3, "unreached": 0}))            # a presentations-only run (before #267)
    assert await D.has_work(store) is True
    await store.redis.set(D.RUN_KEY, _json.dumps({"read": 3, "unreached": 0, "sourcesUnreached": 0}))
    assert await D.has_work(store) is False                                               # a run with the step, nothing left: up to date
