// Concall Monitor (task #278): earnings calls from companies' own exchange filings. One card per call (logo, company, ticker, date, time) with four
// independent buttons: Listen (the recording, played on the page when the company filed an audio file), Transcript (the full text, page by page), PPT
// (the investor presentation, shown in place) and AI Summary (written once from the transcript or presentation). Each card keeps its own open panel, so
// opening one never changes another. A button with nothing to open says why when pressed, never a dead click. Styles: styles/concall.css (prefix ccm-).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { CoLogo } from "../components/CoLogo";
import { useAuth } from "../lib/auth";
import { useDocTitle } from "../lib/title";
import { ApiError } from "../lib/api";
import { callDay, fileUrl, filedDay, PAGE, summaryBlocks, useCalls, useTranscript, writeSummary, type Call, type Scope, type Summary, type Tab } from "../lib/concalls";
import "../styles/concall.css";

const SUBTITLE = "Listen to earnings call recordings, read transcripts & investor presentations, and track upcoming result meets.";
const SCOPES: [Scope, string][] = [["all", "All"], ["portfolio", "Portfolio"], ["watchlist", "Watchlist"]];
type Panel = "listen" | "transcript" | "ppt" | "summary";

const ICON: Record<Panel, ReactNode> = {
  listen: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>,
  transcript: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>,
  ppt: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v10H4z M12 15v4 M8 19h8 M8 12l3-3 2 2 3-3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" /></svg>,
  summary: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>,
};
const LABEL: Record<Panel, string> = { listen: "Listen", transcript: "Transcript", ppt: "PPT", summary: "AI Summary" };

function useNarrow(px = 640) {
  const [n, setN] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(`(max-width: ${px}px)`).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const m = window.matchMedia(`(max-width: ${px}px)`);
    const on = () => setN(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, [px]);
  return n;
}

const Ext = ({ href, children }: { href: string; children: ReactNode }) => <a className="ccm-ext" href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a>;
const Why = ({ text }: { text: string }) => <p className="ccm-why" role="note">{text}</p>;

