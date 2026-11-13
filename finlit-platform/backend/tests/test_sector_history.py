"""The state history behind two Sector Pulse charts: lined up on one calendar, plain state names, insight cards worked out here, nothing about how a state is decided."""
import re
from datetime import date, timedelta

from finlit import sector_history as H

BANNED = re.compile(r"\b(buy|sell|hold|accumulate|avoid|target|best|worst|recommend|signal strength|threshold|weights?)\b", re.I)


def days(n, start=date(2026, 5, 4)):
    out, d = [], start
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def page(name, codes, ds):
    return {"name": name, "slug": name.lower().replace(" ", "-"), "kind": "industry", "history": {"dates": ds, "state_code": codes}}


def test_state_codes_become_six_plain_states_with_the_bounce_after_a_crash_apart():
    # the "FinLit final pages" pack (13 Nov 2026) shows "Bouncing back after a crash" as its own colour; sentences still count both bounces
    assert [H.key_of(c) for c in ("washout", "thrust_c", "thrust_cap", "confirmed", "fading", "neutral", "none", None)] == ["sold_off", "bouncing", "crash", "rising", "losing", "no_signal", None, None]
    assert H.WORD["crash"] == "Bouncing back after a crash" and set(H.BOUNCE) == {"bouncing", "crash"}
    assert H.WORD == {"sold_off": "Sold off", "crash": "Bouncing back after a crash", "bouncing": "Bouncing back", "rising": "Rising together", "losing": "Losing steam", "no_signal": "No clear signal"}


def test_week_ends_are_the_last_trading_day_of_each_week():
    ds = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"]
    assert H.week_ends(ds) == [4, 6]


def test_build_lines_groups_up_on_one_calendar_and_counts_each_day():
    ds = days(130)
    a = page("Alpha", ["washout"] * 130, ds)
    b = page("Beta", ["washout"] * 100 + ["thrust_c"] * 30, ds)
    c = page("Gamma", ["neutral"] * 130, ds[:120])            # a shorter history: blank on the days it has none
    r = H.build([a, b, c])
    assert len(r["dates"]) == 126 and r["dates"][-1] == ds[-1] and [g["name"] for g in r["groups"]] == ["Alpha", "Beta", "Gamma"]
    assert r["groups"][2]["states"][-1] is None and r["counts"]["sold_off"][-1] == 1 and r["counts"]["bouncing"][-1] == 1
    assert len(r["weeks"]) == 8 and set(r["weeks"][-1]["counts"]) == set(H.KEYS)


def test_the_cards_describe_what_happened_and_say_nothing_about_how():
    ds = days(130)
    pages = [page("Alpha", ["washout"] * 130, ds), page("Beta", ["washout"] * 120 + ["thrust_c"] * 10, ds), page("Gamma", ["confirmed"] * 60 + ["fading"] * 70, ds)]
    r = H.build(pages)
    mood = {i["title"]: i["text"] for i in r["insights"]["mood"]}
    assert mood["Bouncing back now"].startswith("1 industry is bouncing back today")
    assert "No industry is rising together today. The last day one was:" in mood["No industry rising together"]
    strip = {i["title"]: i["text"] for i in r["insights"]["strip"]}
    assert "Beta" in strip["Turned to a bounce this week"] or "No industry turned" in strip["Turned to a bounce this week"]
    assert "Alpha was sold off at" in strip["Longest run of Sold off Fridays"]
    text = " ".join(i["title"] + " " + i["text"] for v in r["insights"].values() for i in v)
    assert not BANNED.search(text) and "washout" not in text.lower() and "thrust" not in text.lower()


def test_the_changed_this_week_list_and_not_enough_history():
    ds = days(130)
    r = H.build([page("Beta", ["washout"] * 125 + ["thrust_c"] * 5, ds), page("Alpha", ["washout"] * 130, ds)])
    assert r["changed_this_week"] == [{"name": "Beta", "slug": "beta", "last": "Sold off", "now": "Bouncing back"}]
    assert H.build([]) is None and H.build([page("A", ["washout"] * 10, days(10))]) is None


def test_a_bounce_after_a_crash_counts_as_bouncing_back_in_the_sentences_and_has_its_own_count():
    dates = [f"2026-10-{d:02d}" for d in range(1, 31) if __import__("datetime").date(2026, 10, d).weekday() < 5]
    def page(name, codes):
        return {"name": name, "slug": name.lower(), "history": {"dates": dates, "state_code": codes}}
    pages = [page("A", ["washout"] * (len(dates) - 1) + ["thrust_cap"]), page("B", ["washout"] * (len(dates) - 1) + ["thrust_c"]), page("C", ["washout"] * len(dates))]
    out = H.build(pages)
    assert out["counts"]["crash"][-1] == 1 and out["counts"]["bouncing"][-1] == 1 and out["counts"]["sold_off"][-1] == 1
    assert out["insights"]["mood"][0]["text"].startswith("2 industries are bouncing back today")
