// Trading Lab > Order Flow > Time Machine: the plan sent to POST /api/lab/timemachine (backend finlit/lab/timemachine.py), the answer, and the
// checks the form makes as you type (the same rules as the server). Describe, never advise: the page counts how the stock moved in the past.
import { ApiError, apiSend } from "./api";

export type Outcome = "upper" | "lower" | "both" | "neither";
export const OUTCOMES: Outcome[] = ["upper", "lower", "both", "neither"];

export type PlanForm = { symbol: string; date: string; start: string; flatBy: string; price: string; lower: string; upper: string };
export type PlanBody = { symbol: string; date: string; start: string; flatBy: string; price: number; lower: number; upper: number };
export type Field = keyof PlanForm;

export type PastRow = { date: string; start: number; lower: number; upper: number; outcome: Outcome; touchAt: string | null; end: number; changePct: number; bars: number };
export type TmResult = {
  status: "ok"; version: string; seed: string; cached: boolean; name?: string;
  plan: { symbol: string; date: string; start: string; flatBy: string; price: number; lower: number; upper: number; lowerPct: number; upperPct: number };
  sample: { sessions: number; from: string; to: string; dropped: number; replays: number; blockMinutes: number; barMinutes: number };
  outcomes: Record<Outcome, number>;
  medianBars: { any: number | null; upper: number | null; lower: number | null };
  histogram: { edges: number[]; counts: number[]; median: number };
  fan: { times: string[]; p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] };
  past: { rows: PastRow[]; totals: Record<Outcome, number> & { sessions: number } };
  text: { labels: Record<Outcome, string>; note: string; method: string };
};
export type TmNoHistory = { status: "no_history"; symbol: string; sessions: number; needed: number; dropped?: number; detail: string };
export type TmAnswer = TmResult | TmNoHistory;

export const runPlan = (b: PlanBody) => apiSend<TmAnswer>("POST", "/api/lab/timemachine", b);

export const NOTE = "Describes how the stock moved in the past; not a forecast or a recommendation.";
export const REPLAYS = 10_000;

