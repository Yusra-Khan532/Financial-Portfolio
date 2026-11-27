"""Fund houses whose full monthly holdings are printed in their monthly factsheet PDF (task #281, round 4a): a reader for that layout.

HDFC Mutual Fund publishes no portfolio file that FinLit may read: www.hdfcfund.com answers scripted requests with 403 'Access Denied', and its
portfolio service answers only requests that carry hdfcfund.com as their Origin. The owner's rule is that no adapter spoofs a header or goes around a
challenge. Its monthly factsheet (files.hdfcfund.com) prints every scheme's full portfolio (each holding with its industry or rating and its percent of
net assets, section totals and the Grand Total), but on 20 Nov 2026 that file store also answered the job's own agent with 403 'Access Denied'.
So the HDFC adapter below is defined and tested but NOT in ADAPTERS: switching it on is the owner's decision (docs/NEXT-STEPS-FUNDS.md), and it
then also needs pdfplumber (MIT) in requirements.txt: the reader works from each character's position and font, which pypdf does not give per
character. The tests feed read_pages() the pages' characters directly, so nothing installs it until then. Read from the
September 2026 factsheet, all 53 HDFC scheme portfolios in it parse and add up to their own Grand Totals. The factsheet has no ISINs, and it comes out
two to three weeks after the month end (the portfolio files come out within ten days).

The reader works from the characters' positions (pdfplumber): every block of a portfolio sits under a bold header 'Company/Instrument | Industry+
/Rating | % to NAV', so the three columns are taken from that header on each page; a percent ends a row (it sits on the row's last line, after names
and industries that wrap); bold lines are section headings; a scheme that runs over a page goes on under the same title with '....Contd from previous
page'. Every portfolio is then checked like a workbook one: its rows must add up to its own Grand Total."""
from __future__ import annotations

import re
from collections import OrderedDict
from datetime import date
from itertools import groupby
from typing import Dict, List, Optional, Tuple

import httpx

from .amcs import Adapter, FileRef, _eom
from .model import Holding, Portfolio
from .sebi import _SUBHEAD, CASH_NAME, GRAND_ROW, TOTAL_ROW, heading_class

HEADER_WORDS = re.compile(r"^\W*(company|instrument|/?\s*rating|industry|\(?hedged|unhedged|% to|nav\b)", re.I)
# bold lines that end a portfolio column: the boxes printed under or beside it (performance tables, SIP returns, allocation charts, riskometers)
NOT_PORTFOLIO = re.compile(r"performance|\bsip\b|returns?\b|riskometer|risk-o-meter|allocation|classification|top\s+ten|benchmark|potential\s+risk|"
                           r"\bperiod\b|scheme\s+returns|value\s+of|investment\s+objective|fund\s+manager|minimum\s+application|load\s+structure", re.I)
NAME_HEAD = re.compile(r"^(company|instrument|issuer|security|name\s+of)", re.I)
HEAD_TOKEN = re.compile(r"^(company/?|instrument|issuer|security|industry\+?|/?rating|sector|%|to|nav|\(?hedged|&|unhedged\)?|\(%\)|/|\(unhedged\))$", re.I)
MID_HEAD = re.compile(r"^(industry|/?rating|sector)", re.I)
PCT = re.compile(r"^-?\d{1,3}\.\d{2}$")
PCT_END = re.compile(r"(?:^|\s)(-?\d{1,3}\.\d{2})$")
MARKS = re.compile(r"^[\s••\*#@\$\^£€¥~]+|[\s••\*#@\$\^£€¥~]+$")
CONTD = re.compile(r"\.{2,}\s*contd\b.*$", re.I)
_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


# ------------------------------------------------------------------------------------------------------------- page geometry

def _is_bold(cs) -> bool:
    """A heading line: a good part of its ink is bold (a heading can mix a bold title with a plain bracket, 'Units issued by ReIT (Equity & ...)');
    holdings are never bold."""
    ink = [c for c in cs if c["text"].strip()]
    return bool(ink) and sum("bold" in c["fontname"].lower() for c in ink) * 10 >= 3 * len(ink)


