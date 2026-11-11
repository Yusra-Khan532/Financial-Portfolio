import { describe, expect, it } from "vitest";
import { around, enterpriseValue, expectedValue, fairValue, growthMarginGrid, impliedReturn, marketEv, missScenarios, scenario, solve, terminalShare, tornado, upsideScenarios, validateInputs, valueParts, type RvInputs } from "./reverseVal";

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
    expect(m.find((x) => x.key === "combined")!.downside!).toBeLessThan(m.find((x) => x.key === "growth2")!.downside!);
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

  it("every miss scenario carries the value, the gap to today's price and the implied return, and the shocks have the sizes of the plan", () => {
    const p = priced();
    const m = missScenarios(p);
    expect(m.map((x) => x.key)).toEqual(["growth2", "growth5", "growth8", "margin2", "margin4", "margin6", "multiple10", "multiple25", "multiple40", "rate1", "rate2", "combined", "severe"]);
    for (const x of m) { expect(x.downside, x.key).toBeLessThan(0); expect(x.irr).not.toBeNull(); if (!x.key.startsWith("rate")) expect(x.irr, x.key).toBeLessThan(p.r); else expect(x.irr!).toBeCloseTo(p.r, 3); }    // a rate shock moves the value, not the return the price implies
    expect(m.find((x) => x.key === "growth5")!.downside!).toBeLessThan(m.find((x) => x.key === "growth2")!.downside!);
    expect(m.find((x) => x.key === "combined")!.recover!).toBeGreaterThan(0);                       // years to recover
    const up = upsideScenarios(p);
    for (const x of up) expect(x.downside, x.key).toBeGreaterThan(0);                              // the tool is not one-sided
  });
  it("the tornado orders the single shocks by how far they move the value", () => {
    const t = tornado(missScenarios(priced()));
    expect(t.length).toBe(4);
    for (let k = 1; k < t.length; k++) expect(Math.abs(t[k - 1].downside!)).toBeGreaterThanOrEqual(Math.abs(t[k].downside!));
  });
  it("an expected value from the user's own weights sits between the base and the severe miss", () => {
    const p = priced();
    const e = expectedValue(p, { base: 50, miss: 30, severe: 20 });
    expect(e.value!).toBeLessThan(fairValue(p));
    expect(e.value!).toBeGreaterThan(scenario(p, "x", "x", "miss", { dg: -5, dm: -4, mult: -0.25 }).fair!);
    expect(expectedValue(p, { base: 0, miss: 0, severe: 0 }).value).toBeNull();
  });
  it("terminal value options: the share after the forecast, a perpetuity cross-check, and the discount rate must exceed long-run growth", () => {
    const p = priced();
    expect(terminalShare(p)!).toBeGreaterThan(0.3);
    const perp = { ...p, terminal: "perpetuity" as const, termG: 5 };
    expect(Number.isFinite(valueParts(perp).terminal)).toBe(true);
    expect(validateInputs({ ...perp, r: 4 }).some((v) => v.field === "r")).toBe(true);
    expect(Number.isNaN(valueParts({ ...perp, r: 4 }).terminal)).toBe(true);
    const sol = solve({ ...perp, marketCap: fairValue(perp) * perp.shares, r: 20 }, "return");
    expect(sol.value!).toBeCloseTo(12, 2);
  });
  it("fade and S-curve shapes keep the round trip and the monotonic direction", () => {
    const shaped = priced({ growthPath: "fade", marginPath: "scurve", termG: 5 });
    expect(solve({ ...shaped, g: 3 }, "growth").value).toBeCloseTo(12, 3);
    expect(enterpriseValue({ ...shaped, g: 15 })).toBeGreaterThan(enterpriseValue({ ...shaped, g: 10 }));
    expect(enterpriseValue({ ...shaped, marginN: 26 })).toBeGreaterThan(enterpriseValue({ ...shaped, marginN: 20 }));
    expect(impliedReturn(shaped)).toBeCloseTo(12, 2);
  });
});
