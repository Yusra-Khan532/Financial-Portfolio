// "How the scores have moved" on the stock page: the four Prism scores (0 to 100) and the two technical views (−100 to +100) in one place.
// Choose what to plot (all six, the business scores only, the technical views only, or any single line from the key), one point per day or per week,
// and the period. The four business scores move in steps, only when Prism re-rates the company (marked); the technical views update every trading evening.
// Gold, like the report. It describes how the scores moved; it never forecasts and is not a recommendation.
import { useContext, useMemo, useState } from "react";
import { Icon } from "../lib/icons";
import { dateIN, MINUS } from "../lib/format";
import { useGold } from "../lib/premium";
import { OpenAccess } from "../components/Gate";
import { toWeekly, usePrismHistory, valueOf, type HistPoint, type Series } from "../lib/prismHistory";
import { BUSINESS, NAME, PERIODS, TECHNICAL, axisIndexes, dotRadius, figureOn, inPeriod, monotonePath, moveSentence, movesOf, readingNow, reRated, seriesFor, stepPath, type Move, type Period, type Show } from "../lib/scoreMoves";
import "../styles/scoremoves.css";
import { ChartZoom } from "../components/ChartZoom";

const COLOR: Record<Series, string> = { final: "var(--text)", ["fundamental"]: "var(--p-growth)", valuation: "var(--p-quality)", quality: "var(--p-profit)", risk: "var(--p-balance)", shortTerm: "var(--gold)", longTerm: "var(--info)" };
/** Two lines are dashed so that neither can hide under another: Growth & Profitability often sits on the same figure as Valuation (both 97, say), and the
 *  long-term view is the slower of the two technical lines. Dashed lines are drawn last, on top. */
const DASHED = new Set<Series>(["fundamental", "longTerm"]);
const swatch = (s: Series) => (DASHED.has(s) ? `repeating-linear-gradient(90deg, ${COLOR[s]} 0 5px, transparent 5px 8px)` : COLOR[s]);
const W = 720, L = 42, R = 16;
const fmt = (v: number | null, signed = false) => (v == null ? MINUS : (signed && v > 0 ? "+" : "") + String(Math.round(v * 10) / 10).replace("-", MINUS));

