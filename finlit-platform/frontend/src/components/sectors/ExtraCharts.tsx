// Two more charts of the 9 Nov 2026 pages update. "Industry map" (Sector Pulse): every industry as a point, how many of its stocks are rising against how far it is below its
// 1-year high. "A year of <industry>" (industry page): one line, how many of every 100 of its stocks were rising each day, with bands, the state strip and numbered moments.
// Both have an i button, server-written insights, a closed dropdown with the numbers, the enlarge arrow and Hide / Show. Descriptive only, never advice.
import { type ReactNode } from "react";
import { Link } from "react-router";
import { Hideable } from "../Hideable";
import { ChartHelp } from "../ChartHelp";
import { ChartZoom } from "../ChartZoom";
import { HScroll } from "../HScroll";
import { Insights } from "./PulseCharts";
import { STATE_KEYS } from "../../lib/sectorHistory";
import { useIndustryMap, useIndustryYear, type IndustryMap as MapData, type IndustryYear } from "../../lib/sectorExtra";
import "../../styles/pulse-charts.css";

const dayLabel = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const pct = (v: number) => `${v.toFixed(1).replace("-", "−")}%`;

function Key({ words }: { words: Record<string, string> }) {
  return <ul className="pc-key" aria-label="Chart key">{STATE_KEYS.map((k) => <li key={k}><i className={"pc-sw pc-" + k} />{words[k]}</li>)}</ul>;
}

