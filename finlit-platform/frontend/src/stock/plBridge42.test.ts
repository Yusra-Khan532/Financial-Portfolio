// Developer file 42: "From revenue to net profit" and "Where each ₹100 goes" add up. RELIANCE FY26 (consolidated), as the live site sends it on
// 26 Nov 2026: the statement's "expenses" is total expenses (interest and depreciation included), which the old charts took as operating costs.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { addsUp, bridge, hundred, runs, type PlRows } from "./plBridge";
import { bridgeScale } from "./ProfitCharts";

const FY26: PlRows = {
  revenue: [1075675], other_income: [28962], expenses: [981475], operating_profit: [178949], finance_costs: [27061], depreciation: [57688],
  exceptional_items: [0], profit_before_tax: [123162], tax: [27552], net_profit: [80775],
};

describe("the walk from revenue to net profit adds up", () => {
  const steps = bridge(FY26, 0)!;
  it("operating costs are revenue less operating profit (not the total expenses), and every total is the steps before it", () => {
    expect(steps.map((s) => [s.label, s.value])).toEqual([
      ["Revenue", 1075675], ["Operating costs", -896726], ["Operating profit", 178949], ["Other income", 28962], ["Interest", -27061], ["Depreciation", -57688],
      ["Profit before tax", 123162], ["Tax", -27552], ["Minority & other", -14835], ["Net profit", 80775],
    ]);
    expect(addsUp(steps, 1075675)).toBe(true);
  });
  it("the old walk (total expenses as the costs, no step between tax and net profit) did not", () => {
    const old = [{ key: "r", label: "Revenue", value: 1075675, total: true }, { key: "e", label: "Expenses", value: -981475 }, { key: "op", label: "Operating profit", value: 178949, total: true }];
    expect(addsUp(old, 1075675)).toBe(false);                                     // 1,075,675 − 981,475 = 94,200, not 178,949
  });
  it("a gap the filings leave (for example a one-off) gets its own step; rounding does not", () => {
    const s = bridge({ ...FY26, profit_before_tax: [123162 + 5000] }, 0)!;
    expect(s.find((x) => x.key === "other")?.value).toBe(5000);
    expect(addsUp(s, 1075675)).toBe(true);
    expect(bridge({ ...FY26, net_profit: [95610.4] }, 0)!.some((x) => x.key === "adj")).toBe(false);
  });
  it("a missing figure the walk needs draws nothing rather than a wrong walk", () => {
    expect(bridge({ ...FY26, operating_profit: [null] }, 0)).toBeNull();
  });
  it("revenue and the operating costs run past the scale and are cut; the steps after operating profit set it", () => {
    const { at, past, r } = bridgeScale(steps);
    expect(past(1075675)).toBe(true);
    expect(past(178949 + 28962)).toBe(false);
    expect(at(r[3].to)).toBeGreaterThan(80);                                        // operating profit plus other income nearly fills the row
  });
  it("runs give each bar its start and end", () => {
    expect(runs(steps).slice(0, 4)).toEqual([{ from: 0, to: 1075675 }, { from: 1075675, to: 178949 }, { from: 0, to: 178949 }, { from: 178949, to: 207911 }]);
  });
});

describe("where each ₹100 of income goes", () => {
  it("the parts of a year come to exactly ₹100 (the old columns came to about ₹109)", () => {
    const h = hundred(FY26, 0)!;
    expect(h.income).toBe(1075675 + 28962);
    expect(h.parts.reduce((a, p) => a + p.value, 0)).toBeCloseTo(100, 6);
    expect(h.parts.map((p) => [p.label, Number(p.value.toFixed(1))])).toEqual([["Operating costs", 81.2], ["Interest", 2.4], ["Depreciation", 5.2], ["Tax", 2.5], ["Minority & other", 1.3], ["Net profit", 7.3]]);
    const old = [981475, 27061, 57688, 27552, 80775].reduce((a, x) => a + x, 0) / 1075675 * 100;
    expect(old).toBeGreaterThan(108);
  });
  it("a loss year has no profit part; its costs pass ₹100 by the loss", () => {
    const h = hundred({ ...FY26, profit_before_tax: [-10000], operating_profit: [178949 - 133162], tax: [0], net_profit: [-10000] }, 0)!;
    expect(h.parts.some((p) => p.key === "np")).toBe(false);
    expect(h.loss).toBeGreaterThan(0);
    expect(h.parts.reduce((a, p) => a + p.value, 0)).toBeCloseTo(100 + h.loss, 6);
  });
});

describe("the cards", () => {
  const more = readFileSync(resolve(__dirname, "MoreCharts.tsx"), "utf8");
  it("Financials' profit and loss charts use the walk that adds up; the growth grid calls the expenses line what it is", () => {
    expect(more).toContain("<ProfitBridge steps={steps} year={pl.periods[last]} />");
    expect(more).toContain("<HundredChart periods={pl.periods} rows={rows} />");
    expect(more).toContain('title="Where each ₹100 of income goes"');
    expect(more).toContain('["Total expenses", exp]');
    expect(more).not.toMatch(/share\(exp\)/);
  });
});
