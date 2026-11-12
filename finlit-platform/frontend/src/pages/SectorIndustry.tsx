// One industry or sector group (/sectors/:slug): where it is in the cycle, a year of breadth, the counted stocks ranked by 6-month return (10 first, then all) and the
// names of the stocks that are not counted. From GET /api/sectors/{slug}, which sends what the page shows and never how the reading is made.
// The ranked table and the not-counted list are Silver, the peer label column Gold: a locked part says so and why. Describes; never advises.
import { Hideable } from "../components/Hideable";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { HScroll } from "../components/HScroll";
import { RotationCard } from "../components/rotation/RotationCard";
import { SectorTabs } from "../components/rotation/Parts";
import { BreadthChart } from "../components/sectors/BreadthChart";
import { Blank, LockedBlock, SectorFooter, StateChip } from "../components/sectors/Parts";
import { useDocTitle } from "../lib/title";
import {
  QUARTER, averageLabel, countedText, dayMonth, failureText, flagAge, flagText, fullDate, level, plural, signedPct, stateClass, useSectorPage, type IndustryPage, type MarketNow, type RankedStock,
  stateWord,
} from "../lib/sectors";

/** Which of the four cycle stages is the current one (null for Neutral, which is none of them). */
const HERE: Record<string, number | null> = { washout: 0, thrust_c: 1, thrust_cap: 1, confirmed: 2, fading: 3, neutral: null };

function MarketStrip({ m }: { m: MarketNow | null }) {
  if (!m || m.pct_vs_200d == null) return <div className="sx-strip" role="note"><span className="k">The market</span><span>The Nifty 50 reading is not in this data set yet, so the market context is blank.</span></div>;
  const below = m.pct_vs_200d < 0;
  return (
    <div className={"sx-strip" + (below ? "" : " above")} role="note">
      <span className="k">The market</span>
      <span><b>Nifty 50 {level(m.nifty50)}</b>, {Math.abs(m.pct_vs_200d).toFixed(1)}% {below ? "below" : "above"} its {averageLabel(m)} of {level(m.nifty50_200d_average)}</span>
      {m.note && <span className="why">{m.note}</span>}
    </div>
  );
}

/** Sessions from a bounce to the next "turned to Losing steam" event, by the history's own session list. */
export function fadeAfter(p: Pick<IndustryPage, "events" | "history">, thrustDate: string): { date: string; sessions: number } | null {
  const next = p.events.find((e) => e.kind === "turned_fading" && e.date > thrustDate);
  if (!next) return null;
  const d = p.history.dates, a = d.indexOf(thrustDate), z = d.indexOf(next.date);
  return a >= 0 && z >= 0 ? { date: next.date, sessions: z - a } : null;
}

function Happening({ p }: { p: IndustryPage }) {
  const here = HERE[p.state_code] ?? null;
  const stages = [
    { k: "washout", name: "1 · Sold off", text: "Heavily sold; no broad rebound yet" },
    { k: "thrust", name: "2 · Bouncing back", text: "Most stocks turn up together" },
    { k: "confirmed", name: "3 · Rising together", text: "Most stocks trending up together" },
    { k: "fading", name: "Losing steam", text: "A rebound or trend lost its breadth" },
  ];
  return (
    <section className="sx-card sx-happen sx-sec" aria-labelledby="sx-hap">
      <h2 id="sx-hap">What is happening in {p.name}</h2>
      <p>{p.summary}</p>
      {p.how && <p className="sx-sub" style={{ marginTop: 0 }}>{p.how}</p>}
      <div className="sx-cyc4" role="list" aria-label="Where the industry is in the cycle">
        {stages.map((s, i) => {
          const isHere = here === i;
          const lead = isHere ? `${p.name} is here` : i === 3 ? "If it breaks" : here != null && i === here + 1 ? "Next in the cycle" : here != null && i === here + 2 ? "Then" : "Stage";
          return <div role="listitem" key={s.k} className={isHere ? `here ${stateClass(p.state)}` : ""} aria-current={isHere ? "step" : undefined}><small>{lead}</small><b>{s.name}</b>{s.text}</div>;
        })}
      </div>
      {here == null && <p className="sx-note" style={{ marginTop: 10, marginBottom: 0 }}>{p.name} is in none of these stages today (state: Neutral), so none is marked.</p>}
    </section>
  );
}