export function IndustryMapChart({ m }: { m: MapData }) {
  const W = 720, H = 300, L = 44, B = 30, T = 10, R = 10;
  const lo = Math.min(-40, Math.floor(Math.min(...m.rows.map((r) => r.below_high)) / 10) * 10);
  const x = (v: number) => L + (v / 100) * (W - L - R), y = (v: number) => T + (v / lo) * (H - T - B);
  return (
    <Hideable id="pulse.map" title="Industry map">
      <section className="sx-card pc-card" aria-labelledby="pc-map">
        <h2 id="pc-map">Industry map<ChartHelp id="pulse-map" /></h2>
        <p className="sx-sub">Each dot is an industry: across, how many of every 100 of its stocks are rising; down, how far it is below its 1-year high. The colour is its state today.</p>
        <Insights items={m.insights} />
        <ChartZoom label="Industry map">
          <svg className="pc-svg" viewBox={`0 0 ${W} ${H}`} role="img" data-testid="map-chart" aria-label={`${m.rows.length} industries by stocks rising and distance below their 1-year high.`}>
            <rect className="pc-band-up" x={x(50)} y={T} width={x(100) - x(50)} height={y(lo / 2) - T} />
            {[0, 25, 50, 75, 100].map((v) => <g key={v}><line className="pc-grid" x1={x(v)} x2={x(v)} y1={T} y2={H - B} /><text className="pc-ax" x={x(v)} y={H - B + 16} textAnchor="middle">{v}</text></g>)}
            {[0, lo / 2, lo].map((v) => <g key={v}><line className="pc-grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text className="pc-ax" x={L - 6} y={y(v) + 4} textAnchor="end">{v === 0 ? "at high" : `${v}%`}</text></g>)}
            <text className="pc-ax" x={W - R} y={H - 4} textAnchor="end">stocks rising of 100 →</text>
            {m.rows.map((r) => <circle key={r.slug} className={"pc-dot pc-" + r.state} cx={x(r.rising)} cy={y(Math.max(lo, r.below_high))} r={6}><title>{`${r.name}: ${r.rising.toFixed(0)} in 100 rising, ${pct(r.below_high)} below its 1-year high, ${r.state_word}`}</title></circle>)}
          </svg>
          <Key words={m.words} />
        </ChartZoom>
        <details className="more pc-more"><summary>Every industry on the map ({m.rows.length})</summary>
          <HScroll label="every industry on the map"><table className="pc-t"><thead><tr><th scope="col">Industry</th><th scope="col">State</th><th scope="col" className="r">Stocks rising of 100</th><th scope="col" className="r">Below its 1-year high</th><th scope="col">Corner</th></tr></thead>
            <tbody>{m.rows.map((r) => <tr key={r.slug}><td><Link to={`/sectors/${r.slug}`}>{r.name}</Link></td><td>{r.state_word}</td><td className="r">{r.rising.toFixed(0)}</td><td className="r">{pct(r.below_high)}</td><td>{r.corner ?? "–"}</td></tr>)}</tbody></table></HScroll>
        </details>
      </section>
    </Hideable>
  );
}

export function IndustryYearChart({ y, older }: { y: IndustryYear; older?: ReactNode }) {
  const n = y.dates.length, W = 720, H = 220, L = 34, B = 40, T = 8, R = 8, SH = 10;
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R), yy = (v: number) => T + (1 - v / 100) * (H - T - B - SH - 6);
  const path = y.rising.map((v, i) => (v == null ? "" : `${i && y.rising[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${yy(v).toFixed(1)}`)).join("");
  const stripY = H - B - SH, cw = (W - L - R) / n;
  return (
    <Hideable id="pulse.industry.year" title={`A year of ${y.name}`}>
      <section className="sx-card pc-card" aria-labelledby="pc-year">
        <h2 id="pc-year">A year of {y.name}<ChartHelp id="pulse-year" /></h2>
        <ol className="pc-how" aria-label="How to read it"><li>The line is how many of every 100 {y.name} stocks were rising each day.</li><li>In the green band almost all were rising; in the red band almost all were falling.</li><li>The strip under it is the state each day; the numbers mark the moments told below.</li></ol>
        <Insights items={y.insights} />
        <ChartZoom label={`A year of ${y.name}`}>
          <svg className="pc-svg" viewBox={`0 0 ${W} ${H}`} role="img" data-testid="year-chart" aria-label={`${y.name}: stocks rising of 100 each day, ${dayLabel(y.dates[0])} to ${dayLabel(y.dates[n - 1])}.`}>
            <rect className="pc-band-up" x={L} y={yy(100)} width={W - L - R} height={yy(70) - yy(100)} />
            <rect className="pc-band-dn" x={L} y={yy(30)} width={W - L - R} height={yy(0) - yy(30)} />
            <line className="pc-half" x1={L} x2={W - R} y1={yy(50)} y2={yy(50)} />
            {[0, 50, 100].map((v) => <text key={v} className="pc-ax" x={L - 6} y={yy(v) + 4} textAnchor="end">{v}</text>)}
            <path className="pc-line" d={path} fill="none" />
            {y.states.map((s, i) => s && <rect key={i} className={"pc-f pc-" + s} x={L + i * cw} y={stripY} width={Math.max(0.6, cw + 0.2)} height={SH} />)}
            {y.moments.map((mo) => { const v = y.rising[mo.i]; if (v == null) return null; return <g key={mo.n}><circle className="pc-mo" cx={x(mo.i)} cy={yy(v)} r={8} /><text className="pc-mo-t" x={x(mo.i)} y={yy(v) + 4} textAnchor="middle">{mo.n}</text></g>; })}
            {[0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1].map((i) => <text key={i} className="pc-ax" x={x(i)} y={H - 10} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{dayLabel(y.dates[i])}</text>)}
          </svg>
          <Key words={y.words} />
        </ChartZoom>
        <h3 className="pc-h3">What happened, in order</h3>
        <ol className="pc-moments">{y.moments.map((mo) => <li key={mo.n} value={mo.n}>{mo.text}</li>)}</ol>
        {older && <details className="more pc-more"><summary>Show the short and longer trends as well</summary>{older}</details>}
        <details className="more pc-more"><summary>See the numbers: each bounce, and days in each state</summary>
          <HScroll label="days in each state"><table className="pc-t"><thead><tr>{STATE_KEYS.map((k) => <th key={k} scope="col" className="r">{y.words[k]}</th>)}</tr></thead>
            <tbody><tr>{STATE_KEYS.map((k) => <td key={k} className="r">{y.days_in_state[k] ?? 0}</td>)}</tr></tbody></table></HScroll>
          {y.bounces.length ? <HScroll label="each bounce"><table className="pc-t"><thead><tr><th scope="col">Bounce from</th><th scope="col">To</th><th scope="col" className="r">Trading days</th></tr></thead>
            <tbody>{y.bounces.map((b) => <tr key={b.from}><td>{dayLabel(b.from)}</td><td>{dayLabel(b.to)}</td><td className="r">{b.days}</td></tr>)}</tbody></table></HScroll>
            : <p className="sx-sub">There was no bounce in the year.</p>}
        </details>
      </section>
    </Hideable>
  );
}

/** The map for Sector Pulse; nothing while loading or when there is too little data. */
export function IndustryMapCard() { const q = useIndustryMap(); return q.data ? <IndustryMapChart m={q.data} /> : null; }
/** A year of the industry; falls back to the older chart alone when the year cannot be drawn. */
export function IndustryYearCard({ slug, older }: { slug: string; older: ReactNode }) {
  const q = useIndustryYear(slug);
  return q.data ? <IndustryYearChart y={q.data} older={older} /> : <>{older}</>;
}
