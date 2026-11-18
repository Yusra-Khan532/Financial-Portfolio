// Task #235 (phase 1 follow-up): All my investments reads the Equity portfolio's buys and sales by what is left, first in, first out, added across
// portfolios; a share sold in full is left out; a share with no buys yet has no quantity. Before, every row's quantity was added, sales too.
import { describe, expect, it } from "vitest";
import { sharesBody } from "./myInvest";
import type { Holding } from "./portfolio";

const L = (id: string, symbol: string, pf: string, date: string, qty: number, price: number, side?: "sell"): Holding => ({ id, symbol, pf, date, qty, price, owned: true, ...(side ? { side } : {}) });

describe("the shares sent to All my investments", () => {
  it("sends what is left of each share across portfolios, leaves out a share sold in full, and keeps a name without a quantity", () => {
    const hs = [L("t1", "TIPSMUSIC", "dhan", "2025-04-15", 16, 498.4), L("t2", "TIPSMUSIC", "dhan", "2025-07-21", 26, 582.19), L("t5", "TIPSMUSIC", "dhan", "2026-02-10", 22, 640, "sell"),
      L("t9", "TIPSMUSIC", "upstox", "2025-01-01", 5, 500),
      L("i1", "ITC", "upstox", "2025-06-12", 40, 412.3), L("i3", "ITC", "upstox", "2026-01-20", 40, 455, "sell"),
      { id: "c1", symbol: "tcs", qty: 1, price: 0 }];
    expect(sharesBody(hs)).toEqual({ shares: [{ symbol: "TIPSMUSIC", qty: 25 }, { symbol: "TCS", qty: null }] });   // 16 + 26 − 22 in Dhan, 5 in Upstox; ITC sold in full
  });
});
