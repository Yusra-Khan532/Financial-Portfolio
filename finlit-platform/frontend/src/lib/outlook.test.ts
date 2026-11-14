import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, HORIZONS, PARAM_LABELS, VALUE_MAX, VALUE_MIN, VALUE_STEP, changedValues, clampValue, companyValues, signedPct, type Horizon, type Kind, type Outlook } from "./outlook";

describe("Build your own growth model: each input's own growth rate (task #146)", () => {
  const model = { rate: { rows: [
    { key: "co_1y", status: "ok", valuePct: 12.34 }, { key: "co_3y", status: "ok", valuePct: -3 }, { key: "sec_1y", status: "unavailable", valuePct: null },
  ] } } as unknown as Outlook;
  it("starts every slider at the company's own figure, and leaves a blank input blank", () => {
    expect(companyValues(model)).toEqual({ co_1y: 12.34, co_3y: -3 }); expect(companyValues(null)).toEqual({});
  });
  it("moves one rate without touching any other: no rebalancing, no total of 100", () => {
    const base = companyValues(model);
    const mine = { co_1y: 20 };
    expect(changedValues(base, mine)).toEqual({ co_1y: 20 });                                   // only the moved input is sent; co_3y keeps -3
    expect(changedValues(base, { co_1y: 20, co_3y: 45 })).toEqual({ co_1y: 20, co_3y: 45 });       // two moved: both kept as set, they need not add up to anything
    expect(changedValues(base, { co_1y: 12.3 })).toEqual({});                                      // back on the company's figure (as shown, one decimal): nothing changed
    expect(changedValues(base, { sec_1y: 8 })).toEqual({ sec_1y: 8 });                             // a blank input the user sets is used
  });
  it("keeps every rate within the model's limit, in tenths of a point (the knob sits on the figure shown)", () => {
    expect([clampValue(73), clampValue(-80), clampValue(12.26), clampValue(7.39), clampValue(NaN)]).toEqual([VALUE_MAX, VALUE_MIN, 12.3, 7.4, 0]);
    expect([VALUE_MIN, VALUE_MAX, VALUE_STEP]).toEqual([-50, 50, 0.1]);
  });
  it("every weight column (FinLit's, which combines the rates) adds to 100 and names every input, per horizon", () => {
    for (const kind of ["profit", "revenue"] as Kind[]) for (const h of HORIZONS) {
      const w = DEFAULT_WEIGHTS[kind][h.key];
      expect(Object.values(w).reduce((a, b) => a + b, 0)).toBe(100);
      expect(Object.keys(w)).toEqual(Object.keys(PARAM_LABELS[kind]));
    }
  });
  it("matches the team's table", () => {
    expect(DEFAULT_WEIGHTS.revenue.short).toEqual({ co_1y: 50, co_3y: 10, co_5y: 5, sec_1y: 25, sec_3y: 5, sec_5y: 5 });
    expect(DEFAULT_WEIGHTS.profit.long.margin).toBe(10);
    expect(HORIZONS.map((h) => h.years)).toEqual([1, 3, 5]);
    expect(Object.keys(DEFAULT_WEIGHTS.profit) as Horizon[]).toEqual(["short", "mid", "long"]);
  });
});

describe("formats", () => {
  it("signs percentages with a true minus", () => {
    expect(signedPct(4.24)).toBe("+4.2%"); expect(signedPct(-6.4)).toBe("−6.4%"); expect(signedPct(0)).toBe("0.0%"); expect(signedPct(12.345, 2)).toBe("+12.35%");
  });
});
