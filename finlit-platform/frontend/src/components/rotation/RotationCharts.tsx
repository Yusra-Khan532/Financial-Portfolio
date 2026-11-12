// The two new Sector Rotation charts of the 9 Nov 2026 pages update: "Who is ahead, and which way they are moving" and "Six months of ranks". Each has an i button after its title, a row of
// insight cards (worked out on the server, so the page only shows them), a closed dropdown with the numbers behind it, and Hide / Show. Descriptive only.
import { Link } from "react-router";
import { Hideable } from "../Hideable";
import { ChartHelp } from "../ChartHelp";
import { HScroll } from "../HScroll";
import { ChartZoom } from "../ChartZoom";
import { MINUS, nf } from "../../lib/format";
import { changedDirection, lastMonth, rankSpan, sixMonth, sparkPath, type RotationInsight, type RotationMap, type RotationRow } from "../../lib/rotation";
import "../../styles/rotation-charts.css";

const KIND: Record<RotationInsight["kind"], string> = { good: "Good sign", insight: "Insight", watch: "Watch out", warning: "Warning" };
const pts = (v: number | null) => (v == null ? "–" : (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(Math.abs(v), 1));
const place = (n: number | null) => (n == null ? "–" : String(n));

function Insights({ items }: { items: RotationInsight[] | undefined }) {
  if (!items?.length) return null;
  return <ul className="rc-ins" aria-label="What this chart says">{items.map((i) => <li key={i.title} className={"rc-in rc-in-" + i.kind}><b><span>{KIND[i.kind]}</span> {i.title}</b><p>{i.text}</p></li>)}</ul>;
}


export function AheadChart({ m }: { m: RotationMap }) {
  const rows = m.rows.filter((r) => sixMonth(r) != null && lastMonth(r) != null).sort((a, b) => (sixMonth(b) as number) - (sixMonth(a) as number));
  if (!rows.length) return null;
  const max = Math.max(5, ...rows.flatMap((r) => [Math.abs(sixMonth(r) as number), Math.abs(lastMonth(r) as number)]));
  const at = (v: number) => `${50 + (v / max) * 46}%`;
  const turned = rows.filter(changedDirection);
  return (
    <Hideable id="rotation.ahead" title="Who is ahead, and which way they are moving">
      <section className="rt-card rc-card" aria-labelledby="rc-ahead">
        <h2 id="rc-ahead">Who is ahead, and which way they are moving<ChartHelp id="rotation-ahead" /></h2>
        <p className="rt-note">Return against the average industry. Filled dot: six months. Ring: the last month. ↺ marks a change of direction.</p>
        <Insights items={m.insights?.ahead} />
        <div className="rc-key" aria-hidden="true"><span><i className="rc-dot" /> 6 months</span><span><i className="rc-dot rc-ring" /> Last month</span></div>
        <ChartZoom label="Who is ahead, and which way they are moving">
        <div className="rc-rows" role="list" data-testid="ahead-chart">
          <div className="rc-head" aria-hidden="true"><span className="rc-n">Industry</span><span className="rc-track" /><span className="rc-v">6 months</span><span className="rc-v">Last month</span></div>
          {rows.map((r) => { const s = sixMonth(r) as number, l = lastMonth(r) as number; return (
            <div key={r.slug} className="rc-row" role="listitem">
              <Link className="rc-n" to={`/sectors/${r.slug}`} title={r.name}>{r.name}</Link>
              <span className="rc-track" aria-hidden="true"><i className="rc-zero" /><i className={"rc-dot " + (s >= 0 ? "up" : "down")} style={{ left: at(s) }} /><i className={"rc-dot rc-ring " + (l >= 0 ? "up" : "down")} style={{ left: at(l) }} /></span>
              <span className="rc-v">{pts(s)}</span><span className="rc-v">{pts(l)}{changedDirection(r) && <abbr title="Changed direction last month" className="rc-turn"> ↺</abbr>}</span>
            </div>); })}
        </div>
        </ChartZoom>
        <details className="more rc-more"><summary>Industries that changed direction ({turned.length})</summary>
          {turned.length ? <HScroll label="industries that changed direction"><table className="rc-t"><thead><tr><th scope="col">Industry</th><th scope="col" className="r">6 months</th><th scope="col" className="r">Last month</th></tr></thead>
            <tbody>{turned.map((r) => <tr key={r.slug}><td><Link to={`/sectors/${r.slug}`}>{r.name}</Link></td><td className="r">{pts(sixMonth(r))}</td><td className="r">{pts(lastMonth(r))}</td></tr>)}</tbody></table></HScroll>
            : <p className="rt-note">No industry changed direction last month.</p>}
        </details>
      </section>
    </Hideable>
  );
}

const W = 140, H = 34;
export function RankSixMonths({ m }: { m: RotationMap }) {
  const rows = [...m.rows].filter((r) => r.rank_history.some((p) => p.rank != null)).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  if (!rows.length) return null;
  const worst = Math.max(...rows.flatMap((r) => r.rank_history.map((p) => p.rank ?? 0)), m.groups_ranked ?? 0, 2);
  const span = (r: RotationRow) => rankSpan(r);
  const moved = [...rows].map((r) => ({ r, d: (span(r).first ?? 0) - (span(r).now ?? 0), s: span(r) })).filter((x) => x.s.first != null && x.s.now != null).sort((a, b) => b.d - a.d);
  const lines = [...moved.slice(0, 5), ...moved.slice(-5)].filter((x, i, a) => a.findIndex((y) => y.r.slug === x.r.slug) === i);
  const weeks = rows[0].rank_history.length;
  return (
    <Hideable id="rotation.ranks26" title="Six months of ranks">
      <section className="rt-card rc-card" aria-labelledby="rc-ranks">
        <h2 id="rc-ranks">Six months of ranks<ChartHelp id="rotation-ranks" /></h2>
        <p className="rt-note">Each industry's rank at the last {weeks} weekly closes, oldest on the left. Today's order, rank 1 first.</p>
        <Insights items={m.insights?.ranks} />
        <ChartZoom label="Six months of ranks">
        <div className="rc-rows" role="list" data-testid="ranks-chart">
          {rows.map((r) => { const sp = span(r); return (
            <div key={r.slug} className="rc-row rc-rrow" role="listitem">
              <Link className="rc-n" to={`/sectors/${r.slug}`} title={r.name}><b>{r.rank ?? "–"}.</b> {r.name}</Link>
              <svg className="rc-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${r.name}: rank ${place(sp.first)} at the start, rank ${place(sp.now)} now`}><path d={sparkPath(r.rank_history, W, H, worst)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>
              <span className="rc-v">{place(sp.first)} → {place(sp.now)}</span>
            </div>); })}
        </div>
        </ChartZoom>
        <details className="more rc-more"><summary>Biggest climbers and fallers over {weeks} weeks</summary>
          <HScroll label="biggest climbers and fallers"><table className="rc-t"><thead><tr><th scope="col">Industry</th><th scope="col" className="r">Rank {weeks} weeks ago</th><th scope="col" className="r">Rank 4 weeks ago</th><th scope="col" className="r">Rank now</th></tr></thead>
            <tbody>{lines.map(({ r, s }) => <tr key={r.slug}><td><Link to={`/sectors/${r.slug}`}>{r.name}</Link></td><td className="r">{place(s.first)}</td><td className="r">{place(s.ago4)}</td><td className="r">{place(s.now)}</td></tr>)}</tbody></table></HScroll>
        </details>
      </section>
    </Hideable>
  );
}
