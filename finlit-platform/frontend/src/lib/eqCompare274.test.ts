// Task #274 (the 20 Nov equity pack, change 17 and live text issue 7): picking NIFTY 500, Midcap 150 or Smallcap 250 in "Compare with" changed the picker
// but not the four tiles of Risk at a glance. The tiles (and the line above them) now follow the pick; an index without figures falls back to the Nifty 50.
import { describe, expect, it } from "vitest";
import { glanceTiles, riskLede, type RiskAnswer } from "./eqRisk";

const r = {
  to: "2026-11-14", from: "", counted: 15, shares: [], unknown: [], missingIndex: [], ranges: [],
  sizes: [{ size: "Small", n: 5, avgBeta: 1.2, adds: 0.33 }],
  betas: { weighted: 1.1, blended: 1.05, nifty: 1.15, weightedBand: null, blendedBand: null, niftyBand: null },
  glance: { list: { swing: 22.6, worstFall: -28.4, grain: "weekly", years: 3 }, nifty: { swing: 13.6, worstFall: -15.8, grain: "daily", years: 3 }, worst10: { list: -3.1, nifty: -2.4 }, weighted: 1.1,
    vs: { NIF50: { name: "Nifty 50", swing: 13.6, worstFall: -15.8, grain: "daily", years: 3, worst10: { list: -3.1, index: -2.4 }, beta: 1.15 },
      NIFSMA250: { name: "Nifty Smallcap 250", swing: 19.9, worstFall: -27.0, grain: "daily", years: 3, worst10: { list: -3.9, index: -4.4 }, beta: 0.96 } } },
} as unknown as RiskAnswer;

describe("Compare with: the four tiles follow the pick", () => {
  it("the Nifty 50 by default", () => {
    const t = glanceTiles(r);
    expect(t.map((x) => `${x.niftyWord}: ${x.nifty}`)).toEqual(["Nifty 50: 13.6%", "Nifty 50: −15.8%", "Nifty 50: −2.4%", "against the Nifty 50: 1.15"]);
  });
  it("Smallcap 250: every tile, its line and the lede change", () => {
    const t = glanceTiles(r, "NIFSMA250");
    expect(t.map((x) => `${x.niftyWord}: ${x.nifty}`)).toEqual(["Nifty Smallcap 250: 19.9%", "Nifty Smallcap 250: −27.0%", "Nifty Smallcap 250: −4.4%", "against the Nifty Smallcap 250: 0.96"]);
    expect(t[0].sub).toBe("About as bumpy as the index.");                  // 22.6 against 19.9
    expect(t[2].v).toBe("−3.9%"); expect(t[2].sub).toBe("Falls less when the market falls.");
    expect(riskLede(r, "NIFSMA250").rest).toMatch(/against 19\.9% for the Nifty Smallcap 250\.$/);
  });
  it("an index without figures (NIFTY 500 here) falls back to the Nifty 50 rather than showing nothing", () => {
    expect(glanceTiles(r, "NIF500")[0].niftyWord).toBe("Nifty 50");
  });
});
