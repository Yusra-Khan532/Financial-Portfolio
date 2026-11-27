// "How the scores have moved" on the stock page (task #216, company report handover README 2.3): under the Prism card. Range 1 week (on load) · 2 weeks · 1 month;
// a lead line with the biggest move and the scores that did not move; two charts side by side (stacked under 900 px): the business scores 0 to 100 with a dashed
// line at 50, and the technical views −100 to +100 with a dashed line at 0; under each, one legend row per line (name, latest value, change over the window).
// Hover shows the date and every line's value that day. Solid dot: a new rating that day; hollow dot: the earlier rating still holds. The business scores move
// in steps, only when Prism re-rates the company; the technical views update every trading evening. Gold, like the report. Describes how the scores moved; it
// never forecasts and is not a recommendation.
import { useContext, useMemo, useState } from "react";
import { Icon } from "../lib/icons";
import { dateIN, MINUS } from "../lib/format";
import { useGold } from "../lib/premium";
import { OpenAccess } from "../components/Gate";
import { usePrismHistory, valueOf, type HistPoint, type Series } from "../lib/prismHistory";
import { BUSINESS, LEGEND_NAME, NAME, RANGES, TECHNICAL, axisIndexes, dotRadius, figureOn, inRange, isTechnical, leadLine, monotonePath, stepPath, windowMoves, type Range, type WindowMove } from "../lib/scoreMoves";
import "../styles/scoremoves.css";
import { ChartZoom } from "../components/ChartZoom";

const COLOR: Record<Series, string> = { final: "var(--text)", ["fundamental"]: "var(--p-growth)", valuation: "var(--p-quality)", quality: "var(--p-profit)", risk: "var(--p-balance)", shortTerm: "var(--gold)", longTerm: "var(--info)" };
/** Two lines are dashed so that neither can hide under another: Growth & Profitability often sits on the same figure as Valuation (both 97, say), and the
 *  long-term view is the slower of the two technical lines. Dashed lines are drawn last, on top. */
const DASHED = new Set<Series>(["fundamental", "longTerm"]);
const swatch = (s: Series) => (DASHED.has(s) ? `repeating-linear-gradient(90deg, ${COLOR[s]} 0 5px, transparent 5px 8px)` : COLOR[s]);
const W = 720, L = 42, R = 16;
const fmt = (v: number | null, signed = false) => (v == null ? MINUS : (signed && v > 0 ? "+" : "") + String(Math.round(v * 10) / 10).replace("-", MINUS));

