// Task #385 phase 2 (developer file 33, Diversification view): the pure figures. Made-up sample lists only.
import { describe, expect, it } from "vitest";
import { NSE_INDUSTRY } from "../../lib/nseTaxonomy";
import { whereGrid } from "../../lib/eqDiv";
import {
  MACRO_NOTE, corrBand, divKeyFigs, firstSentence, gridLine, independentNote, moneyGrid, pairChart, pairLine, rowMoneyLine, sectorsLine, slotLine, spreadCards,
  spreadNote, whereLine, withCorrWords, type Pair,
} from "./divFigs";

const SZ = { A: "Large", B: "Large", C: "Mid", D: "Micro", E: "Micro", F: "Small" } as const;
const MAC: Record<string, string> = { A: "Consumer Discretionary", B: "Financial Services", C: "Consumer Discretionary", D: "Consumer Discretionary", E: "Industrials", F: "Financial Services" };
const VAL: Record<string, number> = { A: 300000, B: 150000, C: 50000, D: 20000, E: 60000, F: 120000 };
const syms = Object.keys(SZ);

describe("macro sectors are written out, each with a note (file 33, Names)", () => {
  it("covers all 12 NSE macro sectors with a one-line note", () => {
    const macros = new Set(Object.values(NSE_INDUSTRY).map((x) => x[1]));
    expect(macros.size).toBe(12);
    macros.forEach((m) => { expect(MACRO_NOTE[m], m).toBeTruthy(); expect(MACRO_NOTE[m]).not.toMatch(/\.$/); });
  });
});

describe("Where your list sits, by money", () => {
  const g = whereGrid(syms, (s) => MAC[s], (s) => SZ[s as "A"]);
  const m = moneyGrid(g, syms, (s) => VAL[s], (s) => MAC[s])!;
  it("each cell's % is its shares' value over the list's value; rows and sizes each add to 100%", () => {
    expect(m.total).toBe(700000);
    expect(m.cell("Consumer Discretionary", "Large").pct).toBeCloseTo((100 * 300000) / 700000);
    expect(g.rows.reduce((a, r) => a + m.row(r.name).pct, 0)).toBeCloseTo(100);
    expect(["Large", "Mid", "Small", "Micro"].reduce((a, k) => a + m.col(k), 0)).toBeCloseTo(100);
  });
  it("shades a cell 16% + 54% × its value ÷ the largest cell's value", () => {
    expect(m.cell("Consumer Discretionary", "Large").shade).toBe(70);
    expect(m.cell("Financial Services", "Small").shade).toBe(Math.round(16 + (54 * 120000) / 300000));
    expect(m.cell("Industrials", "Large").shade).toBe(0);
  });
  it("is not offered when a share has no value now", () => {
    expect(moneyGrid(g, syms, (s) => (s === "C" ? null : VAL[s]), (s) => MAC[s])).toBeNull();
  });
  it("reads a row as '5 shares · ₹8.43 L'", () => { expect(rowMoneyLine(5, 843000)).toBe("5 shares · ₹8.43 L"); expect(rowMoneyLine(1, 42000)).toBe("1 share · ₹42,000"); });
});

