// Sector Pulse, the map and the mood chart (task #333, developer file 30: addition 4 and polish 3, 4, second pass 1, final check 4 and 6).
//  - HoverCard: pointing at (or focusing) a square or a dot shows its name, "Yours", its state and box chips, stocks rising (N of M), how far below its 1-year high, its
//    rank and 6 months against the average. Pressing still opens the group's page.
//  - SectorMap: tick buttons above the map, one per state with its count (always in the order crash, bouncing, rising, no signal, losing, sold off), "Only my
//    sectors" and "Names"; the member's own dots have a ring in the text colour. Under it a slider and a green Play button: the slider's last stop is the latest close
//    and where it opens; moving it places every dot where its group stood at that weekly close (GET /api/sector-playback), coloured by its reading then, with the
//    date beside; names hide while off the latest week. Play runs the year in about 14 seconds. Filters keep working during playback.
//  - MoodWeeks: "The market's mood, week by week": one column per weekly close (week_ends of /api/sector-history). Opens on Simple: 3 groups; a switch shows all
//    6 states. Pointing at or pressing a column shows that week's counts and the change on the week before in a line under the chart.
// Describes, never advises. Styles: styles/sector-pages.css.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../../lib/api";
import type { Board, GroupRow, StateCode } from "../../../lib/sectors";
import type { IndustryMap } from "../../../lib/sectorExtra";
import type { SectorHistory, StateKey } from "../../../lib/sectorHistory";
import { COLOUR, MEANING, OF_CODE, WORD, belowHigh, dayMon, groupsN, keyOf, risingOf, short } from "../../../lib/pulsePack";
import { gl, sq, tw, wordsShow } from "../../../lib/groupWords";
import { Wallet, BoxChip, Cards, Scroll, Section, StateChip } from "./Common";
import { placeLabels } from "./PulseSimple";

// ------------------------------------------------------------------------------------------------ the hover card
export function HoverCard({ r, mine, at }: { r: GroupRow; mine: boolean; at: { x: number; y: number } }) {
  const up = risingOf(r), pts = r.rotation?.strength_pts;
  return (
    <div className="sx-hc" role="tooltip" style={{ left: at.x, top: at.y }}>
      <b>{short(r.name)}{mine && <Wallet />}</b>
      <div className="sx-hcc"><StateChip k={keyOf(r)} /><BoxChip corner={r.rotation?.corner} /></div>
      <dl>
        <div><dt>Stocks rising</dt><dd>{up ?? "–"} of {r.stocks_counted}</dd></div>
        <div><dt>Below its 1-year high</dt><dd>{belowHigh(r.index_vs_52w_high) ?? "–"}</dd></div>
        <div><dt>Rank</dt><dd>{r.rotation?.rank != null ? `${r.rotation.rank} of ${r.rotation.ranked}` : "–"}</dd></div>
        <div><dt>6 months against the average</dt><dd>{pts == null ? "–" : `${pts > 0 ? "+" : pts < 0 ? "−" : ""}${Math.abs(pts).toFixed(1)} pts`}</dd></div>
      </dl>
      <small>Press to open its page.</small>
    </div>
  );
}
/** A card shown beside the element the pointer or focus is on, placed inside `box` (a positioned wrapper). */
export function useHover(box: React.RefObject<HTMLElement | null>) {
  const [h, setH] = useState<{ slug: string; x: number; y: number } | null>(null);
  const show = (slug: string, el: Element) => {
    const b = box.current?.getBoundingClientRect(), e = el.getBoundingClientRect();
    if (!b) return;
    const w = 270, x = Math.min(Math.max(0, e.right - b.left + 8), Math.max(0, b.width - w));
    setH({ slug, x: e.right - b.left + 8 + w > b.width ? Math.max(0, e.left - b.left - w - 8) : x, y: Math.max(0, e.top - b.top - 4) });
  };
  return { h, show, hide: () => setH(null) };
}

