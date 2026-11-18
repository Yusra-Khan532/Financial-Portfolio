// Task #217: the buy history's sums, with the task's own example (RELIANCE: 15 at ₹500, then 20 at ₹100 → 35 shares, average (15×500 + 20×100) ÷ 35).
import { describe, expect, it } from "vitest";
import { buyFrom, buysOf, listSummary, pnlOf, totalsOf } from "./buyHistory";
import type { Holding } from "./portfolio";

const H: Holding[] = [
  { id: "b", symbol: "RELIANCE", qty: 20, price: 100, date: "2025-06-02", owned: true }, { id: "a", symbol: "RELIANCE", qty: 15, price: 500, date: "2025-01-10", owned: true },
  { id: "t", symbol: "TCS", qty: 1, price: 0 },                                                         // a name only: no buys
  { id: "c", symbol: "INFY", qty: 4, price: 0, owned: true }, { id: "d", symbol: "INFY", qty: 6, price: 1500, date: "2026-01-05", owned: true },
];

describe("buy history (#217)", () => {
  it("adds up the task's example: total qty 35, average price 271.43, invested 9,500", () => {
    const t = totalsOf(buysOf(H, "reliance"));
    expect(t.buys.map((b) => `${b.qty}@${b.price}`)).toEqual(["15@500", "20@100"]);            // oldest first
    expect(t.qty).toBe(35); expect(t.invested).toBe(9500);
    expect(t.avg).toBeCloseTo((15 * 500 + 20 * 100) / 35, 10); expect(t.avg!.toFixed(2)).toBe("271.43");
  });
  it("a name without a quantity has no buys; a buy without a price stays in the quantity but out of the average", () => {
    expect(buysOf(H, "TCS")).toEqual([]);
    const t = totalsOf(buysOf(H, "INFY"));
    expect([t.qty, t.invested, t.avg, t.unpriced]).toEqual([10, 9000, 1500, 1]);
  });
  it("values the priced buys at today's price, and sums the list", () => {
    expect(pnlOf(totalsOf(buysOf(H, "RELIANCE")), 1420)).toEqual({ value: 49700, pnl: 40200, pct: (40200 / 9500) * 100 });   // the screenshot's 40,200 (423.16%)
    expect(pnlOf(totalsOf(buysOf(H, "RELIANCE")), null).value).toBeNull();
    const s = listSummary(H, (x) => ({ RELIANCE: 1420, INFY: 1600 } as Record<string, number>)[x]);
    expect(s).toEqual({ invested: 18500, value: 49700 + 9600, pnl: 49700 + 9600 - 18500, pct: ((59300 - 18500) / 18500) * 100, shares: 2 });
    expect(listSummary([H[2]], () => 100)).toBeNull();
  });
  it("reads a typed buy and refuses what cannot be one", () => {
    expect(buyFrom("reliance", { date: "2026-11-17", qty: "1,000", price: "1400.5" }, "2026-11-18")).toEqual({ symbol: "RELIANCE", qty: 1000, price: 1400.5, date: "2026-11-17", owned: true });
    expect(buyFrom("TCS", { date: "", qty: "3", price: "" }, "2026-11-18")).toEqual({ symbol: "TCS", qty: 3, price: 0, owned: true });
    expect(() => buyFrom("TCS", { date: "", qty: "0", price: "1" })).toThrow(/more than 0/);
    expect(() => buyFrom("TCS", { date: "", qty: "2", price: "-1" })).toThrow(/price/);
    expect(() => buyFrom("TCS", { date: "2026-12-01", qty: "2", price: "1" }, "2026-11-18")).toThrow(/future/);
  });
});
