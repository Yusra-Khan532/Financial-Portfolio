"""Trading Lab > Signals desk (lab/signals.py; docs/TRADING-LAB.md "Signals switch" and build order item 8): the TradingAgents flow on FinLit's own
stored data, only for a member whose grant has the signals switch. Analysts, a two-round bull/bear debate, a research manager's Buy-to-Sell rating,
a trader's plan worked out from the stored levels and a cautious/balanced/aggressive trade-size debate; every figure cites the sheet, every step is
checked, retried once inside the run's caps, and stops plainly when it cannot keep to the rules. The AI is a scripted fake built on Ask FinLit AI's
own test fake (tests/test_ask.FakeClient): no key, no cost, no call to a real service."""
import json
import re
from datetime import date, timedelta
from pathlib import Path

import orjson
import pytest

from finlit.lab import case as C, signals as S
from test_ask import FakeClient, enable
from test_auth import anon, app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration


def candles(n=260, start=date(2025, 9, 1), first=100.0, step=0.25, hl=True):
    """n weekday candles rising by `step` a day; high and low one rupee either side of the close (None without highs and lows)."""
    out, d, c = [], start, first
    while len(out) < n:
        if d.weekday() < 5:
            out.append((d, c, (c + 1) if hl else None, (c - 1) if hl else None, round(c, 2)))
            c += step
        d += timedelta(days=1)
    return out


SNAP = {"tradeDay": "2026-11-26", "takenAt": "2026-11-26T15:30:00+05:30"}


def flow_row(last):
    return {"symbol": "RELIANCE", "changePct": 1.23, "oiChangePct": 6.5, "buildup": "long_buildup", "price": last, "vwap": round(last - 0.6, 2),
            "vwapGapPct": 0.36, "pivots": {"s2": last - 12, "s1": last - 6, "p": last - 1, "r1": last + 8, "r2": last + 15}, "pivotsFrom": "2026-11-25"}


def make_ins(sections, fno=True, news=True, n=260, hl=True):
    """The desk's inputs without a database: the case sheet from the stored RELIANCE report and synthetic candles, plus the desk's facts."""
    k = candles(n, hl=hl)
    closes = [(d, c) for d, _o, _h, _l, c in k]
    row = flow_row(k[-1][4]) if fno else None
    base = C.number(C.price_facts(closes, "Daily prices, NSE daily candles") + C.report_facts(sections["summary"], sections["ratios"], sections["financials"], "standalone")
                    + C.flow_facts(row, SNAP))
    lv = S.levels_of(k)
    rows = [{"item_date": date(2026, 11, 25), "title": "Reliance Industries Ltd has informed the Exchange regarding a board meeting", "score": 0.32},
            {"item_date": date(2026, 11, 20), "title": "Clarification sought on price movement", "score": -0.21}] if news else []
    facts = S.extend(base, S.technical_facts(lv, "NSE daily candles") + S.flow_level_facts(row, SNAP) + S.news_facts(rows, "RELIANCE"))
    by = {f["key"]: f for f in base}
    return {"symbol": "RELIANCE", "name": "Reliance Industries Ltd", "facts": facts, "levels": lv, "candleSource": "NSE daily candles", "fno": fno,
            "news": news, "pivots": (row or {}).get("pivots"), "hi52": (by.get("high_52w") or {}).get("value"), "lo52": (by.get("low_52w") or {}).get("value"),
            "newsDate": "2026-11-25" if news else None, "prices": [], "inputs": {"statement": "standalone", "filingDate": "2026-06-30", "priceDate": k[-1][0].isoformat()}}


# ------------------------------------------------------------------------------------------------------------------ a scripted desk

_FACT = re.compile(r"^\[(\d+)\] (.*) \(source: .*\)$", re.M)
PICK = {"Technical analyst": ("last_close", "sma20", "rsi14"), "Financials analyst": ("roe", "pe", "net_margin"),
        "News and sentiment analyst": ("news_count", "news_sentiment"), "Order Flow analyst": ("flow_buildup", "pivots", "vwap"),
        "Bull researcher": ("cfo_to_pat", "change_1y"), "Bear researcher": ("roe", "profit_cagr")}


def facts_in(content):
    return {int(m.group(1)): m.group(2) for m in _FACT.finditer(content)}