const groups13 = [{ members: ["S1", "S2"] }, { members: ["S3", "S4"] }];
const s13 = Array.from({ length: 13 }, (_, i) => "S" + (i + 1));
const mac13 = (s: string) => (+s.slice(1) <= 5 ? "Consumer Discretionary" : +s.slice(1) <= 9 ? "Financial Services" : +s.slice(1) <= 12 ? "Industrials" : "Information Technology");
describe("Key figures (file 33, Diversification)", () => {
  const base = { symbols: s13, macroOf: mac13, counted: s13, groups: groups13, eff: 5.7, byValue: true, label: (s: string) => "Co " + s };
  it("1 Where is most of your list? 38% in the largest macro sector, with the money line", () => {
    const [c] = divKeyFigs({ ...base, worth: (s) => (mac13(s) === "Consumer Discretionary" ? 36.8 / 5 : 63.2 / 8) });
    expect([c.q, c.big, c.ans, c.sub]).toEqual(["Where is most of your list?", "38%", "in Consumer Discretionary", "5 of your 13 shares · 36.8% of your money"]);
    expect(c.bar!.map((b) => [b.label, b.n])).toEqual([["Consumer Discretionary", 5], ["Financial Services", 4], ["Industrials", 3], ["Information Technology", 1]]);
  });
  it("2 Which shares move as one? 4 of 13 in two groups, the names worth a look; none when no group", () => {
    const c = divKeyFigs(base)[1];
    expect([c.big, c.ans, c.sub]).toEqual(["4 of 13", "move together in two groups", "the other 9 move on their own"]);
    expect(c.worth!.label).toBe("In the groups"); expect(c.worth!.names.map((x) => x.label)).toEqual(["Co S1", "Co S2", "Co S3", "Co S4"]);
    const none = divKeyFigs({ ...base, groups: [] })[1];
    expect([none.big, none.ans]).toEqual(["None", "move closely together"]); expect(none.worth).toBeUndefined();
  });
  it("3 How many separate bets? 5.7 separate bets among your 13 shares", () => {
    const c = divKeyFigs(base)[2];
    expect([c.q, c.big, c.ans, c.sub]).toEqual(["How many separate bets are in your list?", "5.7", "separate bets", "among your 13 shares; the rest overlap"]);
    expect(c.tip).toMatch(/by what you own now/);
  });
  it("reads lists of one and two shares in the singular", () => {
    const one = divKeyFigs({ ...base, symbols: ["S1"], counted: [], groups: [], eff: 1, worth: () => 100 });
    expect(one).toHaveLength(1); expect(one[0].sub).toBe("your only share");
    const two = divKeyFigs({ ...base, symbols: ["S1", "S10"], counted: ["S1", "S10"], groups: [], eff: 2 });
    expect(two[0].sub).toBe("1 of your 2 shares"); expect(two[1].sub).toBe("your two shares each go more or less their own way");
    expect(two[2].sub).toBe("among your 2 shares; they barely overlap");
  });
});

describe("the pairs chart", () => {
  const P = (n: number, f: (i: number) => number): Pair[] => Array.from({ length: n }, (_, i) => ({ a: "A" + i, b: "B" + i, corr: f(i) }));
  it("counts the four bands, marks the typical pair and keeps a 0 to 0.7 scale (wider above)", () => {
    const c = pairChart([...P(3, () => 0.1), ...P(4, () => 0.3), ...P(2, () => 0.5), { a: "X", b: "Y", corr: 0.62 }]);
    expect(c.counts).toEqual([3, 4, 2, 1]); expect(c.median).toBeCloseTo(0.3); expect(c.max).toBe(0.7); expect(c.bars).toBe(false);
    expect(pairChart([{ a: "X", b: "Y", corr: 0.81 }, { a: "P", b: "Q", corr: 0.2 }]).max).toBe(0.9);
  });
  it("turns into bars when more than 12 pairs share one 0.02 slot (100 shares: 4,950 pairs)", () => {
    const n = 100, ps: Pair[] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) ps.push({ a: "S" + i, b: "S" + j, corr: 0.05 + (((i * 37 + j * 11) % 60) / 100) });
    const c = pairChart(ps);
    expect(ps).toHaveLength(4950); expect(c.bars).toBe(true); expect(c.slots.reduce((a, s) => a + s.pairs.length, 0)).toBe(4950);
    expect(pairChart(P(12, () => 0.3)).bars).toBe(false); expect(pairChart(P(13, () => 0.3)).bars).toBe(true);
  });
  it("reads a dot and a bar in words", () => {
    expect(pairLine("Alpha", "Beta", 0.62)).toBe("Alpha · Beta · 0.62 · closely linked, about 38% of their weekly moves in common");
    const c = pairChart(P(40, (i) => 0.27 + (i % 2) * 0.009));
    const s = c.slots.find((x) => x.pairs.length === 40)!;
    expect(slotLine(s, (x) => x)).toBe("40 pairs between 0.27 and 0.29 · the closest of them: A1 · B1, 0.28");
  });
  it("bands follow file 33's cut-offs", () => { expect([0.19, 0.2, 0.39, 0.4, 0.59, 0.6].map(corrBand)).toEqual([0, 1, 1, 2, 2, 3]); });
});

