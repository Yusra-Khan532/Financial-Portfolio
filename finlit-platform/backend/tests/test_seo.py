"""Search readiness (seo.py and web.py): every address gets its own head and content, unknown addresses a real 404, private pages noindex, one sitemap from the database."""
import json
import re
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI

from finlit import seo
from finlit.web import mount_frontend

BASE = "https://finlitventures.com"
ROOT = Path(__file__).resolve().parents[2]
APP_TSX = (ROOT / "frontend" / "src" / "App.tsx").read_text()
INDEX = (ROOT / "frontend" / "index.html").read_text()


def test_every_public_page_has_a_distinct_title_and_description_of_a_good_length():
    titles, descs = {}, {}
    for p, pg in seo.PUBLIC.items():
        assert 30 <= len(pg.title) <= 70, (p, len(pg.title))
        assert 90 <= len(pg.description) <= 165, (p, len(pg.description))
        if p != "pricing":                                           # the same page as /plans
            assert pg.title not in titles and pg.description not in descs, p
            titles[pg.title], descs[pg.description] = p, p
        text = (pg.title + " " + pg.description + " " + pg.intro).lower()
        assert not re.search(r"\b(buy|sell|hold|avoid|accumulate|multibagger|top pick)\b", text), p
        assert pg.title.rstrip().endswith(("FinLit", "FinLit Ventures")) or "FinLit" in pg.title, p


def test_every_route_in_the_app_is_classified_so_none_is_a_soft_404_by_accident():
    paths = re.findall(r'<Route path="([^"]+)"', APP_TSX)
    assert len(paths) > 60
    for raw in paths:
        if raw == "*":
            continue
        p = raw.replace("/*", "")
        concrete = re.sub(r":[a-z]+", "x", p)
        assert seo.is_known(concrete) is not False, f"route {raw} is not known to seo.py: add it to PUBLIC, PRIVATE or PARAM_PREFIXES"


def test_unknown_addresses_are_not_known_and_params_need_a_real_parent():
    for bad in ("this-page-does-not-exist", "stocks", "stocks/a/b", "funds/x/y/z", "docs", "wp-admin"):
        assert seo.is_known(bad) is False, bad
    assert seo.is_known("stocks/TCS") is None and seo.is_known("glossary/roe") is None and seo.is_known("funds/123456") is None and seo.is_known("funds/some-name") is True and seo.is_known("sectors/it") is True


