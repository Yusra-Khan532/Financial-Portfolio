"""Task #281, round 4a: fund holdings for the houses that had none.

- A fund-house file whose sheets did not all match a scheme (or failed the checks) is read again on the next run; before, it was marked done and a
  scheme that was not in AMFI's list at the first reading never got its holdings (Angel One's index funds and funds of funds on 20 Nov 2026).
- The factsheet reader (HDFC's monthly factsheet PDF): HDFC Flexi Cap Fund, September 2026, read from the pages' characters (fixture: the two pages'
  characters and bold words, no PDF), every row and the Grand Total. HDFC stays out of the nightly list until the owner decides (its file store
  refuses the job's agent)."""

from __future__ import annotations

import gzip
import json
from datetime import date
from pathlib import Path

import httpx
import pytest

from finlit import portfolios
from finlit.disclosure_parsers import houses_e
from finlit.disclosure_parsers.amcs import ADAPTERS, Adapter, FileRef
from finlit.disclosure_parsers.model import Holding, Portfolio, validate
from test_portfolios import store  # noqa: F401  (the database fixture)

FX = Path(__file__).parent / "fixtures" / "disclosure"


# ------------------------------------------------------------------------------------------------------------ the factsheet reader
class _Page:
    """What the reader needs of a pdfplumber page, from the fixture."""

    def __init__(self, d):
        self.width = d["width"]
        self.chars = [{"text": t, "x0": a, "x1": b, "top": c, "bottom": e, "fontname": "Cambria-Bold" if bold else "Cambria", "upright": bool(up)}
                      for t, a, b, c, e, bold, up in d["chars"]]
        self._words = [{"text": t, "x0": a, "x1": b, "top": c, "bottom": e, "fontname": "Cambria-Bold"} for t, a, b, c, e in d["bold_words"]]

    def extract_words(self, extra_attrs=None):
        return self._words


def _flexicap():
    with gzip.open(FX / "hdfc_flexicap_factsheet_2026_09.json.gz", "rt", encoding="utf-8") as fh:
        pages = [_Page(d) for d in json.load(fh)]
    ps = houses_e.read_pages(pages, date(2026, 9, 30), houses_e.HDFC_SOURCE, houses_e.hdfc_factsheet_url(date(2026, 9, 30)))
    assert [p.scheme_name for p in ps] == ["HDFC Flexi Cap Fund"]          # the second page goes on under the same title ('....Contd from previous page')
    return ps[0]


def test_hdfc_flexi_cap_every_row_adds_up_to_the_factsheets_grand_total():
    p = _flexicap()
    assert p.published_total_pct == 100.0 and len(p.holdings) == 85
    assert sum(h.pct_nav for h in p.holdings) == pytest.approx(100.0, abs=0.005)
    assert validate(p, date(2026, 11, 20)).ok


def test_hdfc_flexi_cap_top_ten_as_the_factsheet_prints_them():
    top = sorted(_flexicap().holdings, key=lambda h: -h.pct_nav)[:10]
    assert [(h.name, h.pct_nav) for h in top] == [
        ("ICICI Bank Ltd.", 8.80), ("Axis Bank Ltd.", 6.11), ("HDFC Bank Ltd.", 6.03), ("State Bank of India", 3.94), ("Eternal Limited", 3.46),
        ("Kotak Mahindra Bank Limited", 3.40), ("SBI Life Insurance Company Ltd.", 3.25), ("Larsen and Toubro Ltd.", 3.08),
        ("InterGlobe Aviation Ltd.", 2.99), ("Bharti Airtel Ltd.", 2.62)]
    assert top[0].sector == "Banks" and top[6].sector == "Insurance"


def test_hdfc_flexi_cap_sections_wrapped_names_and_cash():
    hs = {h.name: h for h in _flexicap().holdings}
    assert hs["Power Grid Corporation of India Ltd."].pct_nav == 2.11                       # a name over two lines
    assert hs["Ashok Leyland Ltd"].sector == "Agricultural, Commercial & Construction Vehicles"   # an industry over four lines
    assert hs["Nexus Select Trust REIT"].asset_class == "other" and hs["Nexus Select Trust REIT"].pct_nav == 1.70
    assert hs["7.38 GOI 2027"].asset_class == "debt" and hs["7.38 GOI 2027"].sector is None
    assert hs["Cash,Cash Equivalents and Net Current Assets"].asset_class == "cash"         # one name over the name and industry columns
    assert not any(k.startswith(("Units issued", "Government Securities", "Sep 30", "PERFORMANCE")) for k in hs)   # headings and other boxes are not rows
    assert all(h.isin is None for h in hs.values())                                          # the factsheet prints no ISINs