describe("How spread out is the list?", () => {
  const eq = { score: 62, band: "Fairly spread", comovement: 65, sector_spread: 58, effective_stocks: 5.7, effective_sectors: 3.3 };
  const bv = { ...eq, score: 61, effective_stocks: 5.5 };
  it("ties the score to the Spread card in both counts (row 142, open item 7)", () => {
    expect(spreadNote("equal", eq, bv, 13)).toBe("This score counts each share equally. By what you own now it reads 61, moving like 5.5 of 13 shares: the figures on the Spread card.");
    expect(spreadNote("value", eq, bv, 13)).toMatch(/^This score counts each share by what you own now: the figures on the Spread card. Counting each share equally it reads 62, moving like 5.7 of 13 shares\.$/);
    expect(spreadNote("equal", eq, null, 13)).toMatch(/Once every share has a quantity/);
  });
  it("explains how 'How independently they move' is scaled on a short list (open item 12)", () => {
    const t = independentNote({ ...eq, comovement: 26, effective_stocks: 2.0 }, 2);
    expect(t).toMatch(/^Reads 26 although your 2 shares move like 2\.0: the scale counts how many shares move on their own, not what part of the list does/);
  });
  it("fires the good sign only with two or more macro sectors (open item 11), singular for one", () => {
    const one = spreadCards({ n: 3, macro: 1, sector: 1, ind: 2, top: ["Industrials", 3], ones: 1, sizes: [1, 1, 1, 0] });
    expect(one.map((c) => c.kind)).toEqual(["watch", "insight"]); expect(one[0].title).toBe("Industrials is 100% of the list");
    const two = spreadCards({ n: 13, macro: 4, sector: 6, ind: 9, top: ["Consumer Discretionary", 5], ones: 6, sizes: [6, 1, 1, 5] });
    expect(two[0]).toMatchObject({ kind: "good", title: "Spread across 4 macro sectors, 6 sectors and 9 industries" });
    expect(spreadCards({ n: 2, macro: 2, sector: 1, ind: 1, top: ["Energy", 1], ones: 0, sizes: [2, 0, 0, 0] })[0].title).toBe("Spread across 2 macro sectors, 1 sector and 1 industry");
  });
});

describe("words beside every correlation and the folded lines", () => {
  it("adds the word beside two-decimal figures only", () => {
    expect(withCorrWords("They move with the rest at 0.32, the loosest; about 5.7 bets; 38% and 1.08×.")).toBe("They move with the rest at 0.32 (loosely linked), the loosest; about 5.7 bets; 38% and 1.08×.");
    expect(withCorrWords("already 0.34 (loosely linked)")).toBe("already 0.34 (loosely linked)");
  });
  it("reads the folded summaries (rows 209–212)", () => {
    expect(whereLine([{ name: "Consumer Discretionary", pct: 38.46 }, { name: "Industrials", pct: 23.1 }], false)).toBe("Most of it in Consumer Discretionary: 38.5% of your shares");
    expect(whereLine([{ name: "Industrials", pct: 51.2 }], true)).toBe("Most of it in Industrials: 51.2% of your money");
    expect(sectorsLine([{ a: "Consumer Discretionary", b: "Information Technology", avg: 0.34 }, { a: "Industrials", b: "Energy", avg: 0.2 }], null)).toBe("Most linked: Consumer Discretionary and Information Technology, 0.34 (loosely linked)");
    expect(sectorsLine([], "Industrials")).toBe("All your shares sit in one macro sector: Industrials");
    expect(gridLine(13, 5.71)).toBe("13 shares move like 5.7 independent ones.");
    expect(firstSentence("The list leans towards faster-growing companies. Valuation is close to typical.")).toBe("The list leans towards faster-growing companies.");
  });
});