class Desk(FakeClient):
    """Writes a rule-keeping answer for whichever step it is asked (read back from the request), with the sheet's own fact texts. `bad` makes
    a step's first answers break a rule (a figure that is not in its fact); `rating` is the research manager's word."""

    def __init__(self, rating="Buy", bad=None, keys=None):
        super().__init__([])
        self.rating, self.bad, self.keys = rating, dict(bad or {}), keys or {}

    def stream(self, **params):
        content = params["messages"][0]["content"]
        step = {"1": "analysts", "2": "debate", "3": "rating", "4": "plan", "5": "sizes"}[re.search(r"Step (\d) of 5", content).group(1)]
        text = self.answer(step, content)
        if self.bad.get(step):
            self.bad[step] -= 1
            text = re.sub(r"\d+\.\d\d", "999.99", text, count=1)
        self.turns.append({"text": [text]})
        return super().stream(**params)

    def answer(self, step, content):
        facts = facts_in(content)
        key_n = self.keys or {}
        line = lambda n: f"- {facts[n]} [{n}]."      # noqa: E731
        if step in ("analysts", "debate"):
            heads = re.search(r"headings:\n(.*?)\nUnder", content, re.S).group(1).split("\n")
            out = []
            for h in heads:
                out.append(h)
                ns = [key_n[k] for k in PICK[h] if k in key_n][:2]
                out += [line(n) for n in ns] or ["- The sheet holds nothing more on this."]
            return "\n".join(out)
        if step == "rating":
            return "\n".join(["Rating", self.rating, "Reasons", line(key_n["roe"]), line(key_n["cfo_to_pat"]), line(key_n["rsi14"])])
        a, b = map(int, re.search(r"facts \[(\d+)\] to \[(\d+)\]", content).groups())
        if step == "plan":
            return "\n".join(["Trader's plan", *[line(n) for n in range(a, b + 1)]])
        return "\n".join(sum(([t, line(a + i)] for i, t in enumerate(("Cautious", "Balanced", "Aggressive"))), []))


def desk(ins, **kw):
    return Desk(keys={f["key"]: f["n"] for f in ins["facts"]}, **kw)


async def run(ins, client, events=None):
    async def emit(e, d):
        if events is not None:
            events.append((e, json.loads(json.dumps(d))))
    return await S.run(client, "the-configured-model", "low", 2000, ins, emit)


# ------------------------------------------------------------------------------------------------------------------ the sheet's extra facts

def test_the_technical_levels_come_from_the_stored_candles():
    k = candles()
    lv = S.levels_of(k)
    last = k[-1][4]
    assert lv["last"] == last and lv["atr"] == pytest.approx(2.0) and lv["atrBasis"] == "true range"      # high - low = 2 every session
    assert lv["hi20"] == last + 1 and lv["lo20"] == pytest.approx(k[-20][4] - 1) and lv["hi20Day"] == k[-1][0].isoformat()
    assert lv["sma20"] == pytest.approx(sum(c[4] for c in k[-20:]) / 20) and lv["rsi14"] == 100.0           # never a falling close
    f = {x["key"]: x for x in S.technical_facts(lv, "NSE daily candles")}
    assert f["atr14"]["text"] == f"14-session average true range ₹2.00, {2 / last * 100:.2f}% of the last close"
    assert f["range20"]["text"].startswith(f"20-session high and low: high ₹{C.indian(last + 1, 2)} on ")
    assert all(x["source"].startswith("NSE daily candles, sessions to ") for x in f.values())
    no_hl = S.levels_of(candles(hl=False))
    assert no_hl["atrBasis"] == "close-to-close move" and no_hl["atr"] == pytest.approx(0.25) and no_hl["hl"] is False
    assert "no highs and lows stored" in {x["key"]: x for x in S.technical_facts(no_hl, "x")}["atr14"]["text"]
    short = S.levels_of(candles(12))
    assert "atr" not in short and "hi20" not in short and "sma50" not in short        # a level needs its full window
    assert S.levels_of([]) == {} and S.technical_facts({}, "x") == []


def test_news_facts_only_when_news_is_stored():
    rows = [{"item_date": date(2026, 11, 25), "title": "Board  meeting outcome", "score": 0.6}, {"item_date": date(2026, 11, 2), "title": "Volume query", "score": None}]
    f = S.news_facts(rows, "RELIANCE")
    assert f[0]["text"] == "2 news items and exchange announcements stored for RELIANCE from 2 Nov 2026 to 25 Nov 2026"
    assert f[1]["text"] == "Sentiment of 1 scored items: average +0.60 on a scale of -1 to +1; 1 positive, 0 neutral, 0 negative"
    assert f[2]["text"] == "Headline of 25 Nov 2026: Board meeting outcome (sentiment positive)" and f[3]["text"] == "Headline of 2 Nov 2026: Volume query"
    assert S.news_facts([], "RELIANCE") == []


