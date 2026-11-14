// "Where <company> stands" (final pages pack, board 17): its industry, its peers, its own price and its risk, one question per tab. It replaces the report's
// "Where its industry stands" (Sector & peers) and "Where this stock stands among its peers" (Leadership) sections. Every figure is the server's: the stock's sector
// reading, its industry page, Sector Rotation, the peer reading and its history, the price and Prism; the words come from lib/standsPack. Describes; never advice.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { CoLogo } from "../../components/CoLogo";
import { LockedBlock } from "../../components/sectors/Parts";
import { BoxChip, Cards, Scroll, StateChip, Tip } from "../../components/sectors/pack/Common";
import { STATE_HELP, WORD, keyOf, short } from "../../lib/pulsePack";
import { BOX_HELP } from "../../lib/rotationPack";
import { failureText, useSectorPage, useStockSector, type IndustryPage, type RankedStock } from "../../lib/sectors";
import { useRotationCard } from "../../lib/rotation";
import { useLeadership, useLeadershipHistory, type LeadershipOn, type LeadLabel } from "../../lib/leadership";
import { usePrice, type Peers, type Summary } from "../../lib/api";
import { capBucket } from "../../lib/capBuckets";
import { ratingWord, trendAlignment } from "../../lib/prismTechnical";
import { usePlanModel, usePlanPrism } from "../../lib/planScore";
import { LABEL, headline, industryCards, ordinal, peerCards, priceCards, riskCards, rotationLine } from "../../lib/standsPack";
import "../../styles/sectors-pack.css";
import "../../styles/industry-pack.css";
import "./stands.css";

