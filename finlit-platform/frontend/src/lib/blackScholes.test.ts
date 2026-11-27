// F&O Academy: Black-Scholes(-Merton) price, Greeks and implied volatility (lib/blackScholes.ts) against known textbook values
// (Hull, Options, Futures and Other Derivatives: the S=42 K=40 example and the S=49 K=50 Greeks example) and the model's identities.
import { describe, expect, it } from "vitest";
import { greeks, impliedVol, ncdf, priceBounds, years } from "./blackScholes";

describe("Black-Scholes", () => {
  it("the normal distribution", () => {
    expect(ncdf(0)).toBeCloseTo(0.5, 7);   // the approximation is good to about 1e-7
    expect(ncdf(1.96)).toBeCloseTo(0.9750021, 6);
    expect(ncdf(-1)).toBeCloseTo(0.1586553, 6);
    expect(ncdf(Infinity)).toBe(1);
  });
  it("prices Hull's example: S 42, K 40, r 10%, σ 20%, 6 months → call 4.76, put 0.81", () => {
    const base = { spot: 42, strike: 40, t: 0.5, vol: 0.2, r: 0.1 };
    expect(greeks({ kind: "call", ...base }).price).toBeCloseTo(4.7594, 3);
    expect(greeks({ kind: "put", ...base }).price).toBeCloseTo(0.8086, 3);
  });
  it("gives Hull's Greeks: S 49, K 50, r 5%, σ 20%, 20 weeks", () => {
    const c = greeks({ kind: "call", spot: 49, strike: 50, t: 0.3846, vol: 0.2, r: 0.05 });
    expect(c.price).toBeCloseTo(2.40, 2);
    expect(c.delta).toBeCloseTo(0.522, 3);
    expect(c.gamma).toBeCloseTo(0.066, 3);
    expect(c.theta * 365).toBeCloseTo(-4.31, 2);     // per year in the book; per calendar day here
    expect(c.vega).toBeCloseTo(0.121, 3);             // per volatility point (12.1 per 100%)
    expect(c.rho).toBeCloseTo(0.0891, 3);
  });
  it("satisfies put-call parity, with a dividend yield", () => {
    const b = { spot: 24000, strike: 24200, t: years(45), vol: 0.15, r: 0.065, q: 0.012 };
    const c = greeks({ kind: "call", ...b }), p = greeks({ kind: "put", ...b });
    expect(c.price - p.price).toBeCloseTo(b.spot * Math.exp(-b.q * b.t) - b.strike * Math.exp(-b.r * b.t), 6);
    expect(c.delta - p.delta).toBeCloseTo(Math.exp(-b.q * b.t), 9);
    expect(c.gamma).toBeCloseTo(p.gamma, 12);
    expect(c.vega).toBeCloseTo(p.vega, 12);
  });
  it("matches the lessons' at-the-money figures (index 24,000, IV 14%, rate 6.5%)", () => {
    const m = (days: number) => greeks({ kind: "call", spot: 24000, strike: 24000, t: years(days), vol: 0.14, r: 0.065 });
    expect(m(30).price).toBeCloseTo(450.57, 1); expect(m(30).delta).toBeCloseTo(0.561, 3); expect(m(30).theta).toBeCloseTo(-8.65, 1); expect(m(30).vega).toBeCloseTo(27.13, 1);
    expect(m(2).theta).toBeCloseTo(-26.97, 1); expect(m(2).gamma).toBeCloseTo(0.0016, 4);
    expect(greeks({ kind: "call", spot: 24000, strike: 24000, t: years(10), vol: 0.18, r: 0.065 }).price).toBeCloseTo(306.86, 1);
  });
  it("Greeks behave as the lessons say: gamma and |theta| grow, vega shrinks as expiry nears (at the money)", () => {
    const m = (days: number) => greeks({ kind: "call", spot: 24000, strike: 24000, t: years(days), vol: 0.14, r: 0.065 });
    expect(m(2).gamma).toBeGreaterThan(m(30).gamma);
    expect(Math.abs(m(2).theta)).toBeGreaterThan(Math.abs(m(30).theta));
    expect(m(2).vega).toBeLessThan(m(30).vega);
    const deep = greeks({ kind: "call", spot: 26000, strike: 24000, t: years(30), vol: 0.14, r: 0.065 });
    expect(deep.delta).toBeGreaterThan(0.95);
  });
  it("at expiry the price is the intrinsic value", () => {
    expect(greeks({ kind: "call", spot: 24060, strike: 24000, t: 0, vol: 0.14, r: 0.065 })).toMatchObject({ price: 60, delta: 1, gamma: 0 });
    expect(greeks({ kind: "put", spot: 24060, strike: 24000, t: 0, vol: 0.14, r: 0.065 })).toMatchObject({ price: 0, delta: 0 });
  });
  it("implied volatility recovers the volatility a price was made with, and refuses impossible premiums", () => {
    const o = { kind: "call" as const, spot: 24000, strike: 24000, t: years(30), r: 0.065, q: 0 };
    for (const v of [0.08, 0.14, 0.35]) expect(impliedVol(o, greeks({ ...o, vol: v }).price)!).toBeCloseTo(v, 6);
    expect(impliedVol(o, 400)!).toBeCloseTo(0.1213, 3);   // module 6, lesson 2
    const [lo, hi] = priceBounds(o);
    expect(impliedVol(o, lo - 1)).toBeNull();
    expect(impliedVol(o, hi + 1)).toBeNull();
    expect(impliedVol({ ...o, t: 0 }, 100)).toBeNull();
    const put = { ...o, kind: "put" as const, strike: 23500 };
    expect(impliedVol(put, greeks({ ...put, vol: 0.165 }).price)!).toBeCloseTo(0.165, 6);
  });
});
