// Block 7, Index heatmap. Task #261 (team pack "05 Dashboard · Index heatmap", 20 Nov 2026): three views, Grid (new, the default: every stock the same
// tile with its symbol and today's move), Map (a squarified treemap by market value, every tile labelled, the font shrinking with the tile) and List;
// Nifty Midcap 50, 100 and 150 as chips and every NSE index of the pack under "More indices"; a breadth line under the tiles. Before, tile size was
// market value only, so the smallest companies of an index were boxes too small to label. The logic is in heatmapLogic.ts (tested there).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { MINUS, nf } from "../../lib/format";
import { treemap, useMembers } from "../../lib/markets";
import type { Row } from "../../lib/screener";
import { Card, ShowMoreButton, tone, useIsPhone, useWidth } from "./parts";
import { Dd, useExpanded, type DdOption } from "./dx";
import { useIndices } from "../../lib/indices";
import { useGold } from "../../lib/premium";
import { CoLogo } from "../CoLogo";
import { coTitle, shortLabel } from "../../lib/companyLabel";
import {
  GROUPS, MOVE_COLOURS, PINNED, PREF_KEY, breadth, byId, mapItems, mapLabel, moveColour, priceDay, readPrefs, resolve, sortCells,
  type Cell, type HPrefs, type HSort, type HView, type MapItem,
} from "./heatmapLogic";

const sgn = (v: number | null | undefined, d = 2) => (v == null ? MINUS : (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(Math.abs(v), d) + "%");
const crore = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN") + " Cr";
const SORTS: [HSort, string][] = [["up", "Biggest gain first"], ["dn", "Biggest fall first"], ["mc", "Market value"], ["az", "A–Z"]];
const SUB: Record<HView, string> = { grid: "Every stock the same size; colour is today's move", map: "Tile size is market value, colour is today's move",
  list: "Every stock with its price, move and market value" };

function usePrefs(): [HPrefs, (p: Partial<HPrefs>) => void] {
  const [p, setP] = useState<HPrefs>(() => { try { return readPrefs(localStorage.getItem(PREF_KEY)); } catch { return readPrefs(null); } });
  const set = (x: Partial<HPrefs>) => setP((old) => {
    const next = { ...old, ...x };
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* private window: the choice lasts this visit */ }
    return next;
  });
  return [p, set];
}

type Tip = { c: Cell; x: number; y: number; pinned: boolean };
/** Hover (mouse) or keyboard focus shows the card; a tap pins it with a link to the stock; a mouse click opens the stock. */
function useTiles() {
  const [tip, setTip] = useState<Tip | null>(null);
  const nav = useNavigate(), touch = useRef(false);
  const props = (c: Cell) => ({
    onPointerDown: (e: React.PointerEvent) => { touch.current = e.pointerType !== "mouse"; },
    onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === "mouse") setTip({ c, x: e.clientX, y: e.clientY, pinned: false }); },
    onPointerMove: (e: React.PointerEvent) => { if (e.pointerType === "mouse") setTip((t) => (t && !t.pinned ? { ...t, x: e.clientX, y: e.clientY } : t)); },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === "mouse") setTip((t) => (t?.pinned ? t : null)); },
    onFocus: (e: React.FocusEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ c, x: r.left, y: r.bottom, pinned: false }); },
    onBlur: () => setTip((t) => (t?.pinned ? t : null)),
    onClick: (e: React.MouseEvent) => {
      if (touch.current) { setTip({ c, x: e.clientX, y: e.clientY, pinned: true }); touch.current = false; return; }
      nav(`/stocks/${encodeURIComponent(c.symbol)}`);
    },
  });
  return { tip, setTip, props };
}

function TipCard({ tip, onClose }: { tip: Tip; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: tip.x + 14, top: tip.y + 14 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    setPos({ left: Math.min(innerWidth - w - 8, Math.max(8, tip.x + 14)), top: Math.min(innerHeight - h - 8, Math.max(8, tip.y + 14)) });
  }, [tip.x, tip.y, tip.c.symbol]);
  useEffect(() => {
    if (!tip.pinned) return;
    const off = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest?.(".hmx-tip, .hmx-t")) onClose(); };
    addEventListener("pointerdown", off);
    return () => removeEventListener("pointerdown", off);
  }, [tip.pinned, onClose]);
  const c = tip.c;
  return (
    <div ref={ref} className={"hmx-tip" + (tip.pinned ? " pinned" : "")} role="status" style={pos}>
      <span className="hmx-tn"><CoLogo symbol={c.symbol} name={c.name} size={22} /><b title={coTitle(c)}>{shortLabel(c, 18)}</b></span>
      <span className="hmx-tco">{c.name}</span>
      <span>{c.price != null ? "₹" + nf(c.price) : "No price today"} · <b className={tone(c.move)}>{c.move == null ? "move not readable" : sgn(c.move)}</b></span>
      <small>{c.cap > 0 ? `Market value ${crore(c.cap)}` : "Market value not available"}</small>
      {tip.pinned && <Link to={`/stocks/${encodeURIComponent(c.symbol)}`}>Open {c.symbol} →</Link>}
    </div>
  );
}

