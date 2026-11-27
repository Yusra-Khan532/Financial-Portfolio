// F&O Academy (Learn): the Black-Scholes-Merton price and Greeks of a European option, and the implied volatility that matches a premium.
// Used by the Greeks explorer and the implied-volatility box (components/academy). Assumptions, shown on the page beside the explorer:
// European exercise (NSE options are European), a lognormal price with one constant volatility, a constant risk-free rate and a constant
// continuous dividend yield, no transaction costs or taxes, trading at any time and any size. Real premiums depart from the model, which is
// why traders quote implied volatility instead of the model's price. Education only: the numbers describe the model, not the market.

export type OptKind = "call" | "put";
export type BsIn = { kind: OptKind; spot: number; strike: number; /** years */ t: number; /** annual volatility, 0.14 = 14% */ vol: number; /** annual risk-free rate, 0.065 = 6.5% */ r: number; /** annual dividend yield */ q?: number };
/** price per unit; delta per ₹1 of the underlying; gamma: change in delta per ₹1; theta: change in price per calendar day; vega: per 1 point of volatility; rho: per 1 point of the rate */
export type Greeks = { price: number; delta: number; gamma: number; theta: number; vega: number; rho: number };

/** The standard normal density. */
export const npdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/** The standard normal distribution, from the complementary error function (the Chebyshev fit of Numerical Recipes' erfcc: relative error below 1.2e-7). */
export function ncdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * z);
  const y = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  const tail = 0.5 * y;   // P(Z > |x|)
  return x >= 0 ? 1 - tail : tail;
}

const d12 = ({ spot, strike, t, vol, r, q = 0 }: BsIn) => {
  const sq = vol * Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (r - q + 0.5 * vol * vol) * t) / sq;
  return { d1, d2: d1 - sq };
};

/** Price and Greeks. At expiry (t ≤ 0) or with no volatility, the price is the intrinsic value (discounted forward value for vol 0) and gamma, vega and theta are 0. */
export function greeks(o: BsIn): Greeks {
  const { kind, spot, strike, t, vol, r, q = 0 } = o;
  if (!(spot > 0) || !(strike > 0)) return { price: NaN, delta: NaN, gamma: NaN, theta: NaN, vega: NaN, rho: NaN };
  if (t <= 0 || vol <= 0) {
    const tt = Math.max(t, 0);
    const fwd = spot * Math.exp(-q * tt) - strike * Math.exp(-r * tt);
    const itm = kind === "call" ? fwd > 0 : fwd < 0;
    return { price: Math.max(kind === "call" ? fwd : -fwd, 0), delta: itm ? (kind === "call" ? 1 : -1) * Math.exp(-q * tt) : 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  const { d1, d2 } = d12(o);
  const dq = Math.exp(-q * t), dr = Math.exp(-r * t), sqT = Math.sqrt(t), n1 = npdf(d1);
  const gamma = (dq * n1) / (spot * vol * sqT);
  const vega = (spot * dq * n1 * sqT) / 100;
  const decay = -(spot * dq * n1 * vol) / (2 * sqT);
  if (kind === "call") {
    const price = spot * dq * ncdf(d1) - strike * dr * ncdf(d2);
    const thetaY = decay - r * strike * dr * ncdf(d2) + q * spot * dq * ncdf(d1);
    return { price, delta: dq * ncdf(d1), gamma, theta: thetaY / 365, vega, rho: (strike * t * dr * ncdf(d2)) / 100 };
  }
  const price = strike * dr * ncdf(-d2) - spot * dq * ncdf(-d1);
  const thetaY = decay + r * strike * dr * ncdf(-d2) - q * spot * dq * ncdf(-d1);
  return { price, delta: dq * (ncdf(d1) - 1), gamma, theta: thetaY / 365, vega, rho: (-strike * t * dr * ncdf(-d2)) / 100 };
}

export const bsPrice = (o: BsIn) => greeks(o).price;

/** The lowest and highest premium the model allows (no-arbitrage bounds) for these inputs. */
export function priceBounds(o: Omit<BsIn, "vol">): [number, number] {
  const { kind, spot, strike, t, r, q = 0 } = o;
  const s = spot * Math.exp(-q * t), k = strike * Math.exp(-r * t);
  return kind === "call" ? [Math.max(s - k, 0), s] : [Math.max(k - s, 0), k];
}

/** The volatility at which the model's price equals `premium`, by bisection between 0.1% and 500% a year; null when the premium is outside the model's bounds. */
export function impliedVol(o: Omit<BsIn, "vol">, premium: number): number | null {
  if (!(premium > 0) || !(o.t > 0)) return null;
  const [lo, hi] = priceBounds(o);
  if (premium <= lo || premium >= hi) return null;
  let a = 0.001, b = 5;
  if (bsPrice({ ...o, vol: a }) > premium || bsPrice({ ...o, vol: b }) < premium) return null;
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    if (bsPrice({ ...o, vol: m }) < premium) a = m; else b = m;
    if (b - a < 1e-9) break;
  }
  return (a + b) / 2;
}

/** Days to years on the calendar-day basis the explorer uses (365 days a year). */
export const years = (days: number) => days / 365;
