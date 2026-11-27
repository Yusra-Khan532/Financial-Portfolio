// F&O Academy: the payoff diagram of one structure at expiry (lib/payoff.ts). Inputs: the structure's strikes and premiums, the lot size and
// the number of lots; out: the P&L line with the profit and loss areas, the strikes, the breakevens, the largest profit and loss, and a hover
// card at every price with each leg's part. Inside ChartZoom (the enlarge arrow), hover cards through useTip (components/lab/FlowTips.tsx).
// Describes the shape of a structure; costs and taxes are not included, and nothing here suggests a trade.
import { useId, useMemo, useState } from "react";
import { ChartZoom, useZoomHeight } from "../ChartZoom";
import { useTip } from "../lab/FlowTips";
import { analyse, buildLegs, legLabel, legValue, payoffAt, priceRange, structure, type Leg, type StructureId } from "../../lib/payoff";
import { NumField, Readout, Switch, axisInr, inr, num, signedInr, ticks, useBoxWidth } from "./chart";

function PayoffPop({ price, legs, lotSize }: { price: number; legs: Leg[]; lotSize: number }) {
  const total = payoffAt(legs, price, lotSize);
  return (
    <div className="fa-pop">
      <header><b>At expiry {num(price)}</b><span className={total >= 0 ? "fa-gain" : "fa-loss"}>{signedInr(total)}</span></header>
      <ul>{legs.map((l, i) => <li key={i}><span>{legLabel(l)}{l.lots > 1 ? ` × ${l.lots} lots` : ""}</span><b>{signedInr(legValue(l, price) * l.lots * lotSize)}</b></li>)}</ul>
      <small>Before brokerage, taxes and charges.</small>
    </div>
  );
}

