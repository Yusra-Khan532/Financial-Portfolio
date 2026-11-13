// An industry page (/sectors/:slug) as the "FinLit final pages" pack draws it (docs/design/finlit-final-pages/07): the header, What is happening, Where it is in the cycle,
// A year of <industry>, Against other industries, the counted stocks and Not counted. Figures are the server's; the words come from lib/industryPack. Styles:
// styles/sectors-pack.css (sp-) and styles/industry-pack.css (ip-). Describes how an industry's stocks have moved; never advice.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useSearchIndex } from "../../../lib/api";
import { capBucket } from "../../../lib/capBuckets";
import { prefs, usePrefs } from "../../../lib/prefs";
import { useAuth } from "../../../lib/auth";
import { CoLogo } from "../../CoLogo";
import { Hideable } from "../../Hideable";
import { LockedBlock } from "../Parts";
import { BoxChip, Cards, Scroll, Section, StateChip, Swatch, Tip } from "./Common";
import { COLOUR, STATE_HELP, WORD, keyOf, short } from "../../../lib/pulsePack";
import { BOX_HELP } from "../../../lib/rotationPack";
import { CYCLE_STEPS, cycleNotes, dm, happening, rotationTiles, stockCards, story, tiles, tierWord, topCards, twoPages, yearCards } from "../../../lib/industryPack";
import type { IndustryPage, RankedStock } from "../../../lib/sectors";
import type { IndustryYear } from "../../../lib/sectorExtra";
import type { RotationCard } from "../../../lib/rotation";
import type { StateKey } from "../../../lib/sectorHistory";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ------------------------------------------------------------------------------------------------ header
export function IndustryHead({ p, rot }: { p: IndustryPage; rot: RotationCard | undefined }) {
  const k = keyOf(p), name = short(p.name), notCounted = Math.max(0, (p.stocks_listed ?? p.stocks_counted) - p.stocks_counted);
  const { user } = useAuth();
  const watch = usePrefs().sectorWatch;
  const on = watch.includes(p.slug);
  const toggle = () => prefs.set({ sectorWatch: on ? watch.filter((s) => s !== p.slug) : [...watch, p.slug] });
  return (
    <header className="sp-head ip-head">
      <nav className="ip-crumbs" aria-label="Breadcrumb"><Link to="/markets">Markets</Link> › <Link to="/sectors">Sector Pulse</Link> › <b>{name}</b></nav>
      <div className="ip-top">
        <div>
          <h1>{name}</h1>
          <p className="ip-chips">
            <StateChip k={k} help />{p.since_label && <span className="ip-since">since {dm(p.since!)}</span>}
            {rot && rot.corner && rot.corner !== "middle" && <><BoxChip corner={rot.corner} /><Tip text={BOX_HELP[rot.corner]} label={`About “${rot.corner_name}”`} />{rot.rank != null && <span className="ip-since">rank {rot.rank} of {rot.ranked}</span>}</>}
          </p>
          <p className="sp-meta"><span>NSE {p.kind === "sector" ? "sector group" : "industry"}{p.sector ? ` in ${p.sector}` : ""} · <b>{p.stocks_counted} stocks counted</b>, {notCounted} not counted · data as of {p.date_label ?? p.date}</span></p>
        </div>
        <div className="ip-acts">
          <Link to="/sectors" className="sp-dl">Sector Pulse</Link>
          {user ? <button type="button" className="sp-dl" aria-pressed={on} onClick={toggle} title={on ? "You get this industry's weekly Sector Rotation alerts" : "Get this industry's weekly Sector Rotation alerts: when it changes box, or climbs or falls 5 places"}>{on ? "Watching ✓" : "Add to watch"}</button>
            : <Link to={`/login?next=/sectors/${p.slug}`} className="sp-dl">Add to watch</Link>}
        </div>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------------------------------------ What is happening
export function Happening({ p, y, rot }: { p: IndustryPage; y: IndustryYear | undefined; rot: RotationCard | undefined }) {
  const h = happening(p), name = short(p.name);
  return (
    <section className="sp-sec" aria-labelledby="ip-now">
      <h2 id="ip-now">What is happening in {name}</h2>
      <p className="sp-sub">In plain words, from {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(p.date + "T00:00:00Z").getUTCDay()]} evening's data.</p>
      <p className="sp-lead"><b>{h.lead}</b>{h.rest}</p>
      <p className="sp-note">{h.watch}</p>
      <div className="ip-tiles">{tiles(p).map((t) => <div key={t.k} className="ip-tile"><p className="sp-cap">{t.k}<Tip text={t.help} label={`About “${t.k}”`} /></p><b>{t.v}</b><small>{t.sub}</small></div>)}</div>
      <Cards items={topCards(p, y, rot)} />
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ Where it is in the cycle
export function CycleInd({ p }: { p: IndustryPage }) {
  const notes = cycleNotes(p), here = keyOf(p) === "crash" ? "bouncing" : keyOf(p);
  return (
    <Section id="ip-cycle" hide title={`Where ${short(p.name)} is in the cycle`} sub="Most industries go round these stages; many bounces fade before the next one.">
      <ol className="ip-cycle">{CYCLE_STEPS.map((k) => <li key={k} className={k === here ? "on" : ""}><StateChip k={k} help /><span>{WORD[k]}{notes[k] ? <> · <b>{notes[k]}</b></> : ""}</span></li>)}</ol>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ A year of <industry>
export function YearInd({ p, y }: { p: IndustryPage; y: IndustryYear }) {
  const [more, setMore] = useState(false);
  const name = short(p.name), m = useMemo(() => story(y), [y]), cards = yearCards(p, y);
  const W = 820, H = 300, L = 30, Rr = 70, T = 12, B = 46, n = y.dates.length;
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - Rr), yy = (v: number) => T + (1 - v / 100) * (H - T - B);
  const line = (vals: (number | null)[]) => vals.map((v, i) => (v == null ? "" : `${i && vals[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${yy(v).toFixed(1)}`)).join("");
  // the short and longer trends, from the industry page's own daily history, matched by date
  const hist = p.history, at = new Map(hist.dates.map((d, i) => [d, i]));
  const s9 = y.dates.map((d) => { const i = at.get(d); return i == null ? null : hist.above_9[i]; }), s50 = y.dates.map((d) => { const i = at.get(d); return i == null ? null : hist.above_50[i]; });
  const months = y.dates.map((d, i) => ({ d, i })).filter((o, i, a) => (i === 0 ? +o.d.slice(8, 10) <= 7 : o.d.slice(5, 7) !== a[i - 1].d.slice(5, 7)));   // a month that starts part-way is not labelled
  const last = y.rising[n - 1];
  const from = y.dates[0], to = y.dates[n - 1];
  return (
    <Hideable id={"pack.ip-year"} title={`A year of ${name}`}>
      <section className="sp-sec" aria-labelledby="ip-year">
        <div className="sp-sec-h"><div><h2 id="ip-year">A year of {name}<Tip text={`Out of every 100 counted ${name} stocks, how many were above their medium trend each trading day of the last year, with the state Sector Pulse gave the industry that day.`} /></h2>
          <p className="sp-sub">Out of every 100 counted {name} stocks, how many were rising each day, {MON[+from.slice(5, 7) - 1]} {from.slice(0, 4)} to {MON[+to.slice(5, 7) - 1]} {to.slice(0, 4)}.</p></div></div>
        <ol className="ip-abc">
          <li><b>The line</b> is how many of every 100 {name} stocks were rising that day (trading above their medium trend).</li>
          <li><b>Above the dashed line</b> more than half were rising; in the green band, almost all. In the red band, almost all were falling.</li>
          <li><b>The coloured strip</b> under the chart is the state Sector Pulse gave the industry on that day.</li>
        </ol>
        <Scroll label={`a year of ${name}`}><svg className="ip-year" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${name}: stocks rising out of 100 each day for a year; ${last == null ? "" : `${Math.round(last)} at the latest close`}`}>
          <rect x={L} y={yy(100)} width={W - L - Rr} height={yy(70) - yy(100)} className="ip-band-up" /><rect x={L} y={yy(30)} width={W - L - Rr} height={yy(0) - yy(30)} className="ip-band-dn" />
          {[0, 50, 100].map((v) => <text key={v} x={L - 6} y={yy(v) + 4} className="ip-tk" textAnchor="end">{v}</text>)}
          <line x1={L} x2={W - Rr} y1={yy(50)} y2={yy(50)} className="ip-half" /><text x={W - Rr + 6} y={yy(50) + 4} className="ip-tk">half</text>
          <text x={W - Rr + 6} y={yy(88)} className="ip-tk ip-up">Most</text><text x={W - Rr + 6} y={yy(88) + 13} className="ip-tk ip-up">rising</text>
          <text x={W - Rr + 6} y={yy(15)} className="ip-tk ip-dn">Most</text><text x={W - Rr + 6} y={yy(15) + 13} className="ip-tk ip-dn">falling</text>
          {more && <><path d={line(s9)} className="ip-l9" fill="none" /><path d={line(s50)} className="ip-l50" fill="none" /></>}
          <path d={line(y.rising)} className="ip-line" fill="none" />
          {last != null && <><circle cx={x(n - 1)} cy={yy(last)} r={3.5} className="ip-dot" /><text x={x(n - 1) + 8} y={yy(last) + 4} className="ip-now">{Math.round(last)} now</text></>}
          {y.states.map((s, i) => <rect key={i} x={x(i) - (W - L - Rr) / n / 2} y={H - B + 4} width={(W - L - Rr) / n + 0.4} height={14} fill={s ? COLOUR[s as StateKey] : "transparent"} />)}
          {months.map((o) => <text key={o.d} x={x(o.i)} y={H - 10} className="ip-tk" textAnchor="middle">{MON[+o.d.slice(5, 7) - 1]}{o.d.slice(5, 7) === "01" ? ` ${o.d.slice(2, 4)}` : ""}</text>)}
          {m.map((o) => <g key={o.n} className="ip-mk"><circle cx={x(o.i)} cy={yy(y.rising[o.i] ?? 0)} r={8} /><text x={x(o.i)} y={yy(y.rising[o.i] ?? 0) + 4} textAnchor="middle">{o.n}</text></g>)}
        </svg></Scroll>
        <ul className="sp-lgd"><li><b>Coloured strip:</b></li>{(["sold_off", "crash", "bouncing", "rising", "losing", "no_signal"] as StateKey[]).map((k) => <li key={k}><Swatch k={k} />{WORD[k]}</li>)}{more && <><li><i className="ip-lg ip-lg9" />short trend</li><li><i className="ip-lg ip-lg50" />longer trend</li></>}</ul>
        <div className="ip-story">
          <div><p className="sp-cap">What happened, in order</p><ol className="ip-moments">{m.map((o) => <li key={o.n}><span className="ip-n">{o.n}</span><p><b>{o.label}.</b> {o.text}</p></li>)}</ol></div>
          <div className="ip-storycards"><Cards items={cards.top} cols={1} /></div>
        </div>
        <button type="button" className="sp-morebtn" aria-pressed={more} onClick={() => setMore(!more)}>{more ? "Hide the short and longer trends ▴" : "Show the short and longer trends as well ▾"}</button>
        <Cards items={cards.bottom} />
        <details className="sp-more"><summary>See the numbers: each bounce, and days in each state ▾</summary>
          <div className="ip-nums">
            <table className="sp-tb"><caption>Each bounce</caption><thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col" className="r">Trading days</th></tr></thead>
              <tbody>{y.bounces.map((b) => <tr key={b.from}><td>{dm(b.from)} {b.from.slice(0, 4)}</td><td>{b.to === to ? "still going" : `${dm(b.to)} ${b.to.slice(0, 4)}`}</td><td className="r">{b.days}</td></tr>)}</tbody></table>
            <table className="sp-tb"><caption>Days in each state</caption><thead><tr><th scope="col">State</th><th scope="col" className="r">Days</th></tr></thead>
              <tbody>{(Object.keys(y.days_in_state) as StateKey[]).sort((a, b) => y.days_in_state[b] - y.days_in_state[a]).map((k) => <tr key={k}><td><Swatch k={k} /> {WORD[k]}</td><td className="r">{y.days_in_state[k]}</td></tr>)}</tbody></table>
          </div>
        </details>
      </section>
    </Hideable>
  );
}

// ------------------------------------------------------------------------------------------------ Against other industries
export function AgainstInd({ p, rot }: { p: IndustryPage; rot: RotationCard }) {
  const h = rot.rank_history ?? [], worst = rot.ranked || 37, W = 420, H = 64;
  const pts = h.map((q, i) => (q.rank == null ? null : [4 + (i / Math.max(1, h.length - 1)) * (W - 8), 4 + ((q.rank - 1) / Math.max(1, worst - 1)) * (H - 8)] as [number, number]));
  const d = pts.map((q, i) => (q ? `${i && pts[i - 1] ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}` : "")).join("");
  const lastP = [...pts].reverse().find(Boolean);
  const worstAt = h.filter((q) => q.rank === rot.rank_worst_26w).pop();
  const corner = rot.corner && rot.corner !== "middle" ? rot.corner : null;
  return (
    <Section id="ip-rot" hide title="Against other industries" help="Against other industries. From Sector Rotation: how the industry has done against the average industry, and its rank among all industries each week." sub="From Sector Rotation, updated each Friday.">
      <p className="ip-chips">{corner ? <><BoxChip corner={corner} /><Tip text={BOX_HELP[corner]} label={`About “${rot.corner_name}”`} /></> : <span className="sp-nil">No box yet</span>}<span className="ip-since">for {rot.weeks_in_corner} {rot.weeks_in_corner === 1 ? "week" : "weeks"}{rot.corner_since_label ? `, since ${rot.corner_since_label.replace(/ \d{4}$/, "")}` : ""}</span></p>
      <div className="ip-rtiles">{rotationTiles(rot, p.stocks_counted).map((t) => <div key={t.k} className="ip-tile"><p className="sp-cap">{t.k}<Tip text={t.help} label={`About “${t.k}”`} /></p><b>{t.v}</b><small>{t.sub}</small></div>)}</div>
      {d && <div className="ip-rank"><p className="sp-cap">Rank over {h.length} weeks</p>
        <svg viewBox={`0 0 ${W} ${H}`} className="ip-rankc" role="img" aria-label={`Rank over ${h.length} weeks: highest ${rot.rank_best_26w}, lowest ${rot.rank_worst_26w}`}><path d={`${d}L${W - 4},${H}L4,${H}Z`} className="ip-rank-a" /><path d={d} className="ip-rank-l" fill="none" />{lastP && <circle cx={lastP[0]} cy={lastP[1]} r={3} className="ip-rank-d" />}</svg>
        <small>Higher is better · highest {rot.rank_best_26w}, lowest {rot.rank_worst_26w}{worstAt ? ` (${dm(worstAt.date)})` : ""}</small></div>}
      <Cards items={[twoPages(p, rot)]} />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ the counted stocks
const signed = (v: number | null | undefined) => (v == null ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`);
export function StocksInd({ p }: { p: IndustryPage }) {
  const [all, setAll] = useState(false);
  const idx = useSearchIndex(true), stocks = (p.stocks ?? []) as RankedStock[], name = short(p.name);
  const cap = (sym: string) => { const rows = (idx.data?.rows ?? []) as unknown[][], mc = (idx.data as { mc?: (number | null)[] } | undefined)?.mc; const i = rows.findIndex((x) => x[0] === sym); return i >= 0 && mc ? capBucket(mc[i] ?? null)?.label.replace(" cap", "") ?? "–" : "–"; };
  const csv = () => {
    const head = ["Rank", "Symbol", "Name", "6 months %", "In its industry", "Standout", "Size", "Vs its peers"], q = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const body = [head, ...stocks.map((s, i) => [s.rank_6m ?? i + 1, s.symbol, s.name, s.return_6m_pct ?? "", s.quarter_name ?? "", tierWord(s) ?? "", cap(s.symbol), s.peer_label ?? ""])].map((l) => l.map(q).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" })); a.download = `${p.slug}-stocks-${p.date}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  if (p.stocks == null) return (
    <section className="sp-sec" aria-labelledby="ip-stocks"><h2 id="ip-stocks">The {p.stocks_counted} counted stocks, strongest 6 months first</h2>
      <LockedBlock plan={p.locked?.stocks ?? "silver"} title="The stocks of each industry are part of the Silver plan">The state, the trends and the year are open to everyone. Silver lists every counted stock, strongest 6 months first, with where it falls inside its industry.</LockedBlock></section>);
  const shown = all ? stocks : stocks.slice(0, 15);
  return (
    <Section id="ip-stocks" title={`The ${stocks.length} counted stocks, strongest 6 months first`} sub="How each stock has done inside its industry." right={<button type="button" className="sp-dl" onClick={csv}>Download CSV</button>}>
      <Cards items={stockCards(stocks, p)} />
      <Scroll label={`the counted ${name} stocks`}><table className="sp-tb ip-st">
        <thead><tr><th scope="col">#</th><th scope="col">Stock</th><th scope="col" className="r">6 months<Tip text="The share price change over the last 6 months." /></th>
          <th scope="col">In its industry<Tip text="Where the stock's 6-month return falls among the industry's counted stocks. Top quarter: the strongest 25%. Bottom quarter: the weakest 25%." /></th>
          <th scope="col">Standout<Tip text="At a new 1-year high while its industry is still well below its own high. Strong: the industry is far below its high. Early: a little less far." /></th>
          <th scope="col">Size<Tip text="FinLit's size scale: Large above ₹50,000 Cr, Mid ₹10,000–50,000 Cr, Small below ₹10,000 Cr." /></th>
          <th scope="col">Vs its peers<Tip text="Leader, In line, Laggard: each share's price over the last 12 months against similar companies and its sector index. It describes the past, not the future. A dash means the stock is not in a FinLit peer group." /></th></tr></thead>
        <tbody>{shown.map((s, i) => { const t = tierWord(s); return (
          <tr key={s.symbol}><td>{s.rank_6m ?? i + 1}</td><td><Link to={`/stocks/${s.symbol}`} className="ip-sym"><CoLogo symbol={s.symbol} name={s.name} size={24} inline /><span><b>{s.symbol}</b><small>{s.name}</small></span></Link></td>
            <td className={"r " + ((s.return_6m_pct ?? 0) >= 0 ? "sp-good" : "sp-red")}>{signed(s.return_6m_pct)}</td>
            <td>{s.quarter_name ? <span className={"sp-q sp-q" + (s.quarter ?? 0)}>{s.quarter_name}</span> : "–"}</td>
            <td>{t ? <span className={"sp-chip " + (t === "Strong" ? "sp-st-bouncing" : "sp-st-sold_off")}>{t}</span> : "–"}</td>
            <td>{cap(s.symbol)}</td>
            <td>{s.peer_label ? <span className={"sp-q sp-peer-" + s.peer_label.toLowerCase().replace(/\s+/g, "")}>{s.peer_label}</span> : p.locked?.peer_label ? <span className="sp-nil" title="Part of the Gold plan">Gold</span> : "–"}</td></tr>); })}</tbody>
      </table></Scroll>
      {stocks.length > 15 && <button type="button" className="sp-morebtn" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show the first 15 ▴" : `Show all ${stocks.length} counted stocks ▾`}</button>}
    </Section>
  );
}
export function NotCountedInd({ p }: { p: IndustryPage }) {
  const n = Math.max(0, (p.stocks_listed ?? p.stocks_counted) - p.stocks_counted), name = short(p.name);
  if (!n) return null;
  return (
    <details className="sp-sec sp-fold">
      <summary><span><b className="sp-ft">Not counted: {n} {name} stocks</b><small>Too small, too thinly traded or too recently listed to count in the reading</small></span><span className="sp-show">Show ▾</span></summary>
      {p.not_counted ? <><p className="sp-note">{p.not_counted.text}</p><ul className="ip-nc">{p.not_counted.stocks.map((s) => <li key={s.symbol}><Link to={`/stocks/${s.symbol}`}><b>{s.symbol}</b> {s.name}</Link></li>)}</ul></>
        : <LockedBlock plan={p.locked?.not_counted ?? "silver"} title="The list of stocks that are not counted is part of the Silver plan">It names each stock of this industry that is left out of the readings.</LockedBlock>}
    </details>
  );
}
export { STATE_HELP };
