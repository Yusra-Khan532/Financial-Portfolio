// Task #275 (change 9, number fix 8): the MF portfolio's Key figures, three cards per view from the pack's table; a card with nothing to say is left out.
import { describe, expect, it } from "vitest";
import { MF_KF, mfKeyFigures } from "./mfKeyFigs";
import type { Holding, MfSpread } from "./mfPortfolio";
import type { MfRisk } from "./mfPack";

// the live page of 20 Nov: one fund, ICICI Prudential FMCG (Poor, 29; Performance 1, Risk 28, Cost 38, Quality 74; 216th of 223), 95% in shares
const FMCG = { id: "a", code: 1, name: "ICICI Prudential FMCG Fund", score: { final: 29, label: "POOR", parts: { performance: 1, risk: 28, cost: 38, quality: 74 }, rank: { rank: 216, of: 223, scope: null, categoryLabel: null } } } as unknown as Holding;
const SP = { count: 1, knownShares: 0.95, mix: { shares: 0.95, sharesUnknown: 0, debt: 0.05, other: 0 }, readings: { underneath: { stocks: 33, inTwoOrMore: 0 } },
  lookThrough: { macro: { "Fast Moving Consumer Goods|Large": { w: 0.78, n: 9, stocks: [] }, "Fast Moving Consumer Goods|Micro": { w: 0.0665, n: 3, stocks: [] }, "Consumer Services|Mid": { w: 0.0475, n: 1, stocks: [] }, "Consumer Discretionary|Small": { w: 0.056, n: 2, stocks: [] } }, sector: {} },
  topStocks: [{ name: "ITC", symbol: "ITC", w: 0.192, funds: [1] }, { name: "Hindustan Unilever", symbol: "HINDUNILVR", w: 0.178, funds: [1] }, { name: "Nestle India", symbol: "NESTLEIND", w: 0.072, funds: [1] }] } as unknown as MfSpread;
const RK = { funds: [{ code: 1, compared: true, benchmark: "Nifty FMCG", band: { word: "Similar" } }], list: { swing: 12.8, worstFall: -34 }, bench: { swing: 14.4, worstFall: -18.8 },
  own: { list: { betaOwn: 0.91, beta500: 0.5, worst10: { list: -2, nifty500: -2.8 } } } } as unknown as MfRisk;
const C = { hs: [FMCG], sp: SP, rk: RK };

describe("MF Key figures (change 9)", () => {
  it("Your funds: how healthy, its weakest part, what your money buys", () => {
    const [a, b, c] = mfKeyFigures("funds", C);
    expect([a.k, a.lead + a.rest]).toEqual(["How healthy your fund is", "Your fund scores 29 of 100: Poor."]);
    expect(a.stack!.map((s) => `${s.label} ${s.text}`)).toEqual(["Healthy 0", "Average 0", "Weak 0", "Poor 1"]);
    expect(a.note).toBe("ICICI Prudential FMCG ranks 216th of 223 in its category by the Fund Health Score.");
    expect(a.go).toEqual({ label: "Show the Poor fund", kind: "sort", arg: "health:Poor" });
    expect([b.k, b.lead + b.rest]).toEqual(["Its weakest part", "Performance: 1 of 100, the lowest of its four parts."]);
    expect(b.rows!.map((r) => `${r.label} ${r.text}`)).toEqual(["Performance 1", "Risk 28", "Cost 38", "Quality 74"]);
    expect([c.k, c.lead + c.rest]).toEqual(["What your money buys", "95% in shares, 5% in debt and money market."]);
    expect(c.note).toBe("33 companies sit inside the fund, and 89% of its shares are in Fast Moving Consumer Goods.");
  });
  it("Mix & overlap: largest sector, company sizes (the four sizes), biggest company", () => {
    const [a, b, c] = mfKeyFigures("mix", C);
    expect(a.lead + a.rest).toBe("Fast Moving Consumer Goods: 84.7% of your list.");
    expect(b.lead + b.rest).toBe("Mostly large companies: 78.0% of your list.");
    expect(b.stack!.map((s) => s.label)).toEqual(["Large", "Mid", "Small", "Micro", "Not in shares or not sized"]);
    expect(c.lead + c.rest).toBe("ITC: 19.2% of your fund.");
    expect(c.note).toBe("The 3 largest together are 44.2% of your list.");
  });
  it("Risk: the beta against its own benchmark beside the Nifty 500's weekly past-year figure (fix 4), the swing and the worst fall with their windows", () => {
    const [a, b, c] = mfKeyFigures("risk", C);
    expect(a.lead + a.rest).toBe("Beta 0.91: it has moved about 9% when its benchmark moved 10%.");
    expect(a.rows!.map((r) => `${r.label} ${r.text}`)).toEqual(["Own benchmark 0.91", "Nifty 500 0.50"]);
    expect(a.line).toBe(1);
    expect(a.from).toMatch(/Nifty 500: weekly, past year/);
    expect(b.lead + b.rest).toBe("12.8% in a typical year, against 14.4% for the Nifty 500.");
    expect(b.from).toBe("3 yrs, daily");
    expect(c.lead + c.rest).toBe("−34.0% from a high, deeper than the Nifty 500's −18.8%.");
    expect(c.note).toBe("Over 3 years. In the 10 worst weeks of the past year it fell less than the index: −2.0% against −2.8%.");
  });
  it("number fix 8: a card with nothing to say is left out, never shown as None", () => {
    const empty = { hs: [{ ...FMCG, score: { final: null, label: null, parts: null } } as unknown as Holding], sp: undefined, rk: undefined };
    expect(mfKeyFigures("funds", empty)).toEqual([]);
    expect(mfKeyFigures("mix", empty)).toEqual([]);
    expect(mfKeyFigures("risk", empty)).toEqual([]);
    const noSwing = { ...C, rk: { ...RK, list: { swing: null, worstFall: null }, bench: { swing: 14.4, worstFall: -18.8 } } as unknown as MfRisk };
    expect(mfKeyFigures("risk", noSwing).map((c) => c.id)).toEqual(["beta"]);
    for (const v of Object.keys(MF_KF) as (keyof typeof MF_KF)[]) for (const c of mfKeyFigures(v, C)) expect(`${c.lead}${c.rest ?? ""}${c.note ?? ""}`).not.toMatch(/\bNone\b|undefined|NaN/);
  });
});

