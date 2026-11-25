// Task #394 (developer file 37, sections 4 and 5): the chart panel's worked-out parts, kept apart from the drawing so each can be tested on its own.
// The price beside the chart and its day (C1), the single pattern mark (C2), rupee figures and the price axis (C3), the level line's name (C4),
// the volume line against the 50-day average (C5), averages named by their unit (W3), the week in progress (W4), a weekly candle dated by its last
// regular trading day (W5), and the words for a chart that ends before the list's close (F6, C11). Nothing here advises; it describes the chart.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Bar = { t: string; o: number | null; h: number | null; l: number | null; c: number; v: number | null; e: Record<string, number | null>;
  /** sessions in a weekly candle (W4); a daily candle has none */ n?: number };

const fig = (n: number, d: number) => n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const iso = (t: string) => String(t).slice(0, 10);
const dow = (t: string) => new Date(`${iso(t)}T00:00:00Z`).getUTCDay();
const shift = (t: string, days: number) => { const d = new Date(`${iso(t)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

/** "23 Nov" */
export const dayShort = (t: string): string => { const [, m, d] = iso(t).split("-").map(Number); return m >= 1 && m <= 12 && d ? `${d} ${MONTHS[m - 1]}` : String(t); };
/** "23 Nov 2026" (the legend's date, written out) */
export const dayLong = (t: string): string => { const [y, m, d] = iso(t).split("-").map(Number); return m >= 1 && m <= 12 && d ? `${d} ${MONTHS[m - 1]} ${y}` : String(t); };
/** The Monday of a day's week, the key weekly candles are grouped on. */
export const mondayOf = (t: string): string => shift(t, -((dow(t) + 6) % 7));
/** Today in India, as a day. */
export const todayIST = (now: Date = new Date()): string => new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/** C3: ₹ with Indian commas and two decimals: "₹11,353.00", "₹1,23,456.00". */
export const rupees = (n: number | null | undefined): string => (n == null || !Number.isFinite(n) ? "–" : `₹${fig(n, 2)}`);
/** C3: the price axis of the PRICE series: commas and no decimals from ₹1,000 up ("14,000"), two decimals below ("248.85"). The volume scale keeps K and M. */
export const axisPrice = (p: number): string => (Math.abs(p) >= 1000 ? fig(Math.round(p), 0) : fig(p, 2));

const NUM = /^-?[\d,]+(?:\.\d+)?$/;
/** C3: a figure in "What the chart shows" as the box prints it. A price the server words "Rs 11353.00" (or "₹11353.00") reads "₹11,353.00"; a plain number
 *  under a label that already names the unit ("Level (Rs)") gets Indian commas only, so the unit is not said twice. The labels are the server's (C6) and stay. */
export function factValue(label: string, v: string | null): string | null {
  if (v == null) return v;
  const s = String(v).trim(), m = /^(?:Rs\.?|₹)\s*(-?[\d,]+(?:\.\d+)?)$/.exec(s);
  if (m) return rupees(Number(m[1].replace(/,/g, "")));
  if (/\(Rs\)\s*$/.test(label) && NUM.test(s)) return fig(Number(s.replace(/,/g, "")), 2);
  return v;
}

/** C4: the level line is named as the screen names it ("Level" on Fresh close above a base, "Pivot" on Near pivot); a drawing without a name keeps "Pivot". */
export const levelTitle = (d?: { levelLabel?: string | null } | null): string => (d?.levelLabel && d.levelLabel.trim()) || "Pivot";

/** W3: an average named by its unit. EMAs are the server's daily EMAs (read at each week's last day on weekly candles), so always "-day";
 *  an SMA is worked out on the candles shown, so on weekly candles it is a "50-week SMA". */
export const lineLabel = (src: "ema" | "sma", n: number, weekly: boolean): string => (src === "ema" ? `${n}-day EMA` : `${n}-${weekly ? "week" : "day"} SMA`);

export type SwingMark = { time: string; position: "aboveBar" | "belowBar"; shape: "arrowDown" | "arrowUp"; color: string; text: string };
/** C2: a pattern with ONE mark (Fresh close above a base sends "Close above", the bases "Base low") gets it drawn: two or more are joined by a line elsewhere.
 *  On a narrow chart (under 520 px) the words are shortened so they fit. */
export function singleMark(swings: { date: string | null; price: number; kind: string }[] | undefined, bars: { t: string }[], narrow: boolean,
  color: { level: string; base: string }): SwingMark | null {
  const pts = (swings ?? []).filter((w) => w.date);
  if (pts.length !== 1 || !bars.length) return null;
  const x = pts[0], d = x.date as string;
  if (d < bars[0].t) return null;
  const at = bars.find((b) => b.t >= d)?.t;
  if (!at) return null;
  if (/close above/i.test(x.kind)) return { time: at, position: "aboveBar", shape: "arrowDown", color: color.level, text: narrow ? "Closed above" : `Closed above · ${dayShort(d)}` };
  return { time: at, position: "belowBar", shape: "arrowUp", color: color.base, text: narrow ? x.kind : `${x.kind} ${rupees(x.price)}` };
}

/** The corporate-action letters on the chart and what each means (C4's key). */
export const EVENT_KEY: [string, string][] = [["D", "Dividend"], ["B", "Bonus"], ["S", "Split"], ["Rt", "Rights issue"]];
export const eventLetter = (type: string): string => (/dividend/i.test(type) ? "D" : /bonus/i.test(type) ? "B" : /split/i.test(type) ? "S" : /right/i.test(type) ? "Rt" : "");

/** W4 and W5: weekly candles with the number of sessions in each (from the daily candles held) and dated by the week's last regular trading day:
 *  a special Sunday session (Muhurat, 8 Nov) does not date its week, so the Diwali week reads "Week to 6 Nov". A week the daily candles do not reach is
 *  taken as a full week of five sessions. */
export function datedWeeks(weeks: Bar[], dailyDays: string[]): Bar[] {
  const count = new Map<string, number>(), lastWeekday = new Map<string, string>();
  for (const t of dailyDays) {
    const k = mondayOf(t); count.set(k, (count.get(k) ?? 0) + 1);
    const w = dow(t); if (w >= 1 && w <= 5 && (lastWeekday.get(k) ?? "") < iso(t)) lastWeekday.set(k, iso(t));
  }
  const first = dailyDays.length ? mondayOf(dailyDays[0]) : null;
  const out: Bar[] = [];
  for (const b of weeks) {
    const k = mondayOf(b.t), w = dow(b.t);
    let t = b.t;
    if (w === 0 || w === 6) { const r = lastWeekday.get(k) ?? shift(b.t, w === 0 ? -2 : -1); if (!out.length || out[out.length - 1].t < r) t = r; }
    const n = first != null && k > first && count.has(k) ? count.get(k) as number : b.n ?? 5;
    out.push({ ...b, t, n });
  }
  return out;
}

/** W4: the last weekly candle is a week in progress while that week has not ended (today is in it, Friday at the latest) and it has fewer than 5 sessions. */
export const isPartWeek = (b: Bar, isLast: boolean, today: string): boolean =>
  isLast && (b.n ?? 5) < 5 && mondayOf(today) === mondayOf(b.t) && today <= shift(mondayOf(b.t), 4);

/** The legend's first line: the day (or "Week to 23 Nov", with "1 session so far" for a week in progress), open, high, low, close and the change. */
export function legendHead(bars: Bar[], i: number, weekly: boolean, today: string, n: (v: number | null | undefined, d?: number) => string): string {
  const b = bars[i], prev = i > 0 ? bars[i - 1].c : null, ch = prev ? (b.c / prev - 1) * 100 : null;
  const part = weekly && isPartWeek(b, i === bars.length - 1, today);
  const when = weekly ? `Week to ${dayShort(b.t)}${part ? ` · ${b.n} session${b.n === 1 ? "" : "s"} so far` : ""}` : dayLong(b.t);
  return `${when} · ${b.o != null ? `O ${n(b.o)} H ${n(b.h)} L ${n(b.l)} ` : ""}C ${n(b.c)}${ch != null ? ` · ${ch >= 0 ? "+" : ""}${n(ch)}%` : ""}`;
}

/** C5 and W4: the volume line. Daily: "Volume 57,803 · 1.1× its 50-day average" (the 50 sessions before it, the figures box's baseline). Weekly: against the
 *  average of the full weeks among the 20 before it (a week of 4 or more sessions); a week in progress shows its volume so far and no ratio. */
export function volumeLine(bars: Bar[], i: number, weekly: boolean, today: string): string | null {
  const b = bars[i]; if (b?.v == null) return null;
  const v = fig(b.v, 0);
  if (!weekly) {
    const prev = i >= 50 ? bars.slice(i - 50, i).map((x) => x.v).filter((x): x is number => x != null) : [];
    const avg = prev.length === 50 ? prev.reduce((a, x) => a + x, 0) / 50 : null;
    return `Volume ${v}${avg ? ` · ${fig(b.v / avg, 1)}× its 50-day average` : ""}`;
  }
  if (isPartWeek(b, i === bars.length - 1, today)) return `Volume so far this week ${v}`;
  const full = bars.slice(Math.max(0, i - 20), i).filter((x) => (x.n ?? 5) >= 4 && x.v != null).map((x) => x.v as number);
  const avg = full.length >= 10 ? full.reduce((a, x) => a + x, 0) / full.length : null;
  return `Volume that week ${v}${avg ? ` · ${fig(b.v / avg, 1)}× its average of the last ${full.length} full weeks` : ""}`;
}

/** C1: the price beside the chart is the list's official close of its day (the row's price_on, dated by the list's day) when the row has it. Never dated with
 *  a weekend, never with a day the chart passes over with no candle (a holiday), and not when the chart already runs past the list's day (a past list):
 *  then the chart's own last close stays, as before. `daily` is the chart's daily candle days. */
export function listClose(row: { priceOn?: number | null; listDay?: string | null }, daily: string[]): { price: number; day: string } | null {
  if (row.priceOn == null || !Number.isFinite(row.priceOn) || !row.listDay || !daily.length) return null;
  const day = iso(row.listDay), w = dow(day), last = daily[daily.length - 1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || w === 0 || w === 6) return null;
  if (last > day) return null;
  return { price: row.priceOn, day };
}

/** The change over 1 or 3 months to a day's close, from the daily candles (C1: 1M and 3M run to the list's close). Null when the candles do not reach back. */
export function changeTo(t: string[], c: number[], endDay: string, endPrice: number, months: number): number | null {
  if (!t.length) return null;
  const s = new Date(`${iso(endDay)}T00:00:00Z`); s.setUTCMonth(s.getUTCMonth() - months);
  const from = s.toISOString().slice(0, 10), i = t.findIndex((x) => x >= from);
  if (i < 0 || (i === 0 && t[0] > from) || !c[i]) return null;
  return (endPrice / c[i] - 1) * 100;
}

/** F6 and C11: the chart's last daily candle is before the list's day. Returns that candle's day, else null. */
export const behindList = (lastDaily: string | null | undefined, listDay: string | null | undefined): string | null =>
  lastDaily && listDay && iso(lastDaily) < iso(listDay) ? iso(lastDaily) : null;
/** C11: the mark under a list row. */
export const chartToMark = (lastDaily: string | null | undefined, listDay: string | null | undefined): string | null => {
  const b = behindList(lastDaily, listDay); return b ? `Chart to ${dayShort(b)}` : null;
};
/** F6: the note above the figures, in two parts (the first is bold on the page). */
export function behindNote(lastDaily: string | null | undefined, listDay: string | null | undefined, priceOn?: number | null): [string, string] | null {
  const b = behindList(lastDaily, listDay); if (!b || !listDay) return null;
  return [`This chart ends ${dayShort(b)}.`, `The list is from the ${dayShort(listDay)} close${priceOn != null && Number.isFinite(priceOn) ? ` (${rupees(priceOn)})` : ""}.`];
}

/** C8: the heading of "What the chart shows", with the day its figures are from when the server sends it (factsAsOf). */
export const factsHeading = (factsAsOf?: string | null): string =>
  factsAsOf && /^\d{4}-\d{2}-\d{2}/.test(factsAsOf) ? `What the chart shows · ${dayShort(factsAsOf)} close` : "What the chart shows";