type Tab = "industry" | "peers" | "chart" | "risk";
const sp = (x: number | null | undefined, dp = 1, unit = "%") => (x == null ? "–" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(dp)}${unit}`);
const inr = (x: number) => "₹" + x.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const size = (cr: number | null | undefined) => capBucket(cr ?? null)?.label.replace(" cap", "") ?? "–";
const PEER_HELP = "Leader, In line, Laggard. Each share's price over the last 12 months is compared with similar companies and with its sector index. Leader: among the strongest of its group and ahead of the index. Laggard: among the weakest and behind it. It describes the past, not the future.";
const SIZE_HELP = "Company size. FinLit uses three sizes everywhere, by market value: Large above ₹50,000 Cr, Mid ₹10,000 to 50,000 Cr, Small below ₹10,000 Cr.";
const PeerChip = ({ l }: { l: LeadLabel }) => <span className={"ws-peer " + l}>{LABEL[l]}</span>;

export function WhereStands({ symbol, name, s, peers }: { symbol: string; name: string; s: Summary; peers?: Peers }) {
  const short1 = name.replace(/\s+(industries|limited|ltd\.?|corporation|corp\.?|company)\b.*$/i, "").trim() || name;
  const [tab, setTab] = useState<Tab>("industry");
  const secQ = useStockSector(symbol), sec = secQ.data ?? null;
  const g = sec?.group ?? null, locked = !!sec?.locked?.stock;
  const page = useSectorPage(g?.slug ?? "").data ?? null;   // null while loading or without an industry
  const rot = useRotationCard(g?.slug ?? "", !!g).data;
  const ld = useLeadership(symbol).data, lead = ld && ld.available ? ld : null;
  const model = usePlanModel();
  const pm = usePlanPrism(useMemo(() => [symbol], [symbol]), model)[symbol];
  const prism = pm && pm !== "error" ? pm : null;
  const px = usePrice(symbol, "1Y").data;
  const ind = g ? short(g.name) : null, key = g ? keyOf(g) : null;
  const align = prism ? trendAlignment(prism.shortTerm?.score, prism.longTerm?.score)?.label ?? null : null;
  const h = headline(short1, ind, key ? WORD[key] : null, sec, rot, lead);
  const sixRank = sec?.rank_6m != null && sec.ranked_6m ? `${ordinal(sec.rank_6m)} of ${sec.ranked_6m}` : null;
  const TABS: [Tab, string, string][] = [["industry", "Its industry", "Sector Pulse, Sector Rotation, and where " + short1 + " ranks inside"],
    ["peers", "Against peers", lead ? `${lead.peerGroup.ranked} ${lead.peerGroup.short} companies, and what the leader did` : "Similar companies, and what the leader did"],
    ["chart", "Price chart", "12 months, trends and the 1-year high"], ["risk", "Risk", "How risky the share is, and why"]];
  return (
    <section className="block sp ws" id="sector" aria-labelledby="ws-h" data-testid="where-stands">
      <div className="sp-sec ws-head">
        <p className="ws-eye">Sector, peers and risk</p>
        <h2 id="ws-h">Where {short1} stands</h2>
        <p className="sp-sub">Its industry, its peers, its own price and its risk: one question per tab.</p>
        {h && <p className="ws-lead"><b>{h.lead}</b>{h.rest}</p>}
        {h?.recent && <p className="sp-note">{h.recent}</p>}
        <div className="ws-strip">
          {key && <span className="ws-pill">Industry now <StateChip k={key} /><Tip text={STATE_HELP[key]} label="About the industry's state" /></span>}
          {rot?.corner && rot.corner !== "middle" && <span className="ws-pill">Against other industries <BoxChip corner={rot.corner} /><Tip text={BOX_HELP[rot.corner]} label={`About “${rot.corner_name}”`} /></span>}
          {sixRank && !locked && <span className="ws-pill">Inside its industry <b className={"ws-q q" + (sec?.quarter ?? 0)}>{sixRank}</b></span>}
          {lead && <span className="ws-pill">Against peers <PeerChip l={lead.label} />{lead.rawLabel !== lead.label && <span className="ws-next">→ {LABEL[lead.rawLabel]}?</span>}</span>}
          {align && <span className="ws-pill">Its own chart <b className="ws-own">{align}</b></span>}
        </div>
      </div>
      <div className="ws-tabs" role="tablist" aria-label={`Where ${short1} stands`}>
        {TABS.map(([k, t, d]) => <button key={k} type="button" role="tab" id={`ws-tab-${k}`} aria-selected={tab === k} aria-controls="ws-panel" onClick={() => setTab(k)}><b>{t}</b><small>{d}</small></button>)}
      </div>
      <div id="ws-panel" role="tabpanel" aria-labelledby={`ws-tab-${tab}`}>
        {tab === "industry" && secQ.isError && <p className="sp-note" role="status" data-testid="sector-blank">{failureText(secQ.error)}</p>}
        {tab === "industry" && !secQ.isError && (!g ? <p className="sp-note">{sec?.note ?? "NSE has not given this stock an industry yet, so there is no industry reading to show."}</p> : <IndustryTab name={short1} symbol={symbol} sec={sec!} locked={locked} page={page} rot={rot} />)}
        {tab === "peers" && (lead ? <PeersTab name={short1} fullName={name} symbol={symbol} lead={lead} peers={peers} pe={s.keyMetrics} score={s.score?.overall} cap={s.quote.marketCapCr} /> : <p className="sp-note">{ld && !ld.available ? ld.display?.line ?? "No peer reading for this stock yet." : "The peer reading is loading."}</p>)}
        {tab === "chart" && <ChartTab px={px} s={s} prism={prism} align={align} />}
        {tab === "risk" && <RiskTab name={short1} s={s} risk={prism?.parts?.risk ?? null} gold={model === "prism"} nifty12={lead?.benchmarks.market?.ret52 ?? null} />}
      </div>
      <p className="sp-note ws-foot">Describes past prices, breadth and peer data; not a recommendation. Information only, not investment advice.</p>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ Its industry
function IndustryTab({ name, symbol, sec, locked, page, rot }: { name: string; symbol: string; sec: NonNullable<ReturnType<typeof useStockSector>["data"]>; locked: boolean; page: IndustryPage | null; rot: ReturnType<typeof useRotationCard>["data"] }) {
  const g = sec.group!, k = keyOf(g), ind = short(g.name);
  const f = page ?? g;   // the industry page is open to every plan and carries the breadth figures; the stock's own sector answer leaves them out below Gold
  const hist = page?.history, ser = hist ? hist.above_20.slice(-126) : [];
  const W = 420, H = 60, xs = ser.map((_, i) => 4 + (i / Math.max(1, ser.length - 1)) * (W - 8)), y = (v: number) => H - 4 - (v / 100) * (H - 8);
  const d = ser.map((v, i) => (v == null ? "" : `${i && ser[i - 1] != null ? "L" : "M"}${xs[i].toFixed(1)},${y(v).toFixed(1)}`)).join("");
  const stocks = (page?.stocks ?? null) as RankedStock[] | null, max = stocks ? Math.max(1, ...stocks.map((x) => Math.abs(x.return_6m_pct ?? 0))) : 1;
  const row = (lab: string, help: string, v: string) => <div className="ws-row"><span>{lab}<Tip text={help} label={`About “${lab}”`} /></span><b>{v}</b></div>;
  return (<>
    <Cards items={locked ? [] : industryCards(name, ind, sec, page, rot, k)} />
    <div className="ws-two">
      <div className="sp-sec ws-box">
        <p className="ws-cap">Sector Pulse · the last few days</p>
        <p className="ws-chiprow"><StateChip k={k} /><Tip text={STATE_HELP[k]} label="About the industry's state" /></p>
        {page?.summary && <p className="ws-txt">{page.summary}</p>}
        {d && <><svg viewBox={`0 0 ${W} ${H}`} className="ws-spark" role="img" aria-label={`Stocks above their medium trend over 6 months, now ${Math.round(ser[ser.length - 1] ?? 0)} of 100`}><line x1="4" x2={W - 4} y1={y(50)} y2={y(50)} className="ws-mid" /><path d={`${d}L${W - 4},${H}L4,${H}Z`} className="ws-area" /><path d={d} className="ws-line" fill="none" /></svg>
          <small className="ws-small">Stocks above their medium trend, out of 100, last 6 months · dashed line = 50</small></>}
        {row("Stocks above their short trend", "Short trend. How many of the industry's stocks are above their average price of the last few weeks. It reacts first, so it moves a lot.", f.breadth?.above_9 == null ? "–" : `${Math.round(f.breadth.above_9)} of 100`)}
        {row("Industry below its 1-year high", "Below its 1-year high. How far the industry (all its stocks averaged equally) is from its highest point of the past year. 0% means it is at the top.", f.index_vs_52w_high == null ? "–" : `${Math.abs(f.index_vs_52w_high).toFixed(1)}%`)}
        {row("Stocks that held up at the last low", "Held up at the low. When the industry last made a low, how many of its stocks did NOT make a new low with it. A low number means the fall hit almost everyone, which is what a crash looks like.", f.held_up == null ? (f.higher_low_note ? "–" : "No recent low") : `${Math.round(f.held_up)} of 100`)}
        {row("Stocks counted", "Stocks counted. Only actively traded, established stocks are counted, so a few rarely traded names cannot swing the reading.", f.stocks_counted == null ? "–" : `${f.stocks_counted} of ${f.stocks_listed}`)}
        <Link className="sp-link" to={`/sectors/${g.slug}`}>Open the {ind} page →</Link>
      </div>
      <div className="sp-sec ws-box">
        <p className="ws-cap">Sector Rotation · the last few months</p>
        {rot && rot.corner && rot.corner !== "middle" ? <>
          <p className="ws-chiprow"><BoxChip corner={rot.corner} /><Tip text={BOX_HELP[rot.corner]} label={`About “${rot.corner_name}”`} /></p>
          <p className="ws-txt">{rotationLine(ind, rot)}</p>
          {row("Rank", `Rank. The industry's place among the ${rot.ranked ?? "ranked"} ranked industries this week, by how it has done against the average industry. 1 is the strongest.`, rot.rank == null ? "Not ranked yet" : `${rot.rank} of ${rot.ranked}${rot.rank_change_1w ? ` ${rot.rank_change_1w > 0 ? "▲" : "▼"}${Math.abs(rot.rank_change_1w)}` : ""}`)}
          {row("6 months, against the average industry", "6 months. How many percentage points better (+) or worse (−) the industry did than the average industry over the last six months.", sp(rot.strength_pts, 1, " pts"))}
          {row("Last month, against the average", "1 month. How many percentage points better (+) or worse (−) the industry's stocks did than the average industry over the last month.", sp(rot.change_pts, 1, " pts"))}
          {row("Weeks in this box", "Weeks in this box. How long the industry has stayed in its current box. Long stays show a steady trend.", String(rot.weeks_in_corner))}
          {rot.this_week_reading_name && rot.this_week_reading_name !== rot.corner_name && <Cards items={[{ kind: "watch", title: "May change box next week", text: `This week's reading is ${rot.this_week_reading_name}. The box changes only if the next weekly reading agrees.` }]} />}
          <Link className="sp-link" to="/sector-rotation">Open Sector Rotation →</Link>
        </> : <p className="sp-note">{rot?.note ?? "No rotation reading for this industry yet: it has too few counted stocks, or this week's files are not in."}</p>}
      </div>
    </div>
    {locked ? <LockedBlock plan="gold" title="Where the stock ranks inside its industry is part of the Gold plan">Open to everyone: the industry's state and its place against other industries. Gold adds this stock's 6-month rank among its industry's counted stocks.</LockedBlock>
      : <div className="sp-sec">
        <h3 className="ws-h3">Inside its industry: 6-month return<Tip text={`Inside its industry. Where ${name}'s 6-month return falls among the actively traded stocks of its NSE industry.`} /></h3>
        {stocks ? <><p className="sp-sub">The {stocks.length} counted {ind} stocks, best first. {name} in red.</p>
          <ol className="ws-bars">{stocks.map((x) => { const v = x.return_6m_pct ?? 0, me = x.symbol === symbol; return (
            <li key={x.symbol} className={me ? "me" : ""}><Link to={`/stocks/${x.symbol}`}>{x.symbol}</Link><span className="ws-axis"><i className={v >= 0 ? "pos" : "neg"} style={{ width: `${(Math.abs(v) / max) * 50}%` }} /></span><b className={v >= 0 ? "sp-good" : "sp-red"}>{sp(x.return_6m_pct)}</b></li>); })}</ol></>
          : sec.in_group === false ? <p className="sp-note">{sec.note ?? `${name} is not counted in its industry's breadth, so it has no rank inside it.`}</p> : <p className="sp-note">The industry's stock list is loading.</p>}
      </div>}
  </>);
}

