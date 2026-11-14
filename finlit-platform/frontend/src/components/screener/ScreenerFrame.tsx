// The page frame both score screeners share: header, filter sidebar (quick views, size, sector, then the page's own filters), summary tiles, active-filter
// chips, sector mix, the results table with selection, compare, watchlist and CSV, and the pager. The page supplies the model-specific parts.
import { titleOf, subOf, codeNote } from "../../lib/companyLabel";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { HScroll } from "../HScroll";
import { TableZoom } from "../TableZoom";
import { SplitDivider, useSideWidth } from "../SplitDivider";
import { Plain } from "../Plain";
import { ChartHelp } from "../ChartHelp";
import { Icon } from "../../lib/icons";
import { cr, nf } from "../../lib/format";
import { watch } from "../../lib/watchlist";
import { CAPS, PAGE_SIZES, pageList, type SortKey } from "../../lib/scoreScreen";
import type { Plan } from "../../lib/ui";
import { useAuth } from "../../lib/auth";
import { CheckRow, FgxFocus, FilterGroup, SearchBox } from "./FilterGroup";
import { SectorBars, SortMenu, Toolbar } from "./PageParts";
import { TierChip } from "../Gate";
import "../../styles/fgx.css";
import type { PageHeaderProps } from "../PageHeader";
import { Dash } from "./cells";
import { FindStocksTabs } from "./FindStocksTabs";
import type { Screener } from "./useScreener";
import { CoLogo } from "../CoLogo";
import { ChartPanel, type PanelRow } from "./ChartPanel";

export type Tile = [label: string, value: string, why?: string];

/** The coloured group row above the column names. Only the one-column "Company" band is sticky (a band over six columns used to stay pinned at the left
 *  and cover every other group's label). The checkbox and # columns, and the Action column, have no band. */
export function GroupRow({ groups }: { groups: { g: string; n: number; label: string; sub?: string }[] }) {
  return (
    <tr className="gh tg-row">
      <th colSpan={2} aria-hidden="true" className="tg-none fz1" />
      <th scope="colgroup" data-g="company" className="stick fz3 fz-last">Company</th>
      <th scope="colgroup" colSpan={3} data-g="price"><span className="gh-lab">Price &amp; size</span></th>
      {groups.map((x) => <th key={x.g} scope="colgroup" colSpan={x.n} data-g={x.g}><span className="gh-lab">{x.label}{x.sub && <span className="gh-sub">{x.sub}</span>}</span></th>)}
      <th aria-hidden="true" className="tg-none" />
    </tr>
  );
}

export function SortTh({ s, k, label, cls = "", help, title, of }: { s: Screener; k: SortKey; label: string; cls?: string; help?: string; title?: string; of?: string }) {
  const { sort } = s;
  return (
    <th scope="col" className={cls} data-of={of} title={title} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => s.sortBy(k)} aria-label={`Sort by ${label}`}>{label} <span aria-hidden="true">{sort.key === k ? (sort.dir > 0 ? "▲" : "▼") : "▾"}</span></button>{help && <ChartHelp id={help} />}
    </th>);
}

