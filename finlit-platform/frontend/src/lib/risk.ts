// Trading Lab > Order Flow > Risk read-out: the answer of /api/lab/risk/{symbol} (backend finlit/lab/risk.py) and the plain words for it.
// Describe, never advise: every figure is how the price moved in the past, with its window; none says what to do.

export type RiskWindow = { label: string; from: string | null; to: string | null; returns: number; wanted: number; full: boolean; short: boolean };
export type Fall = {
  depthPct: number; peak: { d: string; close: number }; trough: { d: string; close: number }; fallSessions: number; fallDays: number;
  recovered: { d: string; close: number } | null; recoverySessions: number | null; recoveryDays: number | null;
  sessionsSincePeak?: number; daysSincePeak?: number; belowPeakPct?: number;
};
export type Drawdown = { deepest: Fall | null; window: RiskWindow };
export type Tail = { level: number; k: number; n: number; varPct: number; esPct: number; varRs: number; esRs: number };
export type Ratio = { value: number | null; why?: string; window: RiskWindow; annReturnPct?: number; maxFallPct?: number; meanPct?: number; downsidePct?: number; annMeanPct?: number; annDownsidePct?: number };
export type RiskFigures = {
  vol20: { pct: number | null; window: RiskWindow }; vol1y: { pct: number | null; window: RiskWindow }; volRatio: { value: number | null; window: RiskWindow };
  drawdown1y: Drawdown; drawdown3y: Drawdown | null; tail: { levels: (Tail | null)[]; window: RiskWindow };
  sortino1y: Ratio; sortino3y: Ratio | null; calmar1y: Ratio; calmar3y: Ratio | null; last: { d: string; close: number } | null; threeYearNote?: string;
};
export type RiskBeta = { value: number | null; corr: number | null; alphaPct: number | null; r2?: number | null; why?: string; aligned: number; onlyStock: number; onlyIndex: number; window: RiskWindow };
export type Risk = {
  status: string; symbol: string; name: string; asOf: string; detail?: string;
  source: { table: string; label: string; from: string; to: string; closes: number; other?: Record<string, { closes: number; to: string | null }> };
  index: { name: string; table: string; label: string; closes: number; from: string | null; to: string | null };
  stock: RiskFigures; nifty: RiskFigures | null; beta: RiskBeta | null;
  pairs?: { d: string[]; s: number[]; m: number[] }; returns1y: { d: string[]; r: number[] };
  underwater: { d: string[]; c: number[]; dd: number[] }; rolling: { d: string[]; v: (number | null)[] };
  bigMoves: { d: string; pct: number }[]; notes: string[]; explain: Record<string, string>; note: string;
};

export const NOTE = "Measures of how the stock moved in the past; not a forecast or a recommendation.";

/** "26 Nov 2026" from an ISO day, whatever the reader's time zone. */
export const day = (iso: string | null | undefined) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const pct = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}%`);
export const pctU = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}%`);
export const num = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`);
export const rs = (v: number | null | undefined) => (v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`);

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const t = n % 100, u = n % 10;
  return `${n}${t >= 11 && t <= 13 ? "th" : u === 1 ? "st" : u === 2 ? "nd" : u === 3 ? "rd" : "th"}`;
}

/** The window in one line: "1 year · 252 daily returns · 9 Dec 2025 to 26 Nov 2026". */
export function windowLine(w: RiskWindow | null | undefined): string {
  if (!w) return "—";
  return `${w.label} · ${w.returns} daily returns · ${day(w.from)} to ${day(w.to)}`;
}

/** The deepest fall in one line. */
export function fallLine(f: Fall | null | undefined): string {
  if (!f) return "The price never closed below an earlier high in this window.";
  const back = f.recovered
    ? `back at the high on ${day(f.recovered.d)} (${f.recoverySessions} sessions after the low)`
    : `not recovered yet: ${f.sessionsSincePeak} sessions (${f.daysSincePeak} days) since the high`;
  return `${pctU(f.depthPct)} from ${day(f.peak.d)} to ${day(f.trough.d)}; ${back}`;
}

export type Bin = { lo: number; hi: number; count: number; days: string[] };

/** Daily returns (%) counted into equal bins of a round width (0.25, 0.5, 1 or 2 percentage points), about 24 to 40 of them. */
export function bins(returns: number[], dates: string[] = []): { width: number; bins: Bin[] } {
  if (!returns.length) return { width: 1, bins: [] };
  const lo = Math.min(...returns), hi = Math.max(...returns), span = hi - lo || 1;
  const width = [0.25, 0.5, 1, 2, 5].find((w) => span / w <= 40) ?? 10;
  const start = Math.floor(lo / width) * width, n = Math.max(1, Math.ceil((hi - start) / width + 1e-9));
  const out: Bin[] = Array.from({ length: n }, (_, i) => ({ lo: +(start + i * width).toFixed(4), hi: +(start + (i + 1) * width).toFixed(4), count: 0, days: [] }));
  returns.forEach((r, i) => {
    const k = Math.min(n - 1, Math.floor((r - start) / width + 1e-9));
    out[k].count += 1;
    if (dates[i]) out[k].days.push(dates[i]);
  });
  return { width, bins: out };
}

/** Least-squares line y = a + b x through the points (b is the beta of the scatter). */
export function fit(x: number[], y: number[]): { a: number; b: number } | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n, my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

/** "Nice" axis steps between lo and hi. */
export function ticks(lo: number, hi: number, count = 5): number[] {
  const span = hi - lo || 1, raw = span / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

/** The index of the nearest point to a pointer's x inside an svg drawn on viewBox width W with plot from L to W - R. */
export function nearestIndex(e: { clientX: number; currentTarget: Element }, n: number, W: number, L: number, R: number): number {
  const box = e.currentTarget.getBoundingClientRect();
  const x = box.width > 0 ? ((e.clientX - box.left) / box.width) * W : L;
  return Math.max(0, Math.min(n - 1, Math.round(((x - L) / (W - L - R)) * (n - 1))));
}

/** The stock's 20-session against 1-year volatility, as plain words. */
export function volWords(r: number | null | undefined): string {
  if (r == null) return "Not enough returns to compare.";
  if (r > 1.05) return `Recent swings were ${r.toFixed(2)}× the 1-year level: wider than the year's.`;
  if (r < 0.95) return `Recent swings were ${r.toFixed(2)}× the 1-year level: narrower than the year's.`;
  return `Recent swings were about the same as the 1-year level (${r.toFixed(2)}×).`;
}