// ------------------------------------------------------------------------------------------------ Against peers
function PeersTab({ name, fullName, symbol, lead, peers, pe, score, cap }: { name: string; fullName: string; symbol: string; lead: LeadershipOn; peers?: Peers; pe: Summary["keyMetrics"]; score: number | null | undefined; cap: number | null }) {
  const g = lead.peerGroup, sec = lead.benchmarks.sector.name, mk = lead.benchmarks.market?.name ?? "Nifty 50";
  const km = (k: string) => pe.find((x) => x.key === k)?.value ?? null;
  // the peers list names the other companies; this company's own card comes first, from the report's own figures
  const others = (peers?.items ?? []).filter((x) => x.symbol !== symbol);
  const self = (peers?.items ?? []).find((x) => x.symbol === symbol) ?? { symbol, name: fullName, overall: score ?? null, pe: km("pe"), roe: km("roe"), market_cap: cap ?? km("market_cap") };
  const items = others.length ? [self, ...others] : [], me = self;
  const val = { pe: me?.pe ?? km("pe"), roe: me?.roe ?? km("roe"), peers: items.filter((x) => x.symbol !== symbol).map((x) => ({ pe: x.pe ?? null, roe: x.roe ?? null })) };
  const top = lead.peers.find((p) => p.rank === 1);
  const pt = (v: number | null) => (v == null ? "–" : sp(v * 100, 1, " pts"));
  return (<>
    <Cards items={peerCards(name, lead, val)} />
    <div className="sp-sec">
      <h3 className="ws-h3">How it ranks among {g.ranked} {g.name} peers<Tip text={PEER_HELP} /></h3>
      <p className="sp-sub">By price over the last 12 months against {sec}, refreshed every Friday.</p>
      <Scroll label="peer ranking"><table className="sp-tb ws-pt">
        <thead><tr><th scope="col">#</th><th scope="col">Company</th><th scope="col">Size<Tip text={SIZE_HELP} /></th><th scope="col">Status<Tip text={PEER_HELP} /></th>
          <th scope="col" className="r">12M vs sector<Tip text={`12 months against its sector index. How many percentage points better (+) or worse (−) the share did than ${sec} over the last 12 months.`} /></th>
          <th scope="col" className="r">3M vs sector<Tip text="3 months against its sector index. The same comparison over the last 3 months: it shows the recent direction." /></th>
          <th scope="col" className="r">12M vs {mk}<Tip text={`12 months against the whole market. The same comparison with the ${mk}.`} /></th></tr></thead>
        <tbody>{lead.peers.map((p) => (
          <tr key={p.symbol} className={p.symbol === symbol ? "me" : ""} aria-current={p.symbol === symbol ? "true" : undefined}>
            <td>{p.rank}</td>
            <th scope="row">{p.symbol === symbol ? <span className="ip-sym"><CoLogo symbol={p.symbol} name={p.name ?? p.symbol} size={22} inline /><b>{p.name ?? p.symbol}</b></span> : <Link to={`/stocks/${p.symbol}`} className="ip-sym"><CoLogo symbol={p.symbol} name={p.name ?? p.symbol} size={22} inline /><b>{p.name ?? p.symbol}</b></Link>}</th>
            <td>{size(p.marketCap)}</td><td><PeerChip l={p.label} /></td>
            <td className={"r " + ((p.rel52 ?? 0) >= 0 ? "sp-good" : "sp-red")}>{pt(p.rel52)}</td><td className={"r " + ((p.rel13 ?? 0) >= 0 ? "sp-good" : "sp-red")}>{pt(p.rel13)}</td><td className={"r " + ((p.rel52Market ?? 0) >= 0 ? "sp-good" : "sp-red")}>{pt(p.rel52Market)}</td>
          </tr>))}</tbody>
      </table></Scroll>
      <p className="sp-note">{lead.labelSince ? `Label since ${new Date(lead.labelSince + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}. ` : ""}Describes the past; not a recommendation. <Link to="/leadership-label">What the labels mean →</Link></p>
    </div>
    <div className="ws-two">
      {top && top.symbol !== symbol ? <LeaderWhatIf symbol={symbol} name={name} leader={top.symbol} leaderName={top.name ?? top.symbol} leaderCap={top.marketCap} myCap={lead.peers.find((p) => p.symbol === symbol)?.marketCap ?? null} />
        : <div className="sp-sec"><h3 className="ws-h3">What if you had owned the group leader?</h3><p className="sp-note">{name} is the group leader: it ranks 1st of {g.ranked}.</p></div>}
      <div className="sp-sec">
        <h3 className="ws-h3">Business against similar companies</h3>
        {items.length > 1 ? <><p className="sp-sub">{name} and the {items.length - 1} other companies in its industry. Select one to open its report.</p>
          <div className="ws-biz">{items.slice(0, 6).map((x) => (
            <Link key={x.symbol} to={`/stocks/${x.symbol}`} className={"ws-bc" + (x.symbol === symbol ? " me" : "")}>
              <span className="ip-sym"><CoLogo symbol={x.symbol} name={x.name ?? x.symbol} size={22} inline /><b>{x.name ?? x.symbol}</b></span>
              <dl><div><dt>Score</dt><dd>{x.overall == null ? "–" : Math.round(x.overall)}</dd></div><div><dt>P/E</dt><dd>{x.pe == null || x.pe <= 0 ? "–" : `${x.pe.toFixed(1)}×`}</dd></div><div><dt>ROE</dt><dd>{x.roe == null ? "–" : `${x.roe.toFixed(1)}%`}</dd></div><div><dt>Size</dt><dd>{size(x.market_cap)}</dd></div></dl>
            </Link>))}</div>
          <p className="sp-note">Score is the FinLit IQ, 0 to 100.</p></>
          : <p className="sp-note">No similar companies are listed for this industry yet.</p>}
      </div>
    </div>
  </>);
}

