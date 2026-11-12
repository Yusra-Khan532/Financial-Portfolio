import { useId } from "react";
import { ChartZoom } from "../components/ChartZoom";
import { useHoverTip } from "../components/HoverTip";

/** `values` are 0-100 positions; a missing figure is null (never drawn as 0). `tips` is the text a point shows on hover (the actual figure and its percentile). */
export type RadarSeries = { key: string; label: string; values: (number | null)[]; cls: string; tips?: (string | null)[] };

/** Two companies whose points on one axis are this close (in score points) sit on top of each other, so they share one tooltip. */
const NEAR = 2.5;
/** A missing figure is marked just outside the 100 ring, where no score can be, so a cross can never be read as a score of 100. */
const GAP_AT = 109;

/** Spider chart on a fixed 0–100 scale. Series are drawn as light polygons with a clear outline and a distinct marker shape, so colour is never the only cue and overlapping areas stay readable.
 *  A missing figure is not drawn as zero: the outline is only joined between neighbouring axes that both have a figure, the area is filled only when every axis has one, and the gap is marked with a cross
 *  outside the rings. `unit` is written after the ring figures ("%" when the axes are percentiles) and `scale` is read out with the chart. All shapes are drawn first and every marker on top of them, so each marker can always be pointed at, whatever lies over it. */
export function Radar({ axes, series, size = 360, unit = "", scale = "Each axis runs from 0 to 100" }: { axes: string[]; series: RadarSeries[]; size?: number; unit?: string; scale?: string }) {
  const id = useId().replace(/:/g, "");
  const { bind, node } = useHoverTip();
  const C = size / 2, R = size / 2 - 58, n = axes.length;
  const ang = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;
  const pt = (i: number, v: number): [number, number] => [C + (R * v) / 100 * Math.cos(ang(i)), C + (R * v) / 100 * Math.sin(ang(i))];
  const ring = (v: number) => axes.map((_, i) => pt(i, v).join(",")).join(" ");
  const mark = (cls: string, x: number, y: number) => {
    const k = cls.replace("k", "");
    return k === "0" ? <circle cx={x} cy={y} r="4.5" /> : k === "1" ? <rect x={x - 4} y={y - 4} width="8" height="8" /> : k === "2" ? <path d={`M${x} ${y - 5.5}L${x + 5.5} ${y}L${x} ${y + 5.5}L${x - 5.5} ${y}Z`} /> : <path d={`M${x} ${y - 5.5}L${x + 5} ${y + 4}L${x - 5} ${y + 4}Z`} />;
  };
  const own = (s: RadarSeries, i: number) => s.tips?.[i] ?? `${s.label}\n${axes[i]}: ${s.values[i]}`;
  /** What a marker shows: its own text, and the text of every company whose marker sits on it. */
  const tipFor = (s: RadarSeries, i: number): string => {
    const v = s.values[i] as number;
    return series.filter((o) => o.values[i] != null && Math.abs((o.values[i] as number) - v) <= NEAR).map((o) => own(o, i)).join("\n\n");
  };
  /** Where a missing figure's cross goes: just outside the rim, the companies that lack the same figure side by side. */
  const gapPos = (si: number, i: number): [number, number] => {
    const [x, y] = pt(i, GAP_AT), t = ang(i) + Math.PI / 2, off = (si - (series.length - 1) / 2) * 12;
    return [x + off * Math.cos(t), y + off * Math.sin(t)];
  };
  const missing = series.some((s) => s.values.some((v) => v == null));
  return (
    <ChartZoom label={"Radar chart"}>
    <svg className="radar" viewBox={`-34 0 ${size + 68} ${size}`} role="img" aria-label={`Radar chart of ${axes.join(", ")} for ${series.map((s) => s.label).join(" and ")}. ${scale}${missing ? ". A missing figure is left out, not drawn as zero" : ""}.`}>
      <defs><radialGradient id={`rg${id}`}><stop offset="0" stopColor="var(--gold)" stopOpacity=".16" /><stop offset="1" stopColor="var(--gold)" stopOpacity="0" /></radialGradient></defs>
      <circle cx={C} cy={C} r={R + 10} fill={`url(#rg${id})`} />
      {[25, 50, 75, 100].map((v) => <polygon key={v} points={ring(v)} fill="none" stroke="var(--border-strong)" strokeDasharray={v === 100 ? "" : "2 5"} opacity={v === 100 ? 0.9 : 0.6} />)}
      {axes.map((a, i) => { const [x, y] = pt(i, 100), [lx, ly] = pt(i, 123), anchor = Math.abs(lx - C) < 8 ? "middle" : lx > C ? "start" : "end"; return (
        <g key={a}><line x1={C} y1={C} x2={x} y2={y} stroke="var(--border)" /><text className="rl" x={lx} y={ly + (Math.abs(lx - C) < 8 ? (ly < C ? 0 : 10) : 4)} textAnchor={anchor}>{a}</text></g>); })}
      {[50, 100].map((v) => <text key={v} className="rr" x={C + 5} y={C - (R * v) / 100 + 12}>{v}{unit}</text>)}
      {/* the shapes: under every marker, and never in the way of the pointer */}
      <g className="rs-layer">
        {series.map((s) => {
          const vals = s.values, full = vals.every((v) => v != null);
          // the outline joins only neighbours that both have a figure; a gap in the data is a gap in the line
          let d = "";
          vals.forEach((v, i) => { const j = (i + 1) % n, w = vals[j]; if (v != null && w != null && (n > 2 || i < j)) { const [x1, y1] = pt(i, v), [x2, y2] = pt(j, w); d += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`; } });
          return (
            <g key={s.key} className={"rs " + s.cls}>
              {full && <polygon className="rs-p" points={vals.map((v, i) => pt(i, v as number).join(",")).join(" ")} />}
              <path className="rs-l" d={d} fill="none" />
            </g>);
        })}
      </g>
      {/* the markers, all on top: a point, or a cross where the figure is missing */}
      {series.map((s, si) => (
        <g key={s.key} className={"rs " + s.cls}>
          {s.values.map((v, i) => {
            if (v == null) {
              const [x, y] = gapPos(si, i), label = `${s.label}, ${axes[i]}: no figure, so it is not plotted`;
              return <g key={i} className="rs-x" tabIndex={0} aria-label={label} {...bind(`${s.label}\n${axes[i]}: no figure, so it is not plotted`)}><path d={`M${x - 4} ${y - 4}l8 8m0 -8l-8 8`} /><circle className="rs-hit" cx={x} cy={y} r="11" /></g>;
            }
            const [x, y] = pt(i, v);
            return <g key={i} className="rs-m" tabIndex={0} aria-label={own(s, i).replace(/\n+/g, ", ")} {...bind(tipFor(s, i))}>{mark(s.cls, x, y)}<circle className="rs-hit" cx={x} cy={y} r="12" /></g>;
          })}
        </g>))}
    </svg>
    {node}
    </ChartZoom>
  );
}
