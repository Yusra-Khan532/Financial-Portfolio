// The dashboard's sentences as the final pages pack writes them (docs/design/finlit-final-pages/04), checked with the pack's own 6 Nov figures.
import { describe, expect, it } from "vitest";
import board from "./__fixtures__/pulse-board-6nov.json";
import type { Board } from "./sectors";
import type { Flows } from "./flows";
import { dayWord, flowsCard, inflationCard, marketRead, marketWhen, myStockSignals, portfolioCard, snapshotCard, type MyStock } from "./dashPack";

const B = board as unknown as Board;
const st = (symbol: string, o: Partial<MyStock> = {}): MyStock => ({ symbol, chg: 0.5, size: "Large", profit: 20, profitText: null, reported: true, peer: "inline", ...o });

describe("the greeting line", () => {
  it("before the open on a Monday it says when the market opens and which close the figures are from", () => {
    expect(marketWhen(new Date("2026-11-09T02:00:00Z"), false, "2026-11-06")).toEqual(["Market opens at 9:15", "Figures from Friday's close"]);
    expect(marketWhen(new Date("2026-11-14T03:00:00Z"), false, "2026-11-13")).toEqual(["Market opens Monday at 9:15", "Figures from Friday's close"]);
    expect(marketWhen(new Date("2026-11-10T05:00:00Z"), true, "2026-11-10")).toEqual(["Market open"]);
    expect(dayWord(new Date("2026-11-09T02:00:00Z"), "2026-11-06")).toBe("Friday");
    expect(dayWord(new Date("2026-11-06T12:00:00Z"), "2026-11-06")).toBe("Today");
  });
});

describe("What your stocks say (task #195: one card per signal)", () => {
  const items = [st("KINGFA", { chg: -12.6, size: "Small" }), st("MARINE", { chg: -11.0, size: "Small" }), st("AEROFLEX", { chg: -10.6, size: "Small", peer: "leader" }),
    st("PERSISTENT", { chg: 1, profit: -25.4, peer: "leader" }), st("GLENMARK", { chg: 0.5, profit: -56.8, peer: "unranked" }), st("RELIANCE", { chg: -1, peer: "laggard" }), st("TECHM", { chg: 2, peer: "leader" })];
  const c = myStockSignals(items, "Friday", "2026-09-30");
  it("gives each card its kind, a short headline and one line of meaning", () => {
    expect(c.map((x) => [x.kind, x.title, x.line])).toEqual([
      ["warning", "3 of your stocks fell 10% or more on Friday", "A move of 10% or more in one session; all are small companies. News and filings often explain such moves."],
      ["good", "Profit grew at 5 of 7", "of your shares that have reported the September quarter, against a year ago."],
      ["insight", "3 lead their peers, 1 lag", "Price strength against companies in the same peer group, over the last 12 months."]]);
  });
  it("puts no list of symbols in the text: the names are only chips", () => {
    for (const x of c) for (const s of ["KINGFA", "PERSISTENT", "RELIANCE", "TECHM"]) expect(x.title + x.line + (x.note ?? "")).not.toContain(s);
  });
  it("adds a count bar to each card (15 grew · 2 fell; 7 lead · 4 lag · 4 not ranked)", () => {
    expect(c.map((x) => x.meter.map((m) => `${m.n} ${m.word}`).join(" · "))).toEqual(["3 fell 10% or more · 4 moved less", "5 grew · 2 fell", "3 lead · 1 lag · 1 not ranked"]);
  });
  it("groups and colours the chips in the dropdown, each with its figure (Profit fell red; Lead green, Lag red)", () => {
    expect(c.map((x) => x.more)).toEqual(["See the 3", "See the 2 that fell", "See the names"]);
    expect(c[0].groups).toEqual([{ label: "Fell 10% or more · 3", tone: "down", chips: [{ symbol: "KINGFA", label: "KINGFA", note: "−12.6%" }, { symbol: "MARINE", label: "MARINE", note: "−11.0%" }, { symbol: "AEROFLEX", label: "AEROFLEX", note: "−10.6%" }] }]);
    expect(c[1].groups).toEqual([{ label: "Profit fell, against a year ago · 2", tone: "down", chips: [{ symbol: "PERSISTENT", label: "PERSISTENT", note: "−25.4%" }, { symbol: "GLENMARK", label: "GLENMARK", note: "−56.8%" }] }]);
    expect(c[2].groups.map((g) => [g.label, g.tone, g.chips.map((x) => x.symbol)])).toEqual([["Lead · 3", "up", ["AEROFLEX", "PERSISTENT", "TECHM"]], ["Lag · 1", "down", ["RELIANCE"]]]);
    expect(c[2].note).toBe("1 is not ranked: too new, or too thinly traded to compare fairly.");
  });
  it("words a rise, a profit fall and all-grew cases too, and says nothing when there is no signal", () => {
    const r = myStockSignals([st("A", { chg: 12, profit: -3 }), st("B", { chg: 1, profit: -4 }), st("C", { chg: 0, profit: 5 })], "Today", null);
    expect(r.map((x) => [x.kind, x.title, x.more])).toEqual([["good", "1 of your stocks rose 10% or more today", "See the 1"], ["watch", "Profit fell at 2 of 3", "See the 2 that fell"]]);
    expect(r[1].groups.map((g) => g.label)).toEqual(["Profit fell, against a year ago · 2", "Profit grew, against a year ago · 1"]);
    expect(myStockSignals([st("A", { chg: 1, profit: 3 })], "Today", null)[0]).toMatchObject({ more: "See the 1 that grew", line: "of your shares that have reported the latest quarter, against a year ago." });
    expect(myStockSignals([st("A", { chg: 1, reported: false, profit: null })], "Today", null)).toEqual([]);
    expect(myStockSignals([st("A", { chg: 1, profit: -8 })], "Today", null)[0].groups.map((g) => g.label)).toEqual(["Profit fell, against a year ago · 1"]);   // no empty "grew · 0" group
  });
});

