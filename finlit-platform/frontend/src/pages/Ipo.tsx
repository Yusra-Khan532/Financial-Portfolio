// IPO calendar (/ipo), compact layout (task #307, developer file 17 v2, 22 Nov 2026): one KPI strip, a toolbar (search, Status, Board, All IPOs), then
// Open now → Upcoming → Closed, listing soon (cards with the same fields in the same order) → Next seven weeks → What GMP said vs what actually listed
// (closed until opened) → Listed (the last 30 days as a table; a search or Status = Listed lists every match, 25 at a time) → the as-of line.
// For information only; the offer document is the authoritative source. Describes; never advises.
import { PageHeader } from "../components/PageHeader";
import { CalendarSync } from "../components/CalendarSync";   // task #297: Add to Google Calendar
import { Link } from "react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import { issuePriceOf, listingGain, listingMove, minInvest, useIpos, type Ipo } from "../lib/ipo";
import { gRange, listedRecently, sectionOrder, shortName, titleCase } from "../lib/ipoCalendar";
import { asOf, IpoDrawer } from "./IpoDrawer";
import { MINUS, nf } from "../lib/format";
import { ChartHelp } from "../components/ChartHelp";
import { ChartZoom } from "../components/ChartZoom";
import { GmpRecord, GSTATE0, type GState } from "../components/ipo/GmpRecord";
import { Chips, Dd, Ico, OptList } from "../discovery/Toolbar";
import "../discovery/discover.css";
import "../styles/ipo-all.css";
import "../styles/ipo-calendar.css";

