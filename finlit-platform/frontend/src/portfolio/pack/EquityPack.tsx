// The Equity portfolio's sections as the "FinLit final pages" pack draws them (docs/design/finlit-final-pages/12-14): the score tiles, the three tabs, Against their peers
// with the group-leader comparison, How spread out is the list?, Where your list sits, the packs that move together, Risk at a glance, Share of the money vs share of the risk,
// If the market fell 10%, Each share's risk, and What this means, in short. Figures are the server's; words from lib/equityPack. Describes; never advice.
import { useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { useQueries } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { Scroll, Section, Tip } from "../../components/sectors/pack/Common";
import type { LeadHistory, Leadership } from "../../lib/leadership";
import {
  leaderCards, peerCards, trendCards, peerLine, peerSentence, PEER_WORD,
  type LeaderPair, type Share, type Size,
} from "../../lib/equityPack";
import type { Reading } from "../types";
import type { StyleTilt } from "../../components/diversification/types";
import { ordinal, tiltRead } from "../../components/diversification/wording";
import { LockedBlock } from "../../components/sectors/Parts";
import { DashCards, DashCardsProvider, OpenAll } from "../../components/dashboard/DashCards";
import { useAuth } from "../../lib/auth";
import type { Card } from "../../lib/pulsePack";
import type { TrendRead } from "../../lib/mfPortfolio";


// ------------------------------------------------------------------------------------------------ the score
export type View = "portfolio" | "diversification" | "risk";
export function ViewTabs({ view, onView, n }: { view: View; onView: (v: View) => void; n: number }) {
  const tabs: [View, string, string][] = [["portfolio", "Portfolio", `Your ${n} shares, their scores and how they compare with peers`], ["diversification", "Diversification analytics", "How spread out the list is, and what moves together"], ["risk", "Risk analytics", "How much it swings, what drives the risk, what a fall could mean"]];
  return <div className="eq-tabs" role="tablist" aria-label="Equity portfolio views">{tabs.map(([k, t, s]) => <button key={k} type="button" role="tab" id={`eq-tab-${k}`} aria-selected={view === k} aria-controls="eq-panel" onClick={() => onView(k)}><b>{t}</b><small>{s}</small></button>)}</div>;
}

// ------------------------------------------------------------------------------------------------ shared on this page (task #183)
/** "SKYGOLD, WHEELS, MEDANTA, RPEL +5 more ▾": the first names, then a button that shows the full list (the pack: every "and N more" is a control). */
export function More({ names, show = 4, empty = "–" }: { names: string[]; show?: number; empty?: string }) {
  const [open, setOpen] = useState(false), id = "eq-more-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!names.length) return <>{empty}</>;
  const rest = names.length - show;
  return <>{names.slice(0, show).join(", ")}{rest > 0 && <><span id={id} hidden={!open}>, {names.slice(show).join(", ")}</span> <button type="button" className="eq-more" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? "Show fewer ▴" : `+${rest} more ▾`}</button></>}</>;
}
/** A section's "N things to know": the dashboard's dropdown cards, closed on load, with one Open all / Close all (the pack: every insight card opens on click). */
export function Insights({ items, scope }: { items: Card[]; scope: string }) {
  const { user } = useAuth();
  if (!items.length) return null;
  return <DashCardsProvider userId={user?.id} remember={false}><div className="eq-ins">
    <div className="eq-ins-h"><span className="sp-cap">{items.length === 1 ? "One thing to know" : `${num(items.length)} things to know`}</span><OpenAll scope={scope} n={items.length} /></div>
    <DashCards items={items} scope={scope} cols={Math.min(3, items.length)} />
  </div></DashCardsProvider>;
}
const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const num = (n: number) => (n <= 10 ? NUM[n] : String(n));
/** The dashed card Silver sees in place of a Gold-only section, with the section's own title and line (the pack's lock card). */
export function GoldLock({ id, title, text }: { id: string; title: string; text: string }) {
  return <section className="sp-sec eq-lock" aria-labelledby={id}><span className="sp-cap">Gold and up</span><h2 id={id}>{title} <span aria-hidden="true">🔒</span></h2><p className="sp-sub">{text} Available on Gold. <Link to="/plans">See plans</Link></p></section>;
}

// ------------------------------------------------------------------------------------------------ Short- and long-term trend (Gold)
const ST_COLS: [string, string][] = [["-1", "↓ Down"], ["0", "→ Sideways"], ["1", "↑ Up"]];
const LT_ROWS: [string, string][] = [["1", "↑ Up"], ["0", "→ Sideways"], ["-1", "↓ Down"]];
const BIZ: [keyof TrendRead["business"], string, string, string][] = [
  ["strong_up", "g", "Business and price agree (strong)", "Prism 65 or above, long-term uptrend"], ["strong_down", "m", "Price behind the business", "Prism 65 or above, long-term downtrend"],
  ["weak_up", "m", "Price ahead of the business", "Prism below 50, long-term uptrend"], ["weak_down", "b", "Business and price agree (weak)", "Prism below 50, long-term downtrend"]];
