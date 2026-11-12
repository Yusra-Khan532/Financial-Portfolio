// The screen view: one prebuilt screen as a card (name, card text, match count, as-of date, how it works, its options) with a results table built from the response.
// Values come from the response only: a missing one is a dash, never zero, and nothing is ranked or recommended here.
import { titleOf, subOf, codeNote, exchangeTag, isBseOnly } from "../../../lib/companyLabel";
import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { ChartPanel, type PanelRow } from "../ChartPanel";
import { ChartCards } from "../ChartCards";
import { NO_BAR, useAsOn, usePresetHistory, usePresetLeft, type BarFilter, type LeftRow, type PresetTab } from "../../../lib/presets";
import { Link } from "react-router";
import { ApiError } from "../../../lib/api";
import { Icon } from "../../../lib/icons";
import { cr, dateIN, nf, MINUS } from "../../../lib/format";
import { useUI } from "../../../lib/ui";
import { HScroll } from "../../HScroll";
import { TableZoom } from "../../TableZoom";
import {
  DISCLAIMER, PAGE_SIZE, PLAN_OF, asPct, nextSortState, pageRange, rowsForTheme, sortPresetRows, usePresetDetail,
  type ColFormat, type PresetColumn, type PresetDetail, type PresetRow, type SortState, type Theme,
} from "../../../lib/presets";
import type { PresetRoute } from "./usePresetRoute";
import "../../../styles/presets.css";
import { CoLogo } from "../../CoLogo";
import { INFO, INFO_ASON, INFO_ASON_GAINERS, INFO_LEFT, PsxInfo } from "./PsxInfo";

const STATE_WORD: Record<Theme["state"], string> = { in_play: "In play", emerging: "Emerging", fading: "Fading", closest: "Closest to qualifying" };
const signed = (v: number, d = 1) => (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(Math.abs(v), d);
const BADGE_TONE: Record<string, string> = { "prism-confirmed": "good", provisional: "warn", "loss-making": "warn", "closest to qualifying": "info", "trend not confirmed": "warn", "not rated by prism": "plain" };
export const Badge = ({ text }: { text: string }) => <span className={"psx-b psx-b-" + (BADGE_TONE[text.trim().toLowerCase()] ?? "plain")}>{text}</span>;

/** One table cell in its column's format. A missing value is a dash. */
export function CellValue({ v, f }: { v: unknown; f: ColFormat }) {
  if (v == null || v === "") return <span className="psx-dash" aria-label="not available" title="not available">{MINUS}</span>;
  if (f === "badge") return <>{(Array.isArray(v) ? v : [v]).map((b) => <Badge key={String(b)} text={String(b)} />)}</>;
  if (f === "date" && typeof v === "string") return <>{dayLabel(v)}</>;
  if (typeof v !== "number") return <>{String(v)}</>;
  if (f === "since") return <>{signed(v)}%</>;
  if (f === "pct") return <>{signed(v)}%</>;
  /* A distance below a high is stored as a positive number; it is shown as a minus (the price is that far down). Zero stays 0.0%. */
  if (f === "pct_down") return <>{v === 0 ? "" : MINUS}{nf(Math.abs(v), 1)}%</>;
  if (f === "num1") return <>{v < 0 ? MINUS : ""}{nf(Math.abs(v), 1)}</>;
  if (f === "score") return <>{v < 0 ? MINUS : ""}{nf(Math.abs(Math.round(v)), 0)}</>;
  if (f === "cr") return <>{cr(v)}</>;
  return <>{String(v)}</>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : iso; };

function LeftList({ rows }: { rows: LeftRow[] }) {
  return (
    <section className="psx-left" aria-label="Left the list">
      <h3 className="psx-lh">Left the list <PsxInfo text={INFO_LEFT} label="Left the list" /></h3>
      {rows.length === 0 ? <p className="psx-lnone">No company has left this list since lists were first stored on 11 Nov 2026.</p> : <>
        <p className="psx-lnote">{rows.length} {rows.length === 1 ? "company" : "companies"} left this list in the last 2 months.</p>
        <div className="scr-tw"><table className="scr-t psx-t"><thead><tr><th scope="col">Company</th><th scope="col">Joined</th><th scope="col">Left</th><th scope="col">Sessions on the list</th><th scope="col">Price change while on it</th><th scope="col">Why it left</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.symbol + r.left_on}><td><Link to={`/stocks/${encodeURIComponent(r.symbol)}`}>{r.symbol}</Link></td><td>{dayLabel(r.added_on)}</td><td>{dayLabel(r.left_on)}</td><td>{r.sessions ?? MINUS}</td><td>{r.change_pct == null ? MINUS : signed(r.change_pct) + "%"}</td><td>{r.reason}</td></tr>)}</tbody></table></div></>}
    </section>);
}

