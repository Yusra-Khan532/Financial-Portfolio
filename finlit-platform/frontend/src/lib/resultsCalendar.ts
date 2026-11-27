// The Results calendar (/results) after the 15 Nov pack (task #193): the calendar's days from the server's one source (GET /api/results/calendar, the same rows
// as each day's list), the four calendar tiles, the day picker and the week ahead. Pure helpers here; the page and its parts are in pages/Results.tsx and
// components/results/pack/ResultsPack.tsx. Counts and words only; every figure is the server's. Never advice.
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import { addDays } from "./qresults";
import { dayShort, sp, type Verdict, VERDICTS } from "./resultsPack";

export type CalDayOut = { date: string; n: number; names: string[]; due: boolean; quarter: string | null };
export type CalResp = { today: string; from: string; to: string; days: CalDayOut[]; meaning?: string };

/** The calendar's days from `from` to `to`; `symbols` (the member's or visitor's own watchlist) keeps only those companies. */
export const useResultsCalendar = (from: string, to: string, symbols: string[] | null = null, enabled = true) => {
  const only = symbols ? [...symbols].sort().join(",") : "";
  return useQuery({
    queryKey: ["results-calendar", from, to, only], staleTime: 60_000, enabled: enabled && !!from && !!to && !(symbols && !symbols.length),
    queryFn: () => apiGet<CalResp>(`/api/results/calendar?from=${from}&to=${to}${only ? `&symbols=${encodeURIComponent(only)}` : ""}`),
  });
};

const n0 = (v: number) => v.toLocaleString("en-IN");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dm = (d: string) => `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}`;

/** Monday of the week that holds `iso` (YYYY-MM-DD, read as a plain date). */
export const mondayOf = (iso: string) => addDays(iso, -((new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7));

/** The "by week" table of the Declared tile: this week so far, the two weeks before it, then everything earlier. Counts every company whose date has passed. */
export function declaredByWeek(days: { date: string; n: number }[], today: string): { label: string; n: number }[] {
  const past = days.filter((d) => d.date <= today);
  const w0 = mondayOf(today), starts = [w0, addDays(w0, -7), addDays(w0, -14)];
  const sum = (lo: string, hi: string) => past.filter((d) => d.date >= lo && d.date <= hi).reduce((a, d) => a + d.n, 0);
  const out = starts.map((s, i) => { const end = i === 0 ? today : addDays(s, 6); return { label: s === end ? dm(s) : `${dm(s)} to ${dm(end)}`, n: sum(s, end) }; });
  out.push({ label: `Before ${dm(starts[2])}`, n: past.filter((d) => d.date < starts[2]).reduce((a, d) => a + d.n, 0) });
  return out;
}

/** The days still to come between `from` and `to` (both included), soonest first. */
export const dueDays = (days: CalDayOut[], from: string, to: string) => days.filter((d) => d.due && d.date >= from && d.date <= to).sort((a, b) => a.date.localeCompare(b.date));
/** "Mon 16 Nov · 2, Tue 17 Nov · 2, Wed 18 Nov · 3" */
export const byDayLine = (days: { date: string; n: number }[]) => days.map((d) => `${dayShort(d.date)} · ${n0(d.n)}`).join(", ");

/** The day picker's list: every day of the quarter with companies on it, up to today, newest first: "Sat 14 Nov · 687 declared". */
export function pickerDays(days: CalDayOut[], today: string): { date: string; label: string }[] {
  return days.filter((d) => d.date <= today).sort((a, b) => b.date.localeCompare(a.date)).map((d) => ({ date: d.date, label: `${dayShort(d.date)} · ${n0(d.n)} declared` }));
}

/** The typical profit growth chip (Coming up): green above +0.5%, red below −0.5%, grey between. */
export const growthTone = (v: number) => (v > 0.5 ? "up" : v < -0.5 ? "down" : "flat");

/** The industry cell of Coming up: an NSE industry or Sector Pulse group as it is; a company with only a higher level known, or none, is "Industry not set"
 *  with that level (or "No NSE classification") underneath (pack: "Industry cells that were "X (broad group)" say "Industry not set""). */
export function industryLines(industry: string | null | undefined): { main: string; under: string | null; set: boolean } {
  if (!industry) return { main: "Industry not set", under: "No NSE classification", set: false };
  if (/^(Sector|Macro sector): /.test(industry)) return { main: "Industry not set", under: industry, set: false };
  return { main: industry, under: null, set: true };
}

/** The one line under the tiles that keeps the quarter in view (the quarter's figures are on Latest results). Basic sees the counts and which plan opens the rest. */
export function quarterLine(fiscal: string, t: { declared: number; companies: number; medianRevenueYoY: number | null; medianProfitYoY: number | null; beatShare?: number | null }, locked: boolean): string {
  if (locked || t.medianRevenueYoY == null) return `Quarter so far, ${fiscal}: ${n0(t.declared)} of ${n0(t.companies)} companies declared${locked ? " · the growth figures open on a paid plan" : ""}.`;
  const beat = t.beatShare == null ? "" : ` · ${Math.round(t.beatShare)}% beat their industry`;
  return `Quarter so far, ${fiscal}: typical revenue ${sp(t.medianRevenueYoY)} · typical profit ${sp(t.medianProfitYoY)}${beat}.`;
}

/** The Last full day tile's sub-line and bar: "92 Strong or Good · 187 Poor or loss · 355 without figures yet". */
export function lastDayLine(verdicts: Record<Verdict, number> | null | undefined, total: number, withNumbers: number): { sub: string; parts: { k: Verdict; n: number }[] } | null {
  if (!verdicts) return null;
  const good = verdicts.Strong + verdicts.Good, bad = verdicts.Poor + verdicts.Loss, none = Math.max(0, total - withNumbers);
  return { sub: `${n0(good)} Strong or Good · ${n0(bad)} Poor or loss · ${n0(none)} without figures yet`, parts: VERDICTS.map((k) => ({ k, n: verdicts[k] })) };
}

/** The Your companies tile: how many of the member's companies (held or followed) have reported this quarter, and how many are due this week. */
export function yoursTile(held: number, followed: number, reported: number, inQuarter: number, dueThisWeek: number): { value: string; unit: string; sub: string; tone: "good" | "mixed" | "plain" } {
  const total = held + followed;
  if (!total) return { value: "None", unit: "added yet", sub: "Add shares to your portfolio or a watchlist to follow their dates here.", tone: "plain" };
  const due = dueThisWeek ? `${n0(dueThisWeek)} due this week` : "none due this week";
  const who = [held ? `${n0(held)} you hold` : "", followed ? `${n0(followed)} you follow` : ""].filter(Boolean).join(" · ");
  const all = inQuarter > 0 && reported >= inQuarter;
  return { value: all ? `All ${n0(inQuarter)}` : `${n0(reported)} of ${n0(inQuarter)}`, unit: "reported", sub: `${who} · ${due}`, tone: all ? "good" : reported ? "mixed" : "plain" };
}
