// Task #136: the ETF portfolio's tiles and insight cards, from the server's figures (built from live data of 13 Nov 2026 through the server code).
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { etfCards, etfTiles, kindOf, sameIndexText, yearlyCost } from "./etfPack";
import { etfRowsFromGrid, type EtfPortfolio, type EtfRisk, type Inside } from "./etfPortfolio";

const FX = (n: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/etfp-${n}.json`, import.meta.url), "utf8"));
const L: EtfPortfolio = FX("list"), R: EtfRisk = FX("risk"), I: Inside = FX("inside");
const traded = (v: number | null | undefined) => (v == null ? "—" : `₹${Math.round(v / 1e7)} Cr`);

describe("the five tiles", () => {
  const t = etfTiles(L, R, null);
  it("count by kind, the indexes with the twice tag, the weighted cost, price against value and the risk word", () => {
    expect(t.map((x) => x.k)).toEqual(["ETFs", "What they track", "Yearly cost", "Price against value", "Risk level"]);
    expect(t[0]).toMatchObject({ v: "5", sub: "2 Indian shares · 1 shares abroad · 1 gold · 1 liquid", to: "etfs" });
    expect(t[1]).toMatchObject({ v: "4 indexes", tag: "Nifty 50 twice", sub: "NIFTYBEES and SBINIFTY50 follow the same index", to: "inside" });
    expect(t[2].v).toBe("0.36% a year");                                         // (0.05 + 0.05 + 0.81 + 0.60 + 0.28) / 5, equal weights
    expect(t[2].sub).toBe("Average expense ratio. On ₹1 lakh, about ₹358 a year");
    expect(t[3]).toMatchObject({ v: "Close to NAV", sub: "4 of 5 closed within 0.2% of their NAV on 13 Nov; MON100 17.4% above", cols: "trading" });
    expect(t[4]).toMatchObject({ v: "Lower", sub: "than the Nifty 500, because your ETFs do not move together", to: "risk" });
  });
  it("a blank tile says why: no risk yet, no cost published", () => {
    expect(etfTiles(L, undefined, "The Nifty 500 history is not available right now.")[4]).toMatchObject({ v: "–", sub: "The Nifty 500 history is not available right now." });
    const none = { ...L, items: L.items.map((e) => ({ ...e, ter: { value: null, why: "x" } })) };
    expect(yearlyCost(none).avg).toBeNull();
    expect(etfTiles(none, R, null)[2].sub).toMatch(/No expense ratio is published/);
  });
  it("by value once quantities are in", () => {
    const w = { ...L, basis: "value" as const, items: L.items.map((e, i) => ({ ...e, weight: i === 2 ? 60 : 10 })) };
    expect(yearlyCost(w).avg).toBeCloseTo(0.1 * (0.05 + 0.05 + 0.6 + 0.28) + 0.6 * 0.81, 6);
  });
  it("kinds", () => { expect(L.items.map(kindOf)).toEqual(["Indian shares", "Indian shares", "gold", "shares abroad", "liquid"]); });
});

describe("insight cards: only those that apply, at most three", () => {
  it("same index twice, three asset types, a large premium", () => {
    const c = etfCards(L, R);
    expect(c.map((x) => [x.kind, x.title])).toEqual([["watch", "Two ETFs follow the Nifty 50"], ["good", "Three asset types, not one"], ["watch", "MON100 closed 17.4% above its NAV"]]);
    expect(c[0].text).toBe("NIFTYBEES and SBINIFTY50 follow the same index, so 40% of your ETF list sits in one index. The second one adds no spread; it adds a second fund house.");
  });
  it("no repeat, no card; without risk figures no 'asset types' card", () => {
    const one = { ...L, repeats: [], items: L.items.map((e) => ({ ...e, twice: false })) };
    expect(etfCards(one, undefined).map((x) => x.title)).toEqual(["MON100 closed 17.4% above its NAV"]);
  });
  it("a payout liquid ETF and the costlier of two on one index", () => {
    const items = L.items.map((e) => e.symbol === "LIQUIDCASE" ? { ...e, ret1y: null, ret1yWhy: "The price barely moves for this ETF: it pays out its earnings instead of growing the price." }
      : e.symbol === "SBINIFTY50" ? { ...e, ter: { value: 0.07 } } : e.symbol === "MON100" ? { ...e, premium: 0.3 } : e);
    const c = etfCards({ ...L, items }, undefined);
    expect(c.map((x) => x.title)).toEqual(["Two ETFs follow the Nifty 50", "A liquid ETF earns through payouts", "SBINIFTY50 costs the most of your Nifty 50 ETFs"]);
  });
  it("the same-index card names what differs", () => {
    expect(sameIndexText(L, I, traded)[0]).toEqual({ kind: "watch", title: "NIFTYBEES and SBINIFTY50: 100% the same companies",
      text: "Both follow the Nifty 50. The only differences are the fund house, the cost (0.05% each) and how much trades each day (₹274 Cr against ₹33 Cr)." });
  });
  it("never advises", () => {
    const words = [...etfTiles(L, R, null).map((t) => t.sub), ...etfCards(L, R).map((c) => c.title + c.text)].join(" ");
    expect(words).not.toMatch(/\b(buy|sell|hold|reduce|avoid|accumulate|target|best|switch|exit)\b/i);
  });
});

describe("reading a broker file", () => {
  it("finds ISIN, symbol, name and quantity under any heading row, and skips totals and titles", () => {
    const g = [["Holdings as on 13-11-2026"], [], ["Instrument", "ISIN", "Qty.", "Avg. cost", "LTP"], ["NIFTYBEES", "INF204KB14I2", "100", "250", "286.6"],
      ["GOLDBEES", "", "40", "60", "111.9"], ["HDFCBANK", "INE040A01034", "5", "1500", "1600"], ["Total", "", "", "", ""]];
    expect(etfRowsFromGrid(g)).toEqual([{ row: 4, isin: "INF204KB14I2", symbol: "NIFTYBEES", qty: "100" }, { row: 5, symbol: "GOLDBEES", qty: "40" }, { row: 6, isin: "INE040A01034", symbol: "HDFCBANK", qty: "5" }]);
  });
  it("a sheet with no heading still gives its ISINs", () => {
    expect(etfRowsFromGrid([["x", "INF204KB17I5", "10"], ["nothing here"]])).toEqual([{ row: 1, isin: "INF204KB17I5" }]);
  });
});