def test_the_head_has_one_of_each_tag_and_valid_json_ld():
    r = seo.render_static(BASE, "screener")
    page = seo.inject(INDEX, r)
    assert page.count("<title>") == 1 and page.count('name="description"') == 1 and page.count('rel="canonical"') == 1
    assert page.count('property="og:title"') == 1 and page.count('name="twitter:card"') == 1 and page.count('property="og:image"') == 1
    assert f'<link rel="canonical" href="{BASE}/screener">' in page and "max-image-preview:large" in page
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S)
    assert blocks and all(json.loads(b)["@context"] == "https://schema.org" for b in blocks)
    crumb = json.loads(blocks[0])
    assert crumb["@type"] == "BreadcrumbList" and [i["position"] for i in crumb["itemListElement"]] == [1, 2]
    home = seo.inject(INDEX, seo.render_static(BASE, ""))
    kinds = [json.loads(b)["@type"] for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', home, re.S)]
    assert kinds == ["Organization", "WebSite"]
    assert "<h1>Every listed Indian stock, scored and explained</h1>" in home


def test_company_and_term_pages_use_only_facts_we_hold():
    r = seo.render_company(BASE, "tcs", "Tata Consultancy Services Ltd", "Information Technology")
    assert "TCS" in r.title and "Share Analysis" in r.title and r.status == 200
    text = (r.head + r.body).lower()
    for word in ("aggregaterating", "\"review\"", "ratingvalue", " buy ", " sell ", "target price"):
        assert word not in text, word                             # no plan-gated score, no invented rating or review, no advice
    t = seo.render_term(BASE, "52-week-high-and-low")
    assert t and "DefinedTerm" in t.head and "canonical" in t.head and seo.render_term(BASE, "no-such-term") is None


def test_private_pages_are_noindex_and_have_no_canonical_or_social_tags():
    r = seo.render_private(BASE, "account/profile")
    assert "noindex, nofollow" in r.head and "canonical" not in r.head and "og:title" not in r.head and r.robots == "noindex"
    for p in ("dashboard", "console", "admin/login", "login", "holdings", "watchlist", "premium/report/TCS"):
        assert seo.is_private(p), p
    assert not seo.is_private("screener") and not seo.is_private("stocks/TCS")


def test_the_sitemap_lists_each_canonical_page_once_with_a_date():
    from datetime import date
    xml = seo.sitemap_xml(BASE, [("TCS", date(2026, 11, 9)), ("BAD SYMBOL!", None), ("TCS", None)], date(2026, 11, 10))
    locs = re.findall(r"<loc>(.*?)</loc>", xml)
    assert len(locs) == len(set(locs)) and f"{BASE}/stocks/TCS" in locs and f"{BASE}/pricing" not in locs and f"{BASE}/plans" in locs
    assert all("BAD" not in x for x in locs) and any("/glossary/" in x for x in locs) and xml.count("<lastmod>") == len(locs)
    assert f"{BASE}/account" not in locs and f"{BASE}/dashboard" not in locs


@pytest.fixture
def site(tmp_path):
    (tmp_path / "index.html").write_text(INDEX)
    app = FastAPI()

    class Conn:
        async def fetchrow(self, q, sym):
            if "mf_schemes" in q:
                import datetime as _d
                return {"name": "Example Banking and PSU Debt Fund", "amc": "Example Mutual Fund", "category": "Income/Debt Oriented Schemes - Banking and PSU Debt Fund", "plan": "Direct",
                        "option_class": "Growth", "nav": 107.4135, "nav_date": _d.date(2026, 11, 9), "active": sym == 119551, "r1y": 7.5, "r3y": None, "r5y": None}
            return {"name": "Tata Consultancy Services Ltd", "sector": "Information Technology"} if sym == "TCS" else None

        async def fetch(self, q, *a):
            if "mf_schemes" in q:
                return [{"code": 119551}]
            return [{"symbol": "TCS", "name": "Tata Consultancy Services Ltd", "sector": "Information Technology", "updated_at": None}, {"symbol": "3MINDIA", "name": "3M India Ltd", "sector": None, "updated_at": None}]

    class Acq:
        async def __aenter__(self):
            return Conn()

        async def __aexit__(self, *a):
            return False

    class Pool:
        def acquire(self):
            return Acq()

    class Redis:
        async def get(self, k):
            return None

        async def set(self, *a, **k):
            return True

    class S:
        public_site_url = BASE

    app.state.settings, app.state.store = S(), type("St", (), {"pool": Pool(), "redis": Redis()})()
    assert mount_frontend(app, tmp_path)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def test_the_server_answers_each_kind_of_address_correctly(site):
    seo._cache.clear()
    home = await site.get("/")
    assert home.status_code == 200 and "<h1>Every listed Indian stock" in home.text and home.headers.get("x-robots-tag") is None
    tcs = await site.get("/stocks/TCS")
    assert tcs.status_code == 200 and "Tata Consultancy Services Ltd (TCS)" in tcs.text and f'{BASE}/stocks/TCS' in tcs.text
    gone = await site.get("/stocks/NOSUCHCO")
    assert gone.status_code == 404 and "noindex" in gone.text and gone.headers["x-robots-tag"].startswith("noindex")
    assert (await site.get("/this-page-does-not-exist")).status_code == 404
    assert (await site.get("/glossary/52-week-high-and-low")).status_code == 200 and (await site.get("/glossary/not-a-term")).status_code == 404
    acct = await site.get("/account/profile")
    assert acct.status_code == 200 and acct.headers["x-robots-tag"].startswith("noindex") and 'content="noindex, nofollow"' in acct.text
    assert "default-src 'self'" in tcs.headers["content-security-policy"] and tcs.headers["cache-control"] == "no-cache"


async def test_the_sitemap_and_api_404(site):
    s = await site.get("/sitemap.xml")
    assert s.status_code == 200 and s.headers["content-type"].startswith("application/xml") and f"{BASE}/stocks/TCS" in s.text
    r = await site.get("/api/nothing")
    assert r.status_code == 404 and r.json() == {"status": "not_found"}


async def test_a_lookup_failure_serves_the_plain_app_instead_of_an_error(site):
    site._transport.app.state.store = None
    seo._cache.clear()
    r = await site.get("/stocks/TCS")
    assert r.status_code == 200 and 'id="root"' in r.text


async def test_head_requests_are_answered_like_get(site):
    """Audit tools probe with HEAD; a 405 there is scored as a broken server."""
    seo._cache.clear()
    for path in ("/", "/robots.txt", "/sitemap.xml", "/glossary"):
        assert (await site.head(path)).status_code in (200, 404), path


def test_static_pages_carry_real_text_and_many_links_without_scripts():
    """Audit tools that do not run scripts judge the page by this block: enough words, section headings and internal links."""
    import re
    for path in ("", "screener", "sip-calculator"):
        body = seo.render_static(BASE, path).body
        words = len(re.sub(r"<[^>]+>", " ", body).split())
        assert words >= 450 and body.count("<h2") >= 3 and body.count("<a ") >= 30, (path, words)
        hrefs = re.findall(r'href="(/[^"]*)"', body)
        assert all(h == "/" or seo.is_known(h.strip("/")) is not False for h in hrefs), [h for h in hrefs if seo.is_known(h.strip("/")) is False]


async def test_the_company_directory_lists_every_company_under_its_letter(site):
    seo._cache.clear()
    idx = await site.get("/companies")
    assert idx.status_code == 200 and '<a href="/companies/t">T (1)</a>' in idx.text and '/companies/0-9' in idx.text and "<h1>Listed Indian companies, A to Z</h1>" in idx.text
    t = await site.get("/companies/t")
    assert t.status_code == 200 and '<a href="/stocks/TCS">Tata Consultancy Services Ltd (TCS)</a>' in t.text and "Information Technology" in t.text
    assert f'<link rel="canonical" href="{BASE}/companies/t">' in t.text and "noindex" not in t.text.split("</head>")[0]
    assert "3M India Ltd" in (await site.get("/companies/0-9")).text
    empty = await site.get("/companies/q")
    assert empty.status_code == 200 and empty.headers.get("x-robots-tag") == "noindex, nofollow"      # a letter with no company: not offered to search engines
    assert (await site.get("/companies/zz")).status_code == 404
    assert (await site.get("/companies/t/x")).status_code == 404
    sm = (await site.get("/sitemap.xml")).text
    assert f"{BASE}/companies</loc>" in sm and f"{BASE}/companies/t</loc>" in sm and f"{BASE}/companies/q</loc>" not in sm


def test_every_link_text_and_address_is_used_once_and_the_heading_words_are_in_the_text():
    """Audit tools flag repeated link texts and a heading whose words the text never says."""
    import re
    for path in ("", "screener", "dcf", "companies"):
        body = seo.render_static(BASE, path).body
        links = re.findall(r'<a href="([^"]+)"[^>]*>(.*?)</a>', body)
        texts = [t.lower() for _, t in links]
        assert len(texts) == len(set(texts)), (path, [t for t in texts if texts.count(t) > 1])
        assert len({h for h, _ in links}) == len(links), path
        h1 = re.search(r"<h1>(.*?)</h1>", body).group(1)
        text = re.sub(r"<[^>]+>", " ", body.replace(f"<h1>{h1}</h1>", "")).lower()
        assert all(w.lower() in text for w in re.findall(r"[A-Za-z]{4,}", h1)), path
        assert body.count('rel="noopener"') >= 5          # official sources and share links


async def test_a_fund_page_has_its_own_head_and_facts_and_only_active_funds_are_offered(site):
    seo._cache.clear()
    r = await site.get("/funds/119551")
    assert r.status_code == 200 and "Example Banking and PSU Debt Fund NAV, Returns and Details | FinLit" in r.text and "Latest NAV Rs 107.4135 on 2026-11-09." in r.text
    assert f'<link rel="canonical" href="{BASE}/funds/119551">' in r.text and "1 year 7.50%" in r.text and '"@type": "InvestmentFund"' in r.text
    seo._cache.clear()
    gone = await site.get("/funds/42")                       # the stand-in database answers every code; an inactive scheme is kept out of search engines
    assert gone.status_code == 200 and gone.headers.get("x-robots-tag") == "noindex, nofollow"
    assert f"{BASE}/funds/119551</loc>" in (await site.get("/sitemap.xml")).text
