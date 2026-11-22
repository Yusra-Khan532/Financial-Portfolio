import { titleOf } from "../lib/companyLabel";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SortTh } from "../components/SortTh";
import { nextSort, type SortState } from "../lib/tableSort";
import { Link, Navigate, useSearchParams } from "react-router";
import { SIDE, SplitDivider, useSideWidth } from "../components/SplitDivider";
import { Icon } from "../lib/icons";
import { useAuth } from "../lib/auth";
import { useUI } from "../lib/ui";
import { ApiError, apiGet } from "../lib/api";
import { dayLabel } from "../lib/feed";
import { useResultsDelayedNote } from "../lib/jobsStatus";
import { MINUS, nf } from "../lib/format";
import { GROWTH_PRESETS, PRICE_PRESETS, activePreset, activePricePreset, applyPreset, priceIsDefault, DATE_MEANING, GAP_LABEL, PAGE, PAGE_SIZES, activeChip, cellHit, DEFAULT_GROWTH, DEFAULT_PRICE, PRICE_KEYS, PRICE_WORD, bandOf, bandShort, priceFromParams, priceHit, priceOn, priceQuery, priceToParams, priceWhy, type PriceKey, type PriceState, type CellKey, growthFromParams, growthOn, growthQuery, growthToParams, type GrowthState, awaitingNote, csvOf, dateChips, dateFromParams, dateProblem, describeSel, gapAlertLink, headline, isWeekend, longDay, queryString, signedPct, todayIST, useQuarterResults, weekdayName, type DateSel, type QDates, type QParams, type QRow } from "../lib/qresults";
import { saveFile } from "../stock/derive";
import { ChartHelp } from "../components/ChartHelp";
import { HScroll } from "../components/HScroll";
import { TableZoom } from "../components/TableZoom";
import { pageList } from "../lib/scoreScreen";
import { GrowthPanel } from "../components/QrGrowth";
import { FilterGroup } from "../components/screener/FilterGroup";
import "../styles/fgx.css";
import "../styles/qresults.css";
import { CoLogo } from "../components/CoLogo";
import { short } from "../lib/pulsePack";
import { VerdictCell } from "../components/results/pack/ResultsPack";
import { GlanceCard } from "../components/results/pack/Glance";
import type { VRow } from "../lib/resultsPack";
import "../styles/sectors.css";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import "../styles/rotation-pack.css";
import "../styles/results-pack.css";

const SORTS: [string, string, boolean][] = [   // value, label, needs Silver
  ["date", "Date declared", false], ["marketCap", "Market cap", false], ["revenueYoY", "Revenue growth (YoY)", true], ["profitYoY", "Profit growth (YoY)", true],
  ["marginChange", "Net margin change", true], ["gap", "Sales vs profit gap", true], ["revenue", "Revenue", true], ["netProfit", "Net profit", true],
  ["below52", "Below 52-week high", true], ["belowAth", "Below all-time high", true],
];
/** Task #224: the sorts a table heading can choose that the Sort-by list does not hold, named in that list while they are on. */
const HEAD_WORD: Record<string, string> = { company: "Company name", revenueQoQ: "Revenue growth (QoQ)", operatingProfit: "Operating profit", opYoY: "Operating profit growth (YoY)",
  opQoQ: "Operating profit growth (QoQ)", opm: "Operating margin", profitQoQ: "Profit growth (QoQ)", npm: "Net margin", eps: "EPS", verdict: "Verdict" };
const INDICES: [string, string][] = [["NIFTY50", "NIFTY 50"], ["NIFTY100", "NIFTY 100"], ["NIFTY500", "NIFTY 500"]];
const STATUSES: [string, string][] = [["", "Any status"], ["declared", "Figures in"], ["awaiting", "Report being updated"], ["due", "Due"]];
const CAPS = [["", "Any size"], ["Large", "Large cap"], ["Mid", "Mid cap"], ["Small", "Small cap"], ["Micro", "Micro cap"]];
const COLS = 16;   // with the verdict against the industry (final pages pack, board 11)

const money = (v: number | null) => (v == null ? "—" : (v < 0 ? MINUS : "") + nf(v, Math.abs(v) >= 1000 ? 0 : 2));
const pc1 = (v: number | null) => (v == null ? "—" : (v < 0 ? MINUS : "") + nf(v, 1) + "%");
const Chg = ({ v, why }: { v: number | null; why?: string | null }) =>
  v == null && why ? <abbr className="qr-chg qr-na" title={why} tabIndex={0} aria-label={`Not available. ${why}`}>—</abbr>
    : <span className={"qr-chg" + (v == null ? "" : v > 0 ? " pos" : v < 0 ? " neg" : "")}>{signedPct(v)}</span>;
const Plain = ({ text, why }: { text: string; why?: string | null }) => (text === "—" && why ? <abbr className="qr-na" title={why} tabIndex={0} aria-label={`Not available. ${why}`}>—</abbr> : <>{text}</>);

function Copy({ text }: { text: string }) {
  const { toast } = useUI();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch {
      const t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch { toast("Copy is not available in this browser."); t.remove(); return; }
      t.remove();
    }
    setDone(true); toast("Summary copied."); window.setTimeout(() => setDone(false), 1800);
  };
  return <button type="button" className="btn qr-copy" onClick={copy} aria-label="Copy this summary">{done ? "Copied" : "Copy"}</button>;
}

