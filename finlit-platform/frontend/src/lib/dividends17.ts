// Section 17 "Dividends": the figures the summary, the tiles, the chart and the calculator show (task #222, 19 Nov pack, D1).
// A financial year that is not over ("partial" from the server, e.g. FY27 in November) is shown as "so far": it is left out of the growth figure and
// the average line, never shown as a fall (no "▼100%"), and it counts towards the years paid in a row once anything has been declared for it.
// The calculator uses the dividends declared in the last 12 months, the same basis as the dividend yield tile.
import type { Events } from "./api";

export type DivYear = { p: string; v: number; part: boolean };
export type DivView = {
  years: DivYear[]; ended: DivYear[]; partial: DivYear | null;
  first: DivYear | null; last: DivYear | null; cagr: number | null; avg: number; max: number;
  streak: number; total: number; rising: number;
  ttm: number; ttmAdjusted: boolean; ttmSplit: boolean;
};

const DAY = 86_400_000;

export function divView(e: Pick<Events, "actions" | "dividendsByFY">, today: Date = new Date()): DivView {
  const fy = e.dividendsByFY, part = new Set(fy.partial ?? []);
  const years: DivYear[] = fy.periods.map((p, i) => ({ p, v: fy.dps[i] ?? 0, part: part.has(p) }));
  const ended = years.filter((y) => !y.part), partial = years.find((y) => y.part) ?? null;
  const fi = ended.findIndex((y) => y.v > 0), first = fi >= 0 ? ended[fi] : null, last = ended.length ? ended[ended.length - 1] : null;
  const span = fi >= 0 ? ended.length - 1 - fi : 0;
  const cagr = first && last && last.v > 0 && span > 0 ? (Math.pow(last.v / first.v, 1 / span) - 1) * 100 : null;
  const avg = ended.length ? ended.reduce((a, y) => a + y.v, 0) / ended.length : 0;
  const max = Math.max(...years.map((y) => y.v), 0) || 1;
  const counted = years.filter((y) => !y.part || y.v > 0);                 // the year in progress counts once anything is declared
  let streak = 0; for (let i = counted.length - 1; i >= 0 && counted[i].v > 0; i--) streak++;
  let rising = 0; for (let i = years.length - 1; i > 0 && years[i].v >= years[i - 1].v; i--) rising++;
  const since = today.getTime() - 365 * DAY;
  const divs = e.actions.filter((a) => a.type.endsWith("dividend"));
  const ttmDivs = divs.filter((a) => { const t = new Date(a.date).getTime(); return t > since && t <= today.getTime(); });
  const ttm = Math.round(ttmDivs.reduce((s, a) => s + (a.adjustedAmount || a.amount || 0), 0) * 10000) / 10000;
  const ttmAdjusted = ttmDivs.some((a) => a.adjustedAmount != null && a.amount != null && Math.abs(a.adjustedAmount - a.amount) > 1e-9);
  const oldest = ttmDivs.length ? ttmDivs[ttmDivs.length - 1].date : null;
  const ttmSplit = !!oldest && e.actions.filter((a) => (a.type === "split" || a.type === "bonus") && a.date > oldest).length === 1;
  return { years, ended, partial, first, last, cagr, avg, max, streak, total: counted.length, rising, ttm, ttmAdjusted, ttmSplit };
}

/** The "In simple words" line of 17 (W1: no sentence on what a low yield suggests; it read as advice). */
export function divPlain(yieldTtm: number, d: DivView, payout: number | null, n: (x: number, dp: number) => string): string {
  const years = d.streak === 0 ? " It has not paid a dividend in its latest financial year."
    : d.streak === 1 ? " It paid a dividend in the last financial year."
    : ` It has paid a dividend in each of the last ${d.streak} financial years${d.rising >= 2 ? `, and raised it ${d.rising} years in a row` : ""}.`;
  return `For every ₹100 invested at today's price, this company pays about ₹${n(yieldTtm, 2)} a year.${years}${payout != null ? ` It keeps about ${n(100 - payout, 0)}% of its profit to grow the business.` : ""}`;
}
