// Task #183 W7: the Diversification analytics figures (lib/eqDiv), against hand-worked examples.
import { describe, expect, it } from "vitest";
import { averageLinkage, divKeyCards, effective, groupCard, heatOf, looserFamilies, sameVsDiff, sectorCards, sizeCards, sizeFigures, tiesOf, whereGrid, type Size3 } from "./eqDiv";

// five shares: A, B, C in Industrials (A–B close), D in IT, E in Utilities (E close to A)
const order = ["A", "B", "C", "D", "E"];
const C = [
  [1, 0.8, 0.3, 0.1, 0.6],
  [0.8, 1, 0.4, 0.2, 0.5],
  [0.3, 0.4, 1, 0.2, 0.1],
  [0.1, 0.2, 0.2, 1, 0.0],
  [0.6, 0.5, 0.1, 0.0, 1],
];
const sector: Record<string, string> = { A: "Industrials", B: "Industrials", C: "Industrials", D: "Information Technology", E: "Utilities" };
const size: Record<string, Size3 | null> = { A: "Small", B: "Small", C: "Mid", D: "Large", E: null };
const of = (s: string) => sector[s], sz = (s: string) => size[s];

describe("how many bets", () => {
  it("is n / (1 + (n − 1) × average)", () => {
    expect(effective(4, 0)).toBe(4); expect(effective(4, 1)).toBe(1); expect(effective(37, 0.3).toFixed(1)).toBe("3.1"); expect(effective(1, 0.5)).toBe(1);
  });
});

describe("sector against sector", () => {
  it("averages the pairs between two sectors and inside one; one share has no inside figure", () => {
    const h = heatOf(order, C, of);
    expect(h.names).toEqual(["Industrials", "Information Technology", "Utilities"]);
    expect(h.cell("Industrials", "Industrials").avg).toBeCloseTo((0.8 + 0.3 + 0.4) / 3);
    expect(h.cell("Industrials", "Utilities").avg).toBeCloseTo((0.6 + 0.5 + 0.1) / 3);
    expect(h.cell("Utilities", "Industrials")).toEqual(h.cell("Industrials", "Utilities"));
    expect(h.cell("Utilities", "Utilities")).toEqual({ avg: null, pairs: 0 });
  });
  it("splits same-sector and different-sector pairs, and ranks the ties to the rest, loosest first", () => {
    const sd = sameVsDiff(order, C, of);
    expect(sd.same.pairs + sd.diff.pairs).toBe(10); expect(sd.same.pairs).toBe(3);
    expect(tiesOf(order, C, of).map((t) => [t.name, +t.avg.toFixed(3)])).toEqual([["Information Technology", 0.125], ["Industrials", 0.283], ["Utilities", 0.3]]);
  });
  it("words its three things to know without advice", () => {
    const c = sectorCards(tiesOf(order, C, of), heatOf(order, C, of), "macro sector");
    expect(c.map((x) => x.title)).toEqual(["Industrials sets the pace", "Information Technology goes its own way", "Two macro sectors have one share each"]);
    expect(JSON.stringify(c)).not.toMatch(/\b(buy|sell|hold|target|best)\b/i);
  });
});

describe("stock groups (average linkage on 1 − ρ, the server's rule)", () => {
  it("joins A and B first (0.80), then E (0.55 with them); C (0.27) stays out", () => {
    expect(averageLinkage(order, C, 0.6)).toEqual([["A", "B"]]);
    expect(averageLinkage(order, C, 0.5)[0].sort()).toEqual(["A", "B", "E"]);
    expect(averageLinkage(order, C, 0.9)).toEqual([]);
    expect(looserFamilies(order, C, [{ members: ["A", "B"] }])).toEqual([{ members: expect.arrayContaining(["A", "B", "E"]), joins: 1 }]);   // a group and another share
    expect(looserFamilies(order, C, [{ members: ["A", "B", "E"] }])).toEqual([]);   // nothing new with a wider net
  });
  it("names a group by every macro sector it spans, joined with +, and tags it when it crosses sectors (A7)", () => {
    const g = groupCard(["A", "E"], 0.6, order, C, of, sz);
    expect(g.name).toBe("Industrials + Utilities"); expect(g.cross).toBe(true);
    expect(g.bets).toBeCloseTo(2 / 1.6); expect(g.withOwn).toBeCloseTo((0.8 + 0.3) / 2);   // A with B and C, its own sector; E has no other Utilities share
    expect(g.sizeWord).toBe("All small companies");   // E has no size band yet: the sizes named are the known ones
    const one = groupCard(["A", "B"], 0.8, order, C, of, sz);
    expect([one.name, one.cross, one.withOwn, one.sizeWord]).toEqual(["Industrials", false, null, "All small companies"]);
  });
});