import { mfInsideCompanies, mfInsideLine } from "./mfKeyFigs";
describe("What changed at the companies inside your funds (change 19)", () => {
  it("lists the companies at 0.3% or more of the list, largest first, each with the funds that hold it", () => {
    const sp = { count: 2, funds: [{ code: 1, name: "ICICI Prudential FMCG Fund" }, { code: 2, name: "Kotak MNC Fund" }],
      topStocks: [{ name: "ITC", symbol: "ITC", w: 0.096, funds: [1] }, { name: "Hindustan Unilever", symbol: "HINDUNILVR", w: 0.12, funds: [1, 2] }],
      lookThrough: { macro: { "FMCG|Large": { w: 0.3, n: 3, stocks: [{ name: "ITC", symbol: "ITC", w: 0.096 }, { name: "Hindustan Unilever", symbol: "HINDUNILVR", w: 0.09 }, { name: "Tiny", symbol: "TINY", w: 0.002 }] },
        "Consumer|Large": { w: 0.03, n: 2, stocks: [{ name: "Hindustan Unilever", symbol: "HINDUNILVR", w: 0.03 }, { name: "Unlisted", symbol: null, w: 0.01 }] } }, sector: {} } } as unknown as MfSpread;
    const cos = mfInsideCompanies(sp);
    expect(cos.map((c) => [c.symbol, +c.w.toFixed(1)])).toEqual([["HINDUNILVR", 12], ["ITC", 9.6]]);          // Tiny is 0.2%, under 0.3%; an unmatched holding has no symbol
    expect(mfInsideLine(cos[0])).toBe("12.0% of your funds · ICICI Prudential FMCG, Kotak MNC");
    expect(mfInsideLine(cos[1])).toBe("9.6% of your funds · ICICI Prudential FMCG");
  });
  it("names the one fund when there is only one", () => {
    const sp = { count: 1, funds: [{ code: 1, name: "ICICI Prudential FMCG Fund" }], topStocks: [], lookThrough: { macro: { "FMCG|Mid": { w: 0.006, n: 1, stocks: [{ name: "Emami", symbol: "EMAMILTD", w: 0.011 }] } }, sector: {} } } as unknown as MfSpread;
    expect(mfInsideCompanies(sp).map(mfInsideLine)).toEqual(["1.1% of your funds · ICICI Prudential FMCG"]);
  });
});

import { whole } from "./mfKeyFigs";
describe("Key figures read the server's band and whole shares that add up", () => {
  it("uses the server's list score and band for the health card", () => {
    const two = [FMCG, { ...FMCG, id: "b", code: 2, score: { ...FMCG.score, final: 68, label: "HEALTHY" } } as unknown as Holding];
    expect(mfKeyFigures("funds", { hs: two, list: { value: 48.5, label: "AVERAGE" } })[0].lead).toBe("Your funds average 49 of 100: Average");
  });
  it("keeps the total when rounding the money's parts", () => {
    expect(whole([48.5, 51.5, 0, 0])).toEqual([49, 51, 0, 0]);
    expect(whole([95, 5, 0, 0])).toEqual([95, 5, 0, 0]);
    expect(mfKeyFigures("funds", { hs: [FMCG], sp: { ...SP, mix: { shares: 0.485, sharesUnknown: 0, debt: 0.515, other: 0 } } as unknown as MfSpread })[2].lead + mfKeyFigures("funds", { hs: [FMCG], sp: { ...SP, mix: { shares: 0.485, sharesUnknown: 0, debt: 0.515, other: 0 } } as unknown as MfSpread })[2].rest)
      .toBe("49% in shares, 51% in debt and money market.");
  });
});
