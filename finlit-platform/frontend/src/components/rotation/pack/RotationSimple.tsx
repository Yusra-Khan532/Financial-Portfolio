// Sector Rotation, Simple view, as the "FinLit final pages" pack draws it (docs/design/finlit-final-pages/08): How to read, Today in one minute, How your industries compare,
// the map, Who is ahead, Changed box this week, May change box next week, Biggest rank moves, The four boxes, Words. Figures from GET /api/rotation; the words and the
// choices from lib/rotationPack. Styles: styles/sectors-pack.css (sp-) and styles/rotation-pack.css (rp-). Describes how industries have done; never advice.
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { playFrames, FOUR_SHOW } from "../../../lib/rotation332";
import { Link, useNavigate } from "react-router";
import { Cards, InsightCard, Scroll, Section, Tip, BoxChip, useShowAll } from "../../sectors/pack/Common";
import { BOX, ofSectors, short, type Card } from "../../../lib/pulsePack";
import { mapGeometry, placeLabels, sparkPath, type RotationMap, type RotationRow } from "../../../lib/rotation";
import type { GroupRow } from "../../../lib/sectors";
import {
  BOXES, BOX_HELP, BOX_MEANING, CYCLE, LEVEL, WATCH_NEXT, aheadCards, changeMeaning, lastMonth, mapCards, mayMoveMeaning, mayMoveRows, movedRows, nextBox,
  pc, pt, pulseAgrees, rankMoveCards, ranked, sixMonths, turned, type Agree, type Box,
} from "../../../lib/rotationPack";
import { gl } from "../../../lib/groupWords";
import { rw, rwCards } from "../../../lib/rotationWords";

export const BOX_COLOUR: Record<Box, string> = { ahead_gaining: "#0F6B3A", ahead_slowing: "#8F5400", behind_gaining: "#2F5A9E", behind_slipping: "#A8342B" };   // the pack's dot colours
const Yours = () => <em className="sp-yours">Yours</em>;   // task #332: a small gold tag on the same line