const alignOf = (c: PresetColumn) => c.align ?? (c.format === "text" || c.format === "label" || c.format === "badge" ? "left" : "right");

function ThemeCards({ themes, on, onPick }: { themes: Theme[]; on: string | null; onPick: (industry: string) => void }) {
  return (
    <div className="psx-themes" role="group" aria-label="Themes. Choose one to show only its leaders.">
      {themes.map((t) => {
        const breadth = asPct(t.breadth), market = asPct(t.marketBreadth ?? null), pressed = on === t.industry;
        return (
          <button key={t.industry} type="button" className={"psx-th" + (pressed ? " is-on" : "")} aria-pressed={pressed} onClick={() => onPick(t.industry)}>
            <span className="psx-thh"><b>{t.industry}</b><span className={"psx-st psx-st-" + t.state}>{STATE_WORD[t.state] ?? t.state}</span></span>
            <span className="psx-thm">
              <span title="Share of the sector's companies within 15% of their 52-week high"><small>Near the high</small><b>{breadth == null ? MINUS : nf(breadth, 0) + "%"}</b>{market != null && <small>market {nf(market, 0)}%</small>}</span>
              <span title="3-month return of the sector against the market, in percentage points"><small>3M vs market</small><b>{t.rs3 == null ? MINUS : signed(t.rs3) + " pts"}</b></span>
              <span><small>Members</small><b>{t.members == null ? MINUS : nf(t.members, 0)}</b></span>
            </span>
            {t.reason && <span className="psx-thr">{t.reason}</span>}
          </button>);
      })}
    </div>);
}

