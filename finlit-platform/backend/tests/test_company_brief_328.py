"""Task #328 (22 Nov 2026): why the company briefs were not being written, and the fixes.
- every annual-report download keeps its HTTP status, bytes, relay or direct; "download refused" is told apart from "file could not be read";
- one refused file no longer blocks the whole host for the night (three companies failed in the same 3 seconds on 14 Nov);
- the report is fetched from the stored announcements first, then the Console address, then the listing address; a "weblink" letter is followed;
- a given-up company is tried again weekly; the one-off reset of every failed_unreadable company (migration 134);
- the provider's quota words are kept in the run record, and the brief can have its own key;
- the page states the real reason in place of "Not written yet";
- a mix side with no figures needs no citation (LICI), and drafts held only by that rule are checked again without a model call.
Needs Postgres and Redis."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

from earnings_fakes import make_pdf
from finlit.company_brief import api as A
from finlit.company_brief import core as B
from finlit.company_brief import service as S
from finlit.earnings.provider import RateLimited, _quota_ids
from test_company_brief_job import AR_KEY, AR_PAGES, AR_URL, RES_PAGES, FakeLlm, brief_json, nosleep, row, run, seed
from test_integration import store  # noqa: F401  (fixture)

FEED_AR = "https://nsearchives.nseindia.com/annual_reports/ACME_2026.pdf"
SITE_AR = "https://www.acme-site.example/ar26.pdf"


def fetcher(handler, hosts=("www.acme.example.com",)):
    return S.BriefFetcher(extra_hosts=list(hosts), resolve=lambda h: ["93.184.216.34"], budget=80, transport=httpx.MockTransport(handler), sleep=nosleep, pause=0, relay=None)


def answer(paths):
    """A fake internet: path suffix -> Response or bytes; robots.txt 404; anything else 404."""
    seen = []

    def handler(req: httpx.Request):
        seen.append(str(req.url))
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        for suffix, resp in paths.items():
            if req.url.path.endswith(suffix):
                return resp() if callable(resp) else resp
        if req.url.path.endswith("Results.pdf"):
            return httpx.Response(200, content=make_pdf(RES_PAGES))
        return httpx.Response(404)
    return handler, seen


# ------------------------------------------------------------------------------------------------ 1. status and bytes, refused vs unreadable
async def test_each_download_keeps_its_status_bytes_and_outcome():
    handler, _ = answer({"/a.pdf": httpx.Response(403, content=b"denied"), "/b.pdf": httpx.Response(404), "/c.pdf": httpx.Response(200, content=b"<html>login</html>"),
                         "/d.pdf": httpx.Response(200, content=make_pdf([["hello"]]))})
    f = fetcher(handler)
    out = {}
    for name in "abcd":
        data, info = await f.fetch(f"https://nsearchives.nseindia.com/x/{name}.pdf")
        out[name] = (data is not None, info["outcome"], info["status"], info["bytes"], info["via"])
    assert out["a"] == (False, "refused", 403, 6, "direct")
    assert out["b"][1:3] == ("not_found", 404)
    assert out["c"][1:4] == ("not_pdf", 200, 18)
    assert out["d"][0] and out["d"][1] == "ok" and out["d"][3] > 100
    assert [t["outcome"] for t in f.trace] == ["refused", "not_found", "not_pdf", "ok"]
    await f.aclose()


async def test_one_refused_file_does_not_block_the_host_for_the_night_three_in_a_row_do():
    handler, seen = answer({"/r1.pdf": httpx.Response(403), "/ok.pdf": httpx.Response(200, content=make_pdf([["x"]])), "/r2.pdf": httpx.Response(403),
                            "/r3.pdf": httpx.Response(403), "/r4.pdf": httpx.Response(403)})
    f = fetcher(handler)
    h = "https://nsearchives.nseindia.com/annual_reports/"
    assert (await f.fetch(h + "r1.pdf"))[1]["outcome"] == "refused"
    assert (await f.fetch(h + "ok.pdf"))[1]["outcome"] == "ok"          # before #328 this file was never asked: the host was blocked after the first 403
    for n in ("r2", "r3", "r4", "r5"):                                  # three refusals in a row after the good file ...
        await f.fetch(h + n + ".pdf")
    assert [t["outcome"] for t in f.trace[-4:]] == ["refused", "refused", "refused", "blocked_host"]
    assert not any(u.endswith("r5.pdf") for u in seen)                  # ... then the host is left alone for the night
    await f.aclose()


def test_failure_state_splits_refused_downloads_from_unreadable_files():
    refused = [{"outcome": "refused", "detail": "nsearchives.nseindia.com answered HTTP 403 (0 bytes, relay)"}]
    st, why = S.failure_state(refused)
    assert st == "failed_download" and "HTTP 403" in why and "0 bytes" in why
    st, why = S.failure_state([*refused, {"outcome": "unreadable", "detail": "HTTP 200, 9000 bytes (direct): no readable text"}])
    assert st == "failed_unreadable" and "no readable text" in why


async def test_a_refused_report_is_recorded_as_a_failed_download_with_its_status(store):  # noqa: F811
    await seed(store)
    handler, _ = answer({"ar2026.pdf": httpx.Response(403)})
    out = await run(store, FakeLlm(), fetcher(handler))
    async with store.pool.acquire() as conn:
        s = await conn.fetchrow("SELECT last_state, last_reason, last_fetch, attempts FROM company_brief_sources WHERE symbol = 'ACME'")
    assert s["last_state"] == "failed_download" and "HTTP 403" in s["last_reason"] and s["attempts"] == 1
    tries = json.loads(s["last_fetch"])
    assert tries[0]["status"] == 403 and tries[0]["outcome"] == "refused"
    assert out.get("download_failed") == 1 and out.get("pdf_refused") == 1 and out.get("written", 0) == 0
    assert any(d["status"] == 403 and d["outcome"] == "refused" for d in out["downloads"])


async def test_a_pdf_without_text_is_recorded_as_unreadable(store):  # noqa: F811
    await seed(store)
    handler, _ = answer({"ar2026.pdf": httpx.Response(200, content=make_pdf([[" "], [" "], [" "], [" "], [" "]]))})
    await run(store, FakeLlm(), fetcher(handler))
    async with store.pool.acquire() as conn:
        s = await conn.fetchrow("SELECT last_state, last_reason FROM company_brief_sources WHERE symbol = 'ACME'")
    assert s["last_state"] == "failed_unreadable" and "no readable text" in s["last_reason"]


# ------------------------------------------------------------------------------------------------ 2. where the report comes from, in order
def test_candidates_order_stored_announcement_then_console_address_then_listing():
    src = {"annual_report_url": AR_URL, "ar_url": "https://nsearchives.nseindia.com/annual_reports/AR_1.pdf"}
    assert S.report_candidates({"url": FEED_AR}, src) == [FEED_AR, AR_URL, src["ar_url"]]
    assert S.report_candidates(None, {"ar_url": FEED_AR, "annual_report_url": None}) == [FEED_AR]
    assert S.report_candidates({"url": AR_URL}, src) == [AR_URL, src["ar_url"]]


async def test_a_refused_announcement_address_falls_back_to_the_console_address(store):  # noqa: F811
    await seed(store)                                               # the Console address AR_URL is set for ACME
    async with store.pool.acquire() as conn:
        await conn.execute("INSERT INTO feed_items (kind, title, symbol, company, link, item_date, category, auto, dedupe) VALUES ('document','Annual Report 2025-26','ACME','x',$1,'2026-08-01','Annual Report',true,'ar26')", FEED_AR)
    handler, seen = answer({"ACME_2026.pdf": httpx.Response(403), "ar2026.pdf": httpx.Response(200, content=make_pdf(AR_PAGES))})
    out = await run(store, FakeLlm(), fetcher(handler))
    assert out["written"] == 1
    tried = [u for u in seen if u.endswith(".pdf") and "Results" not in u]
    assert tried[0] == FEED_AR and tried[1] == AR_URL                  # the stored announcement first, then the Console address
    brief = json.loads((await row(store))["brief"])
    assert any(d["url"] == AR_URL for d in brief["docs"].values())       # the brief cites the address that was actually read


async def test_a_weblink_letter_is_followed_to_the_company_site(store):  # noqa: F811
    await seed(store, ar=False)
    async with store.pool.acquire() as conn:
        await conn.execute("INSERT INTO feed_items (kind, title, symbol, company, link, item_date, category, auto, dedupe) VALUES ('document','Intimation about weblink of Integrated Annual Report','ACME','x',$1,'2026-09-02','General Updates',true,'wl')", FEED_AR)
    letter = make_pdf([["Dear Sir, the Integrated Annual Report for FY 2025-26 is available at", SITE_AR, "Yours faithfully"]])
    handler, seen = answer({"ACME_2026.pdf": httpx.Response(200, content=letter), "ar26.pdf": httpx.Response(200, content=make_pdf(AR_PAGES))})
    key = B.doc_key("annual_report", None, set(), FEED_AR)
    out = await run(store, FakeLlm(lambda user: json.loads(json.dumps(brief_json()).replace(AR_KEY, key))), fetcher(handler, hosts=()))
    assert SITE_AR in seen and out.get("weblink_followed") == 1 and out["written"] == 1
    brief = json.loads((await row(store))["brief"])
    assert any(d["url"] == SITE_AR for d in brief["docs"].values())


def test_weblink_targets_take_only_written_https_pdf_addresses():
    assert S.weblink_targets(["Report at https://www.acme-site.example/ar26.pdf. Also see http://insecure.example/a.pdf and https://www.acme-site.example/"]) == [SITE_AR]
    assert S.weblink_targets(["no address here"]) == []


# ------------------------------------------------------------------------------------------------ 3. reset once, then weekly
def test_a_given_up_company_is_tried_again_after_a_week():
    now = datetime(2026, 11, 22, tzinfo=timezone.utc)
    src = {"last_state": "failed_download", "last_docs": "sig", "attempts": 3, "last_tried_at": now - timedelta(days=2)}
    assert S.blocked_by_attempts(src, "sig", now) == "gave_up"
    assert S.blocked_by_attempts({**src, "last_tried_at": now - timedelta(days=8)}, "sig", now) is None
    assert S.blocked_by_attempts({**src, "attempts": 1, "last_tried_at": now - timedelta(hours=2)}, "sig", now) == "waiting"


async def test_migration_134_resets_every_failed_unreadable_company_once(store):  # noqa: F811
    await seed(store, symbols=("ACME", "BETA", "GAMA"))
    async with store.pool.acquire() as conn:
        await conn.execute("INSERT INTO company_brief_sources (symbol, last_state, attempts, last_tried_at) VALUES ('BETA','failed_unreadable',3,now()), ('GAMA','failed_output',3,now()) "
                           "ON CONFLICT (symbol) DO UPDATE SET last_state = EXCLUDED.last_state, attempts = 3, last_tried_at = now()")
        await conn.execute("UPDATE company_brief_sources SET last_state = 'failed_unreadable', attempts = 3, last_tried_at = now() WHERE symbol = 'ACME'")
        sql = (Path(S.__file__).parents[1] / "migrations" / "134_company_brief_retry.sql").read_text()
        await conn.execute(sql)
        got = {r["symbol"]: (r["attempts"], r["last_tried_at"]) for r in await conn.fetch("SELECT symbol, attempts, last_tried_at FROM company_brief_sources")}
        assert await conn.fetchval("SELECT count(*) FROM information_schema.columns WHERE table_name = 'company_brief_sources' AND column_name = 'last_fetch'") == 1
    assert got["ACME"] == (0, None) and got["BETA"] == (0, None)
    assert got["GAMA"][0] == 3                                          # a writer failure is not reset: only the old, mislabelled download failures


# ------------------------------------------------------------------------------------------------ 4. quota
class QuotaLlm(FakeLlm):
    async def generate(self, system, user):
        self.requests += 1
        raise RateLimited(30, True, "quota: GenerateRequestsPerDayPerProjectPerModel-FreeTier")


async def test_a_daily_quota_stop_records_which_quota_and_the_calls_asked(store):  # noqa: F811
    await seed(store)
    out = await run(store, QuotaLlm(), env={"BRIEF_GEMINI_API_KEY": "own-key"})
    assert out["stopped"] == "quota" and out["llm_asked"] == 1 and out.get("llm_calls", 0) == 0 and out["llm_left_today"] == 0
    assert "PerDay" in out["quota_detail"] and out["key"].startswith("own")
    out2 = await run(store, FakeLlm(), env={})
    assert out2["key"].startswith("shared")


def test_quota_ids_are_read_from_the_providers_429():
    r = httpx.Response(429, text='{"error":{"details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"},{"quotaId":"X-PerMinute"}]}]}}')
    assert _quota_ids(r) == "quota: GenerateRequestsPerDayPerProjectPerModel-FreeTier, X-PerMinute"
    assert _quota_ids(httpx.Response(429, text="slow down")) == "rate limited"


def test_the_brief_key_of_its_own_is_used_when_set():
    import asyncio
    from test_integration import make_settings
    captured = {}

    class P:
        def __init__(self, key, model, **kw):
            captured["key"] = key
            self.model, self.configured = model, False

        async def aclose(self):
            pass

    async def go():
        orig = S.GeminiProvider
        S.GeminiProvider = P
        try:
            class St:
                class pool:
                    @staticmethod
                    def acquire():
                        raise RuntimeError("not reached")
            async def rec(store, report):
                captured["report"] = report
            orig_rec, S.record = S.record, rec
            try:
                await S.run(St(), make_settings(gemini_api_key="shared"), env={"BRIEF_GEMINI_API_KEY": "own"}, sleep=nosleep)
            finally:
                S.record = orig_rec
        finally:
            S.GeminiProvider = orig
    asyncio.run(go())
    assert captured["key"] == "own" and captured["report"]["status"] == "not_configured"


# ------------------------------------------------------------------------------------------------ 5. the page says the real state
@pytest.mark.parametrize("state,code,words", [("failed_download", "report_not_downloaded", "could not be downloaded"), ("failed_unreadable", "report_unread", "could not be read"),
                                              ("failed_checks", "writer_failed", "did not pass the citation checks"),
                                              ("failed_output", "writer_unreadable", "could not be read"), ("failed_writer", "writer_unavailable", "did not answer"),
                                              ("failed_cutoff", "writer_cut_off", "cut off"), ("failed_noparts", "writer_empty", "none of the brief's parts")])
def test_the_page_states_why_there_is_no_brief(state, code, words):
    v = A.public_view(None, {"last_state": state, "ar_url": FEED_AR}, "RELIANCE", "Reliance Industries Ltd")
    assert v["code"] == code and words in v["reason"] and "tried again" in v["reason"] and v["disclaimer"] == B.DISCLAIMER
    assert A.public_view(None, None, "X", None)["code"] == "not_written"
    for r in A.REASONS.values():
        assert not B.ADVICE.search(r)


# ------------------------------------------------------------------------------------------------ 6. LICI: a side with no figures
def test_a_mix_side_with_no_figures_needs_no_citation_a_side_with_figures_does():
    b = brief_json()
    b["docs"] = {AR_KEY: {}, "RES20261030": {}}
    b["mix"]["ebitda"] = {"rows": [], "cites": []}
    assert not [p for p in B.validate(b) if p.startswith("mix")]
    b["mix"]["ebitda"] = {"rows": [{"name": "Life", "value_cr": 0}], "cites": []}
    assert not [p for p in B.validate(b) if p.startswith("mix")]
    b["mix"]["ebitda"] = {"rows": [{"name": "Life", "value_cr": 120}], "cites": []}
    assert "mix.ebitda: no citation" in B.validate(b)


async def test_a_draft_held_only_by_the_old_rule_is_published_without_a_model_call(store):  # noqa: F811
    await seed(store, auto=True)
    async with store.pool.acquire() as conn:
        await conn.execute("UPDATE company_brief_settings SET value = 'off' WHERE key = 'auto_publish'")
        await conn.execute("INSERT INTO company_brief_settings (key, value) VALUES ('auto_publish', 'off') ON CONFLICT (key) DO UPDATE SET value = 'off'")
    reply = brief_json()
    reply["mix"]["ebitda"] = {"rows": [], "cites": []}
    await run(store, FakeLlm(reply))
    async with store.pool.acquire() as conn:
        await conn.execute("UPDATE company_briefs SET problems = '[\"mix.ebitda: no citation\"]'::jsonb WHERE symbol = 'ACME'")   # as stored before #328
        await conn.execute("UPDATE company_brief_settings SET value = 'on' WHERE key = 'auto_publish'")
    assert await S.recheck_drafts(store) == 1
    r = await row(store)
    assert r["status"] == "published" and json.loads(r["problems"]) == [] and r["publish_mode"] == "auto"
