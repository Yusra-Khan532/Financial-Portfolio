// Task #385 (developer file 33): the shared words, numbers, sorting, capped lists, Key figures and gain-or-loss rules. Sample data only (made up).
import { describe, expect, it } from "vitest";
import {
  andList, bannedIn, betaRangeWord, capRows, CAP_DEFAULT, CAP_PHONE_LIST, CAP_SHARES, coName, corrText, corrWord, countOf, gainLoss, inCommon, movesAsMuch, namesInText, namesUpTo,
  nextSort, pctChange, pctText, pointsLine, portfolioKeyFigs, rankOf, rupees, rupeesShort, rupeesSigned, shortCo, sortRows, times, trendReading, TREND_READINGS, type GLRow,
} from ".";
import type { Share } from "../../lib/equityPack";

describe("names (file 33, Names)", () => {
  it("drops Ltd, Limited and Company and keeps two or three words above 24 characters", () => {
    expect(shortCo("Alpha Gears Ltd")).toBe("Alpha Gears");
    expect(shortCo("Beta Motor Company Limited")).toBe("Beta Motor");
    expect(shortCo("Kestrel Harbour Infrastructure Holdings Ltd")).toBe("Kestrel Harbour");
    expect(shortCo("Orchid Rail Corporation Of India Ltd")).toBe("Orchid Rail Corporation");
    expect(shortCo("Bank Of Sample")).toBe("Bank of Sample");
    expect(shortCo("", "ZZZ")).toBe("ZZZ");
    expect(coName({ symbol: "ALPHA", name: "Alpha Gears Ltd" })).toBe("Alpha Gears");
  });
  it("turns share codes in a sentence into names, whole words only", () => {
    const m = new Map([["AG", "Alpha Gears"], ["AGX", "Alpha Gears Export"]]);
    expect(namesInText("AG and AGX move together; RAG stays.", m)).toBe("Alpha Gears and Alpha Gears Export move together; RAG stays.");
  });
});

