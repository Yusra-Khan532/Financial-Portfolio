// The forum's building blocks, shared by the forum pages (/forum) and the "Community discussions" section of each company report:
// writing gates, the composer, discussion cards and lists, and the Reddit-style thread with nested comments.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet, useQuotesFor } from "../../lib/api";
import { quoteMap } from "../../lib/globalSearch";
import { Logo } from "../search/parts";
import { BOARD_NAME, DISCLAIMER, ago, buildTree, draftProblem, forumMe, linkify, pageWindow, send, validHandle, type CommentSort, type Node, type Page, type Post } from "../../lib/forum";
import "../../styles/search.css";
import "../../styles/forum.css";

export const msg = (e: unknown) => (e instanceof ApiError ? e.body.detail || e.body.status || "Failed" : "Could not reach the server.");
const here = () => (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/forum");
const plural = (n: number, one: string, many = one + "s") => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** The forum's disclaimer. `compact`: one line that opens to the full text (company and thread pages, where the content comes first). */
export const Disclaimer = ({ compact = false }: { compact?: boolean }) => compact
  ? <details className="fo-disc fo-disc-sm" role="note"><summary><b>Not investment advice.</b> Opinion only, not a recommendation.<span className="fo-more">Read more</span></summary><p>{DISCLAIMER} <Link to="/forum/guidelines">Community guidelines</Link></p></details>
  : <p className="fo-disc" role="note"><b>Not investment advice.</b> {DISCLAIMER} <Link to="/forum/guidelines">Community guidelines</Link></p>;

/** Which board the viewer is on: the forum is split by plan, so a message reaches only members of the same plan. */
export function BoardNote({ board, compact = false }: { board?: string; compact?: boolean }) {
  const { data: me } = forumMe();
  if (!me) return null;
  const on = (board || me.board) as keyof typeof BOARD_NAME | null;
  if (!me.signedIn) return <p className="fo-board" role="note"><b>Each plan has its own board.</b> Basic, Silver and Gold members talk among their own plan. <Link to={`/login?next=${encodeURIComponent(here())}`}>Sign in</Link> (free) to see yours.</p>;
  if (!on) return null;
  const name = BOARD_NAME[on];
  if (compact && !(board && board !== me.board)) return <p className="fo-board fo-board-sm" role="note" data-board={on}><b>{name} board</b> · seen by {name} members only</p>;
  return <p className="fo-board" role="note" data-board={on}><b>{name} board.</b> {board && board !== me.board ? `You are looking at the ${name} board as a moderator.` : `Only ${name} members can read and reply here, and what you post is seen by ${name} members only.`}</p>;
}

export function Body({ text }: { text: string }) {
  return <div className="fo-body">{linkify(text).map((t, i) => t.t === "text" ? <span key={i}>{t.v}</span> : <a key={i} href={t.href} target="_blank" rel="nofollow noopener noreferrer ugc">{t.label}</a>)}</div>;
}

export function Pager({ page, pages, go }: { page: number; pages: number; go: (n: number) => void }) {
  if (pages <= 1) return null;
  return <nav className="fo-pager" aria-label="Pages">{pageWindow(page, pages).map((n, i) => n === "…" ? <span key={i}>…</span> : <button type="button" key={n} className={"btn" + (n === page ? " on" : "")} aria-current={n === page ? "page" : undefined} onClick={() => go(n)}>{n}</button>)}</nav>;
}

/** The company's logo (from the price list), or its initials on a tile. */
export function CompanyLogo({ symbol, name, logo, size = 40 }: { symbol: string; name: string; logo?: string | null; size?: number }) {
  return <Logo src={logo} name={name || symbol} kind="stock" size={size} />;
}
/** Logos and prices for a handful of companies at once. */
export function useCompanyQuotes(symbols: string[]) {
  return quoteMap(useQuotesFor(symbols).data);
}

/** Choose the public name (once) and accept the guidelines. */
function JoinForm() {
  const qc = useQueryClient();
  const [handle, setHandle] = useState(""), [ok, setOk] = useState(false);
  const m = useMutation({ mutationFn: () => send("POST", "/api/forum/profile", { handle, accept: ok }), onSuccess: () => qc.invalidateQueries({ queryKey: ["forum", "me"] }) });
  return (
    <form className="fo-form" onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(); }}>
      <label>Choose a public name (shown instead of your email or account name; it cannot be changed later)
        <input value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={20} autoComplete="off" /></label>
      <label className="fo-check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>I have read the <Link to="/forum/guidelines">community guidelines</Link> and understand nothing here is investment advice.</span></label>
      <button className="btn primary" disabled={!validHandle(handle) || !ok || m.isPending}>Join the discussion</button>
      {m.isError && <div className="fo-err" role="alert">{msg(m.error)}</div>}
    </form>
  );
}

