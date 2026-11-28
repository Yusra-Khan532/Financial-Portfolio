"""Task #365, re-check (28 Nov 2026): the words of an exchange filing, so its sentiment is read from what the filing says, not from the exchange's
subject line ("... has informed the Exchange about Credit Rating"), which carries no tone and made about 97% of filings read 0.00 Neutral.

Two sources, in this order, both stored in feed_items.lead (migration 152; `summary` stays the administrator's own note):
  1. at load time, the exchange's own description when it is longer than the stored title (the title is cut to 140 characters: feed.rows_from_announcements).
     The provider (FinEdge /corp-announcements) gives one text field, `description`; NSE's `attchmntText` or BSE's `MORE` do not reach this code;
  2. the nightly `filing-text` job (read_pending): for a filing with no lead, the first two pages of its PDF on the exchange's archive, with the letterhead,
     the addresses, the salutation, the subject and reference lines, the regulation preamble and the signature taken out (lead_of).

Being gentle with the exchanges: the polite fetcher of the earnings-call reader (earnings/transcripts.Fetcher: robots.txt obeyed, one request at a time with
a pause, a request budget, back-off on 429/503, a refused host is left alone for the run, https exchange hosts only, a byte cap), a capped number of PDFs a
run, newest first, a time budget; every outcome is kept in filing_reads, and a file that failed is tried again only days later (3, 9, 27 days; then never).
A scan with no text layer is kept as 'no_text' and never asked for again. Routine filings (sentiment.is_routine) are not fetched at all."""

from __future__ import annotations

import logging
import re
import time
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Sequence

log = logging.getLogger("finlit.filing_text")

LEAD_MIN, LEAD_MAX = 600, 1200      # the lead: the opening paragraphs, cut at a sentence end after 600 characters, never more than 1,200
MIN_WORDS = 8                       # less than this after cleaning: the file has no readable text (a scan, a cover page)
PDF_PAGES = 2
PDF_CAP = 20 * 1024 * 1024          # a letter is well under 1 MB; a results filing with scanned pages reaches 17 MB (Adani Enterprises, 28 Oct 2026)
# Reports of a hundred pages and more, whose first two pages are a cover and a contents page: never fetched for a lead.
BIG_REPORT = re.compile(r"annual report|integrated report|sustainability report|business responsibility|\bbrsr\b|esg report|prospectus|offer document"
                        r"|letter of offer|draft red herring|red herring", re.I)
RETRY_DAYS = (3, 9, 27)             # a failed file is tried again after these many days; after the last, never

# ------------------------------------------------------------------ the exchange's longer description
_SPACE = re.compile(r"\s+")


def exchange_lead(description: Optional[str], title: Optional[str]) -> Optional[str]:
    """The exchange's own description when the stored title is a cut of it (more than 160 characters: feed.rows_from_announcements), else None."""
    d = _SPACE.sub(" ", description or "").strip()
    if len(d) <= 160:
        return None
    return _cut(d)


