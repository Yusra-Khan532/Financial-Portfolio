// Developer file 51: "The industry in numbers" in 14 Industry analysis (founder, 27 Nov 2026, 4:07 pm).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { IND_KEYS, fences, industryLead, industryNumbers, placeText } from "../lib/industryNumbers";
import { membershipPaths } from "./pack/IndustryNumbers";
import type { Row } from "../lib/screener";

const read = (p: string) => readFileSync(join(resolve(__dirname, ".."), p), "utf8");
const row = (symbol: string, o: Partial<Row>): Row => ({ symbol, name: symbol + " Ltd", pe: null, pb: null, roe: null, roce: null, operating_margin: null, debt_to_equity: null, sales_cagr: null, profit_cagr: null, dividend_yield: null, nse_industry: "Petroleum Products", ...o } as Row);
const rows: Row[] = [
  row("ME", { pe: 22.6, roe: 8.7, sales_cagr: 17.2, dividend_yield: 0.4, debt_to_equity: 0.41, pb: 1.9, roce: 9, operating_margin: 12, profit_cagr: 10 }),
  row("A", { pe: 6, roe: 22, sales_cagr: 12, dividend_yield: 3, debt_to_equity: 0.3, pb: 1.5, roce: 25, operating_margin: 10, profit_cagr: 9 }),
  row("B", { pe: 7, roe: 25, sales_cagr: 10, dividend_yield: 2.5, debt_to_equity: 0.2, pb: 1.2, roce: 28, operating_margin: 11, profit_cagr: 12 }),
  row("C", { pe: 8, roe: 20, sales_cagr: 13, dividend_yield: 3.2, debt_to_equity: 0.5, pb: 2.2, roce: 22, operating_margin: 14, profit_cagr: 8 }),
  row("D", { pe: -4, roe: 18, sales_cagr: 9, dividend_yield: 1, debt_to_equity: 0.35, pb: 1.6, roce: 19, operating_margin: 9, profit_cagr: 11 }),   // a loss: no P/E
  row("E", { pe: 6.5, roe: 30, sales_cagr: 11, dividend_yield: 4, debt_to_equity: 0.25, pb: 1.7, roce: 33, operating_margin: 13, profit_cagr: null }),
  row("OUT", { pe: 99, roe: 1 }),   // in the screener's industry, not a member of the group
];
const members = ["ME", "A", "B", "C", "D", "E"];

describe("the company against its industry's median company", () => {
  const r = industryNumbers(rows, members, "ME");
  const by = (k: string) => r.measures.find((m) => m.key === k)!;
  it("counts only the group's members, each once; nine measures in the Screener's definitions", () => {
    expect(r.n).toBe(6);
    expect(r.inIt).toBe(true);
    expect(IND_KEYS).toEqual(["pe", "pb", "dividend_yield", "roe", "roce", "operating_margin", "sales_cagr", "profit_cagr", "debt_to_equity"]);
    expect(by("roe").dots.map((d) => d.symbol)).not.toContain("OUT");
  });
  it("a loss-making company is left out of the P/E row (and counted as without a figure); the median is the middle company", () => {
    expect(by("pe").dots.map((d) => d.symbol)).toEqual(["ME", "A", "B", "C", "E"]);
    expect(by("pe").left).toBe(1);
    expect(by("pe").med).toBe(7);
    expect(by("roe").med).toBe(21);
    expect(by("profit_cagr").left).toBe(1);
  });
  it("says where the company sits, never better or worse", () => {
    expect(placeText(by("pe"))).toBe("Highest of the 5");
    expect(placeText(by("roe"))).toBe("Lowest of the 6");
    expect(placeText(by("debt_to_equity"))).toBe("Higher than 4 of the other 5");
    const none = industryNumbers([row("ME", { pe: -2 }), ...rows.slice(1)], members, "ME").measures.find((m) => m.key === "pe")!;
    expect(none.me).toBeNull();
    expect(placeText(none)).toBe("No figure: a loss, so no P/E");
  });
  it("one plain sentence: the furthest from the middle, one a group, in the groups' order", () => {
    expect(industryLead("Reliance", "Petroleum Products", r.measures)).toBe(
      "Against the median Petroleum Products company, Reliance is priced at more times its profit (22.6× against 7.0×), earns a lower return on equity (8.7% against 21.0%) and has grown sales faster over five years (17.2% a year against 11.5%).");
    const mid = industryNumbers(rows, members, "C").measures;
    expect(industryLead("C", "Petroleum Products", mid)).toMatch(/^Against the median Petroleum Products company, C |^C sits near the middle/);
    expect(industryLead("X", "Y", [])).toBeNull();
  });
  it("one far company does not squeeze the strip: the scale ends at the furthest value inside the fences; the true ends stay in the labels", () => {
    expect(fences([3.6, 5, 6, 6.5, 6.8, 7, 7.5, 8, 9, 12, 57.2])).toEqual({ lo: 3.6, hi: 9 });   // the middle half 6.25 to 8.5: fences 2.9 and 11.9
    expect(fences([1, 1, 1, 1])).toEqual({ lo: 1, hi: 1 });
    expect(fences([])).toBeNull();
    expect(read("stock/pack/IndustryNumbers.tsx")).toContain('className={"in-dot" + (me ? " me" : "") + (out(c.v) ? " out" : "")}');
  });
  it("asks the membership in sorted chunks of 200", () => {
    expect(membershipPaths(["B", "A", "A"])).toEqual(["/api/sectors/membership?symbols=A,B"]);
    expect(membershipPaths(Array.from({ length: 201 }, (_, i) => "S" + String(i).padStart(3, "0")))).toHaveLength(2);
  });
  it("sits in 14 before the 6-month ranking, open to every plan; styles in the section's own sheet", () => {
    const w = read("stock/pack/WhereStands.tsx");
    expect(w.indexOf("<IndustryNumbers symbol={symbol} name={name} g={g} />")).toBeGreaterThan(0);
    expect(w.indexOf("<IndustryNumbers")).toBeLessThan(w.indexOf('{locked ? <LockedBlock plan="gold" title="Where the stock ranks inside its industry'));
    expect(read("stock/pack/stands.css")).toContain(".in-dot.me { z-index: 2; width: 12px; height: 12px; margin-left: -6px; background: var(--c1);");
  });
});
