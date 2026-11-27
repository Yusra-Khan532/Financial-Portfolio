// Trading Lab > Global trade: the world's merchandise trade and India's share of it, by year, from the WTO's Timeseries API (backend lab/wto.py).
// Four figures for the latest year and a chart of India's share of world exports and imports year by year, a hover card on every year. Without
// the WTO key on the server the panel says so plainly. Facts only.
import { useEffect, useRef, useState } from "react";
import { ChartZoom } from "../ChartZoom";
import { useTip } from "./FlowTips";
import type { WorldTrade as W } from "./GlobalTrade";

type Ready = Extract<W, { ready: true }>;
type Year = Ready["years"][number];
/** Million US dollars, written in trillions or billions. */
export const usdM = (v: number | null | undefined) => (v == null ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)} tn` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)} bn` : `$${v.toFixed(0)} mn`);
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);
const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "gain" : "loss");

function YearPop({ y }: { y: Year }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>{y.year}</b><small>Merchandise trade, WTO</small></div></header>
      <dl className="oflow-pop-t trd-pop-t">
        <div><dt>World exports</dt><dd>{usdM(y.exports.world)} <small className={tone(y.exports.worldYoyPct)}>{pct(y.exports.worldYoyPct)}</small></dd></div>
        <div><dt>India's exports</dt><dd className="gain">{usdM(y.exports.india)}</dd></div>
        <div><dt>India's share of world exports</dt><dd>{y.exports.share == null ? "—" : `${y.exports.share.toFixed(2)}%`}</dd></div>
        <div><dt>World imports</dt><dd>{usdM(y.imports.world)} <small className={tone(y.imports.worldYoyPct)}>{pct(y.imports.worldYoyPct)}</small></dd></div>
        <div><dt>India's imports</dt><dd className="loss">{usdM(y.imports.india)}</dd></div>
        <div><dt>India's share of world imports</dt><dd>{y.imports.share == null ? "—" : `${y.imports.share.toFixed(2)}%`}</dd></div>
      </dl>
    </>
  );
}

/** India's share of world exports and imports, one point a year. */
export function ShareChart({ w }: { w: Ready }) {
  const tip = useTip();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => {      // drawn at its real width, so labels keep their size on a phone
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { const n = Math.round(el.getBoundingClientRect().width); if (n > 0) setWidth((o) => (Math.abs(o - n) > 2 ? n : o)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ys = w.years.filter((y) => y.exports.share != null || y.imports.share != null);
  if (ys.length < 2) return null;
  const Wd = Math.max(300, width), H = Wd < 600 ? 200 : 240, L = 46, R = 12, T = 14, B = 28;
  const every = Wd < 600 ? 3 : 2;
  const vals = ys.flatMap((y) => [y.exports.share, y.imports.share]).filter((v): v is number => v != null);
  const lo = Math.floor(Math.min(...vals) * 2) / 2, hi = Math.ceil(Math.max(...vals) * 2) / 2, sp = hi - lo || 1;
  const step = (Wd - L - R) / ys.length;
  const x = (i: number) => L + i * step + step / 2, y = (v: number) => T + ((hi - v) / sp) * (H - T - B);
  const line = (f: "exports" | "imports") => ys.map((r, i) => (r[f].share == null ? "" : `${i && ys[i - 1][f].share != null ? "L" : "M"}${x(i).toFixed(1)},${y(r[f].share!).toFixed(1)}`)).join("");
  return (
    <div ref={box} className="trd-share-box"><svg className="trd-share" viewBox={`0 0 ${Wd} ${H}`} role="img" onPointerLeave={() => tip.hide()}
      aria-label={`India's share of world merchandise exports and imports, ${ys[0].year} to ${ys[ys.length - 1].year}`}>
      {[lo, (lo + hi) / 2, hi].map((v) => <g key={v}><line className="grid" x1={L} x2={Wd - R} y1={y(v)} y2={y(v)} /><text className="ax" x={L - 8} y={y(v) + 4} textAnchor="end">{v.toFixed(1)}%</text></g>)}
      <path className="ln x" d={line("exports")} /><path className="ln m" d={line("imports")} />
      {ys.map((r, i) => (
        <g key={r.year} className="trd-yr" onPointerMove={(e) => tip.show(e, <YearPop y={r} />)}>
          <rect className="hit" x={L + i * step} width={step} y={T} height={H - T - B} />
          {r.exports.share != null && <circle className="x" cx={x(i)} cy={y(r.exports.share)} r={4} />}
          {r.imports.share != null && <circle className="m" cx={x(i)} cy={y(r.imports.share)} r={4} />}
          {(ys.length - 1 - i) % every === 0 && <text className="ax" x={x(i)} y={H - 8} textAnchor="middle">{r.year}</text>}
        </g>
      ))}
    </svg></div>
  );
}

export function WorldTrade({ w }: { w: W | undefined }) {
  if (!w) return null;
  const last = w.ready ? [...w.years].reverse().find((y) => y.exports.world != null) : undefined;
  return (
    <div className="trd-panel trd-world">
      <div className="trd-panel-h"><h3>World trade and India's share</h3></div>
      {!w.ready || !last ? <p className="muted oflow-note">{w.ready ? "The WTO has given no world totals yet." : w.reason}</p> : <>
        <dl className="opul-stats trd-wstats">
          <div><dt>World exports, {last.year}</dt><dd>{usdM(last.exports.world)} <small className={tone(last.exports.worldYoyPct)}>{pct(last.exports.worldYoyPct)}</small></dd></div>
          <div><dt>World imports, {last.year}</dt><dd>{usdM(last.imports.world)} <small className={tone(last.imports.worldYoyPct)}>{pct(last.imports.worldYoyPct)}</small></dd></div>
          <div><dt>India's share of world exports</dt><dd className="gain">{last.exports.share == null ? "—" : `${last.exports.share.toFixed(2)}%`}</dd></div>
          <div><dt>India's share of world imports</dt><dd className="loss">{last.imports.share == null ? "—" : `${last.imports.share.toFixed(2)}%`}</dd></div>
        </dl>
        <ChartZoom label="India's share of world merchandise trade by year"><ShareChart w={w} /></ChartZoom>
        <p className="muted opul-legend"><i className="sw trd-sw-x" /> share of world exports · <i className="sw trd-sw-m" /> share of world imports</p>
        <p className="muted trd-foot">{w.source}; goods only, each year's value in current US dollars. Changes compare the year before.</p>
      </>}
    </div>
  );
}
