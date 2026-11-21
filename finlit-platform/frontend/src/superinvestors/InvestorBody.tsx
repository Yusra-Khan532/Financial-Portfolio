// Task #289: a tracked investor's page (the developer file's screenshots 07, 08 and 11): the names grouped, four tiles, stock picks and weightings with
// FinLit's own view, how the named stakes have done, the moves, and sector and size. Data: GET /api/superinvestors/<tracked-key> (Gold).
import { useMemo, useState } from "react";
import type { TrackedHolding, TrackedPage } from "./types";
import { Co, MoveTag, PeersTag, PrismTag, Ret, StakeThenNow, TechCell, Who, crore, pct, ptsText, signed } from "./parts";

const FILTERS = [["all", "All"], ["changed", "Changed this year"], ["prism", "Prism Strong or Healthy"], ["leaders", "Leaders among peers"]] as const;
type F = (typeof FILTERS)[number][0];
const keep = (f: F) => (h: TrackedHolding) => f === "all" ? true : f === "changed" ? h.move !== "unchanged" && !h.sourceError
  : f === "prism" ? h.prism.label === "Strong" || h.prism.label === "Healthy" : h.peers.chip === "Leader";

function stakeLine(h: TrackedHolding): string {
  if (h.sourceError) return "year-ago figure: source error";
  if (h.move === "new") return "new this year";
  if (h.move === "unchanged") return "no change in the year";
  return `${ptsText(h.changePts)} in the year`;
}

