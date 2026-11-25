"""Task #281 (MF data gaps): the exit-load cleaner stored cut-off wording. It cut the text after the FIRST "exit load" anywhere in it, so AMFI's
"Exit Load of 1.00%" (Aditya Birla Sun Life Nifty 50 Index Fund, 119648) was stored as "of 1.00%" and Baroda BNP Paribas Large and Mid Cap's three
rules (148471) as their last sentence, "will be applicable on a FIFO ... basis". The texts below are AMFI's own (api/scheme-details, read 24-25 Nov 2026).
Now only a label is taken off, the page never shows a fragment, and a stored fragment is asked again at the next run of the loads step."""
from datetime import timedelta

import httpx
import pytest

from finlit import portfolios as P
from finlit.mfscore import exitload

ABSL = "Exit Load of 1.00%"
BARODA = ("• If Units are redeemed upto 10% of the Units, on or before 365 days from the date of allotment of Units : Nil\n• If Units are redeemed over "
          "and above the 10% limit, on or before 365 days from the date of allotment of Units : 1% of the applicable Net Asset Value (NAV)\n• If Units are "
          "redeemed after 365 days from the date of allotment of Units : Nil\n\nThe above Exit Load will be applicable on a FIFO (First-In-First-Out) basis, to "
          "all subscription transactions, excluding switch-ins.")


@pytest.mark.parametrize("raw, want", [
    (ABSL, "1.00%"),
    (BARODA, "If Units are redeemed upto 10% of the Units, on or before 365 days from the date of allotment of Units : Nil; If Units are redeemed over and "
             "above the 10% limit, on or before 365 days from the date of allotment of Units : 1% of the applicable Net Asset Value (NAV); If Units are redeemed "
             "after 365 days from the date of allotment of Units : Nil; The above Exit Load will be applicable on a FIFO (First-In-First-Out) basis, to all "
             "subscription transactions, excluding switch-ins."),
    ("Exit Load: 1.00% if redeemed within 365 days; nil after", "1.00% if redeemed within 365 days; nil after"),
    ("Entry Load - N.A\nExit Load (as a % of Applicable NAV):\n- An Exit Load of 1% is payable if Units are redeemed / switched-out upto 3 months from the date "
     "of allotment;\n- Nil if Units are redeemed / switched-out after 3 months from the date of allotment.",
     "An Exit Load of 1% is payable if Units are redeemed / switched-out upto 3 months from the date of allotment; Nil if Units are redeemed / switched-out "
     "after 3 months from the date of allotment."),
    ("10% of the units may be redeemed without any exit load from the date of allotment. Any redemption or switch-out in excess of the limit shall be subject "
     "to the following exit load: 1.00 % if redeemed on or before 365 days",
     "10% of the units may be redeemed without any exit load from the date of allotment. Any redemption or switch-out in excess of the limit shall be subject "
     "to the following exit load: 1.00 % if redeemed on or before 365 days"),
    ("Entry Load : Nil\r\nExit Load : \r\nIf redeemed before maturity date - 3%\r\nIf redeemed on maturity date - Nil",
     "If redeemed before maturity date - 3%; If redeemed on maturity date - Nil"),
    ("Entry Load: Nil\nExit Load: 1% if redeemed or switched out on or before completion of\n1 month from the date of allotment of units. Nil, thereafter.",
     "1% if redeemed or switched out on or before completion of 1 month from the date of allotment of units. Nil, thereafter."),
    ("Entry &amp; Exit Load: Nil", "Nil"),
    ("ENTRY LOAD NIL \nEXIT LOAD NA", "Nil"),
    ("Entry Load - nil, Exit Load - nil", "Nil"),
    ("Entry Load: Nil;\r\nExit Load: Not Applicable\r\n\r\n", "Nil"),
])
def test_the_whole_rule_is_kept_and_only_the_label_is_taken_off(raw, want):
    got = P.exit_load_text(raw)
    assert got == want
    assert not P.exit_load_fragment(got)