def test_the_extra_facts_are_numbered_after_the_case_sheet(reliance_sections):
    ins = make_ins(reliance_sections)
    ns = [f["n"] for f in ins["facts"]]
    assert ns == list(range(1, len(ns) + 1))
    keys = [f["key"] for f in ins["facts"]]
    assert keys.index("sma20") > keys.index("roe") and {"pivots", "vwap", "news_count", "news_sentiment", "atr14", "range20"} <= set(keys)
    assert {f["groupLabel"] for f in ins["facts"]} >= {"Technical levels", "Order Flow levels", "News and sentiment"}


# ------------------------------------------------------------------------------------------------------------------ the plan and the sizes

def test_the_plan_is_worked_out_from_the_stored_levels(reliance_sections):
    ins = make_ins(reliance_sections)
    lv, pv = ins["levels"], ins["pivots"]
    last, atr = lv["last"], lv["atr"]
    p = S.trade_plan("Buy", lv, pv, True, ins["hi52"], ins["lo52"])
    assert p["side"] == "long" and p["entryLow"] == round(last - 0.5 * atr, 2) and p["entryHigh"] == last and p["mid"] == round(last - 0.25 * atr, 2)
    # the 20-session low is 4.75 under the zone (between a quarter and three ATR): the stop sits a quarter ATR under it
    assert p["stop"] == round(lv["lo20"] - 0.25 * atr, 2) and p["stopBasis"] == "a quarter ATR under the 20-session low"
    risk = p["mid"] - p["stop"]
    assert p["riskPerShare"] == round(risk, 2) and p["riskPct"] == round(risk / p["mid"] * 100, 2)
    # the 20-session high is closer than one risk unit, so the first target is pivot R1, the second pivot R2
    assert [(t["price"], t["basis"]) for t in p["targets"]] == [(round(pv["r1"], 2), "pivot R1"), (round(pv["r2"], 2), "pivot R2")]
    assert p["targets"][0]["rr"] == round((pv["r1"] - p["mid"]) / risk, 2) and p["timeFrame"] == "up to 20 sessions"
    # with no stored level in reach, the targets are 1.5 and 3 times the risk
    q = S.trade_plan("Overweight", lv, None, False)
    assert [t["basis"] for t in q["targets"]] == ["1.5 times the risk from the middle of the entry zone", "3 times the risk from the middle of the entry zone"]
    assert q["targets"][0]["price"] == round(q["mid"] + 1.5 * (q["mid"] - q["stop"]), 2)
    # a short is the mirror image, and only where futures exist
    s = S.trade_plan("Sell", lv, pv, True)
    assert s["side"] == "short" and s["entryLow"] == last and s["stop"] > s["entryHigh"] and all(t["price"] < s["mid"] for t in s["targets"])
    assert S.trade_plan("Underweight", lv, pv, False)["side"] == "none" and S.trade_plan("Underweight", lv, pv, False)["reason"] == "no_short"
    h = S.trade_plan("Hold", lv, pv, True)
    assert h["side"] == "none" and h["stop"] is None and h["targets"] == [] and h["watch"] == {"support": lv["lo20"], "resistance": lv["hi20"]}
    assert S.trade_plan("Buy", S.levels_of(candles(10)), None, False) is None           # no ATR, no plan


def test_the_sizes_are_the_risk_per_trade_over_the_stop_distance():
    plan = {"side": "long", "riskPct": 4.0}
    s = {x["id"]: x for x in S.trade_sizes(plan)}
    assert s["cautious"]["positionPct"] == 12.5 and s["cautious"]["riskPct"] == 0.5 and not s["cautious"]["capped"]
    assert s["balanced"]["positionPct"] == 25.0 and s["balanced"]["riskPct"] == 1.0
    assert s["aggressive"]["positionPct"] == 50.0 and s["aggressive"]["riskPct"] == 2.0 and s["aggressive"]["capped"]      # held to 50% of capital
    tight = {x["id"]: x for x in S.trade_sizes({"side": "long", "riskPct": 1.0})}
    assert tight["cautious"]["positionPct"] == 15.0 and tight["cautious"]["riskPct"] == 0.15                               # the cap, and the risk it leaves
    assert S.trade_sizes({"side": "none", "riskPct": None}) == []
    f = S.size_facts(S.trade_sizes(plan))
    assert f[0]["text"] == "Cautious size: 12.50% of capital in the trade, 0.50% of capital at risk at the stop (4.00% away) (at most 15% in one trade)"