# ------------------------------------------------------------------ PDF text -> lead
# A line that is letterhead, an address, the addressee or the signature: dropped whole.
_DROP_LINE = re.compile(
    r"^(?:to,?|the (?:general )?manager\b.*|the secretary\b.*|the listing (?:department|compliance)\b.*|listing (?:department|compliance)\b.*|corporate relationship"
    r".*|dept\.? of corporate.*|department of corporate.*|kind attn.*|kind attention.*|attn\.?:.*|dear (?:sir|madam|sirs|shareholder|members?)\b.*|sir(?:s)?\s*/\s*madam.*"
    r"|ladies and gentlemen.*|bse limited.*|bse ltd.*|national stock exchange.*|the national stock exchange.*|phiroze jeejeebhoy.*|phiroze jejeebhoy.*|dalal street.*"
    r"|exchange plaza.*|plot no\.?.*|bandra[- ](?:kurla|\(e\)|east).*|g[- ]block.*|mumbai\s*-?\s*400\s?\d{3}.*|(?:scrip|stock|security|bse|nse) (?:code|symbol|id)\b.*"
    r"|symbol\s*[:-].*|isin\s*[:-].*|series\s*[:-].*|cin\s*[:-]?\s*[lu]\d.*|corporate identity number.*|corporate identification number.*|registered office.*|regd\.? office.*"
    r"|corporate office.*|secretarial department.*|tel\.?\s*(?:no\.?)?\s*[:+(\d].*|phone\s*[:+(\d].*|fax\s*[:+(\d].*|e-?mail\s*(?:id)?\s*[:].*|website\s*[:].*|www\.\S+"
    r"|kindly take (?:the )?(?:same|this|above|note).*|(?:we )?request you to take.*|please take (?:the )?(?:same|this|above|note).*|this is for your (?:kind )?information.*"
    r"|the above is for your.*|thanking you.*|thank you\.?|yours (?:faithfully|truly|sincerely).*|(?:for|for and on behalf of) [a-z0-9&.,()' -]{3,80}(?:limited|ltd\.?)\s*$"
    r"|company secretary.*|compliance officer.*|chief financial officer\s*$|(?:a|f)cs\s*(?:no\.?)?\s*:?\s*\d+.*|\((?:a|f)cs\s*(?:no\.?)?\s*:?\s*\d+\).*|membership no.*"
    r"|encl(?:\.|osure|osures)?\s*[:.]?.*|cc\s*:.*|page \d+ of \d+|an iso \d+.*|digitally signed by.*|date\s*:\s*\d{4}\.\d{2}\.\d{2}.*|place\s*:.*|date\s*:.*)$", re.I)
_DATE_LINE = re.compile(r"^(?:dated?\s*:?\s*)?(?:\d{1,2}(?:st|nd|rd|th)?[\s.,/-]+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s.,/-]+(?:\d{1,2}(?:st|nd|rd|th)?,?\s*)?\d{4}$"
                        r"|^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$", re.I)
_REF_LINE = re.compile(r"^(?:ref(?:erence)?\.?\s*(?:no\.?)?\s*[:.-]|our ref|sec/|lt/s&b/|[a-z]{2,6}/\d{2,4}\s*$)", re.I)
_SUBJECT = re.compile(r"^(?:sub(?:ject)?|re)\s*\.?\s*[:-]\s*", re.I)
# The regulation the letter is filed under: legal wording, not news ("Disclosure under Regulation 30 of the SEBI (LODR) Regulations, 2015 - Credit Ratings")
_REGULATION = re.compile(r"(?:(?:intimation|disclosure|submission|information|update)s?\s+(?:under|pursuant to|in terms of)\s+)?(?:the\s+)?(?:regulations?|reg\.?)\s*\d+[\w() ,/&-]{0,40}?"
                         r"(?:\s+(?:read with|and)\s+[^.;:–—]{0,160}?)?\s+of\s+(?:the\s+)?(?:securities and exchange board of india|sebi)\s*\([^)]{0,90}\)\s*(?:regulations?,?\s*(?:20\d\d)?)?"
                         r"(?:\s*\([^)]{0,30}\))?\s*(?:\(\s*\"?(?:sebi\s+)?(?:listing regulations|lodr|sebi lodr)\"?\s*\))?(?:\s*(?:as amended|,\s*as amended))?\s*", re.I)
_PREAMBLE = re.compile(r"^(?:(?:this is )?further to (?:our|the)[^.]{0,200}?,\s*|(?:pursuant to|in terms of|in compliance with|as required under|under)\b[^.]{0,320}?,?\s*)?"
                       r"(?:we (?:wish|would like|are pleased|hereby wish) to (?:inform|intimate|state|submit)(?: you)?(?: that)?|we hereby (?:inform|intimate|submit)(?: you)?(?: that)?"
                       r"|(?:this is to|please be) (?:inform|informed|intimate)(?:ed)?(?: you)?(?: that)?|we (?:inform|intimate) (?:you )?that)\s*[,:]?\s*", re.I)
