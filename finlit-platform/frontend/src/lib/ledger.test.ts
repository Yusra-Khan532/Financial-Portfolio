// Task #235 (pack B9, B11, B14): first in, first out, with the pack's own examples: TIPSMUSIC in Dhan (B11) and ITC in Upstox (B14).
import { describe, expect, it } from "vitest";
import { aggOf, ledgerOf, moneyOf, soldInFull } from "./ledger";
import type { Holding } from "./portfolio";

let n = 0;
const buy = (symbol: string, pf: string, date: string, qty: number, price: number): Holding => ({ id: "b" + n++, symbol, pf, date, qty, price, owned: true });
const sale = (symbol: string, pf: string, date: string, qty: number, price: number): Holding => ({ id: "s" + n++, symbol, pf, date, qty, price, owned: true, side: "sell" });
const TIPS = [buy("TIPSMUSIC", "dhan", "2025-04-15", 16, 498.4), buy("TIPSMUSIC", "dhan", "2025-07-21", 26, 582.19), buy("TIPSMUSIC", "dhan", "2025-08-15", 12, 552.53),
  buy("TIPSMUSIC", "dhan", "2025-09-06", 8, 777.73), sale("TIPSMUSIC", "dhan", "2026-02-10", 22, 640)];
const ITC = [buy("ITC", "upstox", "2025-06-12", 40, 412.3), buy("ITC", "upstox", "2025-09-03", 20, 438.1), sale("ITC", "upstox", "2026-01-20", 30, 455), sale("ITC", "upstox", "2026-07-08", 30, 402.5)];

describe("first in, first out (pack B11)", () => {
  it("TIPSMUSIC in Dhan: the sale uses all 16 of 15 Apr and 6 of 21 Jul; cost ₹11,468, sold for ₹14,080, booked +₹2,612; 40 left at ₹612.40", () => {
    const l = ledgerOf(TIPS, "TIPSMUSIC", "dhan");
    expect(l.sales[0].from.map((f) => [f.date, f.qty])).toEqual([["2025-04-15", 16], ["2025-07-21", 6]]);
    expect(Math.round(l.sales[0].cost!)).toBe(11468); expect(l.sales[0].got).toBe(14080); expect(Math.round(l.sales[0].gain!)).toBe(2612);
    expect(((l.sales[0].gain! / l.sales[0].cost!) * 100).toFixed(1)).toBe("22.8");
    expect(l.buys.map((b) => [b.left, b.sold])).toEqual([[0, 16], [20, 6], [12, 0], [8, 0]]);
    expect(l.qty).toBe(40); expect(l.avg!.toFixed(2)).toBe("612.40"); expect([l.nSales, l.bad]).toEqual([1, 0]);
  });
  it("ITC in Upstox, sold in full: bought ₹25,254, sold for ₹25,725, booked +₹471 (+1.9%)", () => {
    const l = ledgerOf(ITC, "ITC", "upstox");
    expect(l.sales.map((x) => x.from.map((f) => `${f.qty} from ${f.date}`))).toEqual([["30 from 2025-06-12"], ["10 from 2025-06-12", "20 from 2025-09-03"]]);
    expect(l.sales.map((x) => Math.round(x.gain!))).toEqual([1281, -810]);
    expect(Math.round(l.booked)).toBe(471); expect(soldInFull(l)).toBe(true); expect(l.qty).toBe(0);
    expect(Math.round(l.buys.reduce((a, b) => a + b.row.qty * b.row.price, 0))).toBe(25254);
  });
  it("a sale larger than what was held is flagged and left out; same-date buys come first; each portfolio keeps its own order", () => {
    const hs = [buy("X", "a", "2026-01-01", 62, 10), sale("X", "a", "2026-02-01", 70, 12), buy("X", "a", "2026-03-01", 5, 20), sale("X", "a", "2026-03-01", 5, 21),
      buy("X", "b", "2026-01-01", 100, 1)];
    const l = ledgerOf(hs, "X", "a");
    expect(l.sales[0].err).toBe(62); expect(l.bad).toBe(1);
    expect(l.sales[1].from).toEqual([{ id: hs[0].id, date: "2026-01-01", qty: 5 }]);      // FIFO uses the earliest buy, not the same-day one
    expect(l.qty).toBe(62);                                                             // the bad sale took nothing; 62 + 5 − 5
    expect(ledgerOf(hs, "X", "b").qty).toBe(100);                                        // a's sales never touch b's buys
  });
  it("a buy or sale without a price: the quantity still counts; average, invested and the booked gain wait for the price", () => {
    const hs = [buy("Y", "a", "2026-01-01", 10, 0), buy("Y", "a", "2026-02-01", 10, 50), sale("Y", "a", "2026-03-01", 5, 0)];
    const l = ledgerOf(hs, "Y", "a");
    expect([l.qty, l.avg, l.invested, l.bookedOk]).toEqual([15, null, null, false]);
    expect(l.sales[0].cost).toBeNull(); expect(l.sales[0].got).toBeNull();
  });
});

describe("All accounts and the money row (pack B1, B7)", () => {
  it("adds each portfolio's result: quantity summed, average weighted, booked added", () => {
    const hs = [...TIPS, buy("TIPSMUSIC", "upstox", "2025-05-01", 10, 600)];
    const a = aggOf(hs, "TIPSMUSIC", "all")!;
    expect(a.qty).toBe(50); expect(a.avg).toBeCloseTo((40 * 612.4 + 10 * 600) / 50, 1); expect(Math.round(a.booked)).toBe(2612);
    expect(a.pfs.sort()).toEqual(["dhan", "upstox"]); expect(aggOf(hs, "TIPSMUSIC", "upstox")!.qty).toBe(10);
  });
  it("counts the holdings, values them, and leaves a share without a buy price out of Invested and Gain; Booked gain from 3 sales", () => {
    const hs = [...TIPS, ...ITC, { id: "t", symbol: "TCS", qty: 3, price: 0, owned: true, pf: "dhan" } as Holding];
    const m = moneyOf(hs, "all", (s) => ({ TIPSMUSIC: 700, TCS: 3000, ITC: 400 } as Record<string, number>)[s], () => 1);
    expect([m.n, m.withQty, m.full]).toEqual([2, 2, 1]);                                // ITC sold in full is not counted
    expect(m.now).toBeCloseTo(40 * 700 + 3 * 3000); expect(m.invested).toBeCloseTo(40 * 612.4, 0); expect(m.missing).toEqual([{ symbol: "TCS", what: "price" }]);
    expect(Math.round(m.booked)).toBe(3083); expect(m.nSales).toBe(3);                    // the pack's +₹3,083 "From 3 sales" in All accounts
    expect(Math.round(moneyOf(hs, "upstox", () => 1, () => 0).booked)).toBe(471);
  });
});
