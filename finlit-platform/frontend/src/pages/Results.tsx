// The Results calendar (/results). The "FinLit final pages" pack (founder, 13 Nov 2026; docs/design/finlit-final-pages/10) with the 15 Nov changes (task #193,
// finlit-results-calendar-15nov.zip): the header with the Calendar / Industries / Companies switch, four calendar tiles with dropdowns and one line that keeps the
// quarter in view, the month calendar, one day's declared results with their own day picker (the day is in the link: ?day=YYYY-MM-DD, and the calendar follows),
// and every company due in the next seven days with its industry so far. The calendar, the day's list and Coming up read ONE source (GET /api/results/calendar and
// /api/results/quarter, the same rows), so their counts always agree. Figures and verdicts are the server's. Never advice.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useDocTitle } from "../lib/title";
import { resultsDelayedNote, useJobsStatus } from "../lib/jobsStatus";
import { staleResultsNote, useResultsStatus } from "../lib/feed";
import { addDays, isRealDay, todayIST, useQuarterResults } from "../lib/qresults";
import { useWatchlist } from "../lib/watchlist";
import { usePortfolio } from "../lib/portfolio";
import { useAuth } from "../lib/auth";
import { pickerDays, useResultsCalendar } from "../lib/resultsCalendar";
import { DashCardsProvider } from "../components/dashboard/DashCards";
import { ComingUp, DayResults, MonthCalendar, ResultsHead, type CalDay } from "../components/results/pack/ResultsPack";
import { CalendarSync } from "../components/CalendarSync";   // task #297: Add to Google Calendar
import { CalendarTiles } from "../components/results/pack/CalendarTiles";
import "../styles/sectors.css";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import "../styles/rotation-pack.css";
import "../styles/results-pack.css";
import "../styles/results-calendar.css";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthOf = (iso: string) => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, 1);
const DISCLAIMER = "Reported figures from company filings to NSE; verdicts compare each company with its industry this quarter. Not a recommendation to buy, sell or hold any security.";

