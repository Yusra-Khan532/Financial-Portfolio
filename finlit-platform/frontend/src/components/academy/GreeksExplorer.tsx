// F&O Academy: the Greeks explorer (lib/blackScholes.ts). Pick a Greek and see it across prices (three times to expiry) or across the days
// left (three prices), with a hover card that lists every Greek at the point. Inside ChartZoom; hover cards through useTip. The model's
// assumptions are written beside it; the numbers describe the model, not the market. Also: the implied-volatility box (IvSolver).
import { useMemo, useState } from "react";
import { ChartZoom, useZoomHeight } from "../ChartZoom";
import { useTip } from "../lab/FlowTips";
import { greeks, impliedVol, priceBounds, years, type Greeks, type OptKind } from "../../lib/blackScholes";
import { NumField, Readout, Switch, num, ticks, useBoxWidth } from "./chart";

type GreekKey = keyof Greeks;
const GREEKS: { key: Exclude<GreekKey, "rho">; name: string; unit: string; d: number }[] = [
  { key: "price", name: "Premium", unit: "₹ a unit", d: 2 },
  { key: "delta", name: "Delta", unit: "per ₹1 of the underlying", d: 3 },
  { key: "gamma", name: "Gamma", unit: "change in delta per ₹1", d: 5 },
  { key: "theta", name: "Theta", unit: "₹ a unit per calendar day", d: 2 },
  { key: "vega", name: "Vega", unit: "₹ a unit per volatility point", d: 2 },
];
const fmtG = (k: GreekKey, v: number) => num(v, GREEKS.find((g) => g.key === k)?.d ?? 3);

export type Inputs = { kind: OptKind; spot: number; strike: number; days: number; iv: number; rate: number; div: number };
export const DEFAULT_INPUTS: Inputs = { kind: "call", spot: 24000, strike: 24000, days: 30, iv: 14, rate: 6.5, div: 0 };
const g = (i: Inputs, spot: number, days: number) => greeks({ kind: i.kind, spot, strike: i.strike, t: years(days), vol: i.iv / 100, r: i.rate / 100, q: i.div / 100 });

/** The three lines of the chart. Across prices: the days left now, about a third of them, and 1 day. Across days: the price now and 3% either side. */
export function seriesOf(i: Inputs, mode: "price" | "days"): { label: string; days?: number; spot?: number }[] {
  if (mode === "price") {
    const ds = [...new Set([Math.max(1, Math.round(i.days)), Math.max(1, Math.round(i.days / 3)), 1])];
    return ds.map((d) => ({ label: `${d} day${d === 1 ? "" : "s"} left`, days: d }));
  }
  return [{ label: `Price ${num(i.spot, 0)}`, spot: i.spot }, { label: `Price ${num(i.spot * 1.03, 0)} (+3%)`, spot: i.spot * 1.03 }, { label: `Price ${num(i.spot * 0.97, 0)} (−3%)`, spot: i.spot * 0.97 }];
}

function Pop({ i, mode, at, series }: { i: Inputs; mode: "price" | "days"; at: number; series: ReturnType<typeof seriesOf> }) {
  return (
    <div className="fa-pop">
      <header><b>{mode === "price" ? `Underlying at ${num(at, 0)}` : `${num(at, 1)} days left`}</b><span>{i.kind === "call" ? "Call" : "Put"} {num(i.strike, 0)}</span></header>
      <table className="fa-pop-t"><thead><tr><th scope="col"></th>{GREEKS.map((k) => <th key={k.key} scope="col">{k.name}</th>)}</tr></thead>
        <tbody>{series.map((s, n) => { const v = mode === "price" ? g(i, at, s.days!) : g(i, s.spot!, at); return <tr key={s.label}><th scope="row"><i className={`fa-dot s${n}`} aria-hidden="true" />{s.label}</th>{GREEKS.map((k) => <td key={k.key}>{fmtG(k.key, v[k.key])}</td>)}</tr>; })}</tbody>
      </table>
      <ul className="fa-pop-l">{series.map((s, n) => { const v = mode === "price" ? g(i, at, s.days!) : g(i, s.spot!, at); return <li key={s.label}><b><i className={`fa-dot s${n}`} aria-hidden="true" />{s.label}</b><span>{GREEKS.map((k) => `${k.name} ${fmtG(k.key, v[k.key])}`).join(" · ")}</span></li>; })}</ul>
      <small>Black-Scholes model; IV {num(i.iv)}%, rate {num(i.rate)}%, dividend yield {num(i.div)}%.</small>
    </div>
  );
}

