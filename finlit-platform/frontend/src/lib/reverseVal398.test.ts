// Task #398 (Reverse valuation redesign): the page's look changed, its figures must not. These are the calculation engine's outputs recorded on 26 Nov 2026,
// before the redesign, for two companies' worth of inputs (an exit-multiple, steady-growth case and a perpetuity, fading-growth, S-curve case), in all four
// solve modes: the solved value, every miss and upside scenario (value per share, against today, implied return, years to recover), the price-driver order,
// the weighted outcome at two sets of weights, the growth x margin grid and the value at the solved inputs. Any drift fails here.
import { describe, expect, it } from "vitest";
import pinned from "./fixtures/reverseVal398.json";
import { around, expectedValue, fairValue, growthMarginGrid, missScenarios, solve, tornado, upsideScenarios, type RvInputs } from "./reverseVal";

const A: RvInputs = { rev0: 400000, margin0: 35.2, marginN: 35.2, g: 10, exitMultiple: 14.7, r: 12, years: 10, taxPct: 25, depPct: 3, capexPct: 4, nwcPct: 10, terminal: "multiple", termG: 5, growthPath: "steady", marginPath: "straight", netDebt: 588484, marketCap: 1301330, shares: 1539.3 };
const B: RvInputs = { rev0: 255324, margin0: 26.8, marginN: 26.5, g: 9.1, exitMultiple: 18.2, r: 12, years: 5, taxPct: 25, depPct: 3, capexPct: 4, nwcPct: 10, terminal: "perpetuity", termG: 5, growthPath: "fade", marginPath: "scurve", netDebt: -40000, marketCap: 1150000, shares: 361.8 };
const r6 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 1e6) / 1e6 + 0);   // + 0: JSON keeps no sign on zero

describe("reverse valuation figures are unchanged by the #398 redesign", () => {
  for (const [n, I] of [["A", A], ["B", B]] as const) for (const mode of ["growth", "margin", "multiple", "return"] as const) {
    it(`${n} solving for ${mode}`, () => {
      const s = solve(I, mode), f = ({ growth: "g", margin: "marginN", multiple: "exitMultiple", return: "r" } as const)[mode];
      const si = s.value != null ? ({ ...I, [f]: s.value } as RvInputs) : null;
      const now = { v: r6(s.value), miss: si ? missScenarios(si).map((m) => [m.key, r6(m.fair), r6(m.downside), r6(m.irr), r6(m.recover)]) : null,
        up: si ? upsideScenarios(si).map((m) => [m.key, r6(m.fair), r6(m.downside)]) : null, torn: si ? tornado(missScenarios(si)).map((m) => m.key) : null,
        ev: si ? [r6(expectedValue(si, { base: 50, miss: 30, severe: 20 }).value), r6(expectedValue(si, { base: 40, miss: 40, severe: 30 }).value)] : null,
        grid: si ? growthMarginGrid(si, around(Math.round(si.g * 10) / 10, 2), around(Math.round(si.marginN * 10) / 10, 2)).map((row) => row.map(r6)) : null, fv: si ? r6(fairValue(si)) : null };
      expect(now).toEqual((pinned as Record<string, unknown>)[`${n}.${mode}`]);
    });
  }
});
