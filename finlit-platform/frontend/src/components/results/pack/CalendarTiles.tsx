// The Results calendar's four tiles (task #193, 15 Nov pack, README "The four calendar tiles"): Declared so far, Due in the next 7 days, Your companies and Last
// full day, each with a dropdown (components/DropTile), and the one line under them that keeps the quarter in view. The quarter's own figures moved to Latest
// results. Every count is the server's (GET /api/results/quarter and /api/results/calendar); this file only lays them out. Describes; never advice.
import { Link } from "react-router";
import { DropTile } from "../../DropTile";
import { addDays, useQuarterResults, type QResp } from "../../../lib/qresults";
import { dayShort, longDate, VERDICTS, type VSummary } from "../../../lib/resultsPack";
import { byDayLine, declaredByWeek, dueDays, lastDayLine, quarterLine, yoursTile, type CalDayOut } from "../../../lib/resultsCalendar";

const n0 = (v: number) => v.toLocaleString("en-IN");
const nameOf = (r: { symbol: string; name: string }) => (/^\d+$/.test(r.symbol) ? r.name : r.symbol);

export function CalendarTiles({ kpi, ahead, week, lastDay, lastResp, mine, today }: {
  kpi: QResp | undefined; ahead: CalDayOut[] | undefined; week: QResp | undefined; lastDay: string | null; lastResp: QResp | undefined;
  mine: { held: number; followed: number; reported: number; inQuarter: number; dueWeek: number; signedIn: boolean }; today: string;
}) {
  const sizes = { Large: useQuarterResults({ limit: 1, cap: "Large" }), Mid: useQuarterResults({ limit: 1, cap: "Mid" }), Small: useQuarterResults({ limit: 1, cap: "Small" }), Micro: useQuarterResults({ limit: 1, cap: "Micro" }) };
  if (!kpi?.quarter) return <div className="sx-skel sp-sec" role="status" aria-label="Loading the calendar's tiles" />;
  const t = kpi.totals as VSummary, q = kpi.quarter, locked = !!kpi.locked;
  const share = t.companies ? (t.declared / t.companies) * 100 : 0, still = t.companies - t.declared;
  const weeks = declaredByWeek(kpi.days ?? [], today), weekSum = weeks.reduce((a, w) => a + w.n, 0), early = Math.max(0, t.declared - weekSum);
  const tomorrow = addDays(today, 1), end = addDays(today, 7);
  const due = dueDays(ahead ?? [], tomorrow, end), dueN = due.reduce((a, d) => a + d.n, 0), after = (ahead ?? []).filter((d) => d.due && d.date > end).sort((a, b) => a.date.localeCompare(b.date))[0];
  const weekRows = ((week?.rows ?? []) as { symbol: string; name: string; date: string; marketCap: number | null }[]);
  const namesOn = (d: string) => weekRows.filter((r) => r.date === d).sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)).map(nameOf);
  const { reported, inQuarter } = mine;
  const y = yoursTile(mine.held, mine.followed, reported, inQuarter, mine.dueWeek);
  const lastTotal = lastResp?.total ?? 0, lastSum = lastResp?.summary as VSummary | undefined, ld = lastDayLine(lastSum?.verdicts, lastTotal, lastSum?.withNumbers ?? 0);
  const upd = kpi.updatedAt ? new Date(kpi.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : null;
  const qMonth = new Date(q.periodEnd + "T00:00:00Z").toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" });
  return (
    <section className="rsc-tiles-sec" aria-label="The calendar at a glance">
      <div className="rsc-tiles">
        <DropTile testId="tile-declared" label="Declared so far" accent="green" tone={share >= 90 ? "good" : "mixed"} value={n0(t.declared)} unit={`of ${n0(t.companies)}`}
          bar={<span className="rsc-bar" aria-hidden="true"><u style={{ width: `${Math.min(100, share)}%` }} /></span>}
          sub={`${share >= 99.95 || share < 0.05 ? Math.round(share) : share.toFixed(1)}% in · ${n0(still)} still due`} moreLabel="By size and week"
          more={<>
            <table><thead><tr><th>Size</th><th className="r">Declared</th><th className="r">Of</th></tr></thead>
              <tbody>{(["Large", "Mid", "Small", "Micro"] as const).map((k) => { const s = sizes[k].data?.totals; return <tr key={k}><td>{k}</td><td className="r">{s ? n0(s.declared) : "…"}</td><td className="r">{s ? n0(s.companies) : "…"}</td></tr>; })}</tbody></table>
            <table><thead><tr><th>Week</th><th className="r">Declared</th></tr></thead>
              <tbody>{weeks.map((w) => <tr key={w.label}><td>{w.label}</td><td className="r">{n0(w.n)}</td></tr>)}
                {early > 0 && <tr><td title="Their figures are filed although the board-meeting date they announced is still to come">Filed ahead of their date</td><td className="r">{n0(early)}</td></tr>}</tbody></table>
            <p>Sizes by market value: Large above ₹75,000 Cr, Mid ₹25,000 to 75,000 Cr, Small ₹10,000 to 25,000 Cr, Micro below ₹10,000 Cr. A company counts as declared once its board-meeting date has passed or its figures are filed.</p>
          </>} />
        <DropTile testId="tile-due" label="Due in the next 7 days" accent="blue" value={n0(dueN)} unit={dueN === 1 ? "company" : "companies"}
          sub={due.length ? byDayLine(due) : "No board meetings on results are announced for the next 7 days."} moreLabel="Who and when"
          more={<>
            {due.length > 0 && <table><thead><tr><th>Day</th><th>Company</th></tr></thead>
              <tbody>{due.map((d) => { const names = namesOn(d.date); return <tr key={d.date}><td>{dayShort(d.date)}</td><td>{(names.length ? names : d.names).join(", ")}{!names.length && d.n > d.names.length ? ` and ${n0(d.n - d.names.length)} more` : ""}</td></tr>; })}</tbody></table>}
            <p>{after ? <>After that: {dayShort(after.date)} · {after.names.join(", ")}{after.n > after.names.length ? ` and ${n0(after.n - after.names.length)} more` : ""}.</> : "No later board-meeting date on results is announced yet."}</p>
          </>} />
        <DropTile testId="tile-yours" label="Your companies" accent={y.tone === "good" ? "green" : "gold"} tone={y.tone} value={y.value} unit={y.unit} sub={y.sub} moreLabel="What this means"
          more={mine.held + mine.followed ? <>
            <p>{reported >= inQuarter && inQuarter ? `Every company in your portfolio and watchlist with a ${qMonth} quarter date has declared.` : `${n0(reported)} of the ${n0(inQuarter)} companies in your portfolio and watchlist with a ${qMonth} quarter date have declared; ${n0(inQuarter - reported)} ${inQuarter - reported === 1 ? "is" : "are"} still to come.`}{mine.held + mine.followed > inQuarter ? ` ${n0(mine.held + mine.followed - inQuarter)} of yours ${mine.held + mine.followed - inQuarter === 1 ? "has" : "have"} no date announced for this quarter yet.` : ""}</p>
            <p>{mine.signedIn ? <>Their results are in <Link to="/results/quarter?scope=portfolio">Latest results, filtered to yours →</Link>.</> : <>Their results are in <Link to="/results/quarter">Latest results</Link>; <Link to="/login">sign in</Link> to filter it to yours.</>} Turn on "Only my watchlist" on the calendar to see only your dates.</p>
          </> : <p>{mine.signedIn ? "Add shares to your equity portfolio or a watchlist; their result dates then show here and are marked in the calendar." : <><Link to="/login">Sign in</Link> and add shares to your portfolio or a watchlist; their result dates then show here.</>}</p>} />
        <DropTile testId="tile-last" label={lastDay ? `Last full day · ${dayShort(lastDay).toUpperCase()}` : "Last full day"} accent="gold" value={lastDay ? n0(lastTotal) : "–"} unit="declared"
          bar={ld && lastTotal ? <span className="rsc-vbar" aria-hidden="true">{ld.parts.filter((p) => p.n).map((p) => <u key={p.k} className={"rs-v-" + p.k.toLowerCase().replace(" ", "")} style={{ flexGrow: p.n }} />)}{lastTotal - (lastSum?.withNumbers ?? 0) > 0 && <u className="rsc-vnone" style={{ flexGrow: lastTotal - (lastSum?.withNumbers ?? 0) }} />}</span> : undefined}
          sub={!lastDay ? "No day with results yet this quarter." : ld ? ld.sub : locked ? "The verdicts open with Silver." : `${n0(lastSum?.withNumbers ?? 0)} with figures so far`} moreLabel="Verdicts"
          more={ld ? <table><thead><tr><th>Verdict</th><th className="r">Companies</th></tr></thead>
              <tbody>{VERDICTS.map((v) => <tr key={v}><td><span className={"rs-v rs-v-" + v.toLowerCase().replace(" ", "")}>{v}</span></td><td className="r">{n0(lastSum!.verdicts![v])}</td></tr>)}
                <tr><td>No figures yet</td><td className="r">{n0(Math.max(0, lastTotal - (lastSum?.withNumbers ?? 0)))}</td></tr></tbody></table>
            : <p>{locked ? <>Each result's verdict against its industry is part of the Silver plan. <Link to="/plans">See plans</Link>.</> : "No verdicts yet: the day's figures are still coming in."}</p>} />
      </div>
      <p className="rsc-qline">{quarterLine(q.fiscal, t, locked)} <Link to="/results/quarter" className="sp-link">See the quarter on Latest results →</Link></p>
      <p className="rsc-upd">{upd ? `Updated ${upd} IST. ` : ""}Dates are the board-meeting dates announced to the exchanges. Quarter ended {longDate(q.periodEnd)}.</p>
    </section>
  );
}
