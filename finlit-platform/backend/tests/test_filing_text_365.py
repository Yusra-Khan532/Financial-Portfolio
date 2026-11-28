"""Task #365 re-check (28 Nov 2026): every filing read "0.00 Neutral" because the model only saw the exchange's subject line. Unit tests: the lead of a
filing's PDF (boilerplate taken out), the exchange's longer description, the routine list, the text the model reads, the API shape, the monitoring
warning and the new job's registration."""
import zlib

from finlit import filing_text as F
from finlit import sentiment as S
from finlit.auth.routes import feed_json
from finlit.earnings.transcripts import extract_pages
from finlit.jobs.registry import build_jobs, limit_policy


def make_pdf(lines):
    """A one-page PDF with these lines of text (Helvetica), small enough to build in the test; pypdf reads it back."""
    def esc(t):
        return t.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    body = "BT /F1 10 Tf 40 800 Td 12 TL " + " ".join(f"({esc(x or chr(32))}) Tj T*" for x in lines) + " ET"   # a blank line as " ", as real filings give
    stream = zlib.compress(body.encode("latin-1"))
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
            b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(stream) + stream + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out, offs = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + b"".join(b"%010d 00000 n \n" % x for x in offs)
    return out + b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)


# A real letter's text layer (L&T, credit rating, 4 Sep 2026), as pypdf gives it: letterhead, addressee, salutation, subject, letter-spaced preamble,
# the news, a link, the closing and the signature.
LETTER = [
    "Larsen & Toubro Limited", "Secretarial Department", "L&T House, Ballard Estate", "Narottam Morarjee Marg", "Mumbai - 400 001, INDIA",
    "Tel: +91 22 6752 5656", "Fax: +91 22 6752 5858", "www.Larsentoubro.com", "Email: igrc@larsentoubro.com", "CIN : L99999MH1946PLC004768",
    "September 4, 2026", "", "To,", "The Listing Department", "BSE Limited", "Phiroze Jejeebhoy Towers,", "Dalal Street, Mumbai - 400 001", "STOCK CODE: 500510",
    "National Stock Exchange of India Limited", "Exchange Plaza, 5th Floor", "STOCK CODE: LT", "", "Dear Sirs/Madam,", "",
    "Sub: Disclosure under Regulation 30 of the SEBI (Listing Obligations and", "Disclosure Requirements) Regulations, 2015 (SEBI LODR) - Credit Ratings", "",
    "Ref: Our letter dated September 1, 2026", "",
    "P u r s u a n t  t o  R e g u l a t i o n  3 0  o f  S E B I  L O D R  r e a d  w i t h  M a s t e r  C i r c u l a r,",
    "we wish to inform that CRISIL Ratings Limited (CRISIL), on September 3, 2026 has assigned/reaffirmed Larsen",
    "& Toubro Limited's (L&T) Non-Convertible Debentures (NCDs) credit rating of 'CRISIL AAA' with a Stable Outlook.", "",
    "CRISIL has also reaffirmed the ratings of the Company's bank loan facilities and fixed deposits", "at 'CRISIL AAA/Stable' and its commercial paper rating at 'CRISIL A1+'.", "",
    "The link for the rating as published by CRISIL is as follows:", "https://www.crisil.com/mnt/winshare/Ratings/LarsenandToubroLi", "mited_September%2003_%202026_RR_404923.html", "",
    "Kindly take the same on record.", "", "Thanking You", "", "Yours faithfully,", "For Larsen & Toubro Limited", "", "Subramanian Narayan",
    "Company Secretary & Compliance Officer", "(ACS 16354)",
]


def test_the_lead_is_the_letters_news_without_its_letterhead_addresses_or_signature():
    lead = F.lead_of(["\n".join(LETTER)])
    assert lead.startswith("CRISIL Ratings Limited (CRISIL), on September 3, 2026 has assigned/reaffirmed")
    assert "Stable Outlook" in lead and "CRISIL A1+" in lead
    for gone in ("Ballard Estate", "400 001", "Tel", "CIN", "STOCK CODE", "Listing Department", "Dear Sir", "Sub:", "Ref:", "Regulation 30", "Pursuant",
                 "we wish to inform", "Kindly take", "Thanking", "faithfully", "Subramanian", "Company Secretary", "ACS", "crisil.com", "%20", "as follows"):
        assert gone.lower() not in lead.lower(), gone
    assert F.LEAD_MIN <= F.LEAD_MAX and len(lead) <= F.LEAD_MAX