function ListenPanel({ c }: { c: Call }) {
  const l = c.listen;
  if (l.audio) return (
    <div>
      <audio className="ccm-audio" controls preload="none" src={l.audio} aria-label={`Recording of the ${c.name} call`}>Your browser cannot play this file: <a href={l.audio}>open the recording</a>.</audio>
      <p className="ccm-src">The audio file named in the company's letter{l.letter ? <> filed {filedDay(l.letter.filed)} · <Ext href={l.letter.link}>Letter</Ext></> : null} · <Ext href={l.audio}>Open the file</Ext></p>
    </div>);
  if (l.page) return <div><Why text={l.pageNote || ""} /><p className="ccm-src"><Ext href={l.page}>Open the recording page</Ext>{l.letter ? <> · <Ext href={l.letter.link}>Company's letter, filed {filedDay(l.letter.filed)}</Ext></> : null}</p></div>;
  if (l.letter) return <div><Why text={l.pageNote || ""} /><p className="ccm-src"><Ext href={l.letter.link}>Company's letter, filed {filedDay(l.letter.filed)}</Ext></p></div>;
  return <Why text={l.why || "No recording filed."} />;
}

function TranscriptPanel({ c }: { c: Call }) {
  const doc = c.transcript.doc;
  const t = useTranscript(doc ? doc.link : null);
  if (!doc) return <Why text={c.transcript.why || "No transcript filed."} />;
  return (
    <div>
      <p className="ccm-src">The transcript {c.name} filed with NSE on {filedDay(doc.filed)} · <Ext href={doc.link}>Original PDF</Ext></p>
      {t.isPending ? <p className="ccm-why">Reading the transcript…</p> : t.isError ? <Why text={`The transcript could not be read just now (${t.error.message}). Open the original PDF instead.`} />
        : t.data && t.data.pages.length ? (
          <div className="ccm-text" tabIndex={0} aria-label={`Transcript of the ${c.name} call`}>
            {t.data.pages.map((p, i) => p ? <section key={i}><h4>Page {i + 1}</h4><p>{p.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()}</p></section> : null)}
          </div>) : <Why text={t.data?.why || "No text in this file."} />}
    </div>);
}

function PptPanel({ c }: { c: Call }) {
  const doc = c.ppt.doc;
  const narrow = useNarrow();
  if (!doc) return <Why text={c.ppt.why || "No presentation filed."} />;
  return (
    <div>
      <p className="ccm-src">The investor presentation filed {filedDay(doc.filed)} · <Ext href={doc.link}>Open the PDF</Ext></p>
      {narrow ? <p className="ccm-why">On a phone the presentation opens in your browser's PDF viewer: use “Open the PDF”.</p>
        : <iframe className="ccm-frame" src={fileUrl(doc.link)} title={`Investor presentation of ${c.name}`} loading="lazy" />}
    </div>);
}

function SummaryPanel({ c }: { c: Call }) {
  const { user, plan } = useAuth();
  const [state, setState] = useState<{ s?: Summary; err?: string; busy?: boolean }>({});
  const asked = useRef(false);
  const link = c.summary.link;
  const allowed = !!user && plan !== "basic";
  useEffect(() => {
    if (!link || !allowed || asked.current) return;
    asked.current = true;
    setState({ busy: true });
    writeSummary(link).then((s) => setState({ s }), (e: ApiError) => setState({ err: e.body?.detail || e.message }));
  }, [link, allowed]);
  if (!link) return <Why text={c.summary.why || "Nothing to summarise yet."} />;
  if (!user) return <p className="ccm-why">AI summaries are for signed-in Silver and Gold members. <Link to="/login">Sign in</Link></p>;
  if (!allowed) return <p className="ccm-why">AI summaries are part of the Silver and Gold plans (10 a month). <Link to="/plans">See the plans</Link></p>;
  if (state.busy) return <p className="ccm-why">Writing the summary from the {c.summary.source}…</p>;
  if (state.err) return <Why text={state.err} />;
  const s = state.s;
  if (!s) return null;
  return (
    <div className="ccm-sum">
      {summaryBlocks(s.text).map((b, i) => "h" in b ? <h4 key={i}>{b.h}</h4> : <p key={i} className="ccm-li" dangerouslySetInnerHTML={{ __html: bold(b.li) }} />)}
      <p className="ccm-src">Written by FinLit AI from the {s.source === "transcript" ? "call's transcript" : "investor presentation (no transcript filed yet)"}
        {s.cached ? " · opened free (written earlier)" : ` · ${s.used} of ${s.limit} AI summaries used this month`}</p>
      <p className="ccm-disc">{s.disclaimer}</p>
    </div>);
}

/** **word** -> <b>word</b>, the rest escaped. */
function bold(t: string) {
  const esc = t.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
  return esc.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

const has = (c: Call, p: Panel) => p === "listen" ? !c.listen.why : p === "transcript" ? !!c.transcript.doc : p === "ppt" ? !!c.ppt.doc : !!c.summary.link;

/** One call. Its open panel is its own state: opening one card never changes another. */
export function CallCard({ c }: { c: Call }) {
  const [open, setOpen] = useState<Panel | null>(null);
  const id = `ccm-${c.id.replace(/[^A-Za-z0-9]/g, "-")}`;
  const day = callDay(c.date);
  return (
    <article className={"ccm-card" + (c.upcoming ? " is-up" : "")} aria-labelledby={`${id}-n`}>
      <div className="ccm-row">
        <div className="ccm-co">
          <CoLogo symbol={c.symbol} name={c.name} size={40} />
          <div className="ccm-names">
            <Link id={`${id}-n`} className="ccm-name" to={`/stocks/${encodeURIComponent(c.symbol)}`}>{c.name}</Link>
            <span className="ccm-tick">{c.symbol}<span className="ccm-kind"> · {c.kind}{c.quarter ? ` · ${c.quarter}` : ""}</span></span>
          </div>
        </div>
        <div className="ccm-when">
          {day ? <b>{day}</b> : <b className="ccm-nodate" title={c.dateNote || ""}>Date not stated</b>}
          <span className={c.timeLabel ? "" : "ccm-notime"}>{c.timeLabel ? `${c.timeLabel} IST` : (c.timeNote || "Time not stated")}</span>
          {c.upcoming ? <i className="ccm-up">Upcoming</i> : null}
        </div>
        <div className="ccm-acts" role="group" aria-label={`${c.name}: recording, transcript, presentation, AI summary`}>
          {(Object.keys(LABEL) as Panel[]).map((p) => {
            const ok = has(c, p);
            return (
              <button key={p} type="button" className={"ccm-btn ccm-" + p + (ok ? "" : " is-off") + (open === p ? " is-on" : "")} aria-expanded={open === p} aria-controls={`${id}-p`}
                aria-disabled={!ok} title={ok ? undefined : (p === "listen" ? c.listen.why : p === "summary" ? c.summary.why : (c[p] as { why?: string }).why) || undefined}
                onClick={() => setOpen(open === p ? null : p)}>{ICON[p]}<span>{LABEL[p]}</span></button>);
          })}
        </div>
      </div>
      {c.dateNote && !day ? <p className="ccm-note">{c.dateNote}</p> : null}
      {open ? (
        <div className="ccm-panel" id={`${id}-p`} role="region" aria-label={`${LABEL[open]}: ${c.name}`}>
          {open === "listen" ? <ListenPanel c={c} /> : open === "transcript" ? <TranscriptPanel c={c} /> : open === "ppt" ? <PptPanel c={c} /> : <SummaryPanel c={c} />}
        </div>) : null}
    </article>
  );
}

export function ConcallMonitorPage() {
  useDocTitle("Concall Monitor", SUBTITLE);
  const [sp, setSp] = useSearchParams();
  const scope = (SCOPES.some(([k]) => k === sp.get("scope")) ? sp.get("scope") : "all") as Scope;
  const tab: Tab = sp.get("tab") === "upcoming" ? "upcoming" : "latest";
  const [q, setQ] = useState(sp.get("q") || "");
  const [typed, setTyped] = useState(q);
  const [searching, setSearching] = useState(!!q);
  const [limit, setLimit] = useState(PAGE);
  const inp = useRef<HTMLInputElement>(null);
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); setLimit(PAGE); };
  useEffect(() => { const t = setTimeout(() => { setQ(typed); set("q", typed.trim() || null); }, 250); return () => clearTimeout(t); }, [typed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (searching) inp.current?.focus(); }, [searching]);
  const r = useCalls(scope, tab, q, limit);
  const d = r.data;
  return (
    <div className="page ccm">
      <PageHeader title="Concall Monitor" description={SUBTITLE} art="calendar" links={["/results", "/results/quarter", "/news"]} learn={false} />
      <div className="ccm-bar">
        <div className="ccm-seg" role="tablist" aria-label="Which companies">
          {SCOPES.map(([k, l]) => <button key={k} role="tab" aria-selected={scope === k} className={scope === k ? "is-on" : ""} onClick={() => set("scope", k === "all" ? null : k)}>{l}</button>)}
        </div>
        <div className="ccm-right">
          {searching ? (
            <label className="ccm-search"><span className="sr-only">Search a company</span>
              <input ref={inp} type="search" value={typed} placeholder="Company or symbol" onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setTyped(""); setSearching(false); } }} />
            </label>) : null}
          <button type="button" className={"ccm-icon" + (searching ? " is-on" : "")} aria-label={searching ? "Close the search" : "Search a company"} aria-pressed={searching}
            onClick={() => { if (searching) setTyped(""); setSearching(!searching); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
          <div className="ccm-seg" role="tablist" aria-label="Latest or upcoming calls">
            {(["latest", "upcoming"] as Tab[]).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => set("tab", k === "latest" ? null : k)}>
              {k === "latest" ? "Latest" : "Upcoming"}{d ? <em>{d.counts[k]}</em> : null}</button>)}
          </div>
        </div>
      </div>
      {r.isPending ? <p className="ccm-empty">Loading the calls…</p>
        : r.isError ? <p className="ccm-empty">The calls could not be loaded just now ({r.error.message}). <button className="ccm-link" onClick={() => r.refetch()}>Try again</button></p>
        : d && d.signIn ? <p className="ccm-empty">{d.scopeNote} <Link to="/login">Sign in</Link></p>
        : d && !d.items.length ? <p className="ccm-empty">{d.scopeNote || (q.trim() ? `No ${tab} call matches “${q.trim()}”.` : tab === "upcoming"
            ? "No earnings call is scheduled in the filings yet. Companies announce a call a few days before it; it appears here once the schedule is filed."
            : "No calls in the filings of the last four months.")}</p>
        : d ? (
          <>
            <div className="ccm-list">{d.items.map((c) => <CallCard key={c.id} c={c} />)}</div>
            {d.total > d.items.length ? <button className="ccm-more" onClick={() => setLimit(limit + PAGE)} disabled={r.isFetching}>{r.isFetching ? "Loading…" : `Show more (${d.total - d.items.length} left)`}</button> : null}
          </>) : null}
      {d ? <p className="ccm-foot">Source: {d.source}{d.readAt ? `, read ${new Date(d.readAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}. Dates and times are as the companies' letters state them (IST). {d.disclaimer}</p> : null}
    </div>
  );
}