def test_a_row_the_factsheet_prints_twice_is_counted_once_only_when_that_matches_its_total():
    def p(rows, total):
        x = Portfolio(scheme_key="s", as_of=date(2026, 9, 30), source_name="s", source_url="u", scheme_name="s", published_total_pct=total)
        x.holdings = [Holding(n, None, None, "debt", v) for n, v in rows]
        return x
    twice = p([("7.34 GOI 2064", 2.91), ("Other", 97.09), ("7.34 GOI 2064", 2.91)], 100.0)    # 102.91 against a total of 100.00
    houses_e._drop_repeated_row(twice)
    assert len(twice.holdings) == 2 and "printed twice" in twice.notes[0]
    real = p([("A", 2.0), ("A", 2.0), ("B", 96.0)], 100.0)        # two equal lots that the total counts: both stay
    houses_e._drop_repeated_row(real)
    assert len(real.holdings) == 3 and not real.notes


@pytest.mark.parametrize("month_end, url_part", [
    (date(2026, 9, 30), "2026-10/HDFC%20MF%20Factsheet%20-%20September%202026.pdf"),
    (date(2026, 12, 31), "2027-01/HDFC%20MF%20Factsheet%20-%20December%202026.pdf")])
def test_hdfc_files_each_factsheet_in_the_next_months_folder(month_end, url_part):
    assert houses_e.hdfc_factsheet_url(month_end).endswith(url_part)


def test_hdfc_is_ready_but_not_run_until_the_owner_decides():
    assert houses_e.HDFC.parse_file is houses_e.parse_hdfc
    assert "hdfc" not in {a.key for a in ADAPTERS}


# ------------------------------------------------------------------------------------------------------------ files read again until whole
def _house(unmatched: list):
    """A fund house with one monthly file; its reader reports an unmatched sheet while `unmatched` holds True."""
    reads = []

    async def lister(client, months):
        return [FileRef("t281", "https://example.org/oct.xlsx", date(2026, 10, 31), None, "October 2026")]

    def parse(path, ref, adapter, idx, stats, sink):
        reads.append(ref.url)
        stats["sheets"] += 1
        if unmatched and unmatched[0]:
            stats["unmapped"].append({"scheme": "A New Fund", "why": "no scheme with this name in AMFI's list"})

    ad = Adapter("t281", "Test House", r"^test", lister, "example.org")
    ad.parse_file = parse
    return ad, reads


async def test_a_file_with_an_unmatched_scheme_is_read_again_until_every_sheet_matches(store):  # noqa: F811
    unmatched = [True]
    ad, reads = _house(unmatched)
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, content=b"x"))) as c:
        idx = portfolios.Index()
        await portfolios.step_amc(store.pool, c, ad, idx, date(2026, 11, 20), 1, False)
        await portfolios.step_amc(store.pool, c, ad, idx, date(2026, 11, 20), 1, False)
        assert len(reads) == 2                              # the scheme was not matched: the file stays due
        unmatched[0] = False                                # AMFI lists the scheme now
        await portfolios.step_amc(store.pool, c, ad, idx, date(2026, 11, 20), 1, False)
        r = await portfolios.step_amc(store.pool, c, ad, idx, date(2026, 11, 20), 1, False)
        assert len(reads) == 3 and r["skipped_existing"] == 1  # read whole once: skipped after that


async def test_an_older_done_marker_with_unmatched_sheets_counts_as_not_done(store):  # noqa: F811
    async with store.pool.acquire() as conn:
        for period, detail in (("2026-10:a.xlsx", {"sheets": 3, "rejected": 0, "unmapped": 2}), ("2026-10:b.xlsx", {"sheets": 3, "rejected": 0, "unmapped": 0}),
                               ("2026-10:c.xlsx", {"sheets": 3, "rejected": 1, "unmapped": 0})):
            await conn.execute("INSERT INTO disclosure_runs (source, period, status, detail, updated_at) VALUES ('t281', $1, 'done', $2::jsonb, now())",
                               period, json.dumps(detail))
    assert not await portfolios._file_done(store.pool, "t281", "2026-10:a.xlsx")
    assert await portfolios._file_done(store.pool, "t281", "2026-10:b.xlsx")
    assert not await portfolios._file_done(store.pool, "t281", "2026-10:c.xlsx")
