import { useEffect, useRef, useState } from "react";
import { Icon } from "../lib/icons";
import { labelEvery } from "../lib/chartAxis";
import { cr, nf, num, signed } from "../lib/format";
import type { Segments } from "../lib/api";
import {
  axisCr, axisPct, cagrText, chartModel, chartSummary, mixStatus, niceTicks, pp, sortRows, tableRows,
  type ChartModel, type SortKey, type TableRow,
} from "../lib/segmentMix";
import { ChartZoom, useZoomHeight } from "../components/ChartZoom";
import { TabGroup, type TabView } from "../components/TabGroup";

type Mode = "revenue" | "share";
const rs = (n: number | null | undefined) => (n == null ? "—" : "₹" + cr(n) + " Cr");
const cls = (n: number | null | undefined) => (n == null || Math.abs(n) < 0.05 ? "" : n > 0 ? "pos" : "neg");

/** Developer file 43 (founder, 27 Nov 2026: "better suitable graph for How the mix has changed"). One line a segment, its share of the segments' revenue
 *  (or its revenue) year by year, labelled at its end with the latest figure and the change since its first year. The stacked bars it replaces showed the
 *  total well, but only the bottom segment could be read against the axis, small segments were slivers, and a segment that stopped (Petrochemicals, folded
 *  into O2C) left a gap in the stack. Lines put every segment on the axis. Point at a year to read all of them; point at a segment in the list to pick out
 *  its line. Drawn at the real pixel width so the text keeps its size on a phone. */
