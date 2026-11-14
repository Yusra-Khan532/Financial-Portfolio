// The Equity portfolio's sections as the "FinLit final pages" pack draws them (docs/design/finlit-final-pages/12-14): the score tiles, the three tabs, Against their peers
// with the group-leader comparison, How spread out is the list?, Where your list sits, the packs that move together, Risk at a glance, Share of the money vs share of the risk,
// If the market fell 10%, Each share's risk, and What this means, in short. Figures are the server's; words from lib/equityPack. Describes; never advice.
import { useMemo } from "react";
import { Link } from "react-router";
import { useQueries } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { CoLogo } from "../../components/CoLogo";
import { Hideable } from "../../components/Hideable";
import { Cards, Scroll, Section, Tip } from "../../components/sectors/pack/Common";
import type { LeadHistory, Leadership } from "../../lib/leadership";
import {
  corrCell, leaderCards, peerCards, segLine, togetherCards, peerLine, peerSentence, riskCards, riskLead, riskTiles, riskWord, sp, spreadCards, standsOut, PEER_WORD,
  type LeaderPair, type MarketFig, type Share, type Size, type Tile,
} from "../../lib/equityPack";
import type { PageObject, Reading } from "../types";
import type { StyleTilt } from "../../components/diversification/types";
import { ordinal, tiltRead } from "../../components/diversification/wording";
import { LockedBlock } from "../../components/sectors/Parts";

const pct = (x: number) => `${Math.round(x)}%`;

// ------------------------------------------------------------------------------------------------ the score
export function ScoreGrid({ total, needsQty, band, tiles, onAddQty, onGo }: { total: number | null; needsQty: boolean; band?: string; tiles: Tile[]; onAddQty: () => void; onGo: (t: Tile["to"]) => void }) {
  return (
    <section className="eq-grid" aria-label="Your portfolio score">
      <div className="eq-total">
        <p className="eq-total-k">Your portfolio score<Tip text="Your portfolio score. One number from 0 to 100 that sums up the readings beside it: how strong the shares are, how well spread, how risky against the index, the price trend, valuation and concentration. How they are combined stays on FinLit's side." label="About “Your portfolio score”" /></p>
        <p className="eq-total-v"><b>{total ?? "—"}</b> / 100{band && total != null && <em>{band}</em>}</p>
        <p className="eq-total-x">{needsQty ? "Needs quantities: type how many of each share you own in the Qty column of Your shares. Until then every share counts the same." : "Counted by the value of each holding you entered."}</p>
        {needsQty && <button type="button" className="eq-addq" onClick={onAddQty}>Add quantities</button>}
      </div>
      {tiles.map((t) => (
        <div key={t.id} className={"eq-tile eq-" + t.tone}>
          <p className="eq-tile-k">{t.k}<Tip text={t.help} label={`About “${t.k}”`} /></p>
          <p className="eq-tile-v">{t.v}</p>
          <p className="eq-tile-x">{t.sub}</p>
          <button type="button" className="eq-tile-go" onClick={() => onGo(t.to)}>{t.link} →</button>
        </div>))}
    </section>
  );
}
export type View = "portfolio" | "diversification" | "risk";
export function ViewTabs({ view, onView, n }: { view: View; onView: (v: View) => void; n: number }) {
  const tabs: [View, string, string][] = [["portfolio", "Portfolio", `Your ${n} shares, their scores and how they compare with peers`], ["diversification", "Diversification", "How spread out the list is, and what moves together"], ["risk", "Risk analytics", "How much it swings, what drives the risk, what a fall could mean"]];
  return <div className="eq-tabs" role="tablist" aria-label="Equity portfolio views">{tabs.map(([k, t, s]) => <button key={k} type="button" role="tab" id={`eq-tab-${k}`} aria-selected={view === k} aria-controls="eq-panel" onClick={() => onView(k)}><b>{t}</b><small>{s}</small></button>)}</div>;
}

