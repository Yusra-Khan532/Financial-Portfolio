// The Equity portfolio's sections as the "FinLit final pages" pack draws them (docs/design/finlit-final-pages/12-14): the score tiles, the three tabs, Against their peers
// with the group-leader comparison, How spread out is the list?, Where your list sits, the packs that move together, Risk at a glance, Share of the money vs share of the risk,
// If the market fell 10%, Each share's risk, and What this means, in short. Figures are the server's; words from lib/equityPack. Describes; never advice.
import { useEffect, useId, useMemo, useState } from "react";
import { POINTS_NOTE, coName, namesInText, pointsLine } from "../shared";
import { Link } from "react-router";
import { useQueries } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { Scroll, Section, Tip } from "../../components/sectors/pack/Common";
import type { LeadHistory, Leadership } from "../../lib/leadership";
import {
  leaderCards, peerCards, trendCards, peerLine, peerSentence, PEER_WORD,
  type LeaderPair, type Share, type Size,
  type Voice,
} from "../../lib/equityPack";
import type { Reading } from "../types";
import type { StyleTilt } from "../../components/diversification/types";
import { ordinal, tiltRead } from "../../components/diversification/wording";
import { LockedBlock } from "../../components/sectors/Parts";
import { DashCards, DashCardsProvider, OpenAll } from "../../components/dashboard/DashCards";
import { useAuth } from "../../lib/auth";
import type { Card } from "../../lib/pulsePack";
import type { TrendRead } from "../../lib/mfPortfolio";
import { VIEW_COLOR, VIEW_ICON, ViewTabsKit, type ViewDef } from "../ViewKit";
import { coTitle, shortLabel } from "../../lib/companyLabel";


