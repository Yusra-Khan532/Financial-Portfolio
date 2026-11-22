// The Results calendar (and the shared top of Latest results) as the "FinLit final pages" pack draws them (docs/design/finlit-final-pages/10 and 11): the header with
// the Calendar / Industries / Companies switch, the KPI tiles Latest results keeps (the calendar has its own four, CalendarTiles.tsx, task #193), the month calendar
// with each day's declared or due count, one day's declared results with their own day picker and verdicts, and every company due in the next seven days with its
// industry so far. Figures and verdicts are the server's (GET /api/results/quarter, /api/results/calendar); words from lib/resultsPack. Never advice.
import { SIZE_RULE_TEXT } from "../../../lib/capBuckets";
import { useMemo, useState } from "react";
import { Icon } from "../../../lib/icons";
import { SortTh } from "../../SortTh";
import "../../../styles/results224.css";
import { useTableSort, type SortVal } from "../../../lib/tableSort";
import { Link } from "react-router";
import { CoLogo } from "../../CoLogo";
import { Scroll, Section, Tip } from "../../sectors/pack/Common";
import { DashCards, OpenAll } from "../../dashboard/DashCards";
import { LockedBlock } from "../../sectors/Parts";
import { dayCards, dayShort, kpiTiles, longDate, monthName, sp, VERDICTS, weekCards, type IndustrySoFar, type VRow, type VSummary, type Verdict, type Check } from "../../../lib/resultsPack";
import type { QResp } from "../../../lib/qresults";
import { useNseName } from "../../../lib/taxonomy";
import { growthTone, industryLines } from "../../../lib/resultsCalendar";
import "../../../styles/table-grid.css";   // the shared grid table (kit-grid / kit-bands) of the tables below; imported here so every page that draws them has it

const n0 = (v: number) => v.toLocaleString("en-IN");
import { coTitle, subLine, titleOf } from "../../../lib/companyLabel";
const cr = (v: number | null | undefined) => (v == null ? "–" : Math.abs(v) >= 100 ? n0(Math.round(v)) : v.toFixed(1));
const tone = (v: number | null | undefined) => (v == null ? "" : v > 0 ? "sp-good" : v < 0 ? "sp-red" : "");