function Panel({ points, history, series, lo, hi, ticks, h, marks, label, signed, mid }: { points: HistPoint[]; history: HistPoint[]; series: Series[]; lo: number; hi: number; ticks: number[]; h: number; marks: string[]; label: string; signed: boolean; mid?: number }) {
  const T = marks.length ? 24 : 10, B = 22, days = points.map((p) => Date.parse(p.day)), t0 = days[0], t1 = days[days.length - 1];
  const x = (d: string) => L + (t1 === t0 ? (W - L - R) / 2 : ((Date.parse(d) - t0) / (t1 - t0)) * (W - L - R));
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (h - T - B);
  const [hover, setHover] = useState<number | null>(null);
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity; points.forEach((p, i) => { const d = Math.abs(x(p.day) - px); if (d < bd) { bd = d; best = i; } }); setHover(best);
  };
  const n = points.length, dr = dotRadius(n), hp = hover == null ? null : points[hover];
  // which re-rating days get the word "Re-rated": from the newest back, each needs about 64 units clear of the one kept after it, so the words never overlap
  const labelled = new Set<string>(); let room = Infinity;
  for (let i = marks.length - 1; i >= 0; i--) { const xd = x(marks[i]); if (room - xd >= 64) { labelled.add(marks[i]); room = xd; } }
  const axis = axisIndexes(n, 10), last = axis.length - 1;   // every recorded day gets its date while ten or fewer fit; more, ten spread evenly
  const key = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const to = e.key === "ArrowRight" ? Math.min(n - 1, (hover ?? -1) + 1) : e.key === "ArrowLeft" ? Math.max(0, (hover ?? n) - 1) : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (to != null) { e.preventDefault(); setHover(to); }
  };
  return (
    <div className="scm-panel">
      <svg viewBox={`0 0 ${W} ${h}`} role="img" tabIndex={0} aria-label={`${label}, ${n} days recorded. Use the left and right arrow keys to read each day.`} onPointerMove={move} onPointerLeave={() => setHover(null)}
        onKeyDown={key} onFocus={() => setHover((c) => c ?? n - 1)} onBlur={() => setHover(null)}>
        {ticks.map((g) => <g key={g}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeWidth={g === 0 && signed ? 1.2 : 0.6} /><text x={L - 6} y={y(g) + 3} textAnchor="end" className="scm-ax">{fmt(g)}</text></g>)}
        {mid != null && <line className="scm-mid" x1={L} x2={W - R} y1={y(mid)} y2={y(mid)} stroke="var(--text)" strokeOpacity=".55" strokeWidth="1" strokeDasharray="4 4" />}
        {marks.map((d) => {
          // the dotted line and the triangle mark the day Prism re-rated the company, and the words say so; a word is left out only where it would touch the next one
          const xd = x(d), word = labelled.has(d), left = xd < L + 64;
          return <g key={d} className="scm-mark"><line x1={xd} x2={xd} y1={T - 14} y2={h - B} stroke="var(--gold)" strokeDasharray="2 3" /><path d={`M${xd - 4},${h - B + 8} l4,-7 l4,7z`} fill="var(--gold-deep, var(--gold))"><title>{`Prism re-rated on ${dateIN(d)}`}</title></path>
            {word && <text className="scm-mk" x={left ? xd + 5 : xd - 5} y={T - 8} textAnchor={left ? "start" : "end"}>Re-rated</text>}</g>; })}
        {points.map((p) => <line key={"r" + p.day} className="scm-rug" x1={x(p.day)} x2={x(p.day)} y1={h - B} y2={h - B + 5} />)}
        {[...series].sort((a, b) => Number(DASHED.has(a)) - Number(DASHED.has(b))).map((s) => {
          // a dot on EVERY recorded day of every line. The technical views are read every evening, so each dot is a reading. The four business scores change only when
          // Prism re-rates the company: a day with no new rating shows the rating still in force as a hollow dot, so no date is left without a point.
          const v = points.map((p) => ({ p, f: signed ? (valueOf(p, s) == null ? null : { value: valueOf(p, s)!, day: p.day, exact: true }) : figureOn(history, s, p.day) })).filter((d) => d.f != null) as { p: HistPoint; f: { value: number; day: string; exact: boolean } }[];
          if (!v.length) return null; const end = v[v.length - 1];
          const xy = v.map((d) => [x(d.p.day), y(d.f.value)] as [number, number]);
          // business scores move in steps (flat until the day of a new rating); the technical views, read every evening, as a smooth line through every reading
          return <g key={s} className="scm-line" data-series={s}><path d={signed ? monotonePath(xy) : stepPath(xy)} fill="none" stroke={COLOR[s]} strokeWidth={s === "final" ? 2.8 : 1.8} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={DASHED.has(s) ? "6 4" : undefined} />
            {v.map((d) => <circle key={d.p.day} className={"scm-dot" + (d.f.exact ? "" : " carried")} cx={x(d.p.day)} cy={y(d.f.value)} r={hp && hp.day === d.p.day ? dr + 2 : dr} fill={d.f.exact ? COLOR[s] : "var(--bg)"} stroke={d.f.exact ? "var(--bg)" : COLOR[s]} strokeWidth={d.f.exact ? 1.3 : 1.8}><title>{`${NAME[s]} ${fmt(d.f.value, signed)} on ${dateIN(d.p.day)}${d.f.exact ? "" : `, the rating from ${dateIN(d.f.day)} still in force`}`}</title></circle>)}
            <circle cx={x(end.p.day)} cy={y(end.f.value)} r={dr + 2.4} fill="none" stroke={COLOR[s]} strokeWidth="1.4" /></g>; })}
        {axis.map((i, k) => <text key={points[i].day} x={x(points[i].day)} y={h - 5} textAnchor={axis.length > 1 && k === 0 ? "start" : axis.length > 1 && k === last ? "end" : "middle"} className="scm-ax">{dateIN(points[i].day, { day: "numeric", month: "short" })}</text>)}
        {hp && <line x1={x(hp.day)} x2={x(hp.day)} y1={T} y2={h - B} stroke="var(--border-strong)" strokeDasharray="3 3" />}
      </svg>
      {hp && hover != null && <div className="scm-tip" role="status"><b>{dateIN(hp.day)}</b>{series.map((s) => {
        const f = signed ? (valueOf(hp, s) == null ? null : { value: valueOf(hp, s)!, day: hp.day, exact: true }) : figureOn(history, s, hp.day);   // business scores: the figure in force that day
        return <span key={s}><i style={{ background: swatch(s) }} />{NAME[s]} {f ? fmt(f.value, signed) : "no figure yet"}{f && !f.exact && <small> · rated {dateIN(f.day, { day: "numeric", month: "short" })}</small>}</span>; })}</div>}
    </div>);
}