function Results({ d, cols, rows, sort, setSort, tab }: { tab: PresetTab; d: PresetDetail; cols: PresetColumn[]; rows: PresetRow[]; sort: SortState; setSort: (k: string, first: 1 | -1) => void }) {
  const first = d.offset ?? 0;
  const [chart, setChart] = useState<PanelRow | null>(null);
  const [view, setView] = useState<"table" | "charts">("table"), [cards, setCards] = useState(9);
  const openRow = (r: PresetRow): PanelRow => ({ symbol: r.symbol, name: r.name, sector: r.sector as string | undefined, price: r.price as number | undefined, facts: r.facts as PanelRow["facts"], draw: r.draw as PanelRow["draw"], screen: d.id, prism: (r.prism_label as string | null | undefined) ?? null });
  const step = (dir: 1 | -1) => { const i = rows.findIndex((r) => r.symbol === chart?.symbol); const n = rows[i + dir]; if (i >= 0 && n) setChart(openRow(n)); };
  const head = (key: string, label: string, align: string, first: 1 | -1 = -1, cls = "") => (
    <th scope="col" className={"psx-a-" + align + (cls ? " " + cls : "")} aria-sort={sort?.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort(key, first)} aria-label={`Sort by ${label}`}>{label} <span aria-hidden="true">{sort?.key === key ? (sort.dir > 0 ? "▲" : "▼") : "▾"}</span></button>{INFO[key] && <PsxInfo text={INFO[key]} label={label} />}</th>);
  return (<>
    <div className="psx-view" role="group" aria-label="Table or charts"><button type="button" className={view === "table" ? "on" : ""} aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
      <button type="button" className={view === "charts" ? "on" : ""} aria-pressed={view === "charts"} onClick={() => setView("charts")}>Charts</button></div>
    {view === "charts" ? <><ChartCards rows={rows.slice(0, cards).map((r) => ({ ...openRow(r), facts: r.facts as PanelRow["facts"] }))} onOpen={(r) => setChart(r)} />{rows.length > cards && <button type="button" className="btn" onClick={() => setCards((n) => n + 9)}>Show 9 more of {rows.length} on this page</button>}</> :
    <TableZoom label={`${d.name}: results`}><HScroll className="scr-tw" label="results table" tall><table className="scr-t psx-t">
      <caption className="sr">{d.name}: {rows.length} {rows.length === 1 ? "company" : "companies"} shown{d.offset ? `, from number ${first + 1}` : ""}. Select a column heading to sort the shown rows.</caption>
      <thead><tr><th scope="col" className="psx-n fz1">#</th>{head("symbol", "Stock", "left", 1, "stick psx-stock fz2 fz-last")}{cols.map((c) => <Head key={c.key} c={c} h={head} />)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <Fragment key={r.symbol}>
        {d.topCount ? (r.top === true && (i === 0 || rows[i - 1].top !== true)
          ? <tr className="psx-band"><td colSpan={cols.length + 2}><span className="psx-bt">Top {d.topCount} · {tab === "basic" ? "the highest FinLit IQs" : "the strongest by this screen's score"}, at most three from one industry</span></td></tr>
          : r.top !== true && (i === 0 || rows[i - 1].top === true) && <tr className="psx-band"><td colSpan={cols.length + 2}><span className="psx-bt">{nf(Math.max(0, d.count - d.topCount), 0)} more {d.count - d.topCount === 1 ? "company passes" : "companies pass"} · ranked by the same score</span></td></tr>) : null}
        <tr className={chart?.symbol === r.symbol ? "cp-row" : ""} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,input,select")) setChart(openRow(r)); }}>
          <td className="psx-n fz1">{r.top === true ? <b className="psx-gold">{typeof r.rank === "number" ? r.rank : first + i + 1}</b> : (typeof r.rank === "number" ? r.rank : first + i + 1)}</td>
          <td className="stick psx-stock fz2 fz-last"><Link to={`/stocks/${encodeURIComponent(r.symbol)}`} className="psx-co"><CoLogo symbol={r.symbol} name={r.name} size={24} /><span className="psx-cn"><b title={codeNote(r)}>{titleOf(r)}</b>{subOf(r) && <small>{subOf(r)}</small>}{exchangeTag(r) && <small className="psx-ex">{exchangeTag(r)}</small>}</span></Link>
            {!!r.badges?.length && <span className="psx-bs">{r.badges.map((b) => <Badge key={b} text={b} />)}</span>}</td>
          {cols.map((c) => <td key={c.key} className={"psx-a-" + alignOf(c)}><CellValue v={r[c.key]} f={c.format} />{c.format === "since" && typeof r.bench_since_added_pct === "number" && <small className="psx-bench">NIFTY 500 {signed(r.bench_since_added_pct)}%</small>}</td>)}
        </tr></Fragment>))}
      </tbody>
    </table></HScroll></TableZoom>}
    {chart && <ChartPanel key={chart.symbol} row={chart} onClose={() => setChart(null)} onStep={step} />}</>);
}
const Head = ({ c, h }: { c: PresetColumn; h: (key: string, label: string, align: string, first?: 1 | -1) => ReactNode }) => <>{h(c.key, c.label, alignOf(c), c.format === "text" || c.format === "label" ? 1 : -1)}</>;

/** Previous / next 25 of a long screen, with where the page stands ("26–50 of 76"). Plain buttons, so the keyboard reaches them; the position is announced when it changes. */
function Pager({ d, range, busy, hidden, goTo }: { d: PresetDetail; range: { from: number; to: number; of: number }; busy: boolean; hidden: number; goTo: (offset: number) => void }) {
  const size = d.pageSize ?? PAGE_SIZE, off = d.offset ?? 0, left = Math.max(0, (d.available ?? d.count) - (off + d.shown));
  return (
    <nav className="psx-pager" aria-label="Pages of this screen">
      <p className="psx-pg-t" role="status" aria-live="polite">Showing <b>{nf(range.from, 0)}{"–"}{nf(range.to, 0)}</b> of <b>{nf(range.of, 0)}</b>{hidden > 0 && <small> ({hidden} listed only on the BSE hidden on this page)</small>}</p>
      <div className="psx-pg-b">
        <button type="button" className="btn" disabled={off <= 0 || busy} onClick={() => goTo(off - size)}>Previous {size}</button>
        <button type="button" className="btn primary" disabled={!d.hasMore || busy} onClick={() => goTo(off + size)}>Show next {Math.min(size, left) || size}</button>
      </div>
    </nav>);
}

