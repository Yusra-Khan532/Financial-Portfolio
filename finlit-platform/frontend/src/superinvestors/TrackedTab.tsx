// Task #289: the Tracked investors tab of /superinvestors (the developer file's screenshots 01 to 04): four tiles, the latest moves, stocks they agree on
// and one card per tracked investor. Data: GET /api/superinvestors/tracked (Gold). Describes, never advises.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { Agree, Move, Size, TrackedCard, TrackedTab as Tab } from "./types";
import { Co, MoveTag, PeersTag, PrismTag, Ret, StakeThenNow, TechCell, Who, crore, pct, signed } from "./parts";

const STEP = 15;
const KINDS: [Move | "all", string][] = [["all", "All"], ["new", "New stakes"], ["added", "Stake up"], ["reduced", "Stake cut"], ["exited", "No longer named"]];
const SIZES: Size[] = ["Large", "Mid", "Small", "Micro"];

export function Tiles({ t }: { t: Tab["tiles"] }) {
  return (
    <div className="si-stats sx-stats">
      <div className="si-stat"><span>Tracked investors</span><b>{t.tracked}</b><small>each under every name they file with</small></div>
      <div className="si-stat"><span>Companies named</span><b>{t.companies.toLocaleString("en-IN")}</b><small>with 1% or more, latest filings</small></div>
      <div className="si-stat"><span>Moves since a year ago</span><b>{t.moves.toLocaleString("en-IN")}</b><small>new, up, cut, no longer named</small></div>
      <div className="si-stat"><span>Held by 2 or more</span><b>{t.heldBy2}</b><small>companies</small></div>
    </div>
  );
}

export function LatestMoves({ d, names }: { d: Tab; names: Record<string, string> }) {
  const [kind, setKind] = useState<Move | "all">("all");
  const [size, setSize] = useState<Size | "all">("all");
  const [inv, setInv] = useState("all");
  const [n, setN] = useState(STEP);
  const rows = useMemo(() => d.moves.filter((m) => (kind === "all" || m.move === kind) && (size === "all" || m.size === size) && (inv === "all" || m.investor === inv)), [d.moves, kind, size, inv]);
  const count = (k: Move | "all") => d.moves.filter((m) => (k === "all" || m.move === k) && (size === "all" || m.size === size) && (inv === "all" || m.investor === inv)).length;
  const reset = () => setN(STEP);
  return (
    <section className="card si-sec sx-sec" aria-labelledby="sx-h-moves">
      <h2 id="sx-h-moves">Latest moves</h2>
      <p className="si-lead">What the tracked investors changed in the latest shareholding filings, largest first. The value is the change in the stake at today's price.</p>
      <div className="sx-bar">
        <span className="sx-chips" role="group" aria-label="Compare with">
          <button type="button" aria-pressed={false} disabled title="Shown once each quarter's filings are stored">Since last quarter</button>
          <button type="button" aria-pressed>Since a year ago</button>
        </span>
        <span className="sx-sp" />
        <label className="sx-lab">Size <select className="sx-sel" value={size} onChange={(e) => { setSize(e.target.value as Size | "all"); reset(); }}>
          <option value="all">All sizes</option>{SIZES.map((z) => <option key={z} value={z}>{z}</option>)}</select></label>
        <label className="sx-lab">Investor <select className="sx-sel" value={inv} onChange={(e) => { setInv(e.target.value); reset(); }}>
          <option value="all">All tracked</option>{d.investors.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}</select></label>
      </div>
      <div className="sx-bar"><span className="sx-chips" role="group" aria-label="Kind of move">
        {KINDS.map(([k, w]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); reset(); }}>{w} <small>{count(k)}</small></button>)}
      </span></div>
      <div className="si-scroll" tabIndex={0} role="region" aria-label="Latest moves, scrolls sideways">
        <table className="si-t sx-t">
          <thead><tr><th scope="col">Investor</th><th scope="col">Move</th><th scope="col">Company</th><th scope="col" className="n">Stake then → now</th><th scope="col" className="n">Value of the change</th><th scope="col">FinLit Prism</th><th scope="col">Size</th></tr></thead>
          <tbody>{rows.slice(0, n).map((m) => (
            <tr key={m.investor + m.symbol}>
              <td className="sx-inv"><Link to={`/superinvestors/${m.investor}`}>{names[m.investor] ?? m.investorName}</Link></td>
              <td><MoveTag m={m.move} /></td>
              <th scope="row"><Co symbol={m.symbol} name={m.name} asOf={m.asOf} /></th>
              <td className="n"><StakeThenNow then={m.stakeThen} now={m.stakeNow} move={m.move} change={m.changePts} /></td>
              <td className="n">{m.changeAbout && m.changeValueCr != null ? "about " : ""}{crore(m.changeValueCr == null ? null : Math.abs(m.changeValueCr))}</td>
              <td><PrismTag p={m.prism} /></td>
              <td><span className="sx-sz">{m.size ?? "—"}</span></td>
            </tr>))}</tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="si-empty">No move of this kind.</p>}
      <p className="sx-note">Showing {Math.min(n, rows.length)} of {rows.length}.{n < rows.length && <> <button type="button" className="sx-link" onClick={() => setN(n + STEP)}>Show {Math.min(STEP, rows.length - n)} more</button></>} “No longer named” means the stake is now under 1% or gone; the filing does not say which.</p>
    </section>
  );
}

const VIEWS = [["held", "Held by most"], ["added", "Added by most this year"], ["cut", "Cut by most this year"]] as const;

