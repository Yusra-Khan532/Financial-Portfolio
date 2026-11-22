// Results: one page in place of the Results calendar and Latest results (task #330, developer file 28, 23 Nov 2026). The header with the quarter picker and the
// calendar buttons, six tiles in one row (Declared so far, Due in the next 7 days and Your companies from the calendar; typical revenue and profit growth and
// Beat their industry from Latest results), "3 more figures" under them (Profit up, Net margin up, Last full day), and a view bar that stays under the site
// header: Calendar (the month, a day's list and Coming up this week, unchanged), Industries (unchanged) and Companies (every company's results).
// The view is in the address (?view=calendar|industries|companies) and remembered; the quarter picker applies to all three; each view loads its own data the
// first time it opens and keeps its state when the member switches away and back. /results/quarter redirects here. Figures are the server's. Never advice.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useDocTitle } from "../lib/title";
import { resultsDelayedNote, useJobsStatus } from "../lib/jobsStatus";
import { staleResultsNote, useResultsStatus } from "../lib/feed";
import { addDays, isRealDay, todayIST, useQuarterResults, type QResp } from "../lib/qresults";
import { useWatchlist } from "../lib/watchlist";
import { usePortfolio } from "../lib/portfolio";
import { useAuth } from "../lib/auth";
import { Icon } from "../lib/icons";
import { pickerDays, useResultsCalendar, type CalDayOut } from "../lib/resultsCalendar";
import { DashCardsProvider } from "../components/dashboard/DashCards";
import { ComingUp, DayResults, MonthCalendar, type CalDay } from "../components/results/pack/ResultsPack";
import { CalendarSync } from "../components/CalendarSync";   // task #297: Add to Google Calendar
import { CalendarTileSet, type CalTileProps } from "../components/results/pack/CalendarTiles";
import { QT_MORE, QT_TOP, QuarterNote, QuarterPicker, QuarterTileSet, useQuarterTileData } from "../components/results/pack/QuarterTop";
import { IndustriesView } from "../components/results/pack/IndustriesView";
import { CompaniesView } from "./QuarterResults";
import { dayMonth } from "../lib/dashboard";
import "../styles/sectors.css";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import "../styles/rotation-pack.css";
import "../styles/results-pack.css";
import "../styles/results-calendar.css";
import "../styles/merged-page.css";
import { Link } from "react-router";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthOf = (iso: string) => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, 1);
const n0 = (v: number) => v.toLocaleString("en-IN");
const DISCLAIMER = "Reported figures from company filings to NSE; verdicts compare each company with its industry this quarter. Not a recommendation to buy, sell or hold any security.";

export type ResView = "calendar" | "industries" | "companies";
export const RESULTS_VIEWS: { key: ResView; title: string; desc: string }[] = [
  { key: "calendar", title: "Calendar", desc: "Who declares when, day by day" },
  { key: "industries", title: "Industries", desc: "How each industry did this quarter" },
  { key: "companies", title: "Companies", desc: "Every company's results, newest first" },
];
const VIEW_KEY = "finlit-results-view";
const isView = (v: string | null | undefined): v is ResView => v === "calendar" || v === "industries" || v === "companies";
/** The view that opens (decided 23 Nov): the one in the address; otherwise the member's last view; on a first visit, Calendar. */
export function openView(param: string | null, saved: string | null): ResView {
  return isView(param) ? param : isView(saved) ? saved : "calendar";
}
const readSaved = () => { try { return localStorage.getItem(VIEW_KEY); } catch { return null; } };
const save = (v: ResView) => { try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode: the address still holds it */ } };

/** The calendar's own data (the tiles need part of it, the Calendar view the rest): your companies, the week ahead, the last full day. */
function useCalendarData(kpi: QResp | undefined) {
  const { user } = useAuth();
  const wl = useWatchlist(), pf = usePortfolio();
  const watched = useMemo(() => [...new Set(wl.lists.flatMap((l) => l.symbols))], [wl]);
  const held = useMemo(() => [...new Set(pf.holdings.map((h) => h.symbol.toUpperCase()))], [pf.holdings]);
  const mine = useMemo(() => new Set([...watched, ...held]), [watched, held]);
  const today = todayIST();
  const q = kpi?.quarter;
  const pickFrom = q ? (q.from > addDays(today, -91) ? q.from : addDays(today, -91)) : addDays(today, -91);
  const quarterCal = useResultsCalendar(pickFrom, today);
  const picker = useMemo(() => pickerDays(quarterCal.data?.days ?? [], today), [quarterCal.data, today]);
  const lastFull = picker.find((d) => d.date < today)?.date ?? null;
  const lastQ = useQuarterResults({ date: lastFull ?? undefined, limit: 1 });
  const tomorrow = addDays(today, 1), weekEnd = addDays(today, 7);
  const ahead = useResultsCalendar(tomorrow, addDays(today, 60));
  const weekQ = useQuarterResults({ from: tomorrow, to: weekEnd, status: "upcoming", sort: "marketCap", dir: "desc", limit: 100 });
  const mineList = useMemo(() => [...mine], [mine]);
  const mineCal = useResultsCalendar(q?.from ?? "", q?.to ?? "", mineList, !!q && mineList.length > 0);
  const sumOf = (lo: string, hi: string) => (mineCal.data?.days ?? []).filter((d) => d.date >= lo && d.date <= hi).reduce((a, d) => a + d.n, 0);
  const mineInQuarter = sumOf("0000-01-01", "9999-12-31"), mineReported = sumOf("0000-01-01", today), dueMine = sumOf(tomorrow, weekEnd);
  const followed = watched.filter((s) => !held.includes(s)).length;
  const tiles: CalTileProps = { kpi, ahead: ahead.data?.days as CalDayOut[] | undefined, week: weekQ.data, lastDay: lastFull, lastResp: lastQ.data, today,
    mine: { held: held.length, followed, reported: mineReported, inQuarter: mineInQuarter, dueWeek: dueMine, signedIn: !!user } };
  const dueWeek = (ahead.data?.days ?? []).filter((d) => d.due && d.date >= tomorrow && d.date <= weekEnd).reduce((a, d) => a + d.n, 0);
  return { tiles, watched, held, mine, today, picker, weekQ, dueMine, followed, dueWeek };
}
type CalData = ReturnType<typeof useCalendarData>;

