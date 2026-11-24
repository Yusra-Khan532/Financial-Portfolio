// Task #183 part 2 (MF portfolio), M8 whole page: every ⓘ reads as two lines ("What it shows" / "How to read it"), no download control, insight cards closed
// on load (the shared Insights), "What this means, in short" from the funds' figures, and the page ends with the sources and "Information only, not investment advice."
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SOURCES, shortLines } from "./MfShort";
import type { MfSpread } from "../../lib/mfPortfolio";
import type { MfRisk } from "../../lib/mfPack";

const here = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
const FILES = ["./MfFunds.tsx", "./MfMix.tsx", "./MfRisk.tsx", "./MfTop.tsx", "../../pages/MfPortfolio.tsx"];

describe("MF portfolio whole page (M8)", () => {
  it("every ⓘ has its How to read it line", () => {
    for (const f of FILES) {
      const s = here(f);
      for (const t of s.match(/<Tip [^>]*\/>/g) ?? []) expect(t, `${f}: ${t.slice(0, 80)}`).toMatch(/\bhow=/);
      expect((s.match(/<Section [^>]*\bhow=/g) ?? []).length, f).toBe((s.match(/<Section [^>]*help=/g) ?? []).length);
      expect(s, f).not.toMatch(/Export CSV|download=|saveFile/);
    }
    const cols = here("./MfFunds.tsx").match(/help: \[/g) ?? [];
    expect(cols.length).toBeGreaterThan(0);                                      // column ⓘs carry [what, how] pairs
  });
  it("uses the shared Insights (closed on load) and never the always-open cards", () => {
    for (const f of FILES) expect(here(f), f).not.toMatch(/<Cards\b/);
    expect(here("../../portfolio/pack/EquityPack.tsx")).toContain("<DashCardsProvider userId={user?.id} remember={false}>");
  });
  it("ends with the sources and the closing words", () => {
    expect(SOURCES).toBe("NAVs, costs and categories from AMFI; holdings from each fund house's monthly portfolio file; index levels from NSE. Information only, not investment advice.");
    const page = here("../../pages/MfPortfolio.tsx"), tail = page.slice(page.lastIndexOf("</Gate>"));
    expect(tail).toMatch(/<PortfolioDisclaimer kind="mf" \/><\/details>\s*<p className="mfp-foot">\{SOURCES\}<\/p>\s*<\/div>/);
  });
  it("writes What this means, in short from the funds' figures", () => {
    const sp = { basis: "equal", knownShares: 0.504, size: { Large: 0.3, Mid: 0.155, Small: 0.045, Micro: 0.03, Other: 0 }, readings: { together: { independent: 1.3 } },
      coverage: { missing: [3], notMatched: 1 }, together: { codes: [1, 2, 4, 5], C: [[1, 0.8, 0.7, 0.75], [0.8, 1, 0.9, 0.85], [0.7, 0.9, 1, 0.74], [0.75, 0.85, 0.74, 1]] },
      funds: [{ code: 1, name: "Quant Small Cap Fund", category: "Small Cap" }, { code: 2, name: "ICICI Prudential Multi Asset Allocation Fund", category: "Multi Asset Allocation" },
        { code: 3, name: "Kotak MNC Fund", category: "Sectoral / Thematic" }, { code: 4, name: "ICICI Prudential MNC Fund", category: "Sectoral / Thematic" }, { code: 5, name: "Kotak Flexi Fund", category: "Flexi Cap" }] } as unknown as MfSpread;
    const rk = { funds: [{ compared: true, betaOwn: 0.82, band: { key: "defensive", word: "Defensive" } }, { compared: true, betaOwn: 1.02, band: { key: "similar", word: "Similar" } }, { compared: false, betaOwn: 0 }],
      own: { list: { betaOwn: 0.71, liquidShare: 20 } } } as unknown as MfRisk;
    expect(shortLines(sp, rk)).toEqual([
      ["Data", "Kotak MNC's monthly holdings are not loaded yet, so it is left out of the stock, sector and overlap readings. Its NAV is used for the risk figures. 1 share ISIN is not matched to a listed company: shown as \"Not sized\"."],
      ["Moves together", "Your four equity-type funds move like 1.3 independent funds. The closest pair is ICICI Prudential Multi Asset Allocation and ICICI Prudential MNC (0.90), from different categories."],
      ["Inside", "Half the list is in shares: 57% large, 29% mid, 8% small and 6% micro, by FinLit's ₹ sizes (Large above ₹75,000 Cr, Mid ₹25,000–75,000 Cr, Small ₹10,000–25,000 Cr, Micro below ₹10,000 Cr)."],
      ["Risk", "Against their own benchmarks the funds range from less sensitive to similar. The liquid fund holds the list's beta down to 0.71."]]);
  });
  it("task #275 (number fix 10): the in-short sizes are the four sizes, from the same totals as the grid (85% large, 5% mid, 4% small, 6% micro on 20 Nov)", () => {
    const sp = { basis: "equal", knownShares: 0.97, size: { Large: 0.8245, Mid: 0.0485, Small: 0.0388, Micro: 0.0582, Other: 0.03 }, readings: { together: { independent: 1 } },
      coverage: { missing: [], notMatched: 0 }, together: { codes: [1], C: [[1]] }, funds: [{ code: 1, name: "ICICI Prudential FMCG Fund", category: "Sectoral / Thematic" }] } as unknown as MfSpread;
    const inside = shortLines(sp, undefined).find(([k]) => k === "Inside")![1];
    expect(inside).toContain("85% large, 5% mid, 4% small and 6% micro");
    expect(inside).not.toMatch(/91% large|of those are in large companies/);
  });
});
