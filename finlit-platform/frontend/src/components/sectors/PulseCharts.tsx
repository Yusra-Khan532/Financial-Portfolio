// Two new Sector Pulse charts (9 Nov 2026 pages update): "The market's mood, day by day" (how many industries were in each state each day) and "Six months of every industry" (one strip per industry).
// Each has an i button after its title, insight cards written by the server, a closed dropdown with the numbers, the enlarge arrow and Hide / Show. Descriptive only.
import { Link } from "react-router";
import { Hideable } from "../Hideable";
import { ChartHelp } from "../ChartHelp";
import { ChartZoom } from "../ChartZoom";
import { HScroll } from "../HScroll";
import { STATE_KEYS, useSectorHistory, type PulseInsight, type SectorHistory, type StateKey } from "../../lib/sectorHistory";
import "../../styles/pulse-charts.css";

const KIND: Record<PulseInsight["kind"], string> = { good: "Good sign", insight: "Insight", watch: "Watch out", warning: "Warning" };
const dayLabel = (d: string) => { const x = new Date(d + "T00:00:00"); return x.toLocaleDateString("en-IN", { day: "numeric", month: "short" }); };

export function Insights({ items }: { items: PulseInsight[] | undefined }) {
  if (!items?.length) return null;
  return <ul className="pc-ins" aria-label="What this chart says">{items.map((i) => <li key={i.title} className={"pc-in pc-in-" + i.kind}><b><span>{KIND[i.kind]}</span> {i.title}</b><p>{i.text}</p></li>)}</ul>;
}
function Key({ h }: { h: SectorHistory }) {
  return <ul className="pc-key" aria-label="Chart key">{STATE_KEYS.map((k) => <li key={k}><i className={"pc-sw pc-" + k} />{h.words[k]}</li>)}</ul>;
}

export function MoodChart({ h }: { h: SectorHistory }) {
  const n = h.dates.length, total = h.groups.length, W = 720, H = 190, bw = W / n;
  const bars = h.dates.map((d, i) => { let y = H; return { d, i, segs: STATE_KEYS.map((k) => { const v = h.counts[k][i], ht = (v / total) * H; y -= ht; return { k, v, y, ht }; }) }; });
  return (
    <Hideable id="pulse.mood" title="The market's mood, day by day">
      <section className="sx-card pc-card" aria-labelledby="pc-mood">
        <h2 id="pc-mood">The market's mood, day by day<ChartHelp id="pulse-mood" /></h2>
        <p className="sx-sub">How many of the {total} industries were in each state on each day of the last {n} sessions.</p>
        <Insights items={h.insights.mood} />
        <ChartZoom label="The market's mood, day by day">
          <svg className="pc-svg" viewBox={`0 0 ${W} ${H + 24}`} role="img" data-testid="mood-chart" aria-label={`Industries in each state, ${dayLabel(h.dates[0])} to ${dayLabel(h.dates[n - 1])}. Today: ${STATE_KEYS.map((k) => `${h.counts[k][n - 1]} ${h.words[k].toLowerCase()}`).join(", ")}.`}>
            {bars.map((b) => <g key={b.d}>{b.segs.map((s) => s.ht > 0 && <rect key={s.k} className={"pc-f pc-" + s.k} x={b.i * bw} y={s.y} width={Math.max(0.6, bw - 0.3)} height={s.ht} />)}</g>)}
            {[0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1].map((i) => <text key={i} className="pc-ax" x={Math.min(W - 24, Math.max(0, i * bw))} y={H + 16}>{dayLabel(h.dates[i])}</text>)}
          </svg>
          <Key h={h} />
        </ChartZoom>
        <details className="more pc-more"><summary>See the count, week by week</summary>
          <HScroll label="industries in each state, week by week"><table className="pc-t"><thead><tr><th scope="col">Friday close</th>{STATE_KEYS.map((k) => <th key={k} scope="col" className="r">{h.words[k]}</th>)}</tr></thead>
            <tbody>{h.weeks.map((w) => <tr key={w.date}><td>{dayLabel(w.date)}</td>{STATE_KEYS.map((k) => <td key={k} className="r">{w.counts[k]}</td>)}</tr>)}</tbody></table></HScroll>
        </details>
      </section>
    </Hideable>
  );
}

export function StripChart({ h }: { h: SectorHistory }) {
  const n = h.dates.length;
  return (
    <Hideable id="pulse.strip" title="Six months of every industry">
      <section className="sx-card pc-card" aria-labelledby="pc-strip">
        <h2 id="pc-strip">Six months of every industry<ChartHelp id="pulse-strip" /></h2>
        <p className="sx-sub">One strip per industry, oldest session on the left. Each coloured block is the state on that day.</p>
        <Insights items={h.insights.strip} />
        <ChartZoom label="Six months of every industry">
          <div className="pc-strips" role="list" data-testid="strip-chart">
            {h.groups.map((g) => (
              <div key={g.slug} className="pc-srow" role="listitem">
                <Link className="pc-sn" to={`/sectors/${g.slug}`} title={g.name}>{g.name}</Link>
                <svg className="pc-strip" viewBox={`0 0 ${n} 1`} preserveAspectRatio="none" shapeRendering="crispEdges" role="img" aria-label={`${g.name}: ${g.states[n - 1] ? h.words[g.states[n - 1] as StateKey] : "no reading"} today`}>
                  {g.states.map((s, i) => s && <rect key={i} className={"pc-f pc-" + s} x={i} y={0} width={1.04} height={1} />)}
                </svg>
                <span className="pc-now">{g.states[n - 1] ? h.words[g.states[n - 1] as StateKey] : "–"}</span>
              </div>))}
          </div>
          <Key h={h} />
        </ChartZoom>
        <details className="more pc-more"><summary>What changed this week ({h.changed_this_week.length})</summary>
          {h.changed_this_week.length
            ? <HScroll label="industries whose state changed this week"><table className="pc-t"><thead><tr><th scope="col">Industry</th><th scope="col">Last Friday</th><th scope="col">This Friday</th></tr></thead>
              <tbody>{h.changed_this_week.map((c) => <tr key={c.slug}><td><Link to={`/sectors/${c.slug}`}>{c.name}</Link></td><td>{c.last ?? "–"}</td><td>{c.now ?? "–"}</td></tr>)}</tbody></table></HScroll>
            : <p className="sx-sub">No industry changed state this week.</p>}
        </details>
      </section>
    </Hideable>
  );
}

/** Both charts for the page; nothing at all while the history is loading or when the run has too little of it. */
export function PulseCharts({ part }: { part: "mood" | "strip" }) {
  const q = useSectorHistory();
  if (!q.data) return null;
  return part === "mood" ? <MoodChart h={q.data} /> : <StripChart h={q.data} />;
}