/** Gate for writing: visitors sign in, members without a name pick one. */
export function Writer({ children, quiet = false }: { children: ReactNode; quiet?: boolean }) {
  const { data: me } = forumMe();
  if (!me) return null;
  if (!me.signedIn) return quiet ? null : <p className="muted"><Link to={`/login?next=${encodeURIComponent(here())}`}>Sign in</Link> (free) to read and join the discussion on your plan's board.</p>;
  if (me.banned) return <p className="fo-err">Posting is paused on your account.</p>;
  if (!me.canPost) return <JoinForm />;
  return <>{children}</>;
}

/** New discussion (for a company), reply to the discussion, or answer to a comment (parent). */
export function Composer({ symbol, thread, parent, onDone, onCancel, autoFocus }: { symbol?: string; thread?: number; parent?: number; onDone: (p: Post) => void; onCancel?: () => void; autoFocus?: boolean }) {
  const [sym, setSym] = useState(symbol || ""), [title, setTitle] = useState(""), [body, setBody] = useState("");
  const kind = thread ? "reply" : "thread", problem = draftProblem(kind, title, body) || (!thread && !sym.trim() ? "Enter the company symbol." : "");
  const m = useMutation({
    mutationFn: () => send<{ post: Post; status: string; detail?: string }>("POST", thread ? `/api/forum/threads/${thread}/replies` : "/api/forum/threads",
      thread ? { body, ...(parent ? { parentId: parent } : {}) } : { symbol: sym.trim().toUpperCase(), title, body }),
    onSuccess: (r) => { setBody(""); setTitle(""); onDone(r.post); },
  });
  return (
    <form className={"fo-form" + (parent ? " fo-form-sm" : "")} onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      {!thread && !symbol && <label>Company symbol<input value={sym} onChange={(e) => setSym(e.target.value)} placeholder="e.g. RELIANCE" maxLength={24} autoCapitalize="characters" /></label>}
      {!thread && <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="A clear question or topic" autoFocus={autoFocus} /></label>}
      <label>{thread ? (parent ? "Your reply" : "Add a comment") : "What would you like to discuss? Share data and reasoning, not what others should buy or sell."}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} autoFocus={autoFocus && !!thread} rows={parent ? 3 : 5} /></label>
      <div className="fo-act">
        <button className="btn primary" disabled={!!problem || m.isPending}>{m.isPending ? "Posting…" : thread ? (parent ? "Reply" : "Comment") : "Post discussion"}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
        {problem && (title || body) && <span className="muted">{problem}</span>}
      </div>
      {m.data?.status === "held" && <div className="fo-note" role="status">{m.data.detail}</div>}
      {m.isError && <div className="fo-err" role="alert">{msg(m.error)}</div>}
    </form>
  );
}

const Up = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5 5 13h4.5v6h5v-6H19z" /></svg>;
const Bubble = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>;
const Avatar = ({ name }: { name: string }) => <span className="fo-av" aria-hidden="true">{(name || "m").slice(0, 1).toUpperCase()}</span>;