function LeaderWhatIf({ symbol, name, leader, leaderName, leaderCap, myCap }: { symbol: string; name: string; leader: string; leaderName: string; leaderCap: number | null; myCap: number | null }) {
  const a = useLeadershipHistory(symbol).data, b = useLeadershipHistory(leader).data;
  const sa = a?.series, sb = b?.series;
  if (!sa || !sb) return <div className="sp-sec"><h3 className="ws-h3">What if you had owned the group leader?</h3><p className="sp-note">{a && b ? "One of the two companies has too little price history for this." : "Loading the two price lines…"}</p></div>;
  const by = new Map(sb.dates.map((d, i) => [d, sb.stock[i]]));
  const pts = sa.dates.map((d, i) => [d, sa.stock[i], by.get(d) ?? null] as const).filter((x) => x[1] != null && x[2] != null).slice(-53);
  if (pts.length < 10) return <div className="sp-sec"><h3 className="ws-h3">What if you had owned the group leader?</h3><p className="sp-note">The two companies share too few weeks of prices for this.</p></div>;
  const m = pts.map(([, x]) => (x as number) / (pts[0][1] as number) * 100), l = pts.map(([, , x]) => (x as number) / (pts[0][2] as number) * 100);
  const lo = Math.min(...m, ...l), hi = Math.max(...m, ...l), W = 420, H = 150, X = (i: number) => 30 + (i / (pts.length - 1)) * (W - 40), Y = (v: number) => 8 + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - 24);
  const line = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const lakh = (v: number) => "₹" + Math.round(v * 1000).toLocaleString("en-IN");
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <div className="sp-sec">
      <h3 className="ws-h3">What if you had owned the group leader?<Tip text="Hindsight: it shows the past, not what will happen next." /></h3>
      <p className="sp-sub">Both lines start at 100 {pts.length >= 52 ? "a year ago" : `${pts.length} weeks ago`}.</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="ws-wi" role="img" aria-label={`₹1 lakh in ${symbol} is now ${lakh(m[m.length - 1])}; in ${leader}, ${lakh(l[l.length - 1])}`}>
        {ticks.map((t) => <g key={t}><line x1="30" x2={W - 10} y1={Y(t)} y2={Y(t)} className="ws-grid" /><text x="2" y={Y(t) + 4} className="ws-tick">{Math.round(t)}</text></g>)}
        <line x1="30" x2={W - 10} y1={Y(100)} y2={Y(100)} className="ws-mid" />
        <path d={line(l)} className="ws-ll" fill="none" /><path d={line(m)} className="ws-ml" fill="none" />
      </svg>
      <div className="ws-wv"><span>₹1 lakh in {symbol}<b className="sp-red">{lakh(m[m.length - 1])}</b></span><span>₹1 lakh in {leader}<b className="sp-good">{lakh(l[l.length - 1])}</b></span></div>
      {leaderCap != null && myCap != null && leaderCap * 5 < myCap && <Cards items={[{ kind: "watch", title: "Not a like-for-like swap", text: `${leaderName} is a ${size(leaderCap).toLowerCase()} company worth about ₹${Math.round(leaderCap).toLocaleString("en-IN")} Cr; ${name} is worth about ₹${Math.round(myCap).toLocaleString("en-IN")} Cr. Small companies can rise faster, and fall faster.` }]} />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Price chart
function ChartTab({ px, s, prism, align }: { px: ReturnType<typeof usePrice>["data"]; s: Summary; prism: { shortTerm?: { score: number | null } | null; longTerm?: { score: number | null } | null } | null; align: string | null }) {
  if (!px) return <p className="sp-note">Loading the price chart…</p>;
  const c = px.series.c, t = px.series.t, last = c[c.length - 1], hi52 = s.quote.high52 ?? Math.max(...c);
  const m1 = s.returns.find((r) => r.period === "1M")?.price ?? null, m12 = s.returns.find((r) => r.period === "1Y")?.price ?? null, tech = px.technical;
  const lo = Math.min(...c), hi = Math.max(...c), W = 760, H = 220, X = (i: number) => 54 + (i / Math.max(1, c.length - 1)) * (W - 64), Y = (v: number) => 8 + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - 30);
  const d = c.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));
  const mo = [0, Math.floor(c.length / 4), Math.floor(c.length / 2), Math.floor((3 * c.length) / 4)];
  const word = (sc: number | null | undefined) => (sc == null ? null : ratingWord(null, sc).word);
  const st = word(prism?.shortTerm?.score), lt = word(prism?.longTerm?.score);
  const tile = (k: string, v: string, help?: string) => <div className="ip-tile"><p className="sp-cap">{k}{help && <Tip text={help} label={`About “${k}”`} />}</p><b>{v}</b></div>;
  return (<>
    <Cards items={priceCards({ last, high52: hi52, m1, m12, vs50: tech?.vsEma50Pct ?? null, vs200: tech?.vsEma200Pct ?? null, rsi: tech?.rsi14 ?? null, align })} />
    <div className="sp-sec">
      <h3 className="ws-h3">Share price, last 12 months</h3><p className="sp-sub">Daily closing prices on NSE.</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="ws-px" role="img" aria-label={`Share price over 12 months: from ${inr(c[0])} to ${inr(last)}`}>
        {ticks.map((v) => <g key={v}><line x1="54" x2={W - 10} y1={Y(v)} y2={Y(v)} className="ws-grid" /><text x="0" y={Y(v) + 4} className="ws-tick">₹{Math.round(v).toLocaleString("en-IN")}</text></g>)}
        <path d={d} className="ws-pl" fill="none" /><circle cx={X(c.length - 1)} cy={Y(last)} r="4" className="ws-pd" />
        {mo.map((i) => <text key={i} x={X(i)} y={H - 4} className="ws-tick">{new Date(t[i] + "T00:00:00Z").toLocaleDateString("en-IN", { month: "short", year: i ? undefined : "numeric", timeZone: "UTC" })}</text>)}
        <text x={W - 34} y={H - 4} className="ws-tick">Now</text>
      </svg>
      <div className="ws-tiles">
        {tile("Short-term trend", st ?? (tech?.vsEma50Pct == null ? "–" : tech.vsEma50Pct >= 0 ? "Above its 50-day average" : "Below its 50-day average"), "Short-term trend. The direction of the price over the last few weeks.")}
        {tile("Long-term trend", lt ?? (tech?.vsEma200Pct == null ? "–" : tech.vsEma200Pct >= 0 ? "Above its 200-day average" : "Below its 200-day average"), "Long-term trend. The direction of the price over the last year or so.")}
        {tile("1-year high", inr(hi52))}
        {tile("Below the high", `${Math.max(0, (1 - last / hi52) * 100).toFixed(1)}%`, "Below its 1-year high. How far the latest price is from the highest close of the past year. 0% means it is at the top.")}
        {tile("Last month", sp(m1))}{tile("Last 12 months", sp(m12))}
      </div>
    </div>
  </>);
}

