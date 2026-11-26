// Order Flow hover cards (founder, 26 Nov 2026: "wherever I point the mouse ... pop-ups appear about that in more detail"). One floating card per
// page follows the pointer and shows the full detail of the stock, sector or build-up under it; it never takes the pointer (pointer-events: none),
// so the parts below stay clickable. Mouse and pen only: on touch, tapping already opens the list of stocks.
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BUILDUP, FACTS, ZONE, inr, pct, tone, type FlowLines, type FlowStock } from "../../lib/flow";
import type { Bucket } from "../../lib/flowboard";
import { bars } from "../../lib/flowmap";

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

/** 15-minute candles from the day's 3-minute snapshots, with the pivot levels (S2 to R2) and VWAP drawn across, and the last price marked.
 *  Used in the hover card and on the Flow board's feature cards. */
export function Candles({ s, lines, h = 132, levels = true, at }: { s: FlowStock; lines: FlowLines; h?: number; levels?: boolean; at?: { x: number; y: number; w: number; h: number } }) {
  const b = bars(lines.change[s.symbol], lines.times, s.previousClose);
  if (b.length < 2) return <Path values={lines.change[s.symbol]} up={(s.changePct ?? 0) >= 0} />;
  const W = 300, PADR = 66, PADY = 8, pv = s.pivots;
  // only the levels near the day's prices are drawn (within half the day's range beyond it), so the candles fill the chart; the card lists them all
  const bl = Math.min(...b.map((x) => x.l)), bh = Math.max(...b.map((x) => x.h)), reach = Math.max((bh - bl) * 0.5, bh * 0.002);
  const lv: [string, number][] = levels && pv ? ([["R2", pv.r2], ["R1", pv.r1], ["P", pv.p], ["S1", pv.s1], ["S2", pv.s2]] as [string, number][]).filter(([, v]) => v >= bl - reach && v <= bh + reach) : [];
  const vals = [...b.flatMap((x) => [x.h, x.l]), ...lv.map((x) => x[1]), ...(s.vwap != null && s.vwap >= bl - reach && s.vwap <= bh + reach ? [s.vwap] : [])];
  const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1;
  const y = (v: number) => PADY + ((hi - v) / sp) * (h - 2 * PADY - 12);
  const bw = (W - PADR) / b.length;
  return (
    <svg className="oflow-candles" viewBox={`0 0 ${W} ${h}`} {...(at ? { x: at.x, y: at.y, width: at.w, height: at.h, preserveAspectRatio: "xMidYMid meet" } : {})} role="img" aria-label={`${s.symbol}: ${b.length} bars of 15 minutes from ${b[0].t} to ${b[b.length - 1].t}${pv ? `, pivots S2 ${inr(pv.s2)} to R2 ${inr(pv.r2)}` : ""}`}>
      {(() => {   // the zone the price sits in: shaded between the nearest level below and above it
        const all = pv ? ([["S2", pv.s2], ["S1", pv.s1], ["P", pv.p], ["R1", pv.r1], ["R2", pv.r2]] as [string, number][]) : [];
        const below = all.filter(([, v]) => v <= s.price).pop(), above = all.find(([, v]) => v > s.price);
        if (!levels || !below || !above || !lv.some((x) => x[0] === below[0]) || !lv.some((x) => x[0] === above[0])) return null;
        return <rect x="0" width={W - PADR + 4} y={y(above[1])} height={Math.max(1, y(below[1]) - y(above[1]))} className={`oflow-zoneband ${(s.changePct ?? 0) >= 0 ? "gain" : "loss"}`} />;
      })()}
      {lv.map(([k, v]) => <g key={k} className={`oflow-lvl ${k[0]}`}><line x1="0" x2={W - PADR + 4} y1={y(v)} y2={y(v)} /><text x={W - PADR + 8} y={y(v) + 4}>{k} {v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</text></g>)}
      {s.vwap != null && s.vwap >= bl - reach && s.vwap <= bh + reach && <line className="oflow-lvl-vw" x1="0" x2={W - PADR + 4} y1={y(s.vwap)} y2={y(s.vwap)} />}
      {b.map((x, i) => {
        const cx = i * bw + bw / 2, upBar = x.c >= x.o, top = y(Math.max(x.o, x.c)), bot = y(Math.min(x.o, x.c));
        return <g key={i} className={upBar ? "oflow-cdl gain" : "oflow-cdl loss"}><line x1={cx} x2={cx} y1={y(x.h)} y2={y(x.l)} /><rect x={cx - bw * 0.32} y={top} width={bw * 0.64} height={Math.max(1, bot - top)} rx="1" /></g>;
      })}
      <circle cx={(b.length - 0.5) * bw} cy={y(s.price)} r="4" className={`oflow-cdl-last ${(s.changePct ?? 0) >= 0 ? "gain" : "loss"}`} />
      <text x="0" y={h - 1} className="oflow-cdl-t">{b[0].t}</text><text x={W - PADR} y={h - 1} textAnchor="end" className="oflow-cdl-t">{b[b.length - 1].t}</text>
    </svg>
  );
}

const big = (n: number | null) => (n == null ? "—" : Math.abs(n) >= 1e7 ? `${(n / 1e7).toFixed(2)} cr` : Math.abs(n) >= 1e5 ? `${(n / 1e5).toFixed(2)} lakh` : n.toLocaleString("en-IN"));

export function StockPop({ s, lines, rank }: { s: FlowStock; lines: FlowLines; rank?: string }) {
  const b = s.buildup ? BUILDUP[s.buildup] : null;
  const up = s.direction >= 0, pv = s.pivots, n2 = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: v >= 1000 ? 0 : 1 });
  const rows: [string, React.ReactNode][] = [
    ["Rank", rank ?? "—"],
    ["OI", <>{pct(s.oiChangePct, 1)} · {b ? b.name : "no build-up"}</>],
    ["OI change", s.oiChange == null ? "—" : `${s.oiChange > 0 ? "+" : ""}${big(s.oiChange)}`],
    ["VWAP", s.vwap == null ? "—" : <>{n2(s.vwap)} · <span className={tone(s.vwapGapPct)}>{(s.vwapGapPct ?? 0) >= 0 ? "above" : "below"}</span></>],
    ["S1 / S2", pv ? `${n2(pv.s1)} / ${n2(pv.s2)}` : "—"],
    ["R1 / R2", pv ? `${n2(pv.r1)} / ${n2(pv.r2)}` : "—"],
    ["Zone", s.zone ? ZONE[s.zone] : "—"],
    ["Day range", s.low == null || s.high == null ? "—" : `${n2(s.low)} – ${n2(s.high)}`],
    ["Facts", <span className="oflow-pop-fd">{s.agreement.score} of {s.agreement.of} {FACTS.map((f) => { const v = s.agreement.facts[f.key]; return <i key={f.key} className={v ? (up ? "on gain" : "on loss") : v == null ? "unk" : ""} />; })}</span>],
    ["Lot", s.lot ?? "—"],
  ];
  return (
    <>
      <header className="oflow-pop-h">
        <div><b>{s.symbol}</b><small>{s.name}{s.sector ? ` · ${s.sector}` : ""}</small></div>
        <div className="r"><b>{inr(s.price)}</b><span className={tone(s.changePct)}>{pct(s.changePct)} · {s.change == null ? "" : `${s.change > 0 ? "+" : ""}${s.change.toFixed(2)}`}</span></div>
      </header>
      <dl className="oflow-pop-t">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <Candles s={s} lines={lines} h={170} />
      <p className="oflow-pop-na">15-minute bars from the 3-minute snapshots · dashed: pivot levels · shaded: the zone the price is in · gold: VWAP{pv ? ` · pivots from ${s.pivotsFrom}` : ""}</p>
      <div className="oflow-pop-facts">
        <ul>{FACTS.map((f) => { const v = s.agreement.facts[f.key]; return <li key={f.key} className={v ? (up ? "y gain" : "y loss") : v == null ? "u" : "n"}><i aria-hidden="true">{v ? "✓" : v == null ? "?" : "✕"}</i>{up ? f.up : f.down}</li>; })}</ul>
      </div>
      {b && <p className="oflow-pop-what">{b.name}: {b.what}</p>}
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