/** Task #316: how many tiles fit one row of the grid (read from the grid's own columns), so the page shows exactly three full rows. */
function useCols(): [(el: HTMLElement | null) => void, number] {
  const [cols, setCols] = useState(8);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    ro.current?.disconnect(); ro.current = null;
    if (!el) return;
    const read = () => { const n = getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length; if (n > 0) setCols(n); };
    read();
    if (typeof ResizeObserver !== "undefined") { ro.current = new ResizeObserver(read); ro.current.observe(el); }
  }, []);
  useEffect(() => () => ro.current?.disconnect(), []);
  return [ref, cols];
}

function Grid({ cells, tiles, gridRef, id }: { cells: Cell[]; tiles: ReturnType<typeof useTiles>["props"]; gridRef?: (el: HTMLElement | null) => void; id?: string }) {
  return (
    <div ref={gridRef} id={id} className={"hmx-grid" + (cells.length > 100 ? " dense" : "")} role="list" aria-label="Stocks of the index, each the same size">
      {cells.map((c) => (
        <button key={c.symbol} type="button" role="listitem" className={"hmx-t" + (c.move == null ? " nm" : "")} style={{ background: moveColour(c.move) }}
          aria-label={`${c.symbol}, ${c.name}: ${c.move == null ? "move not readable" : sgn(c.move) + " today"}`} {...tiles(c)}>
          <b>{shortLabel(c, 14)}</b><em>{c.move == null ? MINUS : sgn(c.move)}</em>
        </button>
      ))}
    </div>
  );
}

function HeatMap({ cells, h, tiles, onOther }: { cells: Cell[]; h: number; tiles: ReturnType<typeof useTiles>["props"]; onOther: () => void }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const laid = useMemo(() => treemap<MapItem>(mapItems(cells), (m) => (m.kind === "stock" ? m.c.cap : m.cap), W, h), [cells, W, h]);
  return (
    <div className="dsh-map hmx-map" ref={box} style={{ height: h }} role="list" aria-label="Heat map: tile size is market value, colour is today's move">
      {laid.map(({ x, y, w, h: th, item: m }) => {
        const sym = m.kind === "stock" ? shortLabel(m.c, 14) : `Other ${m.n} stocks`;
        const lab = mapLabel(sym, w, th), move = m.kind === "stock" ? m.c.move : m.move;
        const style = { left: x, top: y, width: w, height: th, padding: lab.pad, background: moveColour(move) } as React.CSSProperties;
        const inner = <><b style={{ fontSize: +lab.size.toFixed(1) }}>{sym}</b>{lab.move != null && <em style={{ fontSize: +lab.move.toFixed(1) }}>{move == null ? MINUS : sgn(move)}</em>}</>;
        if (m.kind === "other") return (
          <button key="other" type="button" role="listitem" className="hmx-t other" style={style} onClick={onOther}
            aria-label={`Other ${m.n} stocks, ${crore(m.cap)} together, weighted move ${sgn(m.move)}: open the grid to see each`}>{inner}</button>);
        return (
          <button key={m.c.symbol} type="button" role="listitem" className={"hmx-t" + (m.c.move == null ? " nm" : "")} style={style}
            aria-label={`${m.c.symbol}, ${m.c.name}: ${m.c.move == null ? "move not readable" : sgn(m.c.move) + " today"}`} {...tiles(m.c)}>
            {w >= 104 && th >= 66 && <span className="t-lg"><CoLogo symbol={m.c.symbol} name={m.c.name} size={20} /></span>}{inner}
          </button>);
      })}
    </div>
  );
}

function List({ cells, id }: { cells: Cell[]; id?: string }) {
  return (
    <div className="dsh-hl hmx-list" id={id} role="table" aria-label="Stocks of the index">
      <div className="h" role="row"><span role="columnheader">Stock</span><span role="columnheader">Company</span><span role="columnheader" className="r">Price (₹)</span>
        <span role="columnheader" className="r">Today</span><span role="columnheader" className="r">Market value (₹ Cr)</span></div>
      {cells.map((c) => (
        <Link key={c.symbol} to={`/stocks/${encodeURIComponent(c.symbol)}`} className="row" role="row">
          <span role="cell" className="hmx-ls"><i className="hmx-dot" style={{ background: moveColour(c.move) }} aria-hidden="true" /><b title={coTitle(c)}>{shortLabel(c, 14)}</b></span>
          <span role="cell" className="hmx-lc">{c.name}</span>
          <span role="cell" className="r">{c.price != null ? nf(c.price) : MINUS}</span>
          <span role="cell" className={"r " + tone(c.move)}>{c.move == null ? MINUS : sgn(c.move)}</span>
          <span role="cell" className="r">{c.cap > 0 ? Math.round(c.cap).toLocaleString("en-IN") : MINUS}</span>
        </Link>
      ))}
    </div>
  );
}