export function GreeksChart({ i, greek, mode }: { i: Inputs; greek: Exclude<GreekKey, "rho">; mode: "price" | "days" }) {
  const tip = useTip();
  const [box, W] = useBoxWidth();
  const [hRef, H] = useZoomHeight<HTMLDivElement>(W < 520 ? 240 : 290);
  const [hover, setHover] = useState<number | null>(null);
  const series = useMemo(() => seriesOf(i, mode), [i, mode]);
  const [lo, hi] = mode === "price" ? [i.strike * 0.9, i.strike * 1.1] : [Math.max(0.25, i.days), 0.25];   // days run from the days left down to a quarter day
  const N = 160;
  const lines = useMemo(() => series.map((s) => Array.from({ length: N + 1 }, (_, k) => {
    const xv = lo + ((hi - lo) * k) / N;
    return [xv, (mode === "price" ? g(i, xv, s.days!) : g(i, s.spot!, xv))[greek]] as const;
  })), [series, lo, hi, mode, i, greek]);
  const all = lines.flat().map((p) => p[1]).filter(Number.isFinite);
  let vlo = Math.min(...all), vhi = Math.max(...all);
  if (greek === "delta" || greek === "theta") { vlo = Math.min(vlo, 0); vhi = Math.max(vhi, 0); }
  const pad = (vhi - vlo || 1) * 0.1; vlo -= pad; vhi += pad;
  const L = W < 520 ? 50 : 62, R = 14, T = 14, B = 34;
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const y = (v: number) => T + ((vhi - v) / (vhi - vlo)) * (H - T - B);
  const xt = mode === "price" ? ticks(lo, hi, W < 520 ? 4 : 6) : ticks(hi, lo, 5).reverse();
  const yt = ticks(vlo, vhi, 5);
  const move = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const f = Math.min(1, Math.max(0, (px - L) / (W - L - R)));
    const v = lo + (hi - lo) * f;
    const at = mode === "price" ? Math.round(v) : Math.round(v * 10) / 10;
    setHover(at);
    tip.show(e, <Pop i={i} mode={mode} at={at} series={series} />);
  };
  const gname = GREEKS.find((k) => k.key === greek)!;
  const desc = `${gname.name} of a ${i.kind} at strike ${num(i.strike, 0)} ${mode === "price" ? `across underlying prices ${num(lo, 0)} to ${num(hi, 0)}` : `as days to expiry fall from ${num(lo, 0)} to 0`}, for ${series.map((s) => s.label).join(", ")}.`;
  const first = hover == null ? null : (mode === "price" ? g(i, hover, series[0].days!) : g(i, series[0].spot!, hover));
  return (
    <div ref={box} className="fa-chartbox">
      <ul className="fa-legend">{series.map((s, n) => <li key={s.label}><i className={`fa-dot s${n}`} aria-hidden="true" />{s.label}</li>)}</ul>
      <div ref={hRef}>
        <svg className="fa-chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={desc}>
          {yt.map((v) => <g key={"y" + v} className="fa-grid"><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 6} y={y(v) + 4} textAnchor="end">{num(v, greek === "gamma" ? 5 : greek === "delta" ? 2 : 0)}</text></g>)}
          {xt.map((v) => <g key={"x" + v} className="fa-grid"><text x={x(v)} y={H - 12} textAnchor="middle">{mode === "price" ? num(v, 0) : `${num(v, 0)}d`}</text></g>)}
          {vlo < 0 && vhi > 0 && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="fa-zero" />}
          {mode === "price" && <g className="fa-strike"><line x1={x(i.strike)} x2={x(i.strike)} y1={T} y2={H - B} /><text x={x(i.strike) + 4} y={T + 10}>strike</text></g>}
          {mode === "price" && i.spot >= lo && i.spot <= hi && <g className="fa-spot"><line x1={x(i.spot)} x2={x(i.spot)} y1={T} y2={H - B} /><text x={x(i.spot) + 4} y={H - B - 6}>now</text></g>}
          {lines.map((pts, n) => <path key={n} className={`fa-gline s${n}`} d={pts.filter((p) => Number.isFinite(p[1])).map(([a, b], k) => `${k ? "L" : "M"}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join("")} />)}
          {hover != null && <line className="fa-hover-l" x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} />}
          <rect className="fa-hit" x={L} y={T} width={Math.max(0, W - L - R)} height={Math.max(0, H - T - B)} onPointerMove={move} onPointerDown={move} onPointerLeave={() => tip.hide()} />
        </svg>
      </div>
      <Readout>{hover == null || !first ? "Point at (or tap) the chart to read every Greek at that point." : <>{mode === "price" ? `At ${num(hover, 0)}` : `With ${num(hover, 1)} days left`}, {series[0].label.toLowerCase()}: {GREEKS.map((k) => `${k.name.toLowerCase()} ${fmtG(k.key, first[k.key])}`).join(", ")}.</>}</Readout>
    </div>
  );
}

export function GreeksExplorer() {
  const [i, setI] = useState<Inputs>(DEFAULT_INPUTS);
  const [greek, setGreek] = useState<Exclude<GreekKey, "rho">>("delta");
  const [mode, setMode] = useState<"price" | "days">("price");
  const set = (k: keyof Inputs) => (v: number) => setI((o) => ({ ...o, [k]: v }));
  const now = g(i, i.spot, i.days);
  const gname = GREEKS.find((k) => k.key === greek)!;
  return (
    <section className="fa-widget" aria-label="Greeks explorer">
      <header className="fa-widget-h"><h2>Greeks explorer</h2><p>How the premium and each Greek of one option change with the underlying's price and with the days left, under the Black-Scholes model.</p></header>
      <Switch label="Option" value={i.kind} onChange={(k) => setI((o) => ({ ...o, kind: k }))} options={[["call", "Call"], ["put", "Put"]]} />
      <div className="fa-fields">
        <NumField id="fa-g-spot" label="Underlying price" value={i.spot} min={1} step={50} onChange={set("spot")} suffix="₹" />
        <NumField id="fa-g-strike" label="Strike" value={i.strike} min={1} step={50} onChange={set("strike")} suffix="₹" />
        <NumField id="fa-g-days" label="Days to expiry" value={i.days} min={0.25} onChange={set("days")} />
        <NumField id="fa-g-iv" label="Implied volatility" value={i.iv} min={0.5} step={0.5} onChange={set("iv")} suffix="% a year" />
        <NumField id="fa-g-rate" label="Interest rate" value={i.rate} min={0} step={0.25} onChange={set("rate")} suffix="% a year" />
        <NumField id="fa-g-div" label="Dividend yield" value={i.div} min={0} step={0.1} onChange={set("div")} suffix="% a year" />
      </div>
      <dl className="fa-sum fa-sum-g">{GREEKS.map((k) => <div key={k.key}><dt>{k.name}</dt><dd>{fmtG(k.key, now[k.key])}<small>{k.unit}</small></dd></div>)}</dl>
      <div className="fa-row">
        <Switch label="Greek on the chart" value={greek} onChange={setGreek} options={GREEKS.map((k) => [k.key, k.name])} />
        <Switch label="Across" value={mode} onChange={setMode} options={[["price", "Across prices"], ["days", "Across days left"]]} />
      </div>
      <ChartZoom label={`Greeks explorer: ${gname.name}`}><GreeksChart i={i} greek={greek} mode={mode} /></ChartZoom>
      <div className="fa-assume">
        <b>Model assumptions</b>
        <p>European exercise; lognormal prices with one constant volatility; constant interest rate and dividend yield; no costs or taxes; trading at any time and size. Theta is per calendar day (365 a year). Real premiums depart from the model, especially near expiry and around events.</p>
      </div>
    </section>
  );
}

/** Implied volatility from a premium: the volatility at which the model's price equals the premium entered. */
export function IvSolver() {
  const [i, setI] = useState<Inputs>(DEFAULT_INPUTS);
  const [premium, setPremium] = useState(400);
  const set = (k: keyof Inputs) => (v: number) => setI((o) => ({ ...o, [k]: v }));
  const base = { kind: i.kind, spot: i.spot, strike: i.strike, t: years(i.days), r: i.rate / 100, q: i.div / 100 };
  const iv = impliedVol(base, premium);
  const [blo, bhi] = priceBounds(base);
  return (
    <section className="fa-widget" aria-label="Implied volatility from a premium">
      <header className="fa-widget-h"><h2>Implied volatility from a premium</h2><p>Enter an option's premium and details; the box solves for the volatility that makes the model's price equal it.</p></header>
      <Switch label="Option" value={i.kind} onChange={(k) => setI((o) => ({ ...o, kind: k }))} options={[["call", "Call"], ["put", "Put"]]} />
      <div className="fa-fields">
        <NumField id="fa-iv-prem" label="Premium" value={premium} min={0} step={0.05} onChange={setPremium} suffix="₹ a unit" />
        <NumField id="fa-iv-spot" label="Underlying price" value={i.spot} min={1} step={50} onChange={set("spot")} suffix="₹" />
        <NumField id="fa-iv-strike" label="Strike" value={i.strike} min={1} step={50} onChange={set("strike")} suffix="₹" />
        <NumField id="fa-iv-days" label="Days to expiry" value={i.days} min={0.25} onChange={set("days")} />
        <NumField id="fa-iv-rate" label="Interest rate" value={i.rate} min={0} step={0.25} onChange={set("rate")} suffix="% a year" />
        <NumField id="fa-iv-div" label="Dividend yield" value={i.div} min={0} step={0.1} onChange={set("div")} suffix="% a year" />
      </div>
      <p className="fa-ivout" aria-live="polite">{iv == null
        ? <>No volatility matches this premium: under the model it must be between {num(blo)} and {num(bhi)} for these inputs.</>
        : <>Implied volatility: <b>{num(iv * 100, 2)}% a year</b> (Black-Scholes, {i.kind}, {num(i.days, 2)} days, rate {num(i.rate)}%).</>}</p>
    </section>
  );
}
