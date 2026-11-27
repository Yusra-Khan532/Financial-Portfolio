// Task #396 (DCF calculator UI/UX): the redesign changes the page only. These figures were taken from the engine BEFORE the redesign and pin it, so any
// change to a formula, a default case or the reverse DCF fails here.
import { describe, expect, it } from "vitest";
import { defaultScenarios, impliedGrowth, impliedReturn, run, scenarios, sensitivity, type DcfInputs } from "./dcf";

const SETS: { name: string; i: DcfInputs }[] = [
  { name: "Reliance-like, Gordon, shares entered", i: { fcf0: 69197, r: 12, g1: 10, g2: 10, gT: 5, marketCap: 1859235.48, price: 1373.9, netDebt: 228444, mos: 20, shares: 1353.25, midYear: false, tvMethod: "gordon" } },
  { name: "net cash, mid-year, shares from market cap", i: { fcf0: 45000, r: 11, g1: 12, g2: 8, gT: 4, marketCap: 1250000, price: 3450, netDebt: -50000, mos: 30, shares: null, midYear: true, tvMethod: "gordon" } },
  { name: "exit multiple", i: { fcf0: 100, r: 12, g1: 15, g2: 10, gT: 5, marketCap: 2000, price: 100, netDebt: 0, mos: 20, shares: null, midYear: false, tvMethod: "exit", exitMultiple: 15 } },
];

const snap = (i: DcfInputs) => {
  const o = run(i), r = o.result!;
  return { iv: r.iv, ev: r.ev, sumPv: r.sumPv, pvTv: r.pvTv, buy: r.buyPrice, up: r.upside, tvShare: r.tvShare, fcfYield: r.impliedFcfYield, warnings: o.warnings.length,
    weighted: scenarios(i, defaultScenarios(i)).weighted, ig: impliedGrowth(i), ir: impliedReturn(i), sens: sensitivity(i, "g1", [5, 10], "r", [11, 12])[1][1] };
};

describe("DCF engine unchanged by the #396 redesign", () => {
  it("prints the pinned figures (kept in the test below)", () => {
    for (const s of SETS) expect(snap(s.i)).toMatchSnapshot(s.name);
  });
});