/** The Calendar view: the month, the day's list and Coming up this week (the Results calendar's own blocks, unchanged). On a past quarter it opens on that
 *  quarter's busiest month. */
function CalendarView({ c, kpi }: { c: CalData; kpi: QResp | undefined }) {
  const { today, watched, held, mine, picker, weekQ, dueMine, followed } = c;
  const [params, setParams] = useSearchParams();
  const linked = params.get("day");
  const picked = linked && isRealDay(linked) ? linked : null;
  const [onlyMine, setOnlyMine] = useState(false);
  const q = kpi?.quarter;
  const pastQuarter = !!q && q.to < today;
  const busiest = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of kpi?.days ?? []) m.set(d.date.slice(0, 7), (m.get(d.date.slice(0, 7)) ?? 0) + d.n);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [kpi?.days]);
  const [month, setMonth] = useState(() => monthOf(picked ?? today));
  useEffect(() => { if (!picked && pastQuarter && busiest) setMonth(monthOf(busiest + "-01")); }, [q?.key, busiest]); // eslint-disable-line react-hooks/exhaustive-deps
  const winFrom = ymd(new Date(month.getFullYear(), month.getMonth(), 1)), winTo = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const monthQ = useResultsCalendar(winFrom, winTo, onlyMine ? watched : null);
  const days = useMemo(() => new Map<string, CalDay>((monthQ.data?.days ?? []).map((d) => [d.date, { date: d.date, n: d.n, names: d.names }])), [monthQ.data]);
  const lastDeclared = picker[0]?.date ?? null;
  const day = picked ?? lastDeclared;
  const setDay = (d: string) => {
    const next = new URLSearchParams(params); next.set("day", d); setParams(next, { replace: true });
    setMonth(monthOf(d));
  };
  useEffect(() => { if (picked) setMonth((m) => (ymd(m).slice(0, 7) === picked.slice(0, 7) ? m : monthOf(picked))); }, [picked]);
  const dayQ = useQuarterResults({ date: day ?? undefined, sort: "marketCap", dir: "desc", limit: 100 });
  const weekDays = useMemo(() => (weekQ.data?.days ?? []).map((d) => ({ date: d.date, n: d.n })), [weekQ.data]);
  return <>
    {monthQ.isError && <p className="formerr">The calendar could not be loaded. Please try again shortly.</p>}
    <MonthCalendar month={month} setMonth={setMonth} days={days} today={today} pick={day} onPick={setDay} onlyMine={onlyMine} setOnlyMine={setOnlyMine} mineCount={watched.length} />
    {day && <DayResults day={day} resp={dayQ.data} week={weekDays} locked={!!dayQ.data?.locked} mine={mine} picker={picker} today={today} onDay={setDay} />}
    <ComingUp resp={weekQ.data} inds={kpi?.industries ?? []} dueMine={dueMine} followed={{ held: held.length, watched: followed }} mine={mine} locked={!!kpi?.locked} />
    <p className="sp-disclaimer">{DISCLAIMER}</p>
  </>;
}

/** The view bar (pack row 4): a bordered bar with "3 views · press one to switch", numbered buttons with a count each, and what the open view shows. It stays
 *  under the site header while the page scrolls (not on a phone). */