/** Upvote: members vote on others' posts (one vote each, can take it back); everyone sees the count. */
export function Vote({ p, onChange, row = false }: { p: Post; onChange: () => void; row?: boolean }) {
  const { data: me } = forumMe();
  const m = useMutation({ mutationFn: () => send(p.voted ? "DELETE" : "PUT", `/api/forum/posts/${p.id}/vote`), onSuccess: onChange });
  const can = !!me?.signedIn && !p.mine && p.status === "visible";
  const label = `${p.upvotes} upvote${p.upvotes === 1 ? "" : "s"}`;
  return (
    <span className={"fo-vote" + (row ? " row" : "") + (p.voted ? " on" : "")}>
      {can ? <button type="button" aria-pressed={p.voted} aria-label={p.voted ? `Remove your upvote (${label})` : `Upvote (${label})`} disabled={m.isPending}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); m.mutate(); }}><Up /></button> : <span className="fo-vote-i" title={p.mine ? "Your own post" : "Sign in to vote"}><Up /></span>}
      <b aria-hidden={can}>{p.upvotes}</b>
    </span>
  );
}

/** One discussion in a list: votes on the left, then title, the first lines, author, date and comment count. */
export function ThreadCard({ t, to, onOpen, showCompany = false, onChange }: { t: Post; to: string; onOpen?: (id: number) => void; showCompany?: boolean; onChange: () => void }) {
  return (
    <li className="fo-card">
      <Vote p={t} onChange={onChange} />
      <Link className="fo-card-main" to={to} onClick={onOpen ? (e) => { e.preventDefault(); onOpen(t.id); } : undefined}>
        {showCompany && <span className="fo-card-co"><b>{t.symbol}</b> {t.company}</span>}
        <h3>{t.title}</h3>
        {t.body && <p>{t.body}</p>}
        <span className="fo-card-meta"><Avatar name={t.author.handle} /><span>{t.author.handle}{t.author.staff && <em className="fo-staff">FinLit team</em>}</span>
          <span aria-hidden="true">·</span><span>{ago(t.createdAt)}</span><span aria-hidden="true">·</span><span className="fo-cc"><Bubble />{plural(t.replies, "comment")}</span></span>
      </Link>
    </li>
  );
}

export const SORT_LABEL = { active: "Most active", recent: "Newest", top: "Top" } as const;
type Sort = keyof typeof SORT_LABEL;

/** Discussions of one company (or of every company), with sort, title search, paging and "Start a discussion".
 *  State lives in the address (sort, q, page) unless `local` is set (the company report keeps its own address clean). */
