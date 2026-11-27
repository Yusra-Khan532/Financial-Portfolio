import { useEffect, useMemo, useRef, useState } from "react";
import { nextSort, type SortState } from "../lib/tableSort";
import { Link, Navigate, useSearchParams } from "react-router";
import { Icon } from "../lib/icons";
import { useAuth } from "../lib/auth";
import { useUI } from "../lib/ui";
import { ApiError, apiGet } from "../lib/api";
import { useResultsDelayedNote } from "../lib/jobsStatus";
import { nf } from "../lib/format";
import { GROWTH_PRESETS, PRICE_PRESETS, activePreset, activePricePreset, applyPreset, priceIsDefault, DATE_MEANING, PAGE, PAGE_SIZES, activeChip, cellHit, DEFAULT_GROWTH, DEFAULT_PRICE, PRICE_KEYS, bandShort, priceFromParams, priceHit, priceOn, priceQuery, priceToParams, type PriceKey, type PriceState, type CellKey, growthFromParams, growthOn, growthQuery, growthToParams, type GrowthState, csvOf, dateChips, dateFromParams, dateProblem, describeSel, isWeekend, longDay, queryString, todayIST, useQuarterResults, weekdayName, type DateSel, type QDates, type QParams, type QRow, NO_SIDE, VALUE_RE, cleanValue, GROWTH_CELLS, CELL_OF, GROWTH_METRICS, opWords, DEFAULT_COND, sideOn, PRICE_PARAM_KEYS } from "../lib/qresults";
import { saveFile } from "../stock/derive";
import { ChartHelp } from "../components/ChartHelp";
import { HScroll } from "../components/HScroll";
import { TableZoom } from "../components/TableZoom";
import { pageList } from "../lib/scoreScreen";
import { GrowthPanel } from "../components/QrGrowth";
import "../styles/fgx.css";
import "../styles/qresults.css";
import { short } from "../lib/pulsePack";
import { GlanceCard } from "../components/results/pack/Glance";
import { CompaniesGrid, COL_SETS, type ColSet } from "../components/results/CompaniesGrid";
import { VERDICTS } from "../lib/resultsPack";
import "../styles/companies-table.css";
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
  // task #330 (file 28): the column set (remembered) and the growth and price panel under the filter bar
  const [colSet, setColSetState] = useState<ColSet>(() => { try { const v = localStorage.getItem("finlit-results-cols"); return (COL_SETS.some(([k]) => k === v) ? v : "key") as ColSet; } catch { return "key"; } });
  const setColSet = (v: ColSet) => { setColSetState(v); try { localStorage.setItem("finlit-results-cols", v); } catch { /* the choice lasts this visit */ } };
  const [panel, setPanel] = useState(false);
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
  // task #330: an applied filter can be switched off without losing it (its tick box). An unticked filter keeps its value in its control and in the address
  // (off=sector,g:npYoY), is not sent to the server, and does not count in the Growth and price badge.
  const off = useMemo(() => new Set((sp.get("off") || "").split(",").filter(Boolean)), [sp]);
  const setOffKeys = (keys: string[], isOff: boolean) => {
    const n = new URLSearchParams(sp), x = new Set(off);
    for (const k of keys) { if (isOff) x.add(k); else x.delete(k); }
    if (x.size) n.set("off", [...x].join(",")); else n.delete("off");
    setSp(n, { replace: true }); setOffset(0);
  };
  const effGrowth = useMemo<GrowthState>(() => ({ ...growth, cells: Object.fromEntries(Object.entries(growth.cells).map(([k, c]) => [k, off.has("g:" + k) ? { ...c, value: "" } : c])) as GrowthState["cells"] }), [growth, off]);
  const effPrice = useMemo<PriceState>(() => ({ ...price, w52: off.has("w52") ? NO_SIDE : price.w52, ath: off.has("ath") ? NO_SIDE : price.ath }), [price, off]);
  const effF: QParams = { ...f, q: off.has("q") ? undefined : f.q, sector: off.has("sector") ? undefined : f.sector, cap: off.has("cap") ? undefined : f.cap, status: off.has("status") ? undefined : f.status,
    verdict: off.has("verdict") ? undefined : f.verdict, flagged: off.has("flag") ? false : f.flagged, industry: off.has("industry") ? undefined : f.industry,
    scope: off.has("co") ? "all" : f.scope, index: off.has("co") ? undefined : f.index };
  const p: QParams = { ...effF, quarter, offset, limit: size, ...(off.has("date") ? {} : sel), ...growthQuery(effGrowth), ...priceQuery(effPrice) };
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
    if (growthOn(next) && !silver) return need("Filtering by growth is part of every paid plan.");   // Basic sees the panel; the figures behind it are Silver
    setSp(growthToParams(sp, next), { replace: true }); setOffset(0);
  };
  const setPrice = (next: PriceState) => {
    if (priceOn(next) && !silver) return need("Filtering by price position is part of every paid plan.");
    setSp(priceToParams(sp, next), { replace: true }); setOffset(0);
  };
  /** Both blocks in ONE address write (a preset or the reset): two writes in a row would each start from the same old address. */
  const setBoth = (g: GrowthState, pr: PriceState) => {
    if ((growthOn(g) || priceOn(pr)) && !silver) return need("Filtering by growth and price position is part of every paid plan.");
    setSp(priceToParams(growthToParams(sp, g), pr), { replace: true }); setOffset(0);
  };
  const growthLocked = res.error instanceof ApiError && res.error.status === 403;
  const apply = (next: DateSel) => { const bad = dateProblem(next, today); if (bad) setMsg(bad); else setDates(next); };
  const chips = dateChips(today), chipOn = activeChip(sel, today);
  const need = (why: string) => upgrade("silver", why);
  const locked = !!d?.locked;

  const setSort = (v: string) => {
    if (SORTS.find((s) => s[0] === v)?.[2] && !silver) return need("Sorting by growth and margin is part of every paid plan.");
    set({ sort: v, dir: v === "date" || v === "marketCap" || v.endsWith("YoY") || v === "gap" || v === "revenue" || v === "netProfit" || v === "marginChange" ? "desc" : "asc" });
  };
  // task #224 (results pack of 18 Nov, A1): every heading sorts, on the server, so the order covers every page. First click: numbers high to low, the company
  // name A to Z; second click: the other way; third: back to the page's own order (the most recently declared first). Figures need Silver, as before.
  const TEXT_KEYS = new Set(["company"]);
  const headSort: SortState = f.sort && f.sort !== "date" ? { key: f.sort, dir: TEXT_KEYS.has(f.sort) ? (f.dir === "asc" ? "desc" : "asc") : (f.dir === "asc" ? "asc" : "desc") } : null;
  const onHead = (k: string) => {
    const nx = nextSort(headSort, k);
    if (!nx) return set({ sort: "date", dir: "desc" });
    if (!["company", "marketCap"].includes(k) && !silver) return need("Sorting by results figures is part of every paid plan.");
    set({ sort: k, dir: TEXT_KEYS.has(k) ? (nx.dir === "desc" ? "asc" : "desc") : nx.dir });
  };
  const setScope = (scope: "all" | "watchlist" | "portfolio") => {
    if (scope !== "all" && !user) return need("Sign in to see only your watchlist or portfolio.");
    set({ scope });
  };
  const exportCsv = async () => {
    if (!silver) return need("Downloading the quarter's results is part of every paid plan.");
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

  const delayed = useResultsDelayedNote();
  // task #330: the quick fills (the five presets), in the Growth and price panel and the list at a glance
  const fills = [
    ...GROWTH_PRESETS.map((g) => { const on = activePreset(growth) === g.id && priceIsDefault(price); return { id: g.id, label: g.label, hint: g.hint, on, apply: () => setBoth(on ? DEFAULT_GROWTH : applyPreset(g), DEFAULT_PRICE) }; }),
    ...PRICE_PRESETS.filter((x) => x.growth).map((x) => { const on = activePricePreset(growth, price) === x.id; return { id: x.id, label: x.label, hint: x.hint, on, apply: () => setBoth(on ? DEFAULT_GROWTH : applyPreset(x.growth!), on ? DEFAULT_PRICE : x.price) }; }),
  ];
  const vc = d?.verdictCounts ?? null, vAll = vc ? Object.values(vc).reduce((a, n) => a + n, 0) + (total - (f.verdict && !off.has("verdict") ? (vc[f.verdict] ?? 0) : total)) : total;
  // every filter that is set, each with its own tick box and × (the chips under the bar)
  const coLabel = f.index ? INDICES.find(([k]) => k === f.index)?.[1] : f.scope === "watchlist" ? "My watchlist" : f.scope === "portfolio" ? "Equity portfolio" : "";
  const cellOn = (k: CellKey) => { const c = growth.cells[k]; return c.value.trim() !== "" && VALUE_RE.test(cleanValue(c.value)); };
  const sideLabel = (k: PriceKey) => { const x = price[k]; return x.band !== "" ? bandShort(Number(x.band)) + " below" : `${x.min.trim() || "0"}–${x.max.trim() || "∞"}% below`; };
  const applied: { k: string; label: string; clear: () => void }[] = [
    ...(f.q ? [{ k: "q", label: `Search: “${f.q}”`, clear: () => { setQuery(""); set({ q: "" }); } }] : []),
    ...(hasDate ? [{ k: "date", label: `Declared: ${describeSel(sel, today)}`, clear: () => setDates(null) }] : []),
    ...(coLabel ? [{ k: "co", label: `Companies: ${coLabel}`, clear: () => set({ scope: "all", index: "" }) }] : []),
    ...(f.industry ? [{ k: "industry", label: `Industry: ${short(f.industry)}`, clear: () => { set({ industry: undefined }); const n = new URLSearchParams(sp); n.delete("industry"); setSp(n, { replace: true }); } }] : []),
    ...(f.sector ? [{ k: "sector", label: `Sector: ${f.sector}`, clear: () => set({ sector: "" }) }] : []),
    ...(f.cap ? [{ k: "cap", label: `Size: ${f.cap} cap`, clear: () => set({ cap: "" }) }] : []),
    ...(f.status ? [{ k: "status", label: `Status: ${STATUSES.find(([v]) => v === f.status)?.[1] ?? f.status}`, clear: () => set({ status: "" }) }] : []),
    ...(f.verdict ? [{ k: "verdict", label: `Against its industry: ${f.verdict}`, clear: () => set({ verdict: undefined }) }] : []),
    ...(f.flagged ? [{ k: "flag", label: "Only flagged", clear: () => set({ flagged: false }) }] : []),
    ...GROWTH_CELLS.filter(cellOn).map((k) => { const [m, per] = CELL_OF[k], c = growth.cells[k];
      return { k: "g:" + k, label: `${GROWTH_METRICS.find(([x]) => x === m)?.[1]} ${per === "qoq" ? "QoQ" : "YoY"} ${opWords(c.op)} ${cleanValue(c.value)}%`, clear: () => setGrowth({ ...growth, cells: { ...growth.cells, [k]: DEFAULT_COND } }) }; }),
    ...PRICE_KEYS.filter((k) => sideOn(price[k])).map((k) => ({ k, label: `${k === "w52" ? "52-week high" : "All-time high"}: ${sideLabel(k)}`, clear: () => setPrice({ ...price, [k]: NO_SIDE }) })),
  ];
  const nAdv = GROWTH_CELLS.filter((k) => cellOn(k) && !off.has("g:" + k)).length + PRICE_KEYS.filter((k) => sideOn(price[k]) && !off.has(k)).length;
  const resetAll = () => { clearFilters(); const n = new URLSearchParams(sp); for (const k of ["off", "industry", "scope", "status", "q", "date", "from", "to", ...GROWTH_CELLS.flatMap((c) => [c + "Op", c + "Value"]), "join", ...PRICE_PARAM_KEYS]) n.delete(k); setSp(n, { replace: true }); setQuery(""); };
  const dateId = chipOn ?? (sel.date ? "day" : sel.from || sel.to ? "range" : "");
  const [dateMode, setDateMode] = useState<"" | "day" | "range">("");
  const showDay = dateMode === "day" || (dateId === "day" && dateMode !== "range"), showRange = dateMode === "range" || (dateId === "range" && dateMode !== "day");
  const coValue = f.index || (f.scope !== "all" ? f.scope : "all");
  const filterBar = (
    <div className="cx-bar" role="search" aria-label="Filter the companies">
      <form className="cx-q" onSubmit={(e) => { e.preventDefault(); set({ q: query.trim() }); }}>
        <Icon name="search" /><input type="search" value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) set({ q: "" }); }} placeholder="Find a company or symbol" aria-label="Find a company or symbol" maxLength={60} />
      </form>
      <label className={"cx-f" + (hasDate ? " set" : "")}>Declared
        <select value={showDay ? "day" : showRange ? "range" : dateId} aria-label="Declared" onChange={(e) => {
          const v = e.target.value;
          if (v === "day" || v === "range") { setDateMode(v); return; }
          setDateMode(""); if (!v) setDates(null); else { const c = chips.find((x) => x.id === v); if (c) apply(c.sel); }
        }}><option value="">Any date</option>{chips.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}<option value="day">Pick a day…</option><option value="range">Pick a range…</option></select></label>
      <label className={"cx-f" + (coLabel ? " set" : "")}>Companies
        <select value={coValue} aria-label="Companies" onChange={(e) => { const v = e.target.value; if (v === "all") set({ scope: "all", index: "" }); else if (v === "watchlist" || v === "portfolio") { set({ index: "" }); setScope(v); } else set({ scope: "all", index: v }); }}>
          <option value="all">All</option><option value="watchlist">My watchlist</option><option value="portfolio">Equity portfolio</option>{INDICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className={"cx-f" + (f.sector ? " set" : "")}>Sector
        <select value={f.sector || ""} onChange={(e) => set({ sector: e.target.value })} aria-label="Sector"><option value="">All sectors</option>{(d?.facets.sectors || []).map((x) => <option key={x.name} value={x.name}>{x.name} ({x.n})</option>)}</select></label>
      <label className={"cx-f" + (f.cap ? " set" : "")}>Size
        <select value={f.cap || ""} onChange={(e) => set({ cap: e.target.value })} aria-label="Size">{CAPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      {(showDay || showRange) && <div className="cx-dates" role="group" aria-label="Declared on">
        {showDay ? <label>Day <input type="date" max={today} value={sel.date || ""} onChange={(e) => (e.target.value ? apply({ date: e.target.value }) : setDates(null))} /></label> : <>
          <label>From <input type="date" max={draft.to || today} value={draft.from} onChange={(e) => { setDraft({ ...draft, from: e.target.value }); if (e.target.value) apply({ from: e.target.value, to: draft.to || undefined }); else if (hasDate) setDates(null); }} /></label>
          <label>To <input type="date" min={draft.from || undefined} max={today} value={draft.to} onChange={(e) => { setDraft({ ...draft, to: e.target.value }); if (draft.from) apply({ from: draft.from, to: e.target.value || undefined }); else if (e.target.value) setMsg("Choose the from date as well as the to date."); }} /></label></>}
        <span className="muted">{d?.dateMeaning || DATE_MEANING}</span>{msg && <span className="qr-dmsg" role="alert">{msg}</span>}</div>}
      <label className={"cx-f" + (f.status ? " set" : "")}>Status
        <select value={f.status || ""} onChange={(e) => set({ status: e.target.value })} aria-label="Status">{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <button type="button" className={"cx-btn" + (nAdv ? " set" : "")} aria-expanded={panel} aria-controls="cx-gp" onClick={() => setPanel((v) => !v)}>Growth and price filters{nAdv > 0 && <span className="cx-n">{nAdv}</span>} ▾</button>
      <span className="cx-flagw"><label className="sw"><input type="checkbox" checked={!!f.flagged} onChange={(e) => (silver ? set({ flagged: e.target.checked }) : need("The sales-and-profit flag is part of every paid plan."))} /><span aria-hidden="true" /><b>Only flagged</b></label><ChartHelp id="qr-gap" /></span>
      <span className="cx-end">
        <label className="cx-f">Sort by
          <select value={f.sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">{SORTS.map(([v, l, x]) => <option key={v} value={v}>{l}{x && !silver ? " (paid plans)" : ""}</option>)}{f.sort && !SORTS.some(([v]) => v === f.sort) && <option value={f.sort}>{HEAD_WORD[f.sort] ?? "The column you chose"}</option>}</select></label>
        <button type="button" className="cx-btn" aria-label={f.dir === "desc" ? "Highest first" : "Lowest first"} onClick={() => set({ dir: f.dir === "desc" ? "asc" : "desc" })}>{grouped ? (f.dir === "desc" ? "Newest first" : "Oldest first") : f.dir === "desc" ? "High to low" : "Low to high"}</button>
        <button type="button" className="cx-btn" disabled={!applied.length} onClick={resetAll}>Reset filters</button>
        <button type="button" className="cx-btn" onClick={exportCsv}>CSV{silver ? "" : " (paid plans)"}</button>
      </span>
    </div>
  );
  return (
    <div className="ipo qr sp rs rs-latest">
      {delayed && <div className="rc-stale" role="status" data-testid="results-delayed">{delayed}</div>}
      {dateErr && <div className="formerr qr-derr" role="alert">{dateErr} <button type="button" className="alx-link" onClick={() => setDates(null)}>Show the latest quarter</button></div>}
      {growthLocked && <div className="formerr" role="alert">Filtering by {growthOn(growth) ? "growth" : "price position"} is part of every paid plan. <button type="button" className="alx-link" onClick={() => need("Filtering by growth and price position is part of every paid plan.")}>See Silver</button> <button type="button" className="alx-link" onClick={() => setBoth(DEFAULT_GROWTH, DEFAULT_PRICE)}>Remove the {growthOn(growth) && priceOn(price) ? "filters" : growthOn(growth) ? "growth filter" : "price-position filter"}</button></div>}
      {res.isError && !dateErr && !growthLocked && <div className="formerr">The results could not be loaded. Please try again shortly. <Link to="/results">Open the results calendar</Link></div>}

      {locked && (
        <div className="pl-cap qr-cap"><Icon name="lock" /><span><b>Basic shows who declared and when.</b> Silver shows every figure, growth against last year and last quarter, margins, the copy-ready summary line, the sales-and-profit flag, all the sorting and filters, and a CSV download.</span>
          <button type="button" className="btn primary" onClick={() => need("Quarter results figures are part of every paid plan.")}>See Silver</button></div>
      )}

      <div className="cx">
        {filterBar}
        {panel && <div className="cx-gp" id="cx-gp">
          <div className="cx-gp-p"><GrowthPanel state={growth} onChange={setGrowth} summary={d?.growth} loading={res.isFetching} price={price} onPrice={setPrice} priceSummary={d?.price} onBoth={setBoth} onReset={() => setBoth(DEFAULT_GROWTH, DEFAULT_PRICE)} held={dateErr ? null : d?.priceStrip} /></div>
        </div>}
        {applied.length > 0 && <div className="cx-applied" role="group" aria-label="Filters applied">
          <span className="cx-ap-k">Filters applied<small>{applied.filter((a) => !off.has(a.k)).length} of {applied.length} on</small></span>
          {applied.map((a) => { const isOff = off.has(a.k); return (
            <span key={a.k} className={"cx-ap" + (isOff ? " off" : "")}>
              <label><input type="checkbox" className="cx-tk" checked={!isOff} onChange={() => setOffKeys([a.k], !isOff)} aria-label={`${isOff ? "Switch on" : "Switch off"}: ${a.label}`} /><span>{a.label}</span></label>
              <button type="button" aria-label={`Remove: ${a.label}`} onClick={() => { a.clear(); if (isOff) setOffKeys([a.k], false); }}>×</button>
            </span>); })}
          {applied.length > 1 && <>{off.size > 0 && <button type="button" className="alx-link" onClick={() => setOffKeys(applied.map((a) => a.k), false)}>Tick all</button>}
            {applied.some((a) => !off.has(a.k)) && <button type="button" className="alx-link" onClick={() => setOffKeys(applied.map((a) => a.k), true)}>Untick all</button>}</>}
        </div>}
        {f.q && !off.has("q") && d && !dateErr && !res.isFetching && <p className="qr-findnote" role="status">{total ? <><b>{nf(total, 0)}</b> {total === 1 ? "company matches" : "companies match"} “{f.q}” among the filtered results.</> : <>“{f.q}” is not in the filtered results. <button type="button" className="alx-link" onClick={() => { setQuery(""); set({ q: "" }); }}>Clear the search</button></>}</p>}
        <details className="cx-glance"><summary>The list at a glance <small>by size and by macro sector</small><span className="cv" aria-hidden="true">▾</span></summary>
          <GlanceCard dist={d?.distribution} growth={d?.growth} locked={!silver} fills={fills} /></details>
        <div className="cx-row2">
          <div className="sp-filters" role="group" aria-label="Against its industry">
            <button type="button" className={"sp-fbtn" + (!f.verdict ? " on" : "")} aria-pressed={!f.verdict} onClick={() => set({ verdict: undefined })}>All {nf(vAll, 0)}</button>
            {VERDICTS.map((v) => <button key={v} type="button" className={"sp-fbtn rs-fv-" + v.toLowerCase().replace(" ", "") + (f.verdict === v ? " on" : "")} aria-pressed={f.verdict === v}
              disabled={!!vc && !vc[v] && f.verdict !== v} onClick={() => (silver ? set({ verdict: f.verdict === v ? undefined : v }) : need("Each company's verdict against its industry is part of every paid plan."))}>{v}{vc ? ` · ${nf(vc[v] ?? 0, 0)}` : ""}</button>)}
          </div>
          <div className="cx-sets" role="group" aria-label="Columns">{COL_SETS.map(([k, l]) => <button key={k} type="button" aria-pressed={colSet === k} onClick={() => setColSet(k)}>{l}</button>)}</div>
        </div>
        <details className="sp-more rs-how cx-how"><summary>How we judge a result ▾</summary>
          <ol className="sp-steps">
            <li><b>Three checks.</b> Revenue growth from a year ago, profit growth from a year ago, and the change in profit margin.</li>
            <li><b>Against similar companies.</b> Each figure is compared with the typical company in the same industry this quarter. A bank is compared with banks, a carmaker with carmakers.</li>
            <li><b>Size does not count.</b> A small company faces the same yardstick as a large one in its industry. The size column is there for your information only.</li>
            <li><b>The verdict.</b> Strong: better than typical on most checks. Good: better on balance. In line: close to typical. Weak and Poor: worse on balance, or on most checks. Loss: the company lost money.</li>
          </ol>
          <p className="rs-legend"><span><b className="rs-ck up">▲</b> better than typical</span><span><b className="rs-ck flat">●</b> close to typical</span><span><b className="rs-ck down">▼</b> worse than typical</span><span><b className="rs-ck loss">✕</b> loss</span></p>
        </details>
        <section className="card qr-card cx-sec">
          <div className="card-h"><h3><span className="ci"><Icon name="notes" /></span>{q ? `${q.label}` : "Results"}<span className="muted qr-count"> · {nf(total, 0)} {total === 1 ? "company" : "companies"}</span></h3>
            <span className="muted qr-unit">₹ crore, except EPS (₹) and per cent</span></div>
          {hasDate && !off.has("date") && d && !dateErr && (
            <p className="qr-active" role="status">
              Showing companies {describeSel(sel, today)}{q ? ` for ${q.label}` : ""}: <b>{nf(total, 0)}</b>{filtersOn ? " after your filters" : ""}.
              {d.dates && d.dates.quarters.filter((x) => x.key !== q?.key).map((x) => <span key={x.key}> {nf(x.n, 0)} announced {x.label} results in this window: <button type="button" className="alx-link" onClick={() => { const n = new URLSearchParams(sp); n.set("quarter", x.key); setSp(n); setOffset(0); }}>view</button>.</span>)}
            </p>
          )}
          {dateErr ? null : res.isLoading && !d ? <div className="skeleton" style={{ height: 360 }} /> : !d?.rows.length && hasDate && !off.has("date") && d?.dates ? (
            <DateEmpty dates={d.dates} sel={sel} today={today} quarterLabel={q?.label || "quarter"} filtersOn={filtersOn} onPick={(day) => setDates({ date: day }, true)}
              onQuarter={(key) => { const n = new URLSearchParams(sp); n.set("quarter", key); setSp(n); setOffset(0); }} onClearFilters={clearFilters} />
          ) : !d?.rows.length ? (
            <div className="dw-empty"><span className="dw-ei"><Icon name="calendar" /></span><b>{d?.quarter ? "No companies match" : "No results dates yet"}</b><p>{d?.quarter ? (growthOn(effGrowth) || priceOn(effPrice) ? "No company meets the growth and price-position conditions you set. Try a wider band or lower threshold, or switch from Match all to Match any." : "Try removing a filter.") : "Results dates appear here as companies announce them."}</p>
              {f.scope === "watchlist" && <Link className="btn" to="/watchlist">Build a watchlist</Link>}{f.scope === "portfolio" && <Link className="btn" to="/holdings">Add holdings</Link>}</div>
          ) : (
            <TableZoom label="Results table">
            <div ref={tableTop} className="qr-ttop">{total > PAGE_SIZES[0] && <Pager at="top" offset={offset} total={total} size={size} onPage={goPage} onSize={pickSize} />}</div>
            <HScroll label="results table" className="qr-scroll">
              <CompaniesGrid rows={d.rows} set={colSet} sort={headSort} onSort={onHead} grouped={grouped} today={d.today || "9999"} days={days} locked={locked}
                onUnlock={() => need("Results figures, growth and margin are part of every paid plan.")}
                hits={(r, k) => cellHit(r, k === "revg" ? "revYoY" : k === "opg" ? "opYoY" : "npYoY", effGrowth.cells[k === "revg" ? "revYoY" : k === "opg" ? "opYoY" : "npYoY"])}
                phits={(r, k) => priceHit(r, k, effPrice[k])} />
            </HScroll>
            <div className="cx-foot">{total > PAGE_SIZES[0] ? <Pager at="bottom" offset={offset} total={total} size={size} onPage={goPage} onSize={pickSize} /> : <span>{nf(total, 0)} {total === 1 ? "company" : "companies"}</span>}</div>
            </TableZoom>
          )}
          <ReadNote />
        </section>
      </div>
    </div>
  );
}