describe("company sizes", () => {
  it("figures each size with itself, the 3 × 3 grid, and where the closest pairs come from", () => {
    const f = sizeFigures(order, C, sz, 3);
    expect(f.within.find((x) => x.k === "Small")).toMatchObject({ n: 2, avg: 0.8 });
    expect(f.within.find((x) => x.k === "Large")).toMatchObject({ n: 1, avg: null });
    expect(f.closest).toBe(3);
    expect(f.mix.reduce((a, m) => a + m.top, 0)).toBe(3);
    expect(f.mix[0]).toMatchObject({ k: "Mid with Small", top: 2 });
    expect(Math.round(f.mix.reduce((a, m) => a + m.allShare, 0))).toBe(100);
  });
});

describe("where it sits (D52, D53)", () => {
  it("puts every share in its row, the rows and the columns each add to 100%, and names a share with no size", () => {
    const g = whereGrid(order, of, sz);
    expect(g.rows.map((r) => r.name)).toEqual(["Industrials", "Information Technology", "Utilities"]);
    expect(g.rows.reduce((a, r) => a + r.pct, 0)).toBeCloseTo(100);
    expect(g.rows[0].cells.find((c) => c.k === "Small")!.who).toEqual(["A", "B"]);
    expect(g.noSize).toEqual(["E"]);
    expect(g.cols.reduce((a, c) => a + c.n, 0) + g.noSize.length).toBe(order.length);
  });
});

describe("key figures (B18)", () => {
  it("are Concentration, Hidden packs and Moves like, each jumping to its sub-tab", () => {
    const k = divKeyCards({ top: { name: "Industrials", n: 15, pct: 38.5, sectorNames: ["Capital Goods"] }, N: 39, groups: 9, cross: 5, eff: 7.8, counted: 37, small: { n: 18, avg: 0.36 }, sameAvg: 0.35 });
    expect(k.map((c) => [c.k, c.v, c.to])).toEqual([["Concentration", "Industrials · 39%", "eq-sectors"], ["Hidden packs", "5 of 9 groups", "eq-groups"], ["Moves like", "7.8 of 37", "eq-sizes"]]);
    expect(k[0].text).toBe("15 of 39 shares by count, all of them Capital Goods at sector level.");
    expect(k[2].text).toMatch(/Your 18 small companies move together more closely \(0.36\) than shares inside one sector/);
  });
});

describe("the size words follow the figures", () => {
  it("say 'as a pack' only at 0.40 or more, and 'though only' only when the closest pairs lean to a mix", async () => {
    const { mixLine } = await import("../portfolio/pack/DivPack");
    expect(mixLine({ k: "Small with Small", top: 17, allShare: 23 }, 30)).toBe("17 of your 30 closest pairs are small with small, though only 23% of all pairs are.");
    expect(mixLine({ k: "Large with Large", top: 23, allShare: 81 }, 30)).toBe("23 of your 30 closest pairs are large with large, in line with their 81% share of all pairs.");
    const C2 = [[1, 0.28, 0.1], [0.28, 1, 0.1], [0.1, 0.1, 1]];
    const f = sizeFigures(["X", "Y", "Z"], C2, (s) => (s === "Z" ? "Large" : "Mid"));
    expect(sizeCards(f)[0].title).toBe("Mid companies move together most");
  });
});
