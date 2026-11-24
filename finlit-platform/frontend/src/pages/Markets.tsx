import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router";
import { Icon } from "../lib/icons";
import { nf, MINUS } from "../lib/format";
import { safeUrl } from "../lib/safe";   // security: only http(s) document links
import { downloadCsv, prefetchMarkets, qs, useGold, usePremium, type Feed as FeedT } from "../lib/premium";
import { useDocTitle } from "../lib/title";
import { GoldLock, PremiumHead } from "./Premium";
import { useIndices } from "../lib/indices";
import { LogoLoader } from "../components/LogoLoader";
import { usePortfolio } from "../lib/portfolio";
import { useWatchlist } from "../lib/watchlist";
import { useAuth } from "../lib/auth";
import { useExpand } from "../components/dashboard/dx";
import { MkDd, MkSeg, type MkOption } from "../components/MkDd";
import { MK_TABS, MOVED, ROUTINE, catLabel, dShort, hhmm, ipoCounts, nice, resultCounts, split, todayIST, type MkTab } from "../lib/marketEvents";
import { CommodityIndices, IndexDetail, IndexPrices } from "./marketsIndex";
import "../styles/market-events.css";

/* Task #322 (developer file 24, 22 Nov 2026): Market events & index in five tabs (Announcements, Call transcripts, Indices, Index in detail, Commodity
   indices). The IPO and results calendars left this page: both repeat a free page that holds more (/ipo, /results), and their old addresses lead there.
   No table scrolls sideways any more (the "First column ... Last column" slider is gone): each fits its space, and on a phone each row is a small card. */

type Row = Record<string, string | number | null | undefined>;
const txt = (v: unknown) => (v == null || v === "" ? MINUS : String(v));
const pc = (v: unknown) => (typeof v === "number" ? <span style={{ color: v >= 0 ? "var(--gain)" : "var(--loss)" }}>{(v > 0 ? "▲ +" : v < 0 ? "▼ " + MINUS : "") + nf(Math.abs(v))}%</span> : MINUS);

const PAGE = 15, PAGE_BIG = 50;