// ------------------------------------------------------------------------------------------------ Against their peers
export function PeersSection({ shares }: { shares: Share[] }) {
  const col = (label: "leader" | "in_line" | "laggard", title: string, tone: string) => {
    const xs = shares.filter((s) => s.peer?.label === label).sort((a, b) => a.peer!.rank / a.peer!.of - b.peer!.rank / b.peer!.of);
    return (
      <div className={"eq-pc eq-pc-" + tone}><p className="eq-pc-h"><b>{title}</b><span>{xs.length}</span></p>
        <ul>{xs.map((s) => <li key={s.symbol}><b>{s.symbol}</b> · {s.peer!.rank} of {s.peer!.of} {s.peer!.group}<small>{peerLine(s)}</small></li>)}</ul>
        {!xs.length && <p className="sp-note">None.</p>}</div>);
  };
  return (
    <Section id="eq-peers" title="Against their peers" help="Against their peers. Each share's price over the last 12 months against similar companies (its peer group) and its sector index. Leader: among the strongest of its group and ahead of the index. Laggard: among the weakest and behind it. It describes the past, not the future."
      sub="For each share: was it among the strongest or the weakest of similar companies over the last 12 months?"
      why="A share can rise 20% and still be a weak pick if similar companies rose 60%. Comparing each share with its own peer group shows whether your shares are the strong ones in each group, and which of them trail their group.">
      <p className="sp-lead eq-lead">{peerSentence(shares)}</p>
      <div className="eq-pcs">{col("leader", "Leaders", "good")}{col("in_line", "In line", "mid")}{col("laggard", "Laggards", "bad")}</div>
      <Cards items={peerCards(shares)} />
      <LeaderCompare shares={shares} />
    </Section>
  );
}
type LeadOn = Extract<Leadership, { available: true }>;
function LeaderCompare({ shares }: { shares: Share[] }) {
  const lag = shares.filter((s) => s.peer?.label === "laggard").slice(0, 4);
  const leads = useQueries({ queries: lag.map((s) => ({ queryKey: ["leadership", s.symbol], queryFn: () => apiGet<Leadership>(`/api/stocks/${encodeURIComponent(s.symbol)}/leadership`), staleTime: 15 * 60_000, retry: false })) });
  const leaderOf = lag.map((s, i) => { const d = leads[i].data; if (!d || !d.available) return null; const top = (d as LeadOn).peers.find((p) => p.rank === 1); return top && top.symbol !== s.symbol ? { mine: s, top, me: (d as LeadOn).peers.find((p) => p.symbol === s.symbol) } : null; });
  const syms = [...new Set(leaderOf.flatMap((x) => (x ? [x.mine.symbol, x.top.symbol] : [])))];
  const hist = useQueries({ queries: syms.map((s) => ({ queryKey: ["leadership-history", s], queryFn: () => apiGet<LeadHistory>(`/api/stocks/${encodeURIComponent(s)}/leadership-history`), staleTime: 15 * 60_000, retry: false })) });
  const histOf = new Map(syms.map((s, i) => [s, hist[i].data]));
  const year = (s: string): { d: string[]; v: number[] } | null => {
    const h = histOf.get(s)?.series; if (!h) return null;
    const xs = h.dates.map((d, i) => ({ d, v: h.stock[i] })).filter((x): x is { d: string; v: number } => x.v != null).slice(-53);
    if (xs.length < 30) return null;
    const b = xs[0].v; return { d: xs.map((x) => x.d), v: xs.map((x) => (x.v / b) * 100) };
  };
  const pairs = leaderOf.flatMap((x) => { if (!x) return []; const a = year(x.mine.symbol), b = year(x.top.symbol); return a && b ? [{ x, a, b }] : []; });
  if (!lag.length) return null;
  const info: LeaderPair[] = pairs.map(({ x, a, b }) => ({ symbol: x.mine.symbol, leader: x.top.symbol, group: x.mine.peer!.group, mine: a.v[a.v.length - 1] * 1000, theirs: b.v[b.v.length - 1] * 1000,
    leaderBigger: x.top.marketCap != null && x.me?.marketCap != null ? x.top.marketCap >= x.me.marketCap / 3 : null, nextWeek: x.mine.peer!.raw, gaining: x.mine.peer!.direction === "gaining" }));
  const W = 200, H = 90, rupee = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
  const line = (v: number[], lo: number, hi: number) => v.map((y, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * W).toFixed(1)},${(H - ((y - lo) / (hi - lo || 1)) * H).toFixed(1)}`).join("");
  const mon = (d: string) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+d.slice(5, 7) - 1];
  return (
    <div className="eq-lead-cmp">
      <h3>What if you had owned the group leader instead?<Tip text="Each of your laggards against the share ranked first in its own peer group, over the last 12 months of weekly closes. Both lines start at 100: the leader is the one that did best in that time, which is known only afterwards." label="About the group-leader comparison" /></h3>
      <p className="sp-sub">Your {lag.length === 1 ? "laggard" : `${lag.length} laggards`} against the #1 share of {lag.length === 1 ? "its" : "their"} own peer group, over the last 12 months. Both lines start at 100.</p>
      {!pairs.length ? <p className="sp-note">{leads.some((q) => q.isLoading) || hist.some((q) => q.isLoading) ? "Loading the prices…" : "The weekly prices for this comparison are not available yet."}</p> : <>
        <div className="eq-lc">{pairs.map(({ x, a, b }, i) => { const lo = Math.min(...a.v, ...b.v), hi = Math.max(...a.v, ...b.v); return (
          <div key={x.mine.symbol} className="eq-lc-c">
            <p className="sp-note">Group: {x.mine.peer!.group}</p>
            <p className="eq-lc-t"><b className="sp-red">{x.mine.symbol}</b> vs group #1 <b className="sp-good">{x.top.symbol}</b></p>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`₹1 lakh a year ago: ${rupee(info[i].mine)} in ${x.mine.symbol}, ${rupee(info[i].theirs)} in ${x.top.symbol}`}>
              <line x1={0} x2={W} y1={H - ((100 - lo) / (hi - lo || 1)) * H} y2={H - ((100 - lo) / (hi - lo || 1)) * H} className="eq-lc-base" />
              <path d={line(b.v, lo, hi)} className="eq-lc-top" fill="none" /><path d={line(a.v, lo, hi)} className="eq-lc-me" fill="none" />
            </svg>
            <p className="eq-lc-x"><span>{mon(a.d[0])}</span><span>{mon(a.d[a.d.length - 1])}</span></p>
            <div className="eq-lc-v"><span>₹1 lakh in {x.mine.symbol}<b className="sp-red">{rupee(info[i].mine)}</b></span><span>₹1 lakh in {x.top.symbol}<b className="sp-good">{rupee(info[i].theirs)}</b></span></div>
          </div>); })}</div>
        <Cards items={leaderCards(info)} />
      </>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Diversification
export function SpreadSection({ page, weights, counts, sizeCount, packs }: { page: PageObject; weights: Record<string, number>; counts: Record<string, string[]>; sizeCount: Record<Size, number>; packs: { members: string[]; avg: number; name: string }[] }) {
  const s = page.score, n = page.order.length, inds = Object.keys(counts).length, sizes = (["Large", "Mid", "Small"] as Size[]).filter((k) => sizeCount[k]).length;
  const weak = packs.find((p) => p.members.length >= 3);
  return (
    <Section id="eq-spread" title="How spread out is the list?" help="How spread out is the list? The diversification score (0 to 100) looks at how widely the shares spread across industries and sizes and how independently they move. Moves like counts shares that rise and fall together as one bet." sub="Two scores: how widely the money is spread, and how independently the shares move.">
      <div className="eq-dials">
        <div className="eq-dial"><span className="eq-dial-c" style={{ ["--v" as string]: s.score }}><b>{s.score}</b></span><div><b>{s.band}</b><p>{inds} {inds === 1 ? "industry" : "industries"} and {sizes === 3 ? "all three" : sizes} company sizes.{weak ? ` The one weak spot: ${weak.members.length} shares in the same industry.` : ""}</p></div></div>
        <div className="eq-dial"><span className="eq-dial-c t" style={{ ["--v" as string]: (s.effective_stocks / Math.max(1, n)) * 100 }}><b>{s.effective_stocks.toFixed(1)}</b></span><div><b>Moves like {s.effective_stocks.toFixed(1)} shares<Tip text="Moves like. Shares that rise and fall together count as one bet; this is how many independent shares the list behaves like." /></b><p>Your {n} shares with a full year of prices behave like about {s.effective_stocks.toFixed(1)} shares that move independently. Shares that rise and fall together count as one bet.</p></div></div>
      </div>
      <Cards items={spreadCards(weights, counts, sizeCount, packs)} />
    </Section>
  );
}
export function WhereSits({ weights, sizes }: { weights: Record<string, number>; sizes: { k: Size; pct: number; who: string[] }[] }) {
  const xs = Object.entries(weights).sort((a, b) => b[1] - a[1]), max = Math.max(1, ...xs.map((x) => x[1]));
  return (
    <section className="sp-sec eq-half" aria-labelledby="eq-where">
      <h2 id="eq-where">Where your list sits</h2><p className="sp-sub">Share of the list in each industry, if equal amounts were held.</p>
      <ul className="eq-bars">{xs.map(([k, v]) => <li key={k}><span>{k}</span><span className="t"><i style={{ width: `${(v / max) * 100}%` }} className={v >= 20 ? "hi" : ""} /></span><b>{pct(v)}</b></li>)}</ul>
      <p className="sp-cap">By company size<Tip text="Company size. FinLit uses three sizes everywhere, by market value: Large above ₹50,000 Cr, Mid ₹10,000 to 50,000 Cr, Small below ₹10,000 Cr." /></p>
      <div className="eq-sizebar" role="img" aria-label={sizes.map((s) => `${s.k} ${pct(s.pct)}`).join(", ")}>{sizes.map((s) => <i key={s.k} className={"s-" + s.k.toLowerCase()} style={{ flex: s.pct || 0.01 }} />)}</div>
      <ul className="eq-sizes">{sizes.map((s) => <li key={s.k}><i className={"s-" + s.k.toLowerCase()} aria-hidden="true" />{s.k} ({s.who.join(", ") || "none"}) <b>{pct(s.pct)}</b></li>)}</ul>
    </section>
  );
}
export function Packs({ packs, weights, n }: { packs: { members: string[]; avg: number; name: string }[]; weights: Record<string, number>; n: number }) {
  return (
    <Hideable id="portfolio.packs" title="What moves together">
      <section className="sp-sec eq-half" aria-labelledby="eq-packs">
        <h2 id="eq-packs">What moves together<Tip text="What moves together. Shares that tend to rise and fall together, worked out from a year of weekly prices. Shares in the same industry usually do." /></h2>
        <p className="sp-sub">Shares in the same industry usually rise and fall together. These are the packs in your list.</p>
        {!packs.length ? <p className="sp-note">No two shares in the list move closely together.</p> :
          <ul className="eq-packs">{packs.map((p) => <li key={p.members.join()}><p><b>{p.name} · {p.members.length} shares · {pct(weights[p.name] ?? (p.members.length / n) * 100)} of the list</b></p>
            <span className="eq-chips">{p.members.map((m) => <Link key={m} to={`/stocks/${m}`} className="eq-chip"><CoLogo symbol={m} size={18} inline />{m}</Link>)}</span>
            <small>They rise and fall together: {p.avg.toFixed(2)} on average.</small></li>)}</ul>}
        <Cards items={[{ kind: "insight", title: "To spread it further", text: "Industries not yet in the list spread it further than more shares of the ones already in it. Sector Rotation shows which industries lead." }]} />
      </section>
    </Hideable>
  );
}

/** The pack's second "What moves together": every pair of shares on one grid (darker = closer), the same-sector and different-sector tiles, and two cards. */
export function MovesGrid({ page, packs }: { page: PageObject; packs: { members: string[]; avg: number; name: string }[] }) {
  const o = page.order, seg = page.segments;
  const shade = (v: number) => ({ background: `color-mix(in srgb, var(--eq-heat) ${Math.round(Math.max(0, Math.min(1, v)) * 100)}%, var(--eq-heat0))`, color: v >= 0.5 ? "#fff" : undefined });
  return (
    <Section id="eq-grid" hide title="What moves together" help="How closely each pair of shares moves, from a year of weekly prices: 0 means the two are unrelated; near 1, they rise and fall as one."
      sub={`${o.length} shares move like ${page.score.effective_stocks.toFixed(1)} independent ones. Darker cells: the two shares rise and fall together more closely.`}>
      <div className="eq-gridrow">
        <div>
          <Scroll label="how closely each pair of shares moves"><table className="eq-heat">
            <thead><tr><td />{o.map((c) => <th key={c} scope="col"><span>{c}</span></th>)}</tr></thead>
            <tbody>{o.map((r, i) => <tr key={r}><th scope="row">{r}</th>{o.map((c, j) => i === j ? <td key={c} className="eq-self" aria-label={`${r} with itself`} />
              : <td key={c} style={shade(page.corr[i][j])} title={`${r} and ${c}: ${page.corr[i][j].toFixed(2)}`}>{corrCell(page.corr[i][j])}</td>)}</tr>)}</tbody>
          </table></Scroll>
          <p className="eq-heatkey">{([[0, "0, unrelated"], [0.42, "0.35–0.5"], [0.7, "0.65+, move almost as one"]] as const).map(([v, l]) => <span key={l}><i style={shade(v)} aria-hidden="true" />{l}</span>)}</p>
        </div>
        <div className="eq-gside">
          <div className="eq-segs">{([["Same sector", seg.same], ["Different sectors", seg.cross]] as const).map(([k, x]) => <div key={k} className="ip-tile"><p className="sp-cap">{k} · {x.pairs} {x.pairs === 1 ? "pair" : "pairs"}</p><b>{x.avg == null ? "–" : x.avg.toFixed(2)}</b><small>{x.avg == null ? "No pairs of this kind in the list." : segLine(x)}</small></div>)}</div>
          <Cards items={togetherCards(packs, seg.cross.avg)} />
        </div>
      </div>
    </Section>
  );
}

/** Style tilt: where the list's average share ranks among all the companies FinLit Prism rates, part by part (Gold). */
export function StyleTiltPack({ tilt }: { tilt: StyleTilt | undefined }) {
  if (!tilt) return null;
  if ("locked" in tilt) return <section className="sp-sec" aria-labelledby="eq-style"><h2 id="eq-style">Style tilt</h2><LockedBlock plan="gold" title="Style tilt is part of the Gold plan">{tilt.reason}</LockedBlock></section>;
  const rated = tilt.parts.some((p) => p.avgPercentile != null);
  return (
    <Section id="eq-style" hide title="Style tilt" sub="Where the list's average share ranks among all companies FinLit Prism rates. The darker band, 35th to 65th, reads as typical.">
      {!rated ? <p className="sp-note">None of these shares has a Prism rating yet, so there is no style tilt to show.</p> : <>
        <ul className="eq-tilt">{tilt.parts.map((p) => { const at = p.avgPercentile; return (
          <li key={p.part}><span>{p.part.replace(/ technical view$/i, " trend").replace(/^Short-term trend|^Long-term trend/, (x) => x)}</span>
            <span className="eq-tt" aria-hidden="true"><i className="band" />{at != null && <b style={{ left: `${at}%` }} />}</span>
            <span className="eq-tv">{at == null ? tiltRead(p) : <><b>{ordinal(Math.round(at))}</b> · {tiltRead(p)}</>}</span></li>); })}</ul>
        <p className="sp-note">{tilt.sentence ? tilt.sentence + " " : ""}Valuation: higher means cheaper. Risk: higher means lower risk.</p>
        {tilt.notRated.length > 0 && <p className="sp-note">Not rated by Prism yet, so left out: {tilt.notRated.join(", ")}.</p>}
      </>}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ Risk analytics
export function RiskGlance({ m, top3, shares, risk, money, day, to }: { m: MarketFig; top3: { symbols: string[]; risk: number; money: number } | null; shares: Share[]; risk: Record<string, number>; money: Record<string, number>; day: string; to: string }) {
  const l = riskLead(m, top3);
  return (
    <>
      <section className="sp-sec" aria-labelledby="eq-rg">
        <h2 id="eq-rg">Risk at a glance<Tip text="Risk at a glance. How the list has moved against the Nifty 50, from weekly prices over the last year, as if equal amounts were held." /></h2>
        <p className="sp-sub">If equal amounts were held · weekly prices to {new Date(to + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
        <p className="sp-lead"><b>{l.lead}</b>{l.rest}</p><p className="sp-note">{l.more}</p>
        <div className="eq-rtiles">{riskTiles(m).map((t) => <div key={t.k} className="ip-tile"><p className="sp-cap">{t.k}<Tip text={t.help} label={`About “${t.k}”`} /></p><b className="eq-rt-v">{t.v}<small>Nifty 50: {t.nifty}</small></b><small>{t.sub}</small></div>)}</div>
      </section>
      <Cards items={riskCards(shares, risk, money, day)} />
    </>
  );
}
export function MoneyRisk({ sw, sr, counts }: { sw: Record<string, number>; sr: Record<string, number>; counts: Record<string, string[]> }) {
  const xs = Object.keys(sw).sort((a, b) => (sr[b] ?? 0) - (sr[a] ?? 0)), max = Math.max(1, ...xs.flatMap((k) => [sw[k] ?? 0, sr[k] ?? 0]));
  return (
    <Hideable id="portfolio.moneyrisk" title="Share of the money vs share of the risk">
      <section className="sp-sec eq-half" aria-labelledby="eq-mr">
        <h2 id="eq-mr">Share of the money vs share of the risk<Tip text="Share of the risk. How much of the list's ups and downs comes from each industry, against how much of the money is in it. Risky industries take more of the risk than of the money." /></h2>
        <p className="sp-sub">Grey: share of the list. Colour: share of the ups and downs. Red rows carry far more risk than money.</p>
        <table className="sp-tb eq-mrt"><thead><tr><th scope="col">Industry</th><th scope="col" /><th scope="col" className="r">Money</th><th scope="col" className="r">Risk</th></tr></thead>
          <tbody>{xs.map((k) => { const a = sw[k] ?? 0, r = sr[k] ?? 0, hot = r > a * 1.4 && r - a >= 3; return (
            <tr key={k} className={hot ? "hot" : ""}><th scope="row">{k}{(counts[k]?.length ?? 0) > 1 ? ` (${counts[k].length})` : ""}</th>
              <td className="eq-mrb"><i className="m" style={{ width: `${(a / max) * 100}%` }} /><i className={"r" + (hot ? " hot" : "")} style={{ width: `${(r / max) * 100}%` }} /></td>
              <td className="r">{a.toFixed(1)}%</td><td className={"r" + (hot ? " sp-red" : "")}><b>{r.toFixed(1)}%</b></td></tr>); })}</tbody></table>
      </section>
    </Hideable>
  );
}
export function MarketFall({ beta }: { beta: number }) {
  const v = beta * 10;
  return (
    <Hideable id="portfolio.fall" title="If the market fell 10%">
      <section className="sp-sec eq-half" aria-labelledby="eq-fall">
        <h2 id="eq-fall">If the market fell 10%<Tip text={`A rough guide from the list's beta: if the Nifty 50 fell 10%, a list with beta ${beta.toFixed(2)} would have tended to fall about ${v.toFixed(1)}%. Real falls are uneven.`} /></h2>
        <p className="sp-sub">A rough guide from the list's beta, using past weekly prices.</p>
        <ul className="eq-fall"><li><span>Nifty 50</span><span className="t"><i style={{ width: `${(10 / Math.max(10, v)) * 100}%` }} /></span><b>−10%</b></li>
          <li><span>Your list</span><span className="t"><i className="me" style={{ width: `${(v / Math.max(10, v)) * 100}%` }} /></span><b className="sp-red">about −{v.toFixed(1)}%</b></li></ul>
        <p className="sp-note">On ₹10 lakh, that is roughly ₹{(v / 10).toFixed(2)} lakh, against ₹1 lakh for the index. Real falls are uneven, so treat this as a size guide, not a forecast.</p>
        <Cards items={[{ kind: "insight", title: "What lowers it", text: "Fewer shares from the same pack, or more large companies. The red rows on the left show where the risk sits." }]} />
      </section>
    </Hideable>
  );
}
export function EachRisk({ shares, risk, money, day }: { shares: Share[]; risk: Record<string, number>; money: Record<string, number>; day: string }) {
  const xs = [...shares].sort((a, b) => (a.risk ?? 101) - (b.risk ?? 101));
  return (
    <Section id="eq-each" title="Each share's risk" help="Each share's risk. FinLit Prism's Risk part for each share (0 to 100; higher means lower risk), how far it is below its 1-year high and its move over the last month." sub="Highest risk first. Prism Risk runs 0 to 100; higher means lower risk.">
      <Scroll label="each share's risk"><table className="sp-tb eq-et">
        <thead><tr><th scope="col">Share</th><th scope="col">Size<Tip text="FinLit's three sizes, by market value: Large above ₹50,000 Cr, Mid ₹10,000 to 50,000 Cr, Small below ₹10,000 Cr." /></th><th scope="col">Prism risk<Tip text="FinLit Prism's Risk part: higher means lower risk. 70 and above reads as lower risk, below about 50 as higher risk." /></th>
          <th scope="col" className="r">Below 1-yr high<Tip text="How far the latest price is below the highest price of the last year." /></th><th scope="col" className="r">1 month</th><th scope="col">What stands out</th></tr></thead>
        <tbody>{xs.map((s) => { const w = riskWord(s.risk), big = risk[s.symbol] != null && money[s.symbol] != null && risk[s.symbol] > money[s.symbol] * 1.5; return (
          <tr key={s.symbol}><td><Link to={`/stocks/${s.symbol}`} className="ip-sym"><CoLogo symbol={s.symbol} size={24} inline /><span><b>{s.symbol}</b><small>{s.industry ?? ""}</small></span></Link></td>
            <td>{s.size ?? "–"}</td><td>{s.risk == null ? <span className="sp-nil">Not scored</span> : <span className={"eq-rk " + (w === "Higher risk" ? "hi" : w === "Medium" ? "mid" : "lo")}>{Math.round(s.risk)} · {w}</span>}</td>
            <td className="r">{s.below52 == null ? "–" : `${s.below52.toFixed(1)}%`}</td><td className={"r " + ((s.m1 ?? 0) >= 0 ? "sp-good" : "sp-red")}>{sp(s.m1)}</td><td className="eq-so">{standsOut(s, big, day)}</td></tr>); })}</tbody>
      </table></Scroll>
      <p className="sp-note">"What stands out" describes the figures; it is not advice.</p>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ What this means, in short
const TAG: Record<Reading["section"], string> = { where: "Where it sits", together: "Moves together", risk: "Risk", market: "Market", data: "Data" };
export function InShort({ items }: { items: Reading[] }) {
  const xs = useMemo(() => [...items].sort((a, b) => (a.section === "data" ? -1 : 0) - (b.section === "data" ? -1 : 0)), [items]);
  if (!xs.length) return null;
  return (
    <details className="sp-sec sp-fold eq-short" open>
      <summary><span><b className="sp-ft">What this means, in short</b><small>Written from your list's figures, if equal amounts were held</small></span><span className="sp-show eq-hs"><span className="o">Hide ▴</span><span className="c">Show ▾</span></span></summary>
      <table className="eq-st"><tbody>{xs.map((x) => <tr key={x.rule + x.text}><th scope="row">{TAG[x.section]}</th><td>{x.text}</td></tr>)}</tbody></table>
    </details>
  );
}
export function SizeFold({ counts }: { counts: Record<Size, number> }) {
  return (
    <details className="sp-sec sp-fold">
      <summary><span><b className="sp-ft">Company size: how FinLit defines it</b><small>{counts.Large ?? 0} large · {counts.Mid ?? 0} mid · {counts.Small ?? 0} small in your list</small></span><span className="sp-show">Show ▾</span></summary>
      <p className="sp-note">FinLit uses three sizes everywhere on the site, by market value: <b>Large</b> above ₹50,000 Cr, <b>Mid</b> ₹10,000 to 50,000 Cr, <b>Small</b> below ₹10,000 Cr. A company moves between sizes as its market value changes.</p>
    </details>
  );
}
export { PEER_WORD };