// ------------------------------------------------------------------------------------------------ the map
const MAP_ORDER: StateKey[] = ["crash", "bouncing", "rising", "no_signal", "losing", "sold_off"];
type Play = { weeks: string[]; groups: { slug: string; name: string; rising: (number | null)[]; below_high: (number | null)[]; state: (StateCode | null)[] }[] };
const PLAY_MS = 14_000;

export function SectorMap({ m, b, mine }: { m: IndustryMap; b: Board; mine: Set<string> }) {
  const nav = useNavigate();
  const view = wordsShow();
  const pq = useQuery<Play, ApiError>({ queryKey: ["sector-playback", view], queryFn: () => apiGet<Play>("/api/sector-playback" + sq()), staleTime: 3_600_000, retry: false });
  const weeks = pq.data?.weeks ?? [], last = Math.max(0, weeks.length - 1);
  const [wk, setWk] = useState<number | null>(null), [playing, setPlaying] = useState(false);
  const at = wk == null ? last : wk, latest = wk == null || at === last;
  const [off, setOff] = useState<Set<StateKey>>(new Set()), [onlyMine, setOnlyMine] = useState(false), [names, setNames] = useState(true);
  const wrap = useRef<HTMLDivElement>(null), hv = useHover(wrap);
  useEffect(() => {
    if (!playing || !weeks.length) return;
    const step = Math.max(60, Math.round(PLAY_MS / weeks.length));
    const t = setInterval(() => setWk((v) => Math.min(last, (v == null ? last : v) + 1)), step);
    return () => clearInterval(t);
  }, [playing, weeks.length, last]);
  useEffect(() => { if (playing && wk != null && wk >= last) setPlaying(false); }, [playing, wk, last]);   // Play stops at the latest close
  const W = 1000, H = 420, L = 56, R = 16, T = 10, B = 40, lo = -40;
  const x = (v: number) => L + (v / 100) * (W - L - R), y = (v: number) => T + (Math.max(lo, Math.min(0, v)) / lo) * (H - T - B);
  const pg = useMemo(() => new Map((pq.data?.groups ?? []).map((g) => [g.slug, g])), [pq.data]);
  const dots = m.rows.map((r) => {
    if (latest) return { slug: r.slug, name: r.name, rising: r.rising, below: r.below_high, state: r.state };
    const g = pg.get(r.slug), s = g?.state[at];
    return g && g.rising[at] != null && g.below_high[at] != null && s ? { slug: r.slug, name: r.name, rising: g.rising[at]!, below: g.below_high[at]!, state: OF_CODE[s] ?? "no_signal" } : null;
  }).filter((d): d is NonNullable<typeof d> => !!d).filter((d) => !off.has(d.state) && (!onlyMine || mine.has(d.slug)));
  const counts = (k: StateKey) => m.rows.filter((r) => r.state === k).length;
  const near = m.rows.filter((r) => r.rising >= 50 && r.below_high > -15);
  const tog = (k: StateKey) => setOff((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const hovered = hv.h ? b.rows.find((r) => r.slug === hv.h!.slug) : undefined;
  return (
    <Section id="sp-map" title={tw("Industry map")} help={tw("Industry map. Each dot is one industry. Across: out of every 100 of its stocks, how many are rising. Down: how far its typical stock is below its 1-year high. The colour is its state. The corners are a way to read the map, not a ranking.")}
      sub={tw("Each dot is an industry. Right means more of its stocks are rising; lower means its typical stock is further below its 1-year high. Colour is its state.")}>
      <div className="sx-fl sx-mapf" role="group" aria-label="Show on the map">
        {MAP_ORDER.map((k) => <button key={k} type="button" className={"rp-tg" + (off.has(k) ? "" : " on")} aria-pressed={!off.has(k)} onClick={() => tog(k)}><span className="rp-tick" aria-hidden="true">✓</span><i className="sx-dot" style={{ background: COLOUR[k] }} aria-hidden="true" />{WORD[k]} <small>{counts(k)}</small></button>)}
        {mine.size > 0 && <button type="button" className={"rp-tg" + (onlyMine ? " on" : "")} aria-pressed={onlyMine} onClick={() => setOnlyMine(!onlyMine)}><span className="rp-tick" aria-hidden="true">✓</span>{tw("Only my industries")}</button>}
        <button type="button" className={"rp-tg" + (names ? " on" : "")} aria-pressed={names} onClick={() => setNames(!names)}><span className="rp-tick" aria-hidden="true">✓</span>Names</button>
        {mine.size > 0 && <span className="sx-mapkey"><i className="sx-ring" aria-hidden="true" />Ringed dot: in your portfolio</span>}{/* task #448 (02 §3 Map, 04 §1) */}
      </div>
      <div className="sp-chartw sx-mapw" ref={wrap} onMouseLeave={hv.hide}>
        <svg viewBox={`0 0 ${W} ${H}`} role="group" data-testid="map-chart" aria-label={`${wordsShow() === "sectors" ? "Sectors with a reading," : groupsN(m.rows.length)} by stocks rising and distance below their 1-year high${latest ? "" : `, at the close of ${weeks[at] ? dayMon(weeks[at]) : ""}`}.`}>
          <rect className="sp-zone-up" x={x(50)} y={y(0)} width={x(100) - x(50)} height={y(-15) - y(0)} />
          <rect className="sp-zone-dn" x={x(0)} y={y(-15)} width={x(50) - x(0)} height={y(lo) - y(-15)} />
          {[0, 25, 50, 75, 100].map((v) => <g key={v}><line className={v === 50 ? "sp-mid" : "sp-grd"} x1={x(v)} x2={x(v)} y1={T} y2={H - B} /><text className="sp-ax" x={x(v)} y={H - B + 18} textAnchor="middle">{v}</text></g>)}
          {[0, -10, -20, -30, -40].map((v) => <g key={v}><line className="sp-grd" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text className="sp-ax" x={L - 8} y={y(v) + 4} textAnchor="end">{v}%</text></g>)}
          <text className="sp-zone-t up" x={x(100) - 8} y={y(0) + 18} textAnchor="end">Rising and near highs</text>
          <text className="sp-zone-t dn" x={x(0) + 8} y={y(lo) - 10}>Falling and far from highs</text>
          <text className="sp-axt" x={(L + W - R) / 2} y={H - 4} textAnchor="middle">Out of every 100 stocks, how many are rising now →</text>
          <text className="sp-axt" transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle">← Further below its 1-year high</text>
          {dots.map((d) => (
            <a key={d.slug} href={gl(d.slug)} aria-label={`${short(d.name)}: ${Math.round(d.rising)} of 100 rising, ${Math.abs(d.below).toFixed(1)}% below its high, ${WORD[d.state]}`}
              onClick={(e) => { e.preventDefault(); nav(gl(d.slug)); }} onMouseEnter={(e) => hv.show(d.slug, e.currentTarget)} onFocus={(e) => hv.show(d.slug, e.currentTarget)} onBlur={hv.hide}>
              <circle className={mine.has(d.slug) ? "sx-mdot" : undefined} cx={x(d.rising)} cy={y(d.below)} r={7} fill={COLOUR[d.state]} stroke="var(--bg)" strokeWidth={1.5} />
            </a>))}
          {names && latest && placeLabels(dots.map((d) => ({ id: d.slug, text: short(d.name), cx: x(d.rising), cy: y(d.below) })), { left: L, right: W - R, top: T, bottom: H - B })
            .map((l) => <text key={l.id} className="sp-dotl" x={l.x} y={l.y} textAnchor={l.anchor}>{l.text}</text>)}
        </svg>
        {hovered && hv.h && <HoverCard r={hovered} mine={mine.has(hovered.slug)} at={hv.h} />}
      </div>
      {weeks.length > 1 && (
        <div className="sx-play">
          <button type="button" className="sx-pb" onClick={() => { if (!playing && at >= last) setWk(0); setPlaying(!playing); }}>{playing ? "Pause" : "Play"}</button>
          <label>Week<input type="range" min={0} max={last} value={at} aria-valuetext={weeks[at]} onChange={(e) => { setPlaying(false); setWk(+e.target.value); }} /></label>
          <span className="sx-pd" aria-live="polite">{weeks[at] ? `${dayMon(weeks[at])} ${weeks[at].slice(0, 4)}` : ""}</span>
          <span className="sx-pn">{latest ? "The latest close. Move the slider or press Play to see where each group stood at every weekly close of the last year." : "Names are hidden while the slider is off the latest week; they come back at the latest week."}</span>
        </div>)}
      <Cards items={[{ kind: "good", title: `${groupsN(near.length)} rising and near their highs`, text: "Top-right corner: half or more of their stocks are rising and the typical stock is close to its 1-year high." }]} />
      <details className="sp-more"><summary>{tw("Every industry on the map (")}{m.rows.length}) ▾</summary>
        <Scroll label={tw("every industry on the map")}><table className="sp-tb"><thead><tr><th scope="col">{tw("Industry")}</th><th scope="col">State</th><th scope="col" className="r">Stocks rising of 100</th><th scope="col" className="r">Below its 1-year high</th><th scope="col">Box</th></tr></thead>
          <tbody>{m.rows.map((r) => <tr key={r.slug} className={mine.has(r.slug) ? "sx-mine" : undefined}><td><Link to={gl(r.slug)}>{short(r.name)}</Link></td><td>{r.state_word}</td><td className="r">{Math.round(r.rising)}</td><td className="r">{belowHigh(r.below_high)}</td><td>{r.corner ?? "–"}</td></tr>)}</tbody></table></Scroll>
      </details>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ the mood, week by week
/** Task #448 (developer file 42, 02 §3 Over time): "The market's mood, week by week" as one chart. Each weekly close is a thin column: groups rising or bouncing
 *  back are drawn up from a middle line, groups losing steam or sold off down from it; the rest (no clear signal) are left out of the bars and named in the
 *  readout. The chart is one slider (role="slider"): ← → / ↑ ↓ / Home / End or a pointer pick a week; it opens on the latest. */
const UP: StateKey[] = ["rising", "bouncing", "crash"], DOWN: StateKey[] = ["losing", "sold_off"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function moodLead(up: number, down: number, up4: number | null, down4: number | null, ns: string): { b: string; rest: string } {
  const b = up < down ? `More ${ns} are being sold than rising.` : up > down ? `More ${ns} are rising than being sold.` : "Rising and selling are even.";
  return { b, rest: ` This week ${up} ${up === 1 ? "is" : "are"} rising or bouncing back and ${down} ${down === 1 ? "is" : "are"} losing steam or sold off${up4 != null && down4 != null ? `; four weeks ago it was ${up4} and ${down4}` : ""}.` };
}
export function MoodWeeks({ h }: { h: SectorHistory }) {
  const ends = h.week_ends ?? [], n = ends.length;
  const [on, setOn] = useState(n - 1);
  const box = useRef<HTMLDivElement>(null);
  const cnt = (i: number, ks: StateKey[]) => h.groups.filter((g) => g.states[i] && ks.includes(g.states[i]!)).length;
  const cols = ends.map((i) => ({ date: h.dates[i], up: cnt(i, UP), down: cnt(i, DOWN), rest: h.groups.filter((g) => g.states[i] && !UP.includes(g.states[i]!) && !DOWN.includes(g.states[i]!)).length }));
  if (!n) return <div className="sp-sec"><p className="sp-empty">The history is not available right now.</p></div>;
  const max = Math.max(1, ...cols.map((c) => Math.max(c.up, c.down)));
  const W = 1000, H = 230, top = 10, mid = 105, half = 90, step = W / n, bw = Math.max(4, Math.min(18, step * 0.55));
  const ns = tw("industries"), last = cols[n - 1], four = n >= 5 ? cols[n - 5] : null;
  const lead = moodLead(last.up, last.down, four?.up ?? null, four?.down ?? null, ns);
  const months: { j: number; label: string }[] = [];
  cols.forEach((c, j) => { const m = Number(c.date.slice(5, 7)) - 1, prev = j ? Number(cols[j - 1].date.slice(5, 7)) - 1 : -1;
    if (m !== prev && (!months.length || j - months[months.length - 1].j >= 3)) months.push({ j, label: MONTH[m] }); });
  const pickAt = (clientX: number) => { const r = box.current?.getBoundingClientRect(); if (!r) return; setOn(Math.max(0, Math.min(n - 1, Math.floor(((clientX - r.left) / r.width) * n)))); };
  const key = (e: React.KeyboardEvent) => {
    const j = e.key === "ArrowRight" || e.key === "ArrowUp" ? Math.min(n - 1, on + 1) : e.key === "ArrowLeft" || e.key === "ArrowDown" ? Math.max(0, on - 1) : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j >= 0) { e.preventDefault(); setOn(j); }
  };
  const c = cols[on] ?? last;
  const text = `${dayMon(c.date)}: ${c.up} rising or bouncing back, ${c.rest} no clear signal, ${c.down} losing steam or sold off`;
  return (
    <Section id="sp-mood" title="The market's mood, week by week" help={tw("The market's mood. At every weekly close each industry with a reading has one state. Above the line: how many were rising or bouncing back; below it: how many were losing steam or sold off.")}
      sub={tw("Each column is one weekly close: industries rising or bouncing back above the line, industries losing steam or sold off below it.")}>
      <p className="sx-yr-lead"><b>{lead.b}</b>{lead.rest}</p>
      <ul className="sx-moodkey">
        <li><i className="sx-mk-up" aria-hidden="true" />Rising or bouncing back (above the line)</li>
        <li><i className="sx-mk-dn" aria-hidden="true" />Losing steam or sold off (below the line)</li>
        <li><i className="sx-mk-rest" aria-hidden="true" />The rest: no clear signal</li>
      </ul>
      <div className="sx-moodc">
        <div className="sx-moody" aria-hidden="true"><span>{max}</span><span>0</span><span>{max}</span></div>
        <div ref={box} className="sx-moodbox" role="slider" tabIndex={0} aria-label="The market's mood, week by week" aria-valuemin={0} aria-valuemax={n - 1} aria-valuenow={on} aria-valuetext={text}
          onKeyDown={key} onPointerMove={(e) => pickAt(e.clientX)} onPointerDown={(e) => pickAt(e.clientX)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            <line className="sx-mood-mid" x1={0} x2={W} y1={mid} y2={mid} />
            {cols.map((k, j) => { const x = j * step + (step - bw) / 2, u = (k.up / max) * half, d = (k.down / max) * half; return (
              <g key={j} className={j === on ? "on" : undefined}>
                {j === on && <rect className="sx-mood-hl" x={j * step} y={top - 6} width={step} height={2 * half + 12} />}
                <rect className="sx-mood-up" x={x} y={mid - u} width={bw} height={u} />
                <rect className="sx-mood-dn" x={x} y={mid} width={bw} height={d} />
              </g>); })}
          </svg>
          <div className="sx-moodx" aria-hidden="true">{months.map((m) => <span key={m.j} style={{ left: `${((m.j + 0.5) / n) * 100}%` }}>{m.label}</span>)}</div>
        </div>
      </div>
      <p className="sx-mood-read"><b>{dayMon(c.date)}</b> · {c.up} rising or bouncing back · {c.rest} no clear signal · {c.down} losing steam or sold off</p>
    </Section>
  );
}
export { MEANING };