function Company({ r }: { r: QRow }) {
  return (
    <div className="qr-co">
      <Link to={`/stocks/${r.symbol}#quarter`} className="qr-sym"><b><CoLogo symbol={r.symbol} name={r.name} size={20} inline />{titleOf(r)}</b></Link>
      <small>{r.name}{r.sector ? ` · ${r.sector}` : ""}</small>
      <span className="qr-tags">
        {r.indices.includes("NIFTY50") ? <i>N50</i> : r.indices.includes("NIFTY100") ? <i>N100</i> : r.indices.includes("NIFTY500") ? <i>N500</i> : null}
        {r.cap && <i>{r.cap}</i>}
        {r.loss && <i className="neg">Loss</i>}
      </span>
    </div>
  );
}

/** "Detailed view": the same quarter, laid out in groups (revenue, operating profit, net profit, per share, basis), plus the one-line summary to copy.
 *  A native <details>, so it opens and closes with a click or the keyboard and needs no state. Every figure is the row's own; a missing one shows a dash. */
function Detail({ r, fiscal, line }: { r: QRow; fiscal?: string; line: string }) {
  const kv = (label: string, value: ReactNode) => <div className="qr-kv"><dt>{label}</dt><dd>{value}</dd></div>;
  const groups: { title: string; rows: [string, ReactNode][] }[] = [
    { title: "Revenue", rows: [["Rs crore", money(r.revenue)], ["Change on a year ago", <Chg v={r.revenueYoY} />], ["Change on the last quarter", <Chg v={r.revenueQoQ} />]] },
    { title: "Operating profit", rows: [["Rs crore", <Plain text={money(r.operatingProfit)} why={r.opYoYWhy} />], ["Change on a year ago", <Chg v={r.opYoY} why={r.opYoYWhy} />], ["Change on the last quarter", <Chg v={r.opQoQ} why={r.opQoQWhy} />], ["Operating margin (OPM)", <Plain text={pc1(r.opm)} why={r.opYoYWhy} />]] },
    { title: "Net profit", rows: [["Rs crore", <b>{money(r.netProfit)}</b>], ["Change on a year ago", <Chg v={r.profitYoY} />], ["Change on the last quarter", <Chg v={r.profitQoQ} />], ["Net margin (NPM)", pc1(r.npm)], ...(r.npmChange != null ? [["Net margin, change on a year ago", `${r.npmChange > 0 ? "+" : r.npmChange < 0 ? MINUS : ""}${nf(Math.abs(r.npmChange), 1)} pts`] as [string, ReactNode]] : [])] },
    { title: "Per share and basis", rows: [["Earnings per share (Rs)", r.eps == null ? "—" : (r.eps < 0 ? MINUS : "") + nf(Math.abs(r.eps), 2)], ["Quarter", `${fiscal ? fiscal + " · " : ""}ended ${r.periodEnd ? new Date(r.periodEnd + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}`], ["Declared", dayLabel(r.date)], ["Accounts", r.basis === "standalone" ? "Standalone" : r.basis === "consolidated" ? "Consolidated" : "—"]] },
  ];
  return (
    <details className="qr-detail">
      <summary><span>Detailed view</span><Icon name="arrow" className="qr-chev" /></summary>
      <div className="qr-groups">
        {groups.map((g) => (
          <section key={g.title} className="qr-group" aria-label={g.title}>
            <h4>{g.title}</h4>
            <dl>{g.rows.map(([label, value]) => <Fragment key={label}>{kv(label, value)}</Fragment>)}</dl>
          </section>
        ))}
      </div>
      <p className="qr-line"><code>{line}</code><Copy text={line} /></p>
    </details>
  );
}


const rsv = (v: number | null | undefined) => (v == null ? "" : "Rs" + nf(v, 2));
const dayOf = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
/** One "Below ... high" cell: the distance, its band, a thin 0-100% bar, and the reason in a tooltip. A dash says why the figure is not held. */
function PriceCell({ r, k, hit }: { r: QRow; k: PriceKey; hit: boolean }) {
  const v = k === "w52" ? r.below52 : r.belowAth, stale = k === "w52" ? r.stale52 : r.staleAth, high = k === "w52" ? r.high52 : r.ath;
  const cls = "qg4 qgs qr-pp" + (hit ? " qr-hit" : "");
  if (v == null) { const why = priceWhy(r, k); return <td className={cls}><abbr className="qr-na" title={why} tabIndex={0} aria-label={`Not available. ${why}`}>—<small>{r.price == null ? "No price held" : k === "ath" ? "Loading history" : "Not held"}</small></abbr></td>; }
  const tip = [`Price ${rsv(r.price)}; ${PRICE_WORD[k]} ${rsv(high)}${k === "ath" && r.athDate ? ` (highest close, week of ${dayOf(r.athDate)})` : ""}.`,
    k === "w52" && r.low52 != null ? `52-week low ${rsv(r.low52)}${r.above52Low != null ? `; the price is ${nf(r.above52Low, 1)}% above it` : ""}.` : "",
    stale ? `The price is above the stored ${PRICE_WORD[k]} (it is updated once a day), so the distance is shown as 0%.` : ""].filter(Boolean).join(" ");
  const label = v === 0 ? `At ${PRICE_WORD[k]}${stale ? "*" : ""}` : `${nf(v, 1)}%`;
  return (
    <td className={cls}>
      <span className="qr-ppv" title={tip} tabIndex={0} aria-label={`${v === 0 ? "At the " + PRICE_WORD[k] : nf(v, 1) + "% below the " + PRICE_WORD[k]}. ${tip}`}>
        <b>{label}</b>
        <small className="qr-band">{v === 0 ? "At the high" : bandShort(bandOf(v))}</small>
        <i className="qr-bar" aria-hidden="true"><em style={{ left: `${Math.min(100, v)}%` }} /></i>
        <small className="qr-hi">High {rsv(high)}</small>
      </span>
      {hit && <span className="sr-only"> (meets your price-position filter)</span>}
    </td>
  );
}

