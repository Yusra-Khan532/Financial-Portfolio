"""Reading what a company's call filing says (task #278). Pure functions, no network: the job (service.py) downloads the PDF and passes its text here.

Listed companies file four things about an earnings call with the exchanges (SEBI LODR, Regulation 30 and Schedule III Part A Para A(15)):
the schedule (an intimation of the call, with its date and time, filed before it), the audio recording (a link, within 24 hours of the call), the
transcript (within five working days) and, often, the investor presentation. The exchange lists all of them under "Analysts/Institutional Investor
Meet/Con. Call Updates" (presentations also as "Investor Presentation"); the title says which ("Schedule of meet", "Link of Recording", "Transcript").

A "schedule of meet" is very often not an earnings call at all but a one-on-one or group meeting at a broker's conference; those are left out. The
date and time are read from the letter's own words ("held on Thursday, 19th November 2026 at 04:00 PM (IST)"); when the letter does not state them,
nothing is guessed."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import List, Optional, Tuple

# ------------------------------------------------------------------------------------------------ which filing is which
CALL_CATEGORY = re.compile(r"analyst|investor meet|con\.? ?call|investor presentation", re.I)
_RECORDING = re.compile(r"recording|audio|webcast", re.I)
_TRANSCRIPT = re.compile(r"transcript", re.I)
_PRESENTATION = re.compile(r"presentation", re.I)
_SCHEDULE = re.compile(r"schedule|intimation|earnings call|earning call|conference call|con\.? ?call|investor meet|analyst meet|analysts? call|investor call", re.I)
_OUTCOME = re.compile(r"outcome|participation|participated|non[- ]participation|update on", re.I)


def kind_of(category: Optional[str], title: str) -> Optional[str]:
    """'recording', 'transcript', 'presentation', 'schedule' or None (an outcome note, a conference attended, anything else) for one filing."""
    cat, t = category or "", title or ""
    text = f"{cat} {t}"
    if not CALL_CATEGORY.search(cat) and not re.search(r"con\.? ?call|earnings? call|transcript|recording|investor presentation", t, re.I):
        return None
    if _TRANSCRIPT.search(t):          # "Transcript and Link of Recording": the transcript (its letter also carries the link, read below)
        return "transcript"
    if _RECORDING.search(t):
        return "recording"
    if _PRESENTATION.search(text) and not _OUTCOME.search(t):
        return "presentation"
    if _OUTCOME.search(t):
        return None
    if _SCHEDULE.search(t):
        return "schedule"
    return None


# ------------------------------------------------------------------------------------------------ dates and times in a letter
MONTHS = {m: i + 1 for i, m in enumerate(("january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
                                          "november", "december"))}
MONTHS.update({m[:3]: n for m, n in list(MONTHS.items())})
MONTHS["sept"] = 9
_MON = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"
_YEAR = r"(2\s?0\s?\d\s?\d)"            # PDF text often splits a year ("202 6")
_DAY = r"(\d{1,2})\s*(?:st|nd|rd|th|['’\"]{1,2}\s*(?:st|nd|rd|th)?)?"
DATE_PATTERNS = (
    re.compile(_MON + r"\s+" + _DAY + r",?\s*" + _YEAR, re.I),                 # November 19, 2026 / Nov 19 2026
    re.compile(_DAY + r"\s*(?:of\s+)?" + _MON + r",?\s*" + _YEAR, re.I),       # 19th November, 2026 / 17'" November, 2026
    re.compile(r"\b(\d{1,2})[./-](\d{1,2})[./-]" + _YEAR + r"\b"),              # 19.11.2026 / 19-11-2026
)


def _year(s: str) -> int:
    return int(re.sub(r"\s", "", s))


def dates_in(text: str) -> List[Tuple[int, date]]:
    """Every date the text names, with where it starts, in order. A day or month that does not exist is skipped."""
    out: List[Tuple[int, date]] = []
    for i, rx in enumerate(DATE_PATTERNS):
        for m in rx.finditer(text):
            try:
                if i == 0:
                    d = date(_year(m.group(3)), MONTHS[m.group(1).lower()[:3]], int(m.group(2)))
                elif i == 1:
                    d = date(_year(m.group(3)), MONTHS[m.group(2).lower().rstrip(".")[:3]], int(m.group(1)))
                else:
                    d = date(_year(m.group(3)), int(m.group(2)), int(m.group(1)))
            except (ValueError, KeyError):
                continue
            out.append((m.start(), d))
    out.sort()
    # the same date found by two patterns at overlapping places: keep one
    kept: List[Tuple[int, date]] = []
    for pos, d in out:
        if kept and kept[-1][1] == d and pos - kept[-1][0] < 25:
            continue
        kept.append((pos, d))
    return kept


_TIME = re.compile(
    r"(?<![\d.,])(\d{1,2})\s*(?:[:.]\s*(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|noon|hrs?\.?|hours)(?![a-z])"   # 04:00 PM, 4 p.m., 12.00 Noon, 11:30 hrs
    r"|(?<![\d.,])([01]\d|2[0-3])([0-5]\d)\s*(?:hrs?\.?|hours)(?![a-z])",                                    # 1100 hrs
    re.I)


def time_after(text: str, start: int, span: int = 140) -> Optional[str]:
    """The first clock time stated within `span` characters after `start`, as 'HH:MM' (24 hours), or None."""
    m = _TIME.search(text, start, start + span)
    if not m:
        return None
    if m.group(4):
        h, mi = int(m.group(4)), int(m.group(5))
    else:
        h, mi = int(m.group(1)), int(m.group(2) or 0)
        unit = re.sub(r"[\s.]", "", (m.group(3) or "").lower())
        if unit.startswith("pm") and h < 12:
            h += 12
        elif unit.startswith("am") and h == 12:
            h = 0
        elif unit == "noon":
            h = 12
    if not (7 <= h <= 21 and 0 <= mi <= 59):        # calls are held in the working day (IST); anything else is a misread number
        return None
    return f"{h:02d}:{mi:02d}"


_HELD = re.compile(r"(?:held|hosted|conducted|schedul\w*|to be held|will be held|is to be held|on|dated?\s+of\s+the\s+call|date\s*(?:&|and)\s*time|date\s*:)\W{0,30}$", re.I)
_EARLIER = re.compile(r"(?:dated|letter|intimation|earlier|previous|vide|our\s+\w+\s+of)\W{0,20}$", re.I)
_TODAY = re.compile(r"\b(?:held|was held|concluded)\s+(?:today|earlier today)\b", re.I)
_PERIOD = re.compile(r"\bended(?:\s+on)?\W{0,10}$", re.I)      # "quarter ended September 30", "Q2 FY27 ended ...": a period end, never the call


@dataclass
class Letter:
    call_date: Optional[date] = None
    call_time: Optional[str] = None
    earnings: bool = False
    meeting_only: bool = False
    audio: List[str] = field(default_factory=list)
    links: List[str] = field(default_factory=list)
    quarter: Optional[str] = None


_EARNINGS = re.compile(r"earnings|financial results|unaudited|audited|results? (?:for|of) the (?:quarter|half|year|period)|quarterly results|"
                       r"financial performance|operational (?:and|&) financial performance|\bQ[1-4]\s*(?:&\s*H[12]\s*)?(?:FY|F\.Y\.)\s*'?\s*\d{2}|"
                       r"\bQ[1-4]\s*(?:results|FY)|(?:quarter|half[- ]year)\s+(?:and\s+\w+\s+)?ended|post[- ]results?", re.I)
_MEETING = re.compile(r"one[- ]on[- ]one|1\s*-\s*on\s*-\s*1|group meeting|conference (?:organi[sz]ed|hosted)|investor conference|broker|roadshow|road show|"
                      r"plant visit|site visit|non[- ]deal|in[- ]person meeting|meetings? with (?:the )?(?:investors|analysts|institutional)", re.I)
_CALL = re.compile(r"conference call|con[- ]?call|concall|earnings call|earning call|investors? call|analysts? call|audio call|webinar|video call|virtual call", re.I)
AUDIO_EXT = re.compile(r"\.(?:mp3|m4a|wav|aac|ogg|oga|opus|weba|mp4a)(?:$|[?#])", re.I)
_URL = re.compile(r"https?://[^\s\"'<>()\]\[]+", re.I)
EXCHANGE_HOSTS = ("nseindia.com", "bseindia.com", "nse.co.in", "sebi.gov.in")


def _fix_urls(text: str) -> str:
    """PDF text breaks a long link over lines ('https://jaibalajigroup.com/wp-content/uploads/2026/11/1004 9666.mp3'): join a link's parts when the
    break is inside the address (the piece before has no dot-word ending and the piece after continues the path)."""
    return re.sub(r"(https?://\S+?)\s+(\S+\.(?:mp3|m4a|wav|aac|ogg|pdf)\b)", lambda m: m.group(1) + m.group(2) if "/" in m.group(1)[8:] and not
                  re.search(r"\.(?:mp3|m4a|wav|aac|ogg|pdf|html?|aspx?|php)$", m.group(1), re.I) else m.group(0), text)


def quarter_of(text: str) -> Optional[str]:
    """'Q2 FY27' when the letter names the quarter, read from 'Q2 FY27', 'Q2FY2026-27', 'Q2 & H1 FY27' or 'quarter ended September 30, 2026'."""
    m = re.search(r"\bQ([1-4])\s*(?:&\s*H[12]\s*)?(?:FY|F\.Y\.)\s*'?\s*(?:(\d{4})\s*[-–]\s*(\d{2,4})|(\d{2,4}))", text, re.I)
    if m:
        q = int(m.group(1))
        if m.group(3):
            y = int(m.group(3)[-2:])
        else:
            y = int(m.group(4)[-2:])
        return f"Q{q} FY{y:02d}"
    m = re.search(r"quarter\s+(?:and\s+[\w\s-]{0,20}?)?ended(?:\s+on)?\W{0,5}", text, re.I)
    if m:
        ds = [d for p, d in dates_in(text[m.end():m.end() + 40]) if p < 5]
        if ds:
            d = ds[0]
            q = {6: 1, 9: 2, 12: 3, 3: 4}.get(d.month)
            if q:
                fy = d.year + 1 if d.month >= 4 else d.year
                return f"Q{q} FY{fy % 100:02d}"
    return None


def read_letter(text: str, kind: str, filed: Optional[date] = None) -> Letter:
    """What one filing says: the call's date and time, whether it is an earnings call, the audio and other links, the quarter."""
    body = _fix_urls(" ".join((text or "").split()))
    out = Letter()
    out.earnings = bool(_EARNINGS.search(body))
    out.meeting_only = bool(_MEETING.search(body)) and not _CALL.search(body)
    urls = [u.rstrip(".,;:") for u in dict.fromkeys(_URL.findall(body))]
    urls = [u for u in urls if not any(h in u.lower() for h in EXCHANGE_HOSTS)]
    out.audio = [u for u in urls if AUDIO_EXT.search(u)][:3]
    out.links = [u for u in urls if u not in out.audio and not re.search(r"\.pdf(?:$|[?#])", u, re.I)][:3]
    out.quarter = quarter_of(body)
    found = dates_in(body)
    letter_day = found[0][1] if found and found[0][0] < 400 else filed
    best: Optional[Tuple[int, date]] = None
    for pos, d in found:
        before = body[max(0, pos - 45):pos]
        if _EARLIER.search(before) or _PERIOD.search(before):       # "intimation dated ..." or "quarter ended ..." is not the call
            continue
        if found and pos == found[0][0] and pos < 400 and len(found) > 1:   # the letter's own date at the top
            continue
        if _HELD.search(before):
            best = (pos, d)
            break
        if best is None:
            best = (pos, d)
    m_today = _TODAY.search(body)
    if m_today and (best is None or best[0] > m_today.start() + 120):
        out.call_date = letter_day
        out.call_time = time_after(body, m_today.end())
    elif best is not None:
        out.call_date = best[1]
        out.call_time = time_after(body, best[0])
    if out.call_date and filed and kind in ("recording", "transcript") and (out.call_date > filed or (filed - out.call_date).days > 30):
        out.call_date, out.call_time = None, None          # a recording or transcript is filed after its call, within weeks: anything else is a misread
    if out.call_date and filed and kind == "schedule" and ((filed - out.call_date).days > 3 or (out.call_date - filed).days > 120):
        out.call_date, out.call_time = None, None
    return out


def is_earnings_schedule(letter: Letter, title: str) -> bool:
    """A schedule letter about an earnings / results call (kept), not a broker conference or a one-on-one (left out)."""
    # the exchange's own category words ("Analysts/Institutional Investor Meet/Con. Call Updates:") open many titles: only the company's words count
    own = re.sub(r"analysts?\s*/\s*institutional investors?\s*meet\s*/\s*con\.?\s*call updates?\s*:?", "", title or "", flags=re.I)
    if re.search(r"earnings|results?\b", own, re.I):
        return True
    return letter.earnings and not letter.meeting_only


def time_label(hhmm: Optional[str]) -> Optional[str]:
    """'16:00' -> '04:00 PM'."""
    if not hhmm:
        return None
    h, m = (int(x) for x in hhmm.split(":"))
    return f"{(h % 12) or 12:02d}:{m:02d} {'AM' if h < 12 else 'PM'}"