export function InvestorBody({ p, names }: { p: TrackedPage; names: Record<string, string> }) {
  const [f, setF] = useState<F>("all");
  const held = useMemo(() => p.holdings.filter((h) => h.move !== "exited" && (h.stakeNow ?? 0) > 0), [p.holdings]);
  const rows = held.filter(keep(f));
  const m = p.moves;
  const perf = held.filter((h) => h.valueCr).slice(0, 15);
  const top = Math.max(1, ...perf.map((h) => Math.abs(h.return1y ?? 0)));
  const secMax = Math.max(1, ...p.sectors.map((s) => s.pct));
  const zMax = Math.max(1, ...p.sizes.map((s) => s.pct));
  return (
    <div className="si-body">
      <section className="card si-sec sx-sec" aria-labelledby="sx-h-names">
        <h2 id="sx-h-names">Names grouped here</h2>
        <p className="si-lead">The filings name the investor in different ways. FinLit's editors group the names that file for {p.name}; each company row says how many of them are named in it.</p>
        <ul className="sx-names">{p.names.map((n) => <li key={n.key}>{n.name} <small>· {n.kind === "firm" ? "company" : "person"} · {n.companies} {n.companies === 1 ? "company" : "companies"}</small></li>)}</ul>
      </section>

      <div className="si-stats sx-stats">
        <div className="si-stat"><span>Companies</span><b>{p.companies}</b><small>named with 1% or more</small></div>
        <div className="si-stat"><span>Value today</span><b>{crore(p.valueCr)}</b><small>stake × market capitalisation</small></div>
        <div className="si-stat"><span>Moves since a year ago</span><b>{p.movesTotal}</b><small>{m.new} new · {m.added} up · {m.reduced} cut · {m.exited} no longer named</small></div>
        <div className="si-stat"><span>Named stakes, 1 year</span><b>{p.namedStakes1y.pct == null ? "—" : signed(p.namedStakes1y.pct)}</b>
          <small>{p.namedStakes1y.pct == null ? p.namedStakes1y.why : `same-size market ${signed(p.sameSizeMarketPct)}`}</small></div>
      </div>

      <section className="card si-sec sx-sec" aria-labelledby="sx-h-hold">
        <h2 id="sx-h-hold">Stock picks and weightings</h2>
        <p className="si-lead">Each company the investor is named in today, largest value first, with FinLit's own view of the stock. The weight is the stake's share of the value of all the stakes shown.</p>
        <div className="sx-bar"><span className="sx-chips" role="group" aria-label="Show">
          {FILTERS.map(([k, w]) => <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{w} <small>{held.filter(keep(k)).length}</small></button>)}</span></div>
        <div className="si-scroll" tabIndex={0} role="region" aria-label="Holdings table, scrolls sideways">
          <table className="si-t sx-t">
            <thead><tr><th scope="col">Company</th><th scope="col" className="n">Stake</th><th scope="col" className="n">Value today</th><th scope="col">FinLit Prism</th><th scope="col">Technical</th><th scope="col">Peers</th><th scope="col" className="n">1-year move</th><th scope="col">Also held by</th></tr></thead>
            <tbody>{rows.map((h) => (
              <tr key={h.symbol}>
                <th scope="row"><Co symbol={h.symbol} name={h.name} size={h.size} asOf={h.asOf} names={h.names} /></th>
                <td className="n">{pct(h.stakeNow)}<small className={h.sourceError ? "si-why" : undefined}>{stakeLine(h)}</small></td>
                <td className="n">{h.valueCr == null ? <span className="si-why" title="No market capitalisation in today's quote list">no price</span> : crore(h.valueCr)}{h.weightPct != null && <small>{pct(h.weightPct, 1)} of the value</small>}</td>
                <td><PrismTag p={h.prism} /></td>
                <td><TechCell t={h.technical} /></td>
                <td><PeersTag p={h.peers} /></td>
                <td className="n"><Ret v={h.return1y} /></td>
                <td>{h.alsoHeldBy.length ? <Who keys={h.alsoHeldBy} names={names} /> : <span className="sx-dash">—</span>}</td>
              </tr>))}</tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="si-empty">No company in this view.</p>}
      </section>

      <section className="card si-sec sx-sec" aria-labelledby="sx-h-perf">
        <h2 id="sx-h-perf">How the named stakes have done</h2>
        <p className="si-lead">{p.namedStakesNote}</p>
        <div className="sx-tot">
          <div><span>Named stakes, 1-year price move</span><b>{p.namedStakes1y.pct == null ? "—" : signed(p.namedStakes1y.pct)}</b></div>
          <div><span>Same-size market</span><b>{signed(p.sameSizeMarketPct)}</b></div>
          <div><span>Share of the value with a 1-year price</span><b>{p.namedStakes1y.coverPct}%</b></div>
        </div>
        <ul className="sx-perf">{perf.map((h) => {
          const r = h.return1y, w = r == null ? 0 : Math.min(50, (Math.abs(r) / top) * 50);
          return (<li key={h.symbol}><span className="sx-pn">{h.name.replace(/\s+(Ltd|Limited)\.?$/i, "")} <small>{pct(h.weightPct, 1)}</small></span>
            <span className="sx-axis" aria-hidden="true">{r != null && <i className={r >= 0 ? "u" : "d"} style={{ width: `${w}%` }} />}</span>
            <b><Ret v={r} /></b></li>);
        })}</ul>
      </section>

      <section className="card si-sec sx-sec" aria-labelledby="sx-h-moves">
        <h2 id="sx-h-moves">Moves</h2>
        <p className="si-lead">Every change since a year ago, largest first. A holder below 1% is not named, so “no longer named” means the investor sold or now holds under 1%; the filing does not say which.</p>
        {p.moveList.length === 0 ? <p className="si-empty">No stake changed between the two filings.</p> :
          <div className="si-scroll" tabIndex={0} role="region" aria-label="Moves, scrolls sideways">
            <table className="si-t sx-t">
              <thead><tr><th scope="col">Move</th><th scope="col">Company</th><th scope="col" className="n">Stake then → now</th><th scope="col" className="n">Value of the change</th><th scope="col">FinLit Prism</th></tr></thead>
              <tbody>{p.moveList.map((h) => (
                <tr key={h.symbol}>
                  <td><MoveTag m={h.move} /></td>
                  <th scope="row"><Co symbol={h.symbol} name={h.name} size={h.size} asOf={h.asOf} /></th>
                  <td className="n"><StakeThenNow then={h.stakeThen} now={h.stakeNow} move={h.move} change={h.changePts} /></td>
                  <td className="n">{h.changeAbout && h.changeValueCr != null ? "about " : ""}{crore(h.changeValueCr == null ? null : Math.abs(h.changeValueCr))}</td>
                  <td><PrismTag p={h.prism} /></td>
                </tr>))}</tbody>
            </table>
          </div>}
      </section>

      <section className="card si-sec sx-sec" aria-labelledby="sx-h-mix">
        <h2 id="sx-h-mix">Sector and size</h2>
        <div className="sx-two">
          <div><h3>By sector</h3>
            {p.sectors.length ? <ul className="si-secs">{p.sectors.map((s) => (
              <li key={s.sector}><span className="si-sn">{s.sector}<small>{s.companies} {s.companies === 1 ? "company" : "companies"}</small></span>
                <span className="si-sb" aria-hidden="true"><i style={{ width: `${(s.pct / secMax) * 100}%` }} /></span><b>{pct(s.pct, 1)}</b></li>))}</ul>
              : <p className="si-empty">No stake has a market value today.</p>}</div>
          <div><h3>By company size</h3>
            {p.sizes.length ? <ul className="si-secs">{p.sizes.map((z) => (
              <li key={z.size}><span className="si-sn">{z.size}<small>{z.text} · {z.companies} {z.companies === 1 ? "company" : "companies"}</small></span>
                <span className="si-sb" aria-hidden="true"><i style={{ width: `${(z.pct / zMax) * 100}%` }} /></span><b>{pct(z.pct, 1)}</b></li>))}</ul>
              : <p className="si-empty">No stake has a market value today.</p>}</div>
        </div>
      </section>
    </div>
  );
}
