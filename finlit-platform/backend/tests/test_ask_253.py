"""Task #253 (19 Nov 2026): "train FINLIT AI according to type of question based on below website give in pdf: so if question is for broader economy
then it should be trained separately; if its related to financials refer to finlit company page and moneycontrol and for daily news look
moneycontrol.com; and so on; refer to websites given in pdf" (FinLit_AI_Finance_Economics_Resources.pdf).

What must hold:
  1. The team's directory is FinLit AI's data: all 57 entries of its 7 sections, with the sector bodies tied to FinLit's sector families.
  2. Each question is read for its kind (English and Hinglish): economy, a company's financials, daily news, a term, valuation, rules, funds, a sector.
  3. Each kind is answered from its own sources: FinLit's own tools first (the company page for financials, the India economy page for the economy,
     News & filings for news), then the team's sites (Moneycontrol for financials and news, RBI and MOSPI for the economy ...).
  4. A question of one clear kind keeps the web search to that kind's sites; a mixed or unclear one searches openly.
  5. The note goes with the question, never into the cached system prompt; answers name the site and date of web figures; no advice words.
Claude is a scripted fake (no key, no cost)."""

from types import SimpleNamespace as NS
from typing import List

import pytest

from finlit.ask import knowledge as K, routing as R, service, tools as T


# ------------------------------------------------------------------------------------------------ 1. the directory
def test_the_directory_holds_every_site_of_the_teams_pdf():
    assert [c for c in K.DIRECTORY] == ["education", "india_markets", "company_financials", "economics", "valuation", "news", "sector"]
    counts = {k: len(v["sites"]) for k, v in K.DIRECTORY.items()}
    assert counts == {"education": 7, "india_markets": 9, "company_financials": 6, "economics": 8, "valuation": 7, "news": 7, "sector": 13}
    doms = K.all_domains()
    assert len(doms) == 57
    for d in ["investopedia.com", "sebi.gov.in", "rbi.org.in", "data.rbi.org.in", "mospi.gov.in", "amfiindia.com", "screener.in", "moneycontrol.com",
              "fred.stlouisfed.org", "pages.stern.nyu.edu", "livemint.com", "economictimes.indiatimes.com", "irdai.gov.in", "nasscom.in", "nabard.org"]:
        assert d in doms, d
    for s in (s for c in K.DIRECTORY.values() for s in c["sites"]):
        assert "://" not in s["domain"] and s["standing"] in {"primary", "education", "research", "secondary"} and s["useful"]


def test_the_how_to_use_order_regulators_and_statistics_first_platforms_and_news_secondary():
    st = {s["domain"]: s["standing"] for c in K.DIRECTORY.values() for s in c["sites"]}
    assert st["sebi.gov.in"] == st["rbi.org.in"] == st["mospi.gov.in"] == st["nseindia.com"] == "primary"
    assert st["moneycontrol.com"] == st["screener.in"] == st["livemint.com"] == "secondary"
    assert st["investopedia.com"] == "education"


def test_each_sector_body_belongs_to_a_finlit_sector_family():
    assert K.SECTOR_SOURCES["insurance"] == ["irdai.gov.in"] and K.SECTOR_SOURCES["pharma"] == ["cdsco.gov.in", "fda.gov"]
    assert K.SECTOR_SOURCES["energy_power"] == ["cea.nic.in", "iea.org"] and K.SECTOR_SOURCES["metals_chemicals"] == ["ibm.gov.in", "usgs.gov"]
    assert K.SECTOR_SOURCES["real_estate"] == ["rera.mohua.gov.in", "nhb.org.in"] and K.SECTOR_SOURCES["auto"] == ["siam.in", "acma.in"]
    assert K.SECTOR_SOURCES["it"] == ["nasscom.in"] and K.SECTOR_SOURCES["rural_agri"] == ["nabard.org"]
    assert set(K.SECTOR_SOURCES) - {"rural_agri"} <= set(K.SECTORS)
    sector_doms = {s["domain"] for s in K.DIRECTORY["sector"]["sites"]}
    assert {d for ds in K.SECTOR_SOURCES.values() for d in ds} == sector_doms         # every sector body is used


def test_the_knowledge_base_structure_and_the_data_use_note_are_kept():
    assert [t for t, _ in K.KB_STRUCTURE] == ["Finance concepts", "Fundamental analysis", "Valuation", "Economics", "Sector intelligence", "Corporate intelligence"]
    assert "stores none of their content" in K.DATA_USE


