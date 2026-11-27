// F&O Academy costs (lib/fnoCosts.ts): every charge of a round trip at the rates as announced (STT from 1 April 2026, NSE charges from
// 1 March 2026), hand-worked, and the same figures the lessons of module 8 print.
import { describe, expect, it } from "vitest";
import { RATES, exerciseStt, roundTrip } from "./fnoCosts";

const amt = (r: ReturnType<typeof roundTrip>) => Object.fromEntries(r.lines.map((l) => [l.key, l.amount]));

describe("F&O round-trip charges", () => {
  it("uses the announced rates", () => {
    expect(RATES.stt).toMatchObject({ futures: 0.0005, options: 0.0015, exercise: 0.0015, from: "1 April 2026" });
    expect(RATES.exchange.futures * 1e7).toBeCloseTo(183, 9);
    expect(RATES.exchange.options * 1e7).toBeCloseTo(3553, 9);
    expect(RATES.sebi.rate * 1e7).toBeCloseTo(10, 9);
    expect(RATES.stamp).toMatchObject({ futures: 0.00002, options: 0.00003 });
    expect(RATES.gst.rate).toBe(0.18);
  });
  it("an options round trip: one lot of 65 from ₹100 to ₹120, ₹20 an order", () => {
    const r = roundTrip({ instrument: "options", entry: 100, exit: 120, lotSize: 65, lots: 1, side: "long", brokeragePerOrder: 20 });
    expect(amt(r)).toEqual({ brokerage: 40, stt: 11.7, exchange: 5.08, sebi: 0.01, stamp: 0.2, gst: 8.12 });
    expect(r).toMatchObject({ qty: 65, buyValue: 6500, sellValue: 7800, turnover: 14300, total: 65.11, gross: 1300, net: 1234.89, breakevenPoints: 1 });
  });
  it("a futures round trip: one lot of 65 from 24,500 to 24,560", () => {
    const r = roundTrip({ instrument: "futures", entry: 24500, exit: 24560, lotSize: 65, lots: 1, side: "long", brokeragePerOrder: 20 });
    expect(amt(r)).toEqual({ brokerage: 40, stt: 798.2, exchange: 58.36, sebi: 3.19, stamp: 31.85, gst: 18.28 });
    expect(r).toMatchObject({ total: 949.88, gross: 3900, net: 2950.12, breakevenPoints: 14.61 });
  });
  it("a short round trip: STT on the opening (seller's) trade, stamp duty on the closing (buyer's) trade", () => {
    const r = roundTrip({ instrument: "options", entry: 120, exit: 100, lotSize: 65, lots: 2, side: "short", brokeragePerOrder: 0 });
    expect(r.sellValue).toBe(15600); expect(r.buyValue).toBe(13000);
    expect(amt(r).stt).toBe(23.4); expect(amt(r).stamp).toBe(0.39); expect(amt(r).brokerage).toBe(0);
    expect(r.gross).toBe(2600);
  });
  it("a losing trade still pays every charge", () => {
    const r = roundTrip({ instrument: "options", entry: 100, exit: 80, lotSize: 65, lots: 1, side: "long", brokeragePerOrder: 20 });
    expect(r.gross).toBe(-1300); expect(r.total).toBeGreaterThan(50); expect(r.net).toBeLessThan(-1300);
  });
  it("STT on an exercised option is 0.15% of its intrinsic value", () => {
    expect(exerciseStt(60, 65)).toBe(5.85);   // module 3, lesson 6
    expect(exerciseStt(40, 65)).toBe(3.9);
    expect(exerciseStt(-5, 65)).toBe(0);
  });
});