_ENCLOSE = re.compile(r"(?:^|(?<=[.!?]\s))(?:we )?(?:enclose|are enclosing|attach|are attaching|have enclosed|please find (?:enclosed|attached|herewith))[^.]{0,220}\.\s*", re.I)
_URL = re.compile(r"\bhttps?://\S+|\bwww\.\S+|\S+@\S+\.\w+|\S*%[0-9a-f]{2}\S*|\S+\.html?\b|\S*_\S*_\S*", re.I)
_LINK = re.compile(r"[^.]*\b(?:link|weblink|url)\b[^.:]*\b(?:as follows|given below|is below|is here)\s*:?[^.]*?(?=\s[A-Z]|$)", re.I)


def _unspace(line: str) -> str:
    """'P u r s u a n t  t o  R e g u l a t i o n' (a letter-spaced PDF line) -> 'Pursuant to Regulation'."""
    toks = line.split(" ")
    words = [t for t in toks if t]
    if len(words) >= 6 and sum(len(w) == 1 for w in words) / len(words) > 0.7:
        return " ".join(w.replace(" ", "") for w in re.split(r" {2,}", line.strip()) if w.strip())
    return line


def _caps_name(line: str) -> bool:
    """A signature name or a logo's words ('SUBRAMANIAN NARAYAN', 'e LARSEN & TOUBRO'): a few words, all capitals, no figures."""
    words = [w for w in line.split() if len(w) > 1]
    return 1 <= len(words) <= 4 and " ".join(words).isupper() and not re.search(r"\d", line) and len(line) <= 40


_PIN = re.compile(r"[-–,]?\s*\b\d{3}\s?\d{3}\b\s*[,.]?\s*(?:\(?india\)?)?\.?$", re.I)     # "... Mumbai - 400 001, INDIA": an address line
_START = re.compile(r"^(?:dear (?:sir|madam|sirs|shareholders?|members?)\b|sir(?:s)?\s*/\s*madam|ladies and gentlemen|(?:sub(?:ject)?|re)\s*\.?\s*[:-])", re.I)
_CLOSE = re.compile(r"^(?:thanking you|thank you|yours (?:faithfully|truly|sincerely)|kindly take|(?:we )?request you to take|please take|for and on behalf of)", re.I)


def _boiler(line: str) -> bool:
    low = line.strip(" ,.;:").strip()
    return (not low or bool(_DROP_LINE.match(low)) or bool(_DATE_LINE.match(low)) or bool(_REF_LINE.match(low)) or _caps_name(low)
            or (len(low) <= 3 and not low.isalnum()) or (len(low) <= 80 and bool(_PIN.search(low))))


def _cut(text: str) -> str:
    """At most LEAD_MAX characters, ended at a sentence end after LEAD_MIN when there is one."""
    t = _SPACE.sub(" ", text).strip()
    if len(t) <= LEAD_MAX:
        return t
    head = t[:LEAD_MAX]
    ends = [m.end() for m in re.finditer(r"[.!?](?=\s)", head) if m.end() >= LEAD_MIN]
    return head[:ends[-1]].strip() if ends else head.rsplit(" ", 1)[0].strip()


def _lines(pages: Sequence[str]) -> List[str]:
    """The lines of the first pages, letter-spacing undone; the letterhead and the addressee before the salutation or the subject line are left out."""
    text = "\n".join(p or "" for p in pages[:PDF_PAGES]).replace("\x00", "").replace("\u00a0", " ")
    lines = [_SPACE.sub(" ", _unspace(raw.rstrip())).strip() for raw in text.splitlines()]
    start = next((i for i, ln in enumerate(lines[:80]) if _START.match(ln)), 0)
    return lines[start:]


