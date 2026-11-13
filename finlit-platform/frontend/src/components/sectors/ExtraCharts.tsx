// A chart of the 9 Nov 2026 pages update (the Industry map that was here is now drawn by components/sectors/pack, the final pages pack). "A year of <industry>" (industry page): one line, how many of every 100 of its stocks were rising each day, with bands, the state strip and numbered moments.
// Both have an i button, server-written insights, a closed dropdown with the numbers, the enlarge arrow and Hide / Show. Descriptive only, never advice.
import { type ReactNode } from "react";
import { Hideable } from "../Hideable";
import { ChartHelp } from "../ChartHelp";
import { ChartZoom } from "../ChartZoom";
import { HScroll } from "../HScroll";
import { Insights } from "./PulseCharts";
import { STATE_KEYS } from "../../lib/sectorHistory";
import { useIndustryYear, type IndustryYear } from "../../lib/sectorExtra";
import "../../styles/pulse-charts.css";

const dayLabel = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function Key({ words }: { words: Record<string, string> }) {
  return <ul className="pc-key" aria-label="Chart key">{STATE_KEYS.map((k) => <li key={k}><i className={"pc-sw pc-" + k} />{words[k]}</li>)}</ul>;
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
/** A year of the industry; falls back to the older chart alone when the year cannot be drawn. */
export function IndustryYearCard({ slug, older }: { slug: string; older: ReactNode }) {
  const q = useIndustryYear(slug);
  return q.data ? <IndustryYearChart y={q.data} older={older} /> : <>{older}</>;
}
