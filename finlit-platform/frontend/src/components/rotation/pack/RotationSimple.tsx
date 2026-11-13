// Sector Rotation, Simple view, as the "FinLit final pages" pack draws it (docs/design/finlit-final-pages/08): How to read, Today in one minute, How your industries compare,
// the map, Who is ahead, Changed box this week, May change box next week, Biggest rank moves, The four boxes, Words. Figures from GET /api/rotation; the words and the
// choices from lib/rotationPack. Styles: styles/sectors-pack.css (sp-) and styles/rotation-pack.css (rp-). Describes how industries have done; never advice.
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { CoLogo } from "../../CoLogo";
import { Cards, InsightCard, Scroll, Section, Tip, BoxChip } from "../../sectors/pack/Common";
import { BOX, short, type Card } from "../../../lib/pulsePack";
import { mapGeometry, placeLabels, sparkPath, type RotationMap, type RotationRow } from "../../../lib/rotation";
import type { GroupRow } from "../../../lib/sectors";
import {
  BOXES, BOX_HELP, BOX_MEANING, CYCLE, LEVEL, WATCH_NEXT, aheadCards, boxCounts, changeMeaning, lastMonth, mapCards, mayMoveMeaning, mayMoveRows, meansForYou, movedRows, nextBox,
  pc, pt, pulseAgrees, rankMoveCards, ranked, rotationHeadline, rotationTodayCards, sixMonths, turned, yourRotationCards, type Agree, type Box,
} from "../../../lib/rotationPack";

export const BOX_COLOUR: Record<Box, string> = { ahead_gaining: "#0F6B3A", ahead_slowing: "#8F5400", behind_gaining: "#2F5A9E", behind_slipping: "#A8342B" };   // the pack's dot colours
const Yours = () => <em className="rp-yours"> · Yours</em>;

// ------------------------------------------------------------------------------------------------ How to read this page
export function HowToReadRot({ m }: { m: RotationMap }) {
  const mk = m.market;
  return (
    <details className="sp-sec sp-fold">
      <summary><span><b className="sp-ft">How to read this page</b><small>Four steps, the market backdrop and the yardstick</small></span><span className="sp-show">Show ▾</span></summary>
      <ol className="sp-steps">
        <li><b>Find the box.</b> Each industry is compared with the average industry over the last several months (ahead or behind) and over the last month (gaining or slipping). The two answers put it in one of four boxes.</li>
        <li><b>Read the box with breadth.</b> Most means most of the industry's stocks are above their 50-day average; Few means a handful carry it. A broad lead has held up better than a narrow one.</li>
        <li><b>Watch the rank and its moves.</b> The rank puts every industry on one list each week. The arrows show the places it moved in 1 and 4 weeks.</li>
        <li><b>Boxes describe the past.</b> A box says how an industry has done, not what it will do. It is not a reason to act on its own.</li>
      </ol>
      {mk?.pct_vs_200d != null && <p className="sp-why"><b>Market backdrop</b> The Nifty 50 is {Math.abs(mk.pct_vs_200d).toFixed(1)}% {mk.pct_vs_200d >= 0 ? "above" : "below"} its long-term average: the market as a whole is in {mk.pct_vs_200d >= 0 ? "an uptrend" : "a downtrend"}.</p>}
      <p className="sp-why"><b>The yardstick</b> The average industry: all {m.rows.length} industries counted equally. Every figure on this page says how far an industry is ahead of (+) or behind (−) this average.</p>
      <Link className="sp-link" to="/learn/sector-rotation">How to use Sector Rotation →</Link>
    </details>
  );
}

