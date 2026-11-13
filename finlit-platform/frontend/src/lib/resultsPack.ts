// The Results calendar and Latest results as the "FinLit final pages" pack draws them (founder, 13 Nov 2026; docs/design/finlit-final-pages/10 and 11): the KPI tiles,
// the cards over a day's declared results and over the week ahead. Every figure and verdict is the server's (GET /api/results/quarter; the verdict compares each company
// with the typical company of its NSE industry, finlit/result_verdicts.py); this file only counts and words them. Describes reported figures; never advice.
import type { Card } from "./pulsePack";
import type { QRow, QSummary } from "./qresults";

export type Verdict = "Strong" | "Good" | "In line" | "Weak" | "Poor" | "Loss";
export const VERDICTS: Verdict[] = ["Strong", "Good", "In line", "Weak", "Poor", "Loss"];
export type Check = "up" | "flat" | "down" | "loss";
export type VRow = QRow & { industry?: string | null; verdict?: Verdict | null; checks?: { rev: Check | null; profit: Check | null; margin: Check | null } | null };
export type IndustrySoFar = { name: string; companies: number; declared: number; withNumbers?: number; medianRevenueYoY?: number | null; medianProfitYoY?: number | null; beat?: number; judged?: number };
export type VSummary = QSummary & { verdicts?: Record<Verdict, number> | null; beatShare?: number | null };

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const n0 = (v: number) => v.toLocaleString("en-IN");
export const sp = (v: number | null | undefined, d = 1) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}%`);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
export const wday = (d: string) => WEEKDAY[new Date(d + "T00:00:00Z").getUTCDay()];
/** "Sat 7 Nov" */
export const dayShort = (d: string) => `${wday(d).slice(0, 3)} ${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}`;
/** "30 Sep 2026" */
export const longDate = (d: string) => `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
export const monthName = (d: string) => MONTH[+d.slice(5, 7) - 1];
/** A company's short name: the pack writes "Divi's Laboratories", not "Divi's Laboratories Ltd". */
export const shortName = (n: string) => n.replace(/\s+(Ltd\.?|Limited|Ltd)$/i, "");
const nameOf = (r: Pick<QRow, "symbol" | "name">) => (/^\d+$/.test(r.symbol) ? shortName(r.name) : r.symbol);

// ------------------------------------------------------------------------------------------------ the KPI tiles
export type Tile = { k: string; v: string; sub: string; help?: string };
export function kpiTiles(t: VSummary): Tile[] {
  return [
    { k: "Declared", v: n0(t.declared), sub: `of ${n0(t.companies)} · ${n0(t.companies - t.declared)} still due`, help: `Companies that have announced results for the quarter. ${n0(t.withNumbers)} of them have full figures in so far.` },
    { k: "Typical revenue growth", v: sp(t.medianRevenueYoY), sub: `vs a year ago · ${t.nRevenue == null ? "–" : n0(t.nRevenue)} companies`, help: "The middle company when all declared results are lined up from best to worst (the median), so one extreme result cannot distort it." },
    { k: "Typical profit growth", v: sp(t.medianProfitYoY), sub: `vs a year ago · ${t.nProfit == null ? "–" : n0(t.nProfit)} companies`, help: "The middle company when all declared results are lined up from best to worst (the median), so one extreme result cannot distort it." },
    { k: "Profit up", v: t.profitUpShare == null ? "–" : `${Math.round(t.profitUpShare)}%`, sub: "of companies, vs a year ago" },
    { k: "Net margin up", v: t.marginUpShare == null ? "–" : `${Math.round(t.marginUpShare)}%`, sub: "of companies, vs a year ago", help: "Net profit as a share of revenue, compared with a year ago. Up means each ₹100 of sales left more profit." },
    { k: "Beat their industry", v: t.beatShare == null ? "–" : `${Math.round(t.beatShare)}%`, sub: "Strong or Good result", help: "Revenue growth, profit growth and margin change on a year ago are each compared with the typical company in the same NSE industry. Above on most of them: Strong or Good. Below on most: Weak or Poor. Company size does not change the yardstick." },
  ];
}

