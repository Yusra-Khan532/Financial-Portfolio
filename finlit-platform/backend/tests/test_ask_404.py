"""Task #404 (the team, 26 Nov 2026): "in this we just need a 3-4 lines stance like inference of finlit prism or conclusion that we get from finlit
prism. mind it just dont put up the score give it something meaningfull. just dont say it is avg or something. give meaning to things and not just
tell in sentences the score which a person can already see".

The AI summary of the FinLit Prism card is now the conclusion the card leads to, in 3 to 4 sentences, with no score and no band word. The server
checks the answer (service.stance_problems); one that restates the card is asked again once, and a second unfit answer is not counted."""
from finlit.ask import api as ask_api, quota, service
from test_ask import FakeClient, enable, pg, store_prism, summary  # noqa: F401
from test_auth import anon, app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401

# The team's picture (26 Nov 2026): the old summary, five numbered buckets that repeat each score and band.
OLD = """1. Overall
- **FinLit Prism 58.3 (Average)**: Rated, as the data the method needs is in place. Average means some parts are sound while others weigh on it.

2. Sound
- **Risk 82.2 (Strong)**: Higher Risk score means lower risk. Strong means the share has moved calmly, with smaller falls and few pledged shares.
- **Quality 75.3 (Healthy)**: Borrowing is under control, interest is well covered and profits are backed by cash.

4. Weighs on it
- **Valuation 49.9 (Weak)**: The share price looks high against its earnings and its own history."""

STANCE = ("The business is on firm footing: borrowing is under control, interest is well covered and profits turn into cash. Growth is the soft "
          "spot, with sales rising steadily quarter to quarter but slowly over five years. The share price already asks a lot of those earnings "
          "against its own history, while the share itself has traded calmly. The longer price trend is down and recent weeks have only gone sideways.")


def test_the_teams_picture_is_refused_and_a_real_stance_passes():
    probs = service.stance_problems(OLD)
    assert any("band words" in p for p in probs) and any("scores" in p for p in probs) and any("list" in p for p in probs)
    assert service.stance_problems(STANCE) == []
    assert len([s for s in STANCE.split(". ") if s]) == 4


def test_scores_band_labels_avg_and_advice_are_caught_but_plain_words_and_card_facts_are_not():
    assert service.stance_problems("Overall it is avg. Margins are thin.") and service.stance_problems("Its rating is Average, with thin margins.")
    assert service.stance_problems("Quality reads 75.3 and risk is low.") and service.stance_problems("It scores 58 out of 100.")
    assert any("advice" in p for p in service.stance_problems("The price looks attractive, so investors should consider buying."))
    # ordinary English and the card's own facts stay allowed: a sentence may start with "Strong", "strong" may describe cash, and 9 of 10 quarters,
    # a 12.4% margin or 2.5 times interest cover are facts, not scores
    ok = ("Strong cash generation backs the profits. Sales grew in 9 of 10 quarters and the margin is 12.4%. Interest is covered 2.5 times. "
          "The share has traded calmly.")
    assert service.stance_problems(ok) == []
    assert any("sentences" in p for p in service.stance_problems(" ".join(["One fact here."] * 7)))


def test_the_question_asks_for_a_stance_and_a_new_cache_version():
    q = service.summary_question("RELIANCE")
    assert "3 to 4 short sentences" in q and "one paragraph" in q and "never a score" in q and "Strong, Healthy, Average, Weak, Poor" in q
    assert "Describe, never advise" in q and "undervalued" in q
    assert service.SUMMARY_VERSION == "v6" and service.OLD_SUMMARY_VERSIONS == ("v5",)
    k = ask_api.cache_key("m", ask_api.Ctx(plan="gold"), ask_api.AskIn(kind="summary", symbol="RELIANCE"))
    assert ":summary:v6:" in k


@pg
async def test_a_summary_that_restates_the_card_is_asked_again_once_and_the_rewrite_is_shown(app):
    await store_prism(app)
    client = FakeClient([{"text": [OLD]}, {"text": [STANCE]}])
    enable(app, client)
    m = await signed_in(app, "st404a@example.com", plan="gold")
    r, ev = await summary(m)
    assert r.status_code == 200 and len(client.calls) == 2
    retry = client.calls[1]["messages"]
    assert retry[-2] == {"role": "assistant", "content": OLD} and "Rewrite that summary" in retry[-1]["content"] and "band words" in retry[-1]["content"]
    assert ("replace", {"text": STANCE}) in ev and ev[-1][0] == "done"
    assert (await m.get("/api/ask/quota")).json()["summary"]["used"] == 1                    # one summary, however many tries
    _, ev2 = await summary(m)                                                                 # the cached text is the stance, not the first draft
    assert ev2[0][1]["cached"] is True and ev2[1] == ("text", {"text": STANCE})


@pg
async def test_a_second_unfit_answer_is_not_shown_and_not_counted(app):
    await store_prism(app)
    client = FakeClient([{"text": [OLD]}, {"text": [OLD]}])
    enable(app, client)
    m = await signed_in(app, "st404b@example.com", plan="gold")
    r, ev = await summary(m)
    assert r.status_code == 200 and ev[-1][0] == "error" and ev[-1][1]["code"] == "unfit" and "Summarise again" in ev[-1][1]["text"]
    assert ("replace", {"text": ""}) in ev
    assert (await m.get("/api/ask/quota")).json()["summary"]["used"] == 0


@pg
async def test_a_member_who_had_the_old_form_today_gets_the_new_form_without_using_a_summary(app):
    await store_prism(app)
    client = FakeClient([{"text": [STANCE]}])
    enable(app, client)
    m = await signed_in(app, "st404c@example.com", plan="gold")
    key = ask_api.cache_key(app.state.settings.ask_model, ask_api.Ctx(plan="gold"), ask_api.AskIn(kind="summary", symbol="RELIANCE"))
    await app.state.store.redis.set(key.replace(":v6:", ":v5:"), '{"text": "old"}', ex=60)
    r, ev = await summary(m)
    assert r.status_code == 200 and ev[-1][0] == "done" and len(client.calls) == 1
    assert (await m.get("/api/ask/quota")).json()["summary"]["used"] == 0
    assert quota.month_of()                                                                   # the month's count is untouched
