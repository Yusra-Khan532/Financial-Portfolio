// /etfs: every ETF listed on the NSE. Search that forgives spaces and typos, filters, sortable columns you can choose, and a compare tray.
import { PageHeader } from "../components/PageHeader";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import {
  COLUMNS, COL_BY, DEFAULT_COLS, DEFAULT_STATE, FILTERS, MAX_COMPARE, PAGE, activeFilters, day, nextSort, parseState, rupee, shortWhy, toParams, useEtfList, useTray, whyBlank,
  type Col, type ColKey, type EtfItem, type FilterKey, type ListState,
} from "../lib/etf";
import { Blank, DataNote, ErrorState, GlossInfo, Skeleton, Tone } from "./common";
import { isBoolMap, isIdList, loadUi, saveUi } from "../lib/persist";
import type { Glossary } from "../lib/api";
import { Info } from "../components/Info";
import { CheckRow, Chev } from "../components/screener/FilterGroup";
import "../styles/fgx.css";
import "../styles/etf351.css";
import "../styles/task354.css";   // task #354: the Hide filters outline
import "../styles/etfvs.css";

const COLS_KEY = "etf-cols";   // versioned by lib/persist: a different version or unknown column ids fall back to the default
const COL_IDS: ReadonlySet<string> = new Set(Object.keys(COL_BY));
// version 4 (task #133): expense ratio, price vs NAV and traded a day are on by default, so an older saved choice starts from the new default
const readCols = (): ColKey[] => loadUi<ColKey[]>(COLS_KEY, 4, isIdList<ColKey>(COL_IDS), DEFAULT_COLS);
const saveCols = (c: ColKey[]) => { saveUi(COLS_KEY, 4, c); };
const TOP_CATS = 12;   // categories shown before "Show all" (the most used first, as the API sends them)

function Cell({ c, i }: { c: Col; i: EtfItem }) {
  const v = c.get(i);
  const k = ` etf-c-${c.key}`;
  if (v == null) { const why = whyBlank(i, c); return <td className={(c.num ? "num" : "") + k}><Blank why={why} short={shortWhy(why)} /></td>; }
  if (c.key === "change" || c.key.startsWith("ret") || c.key === "premium") return <td className={"num" + k}><Tone v={v as number}>{c.text(i)}</Tone></td>;
  return <td className={(c.num ? "num" : "etf-txt") + k}>{c.text(i)}</td>;
}

const NARROW = "(max-width: 900px)";
const narrow = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(NARROW).matches;
/** Phone and small-tablet width, kept up to date: the filters are then a drawer (task #351). */
function useNarrow(): boolean {
  const [n, setN] = useState(narrow);
  useEffect(() => { const m = window.matchMedia?.(NARROW); if (!m) return; const f = () => setN(m.matches); f(); m.addEventListener?.("change", f); return () => m.removeEventListener?.("change", f); }, []);
  return n;
}
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

/** The (i) beside each filter group: what it is, what it includes, how ticking it changes the result (task #351; the rules of lib/etf and the ETF API). */
const HELP: Record<"type" | "category" | "ranges", Glossary> = {
  type: { key: "etf.type", label: "Type", what: "The kind of asset the ETF holds: Equity, Gold, Silver, Debt, International or Blend. It follows from the category its registered name matches.",
    read: "Tick one or more types: an ETF of any ticked type is kept. With Category and Ranges set too, an ETF must pass each of them." },
  category: { key: "etf.category", label: "Category", what: "What the ETF follows (an index, a sector, a metal or a strategy), read from its registered name in AMFI's register. Where the name does not say clearly, the category is left blank rather than guessed.",
    read: "Tick one or more categories: an ETF in any ticked category is kept. The number beside each is how many ETFs it has." },
  ranges: { key: "etf.ranges", label: "Ranges", what: "The 1-year price return and the 5-year price return (the total change over five years, not a yearly rate), in percent. Dividends are not included.",
    read: "Type a from, a to, or both (both ends count). An ETF with no figure for a chosen range is left out, and the number left out is shown below the table." },
};

/** One filter group of the panel: a heading that folds the group, its (i), and how many choices are on (task #351). */
function FSec({ id, title, help, on, children, open, setOpen }: { id: string; title: string; help: Glossary; on: number; children: ReactNode; open: boolean; setOpen: (o: boolean) => void }) {
  return (
    <section className={"etf-fs" + (open ? " is-open" : "")}>
      <div className="etf-fs-h">
        <button type="button" className="etf-fs-t" aria-expanded={open} aria-controls={`etf-fs-${id}`} onClick={() => setOpen(!open)}>
          <span>{title}</span>{on > 0 && <span className="etf-fs-n">{on} on</span>}<span className="etf-chev"><Chev /></span></button>
        <Info g={help} />
      </div>
      <div id={`etf-fs-${id}`} className="etf-fs-b" hidden={!open}>{children}</div>
    </section>);
}

