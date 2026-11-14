/**
 * "How the scores have moved": pure helpers for the combined history of the four Prism scores (0 to 100) and the two technical views (−100 to +100).
 * Same input, same words. It describes how figures moved; it never forecasts and never advises.
 */
import { valueOf, withValue, type HistPoint, type Series } from "./prismHistory";
import { trendWord } from "./scoreScreen";

export type Period = "1M" | "3M" | "6M" | "1Y";
export const PERIODS: { id: Period; days: number; words: string }[] = [
  { id: "1M", days: 31, words: "month" }, { id: "3M", days: 92, words: "3 months" }, { id: "6M", days: 183, words: "6 months" }, { id: "1Y", days: 366, words: "year" },
];
export type Show = "all" | "business" | "technical";
export const BUSINESS: Series[] = ["fundamental", "valuation", "quality", "risk"];
export const TECHNICAL: Series[] = ["shortTerm", "longTerm"];
export const seriesFor = (show: Show): Series[] => (show === "business" ? BUSINESS : show === "technical" ? TECHNICAL : [...BUSINESS, ...TECHNICAL]);
export const isTechnical = (s: Series) => s === "shortTerm" || s === "longTerm";

const DAY = 86_400_000;
/** The points in the last `period` counted back from the newest recorded day (never from today: a gap in recording is not filled in). */
export function inPeriod(points: HistPoint[], period: Period): HistPoint[] {
  if (!points.length) return [];
  const last = Date.parse(points[points.length - 1].day), from = last - PERIODS.find((p) => p.id === period)!.days * DAY;
  return points.filter((p) => Date.parse(p.day) >= from);
}

/** The site's band words for a 0-100 Prism score (Strong 80 and above, Healthy 65, Average 50, Weak 35, Poor below). */
export const bandWord = (v: number): string => (v >= 80 ? "Strong" : v >= 65 ? "Healthy" : v >= 50 ? "Average" : v >= 35 ? "Weak" : "Poor");
/** The site's own descriptive words for a technical view (−100 to +100), the same as on the screeners and the report. */
export const trendBand = (v: number): string => trendWord(v) ?? "—";
export const readingNow = (s: Series, v: number): string => (isTechnical(s) ? trendBand(v) : bandWord(v));

export type Move = { s: Series; from: number; to: number; delta: number; fromDay: string; toDay: string };
/** First and newest figure of each series in the window (a series needs two figures to have a move). */
export function movesOf(points: HistPoint[], series: Series[]): Move[] {
  const out: Move[] = [];
  for (const s of series) {
    const v = withValue(points, s); if (v.length < 2) continue;
    const a = valueOf(v[0], s)!, b = valueOf(v[v.length - 1], s)!;
    out.push({ s, from: a, to: b, delta: Math.round((b - a) * 10) / 10, fromDay: v[0].day, toDay: v[v.length - 1].day });
  }
  return out;
}

export const NAME: Record<Series, string> = { final: "Prism", ["fundamental"]: "Growth & Profitability", valuation: "Valuation", quality: "Quality", risk: "Risk", shortTerm: "Short-term view", longTerm: "Long-term view" };
const num = (v: number) => (v < 0 ? "−" : "") + String(Math.abs(Math.round(v * 10) / 10));
const pts = (n: number) => `${num(Math.abs(n))} point${Math.abs(n) === 1 ? "" : "s"}`;

/** The one-sentence summary above the chart: the biggest mover and the steadiest score in the window. */
export function moveSentence(points: HistPoint[], series: Series[], period: Period): string {
  const mv = movesOf(points, series), when = PERIODS.find((p) => p.id === period)!.words;
  const lead = `Over the last ${when === "month" || when === "year" ? when : when}`;
  if (!mv.length) return "There are not enough recorded days in this period to say how the scores moved.";
  const abs = (m: Move) => Math.abs(m.delta), biggest = [...mv].sort((a, b) => abs(b) - abs(a))[0];
  const word = (m: Move, v: number) => (isTechnical(m.s) ? trendBand(v).toLowerCase() : bandWord(v).toLowerCase());
  const label = (m: Move) => (isTechnical(m.s) ? NAME[m.s] : `${NAME[m.s]} score`);
  if (abs(biggest) === 0) return `${lead}, none of the ${mv.length === 1 ? "" : mv.length + " "}${mv.length === 1 ? "scores" : "scores"} changed: ${mv.map((m) => `${NAME[m.s]} ${num(m.to)}`).join(", ")}.`;
  const rest = mv.filter((m) => m !== biggest);
  const first = `${lead}, the ${label(biggest)} ${biggest.delta > 0 ? "rose" : "fell"} ${pts(biggest.delta)}, from ${num(biggest.from)} to ${num(biggest.to)} (${word(biggest, biggest.to)}).`;
  if (!rest.length) return first;
  const steady = [...rest].sort((a, b) => abs(a) - abs(b))[0];
  return `${first} The ${label(steady)} was the steadiest, ${steady.delta === 0 ? `unchanged at ${num(steady.to)}` : `moving ${pts(steady.delta)}`}.`;
}

