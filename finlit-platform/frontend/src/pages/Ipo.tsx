// IPOs (/ipo), one page in place of the IPO calendar and All IPOs (task #329, developer file 29, 23 Nov 2026). The header (title, one description,
// the links, Add to Google Calendar and Learn more), the five counts, then the views bar (the company report's TabGroup: "⇆ 2 views", the two
// numbered views with a count each and "Showing: …"), sticking under the site header while the page scrolls (not on a phone):
//   1 Open and upcoming (?view=now, the default): search and filters, Open now → Upcoming → Closed, listing soon (cards with the same fields in the
//     same order, task #307) → Next seven weeks → What GMP said vs what actually listed (closed until opened) → Listed in the last 30 days (a table
//     whose seven columns sort, with "All N since 2020 →" opening the second view with Status = Listed) → the as-of line.
//   2 All IPOs since 2020 (?view=all plus its filter parameters): pages/IpoHistory.tsx, unchanged, with a one-line GMP summary.
// Both views stay mounted, so each keeps its filters, sort and rows loaded; the page keeps each view's scroll position. /ipo/all redirects here.
// Found while checking (the pack, 23 Nov): an issue 15 days or more past its close with no listing date is "not_listed" (backend ipoapi.settle): it
// leaves Closed, listing soon (and its count) and shows as Not listed in the second view. The first view has no Status filter: it is already grouped
// by status, so Board and search are enough.
// For information only; the offer document is the authoritative source. Describes; never advises.
import { PageHeader } from "../components/PageHeader";
import { CalendarSync } from "../components/CalendarSync";   // task #297: Add to Google Calendar
import { TabGroup } from "../components/TabGroup";
import { Link, useLocation, useSearchParams } from "react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import { issuePriceOf, listingGain, listingMove, minInvest, useIpos, type Ipo } from "../lib/ipo";
import { firstDir, gRange, listedRecently, LSORT_COLS, sectionOrder, shortName, sortListed, titleCase, type GRangeKey, type LSortKey } from "../lib/ipoCalendar";
import { rowFromCalendar, useIpoHistory } from "../lib/ipoHistory";
import { asOf, IpoDrawer } from "./IpoDrawer";
import { IpoAllView } from "./IpoHistory";
import { dateFormat, MINUS, nf } from "../lib/format";
import { ChartHelp } from "../components/ChartHelp";
import { ChartZoom } from "../components/ChartZoom";
import { GmpRecord, GSTATE0, type GState } from "../components/ipo/GmpRecord";
import { Chips, Dd, Ico, OptList } from "../discovery/Toolbar";
import "../discovery/discover.css";
import "../styles/ipo-all.css";
import "../styles/ipo-all-compact.css";
import "../styles/ipo-calendar.css";
import "../styles/ipo-views.css";

const DAY = 86_400_000;
const d0 = (iso: string) => new Date(iso + "T00:00:00").getTime();
const short = (iso: string | null) => (iso ? dateFormat({ day: "numeric", month: "short" }).format(new Date(iso + "T00:00:00")) : "—");
const full = (iso: string | null) => (iso ? dateFormat({ day: "numeric", month: "short", year: "numeric" }).format(new Date(iso + "T00:00:00")) : MINUS);
const STATUS: Record<Ipo["status"], { label: string; colour: string }> = { open: { label: "Open now", colour: "var(--gain)" }, upcoming: { label: "Upcoming", colour: "var(--k1)" }, closed: { label: "Closed", colour: "var(--k4)" }, listed: { label: "Listed", colour: "var(--k7)" },
  not_listed: { label: "Not listed", colour: "var(--muted)" } };
const LEGEND: Ipo["status"][] = ["open", "upcoming", "closed", "listed"];
const money = (v: number) => "₹" + nf(v, v % 1 ? 2 : 0);
const signedPct = (v: number) => (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(Math.abs(v), 1) + "%";
type BoardF = "all" | "mainboard" | "sme";
type View = "now" | "all";
const BOARD_OPTS: [BoardF, string][] = [["all", "All boards"], ["mainboard", "Mainboard"], ["sme", "SME"]];
/** "Showing: …" in the views bar, one line per view (the pack's words). */
export const SHOWING: Record<View, string> = { now: "Open, upcoming, about to list, and listed in the last 30 days", all: "Every mainboard and SME issue: listing, subscription, GMP and return since" };
/** The view the address asks for; otherwise Open and upcoming (rule 3). */
export const viewOf = (p: URLSearchParams): View => (p.get("view") === "all" ? "all" : "now");

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
function Card({ r, onOpen, onGmp, from }: { r: Ipo; onOpen: () => void; onGmp: (r: Ipo) => void; from: { from: string } }) {
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
      <div className="ipo-foot"><button type="button" className="ipo-more" onClick={onOpen} aria-label={`Details: ${name}`}>Details →</button>{r.recordId ? <Link className="ipo-more" to={`/ipo/${r.recordId}`} state={from} aria-label={`Full IPO report: ${name}`}>Full report ↗</Link> : null}</div>
    </article>
  );
}