def test_what_the_old_cleaner_stored_is_a_fragment_and_never_shown():
    for cut in ("of 1.00%", "will be applicable on a FIFO (First-In-First-Out) basis, to all subscription transactions, excluding switch-ins."):
        assert P.exit_load_fragment(cut) and P.exit_load_shown(cut) is None
    for whole in ("Nil", "1% if redeemed within 1 year", "For Exits within 90 days from date of allotment of units : 0.50%.", "If redeemed before maturity - 2%"):
        assert not P.exit_load_fragment(whole) and P.exit_load_shown(whole) == whole
    assert P.exit_load_shown("1.00%") == "1.00% (AMFI's scheme details state no holding period; the scheme's own documents give the full rule)"


def test_the_scores_parser_reads_the_whole_rules():
    b = exitload.parse(P.exit_load_text(BARODA))           # "the 10% limit" is the free allowance again, not a 10% load
    assert (b.points, b.load, b.days) == (60, 1.0, 365)
    assert exitload.parse("will be applicable on a FIFO basis").points is None          # what was stored: unreadable
    assert exitload.parse("Since the Scheme will be listed on the stock exchange, exit load will not be applicable.").points == 100


def test_only_old_fragments_are_marked_for_a_new_read():
    assert P.exit_load_recut({"text": "of 1.00%"}) and P.exit_load_recut('{"text": "will be applicable on a FIFO basis"}')
    assert not P.exit_load_recut({"text": "1% if redeemed within 1 year"})                # an old whole text waits its normal 25 days
    assert not P.exit_load_recut({"text": "of 1.00%", "v": P.EXIT_TEXT_V})               # this cleaner's own text is never re-asked early


@pytest.mark.asyncio
async def test_the_loads_step_reasks_a_stored_fragment_and_stores_the_whole_rule(monkeypatch):
    from test_loads_queue_281 import Idx, Store
    fams = ["h1-fund-0", "h1-fund-1", "h1-fund-2"]
    s = Store(fams)
    s.put([("h1-fund-0", "exitload", None, {"text": "of 1.00%"}, None, None),                                         # cut by the old cleaner
           ("h1-fund-1", "exitload", None, {"text": "will be applicable on a FIFO (First-In-First-Out) basis"}, None, None),
           ("h1-fund-2", "exitload", None, {"text": "1% if redeemed within 1 year"}, None, None)])                      # whole: not asked again
    s.age("exitload", 2)

    async def put(pool, rows):
        s.put(rows)
    monkeypatch.setattr(P, "put_facts", put)
    monkeypatch.setattr(P, "LOAD_PAUSE_S", 0)
    monkeypatch.setattr(P, "excluded_amc", lambda name: False)
    asked = []

    def reply(req):
        p = req.url.path
        if p.endswith("populate-mf"):
            return httpx.Response(200, json=[{"mfId": "1", "mfName": "House One"}])
        if p.endswith("populate-scheme"):
            return httpx.Response(200, json=[{"scheme_name": f"H1 Fund {i}", "scheme_id": str(100 + i)} for i in range(3)])
        sid = req.url.params.get("scheme_id")
        asked.append(sid)
        return httpx.Response(200, json={"data": [{"Scheme_load": ABSL if sid == "100" else BARODA}]})
    async with P.make_client(httpx.MockTransport(reply)) as c:
        out = await P.step_loads(s, c, Idx(), P._today())
    assert sorted(asked) == ["100", "101"] and out["cutTextsToReread"] == 2 and out["loadsStored"] == 2
    assert s.facts[("h1-fund-0", "exitload")][0] == {"text": "1.00%", "v": P.EXIT_TEXT_V}
    assert s.facts[("h1-fund-1", "exitload")][0]["text"].startswith("If Units are redeemed upto 10% of the Units")
    assert s.facts[("h1-fund-2", "exitload")][0] == {"text": "1% if redeemed within 1 year"}
    asked.clear()
    async with P.make_client(httpx.MockTransport(reply)) as c:                       # the next night: all three fresh, nothing asked
        again = await P.step_loads(s, c, Idx(), P._today() + timedelta(days=1))
    assert asked == [] and again["cutTextsToReread"] == 0
