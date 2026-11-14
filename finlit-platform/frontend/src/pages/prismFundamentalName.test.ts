import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adv = readFileSync(new URL("./AdvancedScoreScreener.tsx", import.meta.url), "utf8");

// Task #93 named the total "Prism Fundamental score". The 13 Nov screeners handover (task #64, V-7) replaces it: the band reads
// "FinLit Prism · 0–100, higher is better" (not "PRISM FUNDAMENTAL SCORE") and the columns Prism score, Growth & Profitability, Valuation,
// Quality, Risk, Short term, Long term.
describe("Prism names in the Advanced screener (task #64, V-7)", () => {
  it("the band is FinLit Prism with its scale, the total column is Prism score, and the technical columns are Short term and Long term", () => {
    expect(adv).toContain('label: "FinLit Prism", sub: "0–100, higher is better"');
    expect(adv).toContain('k="prism_final" label="Prism score"');
    expect(adv).toContain('label="Short term"');
    expect(adv).toContain('label="Long term"');
    expect(adv).not.toContain("Prism Fundamental score");
  });
});