export function PayoffChart({ legs, lotSize, spot, label }: { legs: Leg[]; lotSize: number; spot: number; label: string }) {
  const tip = useTip();
  const [box, W] = useBoxWidth();
  const [hRef, H] = useZoomHeight<HTMLDivElement>(W < 520 ? 250 : 300);
  const [hover, setHover] = useState<number | null>(null);
  const cid = "fa" + useId().replace(/:/g, "");
  const a = useMemo(() => analyse(legs, lotSize), [legs, lotSize]);
  const [lo, hi] = useMemo(() => priceRange(legs, spot, a), [legs, spot, a]);
  const N = 240;
  const pts = useMemo(() => Array.from({ length: N + 1 }, (_, i) => { const p = lo + ((hi - lo) * i) / N; return [p, payoffAt(legs, p, lotSize)] as const; }), [legs, lotSize, lo, hi]);
  const vals = pts.map((p) => p[1]);
  let vlo = Math.min(0, ...vals), vhi = Math.max(0, ...vals);
  const padV = (vhi - vlo || 1) * 0.12; vlo -= padV; vhi += padV;
  const L = W < 520 ? 52 : 64, R = 14, B = 34;
  const xr = (p: number) => L + ((p - lo) / (hi - lo)) * (W - L - R);
  // strike labels that would touch their left neighbour move up a row (phones: strikes 200 points apart sit about 30px apart)
  const rows: { k: number; row: number }[] = [];
  for (const k of a.kinks) { const prev = rows[rows.length - 1]; rows.push({ k, row: prev && xr(k) - xr(prev.k) < 46 && prev.row === 0 ? 1 : 0 }); }
  const T = rows.some((r) => r.row) ? 32 : 18;
  const x = xr;
  const y = (v: number) => T + ((vhi - v) / (vhi - vlo)) * (H - T - B);
  const d = pts.map(([p, v], i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${d}L${x(hi).toFixed(1)},${y(0).toFixed(1)}L${x(lo).toFixed(1)},${y(0).toFixed(1)}Z`;
  const xt = ticks(lo, hi, W < 520 ? 4 : 6), yt = ticks(vlo, vhi, 5);
  const z0 = y(0);
  const at = (clientX: number, rect: DOMRect) => { const px = ((clientX - rect.left) / rect.width) * W; return Math.min(hi, Math.max(lo, lo + ((px - L) / (W - L - R)) * (hi - lo))); };
  const move = (e: React.PointerEvent<SVGRectElement>) => {
    const p = Math.round(at(e.clientX, (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()));
    setHover(p);
    tip.show(e, <PayoffPop price={p} legs={legs} lotSize={lotSize} />);
  };
  const hv = hover == null ? null : payoffAt(legs, hover, lotSize);
  const desc = `${label}: profit or loss at expiry from ${num(lo, 0)} to ${num(hi, 0)}; breakeven ${a.breakevens.map((b) => num(b)).join(" and ") || "none"}; largest profit ${a.maxProfit.unlimited ? "not capped" : inr(a.maxProfit.value)}; largest loss ${a.maxLoss.unlimited ? "not capped" : inr(-a.maxLoss.value)}.`;
  return (
    <div ref={box} className="fa-chartbox">
      <div ref={hRef}>
        <svg className="fa-chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={desc}>
          <defs>
            <clipPath id={cid + "a"}><rect x="0" y="0" width={W} height={Math.max(0, z0)} /></clipPath>
            <clipPath id={cid + "b"}><rect x="0" y={z0} width={W} height={Math.max(0, H - z0)} /></clipPath>
          </defs>
          {yt.map((v) => <g key={"y" + v} className="fa-grid"><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 6} y={y(v) + 4} textAnchor="end">{axisInr(v)}</text></g>)}
          {xt.map((p) => <g key={"x" + p} className="fa-grid"><text x={x(p)} y={H - 12} textAnchor="middle">{num(p, 0)}</text></g>)}
          <path d={area} className="fa-area gain" clipPath={`url(#${cid}a)`} />
          <path d={area} className="fa-area loss" clipPath={`url(#${cid}b)`} />
          <line x1={L} x2={W - R} y1={z0} y2={z0} className="fa-zero" />
          {rows.map(({ k, row }) => <g key={"k" + k} className="fa-strike"><line x1={x(k)} x2={x(k)} y1={T - row * 14} y2={H - B} /><text x={x(k)} y={T - 4 - row * 14} textAnchor="middle">{num(k, 0)}</text></g>)}
          {spot >= lo && spot <= hi && <g className="fa-spot"><line x1={x(spot)} x2={x(spot)} y1={T} y2={H - B} /><text x={x(spot) + 4} y={H - B - 6}>now {num(spot, 0)}</text></g>}
          <path d={d} className="fa-line gain" clipPath={`url(#${cid}a)`} />
          <path d={d} className="fa-line loss" clipPath={`url(#${cid}b)`} />
          {a.breakevens.filter((b) => b >= lo && b <= hi).map((b) => <g key={"b" + b} className="fa-be"><circle cx={x(b)} cy={z0} r="5" /><text x={x(b)} y={z0 + 18} textAnchor="middle">{num(b)}</text></g>)}
          {hover != null && hv != null && <g className="fa-hover"><line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} /><circle cx={x(hover)} cy={y(hv)} r="5" className={hv >= 0 ? "gain" : "loss"} /></g>}
          <rect className="fa-hit" x={L} y={T} width={Math.max(0, W - L - R)} height={Math.max(0, H - T - B)} onPointerMove={move} onPointerDown={move} onPointerLeave={() => { tip.hide(); }} />
        </svg>
      </div>
      <Readout>{hover == null || hv == null ? "Point at (or tap) the chart to read the result at any expiry price." : <>At expiry {num(hover)}: <b className={hv >= 0 ? "fa-gain" : "fa-loss"}>{signedInr(hv)}</b> before costs.</>}</Readout>
    </div>
  );
}

/** The full widget: inputs, the switch to the writer's side where it applies, the summary and the chart. */
export function PayoffWidget({ id }: { id: StructureId }) {
  const s = structure(id);
  const [v, setV] = useState<Record<string, number>>(s.preset);
  const [lotSize, setLot] = useState(s.lotSize);
  const [lots, setLots] = useState(1);
  const [spot, setSpot] = useState(s.spot);
  const [side, setSide] = useState<"buyer" | "writer">("buyer");
  const problem = s.check?.(v) ?? null;
  const legs = useMemo(() => buildLegs(s, v, lots, side === "writer"), [s, v, lots, side]);
  const a = useMemo(() => analyse(legs, lotSize), [legs, lotSize]);
  const net = a.netPremium * lotSize;
  const name = s.flip && side === "writer" ? `${s.name} (the writer's side)` : s.name;
  return (
    <section className="fa-widget" aria-label={`Payoff diagram: ${s.name}`}>
      <header className="fa-widget-h">
        <h2>Payoff at expiry: {name}</h2>
        {s.also && <p className="muted">{s.name}, {s.also}.</p>}
        <p>{s.line}</p>
      </header>
      {s.flip && <Switch label="Side" value={side} onChange={setSide} options={[["buyer", "Buyer's side"], ["writer", "Writer's side"]]} />}
      <div className="fa-fields">
        {s.fields.map((f) => <NumField key={f.key} id={`fa-${id}-${f.key}`} label={f.label} value={v[f.key]} min={0} step={f.kind === "premium" ? 0.05 : 50} suffix="₹" onChange={(n) => setV((o) => ({ ...o, [f.key]: n }))} />)}
        <NumField id={`fa-${id}-lot`} label="Lot size" value={lotSize} min={1} onChange={(n) => setLot(Math.max(1, Math.round(n)))} suffix="units" />
        <NumField id={`fa-${id}-lots`} label="Lots" value={lots} min={1} onChange={(n) => setLots(Math.max(1, Math.round(n)))} />
        <NumField id={`fa-${id}-spot`} label="Price now (marker)" value={spot} min={1} step={50} onChange={setSpot} suffix="₹" />
      </div>
      {problem ? <p className="formerr" role="alert">{problem}</p> : <>
        <dl className="fa-sum">
          <div><dt>Net premium</dt><dd>{net === 0 ? "None" : net > 0 ? `${inr(net, 2)} paid` : `${inr(-net, 2)} received`}</dd></div>
          <div><dt>{a.breakevens.length > 1 ? "Breakevens" : "Breakeven"}</dt><dd>{a.breakevens.length ? a.breakevens.map((b) => num(b)).join(" and ") : "None"}</dd></div>
          <div><dt>Largest profit</dt><dd className="fa-gain">{a.maxProfit.unlimited ? "Not capped" : inr(a.maxProfit.value)}<small>{a.maxProfit.at}</small></dd></div>
          <div><dt>Largest loss</dt><dd className="fa-loss">{a.maxLoss.unlimited ? "Not capped" : inr(-a.maxLoss.value)}<small>{a.maxLoss.at}</small></dd></div>
        </dl>
        <ChartZoom label={`Payoff at expiry: ${name}`}><PayoffChart legs={legs} lotSize={lotSize} spot={spot} label={name} /></ChartZoom>
      </>}
      <p className="fa-fine">At expiry, before brokerage, taxes and charges. Premiums and lot sizes are illustrative: enter your own figures.</p>
    </section>
  );
}
