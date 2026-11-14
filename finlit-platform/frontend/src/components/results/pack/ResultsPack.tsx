// The Results calendar (and the shared top of Latest results) as the "FinLit final pages" pack draws them (docs/design/finlit-final-pages/10 and 11): the header with
// the Calendar / Industries / Companies switch, six KPI tiles, the month calendar with each day's declared or due count, one day's declared results with their verdicts,
// and the week ahead with each company's industry so far. Figures and verdicts are the server's (GET /api/results/quarter); words from lib/resultsPack. Never advice.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { CoLogo } from "../../CoLogo";
import { Cards, Scroll, Section, Tip } from "../../sectors/pack/Common";
import { LockedBlock } from "../../sectors/Parts";
import { dayCards, dayShort, kpiTiles, longDate, monthName, soFar, sp, VERDICTS, weekCards, type IndustrySoFar, type VRow, type VSummary, type Verdict, type Check } from "../../../lib/resultsPack";
import type { QResp } from "../../../lib/qresults";
import { short } from "../../../lib/pulsePack";

const n0 = (v: number) => v.toLocaleString("en-IN");
const cr = (v: number | null | undefined) => (v == null ? "–" : Math.abs(v) >= 100 ? n0(Math.round(v)) : v.toFixed(1));
const tone = (v: number | null | undefined) => (v == null ? "" : v > 0 ? "sp-good" : v < 0 ? "sp-red" : "");