export function EtfListPage() {
  useDocTitle("ETFs", "Every exchange-traded fund listed on the NSE: price, returns, risk and how it compares. Information only.");
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => parseState(sp), [sp]);
  const [cols, setCols] = useState<ColKey[]>(readCols);
  const { data, isLoading, isError, isFetching, refetch } = useEtfList(state);
  const { tray, has, toggle, full, remove, clear } = useTray();
  const small = useNarrow();
  // task #351: the filters sit in a panel on the left of the table (open on arrival, as task #133 asked); "Hide filters" folds the panel away and the table takes
  // the width. On a phone the panel is a drawer opened from "Filters". The choice is kept in this browser.
  const [fOpen, setFOpenRaw] = useState(() => loadUi("etf.filters", 1, isBool, true)), [drawer, setDrawer] = useState(false);
  const setFOpen = (o: boolean) => { setFOpenRaw(o); saveUi("etf.filters", 1, o); };
  const [secs, setSecs] = useState<Record<string, boolean>>(() => loadUi("etf.fsecs", 1, isBoolMap, {}));
  const sec = (id: string) => ({ open: secs[id] ?? true, setOpen: (o: boolean) => { const n = { ...secs, [id]: o }; setSecs(n); saveUi("etf.fsecs", 1, n); } });
  const [openCols, setOpenCols] = useState(false);
  const [allCats, setAllCats] = useState(false);
  const [typed, setTyped] = useState(state.q);
  const update = (patch: Partial<ListState>) => setSp(toParams({ ...state, offset: 0, ...patch }), { replace: true });

  // typing waits a moment before it asks the server; the address bar (back button, shared link) can also change the box
  useEffect(() => { setTyped(state.q); }, [state.q]);
  useEffect(() => {
    if (typed.trim() === state.q) return;
    const h = window.setTimeout(() => update({ q: typed.trim() }), 250);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);
  useEffect(() => { if (!drawer) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [drawer]);
  const shown = useMemo(() => COLUMNS.filter((c) => cols.includes(c.key)), [cols]);
  const setCol = (k: ColKey, on: boolean) => { const n = COLUMNS.map((c) => c.key).filter((x) => (x === k ? on : cols.includes(x))); setCols(n); saveCols(n); };

  const items = data?.items ?? [];
  // the 36px fade at the table's right edge while more columns are hidden there (task #351)
  const tw = useRef<HTMLDivElement>(null), [more, setMore] = useState(false);
  const measure = () => { const el = tw.current; setMore(!!el && el.scrollLeft < el.scrollWidth - el.clientWidth - 2); };
  useEffect(() => {
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (tw.current) ro?.observe(tw.current);
    return () => ro?.disconnect();
  }, [items.length, cols, fOpen, small]);   // eslint-disable-line react-hooks/exhaustive-deps
  const from = data && data.total ? data.offset + 1 : 0, to = data ? Math.min(data.total, data.offset + items.length) : 0;
  const nOn = activeFilters(state);
  const filtered = nOn > 0 || !!state.q;
  const resetFilters = () => setSp(toParams({ ...DEFAULT_STATE, q: state.q, sort: state.sort, order: state.order }), { replace: true });
  const panelShown = small ? drawer : fOpen;

  const panel = (
    <>
      <div className="etf-side-h">
        <span className="etf-side-t" id="etf-filters-h">Filters</span>{nOn > 0 && <span className="etf-fs-n">{nOn} on</span>}
        {small ? <button type="button" className="btn sm etf-reset" onClick={() => setDrawer(false)} aria-label="Close the filters">Close</button>
          : <button type="button" className="btn sm etf-reset" disabled={nOn === 0} onClick={resetFilters}>Reset all</button>}
      </div>
      <FSec id="type" title="Type" help={HELP.type} on={state.asset.length} {...sec("type")}>
        <ul className="fgx-list etf-opts" aria-label="Type">{(data?.groups ?? []).filter((g) => g.count || state.asset.includes(g.key)).map((g) => (
          <li key={g.key}><CheckRow label={g.label} count={g.count} checked={state.asset.includes(g.key)}
            onChange={() => update({ asset: state.asset.includes(g.key) ? state.asset.filter((x) => x !== g.key) : [...state.asset, g.key] })} /></li>))}</ul>
      </FSec>
      <FSec id="category" title="Category" help={HELP.category} on={state.category.length} {...sec("category")}>
        <ul className="fgx-list etf-opts" aria-label="Category">{(data?.categories ?? []).filter((c, n) => allCats || n < TOP_CATS || state.category.includes(c.key)).map((c) => (
          <li key={c.key}><CheckRow label={c.label} count={c.count} checked={state.category.includes(c.key)}
            onChange={() => update({ category: state.category.includes(c.key) ? state.category.filter((x) => x !== c.key) : [...state.category, c.key] })} /></li>))}</ul>
        {(data?.categories.length ?? 0) > TOP_CATS && <button type="button" className="fgx-link etf-allcats" aria-expanded={allCats} onClick={() => setAllCats((a) => !a)}>{allCats ? "Show fewer" : `Show all ${data!.categories.length}`}</button>}
      </FSec>
      <FSec id="ranges" title="Ranges" help={HELP.ranges} on={Object.keys(state.bounds).length} {...sec("ranges")}>
        <div className="etf-ranges">{FILTERS.map((f) => <RangeBox key={f.key} k={f.key} label={f.label} value={state.bounds[f.key]} onCommit={(b) => { const bounds = { ...state.bounds }; if (b[0] == null && b[1] == null) delete bounds[f.key]; else bounds[f.key] = b; update({ bounds }); }} />)}</div>
        <p className="fgx-note etf-rnote">An ETF with no figure for a chosen range is left out, and counted below the table.</p>
      </FSec>
      {small && <div className="etf-side-f"><button type="button" className="btn" disabled={nOn === 0} onClick={resetFilters}>Reset</button>
        <button type="button" className="btn primary" onClick={() => setDrawer(false)}>Show {data ? data.total : ""} ETF{data?.total === 1 ? "" : "s"}</button></div>}
    </>);

  return (
    <>
      <PageHeader wrap plan="free" title="ETFs on the NSE" art="funds" links={["/etfs/compare", { to: "/etfs/compare-index-funds", gold: true }, "/funds"]}
        description="Price and 1-day, 1-year and 5-year returns of every NSE ETF; search, filter, compare up to four."
        stats={[{ icon: "layers", value: data ? data.universe : null, label: "ETFs listed" }]} />

      <div className="wrap etf-page etf-list">
        <div className={"etf-layout" + (!small && !fOpen ? " is-shut" : "")}>
          {small ? (
            <>
              {drawer && <div className="scrim etf-dback" aria-hidden="true" onClick={() => setDrawer(false)} />}
              <aside className={"etf-side etf-drawer" + (drawer ? " is-open" : "")} id="etf-filters" role="dialog" aria-modal="true" aria-labelledby="etf-filters-h" hidden={!drawer}>{panel}</aside>
            </>
          ) : fOpen ? <aside className="card etf-side" id="etf-filters" aria-labelledby="etf-filters-h">{panel}</aside> : null}

          <div className="etf-main">
            <div className="etf-tools">
              <button type="button" className={"btn etf-ftog" + (panelShown ? " is-on" : "")} aria-expanded={panelShown} aria-controls="etf-filters"
                onClick={() => (small ? setDrawer(true) : setFOpen(!fOpen))}><Icon name="panel" />{small ? "Filters" : fOpen ? "Hide filters" : "Show filters"}{nOn ? <b className="etf-ftog-n" aria-label={`${nOn} on`}>{nOn}</b> : null}</button>
              <label className="etf-search"><Icon name="search" /><span className="sr-only">Search ETFs by name, symbol, fund house or ISIN</span>
                <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search: nifty bank, gold, liquid, HDFC, INF204KB14I2…" autoComplete="off" spellCheck={false} maxLength={60} />
              </label>
              <div className="etf-colwrap">
                <button type="button" className={"btn" + (openCols ? " is-on" : "")} aria-expanded={openCols} aria-controls="etf-cols" onClick={() => setOpenCols((o) => !o)}><Icon name="table" />Columns</button>
                {openCols && (
                  <div className="etf-pop" id="etf-cols" role="group" aria-label="Choose the columns">
                    <div className="etf-pop-h"><b>Columns</b><button className="alx-link" onClick={() => { setCols(DEFAULT_COLS); saveCols(DEFAULT_COLS); }}>Reset</button></div>
                    {COLUMNS.map((c) => (
                      <label key={c.key} className="etf-check"><input type="checkbox" checked={cols.includes(c.key)} onChange={(e) => setCol(c.key, e.target.checked)} /><span><b>{c.label}</b><small>{c.help}</small></span></label>))}
                  </div>)}
              </div>
            </div>

            <div className="etf-countrow">
              <p className="etf-count" role="status" aria-live="polite">
                {isLoading ? "Loading ETFs…" : data ? <>Showing <b>{from}–{to}</b> of <b>{data.total}</b> ETFs{data.total < data.universe ? <> (filtered from {data.universe})</> : null}{data.asOf ? <> · prices are NSE closes of {day(data.asOf)}</> : null}{isFetching ? " · updating…" : ""}</> : ""}
              </p>
              {filtered && <button type="button" className="fgx-link" onClick={() => { setTyped(""); setSp(toParams({ ...DEFAULT_STATE, sort: state.sort, order: state.order }), { replace: true }); }}>Clear search and filters</button>}
            </div>
            {data && data.hotCount ? <p className="etf-foot faint etf-hotnote">The {data.hotCount} most traded open at once; the other {data.universe - data.hotCount} take a moment longer.</p> : null}

            {isError && !data ? <ErrorState what="The ETF list" onRetry={() => refetch()} /> : isLoading ? <Skeleton /> : (
              <>
                {items.length === 0 ? (
                  <div className="etf-state"><h2>No ETF matches</h2><p>{state.q ? `Nothing found for “${state.q}” with these filters. Check the spelling or clear a filter.` : "No ETF fits these filters."}</p>
                    <button className="btn" onClick={() => { setTyped(""); setSp(new URLSearchParams(), { replace: true }); }}>Clear search and filters</button></div>
                ) : (
                  <div className={"tw etf-tw" + (more ? " has-more" : "")} tabIndex={0} role="region" aria-label="ETF table. Scroll sideways for more columns." ref={tw} onScroll={measure}>
                    <table className="etf-table">
                      <caption className="sr-only">Exchange-traded funds on the NSE. Returns are price returns.</caption>
                      <thead><tr>
                        <th scope="col" className="etf-first" aria-sort={state.sort === "name" ? (state.order === "asc" ? "ascending" : "descending") : "none"}>
                          <button className="etf-sort" onClick={() => update(nextSort(state, "name"))}>ETF{state.sort === "name" ? (state.order === "asc" ? " ▲" : " ▼") : ""}</button></th>
                        {shown.map((c) => (
                          <th key={c.key} scope="col" className={(c.num ? "num" : "") + ` etf-c-${c.key}`} aria-sort={c.sort && state.sort === c.sort ? (state.order === "asc" ? "ascending" : "descending") : "none"}>
                            {c.sort ? <button className="etf-sort" onClick={() => update(nextSort(state, c.sort!))} title={c.help}>{c.short}{state.sort === c.sort ? (state.order === "asc" ? " ▲" : " ▼") : ""}</button> : <span title={c.help}>{c.short}</span>}
                            {c.term && <GlossInfo name={c.term} fallback={c.help} />}
                          </th>))}
                      </tr></thead>
                      <tbody>{items.map((i) => (
                        <tr key={i.symbol} className={has(i.symbol) ? "is-picked" : undefined}>
                          <th scope="row" className="etf-first etf-name">
                            <div className="etf-nm">
                              <label className="etf-cbl" title={!has(i.symbol) && full ? `You can compare up to ${MAX_COMPARE} ETFs` : `Add to compare (up to ${MAX_COMPARE})`}>
                                <input type="checkbox" className="etf-cb" checked={has(i.symbol)} disabled={!has(i.symbol) && full} onChange={() => toggle(i.symbol)} aria-label={`Compare ${i.name}`} /></label>
                              <div><Link to={`/etfs/${encodeURIComponent(i.symbol)}`}>{i.name}</Link>
                                <div className="etf-sub"><span className="mono">{i.symbol}</span><span className="etf-pricem mono">{i.price == null ? "" : rupee(i.price)}</span></div></div>
                            </div>
                          </th>
                          {shown.map((c) => <Cell key={c.key} c={c} i={i} />)}
                        </tr>))}</tbody>
                    </table>
                  </div>)}
                {data && data.total > PAGE && (
                  <nav className="etf-pager" aria-label="Pages">
                    <button className="btn" disabled={state.offset === 0} onClick={() => update({ offset: Math.max(0, state.offset - PAGE) })}>← Previous {PAGE}</button>
                    <span>{from}–{to} of {data.total}</span>
                    <button className="btn" disabled={to >= data.total} onClick={() => update({ offset: state.offset + PAGE })}>Next {PAGE} →</button>
                  </nav>)}
                {tray.length > 0 && <CompareBar tray={tray} remove={remove} clear={clear} />}
                <p className="etf-foot faint">— means the figure is not available; the word under it says why (hover or open the ETF for the full reason). 1 day is the change from the previous close. 1 year and 5 years are price returns; 5 years is the total change over the five years, not a yearly rate. Dividends are not included. Expense ratio: a year, from AMFI's TER file or the fund house's own figure. Price vs NAV: the last close against AMFI's NAV of the same day. Traded a day: the average over the last 20 sessions. More periods, risk and the chart are on each ETF's page.</p>
                {data && data.excluded > 0 && <p className="etf-foot">{data.excluded} ETF{data.excluded === 1 ? " was" : "s were"} left out because {data.excluded === 1 ? "it has" : "they have"} no figure for a range you chose (for example, listed less than a year).</p>}
              </>)}

            <p className="etf-foot faint">Categories are read from each fund's registered name (AMFI); where the name does not say clearly, the category is left blank rather than guessed.</p>
            <DataNote asOf={data?.asOf} updatedAt={data?.updatedAt} source={data?.source} />
          </div>
        </div>
      </div>
    </>
  );
}

/** The ETFs ticked to compare (up to four), under the table (task #133). */
function CompareBar({ tray, remove, clear }: { tray: string[]; remove: (s: string) => void; clear: () => void }) {
  return (
    <aside className="etf-cbar" aria-label="ETFs chosen to compare">
      <span className="etf-tray-l">Compare {tray.length}/{MAX_COMPARE}</span>
      <ul>{tray.map((s) => <li key={s}><span className="mono">{s}</span><button aria-label={`Remove ${s} from the comparison`} onClick={() => remove(s)}>×</button></li>)}</ul>
      <button className="alx-link" onClick={clear}>Clear</button>
      {tray.length >= 2 ? <Link className="btn primary" to={`/etfs/compare?symbols=${tray.join(",")}`}>Compare {tray.length} ETFs <Icon name="arrow" /></Link> : <span className="faint">Tick one more to compare</span>}
    </aside>
  );
}

/** From / to inputs for one range. Applied when the box loses focus or Enter is pressed; letters are ignored. */
function RangeBox({ k, label, value, onCommit }: { k: FilterKey; label: string; value: [number | null, number | null] | undefined; onCommit: (b: [number | null, number | null]) => void }) {
  const [lo, setLo] = useState(value?.[0] != null ? String(value[0]) : ""), [hi, setHi] = useState(value?.[1] != null ? String(value[1]) : "");
  const last = useRef(value);
  useEffect(() => { if (last.current !== value) { last.current = value; setLo(value?.[0] != null ? String(value[0]) : ""); setHi(value?.[1] != null ? String(value[1]) : ""); } }, [value]);
  const parse = (s: string): number | null => (s.trim() === "" || !Number.isFinite(Number(s)) || Math.abs(Number(s)) > 100000 ? null : Number(s));
  const bad = (s: string) => s.trim() !== "" && parse(s) == null;
  const commit = () => { const b: [number | null, number | null] = [parse(lo), parse(hi)]; if (b[0] !== (value?.[0] ?? null) || b[1] !== (value?.[1] ?? null)) onCommit(b); };
  const key = (e: React.KeyboardEvent) => { if (e.key === "Enter") commit(); };
  return (
    <fieldset className="etf-range"><legend>{label}</legend>
      <label><span className="sr-only">{label}, from (percent)</span><input inputMode="decimal" value={lo} placeholder="from" aria-invalid={bad(lo)} onChange={(e) => setLo(e.target.value)} onBlur={commit} onKeyDown={key} /></label>
      <span aria-hidden="true">to</span>
      <label><span className="sr-only">{label}, to (percent)</span><input inputMode="decimal" value={hi} placeholder="to" aria-invalid={bad(hi)} onChange={(e) => setHi(e.target.value)} onBlur={commit} onKeyDown={key} /></label>
      <span className="faint" aria-hidden="true">%</span>
      <span className="sr-only" id={`r-${k}`}>Percent. Leave a box empty for no limit.</span>
    </fieldset>
  );
}