# ------------------------------------------------------------------------------------------------------------------ the check of one step

def test_a_step_keeps_every_figure_to_a_cited_fact_and_a_figure_without_its_number_fails(reliance_sections):
    ins = make_ins(reliance_sections)
    k = {f["key"]: f for f in ins["facts"]}
    good = "\n".join(["Bull researcher", f"- {k['roe']['text']} [{k['roe']['n']}].", "Bear researcher", f"- {k['pe']['text']} [{k['pe']['n']}]."])
    r = S.check_step("debate", good, ins["facts"], S.DEBATE)
    assert r["problems"] == [] and [s["id"] for s in r["sections"]] == ["bull", "bear"]
    unsourced = good.replace(f" [{k['pe']['n']}].", ".")
    assert any("without the number of its fact" in p for p in S.check_step("debate", unsourced, ins["facts"], S.DEBATE)["problems"])
    unknown = good.replace(f"[{k['roe']['n']}]", "[999]")
    assert any("[999]" in p and "not in the fact sheet" in p for p in S.check_step("debate", unknown, ins["facts"], S.DEBATE)["problems"])
    wrong = good.replace("6.93%", "7.93%")
    assert any("7.93 is not in the fact it cites" in p for p in S.check_step("debate", wrong, ins["facts"], S.DEBATE)["problems"])
    promise = good.replace("Bear researcher\n- ", "Bear researcher\n- A guaranteed fall aside, ")
    assert any("promise words" in p and "guaranteed" in p for p in S.check_step("debate", promise, ins["facts"], S.DEBATE)["problems"])
    # the desk may use the rating words the rest of the site never uses
    assert S.check_step("debate", good.replace("- ROE", "- Buy the share: ROE", 1), ins["facts"], S.DEBATE)["problems"] == []


def test_the_rating_is_one_word_of_the_five_step_scale_and_every_reason_cites_a_fact(reliance_sections):
    ins = make_ins(reliance_sections)
    k = {f["key"]: f for f in ins["facts"]}
    reasons = [f"- {k[x]['text']} [{k[x]['n']}]." for x in ("roe", "pe", "rsi14")]
    for word in S.RATINGS:
        r = S.check_step("rating", "\n".join(["Rating", word, "Reasons", *reasons]), ins["facts"], S.RATING_TITLES)
        assert r["problems"] == [] and r["rating"] == word
    one_line = S.check_step("rating", "\n".join(["Rating: Overweight", "Reasons", *reasons]), ins["facts"], S.RATING_TITLES)
    assert one_line["problems"] == [] and one_line["rating"] == "Overweight"
    for bad in ("Strong buy", "Accumulate", "Buy or Hold"):
        assert any("not exactly one of" in p for p in S.check_step("rating", "\n".join(["Rating", bad, "Reasons", *reasons]), ins["facts"], S.RATING_TITLES)["problems"])
    no_cite = "\n".join(["Rating", "Buy", "Reasons", *reasons[:2], "- The business looks sound."])
    assert any("does not end with the number" in p for p in S.check_step("rating", no_cite, ins["facts"], S.RATING_TITLES)["problems"])


# ------------------------------------------------------------------------------------------------------------------ the run

