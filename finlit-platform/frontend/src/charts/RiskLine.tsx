// Developer file 47 (founder, 27 Nov 2026: "need to improve / revamp graph of price statistics"): the line behind Price statistics' "Distance from the
// running high" and "How bumpy the ride is". It replaces Atlas's AreaSeries there, which drew at a fixed 720 units (so a phone scrolled it sideways and
// its 11 px labels shrank to about 5 px), put ticks at odd values (−22%, −44%, 79%), filled the whole drawdown in red, and let "usual" sit on the line.
// This one draws at the width it is given, with round ticks, a light fill, the points that matter marked on the line, and a few facts above it.
import { useEffect, useId, useRef, useState } from "react";
import "../styles/riskline.css";

type N = number | null;
/** A point to mark on the line: its index and the words beside it. */
export type RiskMark = { i: number; text: string };
/** A fact above the chart: its name and its value (with an optional quieter note). */
export type RiskFact = { k: string; v: string; note?: string; dash?: boolean };

/** Round tick values covering lo..hi, about `n` of them (steps of 1, 2, 2.5 or 5 times a power of ten). */
export function niceTicks(lo: number, hi: number, n = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => (hi - lo) / s <= n) ?? 10 * mag;
  const out: number[] = [];
  for (let x = Math.floor(lo / step + 1e-9) * step; x <= Math.ceil(hi / step - 1e-9) * step + 1e-9; x += step) out.push(+x.toFixed(6));
  return out;
}

const day = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const CH = 6.7;   // a character's width at the chart's 12 px type, for placing labels

