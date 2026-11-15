// The Mutual Fund Screener's "Result at a glance" (task #131, the team's 14 Nov design), both drawn only from numbers the server sends:
//   RiskReturn  each fund of the result as a dot, coloured by its type (equity, hybrid, debt, other) with a legend: yearly 3-year return up, volatility
//               along, a dashed line at 0% and signed axis labels. Hovering or focusing a dot shows the fund's name and both figures. A picture of where
//               the result sits, never a ranking.
//   FlowBars    AMFI's net flow of each category in the result over the last six months, as diverging bars from a centre line (in to the right in
//               green, out to the left in red), largest first, all on one scale. A category far above the rest is drawn to the edge and marked "bar cut".
import { useState } from "react";
import { Link } from "react-router";
import { MINUS, nf } from "../../lib/format";
import type { FundType, ScreenFacets } from "../../lib/mfScreen";
import { ChartZoom } from "../../components/ChartZoom";

/** About `count` round tick values covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count, mag = 10 ** Math.floor(Math.log10(raw)), k = raw / mag, step = (k < 1.5 ? 1 : k < 3.5 ? 2 : k < 7.5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/** A percentage with its sign as a real minus ("−10%"); zero and positives plain ("0%", "20%"), as the axis labels of the design show. */
export const axisPct = (v: number) => (v < 0 ? MINUS + nf(-v, 0) : nf(v, 0)) + "%";
/** A figure with its sign always shown ("+17.9%", "−3.8%"). */
const signed = (v: number, d = 1) => (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(Math.abs(v), d) + "%";

export const TYPE_LABEL: Record<FundType, string> = { equity: "Equity", hybrid: "Hybrid", debt: "Debt", other: "Other" };
const TYPES: FundType[] = ["equity", "hybrid", "debt", "other"];

const W = 420, H = 240, L = 44, R = 12, T = 12, B = 30;
export function RiskReturn({ data }: { data?: ScreenFacets["scatter"] }) {
  const [hot, setHot] = useState<number | null>(null);
  const pts = data?.points ?? [];
  if (pts.length < 3) return <p className="muted mfs-gl-none">{data ? "Fewer than three funds in this result have both a 3-year return and a volatility, so no picture is drawn." : "Loading…"}</p>;
  const xs = pts.map((p) => p[3]), ys = pts.map((p) => p[2]);
  const x0 = 0, x1 = Math.max(...xs) * 1.05 || 1, y0 = Math.min(0, ...ys) * 1.05, y1 = Math.max(...ys) * 1.05 || 1;
  const X = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R), Y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const xt = niceTicks(x0, x1, 4), yt = niceTicks(y0, y1, 4);
  const typeOf = (p: (typeof pts)[number]): FundType => (p[4] && TYPES.includes(p[4]) ? p[4] : "other");
  const present = TYPES.filter((t) => pts.some((p) => typeOf(p) === t));
  const tip = hot != null ? pts[hot] : null;
  return (
    <ChartZoom label={"Fund return against risk"}>
    <figure className="mfs-fig">
      <p className="faint mfs-sc-cap">Each dot is a fund{data && data.eligible > data.shown ? `: the ${nf(data.shown, 0)} largest of the ${nf(data.eligible, 0)} that have both figures.` : ` (${nf(pts.length, 0)} funds with both figures).`}</p>
      <div className="mfs-sc-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Volatility and 3-year return of ${pts.length} funds in the result, coloured by fund type`} className="mfs-sc">
          {yt.map((v) => <g key={"y" + v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className={v === 0 ? "ax0" : "gr"} /><text x={L - 6} y={Y(v) + 3.5} textAnchor="end">{axisPct(v)}</text></g>)}
          {xt.map((v) => <g key={"x" + v}><line x1={X(v)} x2={X(v)} y1={T} y2={H - B} className="gr" /><text x={X(v)} y={H - B + 14} textAnchor="middle">{axisPct(v)}</text></g>)}
          {pts.map((p, i) => { const [code, name, ret, vol] = p; return (
            <Link key={code} to={`/funds/${code}`} aria-label={`${name}, ${TYPE_LABEL[typeOf(p)]}: return ${signed(ret)} a year over 3 years, volatility ${nf(vol, 1)}%`}
              onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot((h) => (h === i ? null : h))} onFocus={() => setHot(i)} onBlur={() => setHot((h) => (h === i ? null : h))}>
              <circle cx={X(vol)} cy={Y(ret)} r={hot === i ? 5.4 : 3.8} className={"dot t-" + typeOf(p)} />
            </Link>); })}
        </svg>
        {tip && (
          <div className="mfs-sc-tip" role="status" style={{ left: `${(X(tip[3]) / W) * 100}%`, top: `${(Y(tip[2]) / H) * 100}%` }}>
            <b>{tip[1]}</b><span>Return, 3 years a year: {signed(tip[2])}</span><span>Volatility, 3 years: {nf(tip[3], 1)}%</span>
          </div>)}
      </div>
      <ul className="mfs-sc-key" aria-label="Fund type">{present.map((t) => <li key={t}><i className={"t-" + t} aria-hidden="true" />{TYPE_LABEL[t]}</li>)}</ul>
      <figcaption className="faint">Across: volatility, 3 years · Up: return, 3 years a year. Past figures from month-end NAVs. The picture describes the result; it does not rank it.</figcaption>
    </figure>
    </ChartZoom>
  );
}