# ------------------------------------------------------------------------------------------------ 2. what kind of question
@pytest.mark.parametrize("q,named,page,kinds", [
    ("aaj market kyu gira", False, False, ["news"]),
    ("Why did Infosys fall today?", True, False, ["company", "news"]),
    ("What happened to Adani shares this week?", True, False, ["company", "news"]),
    ("latest news on HDFC Bank", True, False, ["company", "news"]),
    ("repo rate kya hai", False, False, ["economy"]),
    ("What is the GDP growth rate of India?", False, False, ["economy"]),
    ("inflation kitni hai abhi CPI", False, False, ["economy", "news"]),
    ("How will the RBI policy affect bond yields?", False, False, ["economy"]),
    ("rupee vs dollar outlook", False, False, ["economy"]),
    ("TCS ka profit", True, False, ["company", "financials"]),
    ("Reliance Q2 results", True, False, ["company", "financials"]),
    ("What is the debt of the company?", False, True, ["company", "financials"]),
    ("ROE of HDFC Bank over five years", True, False, ["company", "financials"]),
    ("What is ROCE?", False, False, ["concept"]),
    ("Explain P/E ratio", False, False, ["concept"]),
    ("ebitda ka matlab kya hai", False, False, ["concept"]),
    ("What is the difference between EBIT and EBITDA?", False, False, ["concept"]),
    ("What is DCF?", False, False, ["valuation"]),
    ("Damodaran equity risk premium India", False, False, ["valuation"]),
    ("Is the Nifty P/E high against its history?", False, False, ["valuation"]),
    ("SEBI circular on F&O rules", False, False, ["regulation"]),
    ("new SEBI insider trading norms", False, False, ["regulation"]),
    ("SIP kya hai", False, False, ["funds"]),
    ("What is the NAV of Parag Parikh Flexi Cap?", False, False, ["funds"]),
    ("expense ratio of index funds", False, False, ["funds"]),
    ("auto sales in October", False, False, ["sector:auto"]),
    ("IT sector hiring outlook", False, False, ["sector:it"]),
    ("monsoon impact on rural demand", False, False, ["sector:rural_agri"]),
    ("insurance penetration in India irdai data", False, False, ["sector:insurance"]),
    ("Hello", False, False, []),
])
def test_each_question_is_read_for_its_kind(q, named, page, kinds):
    assert R.classify(q, named_company=named, on_company_page=page) == kinds


def test_a_word_inside_another_never_names_a_sector():
    assert R.classify("Is it a good automatic process?") == []                  # "it" the pronoun, "automatic": no IT, no auto


# ------------------------------------------------------------------------------------------------ 3. where each kind is answered from (the team's words first)
def test_financials_read_the_finlit_company_page_first_then_moneycontrol():
    r = R.ROUTES["financials"]
    assert r["finlit"][0] == "get_company_card" and "get_company_section" in r["finlit"] and "get_finlit_prism" in r["finlit"]
    assert r["sites"][0] == "moneycontrol.com" and {"screener.in", "tickertape.in", "trendlyne.com", "nseindia.com", "bseindia.com"} <= set(r["sites"])


def test_daily_news_reads_finlits_news_first_then_moneycontrol():
    r = R.ROUTES["news"]
    assert r["finlit"] == ["get_news_and_filings"] and r["sites"][0] == "moneycontrol.com"
    assert {"livemint.com", "economictimes.indiatimes.com", "business-standard.com", "reuters.com", "cnbc.com"} <= set(r["sites"])


def test_the_economy_is_answered_separately_from_finlits_economy_page_then_rbi_and_mospi():
    r = R.ROUTES["economy"]
    assert r["finlit"] == ["get_india_economy"]
    assert r["sites"][:4] == ["rbi.org.in", "data.rbi.org.in", "mospi.gov.in", "dea.gov.in"]
    assert {"imf.org", "data.worldbank.org", "fred.stlouisfed.org", "oecd.org", "bis.org"} <= set(r["sites"])
    assert not set(r["sites"]) & set(R.ROUTES["financials"]["sites"])         # kept apart from the company sources


def test_the_other_kinds_name_their_finlit_tools_and_sites():
    assert R.ROUTES["concept"]["finlit"][0] == "lookup_glossary" and R.ROUTES["concept"]["sites"][0] == "investopedia.com"
    assert R.ROUTES["valuation"]["sites"][0] == "pages.stern.nyu.edu"
    assert R.ROUTES["regulation"]["sites"][:2] == ["sebi.gov.in", "rbi.org.in"]
    assert R.ROUTES["funds"]["finlit"][0] == "search_funds" and R.ROUTES["funds"]["sites"][0] == "amfiindia.com"
    tool_names = {t.name for t in T.TOOLS}
    for k, r in R.ROUTES.items():
        assert set(r["finlit"]) <= tool_names, k                               # every tool named is a real FinLit tool
        assert set(r["sites"]) <= set(K.all_domains()) | {"investor.sebi.gov.in"}, k