def _words(cs) -> List[Tuple[float, str]]:
    """(x0, text) of each word on one line: characters split where the gap between two of them is wider than a narrow letter."""
    out: List[Tuple[float, str]] = []
    cur: list = []
    for c in sorted(cs, key=lambda c: c["x0"]):
        if cur and (c["x0"] - cur[-1]["x1"] > 1.4 or not c["text"].strip()):
            out.append((cur[0]["x0"], "".join(x["text"] for x in cur)))
            cur = []
        if c["text"].strip():
            cur.append(c)
    if cur:
        out.append((cur[0]["x0"], "".join(x["text"] for x in cur)))
    return out


def _join(cs) -> str:
    """The text of characters on one line, left to right, with a space wherever the gap between two characters is wider than a narrow letter."""
    return " ".join(t for _, t in _words(cs)).strip()


def _lines(chars) -> List[Tuple[float, list]]:
    """Characters grouped into lines by their top (within 2 points), top to bottom."""
    out: List[Tuple[float, list]] = []
    for c in sorted(chars, key=lambda c: (c["top"], c["x0"])):
        if out and abs(c["top"] - out[-1][0]) <= 2.0:
            out[-1][1].append(c)
        else:
            out.append((c["top"], [c]))
    return out


def _blocks(page) -> List[Tuple[float, float, float, float, float, float]]:
    """(name x0, industry x0, percent left, percent right, header bottom, header top) of every portfolio column on the page, from the bold 'Company/... Industry+
    ... % to NAV' headers; left to right, then top to bottom."""
    words = page.extract_words(extra_attrs=["fontname"])
    bold = [w for w in words if "bold" in w["fontname"].lower()]
    out = []
    for nav in (w for w in bold if w["text"] == "NAV"):
        near = [w for w in bold if w["x0"] < nav["x0"] and nav["top"] - 30 < w["top"] <= nav["top"] + 10]   # headers sit on the NAV line or just under it
        comp = [w for w in near if NAME_HEAD.match(w["text"])]
        if not comp:
            continue
        c = max(comp, key=lambda w: w["x0"])                       # the nearest name header to the left of this NAV
        mid = [w for w in near if MID_HEAD.match(w["text"]) and w["x0"] > c["x1"]]
        i = min(mid, key=lambda w: w["x0"], default=None)
        ix0 = i["x0"] - 2 if i is not None else nav["x1"] - 24     # no industry or rating column (a fund of funds): names run up to the percent
        if i is None:
            i = c
        # a header can run over more lines ('% to NAV' / '(Hedged &' / 'Unhedged)', 'Company/' / 'Instrument'): the lines under the NAV line count as
        # header only while every word on them is a header word (a section heading such as 'UNITS ISSUED BY REIT' is not)
        bottom = max(w["bottom"] for w in near + [nav] if w is nav or (w["x0"] >= c["x0"] - 2 and (NAME_HEAD.match(w["text"]) or MID_HEAD.match(w["text"])
                                                                                               or HEAD_TOKEN.match(w["text"]))))
        under = sorted((w for w in bold if c["x0"] - 2 <= w["x0"] <= nav["x1"] + 6 and nav["top"] + 10 < w["top"] <= nav["top"] + 26), key=lambda w: w["top"])
        for _, ln in groupby(under, key=lambda w: round(w["top"] / 3)):
            ln = list(ln)
            if not all(HEAD_TOKEN.match(w["text"]) for w in ln):
                break
            bottom = max(bottom, max(w["bottom"] for w in ln))
        out.append((c["x0"] - 6, ix0, nav["x1"] - 24, nav["x1"] + 5, bottom, min(nav["top"], c["top"], i["top"])))
    return sorted(out, key=lambda b: (round(b[4] / 40), b[0]))


def _floor(b, blocks) -> float:
    """Where block b ends at the latest: the top of the next block header below it in the same column (two portfolio blocks can stand one above the other)."""
    below = [o[5] for o in blocks if o is not b and o[5] > b[4] and o[0] < b[3] and o[3] > b[0]]
    return min(below, default=1e9) - 1


def _title(page) -> str:
    """The scheme's name: the first line of text at the top left of the page, '....Contd from previous page' taken off."""
    top = [c for c in page.chars if c["top"] < 70 and c["x0"] < page.width * 0.6 and c["text"].strip()]
    lines = _lines(top)
    for _, cs in lines:
        t = CONTD.sub("", _join(cs)).strip()
        if len(t) >= 4:
            return t
    return ""