/** Listed in the last 30 days, as a table: company (board and sector), listed, issue price, issue size, subscribed, GMP said, at listing (with the
 *  listing price), details. The seven columns sort as the all-IPOs table does (task #329): figures high to low first, text A to Z first, blanks last. */
function ListedTable({ rows, onOpen, from }: { rows: Ipo[]; onOpen: (r: Ipo) => void; from: { from: string } }) {
  const [sort, setSort] = useState<{ k: LSortKey; d: "asc" | "desc" }>({ k: "date", d: "desc" });
  const shown = useMemo(() => (sort.k === "date" && sort.d === "desc" ? [...rows].sort(sectionOrder("listed")) : sortListed(rows, sort.k, sort.d)), [rows, sort]);
  const press = (k: LSortKey) => setSort((s) => (s.k === k ? { k, d: s.d === "asc" ? "desc" : "asc" } : { k, d: firstDir(k) }));
  const label = sort.k === "date" ? (sort.d === "desc" ? "newest listing first" : "oldest listing first") : `sorted by ${LSORT_COLS.find((c) => c[0] === sort.k)![1]}, ${sort.d === "asc" ? (sort.k === "name" ? "A to Z" : "lowest first") : sort.k === "name" ? "Z to A" : "highest first"}`;
  return (
    <div className="p4-tw"><table className="ia-t p4-lt"><caption className="sr-only">Listed in the last 30 days, {label}</caption>
      <thead><tr>{LSORT_COLS.map(([k, l, c]) => <th key={k} scope="col" className={c} aria-sort={sort.k === k ? (sort.d === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => press(k)}>{l}{sort.k === k ? (sort.d === "asc" ? " ▲" : " ▼") : ""}</button></th>)}<th scope="col"><span className="sr-only">Details</span></th></tr></thead>
      <tbody>{shown.map((r) => {
        const mv = listingMove(r), g = r.details?.gmp, ip = issuePriceOf(r), sub = r.details?.subscription?.overall, name = shortName(r.name);
        return (
          <tr key={r.id}>
            <th scope="row">{r.recordId ? <Link to={`/ipo/${r.recordId}`} state={from}>{name}</Link> : name}<small>{[r.kind === "sme" ? "SME" : "Mainboard", r.sector].filter(Boolean).join(" · ")}</small></th>
            <td>{r.status === "listed" ? full(r.listingDate) : STATUS[r.status].label}</td>
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
  useDocTitle("IPOs", "Open, upcoming and recently listed IPOs in India, and every mainboard and SME IPO since 2020: dates, price band, lot size, subscription, GMP, listing price against issue price and return since IPO.");
  const { data, isLoading, isError } = useIpos();
  const hist = useIpoHistory();
  const [params, setParams] = useSearchParams();
  const loc = useLocation();
  const from = useMemo(() => ({ from: loc.pathname + loc.search }), [loc.pathname, loc.search]);
  const view = viewOf(params);
  const [kind, setKindRaw] = useState<BoardF>("all");
  const [q, setQ] = useState("");
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
  const pass = (r: Ipo) => (kind === "all" || r.kind === kind) && (!qq || r.name.toLowerCase().includes(qq));
  const shown = rows.filter(pass);
  const sec = (s: Ipo["status"]) => shown.filter((r) => r.status === s).sort(sectionOrder(s));
  const recent = rows.filter((r) => listedRecently(r));
  const avgGain = (() => { const g = recent.map(listingGain).filter((v): v is number => v != null); return g.length ? g.reduce((a, b) => a + b, 0) / g.length : null; })();
  const cntB = (b: BoardF) => rows.filter((r) => r.status !== "not_listed" && (b === "all" || r.kind === b)).length;
  const chips: [string, string][] = [];
  if (kind !== "all") chips.push(["board", kind === "sme" ? "SME" : "Mainboard"]);
  if (qq) chips.push(["q", `“${q.trim()}”`]);
  const unset = (k: string) => { if (k === "board" || k === "all") setKind("all"); if (k === "q" || k === "all") setQ(""); };
  // the calendar's Not listed issues that the IPO record does not hold join the second view's rows, so every issue on the site is in that list
  const extra = useMemo(() => rows.filter((r) => r.status === "not_listed" && !r.recordId).map(rowFromCalendar), [rows]);

  // ------------------------------------------------------------------ the two views: the address, the bar, each view's scroll position
  const page = useRef<HTMLDivElement>(null);
  const pos = useRef<Partial<Record<View, number>>>({});                  // each view's scroll position, kept while the member is in the other view
  const shownView = useRef<View>(view);
  const jump = useRef<"top" | "gmp" | null>(null);                        // a link that opens a view at a given place (not where it was left)
  /** The space the site header and the views bar take at the top of the window while the bar sticks (0 on a phone, where it does not). */
  const stuckTop = () => {
    const bar = page.current?.querySelector<HTMLElement>(".ctabs");
    if (!bar || getComputedStyle(bar).position !== "sticky") return 10;
    return (parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight + 10;
  };
  const scrollToEl = (el: Element | null | undefined) => { if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - stuckTop()) }); };
  const go = (v: View, p?: Record<string, string>, at: "top" | "gmp" | null = null) => {
    jump.current = at;
    setParams((prev) => {
      const n = p ? new URLSearchParams(p) : new URLSearchParams(prev);
      n.set("view", v);
      return n;
    });
  };
  useEffect(() => {
    const on = () => { pos.current[shownView.current] = window.scrollY; };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  // the bar's height, so the all-IPOs table's header row sticks just under it
  useEffect(() => {
    const bar = page.current?.querySelector<HTMLElement>(".ctabs"), box = page.current;
    if (!bar || !box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => box.style.setProperty("--ipv-bar", `${bar.offsetHeight}px`));
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (shownView.current === view && !jump.current) return;
    const was = shownView.current;
    shownView.current = view;
    const at = jump.current; jump.current = null;
    const panel = page.current?.querySelector(`[data-ct-panel="${view}"]`);
    if (at === "gmp") { requestAnimationFrame(() => scrollToEl(page.current?.querySelector("#p4-gmp"))); return; }
    if (at === "top" || pos.current[view] == null) {
      // a view opened for the first time (or by a link) starts at its top, just under the bar, unless the page is above that already
      const top = panel ? panel.getBoundingClientRect().top + window.scrollY - stuckTop() : 0;
      if (at === "top" || window.scrollY > top) window.scrollTo({ top: Math.max(0, top) });
    } else if (was !== view) window.scrollTo({ top: pos.current[view]! });
  }, [view]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ the GMP block, and the links between it and the second view
  const goGmp = (r: Ipo) => {
    const g = r.details?.gmp; if (!g) return;
    setGm((s) => ({ ...s, view: "range", board: r.kind, hl: gRange(g.pct), range: "", shown: 50 }));
    setGmOpen(true); setGoRow((n) => n + 1);
  };
  /** "See the breakdown by GMP range →" in the second view: the first view, the block open on By GMP range, scrolled to it. */
  const openGmpBlock = () => { setGmP({ view: "range", hl: "", range: "" }); setGmOpen(true); go("now", undefined, "gmp"); };
  /** "See the N →": the second view with that GMP range selected, among the listed issues of the block's board. */
  const seeRange = (k: GRangeKey) => {
    const p: Record<string, string> = { status: "listed", gmp: k };
    if (gm.board !== "all") p.board = gm.board;
    go("all", p, "top");
  };
  /** "All N since 2020 →": the second view with Status = Listed (rule 4); its sort is kept. */
  const allListed = () => {
    const p: Record<string, string> = { status: "listed" };
    for (const k of ["sort", "dir"]) { const v = params.get(k); if (v) p[k] = v; }
    go("all", p, "top");
  };
  const gmpBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!goRow) return;
    const t = window.setTimeout(() => (gmpBox.current?.querySelector(".p4-grr.hl") ?? gmpBox.current)?.scrollIntoView?.({ behavior: "smooth", block: "center" }), 60);
    return () => window.clearTimeout(t);
  }, [goRow]);

  const stamp = asOf(rows.map((r) => r.updatedAt).filter((v): v is string => !!v).sort().pop());
  const fromProvider = rows.some((r) => r.source === "FinEdge");
  const recentShown = sec("listed").filter((r) => listedRecently(r));
  const total = hist.data ? hist.data.items.length + extra.length : undefined;
  const liveN = by("open").length + by("upcoming").length + by("closed").length;
  const activeSec = (s: Ipo["status"], title: string, hint?: string) => {
    const list = sec(s);
    return list.length ? (
      <section className="ipo-sec p4-sec" aria-label={title}>
        <h2 className="ipo-sec-h"><i style={{ background: STATUS[s].colour }} />{title} <span>{list.length}</span>{hint ? <small>{hint}</small> : null}</h2>
        <div className="ipo-list p4-il">{list.map((r) => <Card key={r.id} r={r} onOpen={() => setOpen(r)} onGmp={goGmp} from={from} />)}</div>
      </section>) : null;
  };

  const nowPane = (
    <>
      <div className="p4-tools">
        <label className="dbx-q">{Ico.search}<input type="search" placeholder="Search a company" aria-label="Search IPOs" value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} /></label>
        <div className="dbx-dds">
          <Dd label="Board" value={kind !== "all" ? (kind === "sme" ? "SME" : "Mainboard") : ""}>{(close) => <OptList title="Board" items={BOARD_OPTS.map(([v, t]) => ({ v, t, c: cntB(v), sel: kind === v }))} onPick={(v) => { setKind(v as BoardF); close(); }} />}</Dd>
        </div>
      </div>
      <Chips chips={chips} unset={unset} />
      {isError && <div className="formerr">The calendar could not be loaded. Please try again shortly.</div>}
      {isLoading && <div className="skeleton" style={{ height: 240, marginTop: 20 }} role="status" aria-label="Loading the IPO calendar" />}
      {!isLoading && !isError && !rows.length && <div className="card dw-empty"><span className="dw-ei"><Icon name="calendar" /></span><b>No issues listed yet</b><p>The calendar is updated by the FinLit team. Check back soon.</p></div>}
      {activeSec("open", "Open now", "apply until the closing date")}
      {activeSec("upcoming", "Upcoming")}
      {activeSec("closed", "Closed, listing soon", "allotment and listing dates in each card")}
      {rows.length > 0 && (
        <section className="card ipo-s p4-ts"><div className="card-h"><h3><span className="ci"><Icon name="calendar" /></span>Next seven weeks<ChartHelp id="ipo-timeline" /></h3><span className="s">Bar = application window</span></div>
          <Strip rows={rows.filter((r) => kind === "all" || r.kind === kind)} />
          <div className="clg">{LEGEND.map((s) => <span key={s}><i style={{ background: STATUS[s].colour }} />{STATUS[s].label}</span>)}</div></section>)}
      {rows.length > 0 && <div ref={gmpBox}><GmpRecord ipos={rows} s={gm} set={setGmP} open={gmOpen} setOpen={setGmOpen} onSee={seeRange} /></div>}
      {rows.length > 0 && (
        <section className="ipo-sec p4-sec" aria-label="Listed in the last 30 days">
          <h2 className="ipo-sec-h"><i style={{ background: STATUS.listed.colour }} />Listed in the last 30 days <span>{recentShown.length}</span>
            <small><button type="button" className="mg-link" onClick={allListed}>{total != null ? `All ${nf(total, 0)} since 2020 →` : "All IPOs since 2020 →"}</button></small></h2>
          {recentShown.length ? <ListedTable rows={recentShown} onOpen={setOpen} from={from} />
            : <p className="muted p4-pad">{recent.length ? "No listing in the last 30 days matches these filters." : "No listing in the last 30 days."}</p>}
        </section>)}
      {rows.length > 0 && !shown.some((r) => r.status !== "not_listed") && <p className="muted" style={{ padding: 24, textAlign: "center" }}>No issues match these filters.</p>}
      {rows.length > 0 && (stamp || fromProvider) && <p className="ipo-asof muted">{stamp && <>Data as of {stamp}</>}{stamp && fromProvider && " · "}{fromProvider && "Source: FinEdge"}</p>}
    </>
  );

  return (
    <div className="wrap ipo p4 ipv" ref={page}>
      <PageHeader plan="free" title="IPOs" art="calendar" links={["/results", "/news", "/premium/markets"]} actions={<CalendarSync />}
        description="Open, upcoming and just-listed issues, and every IPO since 2020; the offer document is the final word." />
      <dl className="dw-kpis p4-kpis" aria-label="IPO counts">
        {([["open", "Open now", by("open").length], ["upcoming", "Upcoming", by("upcoming").length], ["closed", "Closed, listing soon", by("closed").length], ["listed", "Listed in the last 30 days", recent.length]] as const).map(([k, l, n]) =>
          <div key={k} style={{ "--tc": STATUS[k].colour } as React.CSSProperties}><dt><i />{l}</dt><dd>{isLoading ? "—" : n}</dd></div>)}
        <div style={{ "--tc": "var(--k3)" } as React.CSSProperties}><dt><i />Avg listing vs issue, 30 days</dt><dd className={avgGain == null ? "" : avgGain >= 0 ? "up" : "down"}>{avgGain == null ? "—" : signedPct(avgGain)}</dd></div>
      </dl>
      <TabGroup label="Views of the IPO list" noun="views" hint="press one to switch" next={false} value={view} onChange={(k) => go(k as View)}
        aside={<><b>Showing:</b> {SHOWING[view]}</>}
        views={[
          { key: "now", label: "Open and upcoming", note: isLoading ? undefined : nf(liveN, 0), content: nowPane },
          { key: "all", label: "All IPOs since 2020", note: total != null ? nf(total, 0) : undefined, content: <IpoAllView extra={extra} onGmp={openGmpBlock} /> },
        ]} />
      {open && <IpoDrawer ipo={{ ...open, name: titleCase(open.name) }} chip={STATUS[open.status]} onClose={closeDrawer} />}
    </div>
  );
}