/** The pack's trend card: a matrix of the short-term trend (across) against the long-term one (down), each cell with its names (4, then "+N more ▾"), and the
 *  Business and price lists beside it. Counts, names and shares are the server's (POST /api/portfolio/trend); every share counts the same. */
export function TrendSection({ t, shares }: { t: TrendRead; shares: Share[] }) {
  const pc0 = (x: number) => `${Math.round(x * 100)}%`, stocks = (n: number) => `${n} ${n === 1 ? "stock" : "stocks"}`;
  const none = shares.filter((s) => s.lt == null).map((s) => s.symbol);
  return (
    <Section id="eq-trend" hide title="Short- and long-term trend" help="Where each share's short-term price trend sits against its long-term one, from FinLit Prism's technical view." how="Across: the short-term trend, down to up. Down the side: the long-term trend, up to down. It describes past prices, not what comes next."
      sub={<>{t.rated} of {t.n} {t.n === 1 ? "stock" : "stocks"} rated, from FinLit Prism's technical views. Where each share's short-term trend sits against its long-term one.{none.length ? <> {none.length <= 6 ? list2(none) : <More names={none} />} {none.length === 1 ? "has" : "have"} no long-term reading yet.</> : null}</>}>
      {!t.rated ? <p className="sp-empty">None of the shares in your list has a stored FinLit Prism trend reading yet.</p> : <div className="eq-tr">
        <div className="eq-tm">
          <p className="eq-tm-x">Short-term trend →<Tip text="The share's price trend over the last few weeks." how="Read across: from down on the left to up on the right." label="About the short-term trend" /></p>
          <p className="eq-tm-y">Long-term trend ↓<Tip text="The share's price trend over the last year." how="Read down the side: from up at the top to down at the bottom." label="About the long-term trend" /></p>
          <Scroll label="trend matrix"><table className="eq-tg"><thead><tr><th><span className="sr-only">Long-term trend</span></th>{ST_COLS.map(([k, l]) => <th key={k} scope="col">{l}</th>)}</tr></thead>
            <tbody>{LT_ROWS.map(([r, rl]) => <tr key={r}><th scope="row">{rl}</th>{ST_COLS.map(([c]) => { const g = t.grid[`${r},${c}`]; return <td key={c} className={"eq-tg-c t" + (+r + +c)}>
              <b>{g?.name ?? "–"}</b><small>{stocks(g?.n ?? 0)} · {pc0(g?.share ?? 0)}</small><em><More names={g?.symbols ?? []} /></em></td>; })}</tr>)}</tbody></table></Scroll>
        </div>
        <div className="eq-bp">
          <p className="eq-bp-h"><b>Business and price</b><Tip text="The business, from the FinLit Prism score, beside the price, from the long-term trend." how="65 or above is a strong business, below 50 a weak one; shares in between are counted under the list. Where the two disagree, the price has run ahead of the business or fallen behind it." label="About Business and price" /></p>
          {BIZ.map(([k, tone, label, rule]) => { const b = t.business[k]; return <div key={k} className={"eq-bpr " + tone}>
            <p className="eq-bpr-t"><b>{label}</b><b>{pc0(b.share)}</b></p><small>{stocks(b.n)} · {rule}</small><small className="eq-bpr-n"><More names={b.symbols} /></small></div>; })}
          {t.between != null && <p className="sp-note">{t.between} of {t.rated} rated {t.rated === 1 ? "share sits" : "shares sit"} in between (Prism 50 to 64, or a sideways trend).</p>}
        </div>
      </div>}
      <Insights items={trendCards(t)} scope="eq.trend" />
    </Section>
  );
}
const list2 = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// ------------------------------------------------------------------------------------------------ Against their peers (Gold)
/** Three columns (Leaders, In line, Laggards): 3 shares each, then "Show all N ▾" (the pack). */
export function PeersSection({ shares }: { shares: Share[] }) {
  const [all, setAll] = useState<Record<string, boolean>>({});
  const col = (label: "leader" | "in_line" | "laggard", title: string, tone: string) => {
    const xs = shares.filter((s) => s.peer?.label === label).sort((a, b) => a.peer!.rank / a.peer!.of - b.peer!.rank / b.peer!.of), open = !!all[label];
    return (
      <div className={"eq-pc eq-pc-" + tone}><p className="eq-pc-h"><b>{title}</b><span>{xs.length}</span></p>
        <ul id={"eq-pc-" + label}>{(open ? xs : xs.slice(0, 3)).map((s) => <li key={s.symbol}><b>{s.symbol}</b> · {s.peer!.rank} of {s.peer!.of} {s.peer!.group}<small>{peerLine(s)}</small></li>)}</ul>
        {xs.length > 3 && <button type="button" className="eq-more" aria-expanded={open} aria-controls={"eq-pc-" + label} onClick={() => setAll({ ...all, [label]: !open })}>{open ? "Show fewer ▴" : `Show all ${xs.length} ▾`}</button>}
        {!xs.length && <p className="sp-note">None.</p>}</div>);
  };
  return (
    <Section id="eq-peers" hide title="Against their peers" help="Each share's price over the last 12 months against similar companies (its peer group) and its sector index." how="Leader: among the strongest of its group and ahead of the index. Laggard: among the weakest and behind it. It describes the past, not the future."
      sub="For each share: was it among the strongest or the weakest of similar companies over the last 12 months?"
      why="A share can rise 20% and still be a weak pick if similar companies rose 60%. Comparing each share with its own peer group shows whether your shares are the strong ones in each group, and which of them trail their group.">
      <p className="sp-lead eq-lead">{peerSentence(shares)}</p>
      <div className="eq-pcs">{col("leader", "Leaders", "good")}{col("in_line", "In line", "mid")}{col("laggard", "Laggards", "bad")}</div>
      <Insights items={peerCards(shares)} scope="eq.peers" />
    </Section>
  );
}
/** "What if you had owned the group leader instead?" (Gold): its own section after Against their peers, with its own chip in the sections bar (the pack). */
export function LeadersSection({ shares }: { shares: Share[] }) {
  if (!shares.some((s) => s.peer?.label === "laggard")) return null;
  return (
    <Section id="eq-leaders" hide title="What if you had owned the group leader instead?" help="Each of your laggards against the share ranked first in its own peer group, over the last 12 months of weekly closes." how="Both lines start at 100: the gap is how far apart they ended. The leader is the one that did best in that time, which is known only afterwards."
      why="A laggard can still be a fine business. Seeing how far the group's best share went shows the size of the gap, and prompts the question: the business, the price paid, or something temporary?">
      <LeaderCompare shares={shares} />
    </Section>
  );
}