// ------------------------------------------------------------------------------------------------ Today in one minute
// ------------------------------------------------------------------------------------------------ How your industries compare
function RankLine({ r, w = 100, h = 28 }: { r: RotationRow; w?: number; h?: number }) {
  const hist = r.rank_history, worst = r.ranked || 37, d = sparkPath(hist, w, h, worst, 3);
  const last = [...hist].reverse().find((p) => p.rank != null);
  if (!d || !last) return <span className="sp-nil">too new</span>;
  const n = hist.length, i = hist.lastIndexOf(last), x = 3 + (n > 1 ? (i / (n - 1)) * (w - 6) : 0), y = 3 + ((last.rank! - 1) / Math.max(1, worst - 1)) * (h - 6);
  return (
    <svg className="rp-rankline" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`${short(r.name)}: rank over ${n} weeks, highest ${r.rank_best_26w ?? "–"}, lowest ${r.rank_worst_26w ?? "–"}, now ${last.rank}`}>
      <rect x={0} y={0} width={w} height={(h - 6) / 3 + 3} className="rp-rl-top" /><path d={d} fill="none" className="rp-rl" /><circle cx={x} cy={y} r={2.6} className="rp-rl-dot" />
    </svg>
  );
}
export { RankLine };
// ------------------------------------------------------------------------------------------------ The map
export function MapRot({ m, mine, pulse, watched, cards = 99, hover }: { m: RotationMap; mine: Set<string>; pulse?: Map<string, GroupRow>; watched?: Set<string>; cards?: number; hover?: (slug: string) => ReactNode }) {
  const rows = useMemo(() => ranked(m), [m]);
  const [on, setOn] = useState<Record<Box, boolean>>({ ahead_gaining: true, ahead_slowing: true, behind_gaining: true, behind_slipping: true });
  const [ring, setRing] = useState(true), [paths, setPaths] = useState(false), [pick, setPick] = useState<string | null>(null);
  // task #332, playback: 8 weekly closes (the 8-week paths' weeks); the slider opens on the latest close; labels hide while it is off the latest week
  const frames = useMemo(() => playFrames(m), [m]);
  const lastF = frames.length - 1;
  const [wk, setWk] = useState(lastF), [playing, setPlaying] = useState(false);
  useEffect(() => { setWk(lastF); }, [lastF]);
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setWk((w) => { if (w >= lastF) { setPlaying(false); return lastF; } return w + 1; }), 700);
    return () => window.clearInterval(t);
  }, [playing, lastF]);
  const atLast = wk >= lastF, frame = frames[wk];
  const [hv, setHv] = useState<{ slug: string; x: number; y: number } | null>(null);
  // second polish pass 1: pressing a dot (or Enter on it) still opens the sector's or industry's page, the same link as the summary line
  const navigate = useNavigate();
  const go = (slug: string) => { setPick(slug); navigate(gl(slug)); };
  void pulse; void watched;
  const W = 640, H = 460;
  const geo = mapGeometry(rows, W, H, 8, null, { left: 46, right: 12, top: 14, bottom: 36 });
  const lab = placeLabels(geo.dots, 6.6, 14, W, true, mine);
  // the pack's ticks: every 10 points across, every 5 up and down
  const tk = (lo: number, hi: number, step: number, f: (v: number) => number, a: number, b: number) => { const o: number[] = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { const p = f(v); if (p >= Math.min(a, b) - 0.5 && p <= Math.max(a, b) + 0.5) o.push(v); } return o; };
  const xTicks = tk(-100, 100, 10, geo.x, geo.left, geo.right), yTicks = tk(-50, 50, 5, geo.y, geo.top, geo.bottom);
  const shown = geo.dots.filter((d) => on[d.row.corner as Box]);
  const picked = geo.dots.find((d) => d.slug === pick);
  const q = (x1: number, y1: number, x2: number, y2: number, b: Box) => <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} className={"rp-q rp-q-" + b} />;
  const count = (b: Box) => rows.filter((r) => r.corner === b).length;
  return (
    <Section id="rp-map" title={rw("The map: where every industry stands")} help={rw("The map. Each dot is an industry. Across: how far it is ahead of or behind the average group over the last several months. Up: whether it has been gaining on the average lately. The four boxes are the four parts of the map.")}
      sub={rw("Each dot is an industry. Choose which boxes to show.")}>
      <div className="rp-toggles" role="group" aria-label="What the map shows">
        {BOXES.map((b) => <button key={b} type="button" className={"rp-tg rp-tg-" + BOX[b].tone + (on[b] ? " on" : "")} aria-pressed={on[b]} onClick={() => setOn({ ...on, [b]: !on[b] })}><span className="rp-tick" aria-hidden="true">✓</span>{BOX[b].word} · {count(b)}</button>)}
        <span className="rp-sep" aria-hidden="true" />
        <button type="button" className={"rp-tg rp-tg-mine" + (ring ? " on" : "")} aria-pressed={ring} onClick={() => setRing(!ring)}><span className="rp-tick" aria-hidden="true">✓</span>{rw("Ring my industries")}</button>
        <button type="button" className={"rp-tg rp-tg-path" + (paths ? " on" : "")} aria-pressed={paths} onClick={() => setPaths(!paths)}><span className="rp-tick" aria-hidden="true">✓</span>Show 8-week paths</button>
      </div>
      <div className="rp-mapwrap">
        <div className="rp-mapbox" role="region" aria-label="the map" tabIndex={0}>
          <svg viewBox={`0 0 ${W} ${H}`} className="rp-map" role="group" aria-label={`Map of ${ofSectors(rows.length)} ranked against the average group`}>
            {q(geo.left, geo.top, geo.x0, geo.y0, "behind_gaining")}{q(geo.x0, geo.top, geo.right, geo.y0, "ahead_gaining")}{q(geo.left, geo.y0, geo.x0, geo.bottom, "behind_slipping")}{q(geo.x0, geo.y0, geo.right, geo.bottom, "ahead_slowing")}
            <line className="rp-axis" x1={geo.left} x2={geo.right} y1={geo.y0} y2={geo.y0} /><line className="rp-axis" x1={geo.x0} x2={geo.x0} y1={geo.top} y2={geo.bottom} />
            {xTicks.map((t) => <text key={"x" + t} className="rp-tk" x={geo.x(t)} y={H - 20} textAnchor="middle">{t > 0 ? "+" : t < 0 ? "−" : ""}{Math.abs(t)}%</text>)}
            {yTicks.map((t) => <text key={"y" + t} className="rp-tk" x={geo.left - 6} y={geo.y(t) + 4} textAnchor="end">{t > 0 ? "+" : t < 0 ? "−" : ""}{Math.abs(t)}%</text>)}
            <text className="rp-ql rp-ql-behind_gaining" x={geo.left + 8} y={geo.top + 16}>↑ Behind but gaining</text>
            <text className="rp-ql rp-ql-ahead_gaining" x={geo.right - 8} y={geo.top + 16} textAnchor="end">↗ Ahead and gaining</text>
            <text className="rp-ql rp-ql-behind_slipping" x={geo.left + 8} y={geo.bottom - 8}>↘ Behind and slipping</text>
            <text className="rp-ql rp-ql-ahead_slowing" x={geo.right - 8} y={geo.bottom - 8} textAnchor="end">→ Ahead but slowing</text>
            <text className="rp-axt" x={(geo.left + geo.right) / 2} y={H - 3} textAnchor="middle">← Behind the average · over the last several months · Ahead of the average →</text>
            <text className="rp-axt" transform={`translate(12 ${(geo.top + geo.bottom) / 2}) rotate(-90)`} textAnchor="middle">Slipping lately ↓ · Gaining lately ↑</text>
            {paths && shown.map((d) => <path key={"p" + d.slug} d={d.path} fill="none" className="rp-path" style={{ stroke: BOX_COLOUR[d.row.corner as Box] }} />)}
            {shown.map((d) => { const l = lab[d.slug], me = mine.has(d.slug), f = atLast ? null : frame?.dots[d.slug];
              if (!atLast && !f) return null;                               // no reading at that weekly close
              const x = f ? geo.x(f.strength) : d.x, y = f ? geo.y(f.change) : d.y, col = BOX_COLOUR[(f ? f.corner : d.row.corner) as Box] ?? BOX_COLOUR[d.row.corner as Box];
              const show = () => setHv({ slug: d.slug, x: (x / W) * 100, y: (y / H) * 100 });
              return (
              <g key={d.slug} className={"rp-dot" + (pick === d.slug ? " sel" : "")} data-box={BOX[d.row.corner as Box].word}>
                {ring && me && <circle cx={x} cy={y} r={9} className="rp-ring sx-mdot" />}
                <circle cx={x} cy={y} r={me ? 5.5 : 4.5} style={{ fill: col }} />
                <circle cx={x} cy={y} r={12} className="rp-hit" tabIndex={0} role="link" aria-label={`Open ${short(d.name)}: ${BOX[d.row.corner as Box].word}, rank ${d.row.rank} of ${d.row.ranked}, ${pc(d.row.strength_pts)} over the last several months, ${pc(d.row.change_pts)} lately`}
                  onMouseEnter={show} onFocus={show} onMouseLeave={() => setHv(null)} onBlur={() => setHv(null)}
                  onClick={() => go(d.slug)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(d.slug); } }} />
                {atLast && l && <text className={"rp-dl" + (me ? " me" : "")} x={l.x} y={l.y} textAnchor={l.anchor}>{short(d.name)}</text>}
              </g>); })}
          </svg>
          {hover && hv && <div className="sx-hc" style={{ left: `min(calc(${hv.x}% + 14px), calc(100% - 280px))`, top: `calc(${hv.y}% + 14px)` }} role="tooltip">{hover(hv.slug)}</div>}
          {picked && <p className="rp-pick" role="status">{short(picked.name)}: rank {picked.row.rank} of {picked.row.ranked}, {BOX[picked.row.corner as Box].word}. {pc(picked.row.strength_pts)} against the average over the last several months, {pc(picked.row.change_pts)} lately. <Link to={gl(picked.slug)}>Open {short(picked.name)} →</Link></p>}
        </div>
        <aside className="rp-howmap">
          <b>How to read the map</b>
          <ol>
            <li><b>Right of the middle line</b> ahead of the average group over the last several months.</li>
            <li><b>Above the middle line</b> gaining on the average lately.</li>
            <li><b>So</b> the top-right box holds the leaders that are still pulling ahead; bottom-left, the laggards still falling back.</li>
            <li><b>A path</b> {rw("is the route over the last 8 weeks. Industries usually move round the boxes clockwise: up-left → up-right → down-right → down-left.")}</li>
          </ol>
          <p>Hover over any dot for its name and rank. Use the buttons above the map to hide or show each box.</p>
        </aside>
      </div>
      {frames.length > 1 && <div className="sx-play">
        <button type="button" className="sx-pb" aria-label={playing ? "Pause" : "Play the weeks"} onClick={() => { if (!playing && atLast) setWk(0); setPlaying(!playing); }}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
        <label>Week <input type="range" min={0} max={lastF} step={1} value={wk} aria-valuetext={frame?.label} onChange={(e) => { setPlaying(false); setWk(Number(e.target.value)); }} /></label>
        <b className="sx-pd" aria-live="polite">{frame?.label}</b>
        <span className="sx-pn">{rw(`Drag to see where every industry stood at each of the last ${frames.length} weekly closes.`)}{!atLast && " Names come back at the latest week."}</span>
      </div>}
      <Cards items={rwCards(mapCards(m).slice(0, cards))} />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ Who is ahead, and which way they are moving