# ------------------------------------------------------------------------------------------------------------- reading a factsheet

class _Acc:
    """One scheme's rows as they are read, possibly over two pages."""

    def __init__(self, title: str, as_of: date, source_name: str, url: str):
        self.p = Portfolio(scheme_key=title, as_of=as_of, source_name=source_name, source_url=url, scheme_name=title)
        self.cls = "equity"
        self.name: List[str] = []
        self.ind: List[str] = []

    def line(self, name: str, ind: str, pct: Optional[float], bold: bool) -> None:
        if pct is None:
            if bold and name:                                           # a section heading ('EQUITY & EQUITY RELATED', 'Government Securities ...')
                cls = heading_class(f"{name} {ind}")
                if cls:
                    self.cls = cls
                self.name, self.ind = [], []
                return
            if name:
                self.name.append(name)
            if ind:
                self.ind.append(ind)
            return
        full = MARKS.sub("", " ".join(self.name + ([name] if name else []))).strip()
        sector = " ".join(self.ind + ([ind] if ind else [])).strip() or None
        self.name, self.ind = [], []
        if not full:
            return
        if GRAND_ROW.match(full):
            self.p.published_total_pct = pct
            return
        if TOTAL_ROW.match(full):
            return
        cls = "cash" if (CASH_NAME.match(full) or CASH_NAME.search(full) and self.cls != "equity") else self.cls
        if cls == "cash" and sector:                                    # 'Cash, Cash Equivalents and Net Current' + 'Assets': one name over both columns
            full, sector = f"{full} {sector}", None
        if cls == "equity" and sector is None:
            cls = "other" if heading_class(full) == "other" else cls
        self.p.holdings.append(Holding(name=full, isin=None, sector=sector if cls == "equity" else None, asset_class=cls, pct_nav=pct))


def factsheet_portfolios(path: str, as_of: date, source_name: str, url: str, title_re: Optional[re.Pattern] = None) -> List[Portfolio]:
    """Every scheme portfolio in a factsheet PDF laid out with 'Company/Instrument | Industry+ /Rating | % to NAV' columns."""
    import pdfplumber          # imported here: only this reader needs it

    with pdfplumber.open(path) as pdf:
        return read_pages(pdf.pages, as_of, source_name, url, title_re)


def read_pages(pages, as_of: date, source_name: str, url: str, title_re: Optional[re.Pattern] = None) -> List[Portfolio]:
    """The reader itself, over pages that give .chars, .width and .extract_words(extra_attrs=['fontname']) as pdfplumber's do."""
    found: "OrderedDict[str, _Acc]" = OrderedDict()
    for page in pages:
        blocks = _blocks(page)
        if not blocks:
            continue
        title = _title(page)
        if not title or (title_re is not None and not title_re.search(title)):
            continue
        acc = found.get(title) or found.setdefault(title, _Acc(title, as_of, source_name, url))
        for b in blocks:
            nx0, ix0, px0, px1, head, _ = b
            floor = _floor(b, blocks)
            # upright characters only: the industry charts beside a portfolio print their labels turned, and those letters must not join a row
            region = [c for c in page.chars if nx0 <= c["x0"] < px1 and head + 1 < c["top"] < floor and c.get("upright", True)]
            last = head
            for top, cs in _lines(region):
                if top - last > 32:                                 # the column has ended (a gap, then other content)
                    break
                ws = _words([c for c in cs if c["x0"] < px0])       # a word that starts in the name column stays there whole
                name = " ".join(t for x, t in ws if x < ix0)
                ind = " ".join(t for x, t in ws if x >= ix0)
                pt = _join([c for c in cs if c["x0"] >= px0])
                if not (name or ind or pt):
                    continue
                last = top
                m = PCT_END.search(pt)
                pct = float(m.group(1)) if m else None
                if pt and pct is None:                              # something else in the percent column: not a portfolio row
                    name = (name + " " + pt).strip()
                bold = _is_bold([c for c in cs if c["x0"] < px0])
                if bold and pct is None and HEADER_WORDS.match(name or ind):
                    continue                                        # the rest of a column header
                if bold and pct is None and NOT_PORTFOLIO.search(f"{name} {ind}"):
                    break                                           # a bold line that is no section heading ('PERFORMANCE ^ - Regular Plan'): the portfolio column has ended
                acc.line(name, ind, pct, bold)
                if pct is not None and GRAND_ROW.match(name):         # the portfolio's last line
                    break
    out = [a.p for a in found.values() if a.p.holdings]
    for p in out:
        _drop_repeated_row(p)
    return out