/** The exchange's price step: 0.05. */
export const tick = (x: number) => Math.round(Math.round(x / 0.05) * 0.05 * 100) / 100;
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const mins = (v: string) => { const m = HM.exec(v); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const OPEN = 9 * 60 + 15, CLOSE = 15 * 60 + 30;

/** Today's date in India (YYYY-MM-DD), whatever the device's time zone. */
export function istToday(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** The next weekday from `iso` (itself when it is one). */
export function nextWeekday(iso: string): string {
  let d = iso;
  while ([0, 6].includes(new Date(d + "T00:00:00Z").getUTCDay())) d = addDays(d, 1);
  return d;
}

/** The faults of a plan, field by field, in the server's words (an empty object when it can be sent). */
export function checkPlan(f: PlanForm, today: string, symbols?: Set<string>): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  const sym = f.symbol.trim().toUpperCase();
  if (!/^[A-Z0-9&_.-]{1,24}$/.test(sym)) e.symbol = "Choose an NSE F&O stock.";
  else if (symbols && symbols.size && !symbols.has(sym)) e.symbol = `${sym} is not in the F&O list.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || Number.isNaN(Date.parse(f.date + "T00:00:00Z"))) e.date = "Give the date as YYYY-MM-DD.";
  else if ([0, 6].includes(new Date(f.date + "T00:00:00Z").getUTCDay())) e.date = "Choose a weekday: NSE does not trade on Saturday or Sunday.";
  else if (f.date > addDays(today, 7)) e.date = `Choose a date up to 7 days ahead (${addDays(today, 7)} at the latest).`;
  const t0 = mins(f.start || "09:15"), fl = mins(f.flatBy);
  if (t0 == null) e.start = "Give the time as HH:MM, for example 09:15.";
  else if (t0 < OPEN) e.start = "The start time is 09:15 or later (the session opens at 09:15).";
  else if (t0 % 5) e.start = "The start time is on a 5-minute bar: 09:15, 09:20, 09:25 ...";
  else if (t0 > CLOSE - 5) e.start = "The start time is 15:25 at the latest (the last 5-minute bar).";
  if (fl == null) e.flatBy = "Give the time as HH:MM, for example 09:15.";
  else if (fl % 5) e.flatBy = "The flat-by time is a multiple of 5 minutes.";
  else if (t0 != null && fl < t0 + 5) e.flatBy = "The flat-by time is at least 5 minutes after the start time.";
  else if (fl > CLOSE) e.flatBy = "The flat-by time is 15:30 at the latest (the session closes at 15:30).";
  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const p = num(f.price), lo = num(f.lower), up = num(f.upper);
  if (!(p > 0) || !Number.isFinite(p)) e.price = "Give a price above 0.";
  if (!(lo > 0) || !Number.isFinite(lo)) e.lower = "Give a level above 0.";
  if (!(up > 0) || !Number.isFinite(up)) e.upper = "Give a level above 0.";
  if (!e.price) {
    const P = tick(p);
    if (!e.lower && !(tick(lo) < P)) e.lower = "The lower level is below the start price.";
    if (!e.upper && !(tick(up) > P)) e.upper = "The upper level is above the start price.";
    for (const [k, v] of [["lower", lo], ["upper", up]] as const) {
      if (e[k]) continue;
      const gap = Math.abs(tick(v) / P - 1) * 100;
      if (gap < 0.1 - 1e-9 || gap > 20 + 1e-9) e[k] = `Each level is 0.1% to 20% from the start price (this one is ${gap.toFixed(2)}%).`;
    }
  }
  return e;
}

export function toBody(f: PlanForm): PlanBody {
  return { symbol: f.symbol.trim().toUpperCase(), date: f.date, start: f.start || "09:15", flatBy: f.flatBy, price: tick(Number(f.price)), lower: tick(Number(f.lower)), upper: tick(Number(f.upper)) };
}

/** What a failed request means on the page: a field's fault (422), the stock outside the list (404), a wait (429) or a plain failure. */
export function failure(e: unknown): { field?: Field; text: string } {
  if (e instanceof ApiError) {
    const b = e.body as ApiError["body"] & { field?: string };
    if (e.status === 422 && b.status === "invalid") return { field: (b.field as Field) || undefined, text: b.detail || "Please check the plan." };
    if (e.status === 404 && b.status === "not_listed") return { field: "symbol", text: b.detail || "This stock is not in the F&O list." };
    if (e.status === 429) return { text: `${b.detail || "Too many new replays at once."} Try again in ${b.retryAfter || 5} seconds.` };
    if (e.status === 401) return { text: "Sign in again to run the Time Machine." };
    if (e.status === 403) return { text: b.detail || "The Trading Lab is open by invitation." };
  }
  return { text: "The replays could not be worked out right now. Try again in a minute." };
}

export const n0 = (v: number) => v.toLocaleString("en-IN");
export const px = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pc = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const day = (iso: string, year = true) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]}${year ? ` ${y}` : ""}`; };

/** "58 sessions, 12 Aug–25 Nov 2026; 10,000 replays; seed …" */
export function sampleLine(r: TmResult): string {
  const s = r.sample, sameYear = s.from.slice(0, 4) === s.to.slice(0, 4);
  const dropped = s.dropped ? ` (${s.dropped} left out for a corporate action)` : "";
  return `${s.sessions} sessions, ${day(s.from, !sameYear)}–${day(s.to)}${dropped}; ${n0(s.replays)} replays; seed ${r.seed}`;
}

/** "Upper level first in 3,412 of 10,000 replays" */
export const outcomeLine = (r: TmResult, k: Outcome) => `${r.text.labels[k]} in ${n0(r.outcomes[k])} of ${n0(r.sample.replays)} replays`;

export const OUTCOME_SHORT: Record<Outcome, string> = { upper: "Upper first", lower: "Lower first", both: "Both in one bar", neither: "Neither" };
/** "Upper first on 14 of 58 past sessions" */
export const pastLine = (r: TmResult, k: Outcome) => `${OUTCOME_SHORT[k]} on ${r.past.totals[k]} of ${r.past.totals.sessions} past sessions`;
