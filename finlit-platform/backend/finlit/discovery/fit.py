"""Task #296 (the 21 Nov Discover filters pack, "Content notes"): what the calls and results bucket lists quote and say must fit the company.

1. A quote loses the PDF's page header or footer that the text layer ran into it ("... Suzlon Energy Limited October 29, 2026 Page 3 of 18 ...").
2. A sentence that is mostly an address or contact line (Tel, Email, Website, CIN, Registered Office) is never quoted.
3. In Management Guidance & Outlook, a sentence about the effective tax rate is not guidance on the business, so it is not quoted there.
4. Sector-Specific KPIs: each sector's KPI keyword counts only for companies in the NSE macro sectors it belongs to (a lender is not matched to
   "Pharma and chemicals metrics"); a company whose remaining keywords no longer make the bucket's rule (2 different keywords, or 5 mentions) leaves it.
5. "What to verify" lines written for order-book businesses (L1 status, bid-to-win, order book cover) are shown only for companies in the macro sectors
   that run on orders.
A company whose NSE classification is not held keeps everything: nothing says it does not fit. Applied when the lists are served, so documents read
before this change are corrected too, and when a document is read, so the job picks the next good sentence instead. Describes; never a pick."""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Pattern, Tuple

_MONTH = r"(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?"
# "<Company> Limited October 29, 2026 Page 3 of 18" or "<Company> Ltd 29 October 2026 Page 3 of 18", then a bare "Page 3 of 18"
_HEADER = re.compile(r"\s*(?:[A-Z][\w&.'()-]*\s+){0,8}(?:Limited|Ltd\.?)\s+(?:" + _MONTH + r"\s+\d{1,2},?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+" + _MONTH
                     + r",?\s+\d{4})\s+Page\s+\d{1,4}\s+of\s+\d{1,4}\b\s*")
_PAGE = re.compile(r"\s*\bPage\s+\d{1,4}\s+(?:of|/)\s+\d{1,4}\b\s*", re.I)
_CIN = re.compile(r"\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b")
_CONTACT = re.compile(r"\b(?:Tel|Telephone|Ph|Phone|Fax|E-?mail|Email\s+id|Website|Web|CIN|Regd\.?\s+Office|Registered\s+Office|Corporate\s+Office|Pin\s*code)\b"
                      r"\s*[:.]?|www\.|\S+@\S+\.\w+|\+91[\s-]?\d", re.I)
_TAX = re.compile(r"\b(?:effective\s+tax\s+rate|tax\s+rate|ETR)\b", re.I)
GUIDANCE = "Call: Management Guidance & Outlook"
KPI_BUCKET = "Results: Sector-Specific KPIs Reported in Filings"

# The NSE macro sectors (company_classification.macro_sector, 12) in which each sector KPI keyword of the results directory is read.
FIN = ("Financial Services",)
KPI_SECTORS: Dict[str, Tuple[str, ...]] = {
    "Banking and NBFC asset quality": FIN, "Net interest margin and spreads": FIN, "Deposits, CASA and credit growth": FIN, "AUM and disbursements": FIN,
    "Capital adequacy": FIN, "Insurance and AMC metrics": FIN,
    "IT services metrics": ("Information Technology",),
    "Telecom and digital metrics": ("Telecommunication",),
    "Retail and consumer metrics": ("Consumer Discretionary", "Fast Moving Consumer Goods"),
    "Real estate metrics": ("Consumer Discretionary", "Industrials", "Diversified"),
    "Hospitality and healthcare metrics": ("Consumer Discretionary", "Healthcare", "Services"),
    "Power, utilities and renewables metrics": ("Utilities", "Energy", "Industrials"),
    "Infrastructure and EPC metrics": ("Industrials", "Utilities", "Energy"),
    "Pharma and chemicals metrics": ("Healthcare", "Commodities"),
    "Auto and auto-ancillary metrics": ("Consumer Discretionary", "Industrials"),
    "Metals and commodities metrics": ("Commodities", "Energy"),
}
ORDER_BOOK_SECTORS = ("Industrials", "Utilities", "Energy")
_ORDER_BOOK_LINE = re.compile(r"\bL1\b|bid-to-win|order book", re.I)


def clean_quote(s: str) -> str:
    """The sentence without a page header or footer the PDF's text layer ran into it."""
    out = _PAGE.sub(" ", _HEADER.sub(" ", s))
    return " ".join(out.split())


def quotable(s: str, bucket: str) -> bool:
    """False for an address or contact line, and for a tax-rate sentence in Management Guidance."""
    if _CIN.search(s) or len(_CONTACT.findall(s)) >= 2:
        return False
    if bucket == GUIDANCE and _TAX.search(s):
        return False
    return True


def quotes(sents: Iterable[str], bucket: str) -> List[str]:
    out: List[str] = []
    for s in sents:
        c = clean_quote(s)
        if len(c) >= 20 and quotable(c, bucket) and c not in out:
            out.append(c)
    return out


def kpi_fits(keyword: str, macro: Optional[str]) -> bool:
    secs = KPI_SECTORS.get(keyword)
    return not macro or not secs or macro in secs


def verify_fits(line: str, macro: Optional[str]) -> bool:
    return not macro or not _ORDER_BOOK_LINE.search(line) or macro in ORDER_BOOK_SECTORS


def fit_entry(bucket: str, b: Dict[str, Any], macro: Optional[str], patterns: Dict[Tuple[str, str], Pattern[str]], min_distinct: int, min_total: int,
              max_evidence: int) -> Optional[Dict[str, Any]]:
    """A stored bucket read of one company, made to fit it: the quotes cleaned, the out-of-sector KPI keywords and their quotes taken off (its counts
    and score worked out again, as sources.analyse does), the order-book checks kept for order businesses. None when the company no longer makes the
    bucket's rule."""
    out = dict(b)
    terms: Dict[str, int] = dict(b.get("terms") or {})
    ev = list(b.get("evidence") or [])
    if bucket == KPI_BUCKET and macro:
        gone = {k: n for k, n in terms.items() if not kpi_fits(k, macro)}
        if gone:
            terms = {k: n for k, n in terms.items() if k not in gone}
            distinct = max(len(terms), int(b.get("distinct") or 0) - len(gone))
            total = max(sum(terms.values()), int(b.get("total") or 0) - sum(gone.values()))
            if not terms or (distinct < min_distinct and total < min_total):
                return None
            keep = [patterns[(bucket, k)] for k in terms if (bucket, k) in patterns]
            ev = [s for s in ev if any(p.search(s) for p in keep)]
            out.update(terms=terms, distinct=distinct, total=total, score=round(distinct * 2 + min(total, 20) * 0.5, 2))
    out["evidence"] = quotes(ev, bucket)[:max_evidence]
    out["verify"] = [v for v in (b.get("verify") or []) if verify_fits(v, macro)]
    return out