function Panel({ points, history, series, lo, hi, ticks, h, marks, label, signed }: { points: HistPoint[]; history: HistPoint[]; series: Series[]; lo: number; hi: number; ticks: number[]; h: number; marks: string[]; label: string; signed: boolean }) {
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
        {signed && <rect x={L} width={W - L - R} y={y(20)} height={y(-20) - y(20)} fill="var(--gold)" opacity=".07" />}
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
          return <g key={s} className="scm-line" data-series={s}><path d={signed ? monotonePath(xy) : stepPath(xy)} fill="none" stroke={COLOR[s]} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={DASHED.has(s) ? "6 4" : undefined} />
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

const GROUP = {
  biz: { tag: "Fundamental", title: "Business scores · 0 to 100", aria: "Business scores, 0 to 100",
    pattern: "Step pattern: flat lines that jump only when Prism re-rates the company.",
    icon: "M1 11h4V7h4V3h4" },
  tech: { tag: "Technical", title: "Technical views · \u2212100 to +100", aria: "Technical views, \u2212100 to +100",
    pattern: "Continuous pattern: moves every trading evening. Short term reads 5 to 20 sessions, long term 6 to 18 months.",
    icon: "M1 9c2 0 2-5 4-5s2 7 4 7 2-8 4-8" },
} as const;

/** One key chip: the line's colour (dashed where the line is), its name, the latest figure and how far it moved in the period on screen ("−20.8 since 5 Nov").
 *  A line with only one figure in the period says so instead of leaving the change blank. Pressing it hides or shows the line. */
function Key({ s, now, move, off, onToggle }: { s: Series; now: number | null; move: Move | undefined; off: boolean; onToggle: () => void }) {
  const signed = TECHNICAL.includes(s);
  const chg = move ? (move.delta === 0 ? `unchanged since ${dateIN(move.fromDay, { day: "numeric", month: "short" })}` : `${fmt(move.delta, true)} since ${dateIN(move.fromDay, { day: "numeric", month: "short" })}`) : "only one figure in this period";
  return <button type="button" className={"scm-key" + (off ? " off" : "")} aria-pressed={!off} onClick={onToggle}><i style={{ background: swatch(s) }} />{NAME[s]} <b>{fmt(now, signed)}</b> <span className="scm-chg">{chg}</span></button>;
}

export function ScoreMoves({ points: all }: { points: HistPoint[] }) {
  const [show, setShow] = useState<Show>("all"), [step, setStep] = useState<"day" | "week">("day"), [period, setPeriod] = useState<Period>("3M"), [off, setOff] = useState<Series[]>([]);
  const base = useMemo(() => inPeriod(step === "week" ? toWeekly(all) : all, period), [all, step, period]);
  const chosen = seriesFor(show), visible = chosen.filter((s) => !off.includes(s));
  const biz = visible.filter((s) => BUSINESS.includes(s)), tech = visible.filter((s) => TECHNICAL.includes(s));
  const latest = all[all.length - 1], marks = useMemo(() => reRated(base), [base]);
  const moves = movesOf(base, visible), keyMoves = movesOf(base, chosen);
  const toggle = (s: Series) => setOff((o) => (o.includes(s) ? o.filter((x) => x !== s) : [...o, s]));
  const pick = (k: Show) => { setShow(k); setOff([]); };
  const bizOn = BUSINESS.some((s) => chosen.includes(s)), techOn = TECHNICAL.some((s) => chosen.includes(s)), few = base.length < 2;
  const group = (k: "biz" | "tech", members: Series[], drawn: Series[]) => {
    const g = GROUP[k];
    return (
      <section className={"scm-grp scm-g-" + k} aria-label={g.aria}>
        <header className="scm-gh"><span className="scm-tag">{g.tag}</span><h4>{g.title}</h4></header>
        <p className="scm-pat"><svg viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d={g.icon} /></svg>{g.pattern}</p>
        <div className="scm-keys" role="group" aria-label={g.aria}>
          {members.filter((s) => chosen.includes(s)).map((s) => <Key key={s} s={s} now={latest ? valueOf(latest, s) : null} move={keyMoves.find((m) => m.s === s)} off={off.includes(s)} onToggle={() => toggle(s)} />)}
        </div>
        {few ? null : drawn.length === 0 ? <p className="faint scm-empty">No line is selected here. Press a score above to draw it.</p>
          : k === "biz" ? <Panel points={base} history={all} series={drawn} lo={0} hi={100} ticks={[0, 25, 50, 75, 100]} h={techOn ? 210 : 250} marks={marks} label="Business scores over time" signed={false} />
            : <Panel points={base} history={all} series={drawn} lo={-100} hi={100} ticks={[-100, -50, 0, 50, 100]} h={bizOn ? 180 : 240} marks={[]} label="Technical views over time" signed />}
        {k === "biz" && !few && drawn.length > 0 && <ul className="scm-lg" aria-label="How to read the business chart">
          <li><svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="4.5" className="solid" /></svg>Solid dot: new rating that day</li>
          <li><svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="4" className="hollow" /></svg>Hollow dot: earlier rating still holds</li>
          <li><svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><line x1="6" x2="6" y1="0" y2="12" /></svg>Dotted line: re-rating event</li>
        </ul>}
        {k === "biz" && <p className="scm-note"><Icon name="info" /><span>Valuation: higher means cheaper. Risk: higher means lower risk.</span></p>}
      </section>);
  };
  return (
    <div className="scm">
      <ChartZoom label={"Score moves"} className="cz-r">
      <div className="scm-ctl">
        <div className="seg" role="group" aria-label="Show">{([["all", "All six"], ["business", "Business only"], ["technical", "Technical only"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={show === k} onClick={() => pick(k)}>{l}</button>)}</div>
        <div className="seg" role="group" aria-label="Points">{([["day", "Daily"], ["week", "Weekly"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={step === k} onClick={() => setStep(k)}>{l}</button>)}</div>
        <div className="seg" role="group" aria-label="Period">{PERIODS.map((p) => <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.id}</button>)}</div>
      </div>
      <p className="scm-sum" aria-live="polite">{biz.length && tech.length ? `${moveSentence(base, biz, period)} ${moveSentence(base, tech, period).replace(/^Over the last [^,]+, the/, "The")}` : moveSentence(base, visible, period)}</p>
      {few && <p className="faint scm-empty">Only one recorded day falls in this period, so there is no line to draw yet. Try a longer period.</p>}
      {bizOn && group("biz", BUSINESS, biz)}
      {techOn && group("tech", TECHNICAL, tech)}
      {!few && moves.length > 0 && <div className="tw"><table className="qtt scm-t"><caption>Change since {dateIN(moves[0].fromDay)}</caption>
        <thead><tr><th>Score</th><th className="num">Start</th><th className="num">Now</th><th className="num">Change</th><th>Reading now</th></tr></thead>
        <tbody>{moves.map((m) => <tr key={m.s}><td><i style={{ background: swatch(m.s) }} />{NAME[m.s]}</td><td className="num">{fmt(m.from, m.s === "shortTerm" || m.s === "longTerm")}</td><td className="num">{fmt(m.to, m.s === "shortTerm" || m.s === "longTerm")}</td><td className="num">{fmt(m.delta, true)}</td><td>{readingNow(m.s, m.to)}</td></tr>)}</tbody></table></div>}
      </ChartZoom>
    </div>);
}

export function ScoreMovesCard({ symbol, statement }: { symbol: string; statement: string }) {
  const gold = useGold(), open = useContext(OpenAccess);
  const q = usePrismHistory(symbol, statement, gold || open);
  if (q.isError || (!q.data && !q.isLoading)) return null;   // the server and this page disagree about the plan: say nothing rather than show a lock to a member
  const all = q.data?.points ?? [];
  return (
    <section className="card acc scm-card" id="scores-moved" aria-label="How the scores have moved">
      <div className="card-h"><h3><span className="ci"><Icon name="gauge" /></span>How the scores have moved</h3>{all.length > 0 && <span className="s">As of {dateIN(all[all.length - 1].day)}</span>}</div>
      {q.isLoading ? <div className="skeleton" style={{ height: 200 }} /> : all.length < 2 ? <p className="faint scm-empty">{q.data?.note || "The history starts on the day recording began; there are not yet enough days to draw it."}</p> : <ScoreMoves points={all} />}
      <p className="faint scm-foot">One point for each day a figure was worked out (Weekly shows the last day recorded in each week); the history starts on the day recording began and earlier days are not estimated. It describes how the scores moved; it is not a forecast or a recommendation. Information only, not investment advice.</p>
    </section>);
}