async def test_the_five_steps_run_in_order_inside_the_caps_with_the_fake_only(reliance_sections):
    ins = make_ins(reliance_sections)
    client, events = desk(ins), []
    res = await run(ins, client, events)
    assert res["outcome"] == "done" and len(client.calls) == 6 <= S.MAX_CALLS
    order = [re.search(r"Step (\d) of 5(?:, the researchers' debate, round (\d))?", c["messages"][0]["content"]).groups() for c in client.calls]
    assert order == [("1", None), ("2", "1"), ("2", "2"), ("3", None), ("4", None), ("5", None)]
    for c in client.calls:
        assert c["model"] == "the-configured-model" and c["max_tokens"] == 2000 and "tools" not in c and c["system"][0]["text"] == S.SYSTEM
    assert [s["status"] for s in res["steps"]] == ["done"] * 5
    caps = res["caps"]
    assert caps["calls"] == 6 and caps["maxCalls"] == 8 and caps["tokens"] == 6 * 120 <= caps["tokenBudget"] == S.TOKEN_BUDGET and caps["rounds"] == 2
    # progress: each step says it started, then that it ended, in order
    seen = [(d["id"], d["status"]) for e, d in events if e == "step"]
    assert seen[:2] == [("analysts", "running"), ("analysts", "done")] and seen[-1] == ("sizes", "done")
    assert [s for s, st in seen if st == "done"] == ["analysts", "debate", "rating", "plan", "sizes"]
    # the analysts, the two rounds, the rating with its cited reasons
    notes = res["steps"][0]["notes"]
    assert [n["title"] for n in notes] == [t for _, t in S.ANALYSTS] and all(n["written"] for n in notes)
    assert [r["round"] for r in res["steps"][1]["rounds"]] == [1, 2]
    assert res["rating"]["value"] == "Buy" and res["rating"]["step"] == 1 and all(x["sources"] for x in res["rating"]["reasons"])
    # the plan's numbers are the worked-out ones, added to the sheet as facts the trader cites
    plan = res["plan"]
    want = S.trade_plan("Buy", ins["levels"], ins["pivots"], True, ins["hi52"], ins["lo52"])
    assert {k: plan[k] for k in ("entryLow", "entryHigh", "stop", "targets", "riskPerShare")} == {k: want[k] for k in ("entryLow", "entryHigh", "stop", "targets", "riskPerShare")}
    by_n = {f["n"]: f for f in res["facts"]}
    assert [by_n[n]["key"] for n in plan["sources"]] == ["plan_side", "plan_entry", "plan_stop", "plan_t1", "plan_t2", "plan_time"]
    assert f"Stop ₹{C.indian(plan['stop'], 2)}" in by_n[plan["sources"][2]]["text"]
    assert all(set(s["sources"]) <= set(plan["sources"]) for s in plan["sentences"])
    # the sizes, each argued by its voice
    assert [s["id"] for s in res["sizes"]] == ["cautious", "balanced", "aggressive"] and all(s["sentences"] for s in res["sizes"])
    assert by_n[res["sizes"][0]["source"]]["key"] == "size_cautious"
    # every [n] of every step is on the sheet
    cited = [n for st in res["steps"] for k in ("notes",) for x in st.get(k, []) for s in x["sentences"] for n in s["sources"]]
    cited += [n for r in res["steps"][1]["rounds"] for side in ("bull", "bear") for s in r[side] for n in s["sources"]]
    assert cited and set(cited) <= set(by_n)


async def test_no_news_stored_and_not_an_fno_stock_are_said_plainly_without_a_model_call(reliance_sections):
    ins = make_ins(reliance_sections, fno=False, news=False)
    client = desk(ins)
    res = await run(ins, client)
    heads = re.search(r"headings:\n(.*?)\nUnder", client.calls[0]["messages"][0]["content"], re.S).group(1).split("\n")
    assert heads == ["Technical analyst", "Financials analyst"]                         # the model is not asked for notes it has no facts for
    notes = {n["id"]: n for n in res["steps"][0]["notes"]}
    assert notes["news"]["written"] is False and notes["news"]["sentences"][0]["text"] == S.NO_NEWS.format(sym="RELIANCE", days=30)
    assert "no news" in notes["news"]["sentences"][0]["text"].lower()
    assert notes["flow"]["sentences"][0]["text"] == S.NO_FLOW.format(sym="RELIANCE")


async def test_a_hold_has_no_trade_or_sizes_and_a_sell_without_futures_has_no_short(reliance_sections):
    ins = make_ins(reliance_sections)
    res = await run(ins, desk(ins, rating="Hold"))
    assert res["outcome"] == "done" and res["plan"]["side"] == "none" and res["sizes"] == [] and res["steps"][4]["status"] == "skipped"
    assert res["steps"][4]["note"] == S.HOLD_PLAN and len([s for s in res["steps"] if s["status"] == "done"]) == 4
    cash = make_ins(reliance_sections, fno=False)
    res = await run(cash, desk(cash, rating="Sell"))
    assert res["plan"]["side"] == "none" and res["plan"]["reason"] == "no_short" and "no futures contract" in res["steps"][4]["note"]


async def test_a_failing_step_is_asked_again_once_with_its_failures(reliance_sections):
    ins = make_ins(reliance_sections)
    client = desk(ins, bad={"rating": 1})
    res = await run(ins, client)
    assert res["outcome"] == "done" and len(client.calls) == 7 and res["steps"][2]["tries"] == 2
    retry = [c for c in client.calls if "Step 3 of 5" in c["messages"][0]["content"]][1]["messages"]
    assert len(retry) == 3 and retry[1]["role"] == "assistant" and "999.99" in retry[1]["content"]
    assert "cannot be shown" in retry[2]["content"] and "999.99 is not in the fact it cites" in retry[2]["content"]