describe("the other cards", () => {
  it("snapshot, inflation, flows and portfolio", () => {
    expect(snapshotCard(2003, 2461, 5668, { up: 47, down: 3, n: 50 }, 2.01)).toEqual({ kind: "watch", title: "The big names rose; most stocks fell", text: "Only 3 of the Nifty 50 fell, yet across all 5,668 companies fallers beat risers by 458." });
    expect(inflationCard(5.54, 11.39, { date: "2026-10-07", bp: 25 })).toEqual({ kind: "watch", title: "Inflation is above the 4% target", text: "Retail inflation is 5.54% and wholesale 11.39%. The RBI raised the repo rate in October; higher rates raise borrowing costs for companies." });
    const day = (d: string, f: number, g: number) => ({ d, fii: { buy: null, sell: null, net: f }, dii: { buy: null, sell: null, net: g } });
    const days = [...["2026-10-20", "2026-10-21", "2026-10-23", "2026-10-27", "2026-10-29"].map((d) => day(d, -900, 500)), ...["2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"].map((d) => day(d, 700, -300))];
    const f = { days, streaks: { fii: { side: "buying", days: 6, since: "2026-10-30", sum: 0, velocity: null }, dii: { side: "selling", days: 7, since: "2026-10-29", sum: 0, velocity: null } }, last30: { fii: -1, dii: 1, days: 30 } } as unknown as Flows;
    expect(flowsCard(f)).toEqual({ kind: "insight", title: "Foreign money has turned buyer", text: "FIIs bought in each of the six sessions from 30 Oct to 6 Nov, after selling in the weeks before, while Indian institutions sold." });
    expect(portfolioCard({ growth: 80, valuation: 45, quality: 69, risk: 69 })).toEqual({ kind: "watch", title: "Valuation is the weak spot", text: "Your shares score well on growth (80) but 45 on valuation: you are paying above-typical prices for that growth." });
  });
});

describe("The market on Friday: what it adds up to", () => {
  it("adds up the pack's six readings to 2 good signs, 2 mixed and 2 warnings, a top-heavy market", () => {
    const r = marketRead({ day: "Friday", adv: 2003, dec: 2461, total: 5668, niftyChg: 2.01, midChg: -0.02, smallChg: -0.82, big: { up: 80, down: 144, n: 1586 }, size: { large: 4.1, small: -5.0, n: 5823 }, board: B });
    expect(r.lead + r.rest).toBe("Big companies lifted the index; most stocks fell. The Nifty 50 rose 2.0% on Friday, yet 2,461 stocks fell and 2,003 rose.");
    expect(r.tail).toBe("Mid and small company indices ended lower.");
    expect(r.readings.map((x) => `${x.k}: ${x.badge} · ${x.head}`)).toEqual(["Today: More fallers · 2,461 fell, 2,003 rose", "Big moves: Selling had the edge · 144 down 4%+, 80 up 4%+", "Leadership: Large companies lead · +4.1% vs −5.0%",
      expect.stringMatching(/^Short term: Mixed · \d+ in 100 rising$/), expect.stringMatching(/^Bigger trend: Narrow · \d+ in 100 rising$/), "Industries: Rebuilding · 15 of 38 bouncing"]);
    expect(r.readings[1].text).toBe("Sharp falls outnumbered sharp rises almost two to one.");
    expect(r.readings[5].text).toBe("The industry sell-off is easing: 15 industries bounced, 8 of them after a crash.");
    expect(r.sum).toEqual({ good: 2, mixed: 2, warning: 2, text: "A top-heavy market: big companies are rising, most of the rest are not yet. Broad rallies usually need more stocks to join in." });
  });
});