export function ViewBar({ view, counts, onView }: { view: ResView; counts: Record<ResView, string | null>; onView: (v: ResView) => void }) {
  const cur = RESULTS_VIEWS.find((v) => v.key === view)!;
  return (
    <div className="mg-tabs" role="tablist" aria-label="Results views">
      <span className="mg-tabs-ic" aria-hidden="true"><Icon name="layers" /></span>
      <span className="mg-tabs-k">3 views<small>press one to switch</small></span>
      {RESULTS_VIEWS.map((v, i) => <button key={v.key} type="button" role="tab" id={`mg-tab-${v.key}`} aria-controls={`mg-pane-${v.key}`} aria-selected={view === v.key}
        className={view === v.key ? "on" : undefined} onClick={() => onView(v.key)}><i>{i + 1}</i>{v.title}{counts[v.key] && <span className="n">{counts[v.key]}</span>}</button>)}
      <span className="mg-tabs-d" aria-live="polite"><b>Showing:</b> {cur.desc}</span>
    </div>
  );
}

export function ResultsPage() {
  useDocTitle("Results calendar and latest quarterly results", "Who has reported, how good the results were against similar companies, who reports next, and every company's results for the quarter.");
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const view = openView(sp.get("view"), readSaved());
  const [seen, setSeen] = useState<Set<ResView>>(() => new Set([view]));
  useEffect(() => { save(view); setSeen((s) => (s.has(view) ? s : new Set([...s, view]))); }, [view]);
  const setView = (v: ResView) => { if (v === view) return; const n = new URLSearchParams(sp); n.set("view", v); setSp(n); };   // a new history entry: the back button returns to the last view
  const quarter = sp.get("quarter") || undefined;
  const kpiQ = useQuarterResults({ quarter, limit: 1 });
  const kpi = kpiQ.data;
  const q = kpi?.quarter;
  const tiles = useQuarterTileData(kpi);
  const c = useCalendarData(kpi);
  const pickQuarter = (key: string) => { const n = new URLSearchParams(sp); n.set("quarter", key); for (const k of ["date", "from", "to", "day"]) n.delete(k); setSp(n); };
  const st = useResultsStatus(), staleNote = staleResultsNote(st.data), delayedNote = resultsDelayedNote(useJobsStatus().data);
  const counts: Record<ResView, string | null> = {
    calendar: `${n0(c.dueWeek)} due this week`,
    industries: kpi?.industries ? n0(kpi.industries.length) : null,
    companies: kpi?.totals ? n0(kpi.totals.companies) : null,
  };
  return (
    <DashCardsProvider userId={user?.id ?? null}>
    <div className="wrap sx sp rs rsc rs-one" data-testid="results-calendar">
      <header className="sp-head rs-head mg-head card">
        <div>
          <p className="sp-eyebrow">Markets · Results</p>
          <h1 className="ui-title">Results{q ? ` · ${q.fiscal}` : ""}</h1>
          <p className="sp-desc">Who reports when, how each industry did, and every company's results for the quarter{q ? ` ended ${dayMonth(q.periodEnd, true)}` : ""}.</p>
          <nav className="rs-links" aria-label="Related pages">{([["/news", "News & filings"], ["/documents", "Documents"], ["/ipo", "IPOs"]] as const).map(([href, label]) => <Link key={href} to={href} className="sp-link">{label} →</Link>)}</nav>
        </div>
        <div className="mg-side">
          <div className="rs-qsel"><QuarterPicker quarters={kpi?.quarters ?? []} current={q?.key} onPick={pickQuarter} /></div>
          <CalendarSync />
        </div>
      </header>
      {staleNote && <div className="rc-stale" role="status">{staleNote}</div>}
      {delayedNote && !staleNote && <div className="rc-stale" role="status" data-testid="results-delayed">{delayedNote}</div>}
      {kpiQ.isError && <p className="formerr">The quarter's figures could not be loaded. Please try again shortly.</p>}
      {!kpi?.quarter ? <div className="sx-skel sp-sec" role="status" aria-label="Loading the quarter's figures" /> : <section aria-label="The quarter at a glance">
        <div className="rs-q6 mg-tiles" role="group" aria-label="The quarter in six figures">
          <CalendarTileSet {...c.tiles} only={["declared", "due", "yours"]} />
          <QuarterTileSet tiles={tiles} keys={QT_TOP} />
        </div>
        <details className="mg-more">
          <summary>3 more figures <small>Profit up · Net margin up · Last full day</small><span className="cv" aria-hidden="true">▾</span></summary>
          <div className="mg-more-g">
            <QuarterTileSet tiles={tiles} keys={QT_MORE} />
            <CalendarTileSet {...c.tiles} only={["last"]} />
          </div>
        </details>
        <div className="mg-note"><QuarterNote r={kpi} /></div>
      </section>}
      <ViewBar view={view} counts={counts} onView={setView} />
      {RESULTS_VIEWS.map((v) => seen.has(v.key) && (
        <div key={v.key} id={`mg-pane-${v.key}`} role="tabpanel" aria-labelledby={`mg-tab-${v.key}`} className="mg-pane" hidden={view !== v.key}>
          {v.key === "calendar" && <CalendarView c={c} kpi={kpi} />}
          {v.key === "industries" && <><IndustriesView inds={kpi?.industries ?? []} /><p className="sp-disclaimer">{DISCLAIMER}</p></>}
          {v.key === "companies" && <CompaniesView />}
        </div>))}
    </div>
    </DashCardsProvider>
  );
}