export function RiskLine({ t, v, fmt, color, floor, ceil, marks = [], usual, facts, label }: {
  t: string[]; v: N[]; fmt: (x: number) => string; color: string; floor?: number; ceil?: number; marks?: RiskMark[];
  usual?: { y: number; text: string }; facts?: RiskFact[]; label: string;
}) {
  const id = useId().replace(/:/g, ""), box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720), [hv, setHv] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { const x = Math.round(el.getBoundingClientRect().width); if (x > 0) setW(x); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = t.length, nums = v.filter((x): x is number => x != null);
  if (n < 2 || !nums.length) return null;
  const narrow = w < 520, H = narrow ? 180 : 210, pl = 44, pr = 12, pt = 24, pb = 24;
  const ticks = niceTicks(Math.min(floor ?? Infinity, ...nums), Math.max(ceil ?? -Infinity, ...nums), 5);
  const lo = ticks[0], hi = ticks[ticks.length - 1], span = hi - lo || 1;
  const X = (i: number) => pl + (i * (w - pl - pr)) / (n - 1), Y = (x: number) => pt + (1 - (x - lo) / span) * (H - pt - pb);
  let d = ""; v.forEach((x, i) => { if (x != null) d += `${d ? "L" : "M"}${X(i).toFixed(1)},${Y(x).toFixed(1)}`; });
  const first = v.findIndex((x) => x != null), base = Y(Math.min(Math.max(0, lo), hi));
  // a label at each year's first point, thinned so two never touch (a short first year gives way to the next)
  const years: [string, number][] = [];
  t.forEach((s, i) => { const y = s.slice(0, 4); if (!i || y !== t[i - 1].slice(0, 4)) years.push([y, i]); });
  const mid = (i: number) => (i === 0 ? X(0) + 14 : X(i));
  if (years.length > 1 && mid(years[1][1]) - mid(years[0][1]) < 44) years.shift();
  const shown: [string, number][] = [];
  for (const yi of years) if ((!shown.length || mid(yi[1]) - mid(shown[shown.length - 1][1]) >= 44) && mid(yi[1]) + 14 <= w) shown.push(yi);
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * w;
    const i = Math.max(0, Math.min(n - 1, Math.round(((x - pl) / (w - pl - pr)) * (n - 1))));
    setHv(v[i] == null ? null : i);
  };
  // Words on the chart go only where the line leaves them clear, inside the chart and apart from each other; with no clear spot they are left out
  // (the facts above the chart carry every one of them).
  const pts: [number, number][] = [];
  v.forEach((x, i) => {
    if (x == null) return;
    const p: [number, number] = [X(i), Y(x)], q = pts[pts.length - 1];
    if (q) { const k = Math.ceil(Math.hypot(p[0] - q[0], p[1] - q[1]) / 4); for (let j = 1; j < k; j++) pts.push([q[0] + ((p[0] - q[0]) * j) / k, q[1] + ((p[1] - q[1]) * j) / k]); }
    pts.push(p);
  });
  const taken: [number, number, number, number][] = [];
  const spot = (text: string, spots: number[][]) => {
    const tw = text.length * CH;
    let best = { x: 0, y: 0, score: Infinity };
    for (const [x0, ty] of spots) {
      const b = [x0 - 2, ty - 13, x0 + tw + 2, ty + 4];
      if (b[0] < pl || b[2] > w - pr + 4 || b[1] < 2 || b[3] > H - pb + 2 || taken.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
      let score = 0;
      for (const [px, py] of pts) if (px >= b[0] && px <= b[2] && py >= b[1] && py <= b[3]) score++;
      if (score < best.score) best = { x: x0, y: ty, score };
    }
    if (best.score > 1) return null;
    taken.push([best.x, best.y - 12, best.x + tw, best.y + 3]);
    return best;
  };
  const steps = (k: number) => Array.from({ length: k }, (_, j) => pl + 6 + ((w - pl - pr - 12) * j) / Math.max(1, k - 1));
  const uSpot = usual ? spot(usual.text, steps(9).flatMap((x) => [[Math.min(x, w - pr - usual.text.length * CH), Y(usual.y) - 5], [Math.min(x, w - pr - usual.text.length * CH), Y(usual.y) + 15]])) : null;
  const placed = marks.filter((m) => v[m.i] != null).map((m) => {
    const x = X(m.i), y = Y(v[m.i] as number), tw = m.text.length * CH;
    return { m, p: spot(m.text, [[x + 10, y + 4], [x - 10 - tw, y + 4], [x + 8, y - 10], [x - 8 - tw, y - 10], [x + 8, y + 19], [x - 8 - tw, y + 19], [x - tw / 2, y - 11], [x - tw / 2, y + 20]]) };
  });
  const tip = hv == null ? null : `${day(t[hv])} · ${fmt(v[hv] as number)}`;
  return (
    <div className="rl">
      {facts?.length ? <dl className="rl-facts">{facts.map((f) => <div key={f.k}><dt>{f.dash && <i className="rl-dash" aria-hidden="true" />}{f.k}</dt><dd><b>{f.v}</b>{f.note && <span> · {f.note}</span>}</dd></div>)}</dl> : null}
      <div className="rl-box" ref={box}>
        <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={label} onPointerMove={pick} onPointerLeave={() => setHv(null)}>
          <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".16" /><stop offset="1" stopColor={color} stopOpacity=".02" /></linearGradient></defs>
          {ticks.map((x) => <g key={x}><line className="rl-grid" x1={pl} x2={w - pr} y1={Y(x)} y2={Y(x)} /><text className="rl-ax" x={pl - 6} y={Y(x) + 4} textAnchor="end">{fmt(x)}</text></g>)}
          {shown.map(([y, k]) => <text key={y} className="rl-ax" x={X(k)} y={H - 6} textAnchor={k === 0 ? "start" : "middle"}>{y}</text>)}
          {usual && <g className="rl-usual"><line x1={pl} x2={w - pr} y1={Y(usual.y)} y2={Y(usual.y)} />{uSpot && <text x={uSpot.x} y={uSpot.y}>{usual.text}</text>}</g>}
          <path d={`${d}L${X(n - 1)},${base}L${X(first)},${base}Z`} fill={`url(#${id})`} />
          <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
          {placed.map(({ m, p }) => (
            <g key={m.i} className="rl-mark"><circle cx={X(m.i)} cy={Y(v[m.i] as number)} r="4" fill={color} />{p && <text x={p.x} y={p.y}>{m.text}</text>}</g>))}
          {hv != null && tip && (() => { const x = X(hv), tw = tip.length * CH + 14, bx = Math.min(Math.max(x - tw / 2, pl), w - pr - tw); return (
            <g className="rl-hover"><line x1={x} x2={x} y1={pt} y2={H - pb} /><circle cx={x} cy={Y(v[hv] as number)} r="4" fill={color} />
              <rect x={bx} y={0} width={tw} height={18} rx="4" /><text x={bx + tw / 2} y={13} textAnchor="middle">{tip}</text></g>); })()}
        </svg>
      </div>
    </div>
  );
}