// ------------------------------------------------------------------------------------------------ header, view switch and tiles
export type ResView = "calendar" | "industries" | "companies";
export function ResultsHead({ title, desc, links, view }: { title: string; desc: string; links: [string, string][]; view: ResView }) {
  const to: Record<ResView, string> = { calendar: "/results", industries: "/results/quarter?view=industries", companies: "/results/quarter" };
  return (
    <header className="sp-head rs-head">
      <p className="sp-eyebrow">Markets · Results</p>
      <h1>{title}</h1>
      <p className="sp-desc">{desc}</p>
      <div className="sp-head-bar">
        <nav className="rs-links" aria-label="Related pages">{links.map(([href, label]) => <Link key={href} to={href} className="sp-link">{label} →</Link>)}</nav>
        <div className="sp-view" role="group" aria-label="View"><span>View</span>
          {(["calendar", "industries", "companies"] as const).map((v) => <Link key={v} to={to[v]} className={"sp-vbtn" + (view === v ? " on" : "")} aria-current={view === v ? "page" : undefined}>{v === "calendar" ? "Calendar" : v === "industries" ? "Industries" : "Companies"}</Link>)}
        </div>
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
    <section className="sp-sec" aria-labelledby="rs-cal">
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
export function ResultsTable({ rows, label, mine }: { rows: VRow[]; label: string; mine?: Set<string> }) {
  return (
    <Scroll label={label}><table className="sp-tb rs-t">
      <thead>
        <tr className="rp-bands"><th colSpan={3} /><th colSpan={3} className="rp-band"><span>Revenue<Tip text={YOY} /></span></th><th colSpan={3} className="rp-band"><span>Net profit<Tip text={YOY} /></span></th><th colSpan={2} className="rp-band"><span>Profit margin<Tip text="Margin change. Net profit as a share of revenue, compared with a year ago, in percentage points. Up means each ₹100 of sales left more profit." /></span></th><th className="rp-band"><span>Vs its industry<Tip text={HOW_JUDGED} /></span></th></tr>
        <tr><th scope="col">Company</th><th scope="col">Industry</th><th scope="col">Size<Tip text="Company size. FinLit uses three sizes everywhere, by market value: Large above ₹50,000 Cr, Mid ₹10,000 to 50,000 Cr, Small below ₹10,000 Cr." /></th>
          <th scope="col" className="r">₹ Cr</th><th scope="col" className="r">YoY</th><th scope="col" className="r">QoQ</th><th scope="col" className="r">₹ Cr</th><th scope="col" className="r">YoY</th><th scope="col" className="r">QoQ</th><th scope="col" className="r">Now</th><th scope="col" className="r">Change</th><th scope="col">Verdict</th></tr>
      </thead>
      <tbody>{rows.map((r) => (
        <tr key={r.symbol}><td><Link to={`/stocks/${r.symbol}#quarter`} className="ip-sym"><CoLogo symbol={r.symbol} name={r.name} size={22} inline /><span><b>{r.symbol}</b><small>{r.name}</small></span></Link>{mine?.has(r.symbol) && <em className="rp-yours"> · Yours</em>}</td>
          <td className="rs-ind">{r.industry ? short(r.industry) : r.sector ?? "–"}</td><td>{r.cap ?? "–"}</td>
          <td className="r">{cr(r.revenue)}</td><td className={"r " + tone(r.revenueYoY)}>{sp(r.revenueYoY)}</td><td className={"r " + tone(r.revenueQoQ)}>{sp(r.revenueQoQ)}</td>
          <td className="r">{r.loss ? <span className="sp-red">{cr(r.netProfit)}</span> : cr(r.netProfit)}</td><td className={"r " + tone(r.profitYoY)}>{r.loss && r.profitYoY == null ? "loss" : sp(r.profitYoY)}</td><td className={"r " + tone(r.profitQoQ)}>{sp(r.profitQoQ)}</td>
          <td className="r">{r.npm == null ? "–" : `${r.npm.toFixed(1)}%`}</td><td className={"r " + tone(r.npmChange)}>{sp(r.npmChange)}</td><td><VerdictCell r={r} /></td></tr>))}</tbody>
    </table></Scroll>
  );
}

// ------------------------------------------------------------------------------------------------ one day's declared results
export function DayResults({ day, resp, week, locked, mine }: { day: string; resp: QResp | undefined; week: { date: string; n: number }[]; locked: boolean; mine: Set<string> }) {
  const [f, setF] = useState<"all" | Verdict>("all"), [all, setAll] = useState(false);
  const rows = (resp?.rows ?? []) as VRow[], counts = (resp?.summary as VSummary | undefined)?.verdicts ?? null, total = resp?.total ?? 0;
  const shown = useMemo(() => rows.filter((r) => f === "all" || r.verdict === f), [rows, f]);
  const past = day <= (resp?.today ?? day);
  return (
    <section className="sp-sec" aria-labelledby="rs-day">
      <h2 id="rs-day">{dayShort(day)} · {n0(total)} {total === 1 ? "company" : "companies"} {past ? "declared" : "due"}</h2>
      <p className="sp-sub">Biggest companies first. Each verdict compares the company with similar companies in its industry.</p>
      {!resp ? <div className="sx-skel" style={{ height: 120 }} role="status" aria-label="Loading the day's results" /> : !total ? <p className="sp-empty">No company declared on this day.</p> : <>
        {counts && <div className="sp-filters" role="group" aria-label="Show">
          <button type="button" className={"sp-fbtn" + (f === "all" ? " on" : "")} aria-pressed={f === "all"} onClick={() => setF("all")}>All {n0(total)}</button>
          {VERDICTS.map((v) => <button key={v} type="button" className={"sp-fbtn rs-fv-" + v.toLowerCase().replace(" ", "") + (f === v ? " on" : "")} aria-pressed={f === v} disabled={!counts[v]} onClick={() => setF(v)}>{v} · {counts[v]}</button>)}
        </div>}
        <Cards items={dayCards(rows, counts, total, day, week)} />
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
export function ComingUp({ resp, inds, dueMine, followed, mine }: { resp: QResp | undefined; inds: IndustrySoFar[]; dueMine: number; followed: { held: number; watched: number }; mine: Set<string> }) {
  const rows = (resp?.rows ?? []) as VRow[], days = useMemo(() => { const m = new Map<string, number>(); for (const d of resp?.days ?? []) m.set(d.date, d.n); return [...m].map(([date, n]) => ({ date, n })); }, [resp]);
  const by = new Map(inds.map((x) => [x.name, x]));
  const shown = rows.slice(0, 14).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (b.marketCap ?? 0) - (a.marketCap ?? 0));   // the largest due, then by day as the sub-title says
  return (
    <Section id="rs-week" title={`Coming up this week · ${n0(resp?.total ?? 0)} companies`} help="Coming up this week. The companies whose board meets on results in the next seven days, as announced to the exchanges."
      sub={`The ${shown.length} largest companies due, by day. The last column shows how their industry has done so far: a yardstick for what to expect.`}
      right={<Link to="/results/quarter?status=due" className="sp-link">See all {n0(resp?.total ?? 0)} →</Link>}>
      {!resp ? <div className="sx-skel" style={{ height: 120 }} role="status" aria-label="Loading the week ahead" /> : !shown.length ? <p className="sp-empty">No board meetings on results are announced for the next seven days.</p> : <>
        <Cards items={weekCards(dueMine, followed, days, rows)} />
        <Scroll label="results due this week"><table className="sp-tb rs-t">
          <thead><tr><th scope="col">Day</th><th scope="col">Company</th><th scope="col">Industry</th><th scope="col">Size<Tip text="FinLit's three sizes, by market value: Large above ₹50,000 Cr, Mid ₹10,000 to 50,000 Cr, Small below ₹10,000 Cr." /></th>
            <th scope="col" className="r">Market value<Tip text="Market value. The price of one share times the number of shares: what the whole company is worth on the stock market." /></th><th scope="col">Its industry so far<Tip text="So far. Counts only the companies of the industry that have already declared this quarter. The picture can change as more of them report." /></th></tr></thead>
          <tbody>{shown.map((r) => <tr key={r.symbol}><td className="rs-day">{dayShort(r.date)}</td>
            <td><Link to={`/stocks/${r.symbol}`} className="ip-sym"><CoLogo symbol={r.symbol} name={r.name} size={22} inline /><span><b>{r.symbol}</b><small>{r.name}</small></span></Link>{mine.has(r.symbol) && <em className="rp-yours"> · Yours</em>}</td>
            <td className="rs-ind">{r.industry ? short(r.industry) : r.sector ?? "–"}</td><td>{r.cap ?? "–"}</td><td className="r">{r.marketCap == null ? "–" : `₹${n0(Math.round(r.marketCap))} Cr`}</td><td className="rs-sofar">{soFar(by.get(r.industry ?? ""))}</td></tr>)}</tbody>
        </table></Scroll>
      </>}
    </Section>
  );
}
export { monthName };