// ------------------------------------------------------------------------------------------------ header, view switch and tiles
export type ResView = "calendar" | "industries" | "companies";
const VIEWS: { key: ResView; title: string; desc: string; color: string; icon: string }[] = [
  { key: "calendar", title: "Calendar", desc: "Who declares when, day by day", color: "#0e6471", icon: "calendar" },
  { key: "industries", title: "Industries", desc: "How each industry did this quarter", color: "#4b4fc4", icon: "layers" },
  { key: "companies", title: "Companies", desc: "Every company's results, newest first", color: "#b5541c", icon: "list" },
];
export function ResultsHead({ title, desc, links, view, actions }: { title: string; desc: string; links: [string, string][]; view: ResView; actions?: React.ReactNode }) {
  const to: Record<ResView, string> = { calendar: "/results", industries: "/results/quarter?view=industries", companies: "/results/quarter" };
  return (
    <header className="sp-head rs-head card">
      <p className="sp-eyebrow">Markets · Results</p>
      <h1 className="ui-title">{title}</h1>
      <p className="sp-desc">{desc}</p>
      <div className="sp-head-bar">
        <nav className="rs-links" aria-label="Related pages">{links.map(([href, label]) => <Link key={href} to={href} className="sp-link">{label} →</Link>)}</nav>
      </div>
      {actions}
      {/* task #224 (results pack of 18 Nov, A3): the three views as cards that stand out, each in its own colour; they stay links to the same pages */}
      <div className="xvr-w">
        <p className="eqv-k" id="rs-views-k">Choose a view <small>· 3 views · tap one</small></p>
        <nav className="sp-view xvr" aria-labelledby="rs-views-k">
          {VIEWS.map((v) => <Link key={v.key} to={to[v.key]} className={"sp-vbtn" + (view === v.key ? " on" : "")} aria-current={view === v.key ? "page" : undefined} style={{ "--va": v.color } as React.CSSProperties}>
            <span className="eqv-ic" aria-hidden="true"><Icon name={v.icon} /></span><b>{v.title}</b><small>{v.desc}</small></Link>)}
        </nav>
      </div>
    </header>
  );
}
export function KpiTiles({ r }: { r: QResp | undefined }) {
  if (!r?.quarter) return <div className="sx-skel sp-sec" role="status" aria-label="Loading the quarter's figures" />;
  const t = r.totals as VSummary, q = r.quarter;
  const upd = r.updatedAt ? new Date(r.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : null;
  return (
    <section className="rs-kpis" aria-label="The quarter so far">
      <div className="rs-tiles">{kpiTiles(t, !!r.locked).map((x) => <div key={x.k} className="ip-tile"><p className="sp-cap">{x.k}{x.help && <Tip text={x.help} label={`About “${x.k}”`} />}</p><b>{x.v}</b><small>{x.sub}</small></div>)}</div>
      {r.locked && <p className="sp-note">The growth figures, shares and verdicts are part of the Silver plan. <Link to="/plans">See plans</Link>.</p>}
      <p className="sp-note">Quarter ended {longDate(q.periodEnd)} ({q.fiscal}){upd ? ` · updated ${upd} IST` : ""} · figures in ₹ crore · "typical" is the middle company (the median), so a few extreme results cannot distort it.</p>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ the month calendar
export type CalDay = { date: string; n: number; names: string[] };
export function MonthCalendar({ month, setMonth, days, today, pick, onPick, onlyMine, setOnlyMine, mineCount }: {
  month: Date; setMonth: (d: Date) => void; days: Map<string, CalDay>; today: string; pick: string | null; onPick: (d: string) => void; onlyMine: boolean; setOnlyMine: (v: boolean) => void; mineCount: number;
}) {
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const first = new Date(month.getFullYear(), month.getMonth(), 1), pad = (first.getDay() + 6) % 7, nDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((pad + nDays) / 7) * 7 }, (_, i) => (i < pad || i >= pad + nDays ? null : new Date(month.getFullYear(), month.getMonth(), i - pad + 1)));
  return (
    <section className="sp-sec" aria-labelledby="rs-cal" id="rsc-cal">
      <div className="sp-sec-h"><div><h2 id="rs-cal">{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2><p className="sp-sub">Board-meeting dates for quarterly results, as announced to the exchanges. Select a day to see its companies.</p></div>
        <div className="rs-calnav"><label className="sw"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /><span aria-hidden="true" /><b>Only my watchlist{mineCount ? ` (${mineCount})` : ""}</b></label>
          <button type="button" className="sp-fbtn" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
          <button type="button" className="sp-fbtn" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</button>
          <button type="button" className="sp-fbtn" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button></div></div>
      <Scroll label="results calendar"><div className="rs-cal" role="grid" aria-label="Results calendar">
        {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => <div key={d} className="rs-cal-h" role="columnheader">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="rs-cal-c off" aria-hidden="true" />;
          const k = ymd(d), c = days.get(k), past = k <= today;
          return (
            <button key={i} type="button" role="gridcell" disabled={!c} className={"rs-cal-c" + (k === today ? " today" : "") + (pick === k ? " on" : "") + (c ? (past ? " done" : " due") : "")} onClick={() => onPick(k)} aria-label={`${dayShort(k)}: ${c ? `${c.n} ${past ? "declared" : "due"}` : "no results"}`}>
              <b>{d.getDate()}</b>
              {c && <><span className="rs-cal-n">{n0(c.n)} {past ? "declared" : "due"}</span>{c.names.slice(0, 3).map((x) => <span key={x} className="rs-cal-x">{x}</span>)}{c.n > 3 && <em>+{n0(c.n - Math.min(3, c.names.length))} more</em>}</>}
            </button>);
        })}
      </div></Scroll>
      <p className="rs-cal-key"><span><span className="rs-sw done" aria-hidden="true" />declared: results out</span><span><span className="rs-sw due" aria-hidden="true" />due: board meeting ahead</span><span><span className="rs-sw today" aria-hidden="true" />Blue border: today</span></p>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ one company's verdict and the results table
const ARROW: Record<Check, string> = { up: "▲", flat: "●", down: "▼", loss: "✕" };
const ARROW_WORD: Record<Check, string> = { up: "better than typical", flat: "close to typical", down: "worse than typical", loss: "a loss" };
/** A result row's group (task #192): its NSE industry or Sector Pulse group in NSE's spelling, a labelled higher level ("Sector: ...", "Macro sector: ..."), or
 *  "Not classified" when NSE's lists do not place the company. Never the provider's own field (it showed "DVR (broad group)" and "Industrials (broad group)"). */
export function IndustryCell({ name }: { name: string | null | undefined }) {
  const nse = useNseName();
  if (!name) return <span className="faint" title="This company is not in NSE's classification lists, so it is not compared with an industry">Not classified</span>;
  return <>{nse(name)}</>;
}

export function VerdictCell({ r }: { r: VRow }) {
  if (!r.verdict) return <span className="sp-nil">{r.hasNumbers ? "Not enough figures" : "–"}</span>;
  const c = r.checks;
  return (
    <span className="rs-vd">
      <span className={"rs-v rs-v-" + r.verdict.toLowerCase().replace(" ", "")}>{r.verdict}</span>
      {c && <span className="rs-checks">{(["rev", "profit", "margin"] as const).map((k) => c[k] && <span key={k} className={"rs-ck " + c[k]} title={`${k === "rev" ? "Revenue" : k === "profit" ? "Profit" : "Margin"}: ${ARROW_WORD[c[k]!]}`}>{k === "rev" ? "Rev" : k === "profit" ? "Profit" : "Margin"} {ARROW[c[k]!]}</span>)}</span>}
    </span>
  );
}
export const HOW_JUDGED = "Revenue growth, profit growth and margin change on a year ago are each compared with the typical company in the same NSE industry. Above on most of them: Strong or Good. Below on most: Weak or Poor. Company size does not change the yardstick; use the size filter to compare like with like.";
const YOY = "On a year ago (YoY). This quarter compared with the same quarter last year. It removes seasonal effects, so it is the main yardstick.";
/** Task #224 (A1): what each heading of the results table sorts by. */
const RT_GET = (r: VRow, k: string): SortVal => ({ company: r.symbol, industry: r.industry, size: r.cap, rev: r.revenue, revYoY: r.revenueYoY, revQoQ: r.revenueQoQ,
  np: r.netProfit, npYoY: r.profitYoY, npQoQ: r.profitQoQ, npm: r.npm, npmChg: r.npmChange, verdict: r.verdict } as Record<string, SortVal>)[k];
export function ResultsTable({ rows, label, mine }: { rows: VRow[]; label: string; mine?: Set<string> }) {
  const { sorted, sort, toggle } = useTableSort(rows, RT_GET);
  const H = (k: string, l: React.ReactNode, cls?: string, after?: React.ReactNode) => <SortTh k={k} label={l} sort={sort} onSort={toggle} className={cls} after={after} />;
  return (
    <Scroll label={label}><table className="sp-tb rs-t kit-grid">
      <thead>
        <tr className="kit-bands"><th colSpan={3} aria-hidden="true" /><th colSpan={3} scope="colgroup" className="kit-band kit-b-blue"><span>Revenue<Tip text={YOY} /></span></th><th colSpan={3} scope="colgroup" className="kit-band kit-b-green"><span>Net profit<Tip text={YOY} /></span></th><th colSpan={2} scope="colgroup" className="kit-band kit-b-gold"><span>Profit margin<Tip text="Margin change. Net profit as a share of revenue, compared with a year ago, in percentage points. Up means each ₹100 of sales left more profit." /></span></th><th scope="colgroup" className="kit-band kit-b-dark"><span>Vs its industry<Tip text={HOW_JUDGED} /></span></th></tr>
        <tr>{H("company", "Company")}{H("industry", "Industry")}{H("size", "Size", undefined, <Tip text={`Company size. FinLit uses four sizes everywhere, by market value: ${SIZE_RULE_TEXT}.`} />)}
          {H("rev", "₹ Cr", "r")}{H("revYoY", "YoY", "r")}{H("revQoQ", "QoQ", "r")}{H("np", "₹ Cr", "r")}{H("npYoY", "YoY", "r")}{H("npQoQ", "QoQ", "r")}{H("npm", "Now", "r")}{H("npmChg", "Change", "r")}{H("verdict", "Verdict")}</tr>
      </thead>
      <tbody>{sorted.map((r) => (
        <tr key={r.symbol}><td><Link to={`/stocks/${r.symbol}#quarter`} className="ip-sym"><CoLogo symbol={r.symbol} name={r.name} size={22} inline /><span><b title={coTitle(r)}>{titleOf(r)}</b><small>{subLine(r, r.name)}</small></span></Link>{mine?.has(r.symbol) && <em className="rp-yours"> · Yours</em>}</td>
          <td className="rs-ind"><IndustryCell name={r.industry} /></td><td>{r.cap ?? "–"}</td>
          <td className="r">{cr(r.revenue)}</td><td className={"r " + tone(r.revenueYoY)}>{sp(r.revenueYoY)}</td><td className={"r " + tone(r.revenueQoQ)}>{sp(r.revenueQoQ)}</td>
          <td className="r">{r.loss ? <span className="sp-red">{cr(r.netProfit)}</span> : cr(r.netProfit)}</td><td className={"r " + tone(r.profitYoY)}>{r.loss && r.profitYoY == null ? "loss" : sp(r.profitYoY)}</td><td className={"r " + tone(r.profitQoQ)}>{sp(r.profitQoQ)}</td>
          <td className="r">{r.npm == null ? "–" : `${r.npm.toFixed(1)}%`}</td><td className={"r " + tone(r.npmChange)}>{sp(r.npmChange)}</td><td><VerdictCell r={r} /></td></tr>))}</tbody>
    </table></Scroll>
  );
}

// ------------------------------------------------------------------------------------------------ one day's declared results
export type PickDay = { date: string; label: string };
/** The declared table's own day picker (task #193, B1): ← older day, every day of the quarter with its count, newer day →, Today, and back up to the calendar. */
export function DayPicker({ day, days, today, onDay }: { day: string; days: PickDay[]; today: string; onDay: (d: string) => void }) {
  const list = days.some((d) => d.date === day) ? days : [{ date: day, label: `${dayShort(day)} · ${day > today ? "still to come" : "none declared"}` }, ...days].sort((a, b) => b.date.localeCompare(a.date));
  const i = list.findIndex((d) => d.date === day);
  const older = list[i + 1]?.date, newer = list[i - 1]?.date;
  return (
    <div className="rsc-pick" role="group" aria-label="Pick a day">
      <button type="button" className="sp-fbtn" aria-label="Previous day with results" disabled={!older} onClick={() => older && onDay(older)}>←</button>
      <label className="rsc-pick-sel"><span className="sr-only">Day</span>
        <select value={day} onChange={(e) => onDay(e.target.value)}>{list.map((d) => <option key={d.date} value={d.date}>{d.label}</option>)}</select></label>
      <button type="button" className="sp-fbtn" aria-label="Next day with results" disabled={!newer} onClick={() => newer && onDay(newer)}>→</button>
      <button type="button" className="sp-fbtn" aria-pressed={day === today} onClick={() => onDay(today)}>Today</button>
      <a className="sp-link rsc-up" href="#rsc-cal" onClick={(e) => { e.preventDefault(); document.getElementById("rsc-cal")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Calendar ↑</a>
    </div>
  );
}

export function DayResults({ day, resp, week, locked, mine, picker, today, onDay }: { day: string; resp: QResp | undefined; week: { date: string; n: number }[]; locked: boolean; mine: Set<string>;
  picker: PickDay[]; today: string; onDay: (d: string) => void }) {
  const [f, setF] = useState<"all" | Verdict>("all"), [all, setAll] = useState(false);
  const rows = (resp?.rows ?? []) as VRow[], counts = (resp?.summary as VSummary | undefined)?.verdicts ?? null, total = resp?.total ?? 0;
  const shown = useMemo(() => rows.filter((r) => f === "all" || r.verdict === f), [rows, f]);
  const past = day <= (resp?.today ?? day);
  const cards = dayCards(rows, counts, total, day, week);
  return (
    <section className="sp-sec" aria-labelledby="rs-day" id="rsc-day">
      <div className="rsc-dayhead">
        <h2 id="rs-day">{dayShort(day)} · {n0(total)} {total === 1 ? "company" : "companies"} {past ? "declared" : "due"}</h2>
        <DayPicker day={day} days={picker} today={today} onDay={(d) => { setF("all"); setAll(false); onDay(d); }} />
      </div>
      <p className="sp-sub">Biggest companies first. Each verdict compares the company with similar companies in its industry.</p>
      {!resp ? <div className="sx-skel" style={{ height: 120 }} role="status" aria-label="Loading the day's results" /> : !total ? <p className="sp-empty">{day > today ? "This day is still to come; its companies are in the calendar and in Coming up." : "No company declared on this day. Pick another day above."}</p> : <>
        {counts && <div className="sp-filters" role="group" aria-label="Show">
          <button type="button" className={"sp-fbtn" + (f === "all" ? " on" : "")} aria-pressed={f === "all"} onClick={() => setF("all")}>All {n0(total)}</button>
          {VERDICTS.map((v) => <button key={v} type="button" className={"sp-fbtn rs-fv-" + v.toLowerCase().replace(" ", "") + (f === v ? " on" : "")} aria-pressed={f === v} disabled={!counts[v]} onClick={() => setF(v)}>{v} · {counts[v]}</button>)}
        </div>}
        {cards.length > 0 && <div className="rsc-cards">{cards.length > 1 && <div className="rsc-openall"><OpenAll scope="rsc-day" n={cards.length} /></div>}<DashCards items={cards} scope="rsc-day" /></div>}
        <details className="sp-more rs-how"><summary>How we judge a result ▾</summary>
          <ol className="sp-steps">
            <li><b>Three checks.</b> Revenue growth from a year ago, profit growth from a year ago, and the change in profit margin.</li>
            <li><b>Against similar companies.</b> Each figure is compared with the typical company in the same industry this quarter. A bank is compared with banks, a carmaker with carmakers.</li>
            <li><b>Size does not count.</b> A small company faces the same yardstick as a large one in its industry. The size column is there for your information only.</li>
            <li><b>The verdict.</b> Strong: better than typical on most checks. Good: better on balance. In line: close to typical. Weak and Poor: worse on balance, or on most checks. Loss: the company lost money.</li>
          </ol>
          <p className="rs-legend"><span><b className="rs-ck up">▲</b> better than typical</span><span><b className="rs-ck flat">●</b> close to typical</span><span><b className="rs-ck down">▼</b> worse than typical</span><span><b className="rs-ck loss">✕</b> loss</span></p>
        </details>
        {locked ? <LockedBlock plan="silver" title="Each company's figures and verdict are part of the Silver plan">The calendar, the counts and the companies are open to everyone. Silver shows every company's revenue, profit and margin against a year ago, with its verdict against its industry.</LockedBlock>
          : <><ResultsTable rows={all ? shown : shown.slice(0, 10)} label={`results declared on ${dayShort(day)}`} mine={mine} />
            {shown.length > 10 && <button type="button" className="sp-morebtn" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer ▴" : `Show the other ${shown.length - 10} companies ▾`}</button>}
            {total > rows.length && <p className="sp-note">The {rows.length} largest of {n0(total)} are listed here. <Link to={`/results/quarter?date=${day}`}>All {n0(total)} on Latest results →</Link></p>}</>}
      </>}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ coming up this week
/** "Industry not set" with the level that is known underneath (pack B2; the provider's "X (broad group)" never shows). */
function ComingIndustry({ name }: { name: string | null | undefined }) {
  const nse = useNseName(), x = industryLines(name);
  if (x.set) return <>{nse(x.main)}</>;
  return <span className="rsc-ind-ns"><b>{x.main}</b><small title={x.under === "No NSE classification" ? "This company is not in NSE's classification lists" : "Only this higher NSE level is known for the company"}>{x.under}</small></span>;
}

export function ComingUp({ resp, inds, dueMine, followed, mine, locked }: { resp: QResp | undefined; inds: IndustrySoFar[]; dueMine: number; followed: { held: number; watched: number }; mine: Set<string>; locked: boolean }) {
  const rows = (resp?.rows ?? []) as VRow[], days = useMemo(() => { const m = new Map<string, number>(); for (const d of resp?.days ?? []) m.set(d.date, d.n); return [...m].map(([date, n]) => ({ date, n })); }, [resp]);
  const by = new Map(inds.map((x) => [x.name, x]));
  const shown = rows.slice(0, 14).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (b.marketCap ?? 0) - (a.marketCap ?? 0));   // the largest due, then by day as the sub-title says
  const cards = weekCards(dueMine, followed, days, rows), total = resp?.total ?? 0;
  // task #224 (A1): every heading of the week table sorts
  const indOf = (r: VRow) => (industryLines(r.industry).set ? by.get(r.industry ?? "") : undefined);
  const { sorted: weekRows, sort, toggle } = useTableSort(shown, (r: VRow, k: string): SortVal => {
    const x = indOf(r);
    return ({ day: r.date, company: r.symbol, industry: r.industry, size: r.cap, mcap: r.marketCap || null, sofar: x && x.companies ? x.declared / x.companies : null, typ: x?.medianProfitYoY ?? null } as Record<string, SortVal>)[k];
  });
  const H = (k: string, l: React.ReactNode, cls?: string, after?: React.ReactNode) => <SortTh k={k} label={l} sort={sort} onSort={toggle} className={cls} after={after} />;
  return (
    <Section id="rs-week" title={`Coming up this week · ${n0(total)} ${total === 1 ? "company" : "companies"}`} help="Coming up this week. Every company whose board meets on results in the next seven days, as announced to the exchanges: the same companies the calendar shows as due."
      sub={`The largest companies due, by day. The last two columns show how their industry has done so far: a yardstick for what to expect.${total > shown.length ? ` The ${shown.length} largest of ${n0(total)} are listed.` : ""}`}
      right={<Link to="/results/quarter?status=due" className="sp-link">See all {n0(total)} →</Link>}>
      {!resp ? <div className="sx-skel" style={{ height: 120 }} role="status" aria-label="Loading the week ahead" /> : !shown.length ? <p className="sp-empty">No board meetings on results are announced for the next seven days.</p> : <>
        {cards.length > 0 && <div className="rsc-cards">{cards.length > 1 && <div className="rsc-openall"><OpenAll scope="rsc-week" n={cards.length} /></div>}<DashCards items={cards} scope="rsc-week" /></div>}
        <Scroll label="results due this week"><table className="sp-tb rs-t kit-grid rsc-week-t">
          <colgroup><col style={{ width: 112 }} /><col /><col style={{ width: 200 }} /><col style={{ width: 72 }} /><col style={{ width: 120 }} /><col style={{ width: 230 }} /><col style={{ width: 150 }} /></colgroup>
          <thead><tr>{H("day", "Day")}{H("company", "Company")}{H("industry", "Industry")}{H("size", "Size", undefined, <Tip text={`FinLit's four sizes, by market value: ${SIZE_RULE_TEXT}.`} />)}
            {H("mcap", "Market value", "r", <Tip text="Market value. The price of one share times the number of shares: what the whole company is worth on the stock market." />)}
            {H("sofar", "Industry so far", undefined, <Tip text="So far. How many of the industry's companies have already declared this quarter. The picture can change as more of them report." />)}
            {H("typ", "Typical profit growth", "r", <Tip text="The middle company of the industry's declared results (the median), net profit against a year ago. Green above +0.5%, red below −0.5%, grey between." />)}</tr></thead>
          <tbody>{weekRows.map((r) => {
            const x = industryLines(r.industry).set ? by.get(r.industry ?? "") : undefined;
            const v = x?.medianProfitYoY;
            return <tr key={r.symbol}><td className="rs-day">{dayShort(r.date)}</td>
              <td><Link to={`/stocks/${r.symbol}`} className="ip-sym"><CoLogo symbol={r.symbol} name={r.name} size={22} inline /><span><b title={coTitle(r)}>{titleOf(r)}</b><small>{subLine(r, r.name)}</small></span></Link>{mine.has(r.symbol) && <em className="rp-yours"> · Yours</em>}
                {r.hasNumbers && <small className="rsc-early" title="The company's figures for the quarter are already filed, ahead of the board-meeting date it announced">Figures already filed</small>}</td>
              <td className="rs-ind"><ComingIndustry name={r.industry} /></td><td>{r.cap ?? <span className="sp-nil" title="The size follows the market value, which is not known for this company yet">–</span>}</td><td className="r">{!r.marketCap ? <span className="sp-nil" title="No market value is known for this company yet (no traded price in our data)">–</span> : `₹${n0(Math.round(r.marketCap))} Cr`}</td>
              <td className="rs-sofar">{x && x.companies ? <span className="rsc-sofar"><i aria-hidden="true"><u style={{ width: `${Math.min(100, (x.declared / x.companies) * 100)}%` }} /></i>{n0(x.declared)} of {n0(x.companies)} reported</span> : <span className="sp-nil">Too few results to compare yet</span>}</td>
              <td className="r">{v != null ? <span className={"rsc-chip " + growthTone(v)}>{sp(v)}</span> : x && locked ? <span className="sp-nil" title="The industry's typical growth is part of the Silver plan">Silver plan</span> : <span className="sp-nil" title={x ? "Too few of the industry's results have figures yet" : "No industry to compare with"}>—</span>}</td></tr>;
          })}</tbody>
        </table></Scroll>
      </>}
    </Section>
  );
}
export { monthName };