export function ThreadList({ symbol, board = "", onOpen, linkTo = (t) => `/forum/t/${t.id}`, local = false, per = 20, startLabel = "Start a discussion", onCount }: {
  symbol?: string; board?: string; onOpen?: (id: number) => void; linkTo?: (t: Post) => string; local?: boolean; per?: number; startLabel?: string; onCount?: (n: number) => void;
}) {
  const [sp, setSp] = useSearchParams();
  const [st, setSt] = useState({ sort: "active" as Sort, q: "", page: 1 });
  const cur = local ? st : { sort: (["active", "recent", "top"].includes(sp.get("sort") || "") ? sp.get("sort") : "active") as Sort, q: sp.get("q") || "", page: Number(sp.get("page")) || 1 };
  const set = (k: "sort" | "q" | "page", v: string) => {
    if (local) { setSt((s) => ({ ...s, [k]: k === "page" ? Number(v) || 1 : v, ...(k !== "page" ? { page: 1 } : {}) })); return; }
    const n = new URLSearchParams(sp); v && !(k === "sort" && v === "active") ? n.set(k, v) : n.delete(k); if (k !== "page") n.delete("page"); setSp(n, { replace: true });
  };
  const [text, setText] = useState(cur.q), [compose, setCompose] = useState(false);
  const qc = useQueryClient(), { data: me } = forumMe();
  const list = useQuery<Page<{ threads: Post[] }>>({
    queryKey: ["forum", "threads", symbol || "", cur.sort, cur.q, cur.page, board, per],
    queryFn: () => apiGet(`/api/forum/threads?sort=${cur.sort}&page=${cur.page}&per=${per}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ""}${cur.q ? `&q=${encodeURIComponent(cur.q)}` : ""}${board ? `&board=${board}` : ""}`),
    enabled: !!me?.signedIn,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["forum"] });
  const total = list.data && !cur.q ? list.data.total : null;
  useEffect(() => { if (total != null) onCount?.(total); }, [total, onCount]);
  if (me && !me.signedIn) return <BoardNote />;
  return (
    <div className="fo-tl">
      <div className="fo-tl-top">
        <Writer quiet>{!compose && <button type="button" className="btn primary fo-start" onClick={() => setCompose(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></svg>{startLabel}</button>}</Writer>
        <form className="fo-search" role="search" onSubmit={(e) => { e.preventDefault(); set("q", text.trim()); }}>
          <input type="search" aria-label="Search discussion titles" placeholder="Search titles" value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value) set("q", ""); }} maxLength={60} />
        </form>
        <div className="seg fo-sort" role="group" aria-label="Sort discussions">{(Object.keys(SORT_LABEL) as Sort[]).map((s) => <button type="button" key={s} aria-pressed={cur.sort === s} onClick={() => set("sort", s)}>{SORT_LABEL[s]}</button>)}</div>
      </div>
      {compose && <Writer><div className="fo-compose card"><h3>{symbol ? `New discussion about ${symbol}` : "New discussion"}</h3>
        <Composer symbol={symbol} autoFocus onCancel={() => setCompose(false)} onDone={(p) => { setCompose(false); refresh(); if (p.status === "visible") onOpen?.(p.id); }} /></div></Writer>}
      {list.isPending ? <ul className="fo-cards" aria-busy="true">{[0, 1, 2].map((i) => <li key={i} className="fo-card skeleton" style={{ height: 96 }} />)}</ul>
        : list.isError ? <div className="fo-err" role="alert">{msg(list.error)} <button type="button" className="btn" onClick={() => list.refetch()}>Try again</button></div>
        : !list.data.threads.length ? <div className="fo-empty"><b>{cur.q ? "Nothing matches that search." : symbol ? "No discussions about this company yet." : "No discussions yet."}</b><span>{cur.q ? "Try another word, or clear the search." : "Start the first one: ask a question or share what you found in the filings."}</span></div>
        : <ul className="fo-cards">{list.data.threads.map((t) => <ThreadCard key={t.id} t={t} to={linkTo(t)} onOpen={onOpen} showCompany={!symbol} onChange={refresh} />)}</ul>}
      {list.data && <Pager page={cur.page} pages={list.data.pages} go={(n) => set("page", String(n))} />}
    </div>
  );
}