async def test_a_step_that_fails_twice_stops_the_desk_with_the_plain_message_never_the_text(reliance_sections):
    ins = make_ins(reliance_sections)
    client = desk(ins, bad={"debate": 2})
    res = await run(ins, client)
    assert res["outcome"] == "stopped" and res["stoppedAt"] == "debate" and res["message"] == S.STOPPED.format(step="Bull and bear debate")
    assert [s["status"] for s in res["steps"]] == ["done", "failed", "not_run", "not_run", "not_run"]
    assert res["rating"] is None and res["plan"] is None and "999.99" not in json.dumps(res) and len(client.calls) == 3


async def test_the_call_cap_holds_even_when_every_step_fails_once(reliance_sections):
    ins = make_ins(reliance_sections)
    client = desk(ins, bad={"analysts": 1, "debate": 1, "rating": 1, "plan": 1, "sizes": 1})
    res = await run(ins, client)
    # a retry is made only when the calls the later steps need are still left: the analysts and the first round retry (5 calls with the
    # second round); the rating's first answer is the 6th call, and its retry would leave fewer than the plan and the sizes need
    assert res["outcome"] == "stopped" and res["stoppedAt"] == "rating" and res["steps"][2]["status"] == "failed"
    assert res["caps"]["calls"] == len(client.calls) == 6 <= S.MAX_CALLS
    assert sum("Step 3 of 5" in c["messages"][0]["content"] for c in client.calls) == 1


async def test_the_token_cap_stops_the_run_before_a_call_that_would_pass_it(reliance_sections, monkeypatch):
    ins = make_ins(reliance_sections)
    first = (len(S.SYSTEM) + len(S.sheet_block(ins["symbol"], ins["name"], ins["facts"]) + "\n\n" + S.step_prompt("analysts", S.ANALYSTS, {}))) // 3 + 2000
    monkeypatch.setattr(S, "TOKEN_BUDGET", first + 200)                      # room for the analysts, not for the longer debate prompt
    client = desk(ins)
    res = await run(ins, client)
    assert len(client.calls) == 1 and res["outcome"] == "stopped" and res["steps"][1]["status"] == "capped"
    assert res["message"].startswith('The desk stopped before "Bull and bear debate": the run reached its cap (1 of 8 AI calls, 120 of ')


async def test_no_answer_at_all_is_a_service_failure_not_a_run(reliance_sections):
    ins = make_ins(reliance_sections)
    with pytest.raises(C.ModelDown):
        await run(ins, FakeClient([], fail=RuntimeError("down")))


# ------------------------------------------------------------------------------------------------------------------ the routes

def events_of(text):
    out = []
    for block in text.strip().split("\n\n"):
        ev = re.search(r"^event: (\w+)$", block, re.M).group(1)
        out.append((ev, json.loads(re.search(r"^data: (.*)$", block, re.M).group(1))))
    return out


class RouteDesk(Desk):
    """The scripted desk for a sheet the route builds: the fact keys are read back from the request."""

    def answer(self, step, content):
        facts = facts_in(content)
        if not self.keys:
            self.keys = {}
        for n, text in facts.items():
            for key, start in (("roe", "ROE "), ("pe", "P/E "), ("net_margin", "Net margin"), ("cfo_to_pat", "CFO"), ("last_close", "Last close"),
                               ("sma20", "20-session average"), ("rsi14", "RSI over"), ("change_1y", "Price change over 1 year"), ("profit_cagr", "Profit CAGR"),
                               ("news_count", None), ("news_sentiment", "Sentiment of")):
                if start and text.startswith(start) and key not in self.keys:
                    self.keys[key] = n
            if " news items and exchange announcements stored" in text:
                self.keys["news_count"] = n
        for need in ("roe", "cfo_to_pat", "rsi14"):        # whatever the stored report holds, three facts to give reasons with
            self.keys.setdefault(need, sorted(facts)[{"roe": 0, "cfo_to_pat": 1, "rsi14": 2}[need]])
        return super().answer(step, content)


async def grant(app, admin, email, signals):  # noqa: F811
    member = await signed_in(app, email, plan="gold")
    await admin.put("/api/admin/lab/grants", json={"email": email, "signals": signals})
    return member