// ------------------------------------------------------------------------------------------------ Today in one minute
export function TodayRot({ m, mine, pulse }: { m: RotationMap; mine: Set<string>; pulse: Map<string, GroupRow> }) {
  const h = rotationHeadline(m, mine), cards = rotationTodayCards(m, mine, pulse), counts = boxCounts(m), total = m.rows.length;
  return (
    <section className="sp-sec" aria-labelledby="rp-today">
      <h2 id="rp-today">Today in one minute</h2>
      <p className="sp-sub">Which industries are leading, which are fading, and what changed this week.</p>
      <p className="sp-lead"><b>{h.lead}</b>{h.rest}</p>
      <p className="sp-note">{h.line}</p>
      <div className="rp-today">
        <div>
          <p className="sp-cap">All {total} industries by box</p>
          <div className="rp-strip" role="img" aria-label={counts.map((c) => `${BOX[c.box].word} ${c.now}`).join(", ")}>{counts.map((c) => <i key={c.box} style={{ flex: c.now, background: BOX_COLOUR[c.box] }} />)}</div>
          <table className="sp-tb rp-counts">
            <thead><tr><th scope="col">Box</th><th scope="col" className="r">Now</th><th scope="col" className="r">Vs last week</th></tr></thead>
            <tbody>{counts.map((c) => { const d = c.now - c.last; return (
              <tr key={c.box}><td><span className="rp-boxname"><i className="rp-sq" style={{ background: BOX_COLOUR[c.box] }} aria-hidden="true" />{BOX[c.box].word}<Tip text={BOX_HELP[c.box]} label={`About “${BOX[c.box].word}”`} /></span></td>
                <td className="r rp-big">{c.now}</td><td className={"r rp-vs" + (d > 0 ? " up" : d < 0 ? " dn" : "")}>{d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : "no change"}</td></tr>); })}</tbody>
          </table>
        </div>
        <Cards items={cards} cols={2} />
      </div>
    </section>
  );
}

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
const RankCell = ({ r }: { r: RotationRow }) => {
  const c = r.rank_change_4w;
  return <span className="rp-rank"><span><b>{r.rank ?? "–"}</b>{r.rank != null && <> of {r.ranked}</>}</span><small className={c == null ? "" : c > 0 ? "up" : c < 0 ? "dn" : ""}>{c == null ? "" : c > 0 ? `▲ ${c} in 4 weeks` : c < 0 ? `▼ ${-c} in 4 weeks` : "same in 4 weeks"}</small></span>;
};
export function YourRot({ m, mine, shares, value, pulse, signedIn }: { m: RotationMap; mine: Set<string>; shares: Map<string, string[]>; value: Map<string, number>; pulse: Map<string, GroupRow>; signedIn: boolean }) {
  const rows = m.rows.filter((r) => mine.has(r.slug)).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const nShares = [...shares.values()].reduce((s, x) => s + x.length, 0);
  return (
    <Section id="rp-yours" title="How your industries compare" help="How your industries compare. The industries your shares belong to, each with its box, its rank among all industries and how it has done against the average industry."
      sub={rows.length ? `The ${rows.length} industries your ${nShares} shares belong to, from the strongest rank to the weakest.` : "The industries your shares belong to, from the strongest rank to the weakest."}
      why="A share in a leading industry has the wind behind it; a share in a lagging one is swimming against the current. This shows which of your shares have which.">
      {!rows.length ? <p className="sp-empty">{signedIn ? "Add shares to your portfolio to see how their industries compare." : <>Sign in and add shares to your portfolio to see how their industries compare. <Link to="/login">Sign in</Link></>}</p> : <>
        <Cards items={yourRotationCards(rows, value, shares, pulse)} />
        <Scroll label="your industries"><table className="sp-tb rp-yourt">
          <thead><tr><th scope="col">Industry and your shares</th><th scope="col">Its box<Tip text="Its box: how the industry has done against the average industry over the last several months and over the last month." /></th>
            <th scope="col">Rank<Tip text="Its place among all ranked industries this week, 1 the strongest; below it, the places moved in 4 weeks." /></th><th scope="col">Rank, 26 weeks<Tip text="Its rank at each of the last 26 weekly closes: higher on the line is a better rank. The shaded band is the top third." /></th>
            <th scope="col">Vs the average industry<Tip text="How much better (+) or worse (−) the industry did than the average industry over the last month and the last 6 months." /></th><th scope="col">What it means for you</th></tr></thead>
          <tbody>{rows.map((r) => { const mf = meansForYou(r); return (
            <tr key={r.slug}><td><Link to={`/sectors/${r.slug}`} className="rp-ind"><b>{short(r.name)}</b></Link><span className="rp-shares">{(shares.get(r.slug) ?? []).map((s) => <Link key={s} to={`/stocks/${s}`} className="sp-sym rp-pill"><CoLogo symbol={s} size={18} inline />{s}</Link>)}</span></td>
              <td><BoxChip corner={r.corner} help /></td><td><RankCell r={r} /></td><td><RankLine r={r} /></td>
              <td className="rp-vsavg"><span>last month <b className={(lastMonth(r) ?? 0) > 0 ? "sp-good" : (lastMonth(r) ?? 0) < 0 ? "sp-red" : ""}>{pc(lastMonth(r))}</b></span><span>6 months <b className={(sixMonths(r) ?? 0) > 0 ? "sp-good" : (sixMonths(r) ?? 0) < 0 ? "sp-red" : ""}>{pc(sixMonths(r))}</b></span></td>
              <td>{mf && <span className={"sp-mean rp-mean-" + mf.tone}>{mf.text}</span>}</td></tr>); })}</tbody>
        </table></Scroll>
      </>}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ The map
export function MapRot({ m, mine }: { m: RotationMap; mine: Set<string> }) {
  const rows = useMemo(() => ranked(m), [m]);
  const [on, setOn] = useState<Record<Box, boolean>>({ ahead_gaining: true, ahead_slowing: true, behind_gaining: true, behind_slipping: true });
  const [ring, setRing] = useState(true), [paths, setPaths] = useState(false), [pick, setPick] = useState<string | null>(null);
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
    <Section id="rp-map" title="The map: where every industry stands" help="The map. Each dot is an industry. Across: how far it is ahead of or behind the average industry over the last several months. Up: whether it has been gaining on the average lately. The four boxes are the four parts of the map."
      sub="Each dot is an industry. Choose which boxes to show.">
      <div className="rp-toggles" role="group" aria-label="What the map shows">
        {BOXES.map((b) => <button key={b} type="button" className={"rp-tg rp-tg-" + BOX[b].tone + (on[b] ? " on" : "")} aria-pressed={on[b]} onClick={() => setOn({ ...on, [b]: !on[b] })}><span className="rp-tick" aria-hidden="true">✓</span>{BOX[b].word} · {count(b)}</button>)}
        <span className="rp-sep" aria-hidden="true" />
        <button type="button" className={"rp-tg rp-tg-mine" + (ring ? " on" : "")} aria-pressed={ring} onClick={() => setRing(!ring)}><span className="rp-tick" aria-hidden="true">✓</span>Ring my industries</button>
        <button type="button" className={"rp-tg rp-tg-path" + (paths ? " on" : "")} aria-pressed={paths} onClick={() => setPaths(!paths)}><span className="rp-tick" aria-hidden="true">✓</span>Show 8-week paths</button>
      </div>
      <div className="rp-mapwrap">
        <div className="rp-mapbox" role="region" aria-label="the map" tabIndex={0}>
          <svg viewBox={`0 0 ${W} ${H}`} className="rp-map" role="group" aria-label={`Map of ${rows.length} ranked industries against the average industry`}>
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
            {shown.map((d) => { const l = lab[d.slug], me = mine.has(d.slug); return (
              <g key={d.slug} className={"rp-dot" + (pick === d.slug ? " sel" : "")}>
                {ring && me && <circle cx={d.x} cy={d.y} r={9} className="rp-ring" />}
                <circle cx={d.x} cy={d.y} r={me ? 5.5 : 4.5} style={{ fill: BOX_COLOUR[d.row.corner as Box] }} />
                <circle cx={d.x} cy={d.y} r={12} className="rp-hit" tabIndex={0} role="button" aria-label={`${short(d.name)}: ${BOX[d.row.corner as Box].word}, rank ${d.row.rank} of ${d.row.ranked}, ${pc(d.row.strength_pts)} over the last several months, ${pc(d.row.change_pts)} lately`}
                  onClick={() => setPick(pick === d.slug ? null : d.slug)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPick(pick === d.slug ? null : d.slug); } }}><title>{`${short(d.name)} · rank ${d.row.rank}`}</title></circle>
                {l && <text className={"rp-dl" + (me ? " me" : "")} x={l.x} y={l.y} textAnchor={l.anchor}>{short(d.name)}</text>}
              </g>); })}
          </svg>
          {picked && <p className="rp-pick" role="status">{short(picked.name)}: rank {picked.row.rank} of {picked.row.ranked}, {BOX[picked.row.corner as Box].word}. {pc(picked.row.strength_pts)} against the average over the last several months, {pc(picked.row.change_pts)} lately. <Link to={`/sectors/${picked.slug}`}>Open {short(picked.name)} →</Link></p>}
        </div>
        <aside className="rp-howmap">
          <b>How to read the map</b>
          <ol>
            <li><b>Right of the middle line</b> ahead of the average industry over the last several months.</li>
            <li><b>Above the middle line</b> gaining on the average lately.</li>
            <li><b>So</b> the top-right box holds the leaders that are still pulling ahead; bottom-left, the laggards still falling back.</li>
            <li><b>A path</b> is the route over the last 8 weeks. Industries usually move round the boxes clockwise: up-left → up-right → down-right → down-left.</li>
          </ol>
          <p>Hover over any dot for its name and rank. Use the buttons above the map to hide or show each box.</p>
        </aside>
      </div>
      <Cards items={mapCards(m)} />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ Who is ahead, and which way they are moving
export function AheadRot({ m }: { m: RotationMap }) {
  const rows = m.rows.filter((r) => sixMonths(r) != null).sort((a, b) => sixMonths(b)! - sixMonths(a)!);
  const max = Math.max(1, ...rows.map((r) => Math.max(Math.abs(sixMonths(r)!), Math.abs(lastMonth(r) ?? 0))));
  const left = Math.max(1, ...rows.map((r) => Math.max(-(sixMonths(r) ?? 0), -(lastMonth(r) ?? 0), 0)));
  const right = Math.max(1, ...rows.map((r) => Math.max(sixMonths(r) ?? 0, lastMonth(r) ?? 0, 0)));
  const zero = (left / (left + right)) * 100, at = (v: number) => zero + (v / (left + right)) * 100;
  const turnedRows = rows.filter(turned);
  void max;
  return (
    <Section id="rp-ahead" hide title="Who is ahead, and which way they are moving" help="Who is ahead. Each industry's return over 6 months against the average industry (the bar) and over the last month (the dot), in percentage points."
      sub="Bars: each industry's return over 6 months against the average industry, in points. Dot: the same for the last month.">
      <ul className="sp-lgd"><li><i className="rp-lg rp-lg-up" />ahead over 6 months</li><li><i className="rp-lg rp-lg-dn" />behind over 6 months</li><li><i className="rp-lg rp-lg-dot" />last month</li></ul>
      <div className="rp-ahead" role="img" aria-label={`${rows.length} industries by their 6-month return against the average industry, with last month's`}>
        <div className="rp-ah-head" aria-hidden="true"><span /><span className="rp-ah-axis" style={{ ["--z" as string]: zero + "%" }}><small>average industry</small><em className="dn">◀ behind</em><em className="up">ahead ▶</em></span><b>6 months</b><b>Last month</b></div>
        {rows.map((r) => { const s = sixMonths(r)!, l = lastMonth(r); return (
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
      <p className="sp-note">A dot on the other side of the line from its bar is a change of direction (marked ↺ in the last column): a leader that slipped last month, or a laggard that gained.</p>
      <Cards items={aheadCards(m)} />
      {turnedRows.length > 0 && <details className="sp-more"><summary>Industries that changed direction ({turnedRows.length}) ▾</summary>
        <ul className="sp-changed">{turnedRows.map((r) => <li key={r.slug}><Link to={`/sectors/${r.slug}`}>{short(r.name)}</Link>: {pt(sixMonths(r))} over 6 months, {pt(lastMonth(r))} last month</li>)}</ul></details>}
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
const AGREE_HELP = "Does Sector Pulse agree? Sector Pulse counts how many of the industry's stocks are rising. It agrees when its stocks point the same way as the change of box: rising for a move up, not rising together for a move down.";
export function ChangedRot({ m, mine, pulse }: { m: RotationMap; mine: Set<string>; pulse: Map<string, GroupRow> }) {
  const mv = movedRows(m);
  return (
    <Section id="rp-changed" title={`Changed box this week · ${mv.length}`} help="Changed box this week. Industries whose box at this weekly close is different from last week's." sub="What changed, and what each change means.">
      {!mv.length ? <p className="sp-empty">No industry changed box this week.</p> :
        <Scroll label="industries that changed box this week"><table className="sp-tb rp-chg">
          <thead><tr><th scope="col">Industry</th><th scope="col">Last week → this week<Tip text="The box at last week's close and at this week's close." /></th><th scope="col">Rank<Tip text="Its place among all ranked industries this week, 1 the strongest." /></th><th scope="col">What it means</th><th scope="col">Does Sector Pulse agree?<Tip text={AGREE_HELP} /></th></tr></thead>
          <tbody>{mv.map((x) => <tr key={x.r.slug}><td><Link to={`/sectors/${x.r.slug}`} className="rp-ind"><b>{short(x.r.name)}</b></Link>{mine.has(x.r.slug) && <Yours />}</td><td><FromTo from={x.from} to={x.to} /></td>
            <td><b>{x.r.rank ?? "–"}</b> of {x.r.ranked}</td><td><Meaning {...changeMeaning(x.from, x.to, x.r)} /></td><td><AgreeCell a={pulseAgrees(x.from, x.to, pulse.get(x.r.slug))} /></td></tr>)}</tbody>
        </table></Scroll>}
    </Section>
  );
}
export function MayMoveRot({ m, mine, pulse, sub = "Industries whose newest weekly reading already sits in another box.", why = true }: { m: RotationMap; mine: Set<string>; pulse: Map<string, GroupRow>; sub?: string; why?: boolean }) {
  const mm = mayMoveRows(m);
  return (
    <Section id="rp-next" title={`May change box next week · ${mm.length}`} help="May change box next week. An industry changes box only after a weekly close confirms it. These industries' newest weekly reading already sits in another box." sub={sub}
      why={why ? "This is an early look, not a forecast. Some readings flip back the next week." : undefined}>
      {!mm.length ? <p className="sp-empty">No industry's newest reading sits in another box.</p> :
        <Scroll label="industries that may change box next week"><table className="sp-tb rp-chg">
          <thead><tr><th scope="col">Industry</th><th scope="col">Now → may move to<Tip text="Its box now, and the box its newest weekly reading sits in." /></th><th scope="col">Rank<Tip text="Its place among all ranked industries this week, 1 the strongest." /></th><th scope="col">What it means</th><th scope="col">Does Sector Pulse agree?<Tip text={AGREE_HELP} /></th></tr></thead>
          <tbody>{mm.map((x) => <tr key={x.r.slug}><td><Link to={`/sectors/${x.r.slug}`} className="rp-ind"><b>{short(x.r.name)}</b></Link>{mine.has(x.r.slug) && <Yours />}</td><td><FromTo from={x.from} to={x.to} /></td>
            <td><b>{x.r.rank}</b> of {x.r.ranked}</td><td><Meaning {...mayMoveMeaning(x.from, x.to)} /></td><td><AgreeCell a={pulseAgrees(x.from, x.to, pulse.get(x.r.slug))} /></td></tr>)}</tbody>
        </table></Scroll>}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ Biggest rank moves in 4 weeks
export function RankMovesRot({ m, mine }: { m: RotationMap; mine: Set<string> }) {
  const up = m.climbers_4w.slice(0, 5), dn = m.fallers_4w.slice(0, 5), max = Math.max(1, ...[...up, ...dn].map((x) => Math.abs(x.change)));
  const since = m.rank_weeks_labels?.[m.rank_weeks_labels.length - 5] ?? m.rank_weeks[m.rank_weeks.length - 5];
  const bar = (x: { slug: string; name: string; change: number }, up: boolean) => (
    <li key={x.slug} className={mine.has(x.slug) ? "me" : ""}><span>{short(x.name)}</span><span className="rp-mvtrack"><i className={up ? "up" : "dn"} style={{ width: (Math.abs(x.change) / max) * 100 + "%" }} /><b className={up ? "sp-good" : "sp-red"}>{up ? "▲" : "▼"} {Math.abs(x.change)}</b></span></li>
  );
  return (
    <Section id="rp-moves" hide title="Biggest rank moves in 4 weeks" help="Biggest rank moves. The industries that climbed or fell the most places in the ranking over the last 4 weekly closes."
      sub={`Places climbed or fallen in the ranking since ${since ? since.replace(/ \d{4}$/, "") : "4 weeks ago"}. Highlighted: your industries.`}>
      <div className="rp-moves">
        <div><p className="sp-cap sp-good">Climbed most · places</p><ul className="rp-mv">{up.map((x) => bar(x, true))}</ul><p className="sp-cap sp-red">Fell most · places</p><ul className="rp-mv">{dn.map((x) => bar(x, false))}</ul></div>
        <div className="rp-mvcards">{rankMoveCards(m).map((c) => <InsightCard key={c.title} c={c} />)}</div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ The four boxes
export function FourBoxes({ m, mine }: { m: RotationMap; mine: Set<string> }) {
  return (
    <Section id="rp-four" hide title="The four boxes, in the order industries usually move" help="The four boxes. Industries tend to move from Behind but gaining to Ahead and gaining, then Ahead but slowing, then Behind and slipping, and round again. The order is typical, not fixed."
      sub="The number is each industry's rank, 1 to 37. ★ marks your industries.">
      <div className="rp-four">{CYCLE.map((b, i) => { const rows = m.rows.filter((r) => r.corner === b).sort((x, y) => (x.rank ?? 999) - (y.rank ?? 999)); return (
        <Fragment key={b}>
          {i > 0 && <span className="rp-four-arrow" aria-hidden="true">→</span>}
          <div className={"rp-fb rp-fb-" + BOX[b].tone}>
            <p className="rp-fb-h"><span className={"rp-fb-t rp-t-" + BOX[b].tone}>{BOX[b].arrow} {BOX[b].word}</span><Tip text={BOX_HELP[b]} label={`About “${BOX[b].word}”`} /><b>{rows.length}</b></p>
            <p className="rp-fb-x">{BOX_MEANING[b]}</p>
            <ul className="rp-fb-l">{rows.map((r) => <li key={r.slug}><Link to={`/sectors/${r.slug}`}><span className={"rp-fb-n rp-n-" + BOX[b].tone}>{r.rank ?? "–"}</span>{short(r.name)}{mine.has(r.slug) && " ★"}</Link></li>)}</ul>
            <p className="rp-fb-w"><b>What to watch next:</b> {WATCH_NEXT[b]}</p>
          </div>
        </Fragment>); })}</div>
      <p className="sp-note">After Behind and slipping the cycle starts again. Industries can skip a box or turn back; the order is typical, not fixed.</p>
    </Section>
  );
}

export const ROT_WORDS: [string, string][] = [
  ["The average industry", "All the industries counted equally. Every figure on this page is how far an industry is ahead of (+) or behind (−) it"],
  ["Box", "Where an industry sits on the map: ahead or behind the average industry over the last several months, and gaining or slipping against it lately"],
  ["Ahead and gaining", BOX_MEANING.ahead_gaining.replace(/\.$/, "")], ["Ahead but slowing", BOX_MEANING.ahead_slowing.replace(/\.$/, "")],
  ["Behind but gaining", BOX_MEANING.behind_gaining.replace(/\.$/, "")], ["Behind and slipping", BOX_MEANING.behind_slipping.replace(/\.$/, "")],
  ["Rank", "An industry's place on one list of all ranked industries each week, 1 the strongest"],
  ["May change box", "Its newest weekly reading already sits in another box; if the next weekly close agrees, it moves"],
  ["Taking part", "How many of the industry's stocks are above their 50-day average: Most, Some or Few. A lead most stocks share is broad"],
  ["Path", "The route an industry's dot took on the map over the last 8 weekly closes"],
  ["Points", "Percentage points: +5 means the industry did 5% better than the average industry over that time"],
  ["Sector Pulse", "Our other sector page: it counts how many of each industry's stocks are rising, every evening"],
];
export { LEVEL, nextBox };
