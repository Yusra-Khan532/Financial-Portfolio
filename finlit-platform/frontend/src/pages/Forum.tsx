import { useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, useSearchIndex } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocTitle } from "../lib/title";
import { useUI, TIER } from "../lib/ui";
import { watch as wl, useWatchlist } from "../lib/watchlist";
import { MINUS, nf } from "../lib/format";
import { BOARD_NAME, DISCLAIMER, PLANS, forumMe, pickCompanies, send, type CompanyFilter, type ForumCompany, type QueueItem } from "../lib/forum";
import { BoardNote, CompanyLogo, Disclaimer, ThreadList, ThreadView, msg, useCompanyQuotes } from "../components/forum/ForumParts";
import "../styles/forum.css";

export { Body } from "../components/forum/ForumParts";

const Shell = ({ title, children }: { title: string; children: React.ReactNode }) => <div className="wrap fo"><div className="eyebrow">Discussion</div><h1>{title}</h1><Disclaimer />{children}</div>;
const FILTERS: [CompanyFilter, string][] = [["all", "All companies"], ["trending", "Trending"], ["discussed", "Most discussed"], ["following", "Following"]];
const count = (n: number) => `${n.toLocaleString("en-IN")} ${n === 1 ? "discussion" : "discussions"}`;

/** The front page's left column: every company with discussion on the viewer's board, listed once, with its logo and discussion count. */
function Companies({ active, board }: { active?: string; board: string }) {
  const { data: me } = forumMe(), wlState = useWatchlist(); void wlState;
  const [q, setQ] = useState(""), [filter, setFilter] = useState<CompanyFilter>("all");
  const list = useQuery<{ companies: ForumCompany[] }>({ queryKey: ["forum", "companies", "all", board], queryFn: () => apiGet(`/api/forum/companies?days=0&limit=500${board ? `&board=${board}` : ""}`), enabled: !!me?.signedIn, staleTime: 30_000 });
  const all = list.data?.companies ?? [];
  const term = q.trim().toLowerCase();
  const shown = useMemo(() => pickCompanies(all.filter((c) => !term || c.symbol.toLowerCase().includes(term) || c.name.toLowerCase().includes(term)), filter, wl.has), [all, term, filter, wlState]); // eslint-disable-line react-hooks/exhaustive-deps
  const quotes = useCompanyQuotes(shown.slice(0, 60).map((c) => c.symbol));
  return (
    <aside className="fo-co-col" aria-label="Companies">
      <div className="fo-co-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company (e.g. Reliance, TCS…)" aria-label="Search companies" maxLength={60} /></div>
      <div className="fo-filters" role="group" aria-label="Show">{FILTERS.map(([k, l]) => <button type="button" key={k} className={"chip" + (filter === k ? " on" : "")} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div>
      {me && !me.signedIn ? null : list.isPending ? <ul className="fo-co-list" aria-busy="true">{[0, 1, 2, 3].map((i) => <li key={i} className="skeleton" style={{ height: 62, borderRadius: 14 }} />)}</ul>
        : list.isError ? <div className="fo-err" role="alert">{msg(list.error)}</div>
        : !shown.length ? <div className="fo-empty"><b>{term ? "No company matches that search." : filter === "following" ? "None of the companies you follow has a discussion yet." : filter === "trending" ? "Nothing active in the last 7 days." : "No discussions on your board yet."}</b>
            <span>{term || filter !== "all" ? "Try All companies." : "Open any company's report and start the first discussion."}</span></div>
        : <ul className="fo-co-list">{shown.map((c) => (
            <li key={c.symbol}><Link className={"fo-co" + (c.symbol === active ? " on" : "")} to={`/forum/c/${c.symbol}`} aria-current={c.symbol === active ? "page" : undefined}>
              <CompanyLogo symbol={c.symbol} name={c.name} logo={quotes.get(c.symbol)?.logo} size={38} />
              <span className="fo-co-name"><b>{c.name}</b><small>{c.symbol}{c.recent > 0 && filter !== "trending" ? ` · ${c.recent} active this week` : ""}</small></span>
              <span className="fo-co-n">{count(c.threads)}</span>
              <svg className="fo-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </Link></li>))}</ul>}
    </aside>
  );
}

/** Follow = the member's watchlist (Silver and up), the same as the report's Watchlist button. */
function FollowButton({ symbol }: { symbol: string }) {
  const { has, toast, upgrade } = useUI(), wlState = useWatchlist(); void wlState;
  const on = wl.has(symbol);
  return <button type="button" className={"btn" + (on ? " on" : "")} aria-pressed={on} onClick={() => {
    if (!has("silver")) { upgrade("silver", `Following companies comes with the ${TIER.silver.n} plan.`); return; }
    if (!on && !has("gold") && wl.total() >= 30) { upgrade("gold", "Silver follows up to 30 stocks; Gold follows up to 1,000."); return; }
    if (on) wl.remove(symbol); else wl.add(symbol);
    toast(on ? `${symbol} removed from your watchlist.` : `${symbol} added to your watchlist.`);
  }}>{on ? "✓ Following" : "Follow"}</button>;
}

/** A company's discussion page: header with logo, name, price, Follow and Share; tabs; then its discussions. */
function CompanyPanel({ symbol, board }: { symbol: string; board: string }) {
  const nav = useNavigate();
  const [n, setN] = useState<number | null>(null);
  const idx = useSearchIndex(true);
  const name = useMemo(() => idx.data?.rows.find((r) => r[0] === symbol)?.[1], [idx.data, symbol]);
  const qt = useCompanyQuotes([symbol]).get(symbol);
  useDocTitle(`${name || symbol} discussions`, `Discussions about ${name || symbol} on FinLit. Information and opinion only.`);
  const up = (qt?.chg ?? 0) >= 0;
  return (
    <section className="fo-cp" aria-label={`${name || symbol} discussions`}>
      <nav className="fo-crumb" aria-label="Breadcrumb"><Link to="/forum" className="fo-crumb-back" aria-label="Back to the discussion forum"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></Link><Link to="/forum">Discussion forum</Link><span aria-hidden="true">›</span><span aria-current="page">{name || symbol}</span></nav>
      <header className="fo-cp-head card">
        <CompanyLogo symbol={symbol} name={name || symbol} logo={qt?.logo} size={64} />
        <div className="fo-cp-id">
          <h1>{name || symbol}</h1>
          <div className="fo-cp-sub"><span className="tag tk">{symbol}</span>
            {qt?.price != null ? <><b className="fo-px">₹{nf(qt.price)}</b>{qt.chg != null && <span className={up ? "up" : "down"}>{up ? "▲" : "▼"} {up ? "+" : MINUS}{nf(Math.abs(qt.chg))}%</span>}</> : <span className="muted">Price not available</span>}</div>
        </div>
        <div className="fo-cp-act"><FollowButton symbol={symbol} />
          <button type="button" className="btn icon-only" aria-label="Share this page" title="Share" onClick={() => { const url = location.href; if (navigator.share) navigator.share({ title: `${name || symbol} discussions`, url }).catch(() => undefined); else navigator.clipboard?.writeText(url); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0-4 4m4-4 4 4M5 13v6h14v-6" /></svg></button></div>
      </header>
      <div className="fo-tabs" role="tablist" aria-label="Company">
        <button type="button" role="tab" aria-selected="true" className="on">Discussions{n != null ? ` (${n.toLocaleString("en-IN")})` : ""}</button>
        <Link role="tab" aria-selected="false" to={`/stocks/${symbol}`}>Research report</Link>
        <Link role="tab" aria-selected="false" to={`/stocks/${symbol}#community`}>On the report page</Link>
      </div>
      <div className="fo-notes"><BoardNote board={board} compact /><Disclaimer compact /></div>
      <ThreadList symbol={symbol} board={board} onCount={setN} onOpen={(id) => nav(`/forum/t/${id}`)} />
    </section>
  );
}

function Home({ symbol }: { symbol?: string }) {
  const { data: me } = forumMe();
  const [pick, setPick] = useState("");      // moderators may look at another plan's board
  const board = me?.moderator && PLANS.includes(pick as never) && pick !== me.board ? pick : "";
  return (
    <div className="wrap fo fo2">
      <div className={"fo2-grid" + (symbol ? " has-company" : "")}>
        <div className="fo2-left">
          <div className="fo-intro"><div className="eyebrow">Community</div><h1 className="fo-h1">Discussion forum</h1><p className="muted">Discuss, ask and share what you find in the filings of Indian companies.</p></div>
          {me?.moderator && <div className="seg fo-boards" role="group" aria-label="Board">{PLANS.map((b) => <button type="button" key={b} aria-pressed={(board || me.board) === b} onClick={() => setPick(b)}>{BOARD_NAME[b]}</button>)}</div>}
          {me?.signedIn && <Companies active={symbol} board={board} />}
        </div>
        <div className="fo2-right">
          {!symbol && <><Disclaimer /><BoardNote board={board} /></>}
          {symbol ? <CompanyPanel key={symbol} symbol={symbol} board={board} /> : me?.signedIn ? <section aria-label="Latest discussions"><h2 className="fo-h2">Latest discussions</h2><ThreadList board={board} /></section> : null}
        </div>
      </div>
    </div>
  );
}

function Index() {
  useDocTitle("Discussion forum", "Discuss listed companies: information and opinion only, moderated.");
  return <Home />;
}
function Company() {
  const { symbol = "" } = useParams();
  return <Home symbol={symbol.toUpperCase()} />;
}
function Thread() {
  const { id } = useParams(), nav = useNavigate();
  const tid = Number(id);
  const q = useQuery<{ thread: { title: string | null; symbol: string; company: string } }>({ queryKey: ["forum", "thread", tid, "tree"], queryFn: () => apiGet(`/api/forum/threads/${tid}?tree=1`), retry: false, enabled: tid > 0 });
  useDocTitle(q.data?.thread.title || "Discussion");
  const t = q.data?.thread;
  return (
    <div className="wrap fo fo-t">
      <nav className="fo-crumb" aria-label="Breadcrumb"><Link to="/forum">Discussion forum</Link>{t && <><span aria-hidden="true">›</span><Link to={`/forum/c/${t.symbol}`}>{t.company}</Link></>}<span aria-hidden="true" className="fo-crumb-last">›</span><span aria-current="page" className="fo-crumb-last">Discussion</span></nav>
      <div className="fo-notes"><BoardNote compact /><Disclaimer compact /></div>
      {tid > 0 ? <ThreadView id={tid} onBack={t ? () => nav(`/forum/c/${t.symbol}`) : undefined} backLabel={t ? `All ${t.company} discussions` : undefined}
        header={(th) => <p className="fo-t-co"><Link to={`/forum/c/${th.symbol}`}><b>{th.symbol}</b> {th.company}</Link> · <Link to={`/stocks/${th.symbol}`}>Research report</Link></p>} />
        : <div className="fo-empty"><b>This discussion is not available.</b></div>}
    </div>
  );
}

function Guidelines() {
  useDocTitle("Community guidelines", "Rules for FinLit discussions: information and opinion only.");
  return (
    <Shell title="Community guidelines and terms">
      <p>FinLit Ventures is a research platform. We are not a SEBI-registered investment adviser or research analyst, and nothing posted here is a recommendation. Members post in their own name (a chosen handle) and are responsible for what they write.</p>
      <h2 style={{ fontSize: 18 }}>What is welcome</h2>
      <ul><li>Questions and views about a company's business, results, balance sheet, valuation and risks, with the data or source behind them.</li><li>Links (up to {2} per post) to filings, annual reports or news articles.</li></ul>
      <h2 style={{ fontSize: 18 }}>What is not allowed</h2>
      <ul><li>Tips and calls: telling others to buy or sell, price targets, stop-losses, or promises of returns or "guaranteed" gains.</li><li>Promoting stocks, groups, channels, courses or paid services; pump-and-dump style hype.</li><li>Phone numbers, email addresses, WhatsApp/Telegram handles or invitations to move the conversation elsewhere.</li><li>Link shorteners, chat-group links, social profiles; abuse, harassment or personal attacks; repeating the same message.</li></ul>
      <h2 style={{ fontSize: 18 }}>How moderation works</h2>
      <p>Posts that look like hype are held until a moderator reads them. Posts reported by 3 different members are hidden until a moderator decides. Moderators may remove posts and pause accounts. You can edit a post for 15 minutes and delete it at any time. The forum has one board for each plan: Basic, Silver and Gold members each read and write on the board of their own plan, and cannot see the other boards. Posting needs a free FinLit account. We never show your email or account name.</p>
      <p className="muted">{DISCLAIMER}</p>
    </Shell>
  );
}

/** Administrators only (server re-checks role and two-step sign-in on every call). */
function Moderation() {
  const { user, ready, isAdmin } = useAuth(), qc = useQueryClient();
  const [kind, setKind] = useState<"open" | "recent">("open");
  const q = useQuery<{ items: QueueItem[]; counts: { held: number; hidden: number } }>({ queryKey: ["forum", "queue", kind], queryFn: () => apiGet(`/api/admin/forum/queue?kind=${kind}`), enabled: isAdmin && !!user?.mfaOk, retry: false });
  const act = useMutation({ mutationFn: (f: () => Promise<unknown>) => f(), onSuccess: () => qc.invalidateQueries({ queryKey: ["forum", "queue"] }) });
  if (!ready) return null;
  if (!user) return <Navigate to="/login?next=%2Fforum%2Fmoderation" replace />;
  if (!isAdmin || !user.mfaOk) return <Shell title="Moderation"><p className="muted">Administrators only, signed in with the authenticator code.</p></Shell>;
  return (
    <Shell title="Moderation queue">
      <div className="seg" role="group" aria-label="Show">{(["open", "recent"] as const).map((k) => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{k === "open" ? `Needs a decision (${(q.data?.counts.held ?? 0) + (q.data?.counts.hidden ?? 0)})` : "Latest posts"}</button>)}</div>
      {q.isError && <div className="fo-err">{msg(q.error)}</div>}
      {q.data && !q.data.items.length && <p className="muted">Nothing waiting.</p>}
      {q.data?.items.map((i) => (
        <div className="fo-q" key={i.id}>
          <div className="fo-meta"><b>{i.status}</b><span>{BOARD_NAME[i.plan]} board</span><span>{i.symbol}</span><span>{i.author.handle} ({i.author.email}){i.author.banned && " · paused"}</span><Link to={`/forum/t/${i.threadId}`}>open</Link></div>
          {i.title && <h3>{i.title}</h3>}<pre>{i.body}</pre>
          {i.flagReasons.length > 0 && <div className="fo-note">Held: {i.flagReasons.join("; ")}</div>}
          {i.reports.map((r, n) => <div key={n} className="fo-meta">Report by {r.by}: {r.reason}{r.note ? ` – ${r.note}` : ""}</div>)}
          <div className="fo-act">
            {i.status !== "visible" && <button className="btn" onClick={() => act.mutate(() => send("POST", `/api/admin/forum/posts/${i.id}/approve`, {}))}>Approve</button>}
            {i.status !== "removed" && <button className="btn" onClick={() => act.mutate(() => send("POST", `/api/admin/forum/posts/${i.id}/remove`, { note: prompt("Reason (optional)") || "" }))}>Remove</button>}
            <button className="btn" onClick={() => { const d = Number(prompt("Pause this member's posting for how many days?", "7")); if (d > 0) act.mutate(() => send("POST", `/api/admin/forum/users/${i.author.userId}/ban`, { days: d, reason: prompt("Reason") || "" })); }}>Pause member</button>
          </div>
        </div>))}
      {act.isError && <div className="fo-err">{msg(act.error)}</div>}
    </Shell>
  );
}

export function ForumPage() {
  return <Routes><Route index element={<Index />} /><Route path="c/:symbol" element={<Company />} /><Route path="t/:id" element={<Thread />} /><Route path="guidelines" element={<Guidelines />} /><Route path="moderation" element={<Moderation />} /><Route path="*" element={<Navigate to="/forum" replace />} /></Routes>;
}