@pg
async def test_signed_out_401_without_the_switch_403_signals_off_and_with_it_the_desk(app, anon):  # noqa: F811
    client = RouteDesk()
    enable(app, client)
    for m in ("get", "post"):
        assert (await getattr(anon, m)("/api/lab/signals/RELIANCE")).status_code == 401
    admin = await admin_with_mfa(app, "desk-boss@example.com")
    stranger = await signed_in(app, "desk-stranger@example.com", plan="gold")
    assert (await stranger.get("/api/lab/signals/RELIANCE")).json()["detail"]["status"] == "lab_access_required"
    member = await grant(app, admin, "desk-member@example.com", signals=False)
    assert (await member.get("/api/lab/case/RELIANCE")).status_code == 200                       # a Lab member, but signals are off
    for m in ("get", "post"):
        r = await getattr(member, m)("/api/lab/signals/RELIANCE")
        assert r.status_code == 403 and r.json()["detail"]["status"] == "signals_off"
    assert client.calls == []
    # an administrator switches them on (audited), and the member gets the desk
    uid = next(g["userId"] for g in (await admin.get("/api/admin/lab/grants")).json()["grants"] if g["email"] == "desk-member@example.com")
    assert (await admin.patch(f"/api/admin/lab/grants/{uid}", json={"signals": True})).json()["signals"] is True
    async with app.state.store.pool.acquire() as conn:
        assert await conn.fetchval("SELECT count(*) FROM audit_events WHERE action = 'lab_signals_on' AND target = $1", uid) == 1
    g = await member.get("/api/lab/signals/reliance")
    body = g.json()
    assert g.status_code == 200 and g.headers["cache-control"] == "no-store" and body["outcome"] == "none" and body["cached"] is False
    assert body["label"] == S.LABEL == "Signals on · internal test" and "not investment advice" in body["disclaimer"] and "SEBI" in body["disclaimer"]
    assert [s["status"] for s in body["steps"]] == ["waiting"] * 5 and body["rating"] is None and client.calls == []     # a GET never calls the model
    assert body["limit"]["left"] == S.DAILY_LIMIT == 10 and body["caps"]["maxCalls"] == 8 and body["caps"]["tokenBudget"] == S.TOKEN_BUDGET
    assert body["caps"]["maxTokensPerCall"] == min(S.STEP_TOKENS, app.state.settings.ask_max_tokens) and len(body["prices"]) >= 2
    assert body["inputs"]["news"] is False                                                          # the test store holds no news for it
    # the run streams each step's progress, then the run
    r = await member.post("/api/lab/signals/RELIANCE")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream") and "no-store" in r.headers["cache-control"]
    ev = events_of(r.text)
    assert ev[0] == ("step", {**ev[0][1], "id": "analysts", "status": "running"}) and ev[-1][0] == "done"
    out = ev[-1][1]
    assert out["outcome"] == "done" and out["cached"] is False and out["generatedAt"] and out["rating"]["value"] == "Buy"
    assert out["plan"]["side"] == "long" and out["plan"]["entryLow"] < out["plan"]["entryHigh"] and len(out["sizes"]) == 3
    assert out["caps"]["calls"] == len(client.calls) <= 8 and out["limit"]["used"] == 1
    news = next(n for n in out["steps"][0]["notes"] if n["id"] == "news")
    assert news["written"] is False and "no news" in news["sentences"][0]["text"].lower()
    # the plan's numbers are the stored levels' (worked out from the same candles the route read)
    kd, _src = await S.candles(app.state.store, "RELIANCE")
    lv = S.levels_of(kd)
    assert out["plan"]["entryHigh"] == round(lv["last"], 2) and out["plan"]["atr"] == round(lv["atr"], 2)
    # the second press and the GET are the cached run: no model call, nothing used of the day
    calls = len(client.calls)
    again = events_of((await member.post("/api/lab/signals/RELIANCE")).text)
    assert [e for e, _ in again] == ["done"] and again[0][1]["cached"] is True and again[0][1]["rating"] == out["rating"] and len(client.calls) == calls
    assert (await member.get("/api/lab/signals/RELIANCE")).json()["cached"] is True
    assert (await member.post("/api/lab/signals/bad%20sym")).status_code == 400
    assert (await member.get("/api/lab/signals/NOSUCHCO")).status_code == 404
    # switched off again (audited): the desk closes at once
    await admin.patch(f"/api/admin/lab/grants/{uid}", json={"signals": False})
    assert (await member.get("/api/lab/signals/RELIANCE")).json()["detail"]["status"] == "signals_off"
    async with app.state.store.pool.acquire() as conn:
        assert await conn.fetchval("SELECT count(*) FROM audit_events WHERE action = 'lab_signals_off' AND target = $1", uid) == 1