def lead_of(pages: Sequence[str]) -> str:
    """The opening of a filing's own words from the text of its first pages, or "" when there is none (a scan, a cover page, only letterhead)."""
    paras: List[List[str]] = [[]]
    signing = 0                              # after "Yours faithfully": up to 3 short lines of the signature block (a name, a title) are not content
    for line in _lines(pages):
        if not line:
            if paras[-1]:
                paras.append([])
            continue
        if _boiler(line):
            if _CLOSE.match(line.strip(" ,.;:")):
                signing = 3
            if paras[-1]:
                paras.append([])
            continue
        if signing and re.fullmatch(r"(?:[A-Z][a-zA-Z.'-]*\s?){1,4}", line):   # a name in the signature block ("Subramanian Narayan")
            signing -= 1
            continue
        signing = 0
        paras[-1].append(line)
    out: List[str] = []
    seen = set()
    subjects: List[str] = []
    for lines in paras:
        p = " ".join(lines).strip()
        if not p:
            continue
        if _SUBJECT.match(p):              # the subject line: keep what it says, without the label and the regulation it is filed under
            p = _REGULATION.sub(" ", _SUBJECT.sub("", p)).strip(" -–—:,.;")
            p = re.sub(r"^(?:intimation|disclosure|submission|update)s?\s*(?:of|on|regarding|about|-|–|—)?\s*", "", p, flags=re.I).strip(" -–—:,.;")
            if len(p.split()) < 3:
                continue
            subjects.append(p)
            p += "."
        else:
            for sj in subjects:            # a press release repeats the letter's subject as its headline: said once
                if p.lower().startswith(sj.lower()):
                    p = p[len(sj):].lstrip(" .:-–—")
            p = _PREAMBLE.sub("", _REGULATION.sub(" ", p)).strip()
            p = _ENCLOSE.sub("", p).strip()
            p = _LINK.sub("", p)
        p = _SPACE.sub(" ", _URL.sub("", p)).strip(" ,;")
        key = re.sub(r"\W+", "", p.lower())[:120]
        if len(p.split()) < 2 or key in seen:
            continue
        seen.add(key)
        out.append(p[:1].upper() + p[1:])
    lead = _cut(" ".join(out))
    return lead if len(re.findall(r"[A-Za-z]{2,}", lead)) >= MIN_WORDS else ""


# ------------------------------------------------------------------ the nightly job
PENDING_SQL = """
SELECT f.id, f.kind, f.title, f.category, f.link FROM feed_items f LEFT JOIN filing_reads r ON r.feed_id = f.id
WHERE f.kind IN ('news', 'result', 'document') AND f.auto AND f.source = $1 AND f.lead IS NULL AND coalesce(f.summary, '') = ''
  AND f.link ~* '^https://([a-z0-9-]+\\.)*(nseindia\\.(com|in)|bseindia\\.com)/' AND f.item_date >= $2
  AND (r.feed_id IS NULL OR (r.retry_after IS NOT NULL AND r.retry_after <= now()))
ORDER BY f.item_date DESC, f.id DESC LIMIT $3"""
SAVE_LEAD_SQL = "UPDATE feed_items SET lead = $2, lead_src = 'pdf' WHERE id = $1 AND lead IS NULL"


def retry_after(status: str, tries: int = 1) -> Optional[timedelta]:
    """When a file may be asked for again: a failure after 3, 9 and 27 days, then never; a read, a scan or a file too large: never."""
    if status != "failed" or tries > len(RETRY_DAYS):
        return None
    return timedelta(days=RETRY_DAYS[tries - 1])


async def _record(conn, feed_id: int, status: str, reason: Optional[str]) -> None:
    tries = int(await conn.fetchval("SELECT tries FROM filing_reads WHERE feed_id = $1", feed_id) or 0) + 1
    wait = retry_after(status, tries)
    if wait is None:
        await conn.execute("INSERT INTO filing_reads (feed_id, status, tries, reason, read_at, retry_after) VALUES ($1, $2, $3, $4, now(), NULL) "
                           "ON CONFLICT (feed_id) DO UPDATE SET status = EXCLUDED.status, tries = EXCLUDED.tries, reason = EXCLUDED.reason, read_at = now(), retry_after = NULL",
                           feed_id, status, tries, reason)
    else:
        await conn.execute("INSERT INTO filing_reads (feed_id, status, tries, reason, read_at, retry_after) VALUES ($1, $2, $3, $4, now(), now() + $5::interval) "
                           "ON CONFLICT (feed_id) DO UPDATE SET status = EXCLUDED.status, tries = EXCLUDED.tries, reason = EXCLUDED.reason, read_at = now(), "
                           "retry_after = EXCLUDED.retry_after", feed_id, status, tries, reason, wait)


