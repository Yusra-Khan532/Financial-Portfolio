// Order Flow hover cards (founder, 26 Nov 2026: "wherever I point the mouse ... pop-ups appear about that in more detail"). One floating card per
// page follows the pointer and shows the full detail of the stock, sector or build-up under it; it never takes the pointer (pointer-events: none),
// so the parts below stay clickable. Mouse and pen only: on touch, tapping already opens the list of stocks.
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BUILDUP, FACTS, ZONE, inr, pct, tone, type FlowLines, type FlowStock } from "../../lib/flow";
import type { Bucket } from "../../lib/flowboard";

type Tip = { x: number; y: number; body: ReactNode } | null;
const Ctx = createContext<{ show: (e: { clientX: number; clientY: number; pointerType?: string }, body: ReactNode) => void; hide: () => void }>({ show: () => {}, hide: () => {} });
export const useTip = () => useContext(Ctx);

export function TipLayer({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<Tip>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const show = useCallback((e: { clientX: number; clientY: number; pointerType?: string }, body: ReactNode) => {
    if (e.pointerType === "touch") return;
    setTip({ x: e.clientX, y: e.clientY, body });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  useLayoutEffect(() => {      // keep the card inside the window: right of the pointer, or left when there is no room; never off the top or bottom
    if (!tip || !box.current) return;
    const w = box.current.offsetWidth, h = box.current.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    const left = tip.x + 18 + w > vw - 8 ? Math.max(8, tip.x - 18 - w) : tip.x + 18;
    const top = Math.min(Math.max(8, tip.y - h / 3), vh - h - 8);
    setPos({ left, top });
  }, [tip]);
  const api = useMemo(() => ({ show, hide }), [show, hide]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {tip && <div ref={box} className="oflow-pop" role="tooltip" style={{ left: pos.left, top: pos.top }}>{tip.body}</div>}
    </Ctx.Provider>
  );
}

/** The day's path, larger than the card's sparkline, with the zero line. */
function Path({ values, up }: { values: (number | null)[] | undefined; up: boolean }) {
  const v = (values ?? []).map((n, i) => [i, n] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (v.length < 2) return null;
  const n = (values ?? []).length - 1 || 1, lo = Math.min(0, ...v.map((p) => p[1])), hi = Math.max(0, ...v.map((p) => p[1])), sp = hi - lo || 1;
  const pts = v.map(([i, c]) => [(i / n) * 240, ((hi - c) / sp) * 56 + 4] as const);
  const d = pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const z = ((hi / sp) * 56 + 4).toFixed(1);
  return (
    <svg className="oflow-pop-path" viewBox="0 0 240 64" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d}L${pts[pts.length - 1][0]},${z}L${pts[0][0]},${z}Z`} className={up ? "fill gain" : "fill loss"} />
      <line x1="0" x2="240" y1={z} y2={z} className="oflow-zero" />
      <path d={d} className={up ? "ln gain" : "ln loss"} />
    </svg>
  );
}

/** S2 to R2 on one line, with the price and VWAP marked where they sit. */
function Ladder({ s }: { s: FlowStock }) {
  const pv = s.pivots;
  if (!pv) return <p className="oflow-pop-na">Pivots: {s.notes.find((x) => x.startsWith("pivots:"))?.slice(8) ?? "not available"}</p>;
  const lv = [["S2", pv.s2], ["S1", pv.s1], ["P", pv.p], ["R1", pv.r1], ["R2", pv.r2]] as const;
  const lo = Math.min(pv.s2, s.price, s.vwap ?? pv.s2), hi = Math.max(pv.r2, s.price, s.vwap ?? pv.r2), sp = hi - lo || 1;
  const at = (v: number) => `${((v - lo) / sp) * 100}%`;
  return (
    <div className="oflow-ladder" aria-label={`Pivots from ${s.pivotsFrom}: ${lv.map(([k, v]) => `${k} ${inr(v)}`).join(", ")}; price ${inr(s.price)}`}>
      <div className="oflow-ladder-rail">
        {lv.map(([k, v]) => <span key={k} className={`lv ${k[0]}`} style={{ left: at(v) }}><i /><small>{k}</small></span>)}
        {s.vwap != null && <span className="vw" style={{ left: at(s.vwap) }} title={`VWAP ${inr(s.vwap)}`}><small>VWAP</small></span>}
        <span className={`px ${s.direction >= 0 ? "gain" : "loss"}`} style={{ left: at(s.price) }}><b>{inr(s.price)}</b></span>
      </div>
      <div className="oflow-ladder-v">{lv.map(([k, v]) => <span key={k}><small>{k}</small>{v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>)}</div>
    </div>
  );
}

const big = (n: number | null) => (n == null ? "—" : Math.abs(n) >= 1e7 ? `${(n / 1e7).toFixed(2)} cr` : Math.abs(n) >= 1e5 ? `${(n / 1e5).toFixed(2)} lakh` : n.toLocaleString("en-IN"));

export function StockPop({ s, lines }: { s: FlowStock; lines: FlowLines }) {
  const b = s.buildup ? BUILDUP[s.buildup] : null;
  const up = s.direction >= 0;
  return (
    <>
      <header className="oflow-pop-h">
        <div><b>{s.symbol}</b><small>{s.name}{s.sector ? ` · ${s.sector}` : ""}</small></div>
        <div className="r"><b>{inr(s.price)}</b><span className={tone(s.changePct)}>{pct(s.changePct)}</span></div>
      </header>
      <Path values={lines.change[s.symbol]} up={(s.changePct ?? 0) >= 0} />
      <div className="oflow-pop-bu">
        {b ? <><span className={`oflow-pill ${b.tone}`}>{b.name}</span><small>{b.what}</small></> : <><span className="oflow-pill">No build-up</span><small>{s.notes.find((n) => n.startsWith("oi:"))?.slice(4) ?? "Price and open interest did not both move."}</small></>}
      </div>
      <dl className="oflow-pop-g">
        <div><dt>Open interest</dt><dd>{big(s.oi)}</dd></div>
        <div><dt>OI change</dt><dd>{s.oiChange == null ? "—" : `${s.oiChange > 0 ? "+" : ""}${big(s.oiChange)} (${pct(s.oiChangePct)})`}</dd></div>
        <div><dt>VWAP</dt><dd>{inr(s.vwap)} <span className={tone(s.vwapGapPct)}>{s.vwap == null ? "" : pct(s.vwapGapPct)}</span></dd></div>
        <div><dt>Day range</dt><dd>{inr(s.low)} – {inr(s.high)}</dd></div>
        <div><dt>Zone</dt><dd>{s.zone ? ZONE[s.zone] : "—"}</dd></div>
        <div><dt>Lot</dt><dd>{s.lot ?? "—"}</dd></div>
      </dl>
      <Ladder s={s} />
      <div className="oflow-pop-facts">
        <b>{s.agreement.score} of {s.agreement.of} facts agree</b>
        <ul>{FACTS.map((f) => { const v = s.agreement.facts[f.key]; return <li key={f.key} className={v ? (up ? "y gain" : "y loss") : v == null ? "u" : "n"}><i aria-hidden="true">{v ? "✓" : v == null ? "?" : "✕"}</i>{up ? f.up : f.down}</li>; })}</ul>
      </div>
    </>
  );
}

export function SectorPop({ sector, stocks }: { sector: string; stocks: FlowStock[] }) {
  const g = stocks.filter((s) => (s.sector || "Other") === sector && s.changePct != null);
  const ch = g.map((s) => s.changePct as number), avg = ch.length ? ch.reduce((a, b) => a + b, 0) / ch.length : null;
  const sorted = [...g].sort((a, b) => (b.changePct as number) - (a.changePct as number));
  const kinds = (["long_buildup", "short_covering", "short_buildup", "long_unwinding"] as const).map((k) => ({ k, n: g.filter((s) => s.buildup === k).length }));
  return (
    <>
      <header className="oflow-pop-h"><div><b>{sector}</b><small>{g.length} F&O stocks</small></div><div className="r"><span className={tone(avg)}>{pct(avg)}</span><small>average</small></div></header>
      <div className="oflow-pop-split"><i className="gain" style={{ flex: ch.filter((c) => c > 0).length || 0.0001 }} /><i className="loss" style={{ flex: ch.filter((c) => c < 0).length || 0.0001 }} /></div>
      <p className="oflow-pop-row"><span className="gain">{ch.filter((c) => c > 0).length} rising</span><span className="loss">{ch.filter((c) => c < 0).length} falling</span></p>
      <ul className="oflow-pop-kinds">{kinds.map(({ k, n }) => <li key={k}><span className={`sw ${BUILDUP[k].tone}`} />{BUILDUP[k].name}<b>{n}</b></li>)}</ul>
      <div className="oflow-pop-movers">
        <div><small>Highest</small>{sorted.slice(0, 3).map((s) => <p key={s.symbol}>{s.symbol}<span className={tone(s.changePct)}>{pct(s.changePct)}</span></p>)}</div>
        <div><small>Lowest</small>{sorted.slice(-3).reverse().map((s) => <p key={s.symbol}>{s.symbol}<span className={tone(s.changePct)}>{pct(s.changePct)}</span></p>)}</div>
      </div>
    </>
  );
}

export function BucketPop({ bucket, stocks }: { bucket: Bucket; stocks: FlowStock[] }) {
  const g = stocks.filter((s) => s.changePct && (s.buildup ?? "none") === bucket);
  const top = [...g].sort((a, b) => Math.abs(b.oiChangePct ?? 0) - Math.abs(a.oiChangePct ?? 0)).slice(0, 5);
  const meta = bucket === "none" ? { name: "No build-up", what: "Price and open interest did not both move, or the open interest change is not known yet." } : BUILDUP[bucket];
  return (
    <>
      <header className="oflow-pop-h"><div><b>{meta.name}</b><small>{g.length} stocks</small></div></header>
      <p className="oflow-pop-what">{meta.what}</p>
      {top.length > 0 && <div className="oflow-pop-movers one"><div><small>Largest open interest change</small>
        {top.map((s) => <p key={s.symbol}>{s.symbol}<span>{pct(s.oiChangePct)}</span><span className={tone(s.changePct)}>{pct(s.changePct)}</span></p>)}</div></div>}
    </>
  );
}

export function DirectionPop({ up, stocks }: { up: boolean; stocks: FlowStock[] }) {
  const g = stocks.filter((s) => s.changePct && ((s.changePct as number) > 0) === up);
  const sorted = [...g].sort((a, b) => (up ? (b.changePct as number) - (a.changePct as number) : (a.changePct as number) - (b.changePct as number))).slice(0, 5);
  return (
    <>
      <header className="oflow-pop-h"><div><b>{up ? "Rising" : "Falling"}</b><small>{g.length} of {stocks.filter((s) => s.changePct).length} stocks with a change</small></div></header>
      <div className="oflow-pop-movers one"><div><small>{up ? "Highest" : "Lowest"} change</small>{sorted.map((s) => <p key={s.symbol}>{s.symbol}<span className={tone(s.changePct)}>{pct(s.changePct)}</span></p>)}</div></div>
    </>
  );
}

/** A slight 3D tilt toward the pointer (mouse and pen only); the CSS reads --rx/--ry and turns it off for reduced motion. */
export function tiltHandlers() {
  return {
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") return;
      const r = e.currentTarget.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      e.currentTarget.style.setProperty("--ry", `${(px * 8).toFixed(2)}deg`);
      e.currentTarget.style.setProperty("--rx", `${(-py * 8).toFixed(2)}deg`);
    },
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => { e.currentTarget.style.removeProperty("--rx"); e.currentTarget.style.removeProperty("--ry"); },
  };
}