/** One comment with its replies underneath, indented with a line you can click to fold the branch (as on Reddit). */
function Comment({ n, thread, depth, onChange, open }: { n: Node; thread: Post; depth: number; onChange: () => void; open: boolean }) {
  const p = n.post, { data: me } = forumMe();
  const [folded, setFolded] = useState(false), [rep, setRep] = useState(false), [edit, setEdit] = useState(false), [body, setBody] = useState(p.body || "");
  const act = useMutation({ mutationFn: (f: () => Promise<unknown>) => f(), onSuccess: onChange });
  const gone = p.body === null;
  return (
    <li className={"fo-c" + (folded ? " is-folded" : "")} id={`p${p.id}`}>
      <div className="fo-c-head">
        <Avatar name={p.author.handle} /><b>{p.author.handle}</b>{p.author.staff && <em className="fo-staff">FinLit team</em>}
        {p.author.handle === thread.author.handle && <em className="fo-op" title="Started this discussion">OP</em>}
        <span>{ago(p.createdAt)}</span>{p.editedAt && <span>edited</span>}
        {folded && <span className="fo-c-hidden">{n.size ? plural(n.size + 1, "comment") + " hidden" : "hidden"}</span>}
      </div>
      {!folded && <>
        {p.note && <div className="fo-note">{p.note}</div>}
        {!gone && !edit && <Body text={p.body!} />}
        {edit && <form className="fo-form fo-form-sm" onSubmit={(e) => { e.preventDefault(); act.mutate(() => send("PATCH", `/api/forum/posts/${p.id}`, { body }).then(() => setEdit(false))); }}>
          <textarea aria-label="Edit your comment" value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
          <div className="fo-act"><button className="btn primary">Save</button><button type="button" className="btn" onClick={() => setEdit(false)}>Cancel</button></div></form>}
        {!gone && <div className="fo-c-act">
          <Vote p={p} onChange={onChange} row />
          {me?.signedIn && open && p.status === "visible" && <button type="button" className="fo-link" onClick={() => setRep(!rep)} aria-expanded={rep}>Reply</button>}
          {p.mine && p.canEdit && <button type="button" className="fo-link" onClick={() => setEdit(true)}>Edit</button>}
          {p.mine && <button type="button" className="fo-link" onClick={() => { if (confirm("Delete this comment?")) act.mutate(() => send("DELETE", `/api/forum/posts/${p.id}`)); }}>Delete</button>}
          {me?.signedIn && !p.mine && p.status === "visible" && <button type="button" className="fo-link" onClick={() => { const reason = prompt("Report this comment. Reason: advice, promotion, contact, abuse, spam, misleading, other", "advice"); if (reason) act.mutate(() => send("POST", `/api/forum/posts/${p.id}/report`, { reason: reason.trim().toLowerCase() })); }}>Report</button>}
        </div>}
        {act.isError && <div className="fo-err" role="alert">{msg(act.error)}</div>}
        {rep && <Writer><Composer thread={thread.id} parent={p.id} autoFocus onCancel={() => setRep(false)} onDone={() => { setRep(false); onChange(); }} /></Writer>}
      </>}
      <button type="button" className="fo-c-line" onClick={() => setFolded(!folded)} aria-expanded={!folded} aria-label={folded ? `Show ${p.author.handle}'s comment` : `Fold ${p.author.handle}'s comment${n.size ? ` and ${plural(n.size, "reply", "replies")}` : ""}`} />
      {!folded && n.children.length > 0 && <ul className={"fo-cs" + (depth >= 6 ? " flat" : "")}>{n.children.map((c) => <Comment key={c.post.id} n={c} thread={thread} depth={depth + 1} onChange={onChange} open={open} />)}</ul>}
    </li>
  );
}

