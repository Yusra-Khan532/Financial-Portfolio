import { describe, expect, it } from "vitest";
import { around, enterpriseValue, fairValue, growthMarginGrid, marketEv, missScenarios, solve, validateInputs, type RvInputs } from "./reverseVal";

const base: RvInputs = { rev0: 1000, margin0: 18, marginN: 22, g: 12, exitMultiple: 12, r: 12, years: 10, taxPct: 25, depPct: 3, capexPct: 4, nwcPct: 10, netDebt: 200, marketCap: 0, shares: 10 };
/** A company priced exactly at what the projection gives. */
const priced = (over: Partial<RvInputs> = {}): RvInputs => { const i = { ...base, ...over }; return { ...i, marketCap: enterpriseValue(i) - i.netDebt }; };

describe("reverse valuation engine", () => {
  it("each solve returns the value that was used to set the price (round trip)", () => {
    const p = priced();
    expect(solve({ ...p, g: 3 }, "growth").value).toBeCloseTo(12, 3);
    expect(solve({ ...p, marginN: 10 }, "margin").value).toBeCloseTo(22, 3);
    expect(solve({ ...p, exitMultiple: 5 }, "multiple").value).toBeCloseTo(12, 3);
    expect(solve({ ...p, r: 20 }, "return").value).toBeCloseTo(12, 3);
  });
  it("value rises with growth, margin and multiple and falls with the discount rate", () => {
    expect(enterpriseValue({ ...base, g: 14 })).toBeGreaterThan(enterpriseValue({ ...base, g: 12 }));
    expect(enterpriseValue({ ...base, marginN: 24 })).toBeGreaterThan(enterpriseValue({ ...base, marginN: 22 }));
    expect(enterpriseValue({ ...base, exitMultiple: 14 })).toBeGreaterThan(enterpriseValue({ ...base, exitMultiple: 12 }));
    expect(enterpriseValue({ ...base, r: 14 })).toBeLessThan(enterpriseValue({ ...base, r: 12 }));
  });
  it("says so plainly when no value inside the bounds can justify the price", () => {
    const s = solve({ ...base, marketCap: 1e9 }, "growth");
    expect(s.value).toBeNull(); expect(s.why).toMatch(/justifies this price/);
    expect(solve({ ...base, marketCap: 0 }, "growth").value).toBeNull();
  });
  it("a miss scenario lowers the value, and the combined miss lowers it most", () => {
    const p = priced();
    const m = missScenarios(p);
    expect(m.every((x) => x.downside != null && x.downside < 0)).toBe(true);
    expect(m.find((x) => x.key === "combined")!.downside!).toBeLessThan(m.find((x) => x.key === "growth")!.downside!);
    expect(fairValue(p)).toBeCloseTo(p.marketCap / p.shares, 6);
  });
  it("the grid is centred on the price when growth and margin are the solved ones", () => {
    const p = priced();
    const g = growthMarginGrid(p, around(12, 2), around(22, 2));
    expect(g[2][2]).toBeCloseTo(p.marketCap / p.shares, 6);
    expect(g[4][4]!).toBeGreaterThan(g[0][0]!);
    expect(marketEv(p)).toBeCloseTo(enterpriseValue(p), 6);
  });
  it("validates the inputs", () => {
    expect(validateInputs(priced())).toEqual([]);
    expect(validateInputs({ ...priced(), marginN: 120, years: 7 }).map((v) => v.field)).toEqual(["marginN", "years"]);
  });
});