def test_the_note_names_finlits_tools_first_and_the_sites_and_asks_for_site_and_date():
    n = R.note(["financials"])
    assert n.startswith("[Sources for this question") and "a company's financials: FinLit first (get_company_card, get_company_section, get_finlit_prism)" in n
    assert "then on the web prefer Moneycontrol (moneycontrol.com)" in n and "The web search keeps to these sites." in n
    assert "Name the site and the date of every figure taken from the web." in n
    e = R.note(["economy"])
    assert "the economy: FinLit first (get_india_economy)" in e and "Reserve Bank of India (RBI) (rbi.org.in)" in e
    m = R.note(["economy", "news"])
    assert "the economy:" in m and "daily news:" in m and "keeps to these sites" not in m        # mixed: both routes, open search
    s = R.note(["sector:auto"])
    assert "automobiles: FinLit first (get_finance_framework)" in s and "Society of Indian Automobile Manufacturers (SIAM) (siam.in)" in s
    assert R.note([]) == ""


# ------------------------------------------------------------------------------------------------ 4. the web search keeps to one kind's sites
def test_one_kind_limits_the_web_search_and_a_mix_or_none_keeps_it_open():
    assert R.web_domains(["news"]) == R.ROUTES["news"]["sites"]
    assert R.web_domains(["sector:it"]) == ["nasscom.in", "business-standard.com", "economictimes.indiatimes.com", "livemint.com"]
    assert R.web_domains(["economy", "news"]) is None and R.web_domains([]) is None


def test_the_tool_list_keeps_its_order_and_only_the_web_entry_changes():
    open_, econ = T.definitions(), T.definitions(R.web_domains(["economy"]))
    assert [d["name"] for d in open_] == [d["name"] for d in econ] and open_[-1]["name"] == "web_search"
    assert open_[:-1] == econ[:-1]                                              # FinLit's tools: the same text, so their cache stays
    assert "allowed_domains" not in open_[-1] and econ[-1]["allowed_domains"][0] == "rbi.org.in"
    assert econ[-1]["max_uses"] == 2 and econ[-1]["user_location"]["country"] == "IN"


# ------------------------------------------------------------------------------------------------ 5. the note with the question; the scripted answer
class Stream:
    def __init__(self, turn):
        self.turn = turn

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    def __aiter__(self):
        async def gen():
            for t in self.turn.get("text", []):
                yield NS(type="text", text=t)
        return gen()

    async def get_final_message(self):
        return NS(content=[NS(type="text", text="".join(self.turn.get("text", [])))], stop_reason="end_turn",
                  usage=NS(input_tokens=1, output_tokens=1, cache_read_input_tokens=0, cache_creation_input_tokens=0))


class Client:
    def __init__(self, turns):
        self.turns, self.calls = list(turns), []
        self.messages = self

    def stream(self, **params):
        self.calls.append(params)
        return Stream(self.turns.pop(0))


async def test_the_note_goes_with_the_question_and_the_search_keeps_to_the_kinds_sites():
    q = "repo rate kya hai"
    kinds = R.classify(q)
    msgs = service.build_messages([], q, None, "silver", None, R.note(kinds))
    client = Client([{"text": ["The repo rate is 5.50% (RBI, 1 Oct 2026)."]}])
    events: List[tuple] = []

    async def emit(e, d):
        events.append((e, d))
    res = await service.answer(client, "m", NS(), msgs, emit, None, R.web_domains(kinds))
    sent = client.calls[0]
    user = sent["messages"][-1]["content"]
    assert "the economy: FinLit first (get_india_economy)" in user and user.endswith("repo rate kya hai")
    assert sent["tools"][-1]["allowed_domains"][:2] == ["rbi.org.in", "data.rbi.org.in"]
    assert "Sources for this question" not in sent["system"][0]["text"]           # never in the cached system prompt
    assert res["text"].startswith("The repo rate")


async def test_a_mixed_question_searches_openly():
    q = "inflation news today"
    msgs = service.build_messages([], q, None, "gold", None, R.note(R.classify(q)))
    client = Client([{"text": ["..."]}])

    async def emit(e, d):
        return None
    await service.answer(client, "m", NS(), msgs, emit, None, R.web_domains(R.classify(q)))
    assert "allowed_domains" not in client.calls[0]["tools"][-1]


def test_the_instructions_ask_for_the_site_and_date_of_web_figures_and_the_framework_lists_sources_by_kind():
    assert "Say which site a web figure came from, with its date" in service.SYSTEM
    assert "By kind of question (the team's source directory)" in service.SYSTEM
    d = K.framework()
    assert d["sourcesByType"]["financials"]["finlitFirst"][0] == "get_company_card" and d["sourcesByType"]["financials"]["web"][0] == "Moneycontrol"
    assert d["sources"]["primary"][0].startswith("NSE")                          # the older list is kept


def test_none_of_the_new_text_advises():
    import inspect
    text = inspect.getsource(R) + R.note(list(R.ROUTES)) + K.DATA_USE + str(K.DIRECTORY) + str(K.KB_STRUCTURE)
    assert not service.reads_like_advice(text)
    for w in ("buy ", "sell ", "target price", "multibagger", "top pick"):
        assert w not in text.lower(), w