// ------------------------------------------------------------------------------------------------ one day's declared results
export function dayCards(rows: VRow[], counts: Record<Verdict, number> | null | undefined, total: number, day: string, week: { date: string; n: number }[]): Card[] {
  const out: Card[] = [];
  if (!counts) return out;
  const beat = counts.Strong + counts.Good, judged = VERDICTS.reduce((a, k) => a + counts[k], 0);
  const strong = rows.filter((r) => r.verdict === "Strong").sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))[0];
  if (judged) out.push({ kind: beat ? "good" : "insight", title: `${beat} of ${total} beat their industry`,
    text: strong ? `${shortName(strong.name)} was the largest Strong result: revenue ${sp(strong.revenueYoY)} and profit ${sp(strong.profitYoY)} from a year ago.` : "None was Strong." });
  const bad = rows.filter((r) => r.verdict === "Poor" || r.verdict === "Loss").sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)), nBad = counts.Poor + counts.Loss;
  if (nBad) out.push({ kind: "warning", title: `${nBad} ${nBad === 1 ? "was" : "were"} Poor or made a loss`, text: `${bad.slice(0, 5).map(nameOf).join(", ")}${nBad > 5 ? ` and ${nBad - 5} more` : ""}.` });
  const busy = [...week].filter((w) => w.n > total).sort((a, b) => b.n - a.n).slice(0, 2).sort((a, b) => a.date.localeCompare(b.date));
  if (total < 100 && busy.length) {
    const small = rows.filter((r) => r.cap === "Small").length * 2 > rows.length;
    out.push({ kind: "insight", title: `${wday(day)} is a light day`, text: `Only ${total} companies reported${small ? ", most of them small" : ""}. The big reporting days this week are ${list(busy.map((w) => wday(w.date)))}.` });
  } else if (total >= 100) {
    const large = rows.filter((r) => r.cap === "Large").length;
    out.push({ kind: "insight", title: `${wday(day)} is a busy day`, text: `${n0(total)} companies reported${large ? `, ${large} of them large` : ""}.` });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the week ahead
export function weekCards(dueMine: number, followed: { held: number; watched: number }, days: { date: string; n: number }[], big: Pick<QRow, "symbol" | "name" | "date">[]): Card[] {
  const out: Card[] = [];
  if (followed.held + followed.watched > 0) {
    out.push(dueMine === 0
      ? { kind: "insight", title: "Your stocks have all reported", text: `All ${followed.held} shares in your portfolio${followed.watched ? ` and the ${followed.watched} you follow` : ""} have already declared. Nothing of yours is due this week.` }
      : { kind: "watch", title: `${dueMine} of your stocks ${dueMine === 1 ? "reports" : "report"} this week`, text: "They are marked in the list below." });
  }
  const ranked = [...days].sort((a, b) => b.n - a.n);
  if (ranked.length >= 2) {
    const heavy = ranked.slice(0, 2).sort((a, b) => a.date.localeCompare(b.date));                                   // the two busiest days
    const named = ranked.slice(0, 3).filter((d) => d.n >= ranked[0].n * 0.6).sort((a, b) => a.date.localeCompare(b.date));   // and any day close to them
    const names = big.filter((b) => named.some((h) => h.date === b.date)).slice(0, 4).map(nameOf);
    out.push({ kind: "watch", title: `The heaviest days are ${list(heavy.map((d) => wday(d.date)))}`, text: `${list(named.map((d) => `${n0(d.n)} companies on ${wday(d.date)}`))}${names.length ? `, including ${list(names)}` : ""}.` });
  }
  return out;
}
/** "103 of 148 have reported · typical profit +25.4%" */
export const soFar = (x: IndustrySoFar | undefined) => (!x ? "–" : `${n0(x.declared)} of ${n0(x.companies)} have reported${x.medianProfitYoY != null ? ` · typical profit ${sp(x.medianProfitYoY)}` : ""}`);