def test_the_lead_is_read_from_a_real_pdf_file_and_the_subject_says_what_happened():
    pdf = make_pdf(["Registered Office: Larsen & Toubro Limited", "CIN: L99999MH1946PLC004768", "SEC/2026          November 25, 2026", "", "BSE Limited",
                    "Dalal Street,", "MUMBAI - 400 001", "", "Dear Sirs,", "", "Re : L&T Wins (Significant*) Order for Battery Energy", "Storage System in Gujarat", "",
                    "We enclose herewith a copy of Press Release that is being issued by the Company today, in connection with the above.", "",
                    "We request you to take note of the same.", "", "Thanking you,", "Yours faithfully,", "for LARSEN & TOUBRO LIMITED", "", "SUBRAMANIAN NARAYAN",
                    "COMPANY SECRETARY &", "COMPLIANCE OFFICER", "(ACS 16354)", "",
                    "L&T Wins (Significant*) Order for Battery Energy Storage System in Gujarat",
                    "Mumbai, November 25, 2026: Two L&T verticals have jointly won an order to develop a 300 MW / 900 MWh Battery",
                    "Energy Storage System (BESS) at Khavda in Gujarat."])
    pages = extract_pages(pdf, max_pages=F.PDF_PAGES)
    assert pages and "Khavda" in pages[0]
    lead = F.lead_of(pages)
    assert lead.startswith("L&T Wins (Significant*) Order for Battery Energy Storage System in Gujarat.")
    assert "jointly won an order" in lead and lead.count("L&T Wins") == 1          # the press release's headline repeats the subject: said once
    for gone in ("Registered Office", "Dalal", "enclose", "take note", "SUBRAMANIAN", "COMPLIANCE OFFICER", "Dear"):
        assert gone not in lead, gone


def test_a_scan_or_a_cover_page_gives_no_lead():
    assert F.lead_of([]) == "" and F.lead_of(["", ""]) == ""
    assert F.lead_of(["Larsen & Toubro Limited\nL&T House, Ballard Estate\nMumbai - 400 001, INDIA\nCIN: L99999MH1946PLC004768"]) == ""
    assert extract_pages(b"%PDF-1.4 not really a pdf") == []


def test_a_long_lead_is_cut_at_a_sentence_end():
    text = "Dear Sir,\n\n" + " ".join(f"Sentence number {i} says that the company did something worth noting today." for i in range(60))
    lead = F.lead_of([text])
    assert F.LEAD_MIN <= len(lead) <= F.LEAD_MAX and lead.endswith(".")


def test_the_exchanges_longer_description_is_kept_when_the_title_was_cut():
    long = ("This is further to the disclosure dated September 21, 2026 made by the Company. We wish to inform you that the Company executives participated in "
            "the Institutional Investors' Meeting - BofA Asia Pacific Conference 2026.")
    assert F.exchange_lead(long, "Updates: " + long[:140]) == long
    assert F.exchange_lead("Larsen & Toubro Limited has informed the Exchange about Credit Rating", "x") is None   # the title is the whole text
    assert F.exchange_lead(None, None) is None


def test_failed_files_are_tried_again_later_then_never_and_scans_never():
    assert F.retry_after("failed", 1).days == 3 and F.retry_after("failed", 2).days == 9 and F.retry_after("failed", 3).days == 27
    assert F.retry_after("failed", 4) is None
    assert F.retry_after("no_text", 1) is None and F.retry_after("ok", 1) is None and F.retry_after("too_large", 1) is None


# ------------------------------------------------------------------ routine filings
def test_routine_filings_are_named_from_the_categories_and_subjects_the_exchanges_use():
    R = S.routine_reason
    assert R("news", "ESOP/ESOS/ESPS", "ICICI Bank Limited has informed the Exchange regarding Allotment of 907815 Shares.") == "esop"
    assert R("news", "Allotment of Securities", "Larsen & Toubro Limited has informed the Exchange regarding allotment of 44116 securities pursuant to ESOP/ESPS") == "esop"
    assert R("news", "Updates", "Infosys Limited has informed the Exchange regarding 'Grant of Restricted Stock Units'.") == "esop"
    assert R("news", "Trading Window", "Closure of Trading Window") == "trading window"
    assert R("document", "Analysts/Institutional Investor Meet/Con. Call Updates", "State Bank Of India has informed the Exchange about Schedule of meet") == "meet schedule"
    assert R("document", "Analysts/Institutional Investor Meet/Con. Call Updates", "Interaction with Institutional Investors arranged by Motilal Oswal") == "meet schedule"
    assert R("news", "Certificate under SEBI (Depositories and Participants) Regulations, 2018", "x has informed the Exchange about Certificate under SEBI") == "reg 74(5) certificate"
    assert R("news", "Updates", "Certificate under Regulation 74(5) for the quarter") == "reg 74(5) certificate"
    assert R("news", "Loss of Share Certificates", "Intimation of loss of share certificates") == "loss of share certificate"
    assert R("document", "Copy of Newspaper Publication", "Newspaper publication") == "newspaper copy"
    assert R("news", "General Updates", "Publication of Newspaper Advertisements w.r.t Audited Financial Results") == "newspaper copy"
    assert R("news", "Updates", "Compliance Certificate under Regulation 40(9)") == "compliance certificate"