export type FlowRow = { key: string; label: string; total: number; months: number; cut: boolean; width: number };
/** Each category's net flow over the months given (a month with no figure is left out; a category with none at all is dropped), largest first,
 *  on one shared scale. When the largest is more than three times the next, the scale is set by the next one and the largest is drawn to the edge
 *  and marked cut, so one large category does not flatten the others. `width` is the share of half the track, 0 to 1. */
export function flowRows(flows: ScreenFacets["flows"]): FlowRow[] {
  const rows = flows.map((f) => { const have = f.net.filter((v): v is number => v != null && Number.isFinite(v)); return { key: f.key, label: f.label, total: have.reduce((a, b) => a + b, 0), months: have.length }; })
    .filter((r) => r.months > 0).sort((a, b) => b.total - a.total);
  const abs = rows.map((r) => Math.abs(r.total)).sort((a, b) => b - a);
  const scale = abs.length > 1 && abs[1] > 0 && abs[0] > 3 * abs[1] ? abs[1] * 1.25 : abs[0] || 1;
  return rows.map((r) => ({ ...r, cut: Math.abs(r.total) > scale, width: Math.min(1, Math.abs(r.total) / scale) }));
}
const crore = (v: number) => (v > 0 ? "+" : v < 0 ? MINUS : "") + "₹" + nf(Math.abs(v), 0) + " Cr";

export function FlowBars({ flows }: { flows?: ScreenFacets["flows"] }) {
  if (!flows) return <p className="muted mfs-gl-none">Loading…</p>;
  const rows = flowRows(flows.slice(0, 6));
  if (!rows.length) return <p className="muted mfs-gl-none">AMFI's monthly category report has no rows for the categories in this result yet.</p>;
  const cut = rows.filter((r) => r.cut);
  return (
    <>
      <ul className="mfs-flows" aria-label="Net flow by category, last six months">
        {rows.map((r) => (
          <li key={r.key}>
            <span className="mfs-fl-n">{r.label}</span>
            <span className="mfs-fl-track" role="img" aria-label={`${r.label}: ${r.total >= 0 ? "net inflow" : "net outflow"} of ₹${nf(Math.abs(r.total), 0)} crore over ${r.months} month${r.months === 1 ? "" : "s"}${r.cut ? "; bar cut, drawn to the edge" : ""}`}>
              <i className={r.total >= 0 ? "up" : "down"} style={{ width: `${r.width * 50}%` }} />
              {r.cut && <em className={r.total >= 0 ? "up" : "down"}>bar cut</em>}
            </span>
            <span className={"mfs-fl-v " + (r.total >= 0 ? "up" : "down")}>{crore(r.total)}</span>
          </li>))}
      </ul>
      <p className="faint mfs-fl-note">Money in on the right, money out on the left.{cut.map((r) => ` ${/funds?$/i.test(r.label) ? r.label : r.label + " funds"} ${r.total >= 0 ? "take in" : "pay out"} far more than any other category, so ${cut.length > 1 ? "their bars are" : "its bar is"} cut.`).join("")}</p>
    </>
  );
}