export function IndexHeatmap({ rows, loading, asOf }: { rows: Row[]; loading: boolean; asOf?: string | null }) {
  const members = useMembers().data?.indices, phone = useIsPhone();
  const [pref, setPref] = usePrefs();
  const ix = byId(pref.idx);
  const xp = useExpanded(), gold = useGold(), nIdx = useIndices().data?.items.length;
  const [gridRef, cols] = useCols(), [all, setAll] = useState(false);
  const res = useMemo(() => resolve(ix, rows, members), [ix, rows, members]);
  const cells = useMemo(() => sortCells(res.cells, pref.sort), [res, pref.sort]);
  const b = breadth(res.cells), day = priceDay(asOf);
  const { tip, setTip, props: tiles } = useTiles();

  useEffect(() => { setTip(null); setAll(false); }, [pref.idx, pref.view, setTip]);

  const count = (code: string) => members?.[code]?.length;
  // task #316: Index, View and Sort dropdowns; the ten pinned indices first, then the rest of the pack's indices, then the markets page with every index
  const pinned = new Set(PINNED);
  const idxOptions: DdOption<string>[] = [
    ...PINNED.map((id) => { const x = byId(id); return { v: id, label: x.label, small: x.isNew ? <em className="hmx-new">New</em> : count(x.code) }; }),
    ...GROUPS.flatMap((g) => g.items.filter((x) => !pinned.has(x.id)).map((x) => ({ v: x.id, label: x.label, small: count(x.code) ?? "list loading" }))),
    ...(gold ? [{ v: "__all", label: `All ${nIdx ?? ""} indices…`.replace("  ", " "), href: "/premium/markets#indices" }] : []),
  ];
  // three full rows of tiles on the page (List: ten rows); every tile in the expanded view and after "Show all N stocks"
  const limit = pref.view === "grid" ? cols * 3 : pref.view === "list" ? 10 : Infinity;
  const extra = xp ? 0 : Math.max(0, cells.length - limit);
  const shownCells = extra && !all ? cells.slice(0, limit) : cells;
  const basis = res.basis === "cap" ? "NSE's Nifty 50 list is not loaded yet, so this shows the 50 largest listed companies by market value (not the official index)."
    : res.basis === "sector" ? `NSE's ${ix.label} list is not loaded yet, so companies are grouped by FinLit's sector classification (not the official index).` : "";
  return (
    <Card id="heatmap" title="Index heatmap" sub={SUB[pref.view]} className="hmx"
      right={<div className="dx-hm-dd">
        <Dd k="Index" value={pref.idx} options={idxOptions} onChange={(v) => setPref({ idx: v })} />
        <Dd k="View" value={pref.view} options={[{ v: "grid", label: "Grid" }, { v: "map", label: "Map" }, { v: "list", label: "List" }]} onChange={(v) => setPref({ view: v as HView })} />
        {pref.view !== "map" && <Dd k="Sort" value={pref.sort} options={SORTS.map(([v, label]) => ({ v, label }))} onChange={(v) => setPref({ sort: v as HSort })} />}
      </div>}>
      {!loading && res.cells.length > 0 && <div className="hmx-tools"><span>{ix.label} · {res.cells.length} stocks</span></div>}
      {loading ? <div className="skeleton" style={{ height: phone ? 420 : 440, borderRadius: "var(--r-ctl)" }} aria-busy="true" />
        : !res.cells.length ? <p className="dsh-note">{res.basis === "none" ? `NSE's published list of the ${ix.label} stocks has not been loaded yet; it is fetched with the nightly index refresh. Every other index here is ready.` : "No traded stocks for this group today."}</p>
          : pref.view === "grid" ? <Grid cells={shownCells} tiles={tiles} gridRef={gridRef} id="dx-hms" />
            : pref.view === "map" ? <HeatMap cells={res.cells} h={xp ? 620 : phone ? 420 : 440} tiles={tiles} onOther={() => setPref({ view: "grid" })} />
              : <List cells={shownCells} id="dx-hms" />}
      {!loading && !xp && pref.view !== "map" && <ShowMoreButton more={{ extra, open: all, toggle: () => setAll(!all) }} noun="stock" total={cells.length} controls="dx-hms" />}
      {tip && <TipCard tip={tip} onClose={() => setTip(null)} />}
      <div className="dsh-hfoot">
        {res.cells.length > 0 ? (
          <span><b className="up">{b.up} up</b> · <b className="down">{b.down} down</b>{b.none ? ` · ${b.none} not readable` : ""}
            {b.weighted != null && <> · move weighted by market value <b className={tone(b.weighted)}>{sgn(b.weighted)}</b></>}{day ? ` · ${day}` : ""}
            {pref.view !== "list" ? " · hover or tap a tile for price and market value" : ""}{basis ? <span className="hmx-basis"> {basis}</span> : null}</span>
        ) : <span />}
        <span className="dsh-legend" aria-hidden="true">−2% {MOVE_COLOURS.map((c) => <i key={c} style={{ background: c }} />)} +2%</span>
      </div>
    </Card>
  );
}
