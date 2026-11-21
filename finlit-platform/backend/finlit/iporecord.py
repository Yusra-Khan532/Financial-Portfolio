"""The full record of one IPO, for the all-IPOs table and the IPO report: issue terms, reservation, timetable, offer documents, the people who ran it,
key figures and restated financials from the offer document, objects of the issue and the anchor book.

Read from the same public InvestorGain IPO page as the GMP (finlit.ipogmp), whose embedded data carries the issue as the offer document and the exchanges
published it. Only facts are kept: no prose is copied (the descriptions, reviews, ratings and recommendations on the page are left out), and every figure
is shown with InvestorGain named as the source. Subscription by investor category comes from the exchange itself (finlit.iponse), not from here.

Pure parsing: no database, no network. Describes the issue; not a recommendation.
"""

from __future__ import annotations

import html as _html
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from .ipogmp import _array, _payload

CRORE = 1e7


# ------------------------------------------------------------------------------------------------ small readers
def _chunk(blob: str, ref: str) -> Optional[str]:
    """A text chunk of the Next.js stream ("<ref>:T<hex byte length>,<text>"): long HTML fields are stored this way and referred to as "$<ref>"."""
    raw = blob.encode("utf-8")
    m = re.search((r"(?:^|[^0-9a-f])%s:T([0-9a-f]+)," % re.escape(ref)).encode(), raw)
    if not m:
        return None
    n = int(m.group(1), 16)
    return raw[m.end():m.end() + n].decode("utf-8", "replace")


def _field(blob: str, d: Dict[str, Any], key: str) -> Optional[str]:
    """A field of the IPO record, following a "$ref" to its text chunk."""
    v = d.get(key)
    if isinstance(v, str) and re.fullmatch(r"\$[0-9a-f]{1,4}", v):
        return _chunk(blob, v[1:])
    return v if isinstance(v, str) else None


def num(v: Any) -> Optional[float]:
    """A number from a page value: 1,19,00,000 / "₹255.00 Cr" / "150.00" / 25 -> float; blank, NA or 0-like placeholders -> None."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = _html.unescape(str(v)).replace(",", "").strip()
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group(0)) if m else None


def pos(v: Any) -> Optional[float]:
    """A number that only means something when above zero (shares, amounts, prices)."""
    x = num(v)
    return x if x is not None and x > 0 else None


def day(v: Any) -> Optional[str]:
    """An ISO date from "2026-10-27T00:00:00.000Z", "2026-10-27" or "27th Oct 2026"; None when blank or unreadable."""
    if not v or not isinstance(v, str):
        return None
    s = v.strip()
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    if m:
        try:
            return date.fromisoformat(m.group(1)).isoformat()
        except ValueError:
            return None
    m = re.match(r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})", s)
    if m:
        try:
            return datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%d %b %Y").date().isoformat()
        except ValueError:
            return None
    return None


def text(h: Optional[str]) -> str:
    """Plain text from a bit of HTML."""
    t = re.sub(r"<br\s*/?>|</p>|</li>|</div>", "\n", h or "", flags=re.I)
    t = _html.unescape(re.sub(r"<[^>]+>", " ", t))
    return re.sub(r"[ \t\xa0]+", " ", re.sub(r"\s*\n\s*", "\n", t)).strip()


def rows(h: Optional[str]) -> List[List[str]]:
    """The rows of every HTML table in a bit of HTML, each as a list of cell texts (header rows included)."""
    out = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", h or "", flags=re.S | re.I):
        cells = [text(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, flags=re.S | re.I)]
        if any(cells):
            out.append(cells)
    return out


def cr(rupees: Any) -> Optional[float]:
    """An amount in rupees -> crore, rounded to 0.01."""
    x = pos(rupees)
    return round(x / CRORE, 2) if x else None


# ------------------------------------------------------------------------------------------------ the parts of the record
RESERVATION = [   # (key, label, field on the page); the shares each investor category was offered
    ("anchor", "Anchor investors", "shares_offered_anchor_investor"),
    ("qib", "Qualified institutions (excl. anchor)", "shares_offered_qib_ex_anchor"),
    ("bnii", "Big non-institutional (above ₹10 lakh)", "shares_offered_big_nii"),
    ("snii", "Small non-institutional (₹2–10 lakh)", "shares_offered_small_nii"),
    ("nii", "Non-institutional investors", "shares_offered_nii"),
    ("retail", "Retail investors", "shares_offered_rii"),
    ("employee", "Employees", "shares_offered_emp"),
    ("shareholder", "Shareholders", "shares_offered_shareholders"),
    ("market_maker", "Market maker", "shares_offered_market_maker"),
    ("other", "Others", "shares_offered_others"),
]


def reservation(d: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Shares reserved for each investor category and their share of the issue. When the non-institutional part is split into big and small, the
    split is shown and the parent row is not counted twice."""
    got = {k: pos(d.get(f)) for k, _, f in RESERVATION}
    if got["bnii"] and got["snii"]:
        got["nii"] = None
    parts = [(k, lab, got[k]) for k, lab, _ in RESERVATION if got[k]]
    if not parts:
        return None
    total = pos(d.get("shares_offered_total")) or sum(s for _, _, s in parts)
    summed = sum(s for _, _, s in parts)
    if total and abs(summed - total) / total > 0.02:      # the page's total does not match its parts: use the parts' sum, which the rows add up to
        total = summed
    return {"total": total, "rows": [{"key": k, "label": lab, "shares": s, "pct": round(s / total * 100, 2)} for k, lab, s in parts]}