export function AheadRot({ m, cards = 99 }: { m: RotationMap; cards?: number }) {
  const rows = m.rows.filter((r) => sixMonths(r) != null).sort((a, b) => sixMonths(b)! - sixMonths(a)!);
  const max = Math.max(1, ...rows.map((r) => Math.max(Math.abs(sixMonths(r)!), Math.abs(lastMonth(r) ?? 0))));
  const left = Math.max(1, ...rows.map((r) => Math.max(-(sixMonths(r) ?? 0), -(lastMonth(r) ?? 0), 0)));
  const right = Math.max(1, ...rows.map((r) => Math.max(sixMonths(r) ?? 0, lastMonth(r) ?? 0, 0)));
  const zero = (left / (left + right)) * 100, at = (v: number) => zero + (v / (left + right)) * 100;
  const turnedRows = rows.filter(turned), { shown: bars, button: barsMore } = useShowAll(rows, 10);
  void max;
  return (
    <Section id="rp-ahead" title="Who is ahead, and which way they are moving" help={rw("Who is ahead. Each industry's return over 6 months against the average group (the bar) and over the last month (the dot), in percentage points.")}
      sub={rw("Bars: each industry's return over 6 months against the average group, in points. Dot: the same for the last month.")}>
      <ul className="sp-lgd"><li><i className="rp-lg rp-lg-up" />ahead over 6 months</li><li><i className="rp-lg rp-lg-dn" />behind over 6 months</li><li><i className="rp-lg rp-lg-dot" />last month</li></ul>
      <div className="rp-ahead" role="img" aria-label={`${ofSectors(rows.length)} by their 6-month return against the average group, with last month's`}>
        <div className="rp-ah-head" aria-hidden="true"><span /><span className="rp-ah-axis" style={{ ["--z" as string]: zero + "%" }}><small>average group</small><em className="dn">◀ behind</em><em className="up">ahead ▶</em></span><b>6 months</b><b>Last month</b></div>
        {bars.map((r) => { const s = sixMonths(r)!, l = lastMonth(r); return (
          <div key={r.slug} className="rp-ah-row">
            <span className="rp-ah-n">{short(r.name)}</span>
            <span className="rp-ah-track" style={{ ["--z" as string]: zero + "%" }}>
              <i className={"rp-ah-bar " + (s >= 0 ? "up" : "dn")} style={s >= 0 ? { left: zero + "%", width: at(s) - zero + "%" } : { left: at(s) + "%", width: zero - at(s) + "%" }} />
              {l != null && <i className="rp-ah-dot" style={{ left: at(l) + "%" }} />}
            </span>
            <b className={s >= 0 ? "sp-good" : "sp-red"}>{pt(s)}</b>
            <span className={(l ?? 0) > 0 ? (turned(r) ? "sp-good rp-b" : "sp-good") : (l ?? 0) < 0 ? (turned(r) ? "sp-red rp-b" : "sp-red") : ""}>{pt(l)}{turned(r) && <span aria-label=" (changed direction)"> ↺</span>}</span>
          </div>); })}
      </div>
      {barsMore}
      <p className="sp-note">A dot on the other side of the line from its bar is a change of direction (marked ↺ in the last column): a leader that slipped last month, or a laggard that gained.</p>
      <Cards items={rwCards(aheadCards(m).slice(0, cards))} />
      {turnedRows.length > 0 && <details className="sp-more"><summary>{rw("Industries that changed direction (")}{turnedRows.length}) ▾</summary>
        <ul className="sp-changed">{turnedRows.map((r) => <li key={r.slug}><Link to={gl(r.slug)}>{short(r.name)}</Link>: {pt(sixMonths(r))} over 6 months, {pt(lastMonth(r))} last month</li>)}</ul></details>}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ Changed box this week · May change box next week
const KIND_IC: Record<Card["kind"], ReactNode> = {
  good: <path d="M4 14l4-4 3 3 5-6M12 7h4v4" />, watch: <><path d="M10 3l8 14H2z" /><path d="M10 8v4M10 14.5v.5" /></>,
  insight: <><path d="M10 3a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9z" /><path d="M8 17h4" /></>, warning: <><circle cx="10" cy="10" r="7" /><path d="M10 6v5M10 13.5v.5" /></>,
};
function Meaning({ kind, lead, text }: { kind: Card["kind"]; lead: string; text: string }) {
  return <div className={"rp-mean sp-" + kind}><span className="sp-card-ic" aria-hidden="true"><svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{KIND_IC[kind]}</svg></span><p><b>{lead}</b> {text}</p></div>;
}
function AgreeCell({ a }: { a: Agree | null }) {
  if (!a) return <span className="sp-nil">No Sector Pulse reading</span>;
  return <span className="rp-agree"><span className={"rp-ag rp-ag-" + a.tone}>{a.word}</span><small>{a.why}</small></span>;
}
const FromTo = ({ from, to }: { from: Box; to: Box }) => <span className="rp-fromto"><span><BoxChip corner={from} /> <span aria-label="to">→</span></span><BoxChip corner={to} /></span>;
const AGREE_HELP = ("Does Sector Pulse agree? Sector Pulse counts how many of the industry's stocks are rising. It agrees when its stocks point the same way as the change of box: rising for a move up, not rising together for a move down.");
export function ChangedRot({ m, mine, pulse }: { m: RotationMap; mine: Set<string>; pulse: Map<string, GroupRow> }) {
  const mv = movedRows(m), { shown: mvShown, button: mvMore } = useShowAll(mv, 4);
  return (
    <Section id="rp-changed" title={`Changed box this week · ${mv.length}`} help={rw("Changed box this week. Industries whose box at this weekly close is different from last week's.")} sub="What changed, and what each change means.">
      {!mv.length ? <p className="sp-empty">{rw("No industry changed box this week.")}</p> :
        <Scroll label={rw("industries that changed box this week")}><table className="sp-tb rp-chg">
          <thead><tr><th scope="col">{rw("Industry")}</th><th scope="col">Last week → this week<Tip text="The box at last week's close and at this week's close." /></th><th scope="col">Rank<Tip text="Its place among all ranked groups this week, 1 the strongest." /></th><th scope="col">What it means</th><th scope="col">Does Sector Pulse agree?<Tip text={rw(AGREE_HELP)} /></th></tr></thead>
          <tbody>{mvShown.map((x) => <tr key={x.r.slug} className={mine.has(x.r.slug) ? "sx-mine" : undefined}><td><Link to={gl(x.r.slug)} className="rp-ind"><b>{short(x.r.name)}</b></Link>{mine.has(x.r.slug) && <Yours />}</td><td><FromTo from={x.from} to={x.to} /></td>
            <td><b>{x.r.rank ?? "–"}</b> of {x.r.ranked}</td><td><Meaning {...changeMeaning(x.from, x.to, x.r)} /></td><td><AgreeCell a={pulseAgrees(x.from, x.to, pulse.get(x.r.slug))} /></td></tr>)}</tbody>
        </table></Scroll>}
      {mvMore}
    </Section>
  );
}
export function MayMoveRot({ m, mine, pulse, sub = rw("Industries whose newest weekly reading already sits in another box."), why = true }: { m: RotationMap; mine: Set<string>; pulse: Map<string, GroupRow>; sub?: string; why?: boolean }) {
  const mm = mayMoveRows(m), { shown: mmShown, button: mmMore } = useShowAll(mm, 4);
  return (
    <Section id="rp-next" title={`May change box next week · ${mm.length}`} help={rw("May change box next week. An industry changes box only after a weekly close confirms it. These industries' newest weekly reading already sits in another box.")} sub={sub}
      why={why ? "This is an early look, not a forecast. Some readings flip back the next week." : undefined}>
      {!mm.length ? <p className="sp-empty">{rw("No industry's newest reading sits in another box.")}</p> :
        <Scroll label={rw("industries that may change box next week")}><table className="sp-tb rp-chg">
          <thead><tr><th scope="col">{rw("Industry")}</th><th scope="col">Now → may move to<Tip text="Its box now, and the box its newest weekly reading sits in." /></th><th scope="col">Rank<Tip text="Its place among all ranked groups this week, 1 the strongest." /></th><th scope="col">What it means</th><th scope="col">Does Sector Pulse agree?<Tip text={rw(AGREE_HELP)} /></th></tr></thead>
          <tbody>{mmShown.map((x) => <tr key={x.r.slug} className={mine.has(x.r.slug) ? "sx-mine" : undefined}><td><Link to={gl(x.r.slug)} className="rp-ind"><b>{short(x.r.name)}</b></Link>{mine.has(x.r.slug) && <Yours />}</td><td><FromTo from={x.from} to={x.to} /></td>
            <td><b>{x.r.rank}</b> of {x.r.ranked}</td><td><Meaning {...mayMoveMeaning(x.from, x.to)} /></td><td><AgreeCell a={pulseAgrees(x.from, x.to, pulse.get(x.r.slug))} /></td></tr>)}</tbody>
        </table></Scroll>}
      {mmMore}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ Biggest rank moves in 4 weeks
export function RankMovesRot({ m, mine, cards = 99 }: { m: RotationMap; mine: Set<string>; cards?: number }) {
  const up = m.climbers_4w.slice(0, 5), dn = m.fallers_4w.slice(0, 5), max = Math.max(1, ...[...up, ...dn].map((x) => Math.abs(x.change)));
  const since = m.rank_weeks_labels?.[m.rank_weeks_labels.length - 5] ?? m.rank_weeks[m.rank_weeks.length - 5];
  const bar = (x: { slug: string; name: string; change: number }, up: boolean) => (
    <li key={x.slug} className={mine.has(x.slug) ? "me" : ""}><span>{short(x.name)}</span><span className="rp-mvtrack"><i className={up ? "up" : "dn"} style={{ width: (Math.abs(x.change) / max) * 100 + "%" }} /><b className={up ? "sp-good" : "sp-red"}>{up ? "▲" : "▼"} {Math.abs(x.change)}</b></span></li>
  );
  return (
    <Section id="rp-moves" title="Biggest rank moves in 4 weeks" help={rw("Biggest rank moves. The industries that climbed or fell the most places in the ranking over the last 4 weekly closes.")}
      sub={rw(`Places climbed or fallen in the ranking since ${since ? since.replace(/ \d{4}$/, "") : "4 weeks ago"}. Highlighted: your industries.`)}>
      <div className="rp-moves">
        <div><p className="sp-cap sp-good">Climbed most · places</p><ul className="rp-mv">{up.map((x) => bar(x, true))}</ul><p className="sp-cap sp-red">Fell most · places</p><ul className="rp-mv">{dn.map((x) => bar(x, false))}</ul></div>
        <div className="rp-mvcards">{rwCards(rankMoveCards(m).slice(0, cards)).map((c) => <InsightCard key={c.title} c={c} />)}</div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ The four boxes
export function FourBoxes({ m, mine }: { m: RotationMap; mine: Set<string> }) {
  const [open, setOpen] = useState<Set<Box>>(new Set());
  const nRanked = m.rows.filter((r) => r.rank != null).length;
  return (
    <Section id="rp-four" title={rw("The four boxes, in the order industries usually move")} help={rw("The four boxes. Industries tend to move from Behind but gaining to Ahead and gaining, then Ahead but slowing, then Behind and slipping, and round again. The order is typical, not fixed.")}
      sub={rw(`The number is each industry's rank, 1 to ${nRanked}.`) + (mine.size ? rw(" ★ marks your industries.") : "")}>
      <div className="rp-four">{CYCLE.map((b, i) => { const rows = m.rows.filter((r) => r.corner === b).sort((x, y) => (x.rank ?? 999) - (y.rank ?? 999)), all = open.has(b); return (
        <Fragment key={b}>
          {i > 0 && <span className="rp-four-arrow" aria-hidden="true">→</span>}
          <div className={"rp-fb rp-fb-" + BOX[b].tone}>
            <p className="rp-fb-h"><span className={"rp-fb-t rp-t-" + BOX[b].tone}>{BOX[b].arrow} {BOX[b].word}</span><Tip text={BOX_HELP[b]} label={`About “${BOX[b].word}”`} /><b>{rows.length}</b></p>
            <p className="rp-fb-x">{BOX_MEANING[b]}</p>
            <ul className="rp-fb-l">{(all ? rows : rows.slice(0, FOUR_SHOW)).map((r) => <li key={r.slug}><Link to={gl(r.slug)}><span className={"rp-fb-n rp-n-" + BOX[b].tone}>{r.rank ?? "–"}</span>{short(r.name)}{mine.has(r.slug) && " ★"}</Link></li>)}</ul>
            {rows.length > FOUR_SHOW && <button type="button" className="sx-fbmore" aria-expanded={all} onClick={() => { const n = new Set(open); if (all) n.delete(b); else n.add(b); setOpen(n); }}>{all ? "Show fewer" : `Show all ${rows.length}`}</button>}
            <p className="rp-fb-w"><b>What to watch next:</b> {WATCH_NEXT[b]}</p>
          </div>
        </Fragment>); })}</div>
      <p className="sp-note">{rw("After Behind and slipping the cycle starts again. Industries can skip a box or turn back; the order is typical, not fixed.")}</p>
    </Section>
  );
}

export const ROT_WORDS: [string, string][] = [
  ["The average group", ("All the industry groups counted equally, in both views. Every figure on this page is how far an industry is ahead of (+) or behind (−) it")],
  ["Box", ("Where an industry sits on the map: ahead or behind the average group over the last several months, and gaining or slipping against it lately")],
  ["Ahead and gaining", BOX_MEANING.ahead_gaining.replace(/\.$/, "")], ["Ahead but slowing", BOX_MEANING.ahead_slowing.replace(/\.$/, "")],
  ["Behind but gaining", BOX_MEANING.behind_gaining.replace(/\.$/, "")], ["Behind and slipping", BOX_MEANING.behind_slipping.replace(/\.$/, "")],
  ["Rank", ("An industry's place on one list of all ranked groups each week, 1 the strongest")],
  ["May change box", "Its newest weekly reading already sits in another box; if the next weekly close agrees, it moves"],
  ["Taking part", ("How many of the industry's stocks are above their medium-term trend: Most, Some or Few. A lead most stocks share is broad")],
  ["Path", ("The route an industry's dot took on the map over the last 8 weekly closes")],
  ["Points", ("Percentage points: +5 means the industry did 5% better than the average group over that time")],
  ["Sector Pulse", ("Our other sector page: it counts how many of each industry's stocks are rising, updated every weekend")],
];
export { LEVEL, nextBox };
