// Task #338 (23 Nov 2026): one price for a company on every page and every computer, kept current while the page is open, with its trade time.
import { describe, expect, it } from "vitest";
import type { Quote } from "./api";
import { isNewer, LIVE_EVERY_MS, marketOpen, tradeTime, withLatest } from "./liveQuote";

const base: Quote = { price: 98.07, change: -1.38, changePct: -1.39, previousClose: 99.45, open: 99.9, high: 100.2, low: 97.9, high52: 100.5, low52: 55.5, volume: 1,
  marketCapCr: 75431, asOf: "2026-11-23T10:05:00+05:30", upperCircuit: 109.4, lowerCircuit: 89.5 };
const live = { price: 97.71, change: -1.74, changePct: -1.75, previousClose: 99.45, high: 100.7, low: 97.4, asOf: "2026-11-23T10:47:29+05:30" };

describe("latest price (task #338)", () => {
  it("replaces the report's price only with a newer, plausible quote", () => {
    expect(isNewer(live, base)).toBe(true);
    expect(isNewer({ ...live, asOf: "2026-11-23T09:30:00+05:30" }, base)).toBe(false);        // older
    expect(isNewer({ ...live, asOf: null }, base)).toBe(false);                                  // no time never beats a timed price
    expect(isNewer({ ...live, price: 40, previousClose: 41 }, base)).toBe(false);                // another company's quote
    expect(isNewer(live, { ...base, price: null })).toBe(true);
  });
  it("lays it over the report: same figures as the watchlist, market cap moves, old price band dropped", () => {
    const q = withLatest(base, live);
    expect([q.price, q.change, q.changePct, q.asOf]).toEqual([97.71, -1.74, -1.75, live.asOf]);
    expect(q.marketCapCr).toBe(Math.round(75431 * 97.71 / 98.07 * 100) / 100);
    expect(q.high52).toBe(100.7); expect(q.upperCircuit).toBeUndefined();
    expect(withLatest(base, null)).toBe(base);
  });
  it("asks again every 30 seconds only while the market is open (IST, weekdays)", () => {
    expect(LIVE_EVERY_MS).toBe(30_000);
    expect(marketOpen(new Date("2026-11-23T04:35:00Z"))).toBe(true);     // Monday 10:05 IST
    expect(marketOpen(new Date("2026-11-23T03:00:00Z"))).toBe(false);    // 08:30 IST
    expect(marketOpen(new Date("2026-11-23T10:30:00Z"))).toBe(false);    // 16:00 IST
    expect(marketOpen(new Date("2026-11-22T05:00:00Z"))).toBe(false);    // Sunday
  });
  it("shows the trade time beside the price", () => {
    const now = new Date("2026-11-23T06:00:00Z");
    expect(tradeTime(live.asOf, now)).toBe("10:47 IST");
    expect(tradeTime("2026-11-21T15:29:58+05:30", now)).toBe("21 Nov, 15:29 IST");
    expect(tradeTime(null, now)).toBeNull();
  });
});