@pg
async def test_stored_news_gets_its_own_note(app):  # noqa: F811
    client = RouteDesk()
    enable(app, client)
    admin = await admin_with_mfa(app, "desk-news@example.com")
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("INSERT INTO feed_items (kind, title, symbol, item_date, auto) VALUES ('news', 'Clarification on price movement', 'RELIANCE', current_date - 2, true)")
    body = (await admin.get("/api/lab/signals/RELIANCE")).json()
    assert body["inputs"]["news"] is True and any(f["key"] == "news_count" for f in body["sources"])
    out = events_of((await admin.post("/api/lab/signals/RELIANCE")).text)[-1][1]
    heads = re.search(r"headings:\n(.*?)\nUnder", client.calls[0]["messages"][0]["content"], re.S).group(1).split("\n")
    assert "News and sentiment analyst" in heads
    assert next(n for n in out["steps"][0]["notes"] if n["id"] == "news")["written"] is True


@pg
async def test_the_days_limit_no_key_and_the_service_down(app):  # noqa: F811
    admin = await admin_with_mfa(app, "desk-limit@example.com")
    uid = (await admin.get("/api/auth/me")).json()["user"]["id"]
    r = await admin.post("/api/lab/signals/RELIANCE")
    assert r.status_code == 503 and r.json()["detail"]["status"] == "not_enabled"
    key, _ = C._day_key(uid, prefix=S.DAY_PREFIX)
    await app.state.store.redis.set(key, S.DAILY_LIMIT)
    enable(app, RouteDesk())
    r = await admin.post("/api/lab/signals/RELIANCE")
    d = r.json()["detail"]
    assert r.status_code == 429 and d["status"] == "limit_reached" and d["left"] == 0 and "10 times today" in d["detail"]
    assert (await admin.get("/api/lab/signals/RELIANCE")).json()["limit"]["left"] == 0
    # the AI service down on the first call: an error event, and the day's run is given back
    await app.state.store.redis.set(key, 3)
    enable(app, FakeClient([], fail=RuntimeError("down")))
    ev = events_of((await admin.post("/api/lab/signals/RELIANCE")).text)
    assert ev[-1][0] == "error" and ev[-1][1]["status"] == "ai_unavailable" and int(await app.state.store.redis.get(key)) == 3
    # a run that stopped is not kept
    enable(app, RouteDesk(bad={"analysts": 2}))
    out = events_of((await admin.post("/api/lab/signals/RELIANCE")).text)[-1][1]
    assert out["outcome"] == "stopped" and out["message"] == S.STOPPED.format(step="Analyst notes") and int(await app.state.store.redis.get(key)) == 4
    assert (await admin.get("/api/lab/signals/RELIANCE")).json()["cached"] is False


# ------------------------------------------------------------------------------------------------------------------ the code

def test_the_desk_uses_ask_finlit_ais_own_client_and_only_the_signals_switch():
    src = Path(S.__file__).read_text(encoding="utf-8")
    assert "from ..ask.api import client_for" in src and "st.ask_model" in src and "st.ask_effort" in src and "st.ask_max_tokens" in src
    assert "Depends(signals_ctx)" in src and "Depends(lab_ctx)" not in src and src.count("@router.") == src.count("Depends(signals_ctx)") == 2
    assert not re.search(r"claude-|haiku|sonnet|opus", src, re.I)                               # no model named in the code
    assert S.MAX_CALLS == 8 and S.ROUNDS <= S.MAX_ROUNDS == 2 and S.STEP_TOKENS <= 2000 and S.DAILY_LIMIT == 10
    assert orjson.dumps(S.limit_status(3))


def test_the_desks_words_stay_on_the_desk():
    """Rating words appear only in lab/signals.py: the case module and the other Lab modules keep the describe-only words out of what they show
    (their own scans, e.g. tests/test_lab_case.py, still run), and none of them imports the desk."""
    lab = Path(S.__file__).parent
    for f in lab.glob("*.py"):
        if f.name in ("signals.py",):
            continue
        assert "signals import" not in f.read_text(encoding="utf-8") and "from .signals" not in f.read_text(encoding="utf-8"), f.name
    assert "Overweight" not in Path(C.__file__).read_text(encoding="utf-8")