export function ResultsPage() {
  useDocTitle("Results calendar", "Who has reported, how good the results were against similar companies, and who reports next.");
  const { user } = useAuth();
  const wl = useWatchlist(), pf = usePortfolio();
  const watched = useMemo(() => [...new Set(wl.lists.flatMap((l) => l.symbols))], [wl]);
  const held = useMemo(() => [...new Set(pf.holdings.map((h) => h.symbol.toUpperCase()))], [pf.holdings]);
  const mine = useMemo(() => new Set([...watched, ...held]), [watched, held]);
  const today = todayIST();
  const [params, setParams] = useSearchParams();
  const linked = params.get("day");
  const picked = linked && isRealDay(linked) ? linked : null;
  const [onlyMine, setOnlyMine] = useState(false);
  const [month, setMonth] = useState(() => monthOf(picked ?? today));

  // the month on screen, from the one source
  const winFrom = ymd(new Date(month.getFullYear(), month.getMonth(), 1)), winTo = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const monthQ = useResultsCalendar(winFrom, winTo, onlyMine ? watched : null);
  const days = useMemo(() => new Map<string, CalDay>((monthQ.data?.days ?? []).map((d) => [d.date, { date: d.date, n: d.n, names: d.names }])), [monthQ.data]);

  // the quarter: its tiles, the day picker's days, the day on screen
  const kpi = useQuarterResults({ limit: 1 });
  const q = kpi.data?.quarter;
  const pickFrom = q ? (q.from > addDays(today, -91) ? q.from : addDays(today, -91)) : addDays(today, -91);
  const quarterCal = useResultsCalendar(pickFrom, today);
  const picker = useMemo(() => pickerDays(quarterCal.data?.days ?? [], today), [quarterCal.data, today]);
  const lastDeclared = picker[0]?.date ?? null;
  const day = picked ?? lastDeclared;
  const setDay = (d: string) => {
    const next = new URLSearchParams(params); next.set("day", d); setParams(next, { replace: true });
    setMonth(monthOf(d));
  };
  useEffect(() => { if (picked) setMonth((m) => (ymd(m).slice(0, 7) === picked.slice(0, 7) ? m : monthOf(picked))); }, [picked]);
  const dayQ = useQuarterResults({ date: day ?? undefined, sort: "marketCap", dir: "desc", limit: 100 });
  const lastFull = picker.find((d) => d.date < today)?.date ?? null;
  const lastQ = useQuarterResults({ date: lastFull ?? undefined, limit: 1 });

  // the week ahead: every company the calendar shows as due (status "upcoming": figures in or not)
  const tomorrow = addDays(today, 1), weekEnd = addDays(today, 7);
  const ahead = useResultsCalendar(tomorrow, addDays(today, 60));
  const weekQ = useQuarterResults({ from: tomorrow, to: weekEnd, status: "upcoming", sort: "marketCap", dir: "desc", limit: 100 });
  // your companies: the same calendar, kept to the companies you hold or follow (works signed in or not: the lists are the page's own)
  const mineList = useMemo(() => [...mine], [mine]);
  const mineCal = useResultsCalendar(q?.from ?? "", q?.to ?? "", mineList, !!q && mineList.length > 0);
  const sumOf = (lo: string, hi: string) => (mineCal.data?.days ?? []).filter((d) => d.date >= lo && d.date <= hi).reduce((a, d) => a + d.n, 0);
  const mineInQuarter = sumOf("0000-01-01", "9999-12-31"), mineReported = sumOf("0000-01-01", today), dueMine = sumOf(tomorrow, weekEnd);
  const weekDays = useMemo(() => (weekQ.data?.days ?? []).map((d) => ({ date: d.date, n: d.n })), [weekQ.data]);
  const st = useResultsStatus(), staleNote = staleResultsNote(st.data), delayedNote = resultsDelayedNote(useJobsStatus().data);
  const followed = watched.filter((s) => !held.includes(s)).length;
  return (
    <DashCardsProvider userId={user?.id ?? null}>
    <div className="wrap sx sp rs rsc" data-testid="results-calendar">
      <ResultsHead actions={<CalendarSync />} title="Results calendar" desc="Who has reported, how good the results were against similar companies, and who reports next. Dates are as announced to the exchanges."
        links={[["/results/quarter", "All quarter results"], ["/news", "News & filings"], ["/ipo", "IPO calendar"]]} view="calendar" />
      {staleNote && <div className="rc-stale" role="status">{staleNote}</div>}
      {delayedNote && !staleNote && <div className="rc-stale" role="status" data-testid="results-delayed">{delayedNote}</div>}
      <CalendarTiles kpi={kpi.data} ahead={ahead.data?.days} week={weekQ.data} lastDay={lastFull} lastResp={lastQ.data} today={today}
        mine={{ held: held.length, followed, reported: mineReported, inQuarter: mineInQuarter, dueWeek: dueMine, signedIn: !!user }} />
      {monthQ.isError && <p className="formerr">The calendar could not be loaded. Please try again shortly.</p>}
      <MonthCalendar month={month} setMonth={setMonth} days={days} today={today} pick={day} onPick={setDay} onlyMine={onlyMine} setOnlyMine={setOnlyMine} mineCount={watched.length} />
      {day && <DayResults day={day} resp={dayQ.data} week={weekDays} locked={!!dayQ.data?.locked} mine={mine} picker={picker} today={today} onDay={setDay} />}
      <ComingUp resp={weekQ.data} inds={kpi.data?.industries ?? []} dueMine={dueMine} followed={{ held: held.length, watched: followed }} mine={mine} locked={!!kpi.data?.locked} />
      <p className="sp-disclaimer">{DISCLAIMER}</p>
    </div>
    </DashCardsProvider>
  );
}