def timetable(d: Dict[str, Any]) -> Dict[str, Optional[str]]:
    return {
        "anchorBid": day(d.get("timetable_anchor_bid_dt")),
        "open": day(d.get("issue_open_dt_json")) or day(d.get("issue_open_date")),
        "close": day(d.get("issue_end_dt_json")) or day(d.get("issue_close_date")),
        "allotment": day(d.get("timetable_boa_dt")) or day(d.get("basic_of_allotment_dt")),
        "refunds": day(d.get("timetable_refunds_dt")) or day(d.get("initiation_of_refund_dt")),
        "credit": day(d.get("timetable_share_credit_dt")) or day(d.get("demat_acct_credit_dt")),
        "listing": day(d.get("ipo_listing_date")) or day(d.get("timetable_listing_dt")),
        "anchorLockin30": day(d.get("timetable_anchor_lockin_end_dt_1")),
        "anchorLockin90": day(d.get("timetable_anchor_lockin_end_dt_2")),
    }


def _url(v: Any) -> Optional[str]:
    s = str(v or "").strip()
    return s if re.match(r"https?://[^\s\"'<>]+$", s) else None


def documents(d: Dict[str, Any]) -> Dict[str, Optional[str]]:
    return {"drhp": _url(d.get("prospectus_drhp")), "rhp": _url(d.get("prospectus_rhp")), "prospectus": _url(d.get("final_prospectus")),
            "anchorList": _url(d.get("anchor_investor_url"))}