function ChartCard({ p }: { p: IndustryPage }) {
  const first = p.history.dates[0], last = p.history.dates[p.history.dates.length - 1];
  const thrusts = p.events.filter((e) => e.kind === "thrust_c" || e.kind === "thrust_cap");
  const fades = thrusts.map((t) => fadeAfter(p, t.date)).filter((x): x is { date: string; sessions: number } => !!x);
  const quick = fades.filter((f) => f.sessions <= 5).length;
  const listed = thrusts.map((t) => `${t.kind === "thrust_cap" ? "CAP" : "C"} on ${dayMonth(t.date)}`).join(", ");
  return (
    <section className="sx-card sx-sec" aria-labelledby="sx-chart">
      <h2 id="sx-chart">Breadth over the past year</h2>
      <p className="sx-sub" style={{ marginBottom: 0 }}>Share of counted {p.name} stocks above their own averages, each session{first && last ? ` from ${fullDate(first)} to ${fullDate(last)}` : ""}.</p>
      <BreadthChart page={p} />
            <p className="sx-sub" style={{ marginTop: 12, marginBottom: 0 }} data-testid="chart-story">
        {thrusts.length ? `${p.name} had ${thrusts.length === 1 ? "one bounce" : plural(thrusts.length, "bounce")} in the past year: ${listed}.${fades.length ? ` ${quick} of the ${plural(fades.length, "bounce")} that turned to Losing steam did so within 5 sessions.` : ""}` : `${p.name} had no bounce in the past year.`}
        {p.since ? ` Since ${dayMonth(p.since)} the industry has been ${p.state === "Neutral" ? "showing no clear signal" : "in the state " + stateWord(p.state)}.` : ""}
      </p>
    </section>
  );
}