function Loading() { return <div aria-busy="true" style={{ minHeight: 360, display: "grid", placeItems: "center" }}><LogoLoader size="lg" label="Loading" /></div>; }
function Problem({ e, retry }: { e: unknown; retry: () => void }) {
  const status = (e as { status?: number })?.status;
  return <div className="state"><h2>{status === 403 ? "This tool is part of Gold" : "This data is not available right now"}</h2><p>{status === 403 ? "Sign in with a Gold account to use it." : "The data provider did not answer. Nothing is wrong with your account."}</p>
    {status !== 403 && <button className="btn" onClick={retry}>Try again</button>}</div>;
}
function Pager({ total, page, setPage, size, word }: { total: number; page: number; setPage: (p: number) => void; size: number; word: string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <div className="pm-pager"><span>{total.toLocaleString("en-IN")} {word}</span><button className="btn" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {pages}</span><button className="btn" type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button></div>;
}

/* ---------------------------------------------------------------- announcements and call transcripts */

type Ann = { date?: string; symbol?: string; category?: string; description?: string; document_url?: string };
const when = (s: unknown) => <>{dShort(s)}{hhmm(s) ? <small className="faint mk-u">{hhmm(s)}</small> : null}</>;
const matches = (r: Ann, t: string) => !t || `${r.symbol} ${r.description} ${r.category}`.toLowerCase().includes(t);

/** The member's followed companies (holdings and watchlists), for "My stocks". */
function useMine(): Set<string> {
  const { user } = useAuth(); const pf = usePortfolio(), wl = useWatchlist();
  return useMemo(() => new Set(user ? [...pf.holdings.filter((h) => h.owned !== false && h.side !== "sell").map((h) => h.symbol), ...wl.lists.flatMap((l) => l.symbols)] : []), [user, pf, wl]);
}

function EventFeed({ kind, big }: { kind: "announcements" | "transcripts"; big: boolean }) {
  const ann = kind === "announcements";
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [applied, setApplied] = useState({ from: "", to: "" });
  const [q, setQ] = useState(""), [cat, setCat] = useState("all"), [who, setWho] = useState<"all" | "mine">("all"), [noise, setNoise] = useState<"hide" | "show">("hide"), [page, setPage] = useState(0);
  const { data, isLoading, isError, error, refetch, isFetching } = usePremium<FeedT<Ann>>(`/markets/${kind}` + qs({ from_date: applied.from, to_date: applied.to }));
  const mine = useMine();
  const all = data?.items || [];
  const t = q.trim().toLowerCase();
  const cats = useMemo(() => { const m = new Map<string, number>(); for (const r of all) m.set(String(r.category ?? ""), (m.get(String(r.category ?? "")) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); }, [all]);
  const nMine = all.filter((r) => mine.has(String(r.symbol))).length, nRout = all.filter((r) => ROUTINE.test(String(r.category ?? ""))).length;
  const rows = all.filter((r) => (!ann || cat === "all" || r.category === cat) && (who === "all" || mine.has(String(r.symbol)))
    && (!ann || noise === "show" || cat !== "all" || !ROUTINE.test(String(r.category ?? ""))) && matches(r, t));
  useEffect(() => setPage(0), [q, cat, who, noise, applied, big]);
  const size = big ? PAGE_BIG : PAGE;
  const shown = rows.slice(page * size, page * size + size);
  const csv = () => downloadCsv(`finlit-${kind}`, ["Date", "Symbol", "Company", ...(ann ? ["Category"] : []), "Announcement", "Document"],
    rows.map((r) => { const s = split(r); return [r.date, r.symbol, s.co, ...(ann ? [r.category] : []), s.what, r.document_url]; }));
  const catOpts: MkOption<string>[] = [{ v: "all", label: "All categories", small: all.length }, ...cats.map(([c, n]) => ({ v: c, label: catLabel(c) || "Other", small: n }))];
  return (
    <section aria-label={ann ? "Announcements" : "Call transcripts"}>
      {ann && <div className="pm-bar mk-bar">
        <MkSeg k="Companies" label="Companies" value={who} onChange={setWho} options={[{ v: "all", label: "All companies" }, { v: "mine", label: `My stocks ${nMine}` }]} />
        <MkSeg k="Routine notices" label="Routine notices" value={noise} onChange={setNoise} options={[{ v: "hide", label: `Hide routine notices ${nRout}` }, { v: "show", label: "Show everything" }]} />
      </div>}
      <div className="pm-bar mk-bar">
        {ann && <MkDd k="Category" value={cat} onChange={setCat} options={catOpts} search="Find a category" />}
        <label className="mk-find">Search<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company or words" /></label>
        <form className="mk-dates" onSubmit={(e) => { e.preventDefault(); setApplied({ from, to }); }}>
          <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to || undefined} /></label>
          <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined} /></label>
          <button className="btn" type="submit">Apply</button>
          {(applied.from || applied.to) && <button className="btn" type="button" onClick={() => { setFrom(""); setTo(""); setApplied({ from: "", to: "" }); }}>Reset</button>}
        </form>
        <div className="mk-tools"><button className="alx-link" type="button" onClick={csv} disabled={!rows.length}><Icon name="table" /> Export CSV</button></div>
      </div>
      {isError ? <Problem e={error} retry={() => refetch()} /> : isLoading ? <Loading /> : <>
        <div className="mk-tw"><table className="pm-t mk-ann mk-stack">
          <thead><tr><th scope="col">When</th><th scope="col">Company</th>{ann && <th scope="col">Category</th>}<th scope="col">{ann ? "Announcement" : "Call or meeting"}</th><th scope="col">Document</th></tr></thead>
          <tbody>{shown.map((r, i) => { const s = split(r); return (
            <tr key={i}>
              <td className="mk-nw" data-l="When">{when(r.date)}</td>
              <td data-l="Company"><b>{txt(r.symbol)}</b>{s.co && s.co !== r.symbol ? <small className="faint mk-u">{s.co}</small> : null}</td>
              {ann && <td data-l="Category"><span className="chip mk-cat">{catLabel(r.category) || MINUS}</span></td>}
              <td className="wrapc mk-what" data-l={ann ? "Announcement" : "Call or meeting"}>{s.what || <span className="faint">No detail given; see the document</span>}</td>
              <td className="mk-nw" data-l="Document">{(() => { const du = safeUrl(r.document_url); return du ? <a href={du} target="_blank" rel="noopener noreferrer">Open ↗</a> : MINUS; })()}</td>
            </tr>); })}
            {!shown.length && <tr><td colSpan={ann ? 5 : 4} className="mk-none">{who === "mine" && !mine.size ? "Add companies to a watchlist or your portfolio to see their filings here." : "Nothing matches. Clear the filter to see every row."}</td></tr>}</tbody>
        </table></div>
        <Pager total={rows.length} page={page} setPage={setPage} size={size} word={ann ? "announcements" : "filings"} />
        <p className="pm-meta">{ann ? "Routine notices are meeting schedules, newspaper copies, trading-window and certificate filings; choosing a category shows them. " : "Analyst-meet and call filings: schedules, recordings and transcripts. "}
          {applied.from || applied.to ? "Up to 7 days at a time. " : "The last 7 days. "}Updated {data?.fetchedAt ? new Date(data.fetchedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "just now"} · Source: {data?.provider || "FinEdge"}{isFetching ? " · refreshing…" : ""}</p>
      </>}
    </section>
  );
}

/** The week in four numbers. Open IPOs are counted from the dates (open only between the open and close dates); each tile opens its page or tab. */
function Glance({ go }: { go: (t: MkTab) => void }) {
  const ipo = usePremium<FeedT<Row>>("/markets/ipo"), res = usePremium<FeedT<Row>>("/markets/results"), ann = usePremium<FeedT<Row>>("/markets/announcements"), idx = useIndices();
  const today = todayIST();
  const ic = ipoCounts(ipo.data?.items || [], today), rc = resultCounts(res.data?.items || [], today);
  const nifty = (idx.data?.items || []).find((r) => r.code === "NIF50");
  const k = (v: React.ReactNode, ready: boolean) => (ready ? v : <span className="skeleton" style={{ display: "inline-block", width: 60, height: 26 }} />);
  return (
    <div className="pm-cards mk-kpis" aria-label="This week at a glance">
      <Link className="pm-kpi pm-kpi-btn" to="/ipo"><small>IPOs open now</small><b>{k(ic.open, !!ipo.data)}</b><i>{ipo.data ? `${ic.soon} upcoming · IPOs` : " "}</i></Link>
      <Link className="pm-kpi pm-kpi-btn" to="/results"><small>Results due this week</small><b>{k(rc.week, !!res.data)}</b><i>{res.data ? `${rc.later} coming up · Results` : " "}</i></Link>
      <button className="pm-kpi pm-kpi-btn" type="button" onClick={() => go("announcements")}><small>Announcements, last 7 days</small><b>{k((ann.data?.items.length ?? 0).toLocaleString("en-IN"), !!ann.data)}</b><i>Filings and board outcomes</i></button>
      <button className="pm-kpi pm-kpi-btn" type="button" onClick={() => go("indices")}><small>{nifty ? nice(nifty.name) : "Nifty 50"}</small><b>{k(nifty?.close != null ? nf(nifty.close) : MINUS, !!idx.data)}</b><i>{nifty ? pc(nifty.changePct) : "Index level"}{nifty?.pe != null ? ` · P/E ${nf(nifty.pe, 1)}` : ""}</i></button>
    </div>
  );
}

const startTab = (): MkTab | string => { const h = location.hash.slice(1); return MOVED[h] ? h : (MK_TABS.find((t) => t.id === h)?.id ?? "announcements"); };

export function MarketsPage() {
  useDocTitle("Market events & index", "What companies told the exchanges this week, and every index with its valuation and returns against its own history, with monthly commodity indices.");
  const gold = useGold(); const qc = useQueryClient();
  const [tab, setTab] = useState<MkTab | string>(startTab);
  const [idx, setIdx] = useState("NIF50");
  const openIndex = (c: string) => { setIdx(c); setTab("valuations"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const label = MK_TABS.find((t) => t.id === tab)?.label ?? "";
  const x = useExpand(label);
  useEffect(() => { if (gold) prefetchMarkets(qc); }, [gold, qc]);
  useEffect(() => { if (!MOVED[tab]) history.replaceState(history.state, "", "#" + tab); }, [tab]);   // keep the router's own state
  if (MOVED[tab]) return <Navigate to={MOVED[tab]} replace />;   // the old #ipo and #results tabs: their own pages
  if (!gold) return <><PremiumHead title="Market events & index" art="macro" /><GoldLock title="Market Events & Index Dashboard" /></>;
  const t = tab as MkTab;
  const body = t === "commodities" ? <CommodityIndices /> : t === "indices" ? <IndexPrices open={openIndex} big={x.open} /> : t === "valuations" ? <IndexDetail code={idx} setCode={setIdx} /> : <EventFeed key={t} kind={t} big={x.open} />;
  return (
    <>
      <PremiumHead title="Market events & index" art="macro" links={["/ipo", "/results", "/premium"]}>This week's company disclosures, and every index against its own history, with commodity indices.</PremiumHead>
      <div className="wrap mke" style={{ paddingBottom: 56 }}>
        <Glance go={setTab} />
        <div className="pm-tabs" role="tablist" aria-label="Market events sections">{MK_TABS.map((s) => <button key={s.id} role="tab" type="button" aria-selected={t === s.id} onClick={() => setTab(s.id)}>{s.label}</button>)}</div>
        <div className="mk-sect"><MkDd k="Section" value={t} onChange={(v) => setTab(v)} options={MK_TABS.map((s) => ({ v: s.id, label: s.label }))} /></div>
        {x.open && <div className="dx-hold mk-hold" style={{ height: x.hold ?? undefined }} aria-hidden="true" />}
        <section ref={x.panelRef} className={"mk-panel" + (x.open ? " dx-xp" : "")} aria-label={label} {...(x.open ? { role: "dialog", "aria-modal": true } : {})}>
          {x.bar}
          <div className="mk-ph"><h2 className="mk-pt">{label}</h2>{!x.open && <button ref={x.btnRef} type="button" className="dx-xb mk-xb" aria-label={`Expand: ${label}`} title="Expanded view, 50 rows a page" onClick={x.expand}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" /></svg></button>}</div>
          {body}
        </section>
        {x.backdrop}
        <p className="pm-meta" style={{ marginTop: 22 }}>General information, not investment advice. Index levels refresh every minute while the market is open; valuations (P/E, P/B, dividend yield) are published once a day. Where a value sits against its own history describes the past, not what comes next.</p>
      </div>
    </>
  );
}