function Misses({ d }: { d: PresetDetail }) {
  const list = (d.closestMisses ?? []).slice(0, 5);
  return (
    <div className="psx-empty">
      <p className="psx-eh" role="status">{d.emptyText || "No company meets every rule today."}</p>
      {list.length > 0 && <>
        <h3>The {list.length === 1 ? "company" : `${list.length} companies`} closest to qualifying</h3>
        <ol className="psx-miss">{list.map((m) => (
          <li key={m.symbol}><span className="psx-mh"><Link to={`/stocks/${encodeURIComponent(m.symbol)}`}><b title={codeNote(m)}>{titleOf(m)}</b></Link>{subOf(m) && <small>{subOf(m)}</small>}{exchangeTag(m) && <small className="psx-ex">{exchangeTag(m)}</small>}<Badge text="Closest to qualifying" /></span>
            <span className="psx-mr">{m.failed.length > 1 ? "Rules missed" : "Rule missed"}: {m.failed.join("; ")}</span></li>))}
        </ol></>}
    </div>);
}

function Frame({ route, name, cardText, children, actions, meta }: { route: PresetRoute; name: string; cardText?: string; children: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  const group = route.groups.find((g) => g.presets.some((p) => p.id === route.id))?.name;
  const eyebrow = `${route.tab === "basic" ? "Basic" : "Advanced"} · ${group ?? "Prebuilt screen"}`;
  return (
    <section className="psx-screen card" aria-label={`Prebuilt screen: ${name}`}>
      <header className="psx-top">
        <div className="psx-tt"><span className="psx-eyebrow">{eyebrow}</span><h2>{name}</h2>{cardText && <p className="psx-card-text">{cardText}</p>}{meta}</div>
        <div className="psx-act">{actions}<button type="button" className="btn" onClick={route.clear}>Clear screen</button></div>
      </header>
      {children}
    </section>);
}
const Disclaimer = ({ text }: { text?: string }) => <p className="psx-disc" role="note">{text || DISCLAIMER}</p>;

/** The screen named in the address. `route` is the shared route state (list, chips, choose, clear). */
export function ScreenView({ route }: { route: PresetRoute }) {
  const { id, preset, chips, list } = route;
  const { upgrade } = useUI();
  const plan = PLAN_OF[route.tab], planName = plan === "gold" ? "Gold" : "Silver";
  const listReady = list.isSuccess || list.isError;
  const unknown = list.isSuccess && !preset;
  const blocked = preset?.status === "blocked", lockedList = !!preset?.locked;
  const pageKey = `${id}|${[...chips].sort().join(",")}`;
  const [pg, setPg] = useState({ key: "", offset: 0 });
  const offset = pg.key === pageKey ? pg.offset : 0;                      // a new screen or a new option starts at the first 25
  const [asOn, setAsOnDay] = useAsOn();
  const [bar, setBar] = useState<BarFilter>(NO_BAR), [barOpen, setBarOpen] = useState(false);
  const q = usePresetDetail(id, chips, listReady && !unknown && !blocked && !lockedList, offset, asOn, bar);
  const hist = usePresetHistory(id, chips, listReady && !unknown && !blocked && !lockedList && preset?.kind !== "themes");
  const leftQ = usePresetLeft(id, chips, listReady && !unknown && !blocked && !lockedList && preset?.kind !== "themes" && preset?.kind !== "gainers");
  const d = q.data, err = q.error;
  const top = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<string | null>(null), [nseOnly, setNseOnly] = useState(false), [sort, setSortState] = useState<SortState>(null);
  const setSort = (k: string, first: 1 | -1) => setSortState((s) => nextSortState(s, k, first));
  const goTo = (o: number) => { setPg({ key: pageKey, offset: Math.max(0, o) }); window.setTimeout(() => top.current?.scrollIntoView?.({ block: "start" }), 0); };
  const themes = d?.themes ?? [];
  const activeTheme = themes.find((t) => t.industry === theme) ?? null;
  const cols = useMemo(() => (d?.columns ?? []).filter((c) => !["symbol", "name", "stock", "badges", "rank", "position"].includes(c.key)), [d]);
  const bseCount = useMemo(() => (d?.rows ?? []).filter(isBseOnly).length, [d]);
  const rows = useMemo(() => sortPresetRows(rowsForTheme(d?.rows ?? [], activeTheme), sort).filter((r) => !nseOnly || !isBseOnly(r)), [d, activeTheme, sort, nseOnly]);
  const name = d?.name ?? preset?.name ?? id ?? "";

  if (unknown) return (
    <section className="psx-screen card" aria-label="Prebuilt screen not found"><div className="psx-state"><h2>We could not find that screen</h2><p>There is no prebuilt screen called “{id}”. It may have been renamed or removed. Pick one from the list, or go back to the filters.</p>
      <button type="button" className="btn primary" onClick={route.clear}>Clear screen</button></div></section>);
  if (preset && blocked) return (
    <Frame route={route} name={preset.name} cardText={preset.cardText}><div className="psx-state"><h2>Coming soon</h2><p>{preset.blockedReason || "Coming soon: this screen needs data we do not hold yet."}</p></div><Disclaimer /></Frame>);
  if (lockedList || (err instanceof ApiError && err.status === 403)) return (
    <Frame route={route} name={name} cardText={preset?.cardText}><div className="psx-state psx-lock"><h2><Icon name="lock" /> This screen is part of {planName}</h2><p>{preset?.cardText ?? "Prebuilt screens narrow the whole market with ready-made rules."} Upgrade to see which companies it finds today.</p>
      <button type="button" className="btn primary" onClick={() => upgrade(plan, `Prebuilt screens on this page are part of ${planName}.`)}>Unlock with {planName} <Icon name="arrow" /></button></div><Disclaimer /></Frame>);
  if (err instanceof ApiError && err.status === 404 && err.body.status === "no_history") return (
    <Frame route={route} name={name} cardText={preset?.cardText}>
      <div className="psx-state" role="status"><h2>{asOn ? "Nothing is stored for that day" : preset?.kind === "gainers" ? "Top gainers has not started yet" : "No list is stored yet"}</h2>
        <p>{preset?.kind === "gainers" ? (asOn ? `No Top gainers are stored for the close of ${dayLabel(asOn)}. Pick another date, or go back to the latest close.` : "Top gainers starts once FinLit has stored a few days of screen lists. Lists have been stored since 11 Nov 2026.")
          : `This screen has no stored list for ${asOn ? dayLabel(asOn) : "that day"}. Lists have been stored since 11 Nov 2026.`}</p>
        {asOn && <button type="button" className="btn" onClick={() => setAsOnDay(null)}>Back to the latest close</button>}
        <button type="button" className="fgx-link" onClick={route.clear}>Back to the screens</button></div><Disclaimer /></Frame>);
  if (err instanceof ApiError && err.status === 404) return (
    <section className="psx-screen card" aria-label="Prebuilt screen not found"><div className="psx-state"><h2>We could not find that screen</h2><p>There is no prebuilt screen called “{id}”. Pick one from the list, or go back to the filters.</p>
      <button type="button" className="btn primary" onClick={route.clear}>Clear screen</button></div></section>);
  if (err && !d) return (
    <Frame route={route} name={name} cardText={preset?.cardText}><div className="psx-state" role="alert"><h2>This screen is unavailable right now</h2><p>Please try again in a moment.</p>
      <button type="button" className="btn" onClick={() => q.refetch()}>Try again</button></div><Disclaimer /></Frame>);

  const paged = !!d && d.pageSize != null && d.count > d.pageSize;      // more rows than one page: the pager shows, and the CSV holds all of them
  const range = d ? pageRange(d) : null;
  const meta = d ? (
    <p className="psx-meta"><b>{d.topCount ? `${nf(d.count, 0)} pass · the top ${d.topCount} first` : d.listText || `${nf(d.count, 0)} match`}</b>{!d.listText && !d.topCount && !paged && d.shown !== d.count && <span>showing {nf(d.shown, 0)}</span>}{paged && range && <span>showing {nf(range.from, 0)}{"–"}{nf(range.to, 0)}</span>}{d.asOf && <span>as of {dateIN(d.asOf)}</span>}</p>
  ) : preset ? <p className="psx-meta">{preset.count != null && <b>{preset.listText || `${nf(preset.count, 0)} match`}</b>}{preset.asOf && <span>as of {dateIN(preset.asOf)}</span>}</p> : null;
  const asOnEl = (hist.data?.sessions?.length ?? 0) > 0 ? (
        <div className="psx-ason">
          <label>As on <select value={asOn ?? ""} onChange={(e) => { setAsOnDay(e.target.value || null); setPg({ key: pageKey, offset: 0 }); }} aria-label="Show this screen as it stood after a past close">
            <option value="">Latest close · {dayLabel(hist.data!.sessions[0].date)}</option>
            {hist.data!.sessions.slice(1).map((s2) => <option key={s2.date} value={s2.date}>{dayLabel(s2.date)}{s2.rulesUpdated ? " · rules updated" : ""}</option>)}</select></label>
          <PsxInfo text={preset?.kind === "gainers" ? INFO_ASON_GAINERS : INFO_ASON} label="As on" />
          {asOn && <button type="button" className="fgx-link" onClick={() => setAsOnDay(null)}>Back to the latest close</button>}
        </div>
  ) : null;
  const how = d?.howItWorks?.length ? d.howItWorks : preset?.howItWorks ?? [];
  return (
    <Frame route={route} name={name} cardText={d?.cardText ?? preset?.cardText} meta={<>{meta}{asOnEl}</>}>
      {how.length > 0 && <details className="psx-how"><summary>How this screen works</summary><ul>{how.map((h) => <li key={h}>{h}</li>)}</ul></details>}
      {!!preset?.chips.length && (
        <div className="psx-chips" role="group" aria-label="Screen options">
          {preset.chips.map((c) => {
            const on = chips.includes(c.id), did = `psx-cd-${c.id}`;
            return (
              <div key={c.id} className="psx-chipw">
                <button type="button" className={"fgx-chip psx-chip" + (on ? " is-on" : "")} aria-pressed={on} aria-describedby={did} title={c.description || undefined} onClick={() => route.toggleChip(c.id)}>{on && <i aria-hidden="true">&#10003;</i>}{c.label}</button>
                {c.description && <small id={did}>{c.description}</small>}
              </div>);
          })}
        </div>)}
      {bseCount > 0 && (
        <div className="psx-chips" role="group" aria-label="Exchange">
          <div className="psx-chipw">
            <button type="button" className={"fgx-chip psx-chip" + (nseOnly ? " is-on" : "")} aria-pressed={nseOnly} aria-describedby="psx-cd-nse" onClick={() => setNseOnly((v) => !v)}>{nseOnly && <i aria-hidden="true">&#10003;</i>}NSE-listed only</button>
            <small id="psx-cd-nse">Leaves out the {bseCount} {bseCount === 1 ? "company" : "companies"} listed only on the BSE.</small>
          </div>
        </div>)}
      {d && (d.facets || bar !== NO_BAR) && d.shown >= 0 && (
        <div className="psx-bar" role="search" aria-label="Filter this screen">
          <input type="search" value={bar.q} onChange={(e) => { setBar({ ...bar, q: e.target.value }); setPg({ key: pageKey, offset: 0 }); }} placeholder="Search company or sector" aria-label="Search this screen" />
          {(["Large", "Mid", "Small"] as const).map((z) => (d.facets?.sizes[z] ?? 0) > 0 || bar.sizes.includes(z) ? <button key={z} type="button" className={"fgx-chip psx-chip" + (bar.sizes.includes(z) ? " is-on" : "")} aria-pressed={bar.sizes.includes(z)}
            onClick={() => { setBar({ ...bar, sizes: bar.sizes.includes(z) ? bar.sizes.filter((x) => x !== z) : [...bar.sizes, z] }); setPg({ key: pageKey, offset: 0 }); }}>{z} cap{d.facets ? ` · ${d.facets.sizes[z] ?? 0}` : ""}</button> : null)}
          {(d.facets?.strong ?? 0) > 0 && <button type="button" className={"fgx-chip psx-chip" + (bar.strong ? " is-on" : "")} aria-pressed={bar.strong} onClick={() => { setBar({ ...bar, strong: !bar.strong }); setPg({ key: pageKey, offset: 0 }); }}>Only Strong or Healthy · {d.facets!.strong}</button>}
          {!!d.facets?.sectors.length && <button type="button" className="btn" aria-expanded={barOpen} onClick={() => setBarOpen((v) => !v)}>+ Add a filter{bar.sectors.length ? ` · ${bar.sectors.length}` : ""}</button>}
          {bar !== NO_BAR && (bar.q || bar.sizes.length || bar.sectors.length || bar.strong) && <button type="button" className="fgx-link" onClick={() => { setBar(NO_BAR); setPg({ key: pageKey, offset: 0 }); }}>Clear all</button>}
          {barOpen && !!d.facets?.sectors.length && <div className="psx-barp" role="group" aria-label="Industry"><b>Industry</b>{d.facets.sectors.map(([n, c]) => <label key={n}><input type="checkbox" checked={bar.sectors.includes(n)}
            onChange={() => { setBar({ ...bar, sectors: bar.sectors.includes(n) ? bar.sectors.filter((x) => x !== n) : [...bar.sectors, n] }); setPg({ key: pageKey, offset: 0 }); }} /> {n} <small>{c}</small></label>)}</div>}
          {typeof d.filtered === "number" && d.filtered !== d.count && <small className="muted">{nf(d.filtered, 0)} of {nf(d.count, 0)} shown</small>}
        </div>)}
      {d?.asOn && <p className="psx-notes" role="status">The list as it stood after the close of {dayLabel(d.asOn)}: {nf(d.count, 0)} {d.count === 1 ? "company" : "companies"}.{typeof d.benchSincePct === "number" && <> Since then NIFTY 500 has moved {signed(d.benchSincePct)}%.</>}</p>}
      {d?.heading && <p className="psx-notes" role="note">{d.heading}</p>}
      {!!d?.notes?.length && <div className="psx-notes" role="note">{d.notes.map((n) => <p key={n}>{n}</p>)}</div>}
      {themes.length > 0 && <ThemeCards themes={themes} on={theme} onPick={(i) => setTheme((t) => (t === i ? null : i))} />}
      <div ref={top} className={"psx-res" + (q.isFetching && d ? " is-busy" : "")} aria-busy={q.isFetching}>
        {!d ? <div className="skeleton" style={{ height: 300 }} role="status" aria-label="Loading the screen" />
          : d.count === 0 || (!d.rows.length) ? <Misses d={d} />
          : <>
            {activeTheme && <p className="psx-filt" role="status">Showing the leaders of {activeTheme.industry}. <button type="button" className="fgx-link" onClick={() => setTheme(null)}>Show all</button></p>}
            <p className="sr" role="status" aria-live="polite">{rows.length} {rows.length === 1 ? "company" : "companies"} shown.</p>
            {rows.length ? <Results d={d} tab={route.tab} cols={cols} rows={rows} sort={sort} setSort={setSort} /> : <p className="psx-filt">{nseOnly ? "Every company shown for this screen is listed only on the BSE. Switch off NSE-listed only to see them." : "No leaders are listed for this theme today."}</p>}
            {paged && range && <Pager d={d} range={range} busy={q.isFetching} hidden={nseOnly ? bseCount : 0} goTo={goTo} />}
          </>}
      </div>
      {leftQ.isSuccess && !!d?.rows.length && <LeftList rows={leftQ.data?.left ?? []} />}
      {d?.rankScoreNote && !!d.rows.length && <p className="psx-notes" role="note">{d.rankScoreNote}</p>}
      <Disclaimer text={d?.disclaimer} />
    </Frame>);
}