// ------------------------------------------------------------------------------------------------ Risk
function RiskTab({ name, s, risk, gold, nifty12 }: { name: string; s: Summary; risk: number | null; gold: boolean; nifty12: number | null }) {
  const m1 = s.returns.find((r) => r.period === "1M")?.price ?? null, m12 = s.returns.find((r) => r.period === "1Y")?.price ?? null;
  const last = s.quote.price, hi = s.quote.high52, cap = s.quote.marketCapCr;
  const word = risk == null ? null : risk >= 70 ? "Lower risk" : risk >= 50 ? "Moderate risk" : "Higher risk";
  return (<>
    <Cards items={riskCards(name, gold ? risk : null, m12, nifty12 == null ? null : nifty12 * 100)} />
    <div className="ws-two">
      <div className="sp-sec">
        <h3 className="ws-h3">How risky is the share?</h3><p className="sp-sub">FinLit's risk reading for the company.</p>
        {!gold ? <LockedBlock plan="gold" title="Prism Risk is part of the Gold plan">FinLit Prism's risk reading for every company, 0 to 100, from how much the price swings, the largest fall, how actively the share trades and whether promoters have pledged shares.</LockedBlock>
          : risk == null ? <p className="sp-note">FinLit Prism has no risk reading for this company yet.</p>
            : <div className="ws-risk"><span className="ws-ring" style={{ ["--v" as string]: risk }}><b>{Math.round(risk)}</b></span>
              <div><p className="ws-rk">Prism Risk {Math.round(risk)} · {word}<Tip text="Prism Risk. FinLit's risk reading for each company from 0 to 100. Higher means lower risk." /></p><p className="sp-note">It looks at how much the price swings, the largest fall, how actively the share trades and whether promoters have pledged shares. Higher means lower risk.</p></div></div>}
      </div>
      <div className="sp-sec">
        <h3 className="ws-h3">The figures behind it</h3><p className="sp-sub">Other readings that bear on risk.</p>
        <div className="ws-row"><span>Size</span><b>{cap == null ? "–" : `${size(cap)} · ₹${Math.round(cap).toLocaleString("en-IN")} Cr`}</b></div>
        <div className="ws-row"><span>Below its 1-year high</span><b>{last != null && hi ? `${Math.max(0, (1 - last / hi) * 100).toFixed(1)}%` : "–"}</b></div>
        <div className="ws-row"><span>Last 12 months</span><b className={(m12 ?? 0) >= 0 ? "sp-good" : "sp-red"}>{sp(m12)}</b></div>
        <div className="ws-row"><span>Last month</span><b className={(m1 ?? 0) >= 0 ? "sp-good" : "sp-red"}>{sp(m1)}</b></div>
      </div>
    </div>
  </>);
}
