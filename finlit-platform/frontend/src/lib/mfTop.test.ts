// Task #183 part 2 (MF portfolio), M4: the list box, the three tiles and each tab's Key figures, from the pack's five funds (the owner's live list, 15 Nov).
import { describe, expect, it } from "vitest";
import { fundsCards, listBox, mfTiles, mixCards, riskCards, MF_SECS } from "./mfTop";
import type { Holding, MfSpread } from "./mfPortfolio";
import type { MfRisk } from "./mfPack";

const sc = (final: number, label: string, parts: [number, number, number, number]) => ({ locked: false, final, label, status: "RATED", reason: null, runDate: null, inherited: null,
  parts: { performance: parts[0], risk: parts[1], cost: parts[2], quality: parts[3] } });
const H = (code: number, name: string, cat: string, catLabel: string, s: ReturnType<typeof sc>) => ({ id: String(code), code, name, category: cat, categoryLabel: catLabel, current: null, score: s }) as unknown as Holding;
const HS = [H(100177, "Quant Small Cap Fund", "Equity Scheme - Small Cap Fund", "Small Cap", sc(55.9, "Average", [60, 49, 62, 55])),
  H(101144, "ICICI Prudential Multi Asset Allocation Fund", "Hybrid Scheme - Multi Asset Allocation", "Multi Asset Allocation", sc(67.7, "Healthy", [56, 64, 77, 85])),
  H(147347, "ICICI Prudential MNC Fund", "Equity Scheme - Sectoral/ Thematic", "Sectoral / Thematic", sc(51.9, "Average", [28, 69, 37, 79])),
  H(152911, "Kotak MNC Fund", "Equity Scheme - Sectoral/ Thematic", "Sectoral / Thematic", sc(64.4, "Average", [64, 75, 64, 50])),
  H(153651, "JioBlackRock Liquid Fund", "Debt Scheme - Liquid Fund", "Liquid", sc(67.6, "Healthy", [68, 85, 56, 62]))];
const SP = { count: 5, size: { Large: 0.6, Mid: 0.25, Small: 0.06, Micro: 0.09, Other: 0 },   // task #262: below ₹10,000 Cr is Micro
  readings: { together: { word: "Move as one", independent: 1.3, of: 4 }, underneath: { stocks: 235, inTwoOrMore: 36 }, overlap: { word: "Low", top: { a: 101144, b: 147347, pct: 10.2, n: 30 } },
    theme: { theme: "MNC", funds: [147347, 152911] } },
  funds: [{ code: 147347, name: "ICICI Prudential MNC Fund", amc: "ICICI Prudential Mutual Fund" }, { code: 152911, name: "Kotak MNC Fund", amc: "Kotak Mahindra Mutual Fund" }] } as unknown as MfSpread;
const F = (code: number, short: string, betaOwn: number, riskShare: number, extra = {}) => ({ code, short, betaOwn, riskShare, listShare: 20, compared: true, benchmark: "Nifty MNC", benchKind: "index", ...extra });
const RK = { list: { swing: 9.6 }, bench: { swing: 14.3 }, own: { list: { betaOwn: 0.71 } },
  funds: [F(100177, "Quant Small Cap", 0.83, 28.1), F(101144, "ICICI Prudential Multi Asset Allocation", 1.02, 17.8, { benchmark: "68% Nifty 500 + 21% debt + 11% gold", benchKind: "blend" }),
    F(147347, "ICICI Prudential MNC", 0.82, 24.6), F(152911, "Kotak MNC", 0.9, 29.2), F(153651, "JioBlackRock Liquid", 0, 0.3, { compared: false })] } as unknown as MfRisk;

describe("MF portfolio top (M4)", () => {
  it("opens with the list box: count, types (equity first), stocks inside and the weighting", () => {
    expect(listBox(HS, SP)).toEqual({ n: 5, line: "2 thematic · 1 small cap · 1 multi asset · 1 liquid, with 235 stocks inside them.", weights: "Every fund counts the same until you add units.", valued: false });
  });
  it("has one tile per tab, as the pack writes them", () => {
    expect(mfTiles(HS, SP, RK).map((t) => [t.id, t.k, t.v, t.sub])).toEqual([
      ["funds", "Your funds", "Average health · 62", "2 healthy · 3 average, by Fund Health Score"],
      ["mix", "Mix & overlap", "Moves like 1.3 of 4", "The equity-type funds rise and fall almost as one; the most two share is 10%"],
      ["risk", "Risk analytics", "Lower · β 0.71", "Each fund against its own benchmark; swings 9.6% a year vs 14.3%"]]);
    expect(mfTiles(HS, SP, RK).every((t) => t.help && t.how)).toBe(true);
  });
  it("has three Key figures cards on each tab, each jumping to its section", () => {
    expect(fundsCards(HS, SP).map((c) => [c.k, c.v, c.text, c.to])).toEqual([
      ["One theme twice", "MNC × 2", "ICICI Prudential MNC and Kotak MNC follow the same theme from two fund houses.", "mfp-move"],
      ["Weakest health part", "Performance 28", "ICICI Prudential MNC's performance part is the lowest in the list.", "mfp-funds"],
      ["Liquid counts as a fund", "20%", "Until units are added, the liquid fund weighs as much as each equity fund.", "mfp-units"]]);
    expect(mixCards(SP).map((c) => [c.k, c.v, c.text])).toEqual([
      ["Move almost as one", "1.3 of 4", "Four equity-type funds with different labels behave like 1.3 independent funds."],
      ["Little overlap in stocks", "10% at most", "The most two funds share is 10% of their money."],
      ["Stocks underneath", "235", "36 are held through two or more funds; 9% of the shares sit in companies below ₹10,000 Cr."]]);
    expect(riskCards(RK).map((c) => [c.k, c.v, c.text])).toEqual([
      ["Moves less than its markets", "β 0.71", "Each fund against its own benchmark, the list has moved 0.71% for each 1%."],
      ["Most risk for its size", "Kotak MNC 29%", "20% of the list, 29% of its ups and downs."],
      ["Highest beta", "1.02", "ICICI Prudential Multi Asset Allocation against its 68% Nifty 500 + 21% debt + 11% gold blend."]]);
    const ids = new Set(Object.values(MF_SECS).flatMap((t) => t.secs.map((s) => s[0])));
    for (const c of [...fundsCards(HS, SP), ...mixCards(SP), ...riskCards(RK)]) expect(ids.has(c.to) || c.to === "mfp-units").toBe(true);
  });
  it("lists the sections in the pack's order", () => {
    // task #275 (change 9): Key figures sit under the main section of each view
    expect(MF_SECS.funds.secs.map((s) => s[1])).toEqual(["Your funds", "Key figures"]);
    expect(MF_SECS.mix.secs.map((s) => s[1])).toEqual(["What they own", "Key figures", "Spread", "Money in", "Sectors inside", "Move together", "Shared stocks", "Company sizes", "Biggest stocks", "Trend"]);
    expect(MF_SECS.risk.secs.map((s) => s[1])).toEqual(["At a glance", "Key figures", "Beta build", "Own benchmark", "Risk share", "If the Nifty 500 fell", "Each fund"]);
  });
});
