// News & filings (/news), task #309 (developer file 19, version 2, 22 Nov 2026).
// The list is exchange news AND results filings (GET /api/feed?kind=news,result&filed=true): the results filings used to go to the Results
// page only, so "Quarterly results" here showed 0. Each filing carries one FinLit topic (Results, Orders & contracts, ...; backend
// finlit/feed.py TOPICS), shown as chips with their counts for the dates chosen (GET /api/feed/counts). The exchange's own category stays on
// every row and in the Category dropdown. The list comes 60 at a time; "Show more" continues from the last item's date and id.
// Toolbar parts are Discover's (discovery/Toolbar.tsx, .dbx-); page classes start .p4- (styles/news-page.css).
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { CoLogo } from "../components/CoLogo";
import { Chips, Dd, Ico, OptList, Sw, type Opt } from "../discovery/Toolbar";
import { FEED_TOPICS, dayLabel, useFeedCounts, useFeedPages, type FeedItem, type FeedTopic } from "../lib/feed";
import { useDocTitle } from "../lib/title";
import { useWatchlist } from "../lib/watchlist";
import { usePortfolio } from "../lib/portfolio";
import { coTitle, shortLabel } from "../lib/companyLabel";
import "../discovery/discover.css";
import "../styles/news-page.css";

const KIND = "news,result" as const;
const PAGE = 60;
const TL: Record<string, string> = Object.fromEntries(FEED_TOPICS);
const WIN: Record<string, string> = { 7: "Last 7 days", 30: "Last 30 days" };
const DAY = 86_400_000;
/** The Indian market day today, as YYYY-MM-DD. */
export const todayIST = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export const isoMinus = (iso: string, days: number) => new Date(Date.parse(iso + "T00:00:00Z") - days * DAY).toISOString().slice(0, 10);
const nf = (n: number) => n.toLocaleString("en-IN");
const md = (iso: string, year = true) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: year ? "numeric" : undefined });

/** The headline as the company filed it, without the repeated parts: a leading "Category:" and "X Limited has informed the Exchange about/that". */
export function headline(e: Pick<FeedItem, "title" | "category">): string {
  let t = String(e.title || "").trim();
  if (e.category && t.toLowerCase().startsWith(e.category.toLowerCase() + ":")) t = t.slice(e.category.length + 1).trim();
  const m = t.match(/^(.{2,120}?)\s+(?:Limited|Ltd\.?|LIMITED)\s+has\s+(?:informed|submitted to)\s+the\s+Exchange\s*(?:,\s*)?(?:regarding|about|that|of)?\s*/i);
  if (m) t = t.slice(m[0].length);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : e.title;
}
/** A company name as the row writes it: title case for names filed in capitals, without "Limited". */
export const shortName = (s: string | null) => {
  const x = String(s || "");
  const tc = /[a-z]/.test(x) ? x : x.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Of|And|The|For|In|On)\b/g, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase());
  return tc.replace(/\s+(Limited|Ltd\.?)$/i, "");
};

type F = { q: string; topic: FeedTopic | ""; cat: string; win: "7" | "30"; day: string; mine: boolean };
const START: F = { q: "", topic: "", cat: "", win: "7", day: "", mine: false };