type LeadOn = Extract<Leadership, { available: true }>;
function LeaderCompare({ shares }: { shares: Share[] }) {
  // the weakest laggards first (lowest place in their group); 3 shown, the rest on "Show all N ▾", their prices fetched only when shown
  const lagAll = shares.filter((s) => s.peer?.label === "laggard").sort((a, b) => b.peer!.rank / b.peer!.of - a.peer!.rank / a.peer!.of || a.symbol.localeCompare(b.symbol));
  const [all, setAll] = useState(false);
  const lag = all ? lagAll : lagAll.slice(0, 3);
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
  const mon = (d: string) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
  return (
    <div className="eq-lead-cmp">
      <p className="sp-sub">Your {lag.length === 1 ? "weakest laggard" : `${num(lag.length)} weakest laggards`} against the #1 share of {lag.length === 1 ? "its" : "their"} own peer group, over the last 12 months. Both lines start at 100.</p>
      {!pairs.length ? <p className="sp-note">{leads.some((q) => q.isLoading) || hist.some((q) => q.isLoading) ? "Loading the prices…" : "The weekly prices for this comparison are not available yet."}</p> : <>
        <div className="eq-lc">{pairs.map(({ x, a, b }, i) => { const lo = Math.min(...a.v, ...b.v), hi = Math.max(...a.v, ...b.v); return (
          <div key={x.mine.symbol} className="eq-lc-c">
            <p className="sp-note">Peer group: {x.mine.peer!.group}</p>
            <p className="eq-lc-t"><b className="sp-red">{x.mine.symbol}</b> vs group #1 <b className="sp-good">{x.top.symbol}</b></p>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`₹1 lakh a year ago: ${rupee(info[i].mine)} in ${x.mine.symbol}, ${rupee(info[i].theirs)} in ${x.top.symbol}`}>
              <line x1={0} x2={W} y1={H - ((100 - lo) / (hi - lo || 1)) * H} y2={H - ((100 - lo) / (hi - lo || 1)) * H} className="eq-lc-base" />
              <path d={line(b.v, lo, hi)} className="eq-lc-top" fill="none" /><path d={line(a.v, lo, hi)} className="eq-lc-me" fill="none" />
            </svg>
            <p className="eq-lc-x"><span>{mon(a.d[0])}</span><span>{mon(a.d[a.d.length - 1])}</span></p>
            <div className="eq-lc-v"><span>₹1 lakh in {x.mine.symbol}<b className="sp-red">{rupee(info[i].mine)}</b></span><span>₹1 lakh in {x.top.symbol}<b className="sp-good">{rupee(info[i].theirs)}</b></span></div>
          </div>); })}</div>
        {(() => { const drawn = new Set(pairs.map((p) => p.x.mine.symbol)), busy = leads.some((q) => q.isLoading) || hist.some((q) => q.isLoading);
          const left = busy ? [] : lag.filter((s) => !drawn.has(s.symbol));   // a blank says why (the pack's rule)
          return left.length ? <p className="sp-note">No comparison for {list2(left.map((s) => s.symbol))}: {left.length === 1 ? "its group's #1 or a year of its weekly prices is" : "their group's #1 or a year of their weekly prices is"} not available yet.</p> : null; })()}
        {lagAll.length > 3 && <button type="button" className="eq-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show the 3 weakest ▴" : `Show all ${lagAll.length} laggards ▾`}</button>}
        <Insights items={leaderCards(info)} scope="eq.leaders" />
      </>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Diversification analytics: DivPack.tsx (task #183 W7)
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

// ------------------------------------------------------------------------------------------------ Risk analytics: RiskPack.tsx (task #183 W8)

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
