// Task #136 (pack 07): the ETF portfolio's tiles, insight cards and broker-file reading.
import { describe, expect, it } from "vitest";
import { cards, etfRowsFromGrid, tiles, type EtfHolding, type EtfRisk } from "./etfPortfolio";

const h = (o: Partial<EtfHolding>): EtfHolding => ({ id: o.symbol!, symbol: "X", name: "X ETF", isin: "", fundHouse: null, category: "nifty50", categoryLabel: "Nifty 50", assetClass: "equity",
  price: 100, previousClose: 100, changePct: 0, priceDate: "2026-11-13", volume: 0, avgTurnover: 1e8, ret1m: null, ret6m: null, ret1y: 5, ret3y: null, ret5y: null, cagr3y: null, cagr5y: null,
  vol1y: null, mdd1y: null, mdd3y: null, mdd5y: null, high52: null, low52: null, from52: null, rangeFrom: null, firstDate: null, points: 0, breakDate: null, nav: 100, navDate: "2026-11-13",
  premium: 0.05, premiumWide: false, why: {}, rank: 1, hot: true, ter: 0.05, units: null, value: null, weight: 25, missing: null, index: { key: "nifty50", label: "Nifty 50" }, twice: false, ...o } as EtfHolding);
const LIST = [
  h({ symbol: "NIFTYBEES", ter: 0.04, premium: -0.12, twice: true }), h({ symbol: "SETFNIF50", ter: 0.07, premium: 0.05, twice: true }),
  h({ symbol: "GOLDBEES", assetClass: "gold", category: "gold", index: { key: "gold", label: "Gold" }, ter: 0.79, premium: 0.18 }),
  h({ symbol: "LIQUIDBEES", assetClass: "debt", category: "liquid", index: { key: "liquid", label: "Liquid" }, ter: 0.69, premium: 0 }),
];

describe("ETF portfolio tiles (task #136)", () => {
  it("counts by type, names the index followed twice, weighs the cost and says how close prices were to NAV", () => {
    const t = tiles(LIST);
    expect(t.count).toEqual({ n: 4, types: "2 Indian shares · 1 gold · 1 liquid" });
    expect(t.track).toEqual({ n: 3, twice: "Nifty 50 twice", notTold: 0 });
    expect(tiles([...LIST, h({ symbol: "MON100", index: null })]).track.notTold).toBe(1);                    // an ETF whose index cannot be told is counted apart
    expect(t.cost.avg).toBe(0.4);                                                              // equal weights: (0.04 + 0.07 + 0.79 + 0.69) / 4
    expect(t.cost.perLakh).toBe(400);
    expect(t.nav).toMatchObject({ word: "Close to NAV", within: 4, of: 4, day: "2026-11-13", furthest: null });
    expect(tiles([...LIST, h({ symbol: "MON100", premium: 1.9, index: { key: "nasdaq", label: "Nasdaq 100" } })]).nav.furthest).toEqual({ symbol: "MON100", premium: 1.9 });
  });
});

describe("ETF portfolio insight cards (task #136)", () => {
  it("shows only those that apply, at most three: same index twice (Watch out), a liquid ETF (Insight), a large premium", () => {
    const c = cards(LIST);
    expect(c[0]).toMatchObject({ kind: "watch", title: "Two ETFs follow the Nifty 50" });
    expect(c[0].text).toContain("SETFNIF50 costs more a year (0.07% against 0.04%)");
    expect(c.find((x) => x.kind === "insight")?.title).toBe("LIQUIDBEES earns through payouts");
    expect(cards([h({ symbol: "A" })])).toEqual([]);                                             // nothing applies: no card
    const prem = cards([h({ symbol: "MON100", premium: 1.9, index: { key: "nasdaq", label: "Nasdaq 100" } })]);
    expect(prem[0].title).toBe("MON100 closed 1.90% above its NAV");
    expect(cards([...LIST, h({ symbol: "MON100", premium: 1.9, index: { key: "n", label: "N" } }), h({ symbol: "Z", index: { key: "n", label: "N" } })]).length).toBeLessThanOrEqual(3);
  });
  it("a mixed list that swung less than any one of its share ETFs is a good sign", () => {
    const rk = { list: { swing: 8 }, etfs: [{ symbol: "NIFTYBEES", swing: 13 }, { symbol: "SETFNIF50", swing: 13.1 }, { symbol: "GOLDBEES", swing: 14 }] } as unknown as EtfRisk;
    expect(cards(LIST, rk).some((c) => c.kind === "good" && c.title === "Mixing asset types made the list steadier")).toBe(true);
  });
});

describe("reading a broker file (task #136)", () => {
  it("takes every line with an ISIN, and the symbol and quantity columns the header names", () => {
    const grid = [["Holdings as on 13 Nov 2026"], ["Symbol", "ISIN", "Qty", "Avg. cost", "LTP"], ["NIFTYBEES-EQ", "INF204KB14I2", "100", "250.1", "286.6"], ["GOLDBEES", "", "40", "", ""], ["Total", "", "", "", ""]];
    expect(etfRowsFromGrid(grid)).toEqual([
      { isin: "INF204KB14I2", symbol: "NIFTYBEES", name: undefined, units: "100" },
      { isin: undefined, symbol: "GOLDBEES", name: undefined, units: "40" },
    ]);
  });
});
