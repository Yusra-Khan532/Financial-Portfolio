import { describe, expect, it } from "vitest";
import { closeFilter, convert, countPass, defaultShow, presets, suggestName, unitCheck, unitTag, valueText, type Stats } from "./customRatio";
import type { MetricInfo } from "./proscreen";

const M = (key: string, label: string, unit: string, family: MetricInfo["family"] = null): MetricInfo =>
  ({ key, label, unit, family, ratioable: true, better: "none", tier: "basic", say: "", digits: 1, locked: false, hidden: false, variants: null, stats: null } as unknown as MetricInfo);
const cash = M("cash", "Cash and equivalents", "Cr", "cr"), mcap = M("market_cap", "Market cap", "Cr", "cr"), price = M("price", "Share price", "Rs", "per_share");
const assets = M("total_assets", "Total assets", "Cr", "cr"), np = M("net_profit", "Net profit (latest year)", "Cr", "cr"), pe = M("pe", "P/E", "x");
const byKey = new Map([cash, mcap, price, assets, np, pe, M("roa", "Return on assets", "%")].map((m) => [m.key, m]));

// task #64, Part 3
describe("Custom ratio rules", () => {
  it("CR-5: the suggested name is '<top> to <bottom>', without '(latest year)', up to 40 characters", () => {
    expect(suggestName(cash, mcap)).toBe("Cash and equivalents to market cap");
    expect(suggestName(np, assets)).toBe("Net profit to total assets");
    expect(suggestName(cash, undefined)).toBe("");
  });
  it("CR-3: the unit check: same family green; different families amber; a ratio or percentage amber", () => {
    expect(unitCheck(cash, mcap)!.tone).toBe("ok");
    const w = unitCheck(price, assets)!;
    expect(w.tone).toBe("warn"); expect(w.text).toMatch(/different units \(₹ per share and ₹ Cr\)/);
    expect(unitCheck(pe, mcap)!.text).toMatch(/already a ratio, a percentage or a count/);
    expect(unitTag(cash)).toBe("₹ Cr"); expect(unitTag(price)).toBe("₹ per share"); expect(unitTag(pe)).toBe("×");
  });
  it("CR-3: Net profit ÷ Total assets is close to Return on assets", () => {
    expect(closeFilter("net_profit", "total_assets", byKey)!.label).toBe("Return on assets");
    expect(closeFilter("cash", "market_cap", byKey)).toBeNull();
  });
  it("CR-3: % when both are in one family and the middle value is under 1; switching converts 5% to 0.05×", () => {
    expect(defaultShow(cash, mcap, 0.08)).toBe("pct"); expect(defaultShow(cash, mcap, 3)).toBe("times"); expect(defaultShow(pe, mcap, 0.2)).toBe("times");
    expect(convert(5, "times")).toBe(0.05); expect(convert(0.05, "pct")).toBe(5);
  });
  it("CR-4: presets from the ratio's own spread, counts as typed, and the value in words", () => {
    const st = { p25: 2.71, p50: 6.4, p75: 17.62 } as Stats;
    expect(presets(st).map((p) => [p.label, p.op, p.a])).toEqual([["Top quarter", "gt", 17.6], ["Above the middle", "gt", 6.4], ["Below the middle", "lt", 6.4], ["Lowest quarter", "lt", 2.71]]);
    const v = [1, 2, 3, 4, 5, 6];
    expect(countPass(v, "gt", 4)).toBe(3); expect(countPass(v, "lt", 2)).toBe(2); expect(countPass(v, "between", 5, 2)).toBe(4); expect(countPass(v, "none")).toBe(6);
    expect(valueText({ op: "gt", a: 14.2, show: "pct" })).toBe("≥ 14.2%"); expect(valueText({ op: "none", show: "times" })).toBe("Column");
  });
});