def _drop_repeated_row(p: Portfolio) -> None:
    """A factsheet can print one row twice (HDFC Conservative Hybrid Fund, September 2026: '7.34 GOI 2064 Sovereign 2.91' two lines apart, rows adding
    up to 102.91 against a Grand Total of 100.00). An identical repeat is dropped only when that makes the rows add up to the file's own total."""
    if p.published_total_pct is None:
        return
    total = sum(h.pct_nav for h in p.holdings)
    seen = {}
    for i, h in enumerate(p.holdings):
        k = (h.name.lower(), h.pct_nav)
        if k in seen and abs(total - h.pct_nav - p.published_total_pct) <= 0.05:
            del p.holdings[i]
            p.notes.append(f"'{h.name}' ({h.pct_nav:.2f} %) is printed twice in the factsheet; it is counted once, which matches the factsheet's own total.")
            return
        seen[k] = i


# ------------------------------------------------------------------------------------------------------------- HDFC

HDFC_FILES = "https://files.hdfcfund.com/s3fs-public"
HDFC_SOURCE = "HDFC Mutual Fund, monthly factsheet (full portfolio of each scheme)"


def hdfc_factsheet_url(month_end: date) -> str:
    """HDFC files each month's factsheet in the next month's folder: 2026-10/HDFC MF Factsheet - September 2026.pdf."""
    nxt = date(month_end.year + (month_end.month == 12), month_end.month % 12 + 1, 1)
    return f"{HDFC_FILES}/{nxt:%Y-%m}/HDFC%20MF%20Factsheet%20-%20{_MONTHS[month_end.month - 1]}%20{month_end.year}.pdf"


async def list_hdfc(client: httpx.AsyncClient, months: List[date]) -> List[FileRef]:
    """The factsheets of the wanted months that are out (a month's file appears two to three weeks after the month end; the store answers 403 for a
    file that is not there yet)."""
    out = []
    for m in months:
        m = _eom(m)
        url = hdfc_factsheet_url(m)
        try:
            r = await client.get(url, headers={"Range": "bytes=0-0"})   # the store refuses HEAD (403 even for a file that is there); one byte is enough
        except httpx.HTTPError:
            continue
        if r.status_code in (200, 206):
            out.append(FileRef("hdfc", url, m, None, f"HDFC MF Factsheet {_MONTHS[m.month - 1]} {m.year}"))
    return out


def parse_hdfc(path: str, ref: FileRef, adapter: Adapter, idx, stats: dict, sink: list) -> None:
    """The portfolio job's hook for a fund house that publishes PDFs (portfolios.step_amc): parse, match each scheme to AMFI's list, validate."""
    from ..portfolios import _today
    from .model import clean_for_store, validate

    for p in factsheet_portfolios(path, ref.month_end, HDFC_SOURCE, ref.url, re.compile(r"^HDFC\b", re.I)):
        stats["sheets"] += 1
        fam, why = idx.resolve([p.scheme_name], adapter.amc_re)
        if not fam:
            stats["unmapped"].append({"scheme": p.scheme_name, "why": why})
            continue
        v = validate(p, _today())
        if not v.ok:
            stats["rejected"].append({"scheme": p.scheme_name, "asOf": p.as_of.isoformat(), "problems": v.problems[:3]})
            continue
        clean_for_store(p)
        p.notes.append("From HDFC's monthly factsheet: the factsheet gives no ISINs.")
        if v.warnings:
            stats["warnings"] += len(v.warnings)
        sink.append((fam, p))


HDFC = Adapter("hdfc", "HDFC Mutual Fund", r"^hdfc\b", list_hdfc, "files.hdfcfund.com")
HDFC.parse_file = parse_hdfc

# Not run nightly: HDFC's file store refuses the job's agent (see the top of this file), and the job never goes around that. Since task #281 round 7 an
# administrator downloads the factsheet in a normal browser and uploads it (Console > Data health > Fund house files, finlit/fund_files.py), which reads it
# with this adapter; pdfplumber is in requirements.txt for that.
ADAPTERS: List[Adapter] = []