/** A discussion: the opening post, then every comment as a tree. Used on its own page and inside the company report. */
export function ThreadView({ id, onBack, backLabel, header }: { id: number; onBack?: () => void; backLabel?: string; header?: (t: Post) => ReactNode }) {
  const qc = useQueryClient(), { data: me } = forumMe();
  const [sort, setSort] = useState<CommentSort>("best"), [writing, setWriting] = useState(false), [edit, setEdit] = useState(false), [title, setTitle] = useState(""), [body, setBody] = useState("");
  const q = useQuery<Page<{ thread: Post; replies: Post[]; truncated?: boolean }>>({ queryKey: ["forum", "thread", id, "tree"], queryFn: () => apiGet(`/api/forum/threads/${id}?tree=1`), retry: false });
  const act = useMutation({ mutationFn: (f: () => Promise<unknown>) => f(), onSuccess: () => qc.invalidateQueries({ queryKey: ["forum"] }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["forum"] });
  const back = onBack && <button type="button" className="fo-back" onClick={onBack}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>{backLabel || "Back"}</button>;
  if (q.isPending) return <div className="fo-thread">{back}<div className="skeleton" style={{ height: 160, borderRadius: 16 }} /></div>;
  if (q.isError) return <div className="fo-thread">{back}<div className="fo-empty"><b>{q.error instanceof ApiError && q.error.status === 410 ? "This discussion was removed." : "This discussion is not available."}</b><span>It may have been removed, or it may belong to another plan's board.</span></div></div>;
  const { thread: t, replies } = q.data, tree = buildTree(replies, sort), open = t.status === "visible";
  return (
    <div className="fo-thread">
      {back}
      {header?.(t)}
      <article className="fo-op-post card">
        <Vote p={t} onChange={refresh} />
        <div className="fo-op-main">
          <div className="fo-card-meta"><Avatar name={t.author.handle} /><b>{t.author.handle}</b>{t.author.staff && <em className="fo-staff">FinLit team</em>}<span aria-hidden="true">·</span><span>{ago(t.createdAt)}</span>{t.editedAt && <span>· edited</span>}</div>
          {!edit && <h2>{t.title}</h2>}
          {t.note && <div className="fo-note">{t.note}</div>}
          {!edit && t.body !== null && <Body text={t.body} />}
          {edit && <form className="fo-form" onSubmit={(e) => { e.preventDefault(); act.mutate(() => send("PATCH", `/api/forum/posts/${t.id}`, { title, body }).then(() => setEdit(false))); }}>
            <input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} /><textarea aria-label="Text" value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="fo-act"><button className="btn primary">Save</button><button type="button" className="btn" onClick={() => setEdit(false)}>Cancel</button></div></form>}
          {t.body !== null && me?.signedIn && <div className="fo-c-act">
            <span className="fo-cc"><Bubble />{plural(t.replies, "comment")}</span>
            {t.mine && t.canEdit && <button type="button" className="fo-link" onClick={() => { setTitle(t.title || ""); setBody(t.body || ""); setEdit(true); }}>Edit ({Math.max(1, Math.ceil(t.editableSeconds / 60))} min left)</button>}
            {t.mine && <button type="button" className="fo-link" onClick={() => { if (confirm("Delete this discussion?")) act.mutate(() => send("DELETE", `/api/forum/posts/${t.id}`)); }}>Delete</button>}
            {!t.mine && open && <button type="button" className="fo-link" onClick={() => { const reason = prompt("Report this discussion. Reason: advice, promotion, contact, abuse, spam, misleading, other", "advice"); if (reason) act.mutate(() => send("POST", `/api/forum/posts/${t.id}/report`, { reason: reason.trim().toLowerCase() })); }}>Report</button>}
            <button type="button" className="fo-link" onClick={() => { const url = `${location.origin}/forum/t/${t.id}`; if (navigator.share) navigator.share({ title: t.title || "FinLit discussion", url }).catch(() => undefined); else navigator.clipboard?.writeText(url); }}>Share</button>
          </div>}
          {act.isError && <div className="fo-err" role="alert">{msg(act.error)}</div>}
        </div>
      </article>
      {open && <Writer><div className="fo-reply-box">{writing
        ? <Composer thread={t.id} autoFocus onCancel={() => setWriting(false)} onDone={() => { setWriting(false); refresh(); }} />
        : <button type="button" className="fo-reply-open" onClick={() => setWriting(true)}>Add a comment…</button>}</div></Writer>}
      <div className="fo-cbar">
        <h3>{plural(q.data.total, "comment")}</h3>
        {replies.length > 1 && <label className="fo-csort">Sort by <select value={sort} onChange={(e) => setSort(e.target.value as CommentSort)}><option value="best">Best</option><option value="new">Newest</option><option value="old">Oldest</option></select></label>}
      </div>
      {!replies.length ? <p className="muted">No comments yet.{open ? " Be the first to reply." : ""}</p>
        : <ul className="fo-cs fo-cs-root">{tree.map((n) => <Comment key={n.post.id} n={n} thread={t} depth={1} onChange={refresh} open={open} />)}</ul>}
      {q.data.truncated && <p className="muted">Showing the first {replies.length.toLocaleString("en-IN")} comments.</p>}
    </div>
  );
}
