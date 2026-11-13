// The Results calendar (/results) as the "FinLit final pages" pack draws it (founder, 13 Nov 2026; docs/design/finlit-final-pages/10): the header with the Calendar /
// Industries / Companies switch, six KPI tiles for the quarter, the month calendar with each day's declared or due count, one day's declared results biggest first with
// each company's verdict against its industry, and the week ahead with each company's industry so far. Figures and verdicts are the server's. Never advice.
import { useMemo, useState } from "react";
import { useDocTitle } from "../lib/title";
import { resultsDelayedNote, useJobsStatus } from "../lib/jobsStatus";
import { staleResultsNote, useFeed, useResultsStatus, who, type FeedItem } from "../lib/feed";
import { addDays, todayIST, useQuarterResults } from "../lib/qresults";
import { useWatchlist } from "../lib/watchlist";
import { usePortfolio } from "../lib/portfolio";
import { ComingUp, DayResults, KpiTiles, MonthCalendar, ResultsHead, type CalDay } from "../components/results/pack/ResultsPack";
import "../styles/sectors.css";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import "../styles/rotation-pack.css";
import "../styles/results-pack.css";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DISCLAIMER = "Reported figures from company filings to NSE; verdicts compare each company with its industry this quarter. Not a recommendation to buy, sell or hold any security.";

export function ResultsPage() {
  useDocTitle("Results calendar", "Who has reported, how good the results were against similar companies, and who reports next.");
  const wl = useWatchlist(), pf = usePortfolio();
  const watched = useMemo(() => [...new Set(wl.lists.flatMap((l) => l.symbols))], [wl]);
  const held = useMemo(() => [...new Set(pf.holdings.map((h) => h.symbol.toUpperCase()))], [pf.holdings]);
  const mine = useMemo(() => new Set([...watched, ...held]), [watched, held]);
  const [onlyMine, setOnlyMine] = useState(false);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const today = todayIST();
  const winFrom = ymd(new Date(month.getFullYear(), month.getMonth(), 1)), winTo = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const monthQ = useFeed("result", { limit: 3000, from: winFrom, to: winTo });
  const st = useResultsStatus(), staleNote = staleResultsNote(st.data), delayedNote = resultsDelayedNote(useJobsStatus().data);
  const days = useMemo(() => {
    const m = new Map<string, CalDay>(), seen = new Set<string>();
    for (const x of (monthQ.data ?? []) as FeedItem[]) {
      if (onlyMine && !(x.symbol && watched.includes(x.symbol))) continue;
      const key = `${x.date}|${who(x)}`; if (seen.has(key)) continue; seen.add(key);
      const c = m.get(x.date) ?? { date: x.date, n: 0, names: [] }; c.n += 1; if (c.names.length < 3) c.names.push(who(x)); m.set(x.date, c);
    }
    return m;
  }, [monthQ.data, onlyMine, watched]);
  const lastDeclared = useMemo(() => [...days.keys()].filter((d) => d <= today).sort().pop() ?? null, [days, today]);
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? lastDeclared;
  const kpi = useQuarterResults({ limit: 1 });
  const dayQ = useQuarterResults({ date: day ?? undefined, sort: "marketCap", dir: "desc", limit: 100 });
  const tomorrow = addDays(today, 1), weekEnd = addDays(today, 7);
  const weekQ = useQuarterResults({ from: tomorrow, to: weekEnd, status: "due", sort: "marketCap", dir: "desc", limit: 14 });
  const weekP = useQuarterResults({ from: tomorrow, to: weekEnd, status: "due", scope: "portfolio", limit: 100 }), weekW = useQuarterResults({ from: tomorrow, to: weekEnd, status: "due", scope: "watchlist", limit: 100 });
  const dueMine = new Set([...(weekP.data?.rows ?? []), ...(weekW.data?.rows ?? [])].map((r) => r.symbol)).size;
  const weekDays = useMemo(() => (weekQ.data?.days ?? []).map((d) => ({ date: d.date, n: d.n })), [weekQ.data]);
  return (
    <div className="wrap sx sp rs" data-testid="results-calendar">
      <ResultsHead title="Results calendar" desc="Who has reported, how good the results were against similar companies, and who reports next. Dates are as announced to the exchanges."
        links={[["/results/quarter", "All quarter results"], ["/news", "News & filings"], ["/ipo", "IPO calendar"]]} view="calendar" />
      {staleNote && <div className="rc-stale" role="status">{staleNote}</div>}
      {delayedNote && !staleNote && <div className="rc-stale" role="status" data-testid="results-delayed">{delayedNote}</div>}
      <KpiTiles r={kpi.data} />
      {monthQ.isError && <p className="formerr">The calendar could not be loaded. Please try again shortly.</p>}
      <MonthCalendar month={month} setMonth={(d) => { setMonth(d); setPicked(null); }} days={days} today={today} pick={day} onPick={setPicked} onlyMine={onlyMine} setOnlyMine={setOnlyMine} mineCount={watched.length} />
      {day && <DayResults day={day} resp={dayQ.data} week={weekDays} locked={!!dayQ.data?.locked} mine={mine} />}
      <ComingUp resp={weekQ.data} inds={kpi.data?.industries ?? []} dueMine={dueMine} followed={{ held: held.length, watched: watched.filter((s) => !held.includes(s)).length }} mine={mine} />
      <p className="sp-disclaimer">{DISCLAIMER}</p>
    </div>
  );
}