function Row({ r, fiscal, locked, onUnlock, hit, phit }: { r: QRow; fiscal?: string; locked: boolean; onUnlock: () => void; hit: (k: CellKey) => boolean; phit: (k: PriceKey) => boolean }) {
  const h = (k: CellKey) => (hit(k) ? " qr-hit" : "");
  const tag = (k: CellKey) => (hit(k) ? <span className="sr-only"> (meets your growth filter)</span> : null);
  const line = !locked && r.hasNumbers ? headline(r, fiscal) : null;
  const note = r.status === "awaiting" && r.awaitingStage === "late" ? <>{awaitingNote(r)}</>
    : r.status === "awaiting" && r.awaitingWhy === "provider" ? <>{awaitingNote(r)}</>
    : r.status === "awaiting" ? <>Declared on {dayLabel(r.date)}. <b>Report is being updated.</b> Figures appear here as soon as the company's report is refreshed.</>
    : r.status === "due" ? <>Results due on {dayLabel(r.date)}{r.confirmed ? "" : " (board-meeting date)"}.</>
    : r.status === "missing" ? <>Declared on {dayLabel(r.date)}. This quarter's figures are no longer stored{r.loadedPeriodEnd ? ` (we hold the quarter to ${new Date(r.loadedPeriodEnd + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" })})` : ""}.</>
    : null;
  return (
    <>
      <tr className={"qr-r" + (r.flagged ? " flag" : "")}>
        <td><Company r={r} /></td>
        {note ? <td colSpan={COLS - 3} className="qr-note"><span className="qr-sticky">{note}</span></td>
          : locked ? <td colSpan={COLS - 3} className="qr-note"><span className="qr-sticky"><button type="button" className="qr-unlock" onClick={onUnlock}><Icon name="lock" /> Figures are part of the Silver plan</button></span></td>
          : <>
            <td className="qg1 qgs">{money(r.revenue)}</td><td className={"qg1" + h("revYoY")}><Chg v={r.revenueYoY} />{tag("revYoY")}</td><td className={"qg1" + h("revQoQ")}><Chg v={r.revenueQoQ} />{tag("revQoQ")}</td>
            <td className="qg2 qgs"><Plain text={money(r.operatingProfit)} why={r.opYoYWhy} /></td><td className={"qg2" + h("opYoY")}><Chg v={r.opYoY} why={r.opYoYWhy} />{tag("opYoY")}</td><td className={"qg2" + h("opQoQ")}><Chg v={r.opQoQ} why={r.opQoQWhy} />{tag("opQoQ")}</td><td className="qg2"><Plain text={pc1(r.opm)} why={r.opYoYWhy} /></td>
            <td className="qg3 qgs"><b>{money(r.netProfit)}</b></td><td className={"qg3" + h("npYoY")}><Chg v={r.profitYoY} />{tag("npYoY")}</td><td className={"qg3" + h("npQoQ")}><Chg v={r.profitQoQ} />{tag("npQoQ")}</td><td className="qg3">{pc1(r.npm)}</td>
            <td className="qgs">{r.eps == null ? "—" : (r.eps < 0 ? MINUS : "") + nf(r.eps, 2)}</td>
            <td className="qgs"><VerdictCell r={r as VRow} /></td>
          </>}
        {locked ? <td colSpan={2} className="qg4 qgs qr-pp"><abbr className="qr-na" title="Price position is part of the Silver plan." tabIndex={0}>—</abbr></td>
          : <><PriceCell r={r} k="w52" hit={phit("w52")} /><PriceCell r={r} k="ath" hit={phit("ath")} /></>}
      </tr>
      {(line || r.flagged) && (
        <tr className={"qr-sub" + (r.flagged ? " flag" : "")}>
          <td colSpan={COLS}>
            <div className="qr-sticky qr-lines">
              {r.flagged && (
                <p className="qr-flag"><span className="chip down"><Icon name="alert" /> {GAP_LABEL}</span>
                  <span>Revenue {signedPct(r.revenueYoY, 0)}, profit {signedPct(r.profitYoY, 0)}: {nf(r.gap || 0, 0)} points apart.</span>
                  <Link to={gapAlertLink(r.symbol)}>Set the alert</Link><Link to={`/stocks/${r.symbol}#quarter`}>Open the report</Link></p>
              )}
              {line && <Detail r={r} fiscal={fiscal} line={line} />}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DateEmpty({ dates, sel, today, quarterLabel, filtersOn, onPick, onQuarter, onClearFilters }: {
  dates: QDates; sel: DateSel; today: string; quarterLabel: string; filtersOn: boolean; onPick: (day: string) => void; onQuarter: (key: string) => void; onClearFilters: () => void;
}) {
  const what = describeSel(sel, today);
  const early = dates.coverage.earliest && dates.from < dates.coverage.earliest;
  return (
    <div className="dw-empty qr-dempty" role="status">
      <span className="dw-ei"><Icon name="calendar" /></span>
      <b>{dates.inQuarter ? "No company matches" : `No ${quarterLabel} results ${what}`}</b>
      {dates.inQuarter ? <p>Some companies {what} in this quarter, but none match your other filters.</p>
        : <>
          {dates.single && isWeekend(dates.from) && <p>{longDay(dates.from)} is a {weekdayName(dates.from)}, when exchanges are closed and few companies announce.</p>}
          {dates.quarters.length > 0 && <p>Other quarters were announced in this window: {dates.quarters.map((x) => <button key={x.key} type="button" className="alx-link" onClick={() => onQuarter(x.key)}>{x.label} ({x.n})</button>)}</p>}
          {!dates.quarters.length && <p>We hold no results announcements for this {dates.single ? "day" : "window"}{early ? `; our records of announcement dates start on ${longDay(dates.coverage.earliest as string)}` : ""}.</p>}
          {dates.nearest.length > 0 && <p>Nearest days with {quarterLabel} results: {dates.nearest.map((x) => <button key={x.date} type="button" className="alx-link" onClick={() => onPick(x.date)}>{longDay(x.date)} ({x.n})</button>)}</p>}
        </>}
      {filtersOn && <button type="button" className="btn" onClick={onClearFilters}>Clear other filters</button>}
    </div>
  );
}

/** The note under the table, folded (the founder, 22 Nov 2026): closed when the page opens, the same words inside. The disclaimer and the
 *  Results calendar link stay in sight below it. */
export const READ_NOTE: [string, string][] = [
  ["Growth (YoY and QoQ)", "Growth is against the same quarter last year (YoY) and the quarter before (QoQ); it shows a dash, with the reason on hover or focus, when the earlier quarter was zero or a loss or is not in our statements."],
  ["Operating profit and OPM", "Operating profit is revenue less operating expenses before interest and depreciation (for banks, before provisions), the same figure as on the stock page and in the screener; OPM is operating profit over revenue."],
  ["Dates", "Dates come from exchange filings and announced board meetings."],
  ["Price position", "The two Price position columns show how far the latest price is below the 52-week high (the exchange's intraday high) and below the all-time high (the highest close in our price history); a dash means that high is not held. Distance below a high is a fact about the price, not a view on it."],
];
function ReadNote() {
  return (
    <div className="qr-read">
      <details className="qr-how">
        <summary><span><b>How to read this table</b><small>Growth, operating profit, dates and price position</small></span><span className="qr-how-show" aria-hidden="true"><span className="qr-how-s">Show ▾</span><span className="qr-how-h">Hide ▴</span></span></summary>
        <dl>{READ_NOTE.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>
      </details>
      <p className="qr-foot muted">Not investment advice. <Link to="/results">Results calendar</Link></p>
    </div>
  );
}

/** Where the reader is in the list and how to move: "1–50 of 5,313", page numbers (first, last and two either side), rows per page. Above and below the table. */
function Pager({ at, offset, total, size, onPage, onSize }: { at: "top" | "bottom"; offset: number; total: number; size: number; onPage: (n: number) => void; onSize: (n: number) => void }) {
  const page = Math.floor(offset / size), pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className={"qr-pg qr-pg-" + at}>
      <span className="qr-pg-at" aria-live={at === "top" ? "polite" : undefined}>Showing <b>{nf(offset + 1, 0)}–{nf(Math.min(total, offset + size), 0)}</b> of {nf(total, 0)} companies</span>
      <nav className="qr-pg-nav" aria-label={at === "top" ? "Pages of the results table" : "Pages of the results table (bottom)"}>
        <button type="button" className="btn" disabled={page <= 0} onClick={() => onPage(page - 1)} aria-label="Previous page">‹ Previous</button>
        {pageList(page, pages).map((n, i) => n == null ? <span key={"g" + i} className="qr-pg-gap" aria-hidden="true">…</span> :
          <button type="button" key={n} className="btn qr-pg-n" aria-current={n === page ? "page" : undefined} aria-label={`Page ${n + 1}`} onClick={() => onPage(n)}>{n + 1}</button>)}
        <button type="button" className="btn" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">Next ›</button>
      </nav>
      <label className="qr-pg-size muted">Rows per page <select value={size} onChange={(e) => onSize(Number(e.target.value))} aria-label={at === "top" ? "Rows per page" : "Rows per page (bottom)"}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
    </div>
  );
}

/** Task #330 (developer file 28): Latest results is now the Companies view of the one Results page. The old address sends its view and every other query
 *  parameter (filters, industry, quarter, dates) on: /results/quarter → /results?view=companies, /results/quarter?view=industries → /results?view=industries. */
export function QuarterResultsPage() {
  const [sp] = useSearchParams();
  const n = new URLSearchParams(sp);
  n.set("view", sp.get("view") === "industries" ? "industries" : "companies");
  return <Navigate to={`/results?${n.toString()}`} replace />;
}

/** Task #330: every company's results for the quarter, the Companies view of the one Results page (it was the Latest results page). The quarter, the dates,
 *  the growth and price filters, the industry, the scope, the status and the search are read from the address, so a link (a calendar day, an industry, "See all
 *  due", a company's own verdict) opens this view already filtered. */
export function CompaniesView() {
  const { user } = useAuth();
  const { plan, upgrade, toast } = useUI();
  const [sp, setSp] = useSearchParams();
  const silver = plan !== "basic";
  // ?scope=portfolio or watchlist: the Results calendar's "Your companies" tile links here "filtered to yours" (task #193)
  const fromUrl = (): Partial<QParams> => ({ scope: sp.get("scope") === "portfolio" || sp.get("scope") === "watchlist" ? (sp.get("scope") as "portfolio" | "watchlist") : "all",
    industry: sp.get("industry") || undefined, status: sp.get("status") || undefined, q: sp.get("q") || undefined });
  const [f, setF] = useState<QParams>(() => ({ sort: "date", dir: "desc", ...fromUrl() }));
  // a link into this view while the page is open (an industry, "See all due", a company's verdict): the same page stays mounted, so follow the address
  const urlKey = ["scope", "industry", "status", "q"].map((k) => sp.get(k) ?? "").join("|");
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } setF((x) => ({ ...x, ...fromUrl() })); setQuery(sp.get("q") || ""); setOffset(0); }, [urlKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [offset, setOffset] = useState(0);
  const [sideW, setSide] = useSideWidth("results-quarter");   // the draggable divider: the width is remembered; dragged to the edge it hides the filters
  const wide = sideW === 0;                                   // filters hidden, table at full width
  const toggleWide = () => setSide(wide ? SIDE.def : 0);
  // Rows per page (50 or 100, the server's most). The table had only Previous / Next under 50 rows, so most of the 5,000-odd companies were out of
  // sight: the pager now sits above the table as well as below it, with page numbers and the rows-per-page choice (22 Nov 2026).
  const [size, setSize] = useState<number>(PAGE);
  const tableTop = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(() => sp.get("q") || "");
  const quarter = sp.get("quarter") || undefined;
  const sel = useMemo(() => dateFromParams(sp), [sp]);
  const hasDate = !!(sel.date || sel.from || sel.to);
  const growth = useMemo(() => growthFromParams(sp), [sp]);   // the growth filters live in the address, like the quarter and the dates
  const price = useMemo(() => priceFromParams(sp), [sp]);
  const p: QParams = { ...f, quarter, q: f.q, offset, limit: size, ...sel, ...growthQuery(growth), ...priceQuery(price) };
  const res = useQuarterResults(p);
  const d = res.data;
  const dateErr = res.error instanceof ApiError && res.error.status === 400 ? res.error.message : null;   // a bad or future date in the address: say so, never show a blank
  const today = d?.today || todayIST();
  const [msg, setMsg] = useState("");
  const [draft, setDraft] = useState({ from: sel.from || "", to: sel.to || "" });
  useEffect(() => { setDraft({ from: sel.from || "", to: sel.to || "" }); }, [sel.date, sel.from, sel.to]);
  const set = (patch: Partial<QParams>) => { setF((x) => ({ ...x, ...patch })); setOffset(0); };
  /** After a page change, show the top of the table, not the top of the page (in the enlarged table, the dialog scrolls instead of the page). */
  const toTable = () => requestAnimationFrame(() => {
    const el = tableTop.current;
    if (!el) return;
    if (el.closest(".cz-body")) el.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 96) });
  });
  const goPage = (n: number) => { setOffset(n * size); toTable(); };
  const pickSize = (n: number) => { setSize(n); setOffset(0); toTable(); };
  /** Change the date in the address (so it can be shared); `keepQuarter` leaves a chosen quarter alone, otherwise the server picks the quarter the date belongs to. */
  const setDates = (next: DateSel | null, keepQuarter = false) => {
    const n = new URLSearchParams(sp);
    for (const k of ["date", "from", "to"]) n.delete(k);
    if (!keepQuarter) n.delete("quarter");
    for (const [k, v] of Object.entries(next || {})) if (v) n.set(k, v);
    setSp(n); setOffset(0); setMsg("");
  };
  const setGrowth = (next: GrowthState) => {
    if (growthOn(next) && !silver) return need("Filtering by growth is part of the Silver plan.");   // Basic sees the panel; the figures behind it are Silver
    setSp(growthToParams(sp, next), { replace: true }); setOffset(0);
  };
  const setPrice = (next: PriceState) => {
    if (priceOn(next) && !silver) return need("Filtering by price position is part of the Silver plan.");
    setSp(priceToParams(sp, next), { replace: true }); setOffset(0);
  };
  /** Both blocks in ONE address write (a preset or the reset): two writes in a row would each start from the same old address. */
  const setBoth = (g: GrowthState, pr: PriceState) => {
    if ((growthOn(g) || priceOn(pr)) && !silver) return need("Filtering by growth and price position is part of the Silver plan.");
    setSp(priceToParams(growthToParams(sp, g), pr), { replace: true }); setOffset(0);
  };
  const growthLocked = res.error instanceof ApiError && res.error.status === 403;
  const apply = (next: DateSel) => { const bad = dateProblem(next, today); if (bad) setMsg(bad); else setDates(next); };
  const chips = dateChips(today), chipOn = activeChip(sel, today);
  const need = (why: string) => upgrade("silver", why);
  const locked = !!d?.locked;

  const setSort = (v: string) => {
    if (SORTS.find((s) => s[0] === v)?.[2] && !silver) return need("Sorting by growth and margin is part of the Silver plan.");
    set({ sort: v, dir: v === "date" || v === "marketCap" || v.endsWith("YoY") || v === "gap" || v === "revenue" || v === "netProfit" || v === "marginChange" ? "desc" : "asc" });
  };
  // task #224 (results pack of 18 Nov, A1): every heading sorts, on the server, so the order covers every page. First click: numbers high to low, the company
  // name A to Z; second click: the other way; third: back to the page's own order (the most recently declared first). Figures need Silver, as before.
  const TEXT_KEYS = new Set(["company"]);
  const headSort: SortState = f.sort && f.sort !== "date" ? { key: f.sort, dir: TEXT_KEYS.has(f.sort) ? (f.dir === "asc" ? "desc" : "asc") : (f.dir === "asc" ? "asc" : "desc") } : null;
  const onHead = (k: string) => {
    const nx = nextSort(headSort, k);
    if (!nx) return set({ sort: "date", dir: "desc" });
    if (!["company", "marketCap"].includes(k) && !silver) return need("Sorting by results figures is part of the Silver plan.");
    set({ sort: k, dir: TEXT_KEYS.has(k) ? (nx.dir === "desc" ? "asc" : "desc") : nx.dir });
  };
  const QH = (k: string, l: ReactNode, cls?: string, after?: ReactNode, rowSpan?: number) => <SortTh key={k} k={k} label={l} className={cls} after={after} rowSpan={rowSpan} sort={headSort} onSort={onHead} />;
  const setScope = (scope: "all" | "watchlist" | "portfolio") => {
    if (scope !== "all" && !user) return need("Sign in to see only your watchlist or portfolio.");
    set({ scope });
  };
  const exportCsv = async () => {
    if (!silver) return need("Downloading the quarter's results is part of the Silver plan.");
    try {
      const u = queryString({ ...p, quarter: d?.quarter?.key || p.quarter, offset: 0, limit: undefined });
      const out = await apiGet<{ rows: QRow[]; quarter: { label: string; fiscal: string } | null }>(`/api/results/quarter/export?${u}`);
      saveFile(`FinLit-results-${d?.quarter?.key || "quarter"}.csv`, csvOf(out.rows, out.quarter ? `${out.quarter.label} (${out.quarter.fiscal})` : ""), "text/csv;charset=utf-8");
      toast(`Saved ${out.rows.length} companies as a CSV.`);
    } catch (e) { toast(e instanceof ApiError && e.body.detail ? e.body.detail : "We could not prepare the download. Please try again."); }
  };

  const days = useMemo(() => new Map((d?.days || []).map((x) => [x.date, x.n])), [d?.days]);
  const grouped = (f.sort || "date") === "date";
  const total = d?.total || 0;
  const q = d?.quarter;
  const nFilters = [f.sector, f.cap, f.index, f.status, f.q, f.flagged, f.scope !== "all" ? f.scope : ""].filter(Boolean).length;
  const filtersOn = nFilters > 0;
  const clearFilters = () => { setF({ scope: "all", sort: "date", dir: "desc" }); setQuery(""); setOffset(0); };
  const body = useMemo(() => {
    const out: ReactNode[] = [];
    let last = "", coming = false;
    for (const r of d?.rows || []) {
      if (grouped && !coming && r.date > (d?.today || "9999")) {
        coming = true;
        out.push(<tr key="coming" className="qr-up"><td colSpan={COLS}><div className="qr-sticky"><b>Still to declare</b><span>Board-meeting dates, soonest first</span></div></td></tr>);
      }
      if (grouped && r.date !== last) {
        last = r.date;
        out.push(<tr key={"d" + r.date} className="qr-day"><td colSpan={COLS}><div className="qr-sticky"><b>{dayLabel(r.date)}</b><span>{days.get(r.date) || ""} {days.get(r.date) === 1 ? "company" : "companies"}</span></div></td></tr>);
      }
      out.push(<Row key={r.symbol} r={r} fiscal={q?.fiscal} locked={locked} hit={(k) => cellHit(r, k, growth.cells[k])} phit={(k) => priceHit(r, k, price[k])} onUnlock={() => need("Results figures, growth and margin are part of the Silver plan.")} />);
    }
    return out;
  }, [d?.rows, d?.today, days, grouped, q?.fiscal, locked, growth, price]); // eslint-disable-line react-hooks/exhaustive-deps

  const delayed = useResultsDelayedNote();
  return (
    <div className="ipo qr sp rs rs-latest">
      {delayed && <div className="rc-stale" role="status" data-testid="results-delayed">{delayed}</div>}
      {dateErr && <div className="formerr qr-derr" role="alert">{dateErr} <button type="button" className="alx-link" onClick={() => setDates(null)}>Show the latest quarter</button></div>}
      {growthLocked && <div className="formerr" role="alert">Filtering by {growthOn(growth) ? "growth" : "price position"} is part of the Silver plan. <button type="button" className="alx-link" onClick={() => need("Filtering by growth and price position is part of the Silver plan.")}>See Silver</button> <button type="button" className="alx-link" onClick={() => setBoth(DEFAULT_GROWTH, DEFAULT_PRICE)}>Remove the {growthOn(growth) && priceOn(price) ? "filters" : growthOn(growth) ? "growth filter" : "price-position filter"}</button></div>}
      {res.isError && !dateErr && !growthLocked && <div className="formerr">The results could not be loaded. Please try again shortly. <Link to="/results">Open the results calendar</Link></div>}

      {locked && (
        <div className="pl-cap qr-cap"><Icon name="lock" /><span><b>Basic shows who declared and when.</b> Silver shows every figure, growth against last year and last quarter, margins, the copy-ready summary line, the sales-and-profit flag, all the sorting and filters, and a CSV download.</span>
          <button type="button" className="btn primary" onClick={() => need("Quarter results figures are part of the Silver plan.")}>See Silver</button></div>
      )}

      {<>
      {f.industry && <p className="qr-active" role="status">Showing {short(f.industry)} only. <button type="button" className="alx-link" onClick={() => { set({ industry: undefined }); const n = new URLSearchParams(sp); n.delete("industry"); setSp(n, { replace: true }); }}>Show every industry</button></p>}
      <div className={"qr-split" + (wide ? " qr-wide" : "")} style={{ "--side-w": `${sideW}px` } as React.CSSProperties}>
      <aside className="qr-side card" aria-label="Filters" id="qr-filters" hidden={wide}>
        <div className="qr-side-h">
          <h2>Filters</h2>
          <button type="button" className="qr-side-x" onClick={toggleWide} aria-controls="qr-filters" aria-expanded={!wide} aria-label="Hide filters" title="Hide filters, widen table">
            <svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 2.5 4 6l3.5 3.5" /></svg>
          </button>
        </div>
        <FilterGroup id="qr-date" title="Announcement date" defaultOpen>
        <div className="qr-fd" role="group" aria-label="Announcement date">
          <div className="chips" role="group" aria-label="Quick dates">
            {chips.map((c) => <button key={c.id} type="button" className={chipOn === c.id ? "on" : ""} aria-pressed={chipOn === c.id} onClick={() => (chipOn === c.id ? setDates(null) : apply(c.sel))}>{c.label}</button>)}
          </div>
          <div className="qr-dates">
            <label className="wl-sel"><span>Day</span>
              <input type="date" max={today} value={sel.date || ""} aria-describedby="qr-datenote" onChange={(e) => (e.target.value ? apply({ date: e.target.value }) : setDates(null))} /></label>
            <span className="qr-or" aria-hidden="true">or</span>
            <label className="wl-sel"><span>From</span>
              <input type="date" max={draft.to || today} value={draft.from} aria-describedby="qr-datenote" onChange={(e) => { setDraft({ ...draft, from: e.target.value }); if (e.target.value) apply({ from: e.target.value, to: draft.to || undefined }); else if (hasDate) setDates(null); }} /></label>
            <label className="wl-sel"><span>To</span>
              <input type="date" min={draft.from || undefined} max={today} value={draft.to} aria-describedby="qr-datenote" onChange={(e) => { setDraft({ ...draft, to: e.target.value }); if (draft.from) apply({ from: draft.from, to: e.target.value || undefined }); else if (e.target.value) setMsg("Choose the from date as well as the to date."); }} /></label>
            {hasDate && <button type="button" className="alx-link qr-dclear" onClick={() => { setDates(null); setDraft({ from: "", to: "" }); }}>Clear dates</button>}
          </div>
          <p id="qr-datenote" className="qr-datenote muted">{d?.dateMeaning || DATE_MEANING} Pick a day, or a from and to range (both days included), up to today.</p>
          {msg && <p className="qr-dmsg" role="alert">{msg}</p>}
        </div>
        </FilterGroup>
        <FilterGroup id="qr-co" title="Companies" defaultOpen>
        <div className="qr-f1">
          <div className="chips" role="group" aria-label="Whose results">
            {([["all", "All companies"], ["watchlist", "My watchlist"], ["portfolio", "Equity portfolio"]] as const).map(([k, l]) => <button key={k} type="button" className={f.scope === k ? "on" : ""} aria-pressed={f.scope === k} onClick={() => setScope(k)}>{l}</button>)}
            <span className="qr-sep" aria-hidden="true" />
            {INDICES.map(([k, l]) => <button key={k} type="button" className={f.index === k ? "on" : ""} aria-pressed={f.index === k} onClick={() => set({ index: f.index === k ? "" : k })}>{l}</button>)}
          </div>
          <form className="qr-search" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: query.trim() }); }}>
            <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) set({ q: "" }); }} placeholder="Search company or symbol" aria-label="Search company or symbol" maxLength={60} />
            <button className="btn" type="submit">Search</button>
          </form>
        </div>
          <div className="qr-f2 qr-selects">
          <label className="wl-sel"><span>Sector</span>
            <select value={f.sector || ""} onChange={(e) => set({ sector: e.target.value })} aria-label="Sector"><option value="">All sectors</option>{(d?.facets.sectors || []).map((s) => <option key={s.name} value={s.name}>{s.name} ({s.n})</option>)}</select></label>
          <label className="wl-sel"><span>Market cap</span>
            <select value={f.cap || ""} onChange={(e) => set({ cap: e.target.value })} aria-label="Market cap band">{CAPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="wl-sel"><span>Status</span>
            <select value={f.status || ""} onChange={(e) => set({ status: e.target.value })} aria-label="Status">{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          </div>
        </FilterGroup>
      <GrowthPanel state={growth} onChange={setGrowth} summary={d?.growth} loading={res.isFetching} price={price} onPrice={setPrice} priceSummary={d?.price} onBoth={setBoth} onReset={() => setBoth(DEFAULT_GROWTH, DEFAULT_PRICE)} held={dateErr ? null : d?.priceStrip} />
      </aside>
      <SplitDivider width={sideW} set={setSide} />
      <div className="qr-main">
      <div className="qr-toolbar" role="group" aria-label="Sort and export">
          <button type="button" className="btn qr-widebtn" aria-pressed={wide} aria-controls="qr-filters" onClick={toggleWide}><Icon name="table" /> {wide ? "Show filters" : "Hide filters, widen table"}</button>
          <form className="qr-find" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: query.trim() }); }}>
            <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) set({ q: "" }); }} placeholder="Find a company in these results" aria-label="Find a company in these results" maxLength={60} />
            <button className="btn" type="submit">Find</button>
          </form>
          <label className="wl-sel"><span>Sort by</span>
            <select value={f.sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">{SORTS.map(([v, l, s]) => <option key={v} value={v}>{l}{s && !silver ? " (Silver)" : ""}</option>)}{f.sort && !SORTS.some(([v]) => v === f.sort) && <option value={f.sort}>{HEAD_WORD[f.sort] ?? "The column you chose"}</option>}</select></label>
          <button type="button" className="btn qr-dir" aria-label={f.dir === "desc" ? "Highest first" : "Lowest first"} onClick={() => set({ dir: f.dir === "desc" ? "asc" : "desc" })}>{grouped ? (f.dir === "desc" ? "Newest first" : "Oldest first") : f.dir === "desc" ? "High to low" : "Low to high"}</button>
          <span className="qr-flagged"><label className="sw"><input type="checkbox" checked={!!f.flagged} onChange={(e) => (silver ? set({ flagged: e.target.checked }) : need("The sales-and-profit flag is part of the Silver plan."))} /><span aria-hidden="true" /><b>Only flagged</b></label><ChartHelp id="qr-gap" /></span>
          <button type="button" className="btn qr-csv" onClick={exportCsv}><Icon name="table" /> CSV{silver ? "" : " (Silver)"}</button>
          {filtersOn && <button type="button" className="alx-link" onClick={clearFilters}>Clear filters</button>}
      </div>
      {f.q && d && !dateErr && !res.isFetching && <p className="qr-findnote" role="status">{total ? <><b>{nf(total, 0)}</b> {total === 1 ? "company matches" : "companies match"} “{f.q}” among the filtered results.</> : <>“{f.q}” is not in the filtered results. <button type="button" className="alx-link" onClick={() => { setQuery(""); set({ q: "" }); }}>Clear the search</button></>}</p>}
      <GlanceCard dist={d?.distribution} growth={d?.growth} locked={!silver} fills={[
        ...GROWTH_PRESETS.map((g) => { const on = activePreset(growth) === g.id && priceIsDefault(price); return { id: g.id, label: g.label, hint: g.hint, on, apply: () => setBoth(on ? DEFAULT_GROWTH : applyPreset(g), DEFAULT_PRICE) }; }),
        ...PRICE_PRESETS.filter((x) => x.growth).map((x) => { const on = activePricePreset(growth, price) === x.id; return { id: x.id, label: x.label, hint: x.hint, on, apply: () => setBoth(on ? DEFAULT_GROWTH : applyPreset(x.growth!), on ? DEFAULT_PRICE : x.price) }; }),
      ]} />

      <section className="card qr-card">
        <div className="card-h"><h3><span className="ci"><Icon name="notes" /></span>{q ? `${q.label}` : "Results"}<span className="muted qr-count"> · {nf(total, 0)} {total === 1 ? "company" : "companies"}</span></h3>
          <span className="muted qr-unit">Rs crore, except EPS (Rs) and per cent</span></div>
        {hasDate && d && !dateErr && (
          <p className="qr-active" role="status">
            Showing companies {describeSel(sel, today)}{q ? ` for ${q.label}` : ""}: <b>{nf(total, 0)}</b>{filtersOn ? " after your filters" : ""}.
            {d.dates && d.dates.quarters.filter((x) => x.key !== q?.key).map((x) => <span key={x.key}> {nf(x.n, 0)} announced {x.label} results in this window: <button type="button" className="alx-link" onClick={() => { const n = new URLSearchParams(sp); n.set("quarter", x.key); setSp(n); setOffset(0); }}>view</button>.</span>)}
          </p>
        )}
        {dateErr ? null : res.isLoading && !d ? <div className="skeleton" style={{ height: 360 }} /> : !d?.rows.length && hasDate && d?.dates ? (
          <DateEmpty dates={d.dates} sel={sel} today={today} quarterLabel={q?.label || "quarter"} filtersOn={filtersOn} onPick={(day) => setDates({ date: day }, true)}
            onQuarter={(key) => { const n = new URLSearchParams(sp); n.set("quarter", key); setSp(n); setOffset(0); }} onClearFilters={clearFilters} />
        ) : !d?.rows.length ? (
          <div className="dw-empty"><span className="dw-ei"><Icon name="calendar" /></span><b>{d?.quarter ? "No companies match" : "No results dates yet"}</b><p>{d?.quarter ? (growthOn(growth) || priceOn(price) ? "No company meets the growth and price-position conditions you set. Try a wider band or lower threshold, or switch from Match all to Match any." : "Try removing a filter.") : "Results dates appear here as companies announce them."}</p>
            {f.scope === "watchlist" && <Link className="btn" to="/watchlist">Build a watchlist</Link>}{f.scope === "portfolio" && <Link className="btn" to="/holdings">Add holdings</Link>}</div>
        ) : (
          // One enlarge arrow (the site's shared one, in the panel's corner): it opens the table WITH its pager, so every page can be read enlarged.
          <TableZoom label="Results table">
          <div ref={tableTop} className="qr-ttop">{total > PAGE_SIZES[0] && <Pager at="top" offset={offset} total={total} size={size} onPage={goPage} onSize={pickSize} />}</div>
          <HScroll label="results table" className="qr-scroll">
            <table className="qtt qr-t">
              <thead>
                <tr className="qr-grp">{QH("company", "Company", undefined, undefined, 2)}<th colSpan={3} scope="colgroup" className="qg1 qgs">Revenue</th><th colSpan={4} scope="colgroup" className="qg2 qgs">Operating profit</th><th colSpan={4} scope="colgroup" className="qg3 qgs">Net profit</th>{QH("eps", "EPS", "qgs", undefined, 2)}{QH("verdict", "Verdict", "qgs", <ChartHelp id="qr-verdict" />, 2)}<th colSpan={2} scope="colgroup" className="qg4 qgs">Price position</th></tr>
                <tr>{QH("revenue", "Rs Cr", "qg1 qgs")}{QH("revenueYoY", "YoY", "qg1")}{QH("revenueQoQ", "QoQ", "qg1")}{QH("operatingProfit", "Rs Cr", "qg2 qgs")}{QH("opYoY", "YoY", "qg2")}{QH("opQoQ", "QoQ", "qg2")}{QH("opm", "OPM", "qg2")}{QH("netProfit", "Rs Cr", "qg3 qgs")}{QH("profitYoY", "YoY", "qg3")}{QH("profitQoQ", "QoQ", "qg3")}{QH("npm", "NPM", "qg3")}
                  {PRICE_KEYS.map((k, i) => QH(k === "w52" ? "below52" : "belowAth", k === "w52" ? "Below 52-week high" : "Below all-time high", "qg4" + (i === 0 ? " qgs" : "")))}</tr>
              </thead>
              <tbody>{body}</tbody>
            </table>
          </HScroll>
          {total > PAGE_SIZES[0] && <Pager at="bottom" offset={offset} total={total} size={size} onPage={goPage} onSize={pickSize} />}
          </TableZoom>
        )}
        <ReadNote />
      </section>
      </div>
      </div>
      </>}
    </div>
  );
}