const one = (v: number) => (v < 0 ? MINUS : "") + String(Math.abs(Math.round(v * 10) / 10));
/** One legend row per line: its colour (dashed where the line is), name, latest value and the change over the window (▲ green, ▼ red, 0 grey). */
function Legend({ series, all, moves }: { series: Series[]; all: HistPoint[]; moves: WindowMove[] }) {
  const latest = all[all.length - 1];
  return (
    <ul className="scm-lgd" aria-label="Latest value and change in this period">
      {series.map((s) => {
        const tech = isTechnical(s), now = latest ? (tech ? valueOf(latest, s) : figureOn(all, s, latest.day)?.value ?? null) : null, d = moves.find((m) => m.s === s)?.delta;
        return <li key={s}><i style={{ background: swatch(s) }} aria-hidden="true" /><span className="scm-ln">{LEGEND_NAME[s]}</span><b>{fmt(now, tech)}</b>
          <em className={d == null ? "na" : d > 0 ? "up" : d < 0 ? "down" : "zero"} aria-label={d == null ? "no change to show" : d === 0 ? "unchanged" : `${d > 0 ? "up" : "down"} ${one(Math.abs(d))}`}>{d == null ? "—" : d === 0 ? "0" : `${d > 0 ? "▲" : "▼"} ${one(Math.abs(d))}`}</em></li>;
      })}
    </ul>
  );
}

export function ScoreMoves({ points: all, range }: { points: HistPoint[]; range: Range }) {
  const base = useMemo(() => inRange(all, range).points, [all, range]);
  const moves = useMemo(() => windowMoves(all, base), [all, base]);
  const lead = leadLine(moves), few = base.length < 2;
  return (
    <div className="scm scm216">
      <div className="scm-lead" aria-live="polite">
        <p><b>Biggest move in this period:</b> {few ? "only one recorded day falls in this period." : lead.biggest ?? "none of the scores moved."}</p>
        {!few && lead.unchanged && lead.biggest && <p className="scm-unch">Unchanged: {lead.unchanged}</p>}
      </div>
      {few ? <p className="faint scm-empty">Only one recorded day falls in this period, so there is no line to draw yet. Try a longer period.</p> : (
        <ChartZoom label="How the scores have moved" className="cz-r"><div className="scm-two">
          <section className="scm-c" aria-label="Business scores, 0 to 100">
            <h4>Business scores <small>0 to 100 · higher is better</small></h4>
            <Panel points={base} history={all} series={BUSINESS} lo={0} hi={100} ticks={[0, 25, 50, 75, 100]} h={250} marks={[]} label="Business scores over time" signed={false} mid={50} />
            <Legend series={BUSINESS} all={all} moves={moves} />
          </section>
          <section className="scm-c" aria-label="Technical views, −100 to +100">
            <h4>Technical views <small>−100 to +100 · above 0 leans up</small></h4>
            <Panel points={base} history={all} series={TECHNICAL} lo={-100} hi={100} ticks={[-100, -50, 0, 50, 100]} h={250} marks={[]} label="Technical views over time" signed mid={0} />
            <Legend series={TECHNICAL} all={all} moves={moves} />
          </section>
        </div></ChartZoom>)}
    </div>);
}

const short = (d: string) => dateIN(d, { day: "numeric", month: "short" });
export function ScoreMovesCard({ symbol, statement }: { symbol: string; statement: string }) {
  const gold = useGold(), open = useContext(OpenAccess);
  const q = usePrismHistory(symbol, statement, gold || open);
  const [range, setRange] = useState<Range>("1w");
  if (q.isError || (!q.data && !q.isLoading)) return null;   // the server and this page disagree about the plan: say nothing rather than show a lock to a member
  const all = q.data?.points ?? [];
  const w = inRange(all, range), first = all[0]?.day ?? null;
  return (
    <section className="card acc scm-card scm216-card" id="scores-moved" aria-label="How the scores have moved">
      <header className="scm-h">
        <span className="scm-hi" aria-hidden="true"><Icon name="growth" /></span>
        <div className="scm-ht">
          <p className="scm-eb">FinLit Prism · score history</p>
          <h3>How the scores have moved</h3>
          {w.start && w.end && <p className="scm-dl">{short(w.start)} to {dateIN(w.end)} · As of {dateIN(w.end)}{first && w.start < first ? ` · recording began ${dateIN(first)}` : ""}</p>}
        </div>
        <div className="scm-rng" role="group" aria-label="Period">{RANGES.map((r) => <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>)}</div>
      </header>
      {q.isLoading ? <div className="skeleton" style={{ height: 200 }} /> : all.length < 2 ? <p className="faint scm-empty">{q.data?.note || "The history starts on the day recording began; there are not yet enough days to draw it."}</p> : <ScoreMoves points={all} range={range} />}
      <p className="faint scm-foot"><span className="scm-k"><i className="solid" aria-hidden="true" />new rating that day</span> <span className="scm-k"><i className="hollow" aria-hidden="true" />earlier rating still holds</span> · Valuation: higher means cheaper · Risk: higher means lower risk</p>
    </section>);
}
