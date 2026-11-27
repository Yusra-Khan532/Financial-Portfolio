"""Search growth M1 and M8 (docs/search-growth/PROGRESS.md): one clear identity in the home page's JSON-LD and the About page, the owner's facts of 27 Nov 2026
(founder Nishant Jain, founded December 2026, contact@finlitventures.com), and Claude's search crawlers under the same robots.txt rule as the other AI crawlers."""
import json
import re
from datetime import date
from pathlib import Path

from finlit import seo
from test_seo import BASE, INDEX

ROBOTS = (Path(__file__).resolve().parents[2] / "frontend" / "public" / "robots.txt").read_text()


def test_the_organization_says_what_finlit_is_the_same_way_everywhere():
    org, site = seo.organization(BASE, date(2026, 11, 27))
    assert org["name"] == "FinLit" and org["alternateName"] == "FinLit Ventures" and site["name"] == "FinLit" and site["alternateName"] == "FinLit Ventures"
    assert org["slogan"] == "Indian stock and mutual fund research platform" and org["description"].startswith("FinLit (finlitventures.com) is an Indian stock and mutual fund research platform.")
    assert org["areaServed"] == {"@type": "Country", "name": "India"} and org["founder"]["name"] == "Nishant Jain"
    assert org["contactPoint"]["email"] == "contact@finlitventures.com" and "gmail" not in json.dumps(org)
    assert org["sameAs"] == ["https://www.linkedin.com/company/finlitventures/"]          # other profiles only once their links are confirmed
    assert not re.search(r"\b(best|top pick|buy|sell|multibagger)\b", json.dumps(org).lower())


def test_the_founding_date_never_shows_before_the_owner_s_december_2026():
    assert "foundingDate" not in seo.organization(BASE, date(2026, 11, 30))[0]
    assert seo.organization(BASE, date(2026, 12, 1))[0]["foundingDate"] == "2026-12"
    page = seo.inject(INDEX, seo.render_static(BASE, ""))
    blocks = [json.loads(b) for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S)]
    assert [b["@type"] for b in blocks] == ["Organization", "WebSite"] and blocks[0]["alternateName"] == "FinLit Ventures"


def test_the_about_page_opens_with_what_finlit_is_for_readers_that_run_no_scripts():
    body = seo.render_static(BASE, "about").body
    first = re.search(r"<h1>.*?</h1><p>(.*?)</p>", body, re.S).group(1)
    assert "FinLit (finlitventures.com) is an Indian stock and mutual fund research platform." in first


def test_claude_s_search_crawlers_follow_the_same_rule_as_the_other_ai_crawlers():
    group = ROBOTS.split("User-agent: GPTBot", 1)[1].split("\n\n", 1)[0]
    agents = re.findall(r"^User-agent: (\S+)", "User-agent: GPTBot" + group, re.M)
    for bot in ("ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "OAI-SearchBot"):
        assert bot in agents, bot
    rules = re.findall(r"^(Allow|Disallow): (\S+)", group, re.M)
    assert ("Disallow", "/api/") in rules and ("Disallow", "/prism") in rules and ("Disallow", "/") not in rules   # public pages stay open to them
