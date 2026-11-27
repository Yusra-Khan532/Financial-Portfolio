// Candles for the report's price chart (developer file 42, founder 26 Nov 2026: "add candle chart as a tab in section 3 line chart").
// A candle needs room to read: when a range has more bars than the chart's width can draw (about 3 px each), the bars are joined into
// longer candles (days into weeks, weeks into months or quarters; minutes into 5, 15, 30 or 60 minutes, or whole sessions). The chart says
// how long one candle is. A joined candle opens at its first bar's open, closes at its last bar's close, its high and low are the highest high
// and the lowest low of its bars, its volume is their sum, and its averages are the last bar's (the average on the candle's last day).
import { istDate, istMinutes, OPEN_MIN } from "./intraday";

type N = number | null;
export type Ohlc = { t: string[]; o: N[]; h: N[]; l: N[]; c: number[]; v: N[]; ema50?: N[]; ema200?: N[] };
export type Per = "day" | "week" | "month" | "quarter";

/** Width of one candle and its gap, in px: below this the bodies blur into a line (a year of days fits a desktop chart; a phone shows weeks). */
export const CANDLE_PX = 2.5;
export const maxCandles = (plotWidth: number) => Math.max(12, Math.floor(plotWidth / CANDLE_PX));

/** True when the series has the open, high and low a candle needs (an older server, or a close-only range, sends only closes). */
export const hasOhlc = (s: { o?: N[]; h?: N[]; l?: N[]; c: number[] }) =>
  !!s.o && !!s.h && !!s.l && s.o.length === s.c.length && s.o.some((x) => x != null) && s.h.some((x) => x != null) && s.l.some((x) => x != null);

/** Joins each run of bars with the same key into one candle. */
export function merge(s: Ohlc, key: (t: string, i: number) => string): Ohlc {
  const out: Ohlc = { t: [], o: [], h: [], l: [], c: [], v: [], ...(s.ema50 ? { ema50: [] } : {}), ...(s.ema200 ? { ema200: [] } : {}) };
  let prev: string | null = null;
  s.t.forEach((t, i) => {
    const k = key(t, i), c = s.c[i], o = s.o[i] ?? c, h = s.h[i] ?? Math.max(o, c), l = s.l[i] ?? Math.min(o, c), v = s.v[i];
    if (k !== prev) {
      out.t.push(t); out.o.push(o); out.h.push(h); out.l.push(l); out.c.push(c); out.v.push(v ?? null);
      out.ema50?.push(s.ema50?.[i] ?? null); out.ema200?.push(s.ema200?.[i] ?? null);
      prev = k; return;
    }
    const j = out.t.length - 1;
    out.h[j] = Math.max(out.h[j] as number, h); out.l[j] = Math.min(out.l[j] as number, l); out.c[j] = c;
    if (v != null) out.v[j] = (out.v[j] ?? 0) + v;
    if (out.ema50) out.ema50[j] = s.ema50?.[i] ?? out.ema50[j];
    if (out.ema200) out.ema200[j] = s.ema200?.[i] ?? out.ema200[j];
  });
  return out;
}

/** The Monday of a date's week ("2026-11-26" → "2026-11-23"). */
export function weekOf(day: string): string {
  const d = new Date(day.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const KEY: Record<Per, (t: string) => string> = {
  day: (t) => t.slice(0, 10),
  week: weekOf,
  month: (t) => t.slice(0, 7),
  quarter: (t) => `${t.slice(0, 4)}Q${Math.floor((Number(t.slice(5, 7)) - 1) / 3)}`,
};

/** Daily or weekly bars as candles that fit `max`: one a day (daily ranges), else one a week, a month or a quarter. */
export function calendarCandles(s: Ohlc, grain: "daily" | "weekly", max: number): { s: Ohlc; per: Per } {
  const pers: Per[] = grain === "daily" ? ["day", "week", "month", "quarter"] : ["week", "month", "quarter"];
  let last = { s, per: pers[0] };
  for (const per of pers) {
    const g = per === pers[0] ? s : merge(s, KEY[per]);
    last = { s: g, per };
    if (g.t.length <= max) break;
  }
  return last;
}

/** Candle lengths for intraday bars, in minutes; 375 is a whole session (09:15 to 15:30). */
const MINUTES = [1, 5, 15, 30, 60, 375];
/** Intraday bars as candles that fit `max`. On the 1D clock axis a whole session's worth must fit (the axis runs to 15:30 even mid-session). */
export function intradayCandles(s: Ohlc, interval: number, max: number, clock: boolean): { s: Ohlc; minutes: number } {
  const opts = MINUTES.filter((m) => m >= interval && (m % interval === 0 || m === 375));
  let last = { s, minutes: interval };
  for (const m of opts) {
    const g = m === interval ? s : merge(s, (t) => `${istDate(t)}|${Math.floor((istMinutes(t) - OPEN_MIN) / m)}`);
    last = { s: g, minutes: m };
    const count = clock ? Math.ceil(375 / m) : g.t.length;
    if (count <= max) break;
  }
  return last;
}

/** What one candle is, for the chart's note: "Each candle is one week." */
export function candleNote(per: Per | number): string {
  if (typeof per === "number") return per === 375 ? "Each candle is one trading session." : per === 60 ? "Each candle is one hour." : `Each candle is ${per} minute${per === 1 ? "" : "s"}.`;
  return `Each candle is one ${per === "day" ? "trading day" : per}.`;
}