async def read_pending(store, limit: int = 300, max_minutes: float = 20.0, fetcher: Any = None, lookback_days: int = 730,
                       clock=time.monotonic) -> Dict[str, Any]:
    """The `filing-text` job: the lead of up to `limit` filings with no lead, newest first, from the first pages of their PDFs, until `max_minutes`.
    Every outcome is kept (filing_reads); the next run continues with the next filings. A routine filing is not fetched (it is not scored)."""
    from .earnings import transcripts as T
    from .feed import FILING_SOURCE
    from .sentiment import is_routine

    t0 = clock()
    since = date.today() - timedelta(days=lookback_days)
    async with store.pool.acquire() as conn:
        rows = await conn.fetch(PENDING_SQL, FILING_SOURCE, since, limit * 3)     # routine ones are skipped below, so a few more are asked for
    wanted = [r for r in rows if not is_routine(r["kind"], r["category"], r["title"])
              and not BIG_REPORT.search(f"{r['category'] or ''} {r['title'] or ''}")]
    todo = wanted[:limit]
    counts = {"read": 0, "noText": 0, "failed": 0, "tooLarge": 0, "fromStore": 0, "skipped": len(rows) - len(wanted)}   # skipped: routine filings and big reports
    keep = {r["id"] for r in wanted}
    skipped = [r["id"] for r in rows if r["id"] not in keep]
    if skipped:     # recorded, so they never take the places of the filings to read in later runs
        async with store.pool.acquire() as conn:
            await conn.execute("INSERT INTO filing_reads (feed_id, status, tries, reason, read_at, retry_after) "
                               "SELECT u, 'skipped', 0, 'routine filing or a long report: not fetched', now(), NULL FROM unnest($1::bigint[]) AS u "
                               "ON CONFLICT (feed_id) DO NOTHING", skipped)
    reasons: Dict[str, int] = {}
    stop: Optional[str] = None
    own = fetcher is None
    f = fetcher or T.Fetcher(budget=limit + 20)
    done = 0
    try:
        for r in todo:
            if (clock() - t0) / 60 >= max_minutes:
                stop = f"time budget of {max_minutes:g} min used"
                break
            pages: Optional[List[str]] = None
            try:
                from .ask import docstore                          # a presentation or transcript another job already read: no new request
                pages = await docstore.get_pages(store, r["link"])
            except Exception:
                pages = None
            if pages:
                counts["fromStore"] += 1
            status, reason = "ok", None
            if not pages:
                try:
                    pdf = await f.pdf(r["link"], cap=PDF_CAP)
                    pages = T.extract_pages(pdf, max_pages=PDF_PAGES)
                except T.BudgetSpent:
                    stop = "request budget used"
                    break
                except T.Blocked as e:                              # the host refused: nothing more is asked of it this run; this file is not blamed
                    stop = f"host refused: {e}"
                    break
                except T.FetchFailed as e:
                    status, reason = ("too_large", str(e)) if "larger than the cap" in str(e) else ("failed", str(e))
                except Exception as e:                              # a broken file never stops the run
                    status, reason = "failed", type(e).__name__
            lead = lead_of(pages or []) if status == "ok" else ""
            if status == "ok" and not lead:
                status, reason = "no_text", "no readable text on the first pages (a scan or a cover page)"
            async with store.pool.acquire() as conn:
                if lead:
                    await conn.execute(SAVE_LEAD_SQL, r["id"], lead)
                await _record(conn, r["id"], status, (reason or "")[:200] or None)
            key = {"ok": "read", "no_text": "noText", "failed": "failed", "too_large": "tooLarge"}[status]
            counts[key] += 1
            if reason and status == "failed":
                reasons[reason[:60]] = reasons.get(reason[:60], 0) + 1
            done += 1
    finally:
        if own:
            await f.aclose()
    left = max(0, len(todo) - done)
    res: Dict[str, Any] = {"status": "ok", "pending": len(todo), "tried": done, **counts, "left": left, "failures": dict(sorted(reasons.items(), key=lambda x: -x[1])[:5]),
                           "minutes": round((clock() - t0) / 60, 1)}
    if stop:
        res["stopReason"] = stop + ("; the next run continues" if left else "")
    return res
