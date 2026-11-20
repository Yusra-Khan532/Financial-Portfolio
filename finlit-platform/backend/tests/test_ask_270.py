"""Task #270 (the team, 20 Nov 2026): "do the two stance format for necessary questions i.e at the end just give a small 2 line summary of whatever
you have given as the ans". The team's picture: "**Stance: Cautiously negative (bearish on inflation, cautiously positive on growth).**" then one line.

What must hold:
  1. A question that asks for a reading (how something is doing, its health, outlook, risks, a comparison) gets the two-line format; a lookup, a
     definition or how-to, a greeting and a request for advice do not.
  2. The format goes with the question (never into the cached system prompt): a bold "Stance: <word> (<what it rests on>)" from five words, then one
     sentence summing the answer up, before the Sources line; the stance describes, it is never a buy/sell call or forecast.
  3. The advice guard does not mistake a stance for advice, and still catches advice."""

from typing import List

import pytest

from finlit.ask import service
from test_ask import FakeClient, ask, enable, events_of  # noqa: F401
from test_auth import anon, app, signed_in  # noqa: F401
from test_integration import ingested, store  # noqa: F401

READINGS = ["how is indian economy doing", "How is Reliance doing?", "what are the red flags in Paytm", "Infosys vs TCS", "outlook for the IT sector",
            "is HDFC Bank in good shape", "Summarise Sansera's Q2 results", "what is the stance of this para", "tata motors kaisa hai",
            "how has my portfolio performed this year", "what do the numbers say about Asian Paints"]
NOT = ["what is the share price of TCS", "what is P/E", "what does ROCE mean", "should I buy Reliance", "define CAGR", "how do I add a stock to my watchlist",
       "hi", "when is the RBI meeting", "list the top 10 gainers", "which stock should I buy", "what is the target price of Infosys", "Reliance kharidna chahiye?"]


def test_necessary_questions_get_the_stance_and_lookups_definitions_and_advice_do_not():
    assert [q for q in READINGS if not service.needs_stance(q)] == []
    assert [q for q in NOT if service.needs_stance(q)] == []


def test_the_note_asks_for_the_teams_two_lines_and_describes_never_advises():
    n = service.stance_note("how is indian economy doing")
    assert n.startswith("[Answer format for this question") and "**Stance: <one of Positive, Cautiously positive, Mixed, Cautiously negative, Negative>" in n
    assert "Line 2: one plain sentence" in n and "before any \"Sources:\" line" in n and "never a call to buy, sell or hold" in n
    assert service.stance_note("what is P/E") == ""


def test_a_stance_is_not_advice_and_advice_is_still_caught():
    for w in service.STANCES:
        assert not service.reads_like_advice(f"**Stance: {w} (positive on growth, negative on inflation).**\nGrowth holds up but inflation is above the band.")
    assert service.reads_like_advice("Stance: Positive. You should buy it now.")


@pytest.mark.integration
async def test_the_endpoint_sends_the_format_with_a_reading_question_only(app):  # noqa: F811
    client = FakeClient([{"text": ["Growth is solid.\n**Stance: Mixed (positive on growth, negative on inflation).**\nGrowth holds up; prices weigh."]},
                         {"text": ["P/E is price divided by earnings per share."]}])
    enable(app, client)
    m = await signed_in(app, "stance@example.com", plan="gold")
    r, ev = await ask(m, "how is indian economy doing")
    assert r.status_code == 200, r.text
    user = client.calls[0]["messages"][-1]["content"]
    assert "[Answer format for this question" in user and user.endswith("how is indian economy doing")
    assert "Answer format for this question" not in client.calls[0]["system"][0]["text"]          # never in the cached system prompt
    assert "Stance: Mixed" in "".join(d.get("text", "") for e, d in ev if e == "text")
    r, ev = await ask(m, "What is P/E?")
    assert "Answer format for this question" not in client.calls[1]["messages"][-1]["content"]
    await m.aclose()