// ------------------------------------------------------------------------------------------------ the score
export type View = "portfolio" | "diversification" | "risk";
/** The three views (task #235, pack B2): a colour and an icon each; the same list drives the sticky switcher (B12). */
export const eqViews = (n: number): ViewDef<View>[] => [
  { id: "portfolio", label: "Portfolio", short: "Portfolio", sub: `Your ${n} ${n === 1 ? "share" : "shares"}, their scores and how they compare with peers`, color: VIEW_COLOR.first, icon: VIEW_ICON.case },
  { id: "diversification", label: "Diversification analytics", short: "Diversification", sub: "How spread out the list is, and what moves together", color: VIEW_COLOR.second, icon: VIEW_ICON.pie },
  { id: "risk", label: "Risk analytics", short: "Risk", sub: "How much it swings, what drives the risk, what a fall could mean", color: "#a24a17", icon: VIEW_ICON.pulse },   // task #274 (change 11): the darker orange reads 4.5:1 or more on the bar (#b5541c was 4.2:1)
];
export function ViewTabs({ view, onView, n }: { view: View; onView: (v: View) => void; n: number }) {
  return <ViewTabsKit defs={eqViews(n)} view={view} onView={onView} label="Equity portfolio views" idp="eq-tab" panel="eq-panel" what="your list" />;
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
const ST_COLS: [string, string][] = [["1", "↑ Up"], ["0", "→ Sideways"], ["-1", "↓ Down"]];   // task #274 change 4: Up first, so "rising on both" is top-left
const LT_ROWS: [string, string][] = [["1", "↑ Up"], ["0", "→ Sideways"], ["-1", "↓ Down"]];
const SIDE_WORD: Record<string, string> = { "1": "Rising", "0": "Flat", "-1": "Falling" };
const BIZ: [keyof TrendRead["business"], string, string, string][] = [
  ["strong_up", "g", "Business and price agree (strong)", "Strong or Healthy Prism, long-term uptrend"], ["strong_down", "m", "Price behind the business", "Strong or Healthy Prism, long-term downtrend"],
  ["weak_up", "m", "Price ahead of the business", "Weak Prism, long-term uptrend"], ["weak_down", "b", "Business and price agree (weak)", "Weak Prism, long-term downtrend"]];   // task #385: words, not cut-offs
/** A Prism score as the In between reason gives it: whole, unless rounding would carry it across a line (64.9 stays 64.9, not 65). */
export const prismShown = (v: number) => { const r = Math.round(v); return (v < 65 && r >= 65) || (v < 50 && r >= 50) ? v.toFixed(1) : String(r); };
/** Company names as small chips, each a link to its report (task #274 change 5; same tab, middle-click opens a new one); a BSE-only company shows its name,
 *  not its code. The first `show`, then "+N more ▾" (a control, as every "and N more" on this page). `why` adds a reason to a chip ("TECHM · Prism 56"). */
export function CoChips({ syms, shares, show = 4, why, empty = "–", named = false }: { syms: string[]; shares: Share[]; show?: number; why?: (s: string) => string | null; empty?: string;
  /** task #385: the short company name (the Equity portfolio), not the share code */ named?: boolean }) {
  const [open, setOpen] = useState(false), id = "eq-cc-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!syms.length) return <>{empty}</>;
  const by = new Map(shares.map((s) => [s.symbol, s])), rest = syms.length - show;
  const chip = (sym: string) => { const s = by.get(sym) ?? { symbol: sym, name: null }, w = why?.(sym);
    return <Link key={sym} to={`/stocks/${encodeURIComponent(sym)}`} className="eq-co" title={coTitle(s)}>{named ? coName(s) : shortLabel(s)}{w && <span> · {w}</span>}</Link>; };
  return <span className="eq-cos">{syms.slice(0, show).map(chip)}{rest > 0 && <><span id={id} className="eq-cos" hidden={!open}>{syms.slice(show).map(chip)}</span>
    <button type="button" className="eq-more" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? "Show fewer ▴" : `+${rest} more ▾`}</button></>}</span>;
}
/** A sentence with every company of the list in it turned into a link to its report (task #274 change 5): the symbol, or a BSE-only company's short name. */
export function LinkNames({ text, shares }: { text: string; shares: Share[] }) {
  const by = new Map<string, string>();
  for (const s of shares) { by.set(shortLabel(s), s.symbol); by.set(coName(s), s.symbol); by.set(s.symbol, s.symbol); }
  const keys = [...by.keys()].filter(Boolean).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!keys.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(?<![\\w&])(${keys.join("|")})(?![\\w&])`, "g"));
  return <>{parts.map((x, i) => (i % 2 && by.has(x) ? <Link key={i} to={`/stocks/${encodeURIComponent(by.get(x)!)}`} className="eq-col">{x}</Link> : x))}</>;
}
/** The pack's trend card: a 3 × 3 matrix of the short-term trend (across) against the long-term one (down), Up first in both; each cell a big count with its
 *  share, its name, up to 4 names then "+N more ▾"; darker cells hold more, empty ones are muted. Beside it the Business and price boxes: the four, and In
 *  between, so every rated share is in exactly one. Counts, names and shares are the server's (POST /api/portfolio/trend); every share counts the same. */
export function TrendSection({ t, shares, voice = "own" }: { t: TrendRead; shares: Share[]; /** task #323: "list" on the Watchlists page */ voice?: Voice }) {
  const L = voice === "list", one = L ? "company" : "share";
  const pc0 = (x: number) => `${Math.round(x * 100)}%`, stocks = (n: number) => `${n} ${n === 1 ? "stock" : "stocks"}`;
  const none = shares.filter((s) => s.lt == null).map((s) => s.symbol);
  // QA 23 Nov (item 19): the reason chip uses the page's own Prism for the share (the value the table shows), not the trend answer's separate copy,
  // so "RELIANCE · Prism 58" agrees with the table's 58; the trend answer's figure is the fallback for a share the page has no score for yet.
  const own = new Map(shares.map((s) => [s.symbol, s.prism]));
  const mid = t.betweenList, why = new Map((mid?.items ?? []).map((x) => { const v = own.get(x.symbol) ?? x.prism;
    return [x.symbol, [v != null ? `Prism ${prismShown(v)}` : "not scored", x.flat ? "flat trend" : ""].filter(Boolean).join(" · ")]; }));
  return (
    <Section id="eq-trend" hide title="Short- and long-term trend" help={`Where each ${one}'s short-term price trend sits against its long-term one, from FinLit Prism's technical view.`} how="Across: the short-term trend, up to down. Down the side: the long-term trend, up to down. Rising on both is top-left. It describes past prices, not what comes next."
      sub={<>{t.rated} of {t.n} {t.n === 1 ? "stock" : "stocks"} rated, from FinLit Prism's technical views. Where each {one}'s short-term trend sits against its long-term one.{none.length ? <> <CoChips named={!L} syms={none} shares={shares} show={6} /> {none.length === 1 ? "has" : "have"} no long-term reading yet.</> : null}</>}>
      {!t.rated ? <p className="sp-empty">{L ? "None of the companies on this list has" : "None of the shares in your list has"} a stored FinLit Prism trend reading yet.</p> : <div className="eq-tr">
        <div className="eq-tm">
          <p className="eq-tm-x">Short-term trend →<Tip text="The share's price trend over the last few weeks." how="Read across: from up on the left to down on the right." label="About the short-term trend" /></p>
          <p className="eq-tm-y">Long-term trend ↓<Tip text="The share's price trend over the last year." how="Read down the side: from up at the top to down at the bottom." label="About the long-term trend" /></p>
          <Scroll label="trend matrix"><table className="eq-tg" aria-label="Trend matrix: long-term trend down the side, short-term trend across"><thead><tr><th><span className="sr-only">Long-term trend</span></th>{ST_COLS.map(([k, l]) => <th key={k} scope="col">{l}</th>)}</tr></thead>
            <tbody>{LT_ROWS.map(([r, rl]) => <tr key={r}><th scope="row">{rl}</th>{ST_COLS.map(([c]) => { const g = t.grid[`${r},${c}`], n = g?.n ?? 0, sh = g?.share ?? 0;
              return <td key={c} className={"eq-tg-c t" + (+r + +c) + (n ? "" : " e")} style={{ ["--k" as string]: `${Math.round(8 + Math.min(1, sh / 0.4) * 30)}%` }}>
                <p className="eq-tg-n"><b>{n}</b><span>{pc0(sh)}</span></p><p className="eq-tg-w">{g?.name ?? "–"}<span className="sr-only"> (Long term {SIDE_WORD[r]}, Short term {SIDE_WORD[c]}): {stocks(n)}</span></p>
                {n > 0 && <CoChips named={!L} syms={g?.symbols ?? []} shares={shares} />}</td>; })}</tr>)}</tbody></table></Scroll>
        </div>
        <div className="eq-bp" role="group" aria-label="Business and price">
          <p className="eq-bp-h"><b>Business and price</b><Tip text="The business, from the FinLit Prism score, beside the price, from the long-term trend." how="A Strong or Healthy Prism is a strong business, a Weak Prism a weak one. Where the two disagree, the price has run ahead of the business or fallen behind it. Shares in neither, an Average Prism or a flat long-term trend, are In between." label="About Business and price" /></p>
          {BIZ.map(([k, tone, label, rule]) => { const b = t.business[k]; return <div key={k} className={"eq-bpr " + tone + (b.n ? "" : " e")}>
            <p className="eq-bpr-t"><b>{label}</b><b>{pc0(b.share)}</b></p><small>{stocks(b.n)} · {rule}</small><div className="eq-bpr-n"><CoChips named={!L} syms={b.symbols} shares={shares} empty={L ? "None on this list right now." : "None of your shares right now."} /></div></div>; })}
          {mid ? <div className={"eq-bpr n" + (mid.n ? "" : " e")}>
            <p className="eq-bpr-t"><b>In between</b><b>{pc0(mid.share)}</b></p><small>{stocks(mid.n)} · Average Prism, or a flat long-term trend</small>
            <div className="eq-bpr-n"><CoChips named={!L} syms={mid.items.map((x) => x.symbol)} shares={shares} show={8} why={(s) => why.get(s) ?? null} /></div></div>
            : t.between != null && <p className="sp-note">{t.between} of {t.rated} rated {t.rated === 1 ? `${one} sits` : `${L ? "companies" : "shares"} sit`} in between (an Average Prism, or a flat long-term trend).</p>}
        </div>
      </div>}
      <Insights items={named(trendCards(t, (x) => { const s = shares.find((y) => y.symbol === x); return s ? (L ? shortLabel(s) : coName(s)) : x; }, voice), shares, voice)} scope="eq.trend" />
    </Section>
  );
}
/** Task #385 (developer file 33, live bug 18): share codes in the "things to know" sentences become short names on the Equity portfolio. */
const nameMap = (shares: { symbol: string; name?: string | null }[]) => new Map(shares.map((x) => [x.symbol, coName(x)]));
function named(cards: Card[], shares: { symbol: string; name?: string | null }[], voice: Voice): Card[] {
  if (voice === "list") return cards;
  const m = nameMap(shares);
  return cards.map((c) => ({ ...c, title: namesInText(c.title, m), text: namesInText(c.text, m) }));
}
/** "Beat the Nifty Auto by 46.6 points over 12 months · weakening lately" (task #385: no "pts"). */
const peerWords = (s: Share) => (!s.peer ? "" : [s.peer.vs == null ? "" : pointsLine(s.peer.vs, s.peer.bench), s.peer.direction ? `${s.peer.direction === "gaining" ? "gaining" : "weakening"} lately` : ""].filter(Boolean).join(" · "));
const list2 = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// ------------------------------------------------------------------------------------------------ Against their peers (Gold)
/** Three columns (Leaders, In line, Laggards): 3 shares each, then "Show all N ▾" (the pack). */
export function PeersSection({ shares, voice = "own" }: { shares: Share[]; voice?: Voice }) {
  const L = voice === "list";
  const [all, setAll] = useState<Record<string, boolean>>({});
  const col = (label: "leader" | "in_line" | "laggard", title: string, tone: string) => {
    const xs = shares.filter((s) => s.peer?.label === label).sort((a, b) => a.peer!.rank / a.peer!.of - b.peer!.rank / b.peer!.of), open = !!all[label];
    return (
      <div className={"eq-pc eq-pc-" + tone}><p className="eq-pc-h"><b>{title}</b><span>{xs.length}</span></p>
        <ul id={"eq-pc-" + label}>{(open ? xs : xs.slice(0, 3)).map((s) => <li key={s.symbol}><Link to={`/stocks/${encodeURIComponent(s.symbol)}`} className="eq-col" title={coTitle(s)}>{L ? shortLabel(s) : coName(s)}</Link> · {s.peer!.rank} of {s.peer!.of} {s.peer!.group}<small>{L ? peerLine(s) : peerWords(s)}</small></li>)}</ul>
        {xs.length > 3 && <button type="button" className="eq-more" aria-expanded={open} aria-controls={"eq-pc-" + label} onClick={() => setAll({ ...all, [label]: !open })}>{open ? "Show fewer ▴" : `Show all ${xs.length} ▾`}</button>}
        {!xs.length && <p className="sp-note">None.</p>}</div>);
  };
  return (
    <Section id="eq-peers" hide title="Against their peers" help="Each share's price over the last 12 months against similar companies (its peer group) and its sector index." how="Leader: among the strongest of its group and ahead of the index. Laggard: among the weakest and behind it. It describes the past, not the future."
      sub={`For each ${L ? "company on the list" : "share"}: was it among the strongest or the weakest of similar companies over the last 12 months?`}
      why={L ? "A share can rise 20% and still trail if similar companies rose 60%. Comparing each company with its own peer group shows which companies on this list are the strong ones in each group, and which of them trail their group."
        : "A share can rise 20% and still be a weak pick if similar companies rose 60%. Comparing each share with its own peer group shows whether your shares are the strong ones in each group, and which of them trail their group."}>
      <p className="sp-lead eq-lead"><LinkNames text={L ? peerSentence(shares, voice) : namesInText(peerSentence(shares, voice), nameMap(shares))} shares={shares} /></p>
      <div className="eq-pcs">{col("leader", "Leaders", "good")}{col("in_line", "In line", "mid")}{col("laggard", "Laggards", "bad")}</div>
      {!L && <p className="eq-ptn">{POINTS_NOTE}</p>}
      <Insights items={named(peerCards(shares, voice), shares, voice)} scope="eq.peers" />
    </Section>
  );
}
/** "What if you had owned the group leader instead?" (Gold): its own section after Against their peers, with its own chip in the sections bar (the pack). */
export function LeadersSection({ shares, voice = "own", onLine }: { shares: Share[]; voice?: Voice; /** task #385: the phone's folded summary line ("₹1 lakh in A is now ₹63,039; in B, ₹2,50,552") */ onLine?: (s: string) => void }) {
  if (!shares.some((s) => s.peer?.label === "laggard")) return null;
  const L = voice === "list";
  return (
    <Section id="eq-leaders" hide title={L ? "The weakest on this list against their group leader" : "What if you had owned the group leader instead?"} help={`Each of ${L ? "the laggards on this list" : "your laggards"} against the share ranked first in its own peer group, over the last 12 months of weekly closes.`} how="Both lines start at 100: the gap is how far apart they ended. The leader is the one that did best in that time, which is known only afterwards."
      why="A laggard can still be a fine business. Seeing how far the group's best share went shows the size of the gap, and prompts the question: the business, the price paid, or something temporary?">
      <LeaderCompare shares={shares} voice={voice} onLine={onLine} />
    </Section>
  );
}

type LeadOn = Extract<Leadership, { available: true }>;
function LeaderCompare({ shares, voice = "own", onLine }: { shares: Share[]; voice?: Voice; onLine?: (s: string) => void }) {
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
  const first = pairs[0] ? `₹1 lakh in ${coName(pairs[0].x.mine)} is now ${rupee(info[0].mine)}; in ${coName(pairs[0].x.top)}, ${rupee(info[0].theirs)}` : "";
  useEffect(() => { if (first) onLine?.(first); }, [first]);   // eslint-disable-line react-hooks/exhaustive-deps
  const line = (v: number[], lo: number, hi: number) => v.map((y, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * W).toFixed(1)},${(H - ((y - lo) / (hi - lo || 1)) * H).toFixed(1)}`).join("");
  const mon = (d: string) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
  return (
    <div className="eq-lead-cmp">
      <p className="sp-sub">{voice === "list" ? (lag.length === 1 ? "The weakest laggard on this list" : `The ${num(lag.length)} weakest laggards on this list`) : `Your ${lag.length === 1 ? "weakest laggard" : `${num(lag.length)} weakest laggards`}`} against the #1 share of {lag.length === 1 ? "its" : "their"} own peer group, over the last 12 months. Both lines start at 100.</p>
      {!pairs.length ? <p className="sp-note">{leads.some((q) => q.isLoading) || hist.some((q) => q.isLoading) ? "Loading the prices…" : "The weekly prices for this comparison are not available yet."}</p> : <>
        <div className="eq-lc">{pairs.map(({ x, a, b }, i) => { const lo = Math.min(...a.v, ...b.v), hi = Math.max(...a.v, ...b.v); return (
          <div key={x.mine.symbol} className="eq-lc-c">
            <p className="sp-note">Peer group: {x.mine.peer!.group}</p>
            <p className="eq-lc-t"><Link to={`/stocks/${encodeURIComponent(x.mine.symbol)}`} className="eq-col sp-red" title={coTitle(x.mine)}>{coName(x.mine)}</Link> vs group #1 <Link to={`/stocks/${encodeURIComponent(x.top.symbol)}`} className="eq-col sp-good" title={coTitle(x.top)}>{coName(x.top)}</Link></p>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`₹1 lakh a year ago: ${rupee(info[i].mine)} in ${coName(x.mine)}, ${rupee(info[i].theirs)} in ${coName(x.top)}`}>
              <line x1={0} x2={W} y1={H - ((100 - lo) / (hi - lo || 1)) * H} y2={H - ((100 - lo) / (hi - lo || 1)) * H} className="eq-lc-base" />
              <path d={line(b.v, lo, hi)} className="eq-lc-top" fill="none" /><path d={line(a.v, lo, hi)} className="eq-lc-me" fill="none" />
            </svg>
            <p className="eq-lc-x"><span>{mon(a.d[0])}</span><span>{mon(a.d[a.d.length - 1])}</span></p>
            <div className="eq-lc-v"><span>₹1 lakh in {coName(x.mine)}<b className="sp-red">{rupee(info[i].mine)}</b></span><span>₹1 lakh in {coName(x.top)}<b className="sp-good">{rupee(info[i].theirs)}</b></span></div>
          </div>); })}</div>
        {(() => { const drawn = new Set(pairs.map((p) => p.x.mine.symbol)), busy = leads.some((q) => q.isLoading) || hist.some((q) => q.isLoading);
          const left = busy ? [] : lag.filter((s) => !drawn.has(s.symbol));   // a blank says why (the pack's rule)
          return left.length ? <p className="sp-note">No comparison for {list2(left.map((s) => coName(s)))}: {left.length === 1 ? "its group's #1 or a year of its weekly prices is" : "their group's #1 or a year of their weekly prices is"} not available yet.</p> : null; })()}
        {lagAll.length > 3 && <button type="button" className="eq-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show the 3 weakest ▴" : `Show all ${lagAll.length} laggards ▾`}</button>}
        <Insights items={named(leaderCards(info, voice), [...shares, ...pairs.map((p) => ({ symbol: p.x.top.symbol, name: p.x.top.name }))], voice)} scope="eq.leaders" />
      </>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Diversification analytics: DivPack.tsx (task #183 W7)
/** Style tilt: where the list's average share ranks among all the companies FinLit Prism rates, part by part (Gold). */
export function StyleTiltPack({ tilt, nameOf = (s) => s }: { tilt: StyleTilt | undefined; /** task #385: names, not codes, in its sentences */ nameOf?: (s: string) => string }) {
  if (!tilt) return null;
  if ("locked" in tilt) return <section className="sp-sec" aria-labelledby="eq-style"><h2 id="eq-style">Style tilt</h2><LockedBlock plan="gold" title="Style tilt is part of the Gold plan">{tilt.reason}</LockedBlock></section>;
  const rated = tilt.parts.some((p) => p.avgPercentile != null);
  return (
    <Section id="eq-style" hide title="Style tilt" help="Where the average share in your list ranks among all the companies FinLit Prism rates, part by part: size, value, quality and momentum." how="The darker band in the middle reads as typical; each part says which way is higher." sub="Where the list's average share ranks among all companies FinLit Prism rates. The darker band, 35th to 65th, reads as typical.">
      {!rated ? <p className="sp-note">None of these shares has a Prism rating yet, so there is no style tilt to show.</p> : <>
        <ul className="eq-tilt">{tilt.parts.map((p) => { const at = p.avgPercentile; return (
          <li key={p.part}><span>{p.part.replace(/ technical view$/i, " trend").replace(/^Short-term trend|^Long-term trend/, (x) => x)}{/^valuation/i.test(p.part) ? <small className="eqv-tilt-h">higher = cheaper</small> : /^risk/i.test(p.part) ? <small className="eqv-tilt-h">higher = safer</small> : null}</span>
            <span className="eq-tt" aria-hidden="true"><i className="band" />{at != null && <b style={{ left: `${at}%` }} />}</span>
            <span className="eq-tv">{at == null ? tiltRead(p) : <><b>{ordinal(Math.round(at))}</b> · {tiltRead(p)}</>}</span></li>); })}</ul>
        <p className="sp-note">{tilt.sentence ? tilt.sentence + " " : ""}Valuation: higher means cheaper. Risk: higher means lower risk.</p>
        {tilt.notRated.length > 0 && <p className="sp-note">Not rated by Prism yet, so left out: {tilt.notRated.map(nameOf).join(", ")}.</p>}
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
    <details className="sp-sec sp-fold eq-short" open id="eq-short">
      <summary><span><b className="sp-ft">What this means, in short</b><small>Written from your list's figures, if equal amounts were held</small></span><span className="sp-show eq-hs"><span className="o">Hide ▴</span><span className="c">Show ▾</span></span></summary>
      <table className="eq-st"><tbody>{xs.map((x) => <tr key={x.rule + x.text}><th scope="row">{TAG[x.section]}</th><td>{x.text}</td></tr>)}</tbody></table>
    </details>
  );
}
export function SizeFold({ counts }: { counts: Record<Size, number> }) {
  return (
    <details className="sp-sec sp-fold">
      <summary><span><b className="sp-ft">Company size: how FinLit defines it</b><small>{counts.Large ?? 0} large · {counts.Mid ?? 0} mid · {counts.Small ?? 0} small · {counts.Micro ?? 0} micro in your list</small></span><span className="sp-show">Show ▾</span></summary>
      <p className="sp-note">FinLit uses four sizes everywhere on the site, by market value: <b>Large</b> above ₹75,000 Cr, <b>Mid</b> ₹25,000 to 75,000 Cr, <b>Small</b> ₹10,000 to 25,000 Cr, <b>Micro</b> below ₹10,000 Cr. A company moves between sizes as its market value changes.</p>
    </details>
  );
}
export { PEER_WORD };