export function TheyAgree({ d, names }: { d: Tab; names: Record<string, string> }) {
  const [view, setView] = useState<"held" | "added" | "cut">("held");
  const [n, setN] = useState(STEP);
  const rows: Agree[] = d.agree[view] ?? [];
  const head = view === "held" ? "Held by" : view === "added" ? "New or up for" : "Cut or out for";
  return (
    <section className="card si-sec sx-sec" aria-labelledby="sx-h-agree">
      <h2 id="sx-h-agree">Stocks they agree on</h2>
      <p className="si-lead">Companies where more than one tracked investor is named, with FinLit's own view of each beside it.</p>
      <div className="sx-bar"><span className="sx-chips" role="group" aria-label="Which view">
        {VIEWS.map(([k, w]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => { setView(k); setN(STEP); }}>{w}</button>)}</span></div>
      {rows.length === 0 ? <p className="si-empty">No company has two or more tracked investors in this view.</p> : <>
        <div className="si-scroll" tabIndex={0} role="region" aria-label="Stocks they agree on, scrolls sideways">
          <table className="si-t sx-t">
            <thead><tr><th scope="col">Company</th><th scope="col">{head}</th><th scope="col" className="n">Combined stake</th><th scope="col">This year</th><th scope="col">FinLit Prism</th><th scope="col">Technical</th><th scope="col">Peers</th><th scope="col" className="n">1-year move</th></tr></thead>
            <tbody>{rows.slice(0, n).map((a) => (
              <tr key={a.symbol}>
                <th scope="row"><Co symbol={a.symbol} name={a.name} size={a.size} /></th>
                <td><Who keys={view === "held" ? a.heldBy : view === "added" ? a.addedBy : a.cutBy} names={names} /></td>
                <td className="n">{a.stake ? pct(a.stake) : "—"}</td>
                <td>{a.addedBy.length || a.cutBy.length ? <>{a.addedBy.length > 0 && <span className="sx-tu">{a.addedBy.length} new or up</span>}{a.addedBy.length > 0 && a.cutBy.length > 0 && " · "}{a.cutBy.length > 0 && <span className="sx-td">{a.cutBy.length} cut or out</span>}</> : <span className="sx-ts">no change</span>}</td>
                <td><PrismTag p={a.prism} /></td>
                <td><TechCell t={a.technical} /></td>
                <td><PeersTag p={a.peers} /></td>
                <td className="n"><Ret v={a.return1y} /></td>
              </tr>))}</tbody>
          </table>
        </div>
        <p className="sx-note">{rows.length} {rows.length === 1 ? "company" : "companies"}.{n < rows.length && <> <button type="button" className="sx-link" onClick={() => setN(n + STEP)}>Show {Math.min(STEP, rows.length - n)} more</button></>} Combined stake adds up the tracked investors' named stakes in the company.</p>
      </>}
    </section>
  );
}

const SORTS = [["value", "Value today"], ["moves", "Most moves this year"], ["named", "Named stakes, 1 year"], ["name", "Name"]] as const;

export function Cards({ d }: { d: Tab }) {
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>("value");
  const cards = useMemo(() => [...d.investors].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "moves" ? b.movesTotal - a.movesTotal
    : sort === "named" ? (b.namedStakes1y.pct ?? -1e9) - (a.namedStakes1y.pct ?? -1e9) : (b.valueCr ?? 0) - (a.valueCr ?? 0)), [d.investors, sort]);
  return (
    <section className="card si-sec sx-sec" aria-labelledby="sx-h-cards">
      <h2 id="sx-h-cards">Tracked investors</h2>
      <p className="si-lead">Each investor with every name they file under: their own, family members' and their investment companies'.</p>
      <div className="sx-bar"><label className="sx-lab">Sort by <select className="sx-sel" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
        {SORTS.map(([k, w]) => <option key={k} value={k}>{w}</option>)}</select></label></div>
      <ul className="sx-grid">{cards.map((c) => <Card key={c.key} c={c} />)}</ul>
      <p className="sx-note">“Named stakes, 1 year” is how the stocks named today moved in price over 12 months, weighted by today's value; the same-size market is the median move of all listed companies of the same sizes. It is not the investor's own return.</p>
    </section>
  );
}

function Card({ c }: { c: TrackedCard }) {
  const m = c.moves;
  return (
    <li className="sx-card">
      <div className="sx-card-h"><Link to={`/superinvestors/${c.key}`}>{c.name}</Link></div>
      <span className="sx-sub">{c.groupedNames === 1 ? "One filed name" : `${c.groupedNames} filed names grouped`} · {c.companies} {c.companies === 1 ? "company" : "companies"}</span>
      <dl className="sx-kv">
        <div><dt>Value today</dt><dd>{crore(c.valueCr)}</dd></div>
        <div><dt>Named stakes, 1 year</dt><dd>{c.namedStakes1y.pct == null ? <span title={c.namedStakes1y.why ?? undefined}>—</span> : signed(c.namedStakes1y.pct)}
          <small>{c.namedStakes1y.pct == null ? `${c.namedStakes1y.coverPct}% of the value has a 1-year price` : `same-size market ${signed(c.sameSizeMarketPct)}`}</small></dd></div>
      </dl>
      <span className="sx-mini">{c.movesTotal === 0 ? <span className="sx-mv unchanged">no change</span> : (["new", "added", "reduced", "exited"] as const).filter((k) => m[k]).map((k) => (
        <span key={k} className={"sx-mv " + k}>{m[k]} {k === "new" ? "new" : k === "added" ? "up" : k === "reduced" ? "cut" : "out"}</span>))}</span>
      <span className="si-top">{c.top.map((h) => <span key={h.symbol} className="si-chip" title={h.name}>{h.symbol}{h.weightPct != null && <small> {h.weightPct.toFixed(0)}%</small>}</span>)}</span>
    </li>
  );
}