export function NewsPage() {
  useDocTitle("News and filings", "Company announcements and results filings, sorted into FinLit topics: filter by topic, exchange category, date or your own names.");
  const wl = useWatchlist(), pf = usePortfolio();
  const held = useMemo(() => new Set(pf.holdings.filter((h) => h.side !== "sell").map((h) => h.symbol.toUpperCase())), [pf]);
  const watched = useMemo(() => new Set(wl.lists.flatMap((l) => l.symbols.map((s) => s.toUpperCase()))), [wl]);
  const mine = useMemo(() => [...new Set([...held, ...watched])], [held, watched]);
  const [f, setF] = useState<F>(START);
  const set = (p: Partial<F>) => setF((o) => ({ ...o, ...p }));
  const q = f.q.trim().length > 1 ? f.q.trim() : "";
  const today = todayIST();
  const from = f.day || isoMinus(today, +f.win), to = f.day || today;
  const base = { scoped: f.mine, symbols: f.mine ? mine : [], q, filed: true };
  const topics = f.topic ? [f.topic] : [];
  const counts = useFeedCounts(KIND, { ...base, topics, category: f.cat, from, to });
  const month = useFeedCounts(KIND, { ...base, topics, category: f.cat, from: isoMinus(today, 30), to: today });   // the Date dropdown: each day of the last 30
  const mineN = useFeedCounts(KIND, { scoped: true, symbols: mine, q, filed: true, topics, category: f.cat, from, to });
  const list = useFeedPages(KIND, { ...base, topics, category: f.cat, from, to, limit: PAGE });
  const rows = useMemo(() => (list.data?.pages || []).flat(), [list.data]);
  const c = counts.data;
  const total = c?.total ?? 0;
  const tAll = (c?.topics || []).reduce((a, t) => a + t[2], 0);
  const tN = Object.fromEntries((c?.topics || []).map((t) => [t[0], t[2]]));
  const days = month.data?.days || [];
  const inWin = (w: number) => days.filter(([d]) => d >= isoMinus(today, w)).reduce((a, d) => a + d[1], 0);
  const dayCount = Object.fromEntries((c?.days || []).map(([d, n]) => [d, n]));
  const span = (() => {
    const ds = (c?.days || []).map((d) => d[0]).sort();
    if (!ds.length) return f.day ? md(f.day) : WIN[f.win].toLowerCase();
    return ds[0] === ds[ds.length - 1] ? md(ds[0]) : `${md(ds[0], false)} – ${md(ds[ds.length - 1])}`;
  })();
  const groups = useMemo(() => { const g: { d: string; r: FeedItem[] }[] = []; rows.forEach((e) => { const l = g[g.length - 1]; if (l && l.d === e.date) l.r.push(e); else g.push({ d: e.date, r: [e] }); }); return g; }, [rows]);

  const catItems: Opt[] = [{ v: "", t: "All categories", c: (c?.categories || []).reduce((a, x) => a + x[1], 0), sel: !f.cat, all: true },
    { v: "h", t: f.topic ? `Exchange categories in ${TL[f.topic]}` : "Exchange categories, most used first", head: true },
    ...(c?.categories || []).map(([k, n]) => ({ v: k, t: k, c: n, sel: f.cat === k }))];
  const dayItems: Opt[] = [{ v: "7", t: WIN[7], c: inWin(7), sel: !f.day && f.win === "7" }, { v: "30", t: WIN[30], c: inWin(30), sel: !f.day && f.win === "30" },
    { v: "h", t: "One day", head: true }, ...days.map(([d, n]) => ({ v: d, t: dayLabel(d), c: n, sel: f.day === d }))];
  const chips: [string, string][] = [];
  if (f.topic) chips.push(["topic", TL[f.topic]]);
  if (f.cat) chips.push(["cat", f.cat]);
  if (f.day || f.win !== "7") chips.push(["day", f.day ? dayLabel(f.day) : WIN[f.win]]);
  if (f.mine) chips.push(["mine", "My names"]);
  if (f.q.trim()) chips.push(["q", `“${f.q.trim()}”`]);
  const unset = (k: string) => set(k === "all" ? START : k === "topic" ? { topic: "" } : k === "cat" ? { cat: "" } : k === "day" ? { day: "", win: "7" } : k === "mine" ? { mine: false } : { q: "" });
  const tag = (s: string | null) => !s ? null : held.has(s) ? <> · <span className="dsc-tag pf">Portfolio</span></> : watched.has(s) ? <> · <span className="dsc-tag wl">Watchlist</span></> : null;
  const noun = f.topic === "results" ? (total === 1 ? "results filing" : "results filings") : total === 1 ? "filing" : "filings";
  const loading = list.isLoading || counts.isLoading;
  const failed = list.isError || counts.isError;
  const empty = !loading && !failed && !rows.length;

  return (
    <div className="wrap ipo p4 p4-news">
      <PageHeader plan="free" title="News & filings" art="news" links={["/results", "/documents", "/ipo"]}
        description="Exchange announcements and results filings sorted into topics, plus market news we pick." />
      <div className="p4-tools">
        <label className="dbx-q">{Ico.search}<input type="search" placeholder="Search a company or headline" aria-label="Search news" value={f.q} autoComplete="off" onChange={(e) => set({ q: e.target.value })} /></label>
        <div className="dbx-dds">
          <Dd label="Category" value={f.cat} badge={!f.cat && c ? c.categories.length : null} wide title="Category">{(close) => <>
            <OptList title="Category" search items={catItems} onPick={(v) => { set({ cat: v }); close(); }} />
            <p className="dbx-pn">The category the company chose when filing. The topic chips group them, and sort the catch-alls (General Updates, Updates, Press Release) by what each filing says.</p></>}</Dd>
          <Dd label={f.day || f.win !== "7" ? "Date" : WIN[7]} value={f.day ? md(f.day, false) : f.win !== "7" ? WIN[f.win] : ""} icon={<CalIcon />} title="Date">{(close) =>
            <OptList title="Date" items={dayItems} onPick={(v) => { set(v === "7" || v === "30" ? { win: v, day: "" } : { day: v }); close(); }} />}</Dd>
          <Dd label="My names" value={f.mine ? "Only these" : ""} icon={Ico.star} badge={!f.mine && mine.length ? (mineN.data?.total ?? null) : null} right title="My names">{() => <>
            <Sw label="Only my portfolio and watchlist" on={f.mine} n={mine.length ? mineN.data?.total ?? null : null} disabled={!mine.length} note={mine.length ? undefined : "No names yet"} onChange={(on) => set({ mine: on })} />
            <p className="dbx-pn">{mine.length ? `The companies in your portfolio and watchlists (${nf(mine.length)}).` : <>Add companies to a <Link to="/watchlist">watchlist</Link> or your <Link to="/portfolio">portfolio</Link> to follow their filings here.</>}</p></>}</Dd>
        </div>
      </div>
      <div className="p4-quick p4-topics" role="group" aria-label="Topics">
        <button type="button" className={"ui-tab chip-b" + (!f.topic ? " on" : "")} aria-pressed={!f.topic} onClick={() => set({ topic: "" })}>All<span>{nf(tAll)}</span></button>
        {FEED_TOPICS.filter(([k]) => tN[k] || f.topic === k).map(([k, l]) => (
          <button key={k} type="button" className={"ui-tab chip-b" + (f.topic === k ? " on" : "")} aria-pressed={f.topic === k} onClick={() => set({ topic: k, cat: "" })}>{l}<span>{nf(tN[k] || 0)}</span></button>))}
      </div>
      <Chips chips={chips} unset={unset} />
      <div className="dbx-rbar"><span className="dbx-cnt"><b>{nf(total)}</b> {noun} · {span}</span><span className="p4-hint">Exchange news and results filings · newest first</span></div>
      {failed && <div className="formerr">News could not be loaded. Please try again shortly.</div>}
      {loading && <div className="skeleton" style={{ height: 240 }} />}
      {empty && <div className="card dw-empty"><b>{f.mine && !mine.length ? "No names yet" : "Nothing here yet"}</b>
        <p>{f.mine && !mine.length ? "Add companies to a watchlist or your portfolio to follow their filings." : `No filing matches these filters${f.day || f.win === "7" ? " on these dates. Try “Last 30 days”." : "."}`}</p></div>}
      {groups.map((g) => (
        <section key={g.d} className="feed-g p4-fg"><h2>{dayLabel(g.d)}{dayCount[g.d] ? <span>{nf(dayCount[g.d])} {dayCount[g.d] === 1 ? "filing" : "filings"}</span> : null}</h2>
          <div className="card feed-card"><ul className="feed-n p4-fn">{g.r.map((e) => {
            const tp = e.topic && TL[e.topic] ? TL[e.topic] : "Filing";
            const text = <><b>{shortName(e.company)}</b> {headline(e)}</>;
            return <li key={e.id}>
              {e.symbol ? <Link className="feed-sym p4-sym" to={`/stocks/${e.symbol}`} title={coTitle({ symbol: e.symbol, name: e.company })}><CoLogo symbol={e.symbol} size={18} inline /><span>{shortLabel({ symbol: e.symbol, name: e.company })}</span></Link> : <span className="feed-sym alt">Market</span>}
              <div className="p4-nb"><p>{e.link ? <a href={e.link} target="_blank" rel="noopener noreferrer" title={e.title}>{text}</a> : text}</p>
                <small><span className={"ui-chip p4-tp t-" + (e.topic || "x")}>{tp}</span>{e.category && e.category !== tp ? <> · <span className="p4-cat">{e.category}</span></> : null}{e.source ? <span className="p4-src"> · {e.source}</span> : null}{tag(e.symbol)}</small>
                {e.summary && <p className="muted p4-sum">{e.summary}</p>}</div>
              {e.link ? <a className="p4-open" href={e.link} target="_blank" rel="noopener noreferrer" aria-label="Open the filing">{Ico.ext}</a> : <span />}
            </li>;
          })}</ul></div></section>))}
      {list.hasNextPage && rows.length < total && <button type="button" className="p4-more" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
        {list.isFetchingNextPage ? "Loading…" : `Show ${nf(Math.min(PAGE, total - rows.length))} more`}</button>}
      <p className="muted p4-disc">Filings as the companies filed them with the exchange; the topic is FinLit's grouping. Information only, not investment advice.</p>
    </div>
  );
}

function CalIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>;
}