def test_news_is_never_routine():
    R = S.routine_reason
    for cat, title in (("Bagging/Receiving of orders/contracts", "Larsen & Toubro Limited has informed the Exchange about Bagging/Receiving of orders/contracts"),
                       ("Credit Rating", "Reliance Industries Limited has informed the Exchange about Credit Rating"),
                       ("Outcome of Board Meeting", "State Bank Of India has submitted to the Exchange, the financial results for the period ended September 30, 2026."),
                       ("Integrated Filing- Financial", "Financial results for the quarter"), ("Acquisition", "Acquisition of 51% stake in X Limited"),
                       ("Dividend", "Board recommended Final Dividend of 8 per equity share"), ("Appointment", "Appointment of Mr. A as CEO"),
                       ("Allotment of Securities", "allotment of 149200 Equity Shares kept in Abeyance"),
                       ("Analysts/Institutional Investor Meet/Con. Call Updates", "outcome of the investors meet"),
                       ("Analysts/Institutional Investor Meet/Con. Call Updates", "Transcript"),
                       ("Analysts/Institutional Investor Meet/Con. Call Updates", "Link of Recording"),
                       ("Statement of deviation(s) or variation(s) under Reg. 32", "statement of deviation"), ("Press Release", "L&T wins order")):
        assert R("news", cat, title) is None, (cat, title)


# ------------------------------------------------------------------ the text the model reads, and the API
def test_the_model_reads_the_subject_and_the_filings_own_words():
    t = S.scoring_text("Larsen & Toubro Limited has informed the Exchange about Credit Rating", None, "CRISIL has reaffirmed the AAA rating.")
    assert t == "Credit Rating. CRISIL has reaffirmed the AAA rating."
    long = "This is further to the disclosure dated September 21, 2026 made by the Company. We wish to inform you that the executives met investors today."
    assert S.scoring_text("Updates: " + long[:140], None, long) == long                      # the lead is the whole text the title was cut from
    assert S.scoring_text("Net loss widens", "Revenue fell 18%", "ignored lead") == "Net loss widens. Revenue fell 18%"   # an administrator's summary first
    assert S.scoring_text("Net loss widens") == "Net loss widens"


class Row(dict):
    def keys(self):
        return super().keys()


def test_the_api_gives_routine_filings_as_routine_and_never_a_made_up_zero():
    from datetime import date
    base = dict(id=1, kind="news", title="t", symbol="X", company="X", source="s", link=None, item_date=date(2026, 11, 24), category=None, period=None,
                summary=None, auto=True, topic="other")
    assert feed_json(Row(base, s_score=None, s_state="routine"))["sentiment"] == {"score": None, "band": "routine"}
    assert feed_json(Row(base, s_score=None, s_state="empty"))["sentiment"] is None
    assert feed_json(Row(base, s_score=0.42, s_state="read"))["sentiment"] == {"score": 0.42, "band": "positive"}
    neg0 = feed_json(Row(base, s_score=-0.001, s_state="read"))["sentiment"]
    assert neg0 == {"score": 0.0, "band": "neutral"} and str(neg0["score"]) == "0.0"          # never "-0.0"
    assert feed_json(Row(base, s_score=None, s_state=None))["sentiment"] is None              # not scored yet


# ------------------------------------------------------------------ monitoring
def test_the_job_warns_when_most_of_a_kind_reads_neutral():
    assert S.neutral_warning({"news": {"read": 100, "neutral": 60}, "document": {"read": 49, "neutral": 49}}) is None   # too few documents to judge
    w = S.neutral_warning({"news": {"read": 100, "neutral": 60}, "document": {"read": 70, "neutral": 70}, "result": {"read": 50, "neutral": 46}})
    assert w and "document 100% neutral of 70" in w and "result 92% neutral of 50" in w and "news" not in w
    assert S.neutral_warning({"news": {"read": 100, "neutral": 90}}) is None                  # 90% exactly is not more than 90%


def test_the_filing_text_job_is_registered_resumable_light_and_within_memory():
    jobs = {j.name: j for j in build_jobs({})}
    j = jobs["filing-text"]
    assert j.args[0] == "read-filings" and j.cls == "light" and j.resumable and limit_policy(j) == "resume" and j.weight_mb <= 200
    i = j.args.index("--max-minutes")
    assert float(j.args[i + 1]) < j.max_runtime_min and j.windows and j.interval_min and j.sla.hours == 30
    s = jobs["news-sentiment"]                                                                # unchanged: its schedule, limit and retries
    assert s.args == ("score-sentiment", "--max-minutes", "30", "--limit", "40000") and s.max_runtime_min == 40 and s.max_attempts == 5 and s.interval_min == 180
