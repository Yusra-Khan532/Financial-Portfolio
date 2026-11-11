import { useId } from "react";
import { ChartZoom } from "../components/ChartZoom";
import { useHoverTip } from "../components/HoverTip";

/** `values` are 0-100 positions; a missing figure is null (never drawn as 0). `tips` is the text a point shows on hover (the actual figure and its percentile). */
export type RadarSeries = { key: string; label: string; values: (number | null)[]; cls: string; tips?: (string | null)[] };

/** Spider chart on a fixed 0–100 scale. Series are drawn as light polygons with a clear outline and a distinct marker shape, so colour is never the only cue and overlapping areas stay readable.
 *  A missing figure is not drawn as zero: the outline is only joined between neighbouring axes that both have a figure, and the area is filled only when every axis has one. */
export function Radar({ axes, series, size = 360 }: { axes: string[]; series: RadarSeries[]; size?: number }) {
  const id = useId().replace(/:/g, "");
  const { bind, node } = useHoverTip();
  const C = size / 2, R = size / 2 - 58, n = axes.length;
  const pt = (i: number, v: number): [number, number] => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return [C + (R * v) / 100 * Math.cos(a), C + (R * v) / 100 * Math.sin(a)]; };
  const ring = (v: number) => axes.map((_, i) => pt(i, v).join(",")).join(" ");
  const mark = (cls: string, x: number, y: number) => {
    const k = cls.replace("k", "");
    return k === "0" ? <circle cx={x} cy={y} r="4.5" /> : k === "1" ? <rect x={x - 4} y={y - 4} width="8" height="8" /> : k === "2" ? <path d={`M${x} ${y - 5.5}L${x + 5.5} ${y}L${x} ${y + 5.5}L${x - 5.5} ${y}Z`} /> : <path d={`M${x} ${y - 5.5}L${x + 5} ${y + 4}L${x - 5} ${y + 4}Z`} />;
  };
  return (
    <ChartZoom label={"Radar chart"}>
    <svg className="radar" viewBox={`-34 0 ${size + 68} ${size}`} role="img" aria-label={`Radar chart of ${axes.join(", ")} for ${series.map((s) => s.label).join(" and ")}${series.some((s) => s.values.some((v) => v == null)) ? ". A missing figure is left out, not drawn as zero." : ""}`}>
      <defs><radialGradient id={`rg${id}`}><stop offset="0" stopColor="var(--gold)" stopOpacity=".16" /><stop offset="1" stopColor="var(--gold)" stopOpacity="0" /></radialGradient></defs>
      <circle cx={C} cy={C} r={R + 10} fill={`url(#rg${id})`} />
      {[25, 50, 75, 100].map((v) => <polygon key={v} points={ring(v)} fill="none" stroke="var(--border-strong)" strokeDasharray={v === 100 ? "" : "2 5"} opacity={v === 100 ? 0.9 : 0.6} />)}
      {axes.map((a, i) => { const [x, y] = pt(i, 100), [lx, ly] = pt(i, 121), anchor = Math.abs(lx - C) < 8 ? "middle" : lx > C ? "start" : "end"; return (
        <g key={a}><line x1={C} y1={C} x2={x} y2={y} stroke="var(--border)" /><text x={lx} y={ly + 4} textAnchor={anchor} fontSize="12" fontWeight="600" fill="var(--muted)" fontFamily="IBM Plex Sans, sans-serif">{a}</text></g>); })}
      {[50, 100].map((v) => <text key={v} x={C + 4} y={C - (R * v) / 100 + 11} fontSize="11" fill="var(--faint)" fontFamily="IBM Plex Mono, monospace">{v}</text>)}
      {series.map((s) => {
        const vals = s.values, full = vals.every((v) => v != null);
        // the outline joins only neighbours that both have a figure; a gap in the data is a gap in the line
        let d = "";
        vals.forEach((v, i) => { const j = (i + 1) % n, w = vals[j]; if (v != null && w != null && (n > 2 || i < j)) { const [x1, y1] = pt(i, v), [x2, y2] = pt(j, w); d += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`; } });
        return (
        <g key={s.key} className={"rs " + s.cls}>
          {full && <polygon className="rs-p" points={vals.map((v, i) => pt(i, v as number).join(",")).join(" ")} />}
          <path className="rs-l" d={d} fill="none" />
          {vals.map((v, i) => v == null
            ? <g key={i} className="rs-x"><path d={`M${pt(i, 100)[0] - 4} ${pt(i, 100)[1] - 4}l8 8m0 -8l-8 8`} /><title>{`${s.label}, ${axes[i]}: no figure`}</title></g>
            : <g key={i} className="rs-m" tabIndex={0} aria-label={(s.tips?.[i] ?? `${s.label}, ${axes[i]}: ${v}`).replace(/\n/g, ", ")} {...bind(s.tips?.[i] ?? `${s.label}\n${axes[i]}: ${v}`)}>{mark(s.cls, ...pt(i, v))}<circle className="rs-hit" cx={pt(i, v)[0]} cy={pt(i, v)[1]} r="11" /></g>)}
        </g>); })}
    </svg>
    {node}
    </ChartZoom>
  );
}