const RET = (v: number | null) => (v == null ? "sx-na" : v > 0 ? "sx-ret pos" : v < 0 ? "sx-ret neg" : "sx-ret");
function RankedTable({ p }: { p: IndustryPage }) {
  const locked = p.locked ?? {};
  const [all, setAll] = useState(false);
  const rows = p.stocks == null ? null : all ? p.stocks : p.stocks.slice(0, 10);
  const peerLocked = !!locked.peer_label;
  return (
    <section className="sx-sec sx-ranked" aria-labelledby="sx-ranked">
      <h2 id="sx-ranked" style={{ margin: "0 0 4px", font: "600 20px/1.3 var(--sans)" }}>The {p.stocks_counted} counted stocks, ranked by 6-month return</h2>
      <p className="sx-sub" style={{ marginBottom: 12 }}>How each stock has behaved inside its industry.</p>
      {rows == null ? (
        <LockedBlock plan={locked.stocks ?? "silver"} title="The ranked stock table is part of the Silver plan">Open to everyone: the state, the breadth chart and the numbers above. Silver adds each counted stock's 6-month return and quarter in the industry, its leader flag and its size.</LockedBlock>
      ) : !rows.length ? (
        <p className="sx-note" role="status">No stock is ranked: this group has no counted stocks with six months of prices today.</p>
      ) : (
        <>
          <div className="sx-tablebox"><HScroll label="ranked stocks table" className="sx-scroll">
            <table className="sx-t" data-testid="ranked-table">
              <caption className="sx-visually">Counted stocks of {p.name} ranked by 6-month return</caption>
              <thead><tr><th scope="col">Stock</th><th scope="col">#</th><th scope="col">6-month return</th><th scope="col" className="l">Quarter in the industry</th><th scope="col" className="l">Leader flag</th><th scope="col" className="l">Size (AMFI)</th><th scope="col" className="l">Peer label</th></tr></thead>
              <tbody>{rows.map((s) => <StockRow key={s.symbol} s={s} peerLocked={peerLocked} />)}</tbody>
            </table></HScroll></div>
          <div className="sx-notes">
            <p><b>Quarter in the industry.</b> Where the 6-month return ranks among the counted stocks.</p>
            <p><b>Size.</b> Large, mid or small cap from AMFI's list for the last half-year: the top 100 companies by average market cap are large caps, the next 150 mid caps, the rest small caps.{peerLocked ? " The peer label (Leader, In line, Laggard) is part of the Gold plan." : " Peer label: the stock's Leader / In line / Laggard label against its peers over 12 months."}</p>
          </div>
          {p.stocks != null && p.stocks.length > 10 && <p style={{ marginTop: 10 }}><button type="button" className="btn" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show the first 10" : `Show all ${p.stocks.length}`}</button></p>}
        </>
      )}
      {p.leader_flag_note && <p className="sx-note" style={{ marginTop: 10 }}>{p.leader_flag_note}</p>}
    </section>
  );
}
function StockRow({ s, peerLocked }: { s: RankedStock; peerLocked: boolean }) {
  return (
    <tr>
      <td><div className="sx-name"><Link to={`/stocks/${s.symbol}`}>{s.symbol}</Link><small>{s.name}</small></div></td>
      <td>{s.rank_6m ?? "—"}</td>
      <td className={RET(s.return_6m_pct)}>{signedPct(s.return_6m_pct, 1)}</td>
      <td className="l">{s.quarter_name ?? (s.quarter ? QUARTER[s.quarter] : <span className="sx-na">Not ranked</span>)}</td>
      <td className="l">{s.leader_flag ? <span className="sx-chip info">{flagText(s.leader_flag)} · {flagAge(s.leader_flag.sessions_ago)}</span> : <span className="sx-na">None</span>}</td>
      <td className="l">{s.amfi_category ?? <span className="sx-na">Not in AMFI's list</span>}</td>
      <td className="l">{peerLocked ? <span className="sx-na" title="The peer label is part of the Gold plan">Gold</span> : s.peer_label ?? <span className="sx-na" title="No peer label: too few peers or too little history">No label</span>}</td>
    </tr>
  );
}

function NotCounted({ p }: { p: IndustryPage }) {
  const nc = p.not_counted;
  const locked = p.locked ?? {};
  if (nc == null) {
    return <section className="sx-card sx-sec"><h2>Not counted</h2><LockedBlock plan={locked.not_counted ?? "silver"} title="The list of stocks that are not counted is part of the Silver plan">It names each stock of this industry that is left out of the breadth readings.</LockedBlock></section>;
  }
  return (
    <section className="sx-card sx-sec" aria-labelledby="sx-nc">
      <h2 id="sx-nc">Not counted: {nc.count} {p.name} {nc.count === 1 ? "stock" : "stocks"}</h2>
      <p className="sx-sub">{nc.count ? `${nc.count} ${p.name} ${nc.count === 1 ? "stock is" : "stocks are"} not counted: too small, too thinly traded or too recently listed.` : "Every listed stock of this industry is counted."}</p>
      {nc.count > 0 && <details className="sx-notcounted"><summary>Show the {nc.count === 1 ? "stock" : `${nc.count} stocks`}</summary>
        <ul>{nc.stocks.map((s) => <li key={s.symbol}><Link to={`/stocks/${s.symbol}`}>{s.symbol}</Link><small>{s.name}</small></li>)}</ul>
        {nc.text && <p className="sx-note">{nc.text}</p>}</details>}
    </section>
  );
}

export function SectorIndustryPage() {
  const { slug = "" } = useParams();
  const q = useSectorPage(slug);
  const p = q.data;
  useDocTitle(p ? `${p.name}: sector breadth` : "Sector breadth", p ? `${p.name} on NSE: where its stocks stand against their 9, 20 and 50-day averages, its state in the cycle and and how it compares with the other industries.` : undefined);
  const notCountedN = p?.not_counted?.count;
  return (
    <div className="wrap sx" data-testid="sector-industry">
      <SectorTabs active="pulse" />
      <p className="sx-back"><Link to="/sectors">Sector Pulse</Link> / {p?.name ?? slug}</p>
      {q.isLoading && <div className="sx-skel" role="status" aria-label="Loading the industry" />}
      {q.isError && <Blank title={q.error?.status === 404 ? "No such industry" : "This industry is not available right now"} reason={failureText(q.error)}><Link className="btn" to="/sectors">Back to Sector Pulse</Link></Blank>}
      {p && (
        <>
          <div className="sx-title"><h1>{p.name}</h1><StateChip state={p.state} big extra={p.since ? `since ${dayMonth(p.since)}` : undefined} /></div>
          <p className="sx-meta">{p.kind === "sector" ? `NSE sector group of ${p.industries.length} small industries (${p.industries.join(", ")}) in the ${p.sector} sector` : `NSE industry in the ${p.sector} sector`} · {countedText(p)}{notCountedN != null ? `, ${notCountedN} not counted` : `, ${Math.max(0, p.stocks_listed - p.stocks_counted)} listed stocks not counted`} · data as of {fullDate(p.date)}</p>
          <MarketStrip m={p.market} />
          <Hideable id="pulse.industry.cycle" title={`Where ${p.name} is in the cycle`}><Happening p={p} /></Hideable>
          <Hideable id="pulse.industry.rotation" title="Against other industries"><RotationCard slug={p.slug} groupName={p.name} kindLine={`${p.name} · ${p.kind === "sector" ? `sector group of ${p.industries.length} small NSE industries` : "NSE industry"} · ${countedText(p)}`} /></Hideable>
          <Hideable id="pulse.industry.year" title="Breadth over the past year"><ChartCard p={p} /></Hideable>
          <RankedTable p={p} />
          <NotCounted p={p} />
          <SectorFooter disclaimer={p.disclaimer} />
        </>
      )}
    </div>
  );
}