/** A line's end label: a segment's own short form when its name ends with one ("Oil to Chemicals (O2C)" → "O2C"), else the name, cut at 16 letters. */
export const shortName = (s: string) => { const m = /\(([^)]{1,6})\)\s*$/.exec(s); return m ? m[1] : s.length > 16 ? s.slice(0, 15) + "…" : s; };
export const placeLabels = (ys: number[], gap: number, lo: number, hi: number): number[] => {
  const order = ys.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0]), out = new Array<number>(ys.length);
  let prev = -Infinity;
  for (const [y, i] of order) { const v = Math.max(y, prev + gap, lo); out[i] = v; prev = v; }
  const over = prev - hi;                                                      // pushed past the bottom: move the run up together
  if (over > 0) { let next = Infinity; for (const [, i] of [...order].reverse()) { const v = Math.min(out[i] - over, next - gap); out[i] = v; next = v; } }
  return out;
};
function MixLines({ model, mode, hl }: { model: ChartModel; mode: Mode; hl: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hv, setHv] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [svgRef, H] = useZoomHeight<SVGSVGElement>(w < 480 ? 250 : 300);
  const ends = w >= 560;                                                         // room for labels at the line ends; a phone reads the list under the chart
  const n = model.years.length, pl = mode === "revenue" ? 44 : 36, pr = ends ? 168 : 12, pt = 12, pb = 26;
  const val = (sr: ChartModel["series"][number], i: number) => (mode === "revenue" ? sr.values[i] : sr.shares[i]);
  const top = Math.max(1, ...model.series.flatMap((sr) => model.years.map((_, i) => val(sr, i) ?? 0)));
  const ticks = niceTicks(top, 4), max = ticks[ticks.length - 1] || 1;
  const X = (i: number) => pl + (n === 1 ? (w - pl - pr) / 2 : (i * (w - pl - pr)) / (n - 1)), Y = (v: number) => pt + (1 - v / max) * (H - pt - pb);
  // the year labels sit on the points (the first and last kept inside the chart): "FY26" when each year has 48 px, else "’26"
  const label = (y: string) => (labelEvery(n, w - pl - pr, 4) === 1 && (w - pl - pr) / Math.max(1, n - 1) >= 48 ? y : "’" + y.slice(2));
  const fmt = mode === "revenue" ? axisCr : axisPct;
  // the line of a segment, broken where a year is missing; its last reported year
  const path = (sr: ChartModel["series"][number]) => { let d = "", on = false; model.years.forEach((_, i) => { const v = val(sr, i); if (v == null) { on = false; return; } d += `${on ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; on = true; }); return d; };
  const lastI = (sr: ChartModel["series"][number]) => { for (let i = n - 1; i >= 0; i--) if (val(sr, i) != null) return i; return -1; };
  const live = model.series.filter((sr) => lastI(sr) === n - 1);                // still reported in the latest year: labelled at the right
  const at = placeLabels(live.map((sr) => Y(val(sr, n - 1) as number)), 15, pt + 4, H - pb - 2);
  const dim = (k: string) => hl != null && hl !== k;
  return (
    <div className="mx-chart mx-lines" ref={box} onMouseLeave={() => setHv(null)}>
      <svg ref={svgRef} width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={chartSummary(model, mode)}>
        {ticks.map((t) => <g key={t}><line x1={pl} x2={w - pr} y1={Y(t)} y2={Y(t)} stroke="var(--border)" strokeDasharray={t ? "3 5" : undefined} strokeWidth={t === 0 ? 1.2 : 1} /><text x={pl - 6} y={Y(t) + 3.5} textAnchor="end" fontSize="11" fill="var(--faint)" fontFamily="Inter Variable, Inter, monospace">{fmt(t)}</text></g>)}
        {model.years.map((y, i) => <text key={y} x={X(i)} y={H - 8} textAnchor={n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle"} fontSize="11" fill={hv === i ? "var(--text)" : "var(--faint)"}>{label(y)}</text>)}
        {hv != null && <line x1={X(hv)} x2={X(hv)} y1={pt} y2={H - pb} stroke="var(--border-strong)" strokeDasharray="3 3" />}
        {model.series.map((sr) => {
          const k = sr.key, li = lastI(sr), on = !dim(k);
          return (
            <g key={k} opacity={on ? 1 : 0.18} style={{ transition: "opacity .15s" }}>
              <path d={path(sr)} fill="none" stroke={sr.color} strokeWidth={hl === k ? 3 : 2.2} strokeLinejoin="round" strokeLinecap="round" />
              {model.years.map((_, i) => { const v = val(sr, i); if (v == null) return null; const end = i === li;
                return <circle key={i} cx={X(i)} cy={Y(v)} r={end || hv === i ? 4 : 2.6} fill={end && li < n - 1 ? "var(--s1)" : sr.color} stroke={sr.color} strokeWidth={end && li < n - 1 ? 2 : 0} />; })}
            </g>
          );
        })}
        {ends && live.map((sr, j) => {
          const v = val(sr, n - 1) as number, first = model.years.findIndex((_, i) => val(sr, i) != null), d = mode === "share" && first >= 0 && first < n - 1 ? v - (val(sr, first) as number) : null;
          return (
            <g key={sr.key} opacity={dim(sr.key) ? 0.25 : 1}>
              {Math.abs(at[j] - Y(v)) > 2 && <line x1={X(n - 1) + 5} x2={w - pr + 8} y1={Y(v)} y2={at[j]} stroke={sr.color} strokeWidth={1} opacity={0.6} />}
              <text x={w - pr + 12} y={at[j] + 4} fontSize="11" fill="var(--text)"><tspan fontWeight="600">{shortName(sr.label)}</tspan><tspan dx="6" fill="var(--muted)" fontFamily="Inter Variable, Inter, monospace">{mode === "revenue" ? axisCr(v) : nf(v, 1) + "%"}</tspan>{d != null && <tspan dx="5" fill={Math.abs(d) < 0.05 ? "var(--faint)" : d > 0 ? "var(--pos, var(--gain))" : "var(--neg, var(--loss))"} fontFamily="Inter Variable, Inter, monospace">{(d > 0 ? "+" : d < 0 ? "−" : "") + nf(Math.abs(d), 1)}</tspan>}</text>
            </g>
          );
        })}
        {model.years.map((y, i) => <rect key={y} x={X(i) - (w - pl - pr) / Math.max(1, n - 1) / 2} y={pt} width={(w - pl - pr) / Math.max(1, n - 1)} height={H - pt - pb} fill="transparent" tabIndex={0} style={{ outline: "none" }}
          onMouseEnter={() => setHv(i)} onFocus={() => setHv(i)} onBlur={() => setHv(null)} onKeyDown={(e) => { if (e.key === "Escape") setHv(null); }}
          aria-label={`${y}: ${model.series.filter((s) => s.values[i] != null).map((s) => `${s.label} ${rs(s.values[i])}, ${s.shares[i] == null ? "—" : nf(s.shares[i] as number, 1) + "%"}`).join("; ")}`} />)}
      </svg>
      {hv != null && (
        <div className="mb-tip mx-tip" role="status" style={{ left: `${Math.min(Math.max((X(hv) / w) * 100, 22), 78)}%` }}>
          <b>{model.years[hv]} · segment revenue {rs(model.totals[hv])}</b>
          {model.series.filter((s) => s.values[hv] != null).sort((a, b) => (b.values[hv] ?? 0) - (a.values[hv] ?? 0)).map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}<em>{rs(s.values[hv])} · {s.shares[hv] == null ? "—" : nf(s.shares[hv] as number, 1) + "%"}</em></span>)}
        </div>
      )}
    </div>
  );
}

/** The list under the lines (the key): each segment, and a segment no longer reported with its last year; it picks out a line on hover, focus or press.
 *  On a phone, where the line ends have no room for labels, each entry also carries the latest share (or revenue) and the change since its first year. */
function MixKey({ model, mode, hl, setHl }: { model: ChartModel; mode: Mode; hl: string | null; setHl: (k: string | null) => void }) {
  const n = model.years.length;
  return (<>
    <p className="mx-key-h">{mode === "revenue" ? "Latest revenue, and its growth" : "Latest share, and its change"} since {model.years[0]} (or since a segment's first year) · point at one to pick out its line</p>
    <ul className="mx-leg mx-key" aria-label="Segments">{model.series.map((s) => {
      const idx = model.years.map((_, i) => i).filter((i) => s.values[i] != null), f = idx[0], l = idx[idx.length - 1];
      const now = l == null ? null : mode === "revenue" ? s.values[l] : s.shares[l];
      const d = f == null || l == null || f === l ? null : mode === "revenue" ? ((s.values[l] as number) / (s.values[f] as number) - 1) * 100 : (s.shares[l] ?? 0) - (s.shares[f] ?? 0);
      const since = f != null && f > 0 ? ` since ${model.years[f]}` : "";
      return <li key={s.key} title={s.members ? s.members.join(", ") : undefined}>
        <button type="button" aria-pressed={hl === s.key} onMouseEnter={() => setHl(s.key)} onMouseLeave={() => setHl(null)} onFocus={() => setHl(s.key)} onBlur={() => setHl(null)} onClick={() => setHl(hl === s.key ? null : s.key)}>
          <i style={{ background: s.color }} aria-hidden="true" /><b>{s.label}</b>{l != null && l < n - 1 && <small className="mx-until">until {model.years[l]}</small>}
          {now != null && <em>{mode === "revenue" ? rs(now) : nf(now, 1) + "%"}{l != null && l < n - 1 ? ` in ${model.years[l]}` : ""}</em>}
          {d != null && Number.isFinite(d) && <span className={cls(d)}>{mode === "revenue" ? signed(d, 0) : pp(d)}{since}</span>}
        </button></li>;
    })}</ul>
  </>);
}

function Spark({ values, color }: { values: (number | null)[]; color: string }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return <span className="faint">—</span>;
  const hi = Math.max(...pts.map((p) => p[1])), lo = Math.min(...pts.map((p) => p[1])), W = 74, H = 22, span = hi - lo || 1, nx = Math.max(values.length - 1, 1);
  const X = (i: number) => 2 + (i / nx) * (W - 4), Y = (v: number) => 3 + (1 - (v - lo) / span) * (H - 6);
  // draw each unbroken run as its own line so a gap in the data stays a gap
  const runs: (readonly [number, number])[][] = [];
  values.forEach((v, i) => { if (v == null) { runs.push([]); } else { if (!runs.length) runs.push([]); runs[runs.length - 1].push([i, v]); } });
  const lastPt = pts[pts.length - 1];
  return (
    <svg className="mx-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {runs.filter((r) => r.length > 1).map((r, k) => <polyline key={k} points={r.map(([i, v]) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />)}
      <circle cx={X(lastPt[0])} cy={Y(lastPt[1])} r="2.2" fill={color} />
    </svg>
  );
}

const TAG_CLASS: Record<string, string> = { growing: "up", declining: "down", steady: "ghost", new: "info", discontinued: "ghost", short: "ghost" };

function TrendTable({ rows, latest, sort, setSort }: { rows: TableRow[]; latest: string; sort: SortKey; setSort: (k: SortKey) => void }) {
  const sorted = sortRows(rows, sort);
  const th = (k: SortKey, text: string) => <th scope="col" aria-sort={sort === k ? "descending" : undefined}><button type="button" className={"mx-sort" + (sort === k ? " on" : "")} aria-pressed={sort === k} onClick={() => setSort(sort === k ? "default" : k)} title={`Sort by ${text.toLowerCase()}`}>{text}<span aria-hidden="true">{sort === k ? " ↓" : ""}</span></button></th>;
  return (
    <div className="mx-tw">
      <table className="mx-t">
        <thead><tr>
          <th scope="col">Segment</th><th scope="col">Revenue {latest}</th>
          {th("share", "Share now")}<th scope="col">Share change</th>
          {th("growth", "Growth a year")}<th scope="col">Last year</th><th scope="col">Margin</th><th scope="col">Trend</th><th scope="col"><span className="sr-only">Revenue history</span></th>
        </tr></thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.name} className={r.notReported ? "gone" : ""} style={{ "--bc": r.color } as React.CSSProperties}>
              <th scope="row" data-l="Segment"><i className="mx-dot" aria-hidden="true" /><span>{r.name}</span>{r.flag && <small className="mx-fl" title={r.flag}><Icon name="alert" /> Definition may have changed</small>}</th>
              {r.notReported ? (
                <td className="mx-gone" colSpan={7} data-l=""><span className="chip ghost">{r.trendLabel || "Discontinued / merged"}</span> Not reported in {latest}{r.lastReported ? `. Last reported in ${r.lastReported}${r.lastRevenue != null ? ` (${rs(r.lastRevenue)})` : ""}` : ""}.</td>
              ) : (<>
                <td data-l={`Revenue ${latest}`}>{rs(r.revenue)}</td>
                <td data-l="Share now">{r.sharePct == null ? "—" : nf(r.sharePct, 1) + "%"}</td>
                <td data-l="Share change" className={cls(r.shareChangePp)}>{r.window && r.years >= 2 ? <>{pp(r.shareChangePp)}<small>since {r.window[0]}</small></> : "—"}</td>
                <td data-l="Growth a year" className={cls(r.cagrPct)}>{r.cagrPct == null ? <span className="faint" title={r.trend === "new" || r.trend === "short" ? "Fewer than three comparable years" : undefined}>{r.trend ? "Not enough years" : "—"}</span> : <>{cagrText(r.cagrPct)}<small>{r.window?.[0]} to {r.window?.[1]}</small></>}</td>
                <td data-l="Last year" className={cls(r.yoyPct)}>{r.yoyPct == null ? "—" : signed(r.yoyPct, 1)}</td>
                <td data-l="Margin">{r.marginPct == null ? "—" : <>{num(r.marginPct, 1)}%{r.marginChangePp != null && <small className={cls(r.marginChangePp)}>{pp(r.marginChangePp)}</small>}</>}</td>
                <td data-l="Trend">{r.trendLabel ? <span className={"chip " + (TAG_CLASS[r.trend || "steady"] || "ghost")}>{r.trendLabel}</span> : <span className="faint">—</span>}{r.note && r.trend !== "discontinued" && <small>{r.note}</small>}</td>
                <td data-l="" className="mx-sp"><Spark values={r.spark} color={r.color} /></td>
              </>)}
            </tr>))}
        </tbody>
      </table>
    </div>
  );
}

/** The history half of the segment card: how the mix has changed (chart), segment trends (table), insights and honest empty states. */
export function SegmentHistory({ seg }: { seg?: Segments }) {
  const [mode, setMode] = useState<Mode>("share");   // developer file 43: the mix is the share, so the lines open on it
  const [hl, setHl] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("default");
  const { status, text } = mixStatus(seg);
  if (!seg) return null;
  if (status === "none" || status === "single") return <p className="mx-empty muted">{text}</p>;
  const model = chartModel(seg), rows = tableRows(seg);
  const latest = seg.periods[seg.periods.length - 1] || "";
  const ins = seg.insights;
  const many = model.years.length >= 2;
  // Task #216 (README 3.16): the three parts are one highlighted tab group: How the mix has changed · Segment trends · Insights (only the parts there are).
  const views: TabView[] = [{ key: "mix", label: "How the mix has changed", content: <>
      <ChartZoom label="How the segment mix has changed" className="cz-r">
      <div className="mx-h">
        <h4>How the mix has changed</h4>
        {many && <div className="seg" role="group" aria-label="Chart values"><button type="button" aria-pressed={mode === "share"} onClick={() => setMode("share")}>Share of revenue (%)</button><button type="button" aria-pressed={mode === "revenue"} onClick={() => setMode("revenue")}>Revenue (₹ Cr)</button></div>}
      </div>
      {status === "short" && <p className="mx-empty muted">{text}</p>}
      {many ? (
        <>
          <MixLines model={model} mode={mode} hl={hl} />
          <MixKey model={model} mode={mode} hl={hl} setHl={setHl} />
          <div className="sr-only"><table>
            <caption>Revenue by segment and fiscal year, ₹ crore, with share of the sum of segment revenues</caption>
            <thead><tr><th scope="col">Segment</th>{model.years.map((y) => <th scope="col" key={y}>{y}</th>)}</tr></thead>
            <tbody>{model.series.map((s) => <tr key={s.key}><th scope="row">{s.label}</th>{model.years.map((y, i) => <td key={y}>{s.values[i] == null ? "not reported" : `${nf(s.values[i] as number, 0)} Cr, ${s.shares[i] == null ? "—" : nf(s.shares[i] as number, 1) + "%"}`}</td>)}</tr>)}</tbody>
          </table></div>
        </>
      ) : null}
      </ChartZoom>
    </> }];
  if (many) views.push({ key: "trends", label: "Segment trends", content: <>
          <div className="mx-h"><h4>Segment trends</h4></div>
          <TrendTable rows={rows} latest={latest} sort={sort} setSort={setSort} />
    </> });
  if (ins && status === "ok" && (ins.sentences.length > 0 || ins.cautions.length > 0)) views.push({ key: "insights", label: "Insights", content: <>
        <div className="mx-ins">
          <h4><Icon name="info" /> Insights</h4>
          {ins.sentences.length > 0 && <ul>{ins.sentences.map((s) => <li key={s}>{s}</li>)}</ul>}
          {ins.cautions.length > 0 && <div className="mx-caut"><b><Icon name="alert" /> Read with care</b><ul>{ins.cautions.map((c) => <li key={c}>{c}</li>)}</ul></div>}
        </div>
    </> });
  return (
    <div className="mx">
      {views.length > 1 ? <TabGroup label="Segments" variant="highlighted" views={views} /> : views[0].content}
      {!ins && many && status === "ok" && <p className="mx-foot faint">Growth rates and trend tags appear here once this report is refreshed.</p>}
      <p className="mx-foot faint">{ins?.basis || "Shares are of the sum of the segment revenues, which can differ from reported revenue because inter-segment sales are removed."} Information only, not advice.</p>
    </div>
  );
}
