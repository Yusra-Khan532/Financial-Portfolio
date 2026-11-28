// Developer files 51 and 52: "In numbers" in 14 Industry analysis (founder, 27 Nov 2026: 4:07 pm, then 5:22 pm "I am not able to understand what it is").
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { IND_KEYS, PLAIN, industryNumbers, industryShares, sitAt, sitText, standouts } from "../lib/industryNumbers";
import { membershipPaths, sizeReading } from "./pack/IndustryNumbers";
import type { Row } from "../lib/screener";

const read = (p: string) => readFileSync(join(resolve(__dirname, ".."), p), "utf8");
const row = (symbol: string, o: Partial<Row>): Row => ({ symbol, name: symbol + " Ltd", pe: null, pb: null, roe: null, roce: null, operating_margin: null, debt_to_equity: null, sales_cagr: null, profit_cagr: null, dividend_yield: null, market_cap: null, nse_industry: "Petroleum Products", ...o } as Row);
const rows: Row[] = [
  row("ME", { pe: 22.6, roe: 8.7, sales_cagr: 17.2, dividend_yield: 0.4, debt_to_equity: 0.41, pb: 1.9, roce: 9, operating_margin: 12, profit_cagr: 10, market_cap: 1_889_413 }),
  row("A", { pe: 6, roe: 22, sales_cagr: 12, dividend_yield: 3, debt_to_equity: 0.3, pb: 1.5, roce: 25, operating_margin: 10, profit_cagr: 9, market_cap: 150_000 }),
  row("B", { pe: 7, roe: 25, sales_cagr: 10, dividend_yield: 2.5, debt_to_equity: 0.2, pb: 1.2, roce: 28, operating_margin: 11, profit_cagr: 12, market_cap: 100_000 }),
  row("C", { pe: 8, roe: 20, sales_cagr: 13, dividend_yield: 3.2, debt_to_equity: 0.5, pb: 2.2, roce: 22, operating_margin: 14, profit_cagr: 8, market_cap: 50_000 }),
  row("D", { pe: -4, roe: 18, sales_cagr: 9, dividend_yield: 1, debt_to_equity: 0.35, pb: 1.6, roce: 19, operating_margin: 9, profit_cagr: 11, market_cap: 10_000 }),   // a loss: no P/E
  row("E", { pe: 6.5, roe: 30, sales_cagr: 11, dividend_yield: 4, debt_to_equity: 0.25, pb: 1.7, roce: 33, operating_margin: 13, profit_cagr: null, market_cap: 5_000 }),
  row("OUT", { pe: 99, roe: 1, market_cap: 9_999_999 }),   // in the screener's industry, not a member of the group
];
const members = ["ME", "A", "B", "C", "D", "E"];

describe("the company against its industry's typical company", () => {
  const r = industryNumbers(rows, members, "ME");
  const by = (k: string) => r.measures.find((m) => m.key === k)!;
  it("counts only the group's members, each once; nine measures in the Screener's definitions, each said in words", () => {
    expect(r.n).toBe(6);
    expect(IND_KEYS).toEqual(["pe", "pb", "dividend_yield", "roe", "roce", "operating_margin", "sales_cagr", "profit_cagr", "debt_to_equity"]);
    expect(IND_KEYS.every((k) => PLAIN[k]?.what && PLAIN[k]?.term)).toBe(true);
    expect(PLAIN.pe).toEqual({ what: "Price for each ₹1 of yearly profit", term: "P/E" });
    expect(by("roe").dots.map((d) => d.symbol)).not.toContain("OUT");
  });
  it("a loss-making company is left out of the P/E row; the typical company is the middle one", () => {
    expect(by("pe").dots.map((d) => d.symbol)).toEqual(["ME", "A", "B", "C", "E"]);
    expect(by("pe").left).toBe(1);
    expect(by("pe").med).toBe(7);
    expect(by("roe").med).toBe(21);
  });
  it("where it sits, in words and from 0 (lowest) to 1 (highest); never better or worse", () => {
    expect(sitText(by("pe"))).toEqual({ word: "Among the highest", detail: "the highest of the 5" });
    expect(sitText(by("roe"))).toEqual({ word: "Among the lowest", detail: "the lowest of the 6" });
    expect(sitText(by("debt_to_equity"))).toEqual({ word: "Among the highest", detail: "higher than 4 of the other 5" });
    expect(sitText(by("operating_margin"))).toEqual({ word: "Above the middle", detail: "higher than 3 of the other 5" });
    expect(sitAt(by("pe"))).toBe(1);
    const none = industryNumbers([row("ME", { pe: -2 }), ...rows.slice(1)], members, "ME").measures.find((m) => m.key === "pe")!;
    expect(sitText(none)).toEqual({ word: "No figure", detail: "a loss, so no P/E" });
  });
  it("what stands out: one line each, both figures, one a group, at most three", () => {
    expect(standouts("Reliance", r.measures).map((x) => x.text)).toEqual([
      "Reliance is priced at more times its profit: 22.6×, against 7.0× for the typical company.",
      "Reliance earns less on shareholders' money: 8.7%, against 21.0% for the typical company.",
      "Reliance has grown its sales faster over five years: 17.2% a year, against 11.5% a year for the typical company."]);
  });
  it("who makes up the industry: each member's share of the members' market value, largest first", () => {
    const sh = industryShares(rows, members, "ME")!;
    expect(sh.n).toBe(6);
    expect(sh.list.map((x) => x.symbol)).toEqual(["ME", "A", "B", "C", "D", "E"]);
    expect(sh.me).toEqual({ rank: 1, share: expect.closeTo(85.7, 1) });
    expect(sizeReading(sh)).toEqual({ chip: "Largest of 6", line: "86% of the industry's market value" });
    expect(sizeReading(industryShares(rows, members, "C"))).toEqual({ chip: "4th largest of 6", line: "2.3% of the industry's market value" });
  });
  it("asks the membership in sorted chunks of 200", () => {
    expect(membershipPaths(["B", "A", "A"])).toEqual(["/api/sectors/membership?symbols=A,B"]);
    expect(membershipPaths(Array.from({ length: 201 }, (_, i) => "S" + String(i).padStart(3, "0")))).toHaveLength(2);
  });
  it("no dot strips any more: the meter's middle mark is the typical company; styles in the section's own sheet", () => {
    const c = read("stock/pack/IndustryNumbers.tsx"), css = read("stock/pack/stands.css");
    expect(c).not.toMatch(/stripDots|fences|hollow/);
    expect(c).toContain('<span className="in-meter" aria-hidden="true"><i className="mid" />');
    expect(css).toContain(".in-meter .mid { position: absolute; top: -4px; bottom: -4px; left: 50%; border-left: 1.5px dashed var(--gold); }");
  });
});
