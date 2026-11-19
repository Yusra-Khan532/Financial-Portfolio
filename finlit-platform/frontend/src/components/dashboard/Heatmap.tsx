// Block 7, Index heatmap. Task #261 (team pack "05 Dashboard · Index heatmap", 20 Nov 2026): three views, Grid (new, the default: every stock the same
// tile with its symbol and today's move), Map (a squarified treemap by market value, every tile labelled, the font shrinking with the tile) and List;
// Nifty Midcap 50, 100 and 150 as chips and every NSE index of the pack under "More indices"; a breadth line under the tiles. Before, tile size was
// market value only, so the smallest companies of an index were boxes too small to label. The logic is in heatmapLogic.ts (tested there).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { MINUS, nf } from "../../lib/format";
import { treemap, useMembers } from "../../lib/markets";
import type { Row } from "../../lib/screener";
import { Card, Seg, tone, useIsPhone, useWidth } from "./parts";
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

function Grid({ cells, tiles }: { cells: Cell[]; tiles: ReturnType<typeof useTiles>["props"] }) {
  return (
    <div className={"hmx-grid" + (cells.length > 100 ? " dense" : "")} role="list" aria-label="Stocks of the index, each the same size">
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

function List({ cells }: { cells: Cell[] }) {
  return (
    <div className="dsh-hl hmx-list" role="table" aria-label="Stocks of the index">
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
  const [more, setMore] = useState(false);
  const menu = useRef<HTMLSpanElement>(null), moreBtn = useRef<HTMLButtonElement>(null);
  const ix = byId(pref.idx);
  const res = useMemo(() => resolve(ix, rows, members), [ix, rows, members]);
  const cells = useMemo(() => sortCells(res.cells, pref.sort), [res, pref.sort]);
  const b = breadth(res.cells), day = priceDay(asOf);
  const { tip, setTip, props: tiles } = useTiles();

  useEffect(() => {          // Escape or a click outside closes the panel
    if (!more) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setMore(false); moreBtn.current?.focus(); } };
    const out = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node)) setMore(false); };
    addEventListener("keydown", key); addEventListener("pointerdown", out);
    return () => { removeEventListener("keydown", key); removeEventListener("pointerdown", out); };
  }, [more]);
  useEffect(() => { setTip(null); }, [pref.idx, pref.view, setTip]);

  const pick = (id: string) => { setPref({ idx: id }); setMore(false); };
  const count = (code: string) => members?.[code]?.length;
  const basis = res.basis === "cap" ? "NSE's Nifty 50 list is not loaded yet, so this shows the 50 largest listed companies by market value (not the official index)."
    : res.basis === "sector" ? `NSE's ${ix.label} list is not loaded yet, so companies are grouped by FinLit's sector classification (not the official index).` : "";
  return (
    <Card id="heatmap" title="Index heatmap" sub={SUB[pref.view]} className="hmx"
      right={<Seg label="View" value={pref.view} options={[["grid", "Grid"], ["map", "Map"], ["list", "List"]] as const} onChange={(v) => setPref({ view: v })} />}>
      <div className="dsh-chips hmx-chips" role="group" aria-label="Index">
        {PINNED.map((id) => { const x = byId(id); return <button key={id} type="button" aria-pressed={pref.idx === id} onClick={() => pick(id)}>{x.label}{x.isNew && <em className="hmx-new">New</em>}</button>; })}
        <span className="dsh-menu" ref={menu}>
          <button ref={moreBtn} type="button" aria-haspopup="true" aria-expanded={more} aria-pressed={!PINNED.includes(pref.idx)} onClick={() => setMore(!more)}>{PINNED.includes(pref.idx) ? "More indices" : ix.label} ▾</button>
          {more && <div className="hmx-pop" role="group" aria-label="All indices">
            {GROUPS.map((g) => <div key={g.title}><h4>{g.title}</h4>{g.items.map((x) => (
              <button key={x.id} type="button" aria-pressed={pref.idx === x.id} onClick={() => pick(x.id)}>{x.label}<small>{count(x.code) ?? "list loading"}</small></button>))}</div>)}
          </div>}
        </span>
      </div>
      {!loading && res.cells.length > 0 && (
        <div className="hmx-tools"><span>{ix.label} · {res.cells.length} stocks</span>
          {pref.view !== "map" && <label>Sort <select value={pref.sort} onChange={(e) => setPref({ sort: e.target.value as HSort })}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}</div>)}
      {loading ? <div className="skeleton" style={{ height: phone ? 420 : 440, borderRadius: 12 }} aria-busy="true" />
        : !res.cells.length ? <p className="dsh-note">{res.basis === "none" ? `NSE's published list of the ${ix.label} stocks has not been loaded yet; it is fetched with the nightly index refresh. Every other index here is ready.` : "No traded stocks for this group today."}</p>
          : pref.view === "grid" ? <Grid cells={cells} tiles={tiles} />
            : pref.view === "map" ? <HeatMap cells={res.cells} h={phone ? 420 : 440} tiles={tiles} onOther={() => setPref({ view: "grid" })} />
              : <List cells={cells} />}
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