type Props = {
  s: Screener; splitKey: string; eyebrow: string; title: string; intro: ReactNode; sideLabel: string;
  /** The Prism quick views at the top of the sidebar (Advanced page); null when the page has none. */ presets: ReactNode;
  /** The screens, above the table. */ screens?: ReactNode;
  /** The page's own filters, after Market cap and Sector. */ filters: ReactNode;
  tiles: Tile[]; lead?: ReactNode; beforeTable?: ReactNode; errorTitle: string;
  groupHead: ReactNode; columnHeads: ReactNode; cells: (r: Screener["pg"]["view"][number]) => ReactNode; colSpan: number;
  plain: string; how: ReactNode;
  /** The plan badge in the title card. */ tier: Plan;
  /** Columns offered in the "Sort by" list (beside Stock name and Market cap). */ sortChoices: { key: SortKey; label: string }[];
  /** The header's key figures, quick links and illustration (real data only). */ head?: Pick<PageHeaderProps, "stats" | "links" | "art" | "meta">;
  /** A card drawn beside the sector bars (the donut), only when its numbers are real. */ donut?: ReactNode;
  /** The header line (task #64, B-4 / V-4): the data date in words, the name of the "How … works" dialog and a link to the other screener. */
  dateLine?: string | null; howTitle?: string; headLink?: ReactNode;
  /** The Columns menu in the toolbar (the 52-week and return columns). */ columnsMenu?: ReactNode;
  /** A tag after the company name (Leader / In line / Laggard on the Advanced page). */ leadTag?: (r: Screener["pg"]["view"][number]) => ReactNode;
};
const narrow = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(max-width: 1000px)").matches;
export function ScreenerFrame({ s, splitKey, title, intro, sideLabel, presets, screens, filters, lead, beforeTable, errorTitle, groupHead, columnHeads, cells, colSpan, plain, how, tier, sortChoices, donut, dateLine, howTitle = "How scores work", headLink, columnsMenu, leadTag }: Props) {
  const [sideW, setSide] = useSideWidth(splitKey);
  const { isAdmin } = useAuth();
  const { draft, setDraft, facets, secQ, setSecQ, drawer, setDrawer, sort, size, pg, rows, sel, bad, dirty, isLoading, isError, chips, mix, filterCount, maxCompare } = s;
  const [chart, setChart] = useState<PanelRow | null>(null);
  // where the frozen columns end, so each group heading can stay in view just after them while the table scrolls sideways
  const tableRef = useRef<HTMLTableElement>(null);
  useEffect(() => {
    const t = tableRef.current; if (!t) return;
    const set = () => { const h = t.querySelector<HTMLElement>("thead .fz3"); if (h) t.style.setProperty("--fz-end", `${h.offsetLeft + h.offsetWidth}px`); };
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set); ro.observe(t); return () => ro.disconnect();
  }, [isLoading, isError]);
  // the toolbar sticks just under the site bar, whatever that bar's height (it changes with the screen width)
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".top"), w = wrapRef.current;
    if (!w) return;
    const set = () => w.style.setProperty("--sx-top", `${bar ? Math.round(bar.getBoundingClientRect().height) : 0}px`);
    set();
    if (!bar || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set); ro.observe(bar); return () => ro.disconnect();
  }, []);
  const [collapsed, setCollapsed] = useState(false), [want, setWant] = useState<{ id: string | null; n: number }>({ id: null, n: 0 });
  const showPanel = (id: string | null) => { if (narrow()) setDrawer(true); else setCollapsed(false); if (id) setWant((w) => ({ id, n: w.n + 1 })); };
  useEffect(() => {   // Escape closes the filter drawer on narrow screens
    if (!drawer) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [drawer, setDrawer]);
  const qTrim = s.q.trim();
  const sortVal = `${sort.key}:${sort.dir}`;
  const choices: { key: SortKey; label: string; asc: string; desc: string }[] = [
    { key: "name", label: "Stock name", asc: "A to Z", desc: "Z to A" }, { key: "market_cap", label: "Market cap", asc: "low to high", desc: "high to low" },
    { key: "sector", label: "Sector", asc: "A to Z", desc: "Z to A" },
    ...sortChoices.map((c) => ({ ...c, asc: "low to high", desc: "high to low" })),
  ];
  const sortOpts = choices.flatMap((c) => (c.key === "name" || c.key === "sector" ? [[c.key, 1, `${c.label}, ${c.asc}`], [c.key, -1, `${c.label}, ${c.desc}`]] : [[c.key, -1, `${c.label}, ${c.desc}`], [c.key, 1, `${c.label}, ${c.asc}`]]) as [SortKey, 1 | -1, string][]);
  return (
    <>
      <div className="wrap scr-wrap sx-root" style={{ paddingTop: 22 }} ref={wrapRef}>
        <FindStocksTabs />
        <section className="card sx-head" aria-labelledby="sx-h1">
          <div className="sx-h1row"><h1 id="sx-h1" title={typeof intro === "string" ? intro : undefined}>{title}</h1><TierChip tier={tier} />{dateLine && <span className="sx-asof">{dateLine}</span>}
            <span className="sx-hsp" /><button type="button" className="fgx-link" onClick={() => s.setHow(true)}><Icon name="info" /> {howTitle}</button>{headLink}</div>
          <p className="sr">{intro}</p>
        </section>
        {screens}
        {beforeTable}
        {isAdmin && (      // the "not rated yet" share and the sector mix of the result: for the team, not shown to members
          <div className="fgx-two" style={donut ? undefined : { gridTemplateColumns: "minmax(0, 1fr)" }}>
            {donut}
            <SectorBars title="Results by sector (Top 5)" rows={mix} action={<button type="button" className="fgx-link" onClick={() => showPanel("sector")}>View all sectors &rsaquo;</button>} />
          </div>)}
        <div className="sx-stick"><Toolbar q={s.q} setQ={s.setQ} searchLabel="Search company name, sector or keyword" buttons={[
          { id: "cap", label: "Market cap", active: draft.caps.length, onClick: () => showPanel("cap") },
          { id: "sector", label: "Sector", active: draft.sectors.length, onClick: () => showPanel("sector") },
          { id: "score", label: "Score filters", active: Math.max(0, filterCount - draft.caps.length - draft.sectors.length), onClick: () => showPanel("score") }]}
          sort={<>{columnsMenu}<SortMenu value={sortVal} options={sortOpts.map(([k, d, l]) => ({ v: `${k}:${d}`, label: l }))}
            onPick={(v) => { const [k, d] = v.split(":"); s.go({ sort: { key: k as SortKey, dir: Number(d) as 1 | -1 }, page: 0 }); }} /></>} /></div>
        <div className={"scr sx" + (drawer ? " sx-open" : "") + (collapsed ? " fgx-collapsed" : "")} style={{ "--side-w": `${sideW}px` } as React.CSSProperties}>
          {drawer && <div className="sx-back" onClick={() => setDrawer(false)} aria-hidden="true" />}
          <aside className="scr-side card sx-side" aria-label={sideLabel} hidden={sideW === 0 || (collapsed && !drawer)}>
            <button type="button" className="sx-close btn" onClick={() => setDrawer(false)}>Close filters</button>
            <form onSubmit={(e) => { e.preventDefault(); s.apply(s.draft, true); }} onBlurCapture={(e) => { if ((e.target as HTMLElement).matches?.('input[type="number"]') && dirty && !bad) s.apply(); }} noValidate>
              <FgxFocus.Provider value={want}>
              <div className="fgx-top"><span>Filters{filterCount > 0 ? ` · ${filterCount} active` : ""}</span><span className="fgx-tl"><button type="button" className="fgx-link" onClick={() => s.setHow(true)}><Icon name="info" /> {howTitle}</button></span></div>
              {presets && <FilterGroup id="quick" title="Quick views" defaultOpen hint={<>Ready-made score combinations. <ChartHelp id="score-filter" /></>}>{presets}</FilterGroup>}
              <FilterGroup id="cap" title="Market cap" defaultOpen active={draft.caps.length}>
                <div role="group" aria-label="Market cap size">{CAPS.map((c) => <CheckRow key={c} label={`${c} cap`} count={facets.caps[c]} checked={draft.caps.includes(c)} onChange={() => setDraft((d) => ({ ...d, caps: s.toggle(d.caps, c) }))} />)}</div>
              </FilterGroup>
              <FilterGroup id="sector" title="Sector" defaultOpen active={draft.sectors.length}>
                <SearchBox value={secQ} onChange={setSecQ} placeholder="Search sector" label="Search sectors" />
                <ul className="fgx-list" aria-label="Sectors">
                  {facets.sectors.filter(([x]) => x.toLowerCase().includes(secQ.trim().toLowerCase())).map(([x, n]) => (
                    <li key={x}><CheckRow label={x} count={n} checked={draft.sectors.includes(x)} onChange={() => setDraft((d) => ({ ...d, sectors: s.toggle(d.sectors, x) }))} /></li>))}
                  {!facets.sectors.length && !isLoading && <li className="fgx-none">No sectors loaded yet.</li>}
                  {!!facets.sectors.length && !facets.sectors.some(([x]) => x.toLowerCase().includes(secQ.trim().toLowerCase())) && <li className="fgx-none">No sector matches “{secQ}”.</li>}
                </ul>
              </FilterGroup>
              {filters}
              </FgxFocus.Provider>
              <div className="sx-hint" role="status" aria-live="polite">{bad ? "Fix the highlighted ranges to apply them." : dirty ? "Updating results…" : filterCount ? "Results are up to date with these filters." : ""}</div>
              <div className="ss-actions"><button type="submit" className="btn primary" disabled={bad}>{dirty ? "Apply filters" : isLoading ? "Done" : `Show ${nf(rows.length, 0)} ${rows.length === 1 ? "company" : "companies"}`}</button><button type="button" className="btn" onClick={s.clear}>Clear all</button></div>
            </form>
          </aside>
          <SplitDivider width={sideW} set={setSide} />

          <section className="scr-main card" aria-label="Results">
            <div className="sx-top">
              <button type="button" className="btn sx-fbtn" onClick={() => setDrawer(true)} aria-haspopup="dialog">Filters{filterCount > 0 && <span className="dotn">{filterCount}</span>}{dirty && <span className="sr"> (unsaved changes)</span>}</button>
            </div>
            {lead}
            {(chips.length > 0 || !!qTrim) && <div className="scr-chips" aria-label="Active filters">{qTrim && <button type="button" className="fchip" onClick={() => s.setQ("")} aria-label={`Remove search ${qTrim}`}>Search: {qTrim}<span aria-hidden="true">×</span></button>}{chips.map((c) => <button type="button" key={c.id} className="fchip" onClick={() => s.drop(c.id)} aria-label={`Remove filter ${c.label}`}>{c.label}<span aria-hidden="true">×</span></button>)}<button type="button" className="alx-link" onClick={() => { s.setQ(""); s.clear(); }}>Clear all</button></div>}
            <p className="sr" role="status" aria-live="polite" aria-atomic="true">{isLoading || isError ? "" : `${nf(rows.length, 0)} ${rows.length === 1 ? "company matches" : "companies match"}${filterCount || qTrim ? " the current filters" : ""}.`}</p>
            {isError ? <div className="state"><h2>{errorTitle}</h2><p>Please try again in a moment.</p></div> : isLoading ? <div className="skeleton" style={{ height: 380 }} /> : (
              <>
                <p className="sx-count" aria-live="polite">{sel.length ? `${nf(sel.length, 0)} selected` : `${nf(rows.length, 0)} ${rows.length === 1 ? "company" : "companies"} in this result`}</p>
                <TableZoom label="Score screener results"><HScroll className="scr-tw" label="results table" controls={false} pinBelow=".sx-stick"><table className="scr-t ss-t sx-t" ref={tableRef}>
                  <caption className="sr">Companies matching the filters, sorted by {(choices.find((c) => c.key === sort.key)?.label ?? String(sort.key).replace(/_/g, " ")).toLowerCase()}. Select a column heading to sort.</caption>
                  <thead>{groupHead}
                  <tr>
                    <th scope="col" className="fz1"><input ref={s.headBox} type="checkbox" checked={s.allOnPage} onChange={s.toggleAll} aria-label="Select all companies on this page" disabled={!pg.view.length} /></th>
                    <th scope="col" className="sx-n fz2">#</th>
                    <SortTh s={s} k="name" label="Stock" cls="stick fz3 fz-last" /><SortTh s={s} k="price" label="LTP (₹)" cls="ss-px" /><SortTh s={s} k="market_cap" label="Market cap" cls="ss-mc" />
                    {columnHeads}
                    <th scope="col">Chart</th></tr></thead>
                  <tbody>{pg.view.map((r, i) => {
                    const on = sel.includes(r.symbol);
                    return (
                    <tr key={r.symbol} className={(on ? "sx-sel " : "") + (chart?.symbol === r.symbol ? "cp-row" : "")} onClick={(e) => { if (!(e.target as HTMLElement).closest("input,a,button,select")) setChart(r); }}>
                      <td className="fz1"><input type="checkbox" checked={on} onChange={() => s.togglePick(r.symbol)} aria-label={`Select ${r.symbol}`} /></td>
                      <td className="sx-n fz2">{pg.page * size + i + 1}</td>
                      <td className="stick fz3 fz-last"><Link to={`/stocks/${r.symbol}`} className="co"><CoLogo symbol={r.symbol} name={r.name} size={24} /><span><b title={codeNote(r)}>{titleOf(r)}</b>{leadTag?.(r)}{subOf(r) && <small>{subOf(r)}</small>}<small className="sx-secn">{r.sector || "Sector not listed"}</small></span></Link></td>
                      <td className="ss-px">{r.price != null ? nf(r.price) : <Dash why="no price yet" />}</td>
                      <td className="ss-mc">{r.market_cap != null ? <><span className="ss-mcv">₹{cr(r.market_cap)} Cr</span>{r.cap && <small className="sx-cap">{r.cap} cap</small>}</> : <Dash why="market value not available" />}</td>
                      {cells(r)}
                      <td className="ss-act"><button type="button" className="btn" onClick={() => setChart(r)} aria-label={`Open ${r.symbol} chart`}>Chart</button>
                        <Link className="btn" to={`/stocks/${r.symbol}`} aria-label={`Open ${r.symbol} report`}>Report</Link>
                        <button type="button" className={"btn" + (watch.has(r.symbol) ? " on" : "")} aria-pressed={watch.has(r.symbol)} aria-label={`${watch.has(r.symbol) ? "Remove" : "Add"} ${r.symbol} ${watch.has(r.symbol) ? "from" : "to"} watchlist`} onClick={() => s.addWatch(r.symbol)}><Icon name="wallet" /></button></td>
                    </tr>);
                  })}
                    {!rows.length && <tr><td colSpan={colSpan} className="empty"><div className="fgx-empty">No companies match all of these filters.{" "}{chips.length || qTrim ? <>Try removing one:{" "}
                      {qTrim && <button type="button" className="fchip" onClick={() => s.setQ("")}>Search: {qTrim} ×</button>}{" "}{chips.map((c) => <button type="button" key={c.id} className="fchip" onClick={() => s.drop(c.id)}>{c.label} ×</button>)}</> : "Try clearing the search."}</div></td></tr>}
                  </tbody>
                </table></HScroll></TableZoom>
                <div className="ss-foot">
                  <label className="muted">Rows per page <select value={size} onChange={(e) => s.go({ size: Number(e.target.value), page: 0 })} aria-label="Rows per page">{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
                  <span className="muted" aria-live="polite">{pg.from}–{pg.to} of {nf(rows.length, 0)}</span>
                  <nav className="sx-pager" aria-label="Pages">
                    <button type="button" className="btn" disabled={pg.page <= 0} onClick={() => s.go({ page: pg.page - 1 })} aria-label="Previous page">‹</button>
                    {pageList(pg.page, pg.pages).map((n, i) => n == null ? <span key={"g" + i} aria-hidden="true">…</span> :
                      <button type="button" key={n} className={"btn" + (n === pg.page ? " on" : "")} aria-current={n === pg.page ? "page" : undefined} aria-label={`Page ${n + 1}`} onClick={() => s.go({ page: n })}>{n + 1}</button>)}
                    <button type="button" className="btn" disabled={pg.page >= pg.pages - 1} onClick={() => s.go({ page: pg.page + 1 })} aria-label="Next page">›</button>
                  </nav>
                </div>
              </>
            )}
            <Plain>{plain}</Plain>
          </section>
        </div>
      </div>
      {sel.length > 0 && (
        <div className="sx-cbar" role="region" aria-label="Selected companies">
          <b aria-live="polite">{nf(sel.length, 0)} selected</b>
          <button type="button" className="btn primary" disabled={sel.length < 2 || sel.length > maxCompare} onClick={() => s.nav(`/compare?c=${sel.join(",")}`)}
            aria-label={sel.length >= 2 && sel.length <= maxCompare ? `Compare ${sel.length}` : "Compare"}>Compare {sel.length}</button>
          <button type="button" className="btn" onClick={s.addSelected}>Add to watchlist</button>
          <button type="button" className="alx-link" onClick={() => s.setPicked([])}>Clear</button>
          {sel.length < 2 && <small>Tick one more company to compare.</small>}
          {sel.length > maxCompare && <small>{s.has("gold") ? "Compare takes up to 4 companies." : "Your plan compares up to 2 companies; Gold compares 4."}</small>}
        </div>)}
      {s.how && how}
      {chart && <ChartPanel key={chart.symbol} row={chart} onClose={() => setChart(null)} onStep={(d) => { const i = pg.view.findIndex((r) => r.symbol === chart.symbol), n = pg.view[i + d]; if (i >= 0 && n) setChart(n); }} />}
    </>
  );
}
