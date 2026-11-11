import { describe, expect, it } from "vitest";
import { parseRules } from "./typeRules";

const known = (k: string) => ["pe", "roe", "debt_to_equity", "dividend_yield", "market_cap"].includes(k);
describe("Type rules", () => {
  it("reads short names, and, commas, and fills the other end of a second rule on the same figure", () => {
    const r = parseRules("pe < 20 and roe > 15, debt < 0.5; yield > 2\npe > 5", known);
    expect(r.errors).toEqual([]);
    expect(r.ranges).toEqual({ pe: { max: 20, min: 5 }, roe: { min: 15 }, debt_to_equity: { max: 0.5 }, dividend_yield: { min: 2 } });
  });
  it("says in plain words what it cannot read", () => {
    const r = parseRules("pe is low, zzz > 3", known);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatch(/could not read/);
    expect(r.errors[1]).toMatch(/not a figure I know/);
  });
});