describe("words (file 33, Words)", () => {
  it("counts of one are singular", () => {
    expect(countOf(1, "share")).toBe("1 share");
    expect(countOf(3, "industry")).toBe("3 industries");
    expect(countOf(1, "macro sector")).toBe("1 macro sector");
    expect(countOf(2, "update")).toBe("2 updates");
  });
  it("beta ranges have plain names, never Defensive", () => {
    expect(["less", "defensive", "similar", "more", "high", "very_high"].map((k) => betaRangeWord(k))).toEqual(["Much less sensitive", "Less sensitive", "Similar", "More sensitive", "High", "Very high"]);
    expect(betaRangeWord(null, "Defensive")).toBe("Less sensitive");
    expect(movesAsMuch(1.29)).toBe("1.29× as much as its markets");
  });
  it("points are said in words", () => {
    expect(pointsLine(46.6, "NIFTY Auto")).toBe("Beat the Nifty Auto by 46.6 points over 12 months");
    expect(pointsLine(-63.2, "peer average")).toBe("Trailed the peer average by 63.2 points over 12 months");
  });
  it("finds the words the page must not show", () => {
    expect(bannedIn("β 1.08 · +4 pts · Defensive · Sell · −0.0%", ["Monday"])).toEqual(["β", "pts", "Defensive", "Sell", "−0.0%", "weekday heading"]);
    expect(bannedIn("Record a sale · Sells nothing · 0.0% · Today", ["Today"])).toEqual([]);
  });
  it("lists names", () => { expect(andList(["A", "B", "C"])).toBe("A, B and C"); expect(namesUpTo(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more"); });
});

describe("numbers (file 33, Numbers)", () => {
  it("uses the real minus and Indian grouping", () => {
    expect(rupees(141223)).toBe("₹1,41,223");
    expect(rupees(-76468)).toBe("−₹76,468");
    expect(rupeesSigned(14738)).toBe("+₹14,738");
    expect(rupeesSigned(-0.4)).toBe("₹0");
  });
  it("short forms ₹ L and ₹ Cr", () => {
    expect(rupeesShort(296000)).toBe("₹2.96 L");
    expect(rupeesShort(12000000)).toBe("₹1.20 Cr");
    expect(rupeesShort(5643920000000)).toBe("₹5,64,392 Cr");
    expect(rupeesShort(84000)).toBe("₹84,000");
  });
  it("a change that rounds to zero is 0.0% and grey, never −0.0%", () => {
    expect(pctChange(-0.04)).toEqual({ text: "0.0%", flat: true, tone: "flat" });
    expect(pctText(-2.61)).toBe("−2.6%");
    expect(pctText(5.94)).toBe("+5.9%");
  });
  it("multiples carry ×", () => { expect(times(1.08)).toBe("1.08×"); });
  it("correlation words beside their figures", () => {
    expect([0.1, 0.2, 0.39, 0.4, 0.59, 0.6, 0.9].map(corrWord)).toEqual(["barely", "loosely", "loosely", "partly", "partly", "closely", "closely"]);
    expect(corrText(0.34)).toBe("0.34 (loosely linked)");
    expect(inCommon(0.62)).toBe(38);
  });
});

describe("sorting (file 33, Sorting)", () => {
  type R = { n: string; v: number | null; w: string; g: string };
  const rows: R[] = [{ n: "beta", v: 2, w: "Weak", g: "x" }, { n: "Alpha", v: 9, w: "Healthy", g: "y" }, { n: "gamma", v: null, w: "Strong", g: "x" }, { n: "delta", v: 5, w: "Average", g: "y" }];
  it("text A to Z first, figures high to low first, words by rank, blanks last", () => {
    expect(sortRows(rows, { kind: "text", get: (r) => r.n }, 1).map((r) => r.n)).toEqual(["Alpha", "beta", "delta", "gamma"]);
    expect(sortRows(rows, { kind: "num", get: (r) => r.v }, -1).map((r) => r.n)).toEqual(["Alpha", "delta", "beta", "gamma"]);
    expect(sortRows(rows, { kind: { rank: "prism" }, get: (r) => r.w }, -1).map((r) => r.w)).toEqual(["Strong", "Healthy", "Average", "Weak"]);
    expect(nextSort(null, "share", "text")).toEqual({ id: "share", dir: 1 });
    expect(nextSort(null, "value", "num")).toEqual({ id: "value", dir: -1 });
    expect(nextSort({ id: "value", dir: -1 }, "value", "num")).toEqual({ id: "value", dir: 1 });
  });
  it("sorts inside each group, groups keep their place", () => {
    expect(sortRows(rows, { kind: "num", get: (r) => r.v }, -1, (r) => r.g).map((r) => r.n)).toEqual(["beta", "gamma", "Alpha", "delta"]);
  });
  it("ranks Leader > In line > Laggard and the nine trend readings in order; Average and Fair rank the same", () => {
    expect(rankOf("peer", "Leader")! > rankOf("peer", "Laggard")!).toBe(true);
    expect(rankOf("prism", "Fair")).toBe(rankOf("prism", "Average"));
    expect(TREND_READINGS.map((t) => rankOf("trend", t))).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });
});

describe("the nine trend readings", () => {
  it("reads the pair of trend scores on the ±20 lines", () => {
    expect(trendReading(40, 60)).toBe("Rising");
    expect(trendReading(-30, 60)).toBe("Rising but dipping");
    expect(trendReading(0, 60)).toBe("Rising but resting");
    expect(trendReading(25, -25)).toBe("Falling but bouncing");
    expect(trendReading(-25, 0)).toBe("Flat, turning down");
    expect(trendReading(null, 10)).toBeNull();
  });
});

describe("long lists (file 33, Long lists)", () => {
  const xs = Array.from({ length: 11 }, (_, i) => i);
  it("above 10 rows shows 8; Your shares 25 above 30; the phone list 20 above 22", () => {
    expect(capRows(xs, CAP_DEFAULT, false).shown.length).toBe(8);
    expect(capRows(xs.slice(0, 10), CAP_DEFAULT, false).capped).toBe(false);
    expect(capRows(xs, CAP_DEFAULT, true).shown.length).toBe(11);
    expect(capRows(Array.from({ length: 31 }, (_, i) => i), CAP_SHARES, false).shown.length).toBe(25);
    expect(capRows(Array.from({ length: 30 }, (_, i) => i), CAP_SHARES, false).capped).toBe(false);
    expect(capRows(Array.from({ length: 23 }, (_, i) => i), CAP_PHONE_LIST, false).shown.length).toBe(20);
  });
});

// ------------------------------------------------------------------------------------------------ gain or loss
const gl = (xs: [string, number][]): GLRow[] => xs.map(([s, g]) => ({ symbol: s, name: s + " Co", gain: g, pct: null }));
describe("where your gain or loss came from (file 33)", () => {
  it("one share explains the whole loss", () => {
    const r = gainLoss(gl([["A", 9000], ["B", 5000], ["C", -40000], ["D", 1000]]));
    expect(r.rows.map((x) => x.symbol)).toEqual(["A", "B", "D", "C"]);
    expect(r.lead!.bold).toBe("One share explains the whole loss.");
    expect(r.lead!.rest).toBe("C Co is down ₹40,000; the other 3 shares are up ₹15,000 together.");
    expect([...r.key]).toEqual(["C"]);
    expect(Math.abs(r.rows.reduce((a, x) => a + x.gain, 0) - r.total)).toBeLessThan(1);
  });
  it("two or three shares explain it", () => {
    const r = gainLoss(gl([["A", 2000], ["B", -6000], ["C", -5000], ["D", -1000]]));
    expect(r.lead!.bold).toBe("Two shares explain the whole loss.");
    expect(r.lead!.rest).toBe("B Co (−₹6,000) and C Co (−₹5,000) are down ₹11,000 between them; the other 2 shares are up ₹1,000 together.");
  });
  it("a loss spread out names the three biggest", () => {
    const r = gainLoss(gl([["A", -100], ["B", -110], ["C", -120], ["D", -130], ["E", 50]]));
    expect(r.lead!.bold).toBe("The loss is spread out.");
    expect(r.lead!.rest).toBe("The three biggest losses, D Co, C Co and B Co, come to ₹360; 1 of your 5 shares is in profit.");
  });
  it("gains mirror the rule", () => {
    expect(gainLoss(gl([["A", 30000], ["B", -2000], ["C", 1000]])).lead!.bold).toBe("One share explains the whole gain.");
  });
  it("above 12 shares: the 5 biggest gains, the 5 biggest losses and any named share", () => {
    const xs = gl(Array.from({ length: 16 }, (_, i) => [`S${i}`, (i - 8) * 1000 + (i === 0 ? -50000 : 0)] as [string, number]));
    const r = gainLoss(xs);
    expect(r.capped).toBe(true);
    expect(r.shown(false).length).toBe(10);
    expect(r.shown(true).length).toBe(16);
  });
  it("a one-share list has no summary line", () => { expect(gainLoss(gl([["A", 100]])).lead).toBeNull(); });
});

// ------------------------------------------------------------------------------------------------ Key figures
const sh = (symbol: string, p: Partial<Share> = {}): Share => ({ symbol, name: symbol + " Industries Ltd", industry: "Sample", size: "Large", chg: 0, prism: 60, prismWord: "Average", valuation: 60, risk: 60,
  st: 30, lt: 30, below52: 5, m1: 0, peer: { label: "in_line", raw: null, rank: 3, of: 9, group: "Sample", vs: 1, bench: "NIFTY 50", direction: null }, notCompared: null, ...p });
describe("Key figures, Portfolio (file 33)", () => {
  it("reads the pack's three questions", () => {
    const shares = [sh("A", { peer: { label: "leader", raw: null, rank: 1, of: 9, group: "G", vs: 3, bench: "x", direction: null } }), sh("B", { peer: { label: "laggard", raw: null, rank: 9, of: 9, group: "G", vs: -3, bench: "x", direction: null }, st: -30, lt: -30, valuation: 20 }), sh("C")];
    const k = portfolioKeyFigs(shares, true, (s) => (s === "B" ? 100 : 50));
    expect(k.map((c) => c.q)).toEqual(["Do your shares beat similar companies?", "Are their prices rising?", "Are you paying a lot for them?"]);
    expect([k[0].big, k[0].ans, k[0].sub]).toEqual(["1 of 3", "lead their peer group", "1 trails it · 1 in the middle · over the last 12 months"]);
    expect(k[0].worth!.names[0]).toEqual({ symbol: "B", label: "B Industries", note: "9th of 9" });
    expect([k[1].big, k[1].ans, k[1].sub]).toEqual(["2 of 3", "in a long-term uptrend", "1 falling"]);
    expect(k[1].worth!.label).toBe("Falling on both trends");
    expect([k[2].big, k[2].ans]).toEqual(["1 of 3", "priced above typical"]);
  });
  it("reads lists of one and two shares, counts of one singular", () => {
    const two = portfolioKeyFigs([sh("A"), sh("B", { lt: -40, st: -40 })], true);
    expect(`${two[1].big} ${two[1].ans}`).toBe("1 of 2 is in a long-term uptrend");
    const one = portfolioKeyFigs([sh("A", { peer: { label: "leader", raw: null, rank: 1, of: 5, group: "G", vs: 2, bench: "x", direction: null } })], true);
    expect(`${one[0].big} ${one[0].ans}`).toBe("1 of 1 leads its peer group");
    expect(one[0].sub).toBe("0 trail it · 0 in the middle · over the last 12 months");
  });
  it("Silver sees the peers card only", () => { expect(portfolioKeyFigs([sh("A")], false).length).toBe(1); });
});