/** Days on which a Prism re-rating moved at least one of the four business scores (they change only then, so they move in steps). */
export function reRated(points: HistPoint[]): string[] {
  // a day with a new rating is compared with the rating still in force before it, not only with the day before: the days between two ratings carry no rating
  // of their own, so comparing neighbours missed every re-rating that came after a day without one (task #126)
  const out: string[] = [], last: Partial<Record<Series, number>> = {};
  points.forEach((p) => {
    let moved = false;
    for (const s of BUSINESS) { const v = valueOf(p, s); if (v == null) continue; if (last[s] != null && last[s] !== v) moved = true; last[s] = v; }
    if (moved) out.push(p.day);
  });
  return out;
}

/** The figure of a series on day `i` of `points`: its own, or, when that day has none, the latest one recorded before it with the day it was recorded
 *  (the four business scores change only when Prism re-rates the company, so the figure in force on a day between two ratings is the earlier one). Null when there is none yet. */
export function inForce(points: HistPoint[], s: Series, i: number): { value: number; day: string; exact: boolean } | null {
  if (i < 0 || i >= points.length) return null;
  const own = valueOf(points[i], s);
  if (own != null) return { value: own, day: points[i].day, exact: true };
  for (let j = i - 1; j >= 0; j--) { const v = valueOf(points[j], s); if (v != null) return { value: v, day: points[j].day, exact: false }; }
  return null;
}

/** The figure of a series on `day`, looking back through the WHOLE recorded history (not only the period on screen, so the first day of a period is never blank):
 *  its own figure when that day has one (exact), else the latest earlier one, which is the figure still in force (the four business scores change only when Prism
 *  re-rates the company). Null when nothing was recorded on or before that day. `history` is oldest first. */
export function figureOn(history: HistPoint[], s: Series, day: string): { value: number; day: string; exact: boolean } | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].day > day) continue;
    const v = valueOf(history[i], s);
    if (v != null) return { value: v, day: history[i].day, exact: history[i].day === day };
  }
  return null;
}

/** Which recorded days get a date under the chart: every one when there are few, else about `max` evenly spread, always the first and the last. */
export function axisIndexes(n: number, max = 6): number[] {
  if (n <= 0) return [];
  if (n <= max + 1) return Array.from({ length: n }, (_, i) => i);
  const out = new Set<number>();
  for (let k = 0; k < max; k++) out.add(Math.round((k * (n - 1)) / (max - 1)));
  return [...out].sort((a, b) => a - b);
}

/** The size of the dot drawn on every recorded day: large while the chart has few days, smaller as they crowd, never so small it cannot be seen. */
export const dotRadius = (n: number): number => (n <= 45 ? 4 : n <= 120 ? 3 : 2.3);

/** The four business scores change only when Prism re-rates the company: a flat line at the rating in force, which jumps straight up or down on the day of the
 *  new rating (horizontal, then vertical segments only, never a slope that would suggest a score drifted between two ratings). `pts` are [x, y], left to right. */
export function stepPath(pts: [number, number][]): string {
  if (!pts.length) return "";
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) { d += `H${f(pts[i][0])}`; if (pts[i][1] !== pts[i - 1][1]) d += `V${f(pts[i][1])}`; }
  return d;
}

/** The technical views are read every trading evening: a smooth line through every reading that never bulges above or below the readings on either side
 *  (monotone cubic, Fritsch and Carlson), so the curve shows the path between two evenings without inventing a high or a low that was not read. */
export function monotonePath(pts: [number, number][]): string {
  const n = pts.length, f = (v: number) => v.toFixed(1);
  if (!n) return "";
  if (n < 3) return pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)},${f(y)}`).join("");
  const d: number[] = [], m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0] || 1));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let out = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = (x1 - x0) / 3;
    out += `C${f(x0 + h)},${f(y0 + m[i] * h)} ${f(x1 - h)},${f(y1 - m[i + 1] * h)} ${f(x1)},${f(y1)}`;
  }
  return out;
}