def kpis(d: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Key figures from the offer document, for the latest full year and, when given, the latest part year. Percent figures in percent."""
    out = []
    for sfx, asof in (("", "kpi_as_of_date"), ("_2", "kpi_as_of_date_2")):
        row = {"asOf": day(d.get(asof)), "roe": num(d.get("kpi_roe" + sfx)), "roce": num(d.get("kpi_roce" + sfx)), "debtEquity": num(d.get("kpi_debt_equity" + sfx)),
               "ronw": num(d.get("kpi_ronw" + sfx)), "patMargin": num(d.get("kpi_pat_margin" + sfx)), "ebitdaMargin": num(d.get("kpi_ebitda" + sfx)),
               "nav": num(d.get("nav" + sfx)), "priceToBook": num(d.get("price_to_book_value" + sfx))}
        if any(v is not None for k, v in row.items() if k != "asOf"):
            out.append(row)
    return out


def financials(h: Optional[str]) -> Optional[Dict[str, Any]]:
    """The restated financials table: periods (newest first, as the offer document lists them) and one row per line item, in ₹ crore."""
    if not h:
        return None
    t = rows(h)
    head = next((r for r in t if r and re.search(r"period", r[0], re.I)), None)
    if not head:
        return None
    periods = [day(c) or c for c in head[1:] if c]
    lines = []
    for r in t:
        if r is head or len(r) < 2 or not r[0] or re.search(r"amount in", r[0], re.I):
            continue
        vals = [num(c) for c in r[1:1 + len(periods)]]
        if any(v is not None for v in vals):
            lines.append({"label": r[0], "values": vals})
    if not periods or not lines:
        return None
    basis = re.search(r"Company Financials\s*\(([^)]+)\)", text(h))
    unit = "₹ crore" if re.search(r"crore|cr\b", text(h), re.I) else None
    return {"basis": basis.group(1) if basis else None, "unit": unit, "periods": periods, "rows": lines}


def amounts_table(h: Optional[str]) -> Optional[List[Dict[str, Any]]]:
    """A numbered "what the money is for" table (objects of the issue, issue expenses): [{label, amountCr}], the total row left out."""
    out = []
    for r in rows(h):
        if len(r) < 2 or not re.fullmatch(r"\d{1,2}", r[0].strip()):
            continue
        label = r[1].strip()
        if label:
            out.append({"label": label[:300], "amountCr": num(r[2]) if len(r) > 2 else None})
    return out or None


def anchors(h: Optional[str]) -> Optional[Dict[str, Any]]:
    """The anchor book: each anchor investor's shares and amount, and the totals."""
    if not h:
        return None
    out = []
    for r in rows(h):
        if len(r) < 4 or not re.fullmatch(r"\d{1,3}", r[0].strip()):
            continue
        cells = [c for c in r[1:] if c.strip() not in ("", "#")]
        if len(cells) < 3:
            continue
        name, shares, amt = cells[0], pos(cells[1]), num(cells[2])
        if name and shares:
            out.append({"name": name[:160], "shares": shares, "amountCr": amt})
    if not out:
        return None
    shares, amount = sum(a["shares"] for a in out), round(sum(a["amountCr"] or 0 for a in out), 2)
    for r in rows(h):                                  # the table's own total row ("", shares, amount, ...) when it has one: it is what the filing says
        cells = [c for c in r if c.strip()]
        if r and not r[0].strip() and len(cells) >= 2 and pos(cells[0]) == shares and num(cells[1]) is not None and abs(num(cells[1]) - amount) < 0.5:
            amount = num(cells[1])
    return {"count": len(out), "shares": shares, "amountCr": amount, "investors": out}


def promoters(h: Optional[str]) -> List[str]:
    names = re.split(r",|\n| and ", text(h))
    return [n.strip(" .") for n in names if 2 < len(n.strip(" .")) < 120][:20]


def max_allottees(h: Optional[str]) -> Dict[str, float]:
    """Max allottees per category from the reservation table, keyed like RESERVATION ('retail', 'bnii', 'snii', 'employee'). Read only from a column
    headed "Max Allottees" (tables without one give nothing)."""
    t = rows(h)
    head = next((r for r in t if any(re.search(r"max\.?\s*allottees", c, re.I) for c in r)), None)
    if not head:
        return {}
    col = next(i for i, c in enumerate(head) if re.search(r"max\.?\s*allottees", c, re.I))
    keys = {"retail": r"^retail", "bnii": r"bnii", "snii": r"snii", "employee": r"^employee"}
    out = {}
    for r in t:
        if r is head:
            continue
        col_r = col - 1 if len(r) == len(head) - 1 and not head[0] else col     # the header row may have a leading blank cell the body rows do not
        label = r[0].strip(" −-\u2212")
        for k, pat in keys.items():
            if re.search(pat, label, re.I) and col_r < len(r) and pos(r[col_r]):
                out[k] = pos(r[col_r])
    return out


# ------------------------------------------------------------------------------------------------ the record
def parse_detail(page: str) -> Optional[Dict[str, Any]]:
    """The full record of the IPO on an InvestorGain page, or None when the page has no IPO record."""
    blob = _payload(page)
    arr = _array(blob, "ipoData")
    d = arr[0] if arr and isinstance(arr[0], dict) else None
    if not d:
        return None
    lead = [str(x.get("comp_name")).strip() for x in (_array(blob, "ipoLeadManagersList") or []) if isinstance(x, dict) and x.get("comp_name")]
    reg = next((x for x in (_array(blob, "registrarInfo") or []) if isinstance(x, dict) and x.get("registrar_name")), None)
    proc = str(d.get("issue_process_type") or "").upper()
    cat = str(d.get("ipo_category_sub") or d.get("issue_category") or "")
    res = reservation(d)
    if res:
        mx = max_allottees(_field(blob, d, "ipo_reservation_desc"))
        for r in res["rows"]:
            if r["key"] in mx:
                r["maxAllottees"] = mx[r["key"]]
    lot = pos(d.get("market_lot_size")) or pos(d.get("minimum_order_quantity"))
    fresh = cr(d.get("ttl_issue_size_fresh_in_amt")) or cr(d.get("issue_size_fresh_in_amt"))
    ofs = cr(d.get("ttl_issue_size_ofs_in_amt")) or cr(d.get("issue_size_ofs_in_amt"))
    # The whole issue, the market maker's portion of an SME issue included (the page's "issue_size_in_amt" leaves it out): fresh issue + offer for sale.
    total = round((fresh or 0) + (ofs or 0), 2) if (fresh or ofs) else cr(d.get("issue_size_in_amt"))
    return {
        "company": {"fullName": (d.get("company_name") or "").strip() or None, "incorporated": (str(d.get("company_incorporation") or "").strip() or None),
                    "city": d.get("city_name") or d.get("city") or None, "sector": d.get("company_sector") or None, "website": _url(d.get("website")),
                    "promoters": promoters(_field(blob, d, "promoters"))},
        "issue": {
            "kind": "Book built" if proc == "BB" else "Fixed price" if proc == "FP" else (d.get("issue_process_type_desc") or None),
            "board": "SME" if "SME" in cat.upper() else "Mainboard",
            "exchanges": [x.strip() for x in str(d.get("ipo_listing_at") or "").split(",") if x.strip()],
            "faceValue": pos(d.get("face_value")), "priceLow": pos(d.get("issue_price_lower")), "priceHigh": pos(d.get("issue_price_upper")),
            "issuePrice": pos(d.get("issue_price_final")) or pos(d.get("allotment_price")),
            "lotSize": lot, "minAmount": pos(d.get("min_order_amount")),
            "retailMaxShares": num(d.get("max_retail_qty")), "sniiMinShares": num(d.get("min_hni_qty")), "sniiMinAmount": pos(d.get("min_hni_amt")),
            "bniiMinShares": num(d.get("min_bhni_qty")), "bniiMinAmount": pos(d.get("min_bhni_amt")),
            "totalShares": pos(d.get("ttl_issue_size_in_shares")) or pos(d.get("issue_size_in_shares")),
            "freshShares": pos(d.get("ttl_issue_size_fresh_in_shares")) or pos(d.get("issue_size_fresh_in_shares")),
            "ofsShares": pos(d.get("ttl_issue_size_ofs_in_shares")) or pos(d.get("issue_size_ofs_in_shares")),
            "totalCr": total, "freshCr": fresh, "ofsCr": ofs,
            "preIssueShares": pos(d.get("total_shareholding_pre_issue")), "postIssueShares": pos(d.get("total_shareholding_post_issue")),
            "promoterPre": pos(d.get("promoter_shareholding_pre_issue")), "promoterPost": pos(d.get("promoter_shareholding_post_issue")),
            "marketCapCr": pos(d.get("market_cap")), "pe": pos(d.get("pe_ratio")), "postPe": pos(d.get("post_pe_ratio")),
            "eps": num(d.get("kpi_eps")), "epsPost": num(d.get("kpi_eps_post")),
            "withdrawn": bool(d.get("issue_withdraw")) and str(d.get("issue_withdraw")) not in ("0", "N", ""),
        },
        "reservation": res,
        "timetable": timetable(d),
        "documents": documents(d),
        "people": {"registrar": (reg or {}).get("registrar_name"), "allotmentUrl": _url(d.get("ipo_allotment_url")), "leadManagers": lead[:12]},
        "kpis": kpis(d),
        "financials": financials(_field(blob, d, "financial")),
        "objects": amounts_table(_field(blob, d, "issue_objects")),
        "expenses": amounts_table(_field(blob, d, "issue_expenses")),
        "anchors": anchors(_field(blob, d, "anchor_investor_detail")),
    }