const DAY = 86_400_000;
const d0 = (iso: string) => new Date(iso + "T00:00:00").getTime();
const short = (iso: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—");
const full = (iso: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : MINUS);
const STATUS: Record<Ipo["status"], { label: string; colour: string }> = { open: { label: "Open now", colour: "var(--gain)" }, upcoming: { label: "Upcoming", colour: "var(--k1)" }, closed: { label: "Closed", colour: "var(--k4)" }, listed: { label: "Listed", colour: "var(--k7)" } };
const money = (v: number) => "₹" + nf(v, v % 1 ? 2 : 0);
const signedPct = (v: number) => (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(Math.abs(v), 1) + "%";
type StatusF = "all" | Ipo["status"];
type BoardF = "all" | "mainboard" | "sme";
const STATUS_OPTS: [StatusF, string][] = [["all", "All"], ["open", "Open now"], ["upcoming", "Upcoming"], ["closed", "Closed, listing soon"], ["listed", "Listed"]];
const BOARD_OPTS: [BoardF, string][] = [["all", "All boards"], ["mainboard", "Mainboard"], ["sme", "SME"]];
const TABLE_ICON = <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" /></svg>;

/** A two-month strip: every issue is a bar from its opening to its closing day, so overlaps and quiet weeks are obvious. */
function Strip({ rows }: { rows: Ipo[] }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = today.getTime() - 10 * DAY, span = 50 * DAY;
  const x = (t: number) => Math.max(0, Math.min(100, ((t - start) / span) * 100));
  const show = rows.filter((r) => d0(r.closeDate) >= start && d0(r.openDate) <= start + span).sort((a, b) => d0(a.openDate) - d0(b.openDate)).slice(0, 8);
  const days = Array.from({ length: 11 }, (_, i) => start + i * 5 * DAY);
  return (
    <ChartZoom label={"Open and upcoming issues timeline"} className="cz-top">
    <div className="ipo-strip p4-strip" role="img" aria-label="Timeline of open and upcoming issues">
      <div className="ipo-axis">{days.map((t) => <span key={t} style={{ left: `${x(t)}%` }}>{new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>)}</div>
      <div className="ipo-rows">
        <i className="ipo-today" style={{ left: `${x(today.getTime())}%` }}><b>Today</b></i>
        {show.length ? show.map((r) => (
          <div className="ipo-row" key={r.id}><span className="ipo-bar" style={{ left: `${x(d0(r.openDate))}%`, width: `${Math.max(1.6, x(d0(r.closeDate) + DAY) - x(d0(r.openDate)))}%`, background: STATUS[r.status].colour }} title={`${titleCase(r.name)}: ${short(r.openDate)} to ${short(r.closeDate)}`} />
            <em style={{ left: `${Math.min(x(d0(r.closeDate) + DAY) + 1, 70)}%` }}>{shortName(r.name)}</em></div>)) : <p className="muted" style={{ padding: "18px 4px" }}>No issues in this window.</p>}
      </div>
    </div>
    </ChartZoom>
  );
}

/** One card: the same fields in the same order for every issue; a field with no value shows a grey "—", so every card has the same shape. */
function Card({ r, onOpen, onGmp }: { r: Ipo; onOpen: () => void; onGmp: (r: Ipo) => void }) {
  const st = STATUS[r.status], mv = r.status === "listed" ? listingMove(r) : null, sub = r.details?.subscription?.overall, gmp = r.details?.gmp, mi = minInvest(r);
  const band = r.priceHigh == null ? null : r.priceLow != null && r.priceLow !== r.priceHigh ? `${money(r.priceLow)} – ${money(r.priceHigh)}` : money(r.priceHigh);
  const cells: { k: string; v: string | null; cls?: string; extra?: React.ReactNode }[] = [
    { k: "Opens", v: short(r.openDate) }, { k: "Closes", v: short(r.closeDate) }, { k: "Lists", v: r.listingDate ? short(r.listingDate) : null },
    { k: r.priceLow != null && r.priceLow === r.priceHigh ? "Issue price" : "Price band", v: band }, { k: "Lot size", v: r.lotSize ? `${nf(r.lotSize, 0)} shares` : null },
    { k: "Minimum investment", v: mi != null ? "₹" + nf(mi, 0) : null }, { k: "Issue size", v: r.issueSizeCr != null ? `₹${nf(r.issueSizeCr, 0)} Cr` : null },
    { k: "Times subscribed", v: sub != null ? nf(sub, 2) + "x" : null },
  ];
  if (r.status === "listed") cells.push({ k: "Listed vs issue price", v: mv ? (mv.pct >= 0 ? "▲ +" : "▼ " + MINUS) + nf(Math.abs(mv.pct), 1) + "%" : null, cls: mv ? (mv.pct >= 0 ? "up" : "down") : undefined });
  else cells.push({ k: "Latest GMP (unofficial)", v: gmp ? `₹${nf(gmp.rupees, gmp.rupees % 1 ? (Math.abs(gmp.rupees) < 10 ? 2 : 1) : 0)} · ${signedPct(gmp.pct)}` : null,
    extra: gmp ? <button type="button" className="p4-gl" onClick={() => onGmp(r)}>How close GMP came ↓</button> : null });
  const meta = [r.sector, r.kind === "sme" ? "SME" : "Mainboard", r.details?.exchange?.join(" / "), r.symbol].filter(Boolean).join(" · ");
  const name = titleCase(r.name);
  return (
    <article className="card ui-card ui-card--sm ipo-c p4-ic" style={{ "--tc": st.colour } as React.CSSProperties}>
      <div className="ipo-h"><div><h3>{name}</h3><p>{meta}</p></div><span className="ipo-st"><i />{st.label}</span></div>
      <dl className="ipo-d p4-d">{cells.map((c) => <div key={c.k} className={c.v == null ? "na" : undefined}><dt>{c.k}</dt><dd className={c.cls || ""}>{c.v ?? "—"}{c.extra}</dd></div>)}</dl>
      <div className="ipo-foot"><button type="button" className="ipo-more" onClick={onOpen} aria-label={`Details: ${name}`}>Details →</button>{r.recordId ? <Link className="ipo-more" to={`/ipo/${r.recordId}`} aria-label={`Full IPO report: ${name}`}>Full report ↗</Link> : null}</div>
    </article>
  );
}

/** Listed issues as a table: company (board and sector), listed, issue price, issue size, subscribed, GMP said, at listing (with the listing price), details. */
function ListedTable({ rows, onOpen }: { rows: Ipo[]; onOpen: (r: Ipo) => void }) {
  return (
    <div className="p4-tw"><table className="ia-t p4-lt"><caption className="sr-only">Listed issues, newest listing first</caption>
      <thead><tr><th scope="col">Company</th><th scope="col">Listed</th><th scope="col" className="r">Issue price</th><th scope="col" className="r">Issue size</th><th scope="col" className="r">Subscribed</th><th scope="col" className="r">GMP said</th><th scope="col" className="r">At listing</th><th scope="col"><span className="sr-only">Details</span></th></tr></thead>
      <tbody>{rows.map((r) => {
        const mv = listingMove(r), g = r.details?.gmp, ip = issuePriceOf(r), sub = r.details?.subscription?.overall, name = shortName(r.name);
        return (
          <tr key={r.id}>
            <th scope="row">{r.recordId ? <Link to={`/ipo/${r.recordId}`}>{name}</Link> : name}<small>{[r.kind === "sme" ? "SME" : "Mainboard", r.sector].filter(Boolean).join(" · ")}</small></th>
            <td>{full(r.listingDate)}</td>
            <td className="r">{ip != null ? money(ip) : MINUS}</td>
            <td className="r">{r.issueSizeCr != null ? `₹${nf(r.issueSizeCr, r.issueSizeCr >= 100 ? 0 : 2)} Cr` : MINUS}</td>
            <td className="r">{sub != null ? nf(sub, 2) + "x" : MINUS}</td>
            <td className="r">{g ? signedPct(g.pct) : MINUS}</td>
            <td className={"r" + (mv ? (mv.pct > 0 ? " up" : mv.pct < 0 ? " down" : "") : "")}>{mv ? signedPct(mv.pct) : MINUS}{mv ? <small>{money(mv.listing)}</small> : null}</td>
            <td className="r"><button type="button" className="p4-lk" onClick={() => onOpen(r)} aria-label={`Details: ${name}`}>Details</button></td>
          </tr>);
      })}</tbody></table></div>
  );
}

export function IpoPage() {
  useDocTitle("IPO calendar", "Open, upcoming and recently listed IPOs in India: dates, price band, lot size, minimum investment and listing price against issue price.");
  const { data, isLoading, isError } = useIpos();
  const [f, setF] = useState<StatusF>("all");
  const [kind, setKindRaw] = useState<BoardF>("all");
  const [q, setQ] = useState("");
  const [listedShown, setListedShown] = useState(25);
  const [open, setOpen] = useState<Ipo | null>(null);
  const [gm, setGm] = useState<GState>(GSTATE0);
  const [gmOpen, setGmOpen] = useState(false);
  const [goRow, setGoRow] = useState(0);                                  // bumped by "How close GMP came ↓": scroll to the highlighted row once it is drawn
  const setGmP = useCallback((p: Partial<GState>) => setGm((s) => ({ ...s, ...p })), []);
  const closeDrawer = useCallback(() => setOpen(null), []);
  const setKind = (k: BoardF) => { setKindRaw(k); setGmP({ board: k }); };   // the toolbar's Board also sets the GMP section's Board
  const rows = useMemo(() => data || [], [data]);
  const by = (s: Ipo["status"]) => rows.filter((r) => r.status === s);
  const qq = q.trim().toLowerCase();
  const pass = (r: Ipo) => (f === "all" || r.status === f) && (kind === "all" || r.kind === kind) && (!qq || r.name.toLowerCase().includes(qq));
  const shown = rows.filter(pass);
  const sec = (s: Ipo["status"]) => shown.filter((r) => r.status === s).sort(sectionOrder(s));
  const recent = rows.filter((r) => listedRecently(r));
  const avgGain = (() => { const g = recent.map(listingGain).filter((v): v is number => v != null); return g.length ? g.reduce((a, b) => a + b, 0) / g.length : null; })();
  const cntS = (s: StatusF) => rows.filter((r) => (s === "all" || r.status === s) && (kind === "all" || r.kind === kind)).length;
  const cntB = (b: BoardF) => rows.filter((r) => (f === "all" || r.status === f) && (b === "all" || r.kind === b)).length;
  const chips: [string, string][] = [];
  if (f !== "all") chips.push(["status", STATUS_OPTS.find((o) => o[0] === f)![1]]);
  if (kind !== "all") chips.push(["board", kind === "sme" ? "SME" : "Mainboard"]);
  if (qq) chips.push(["q", `“${q.trim()}”`]);
  const unset = (k: string) => { if (k === "status" || k === "all") setF("all"); if (k === "board" || k === "all") setKind("all"); if (k === "q" || k === "all") setQ(""); setListedShown(25); };
  const goGmp = (r: Ipo) => {
    const g = r.details?.gmp; if (!g) return;
    setGm((s) => ({ ...s, view: "range", board: r.kind, hl: gRange(g.pct), range: "", shown: 50 }));
    setGmOpen(true); setGoRow((n) => n + 1);
  };
  const gmpBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!goRow) return;
    const t = window.setTimeout(() => (gmpBox.current?.querySelector(".p4-grr.hl") ?? gmpBox.current)?.scrollIntoView?.({ behavior: "smooth", block: "center" }), 60);
    return () => window.clearTimeout(t);
  }, [goRow]);

  const stamp = asOf(rows.map((r) => r.updatedAt).filter((v): v is string => !!v).sort().pop());
  const fromProvider = rows.some((r) => r.source === "FinEdge");
  const listed = sec("listed");
  const every = !!qq || f === "listed";                                   // a search or Status = Listed lists every listed match, 25 at a time
  const listedRows = every ? listed.slice(0, listedShown) : listed.filter((r) => listedRecently(r));
  const activeSec = (s: Ipo["status"], title: string, hint?: string) => {
    const list = sec(s);
    return list.length ? (
      <section className="ipo-sec p4-sec" aria-label={title}>
        <h2 className="ipo-sec-h"><i style={{ background: STATUS[s].colour }} />{title} <span>{list.length}</span>{hint ? <small>{hint}</small> : null}</h2>
        <div className="ipo-list p4-il">{list.map((r) => <Card key={r.id} r={r} onOpen={() => setOpen(r)} onGmp={goGmp} />)}</div>
      </section>) : null;
  };
  return (
    <div className="wrap ipo p4">
      <PageHeader plan="free" title="IPO calendar" art="calendar" links={["/results", "/news", "/premium/markets"]} actions={<CalendarSync />}
        description={<>Issues that are <b>open, coming up and recently listed</b>. For information only; the offer document is the authoritative source.</>} />
      <dl className="dw-kpis p4-kpis" aria-label="IPO counts">
        {([["open", "Open now", by("open").length], ["upcoming", "Upcoming", by("upcoming").length], ["closed", "Closed, listing soon", by("closed").length], ["listed", "Listed in the last 30 days", recent.length]] as const).map(([k, l, n]) =>
          <div key={k} style={{ "--tc": STATUS[k].colour } as React.CSSProperties}><dt><i />{l}</dt><dd>{isLoading ? "—" : n}</dd></div>)}
        <div style={{ "--tc": "var(--k3)" } as React.CSSProperties}><dt><i />Avg listing vs issue, 30 days</dt><dd className={avgGain == null ? "" : avgGain >= 0 ? "up" : "down"}>{avgGain == null ? "—" : signedPct(avgGain)}</dd></div>
      </dl>
      <div className="p4-tools">
        <label className="dbx-q">{Ico.search}<input type="search" placeholder="Search a company" aria-label="Search IPOs" value={q} autoComplete="off" onChange={(e) => { setQ(e.target.value); setListedShown(25); }} /></label>
        <div className="dbx-dds">
          <Dd label="Status" value={f !== "all" ? STATUS_OPTS.find((o) => o[0] === f)![1] : ""}>{(close) => <OptList title="Status" items={STATUS_OPTS.map(([v, t]) => ({ v, t, c: cntS(v), sel: f === v }))} onPick={(v) => { setF(v as StatusF); setListedShown(25); close(); }} />}</Dd>
          <Dd label="Board" value={kind !== "all" ? (kind === "sme" ? "SME" : "Mainboard") : ""}>{(close) => <OptList title="Board" items={BOARD_OPTS.map(([v, t]) => ({ v, t, c: cntB(v), sel: kind === v }))} onPick={(v) => { setKind(v as BoardF); setListedShown(25); close(); }} />}</Dd>
        </div>
        <Link className="p4-tl" to="/ipo/all">{TABLE_ICON}All IPOs since 2020 →</Link>
      </div>
      <Chips chips={chips} unset={unset} />
      {isError && <div className="formerr">The calendar could not be loaded. Please try again shortly.</div>}
      {isLoading && <div className="skeleton" style={{ height: 240, marginTop: 20 }} role="status" aria-label="Loading the IPO calendar" />}
      {!isLoading && !isError && !rows.length && <div className="card dw-empty"><span className="dw-ei"><Icon name="calendar" /></span><b>No issues listed yet</b><p>The calendar is updated by the FinLit team. Check back soon.</p></div>}
      {activeSec("open", "Open now", "apply until the closing date")}
      {activeSec("upcoming", "Upcoming")}
      {activeSec("closed", "Closed, listing soon", "allotment and listing dates in each card")}
      {rows.length > 0 && (f === "all" || f === "open" || f === "upcoming" || f === "closed") && (
        <section className="card ipo-s p4-ts"><div className="card-h"><h3><span className="ci"><Icon name="calendar" /></span>Next seven weeks<ChartHelp id="ipo-timeline" /></h3><span className="s">Bar = application window</span></div>
          <Strip rows={rows.filter((r) => kind === "all" || r.kind === kind)} />
          <div className="clg">{(Object.keys(STATUS) as Ipo["status"][]).map((s) => <span key={s}><i style={{ background: STATUS[s].colour }} />{STATUS[s].label}</span>)}</div></section>)}
      {rows.length > 0 && <div ref={gmpBox}><GmpRecord ipos={rows} s={gm} set={setGmP} open={gmOpen} setOpen={setGmOpen} /></div>}
      {listed.length > 0 && (
        <section className="ipo-sec p4-sec" aria-label="Listed">
          <h2 className="ipo-sec-h"><i style={{ background: STATUS.listed.colour }} />Listed <span>{listed.length}</span><small>{every ? "newest first" : `${listedRows.length} in the last 30 days`}</small></h2>
          {listedRows.length ? <ListedTable rows={listedRows} onOpen={setOpen} /> : <p className="muted p4-pad">No listing in the last 30 days.</p>}
          {every && listed.length > listedShown && <div className="ia-more"><button type="button" className="ia-btn" onClick={() => setListedShown((n) => n + 25)}>Show {nf(Math.min(25, listed.length - listedShown), 0)} more</button><span className="muted">Showing {nf(listedShown, 0)} of {nf(listed.length, 0)}</span></div>}
          <Link className="p4-seeall" to="/ipo/all">See all {nf(listed.length, 0)} listed here, and every IPO since 2020, in All IPOs →</Link>
        </section>)}
      {rows.length > 0 && !shown.length && <p className="muted" style={{ padding: 24, textAlign: "center" }}>No issues match these filters.</p>}
      {rows.length > 0 && (stamp || fromProvider) && <p className="ipo-asof muted">{stamp && <>Data as of {stamp}</>}{stamp && fromProvider && " · "}{fromProvider && "Source: FinEdge"}</p>}
      {open && <IpoDrawer ipo={{ ...open, name: titleCase(open.name) }} chip={STATUS[open.status]} onClose={closeDrawer} />}
    </div>
  );
}
