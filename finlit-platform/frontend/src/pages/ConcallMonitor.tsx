// Concall Monitor (task #278): earnings calls from companies' own exchange filings. One row per call (logo, company, ticker, time) with four
// independent actions: Listen (the recording, played on the page when the company filed an audio file), Transcript (the full text, page by page), PPT
// (the investor presentation, shown in place) and AI Summary (written once from the transcript or presentation). Each row keeps its own open panel, so
// opening one never changes another. An action with nothing to open says why when pressed, never a dead click. Styles: styles/concall.css (ccm-).
// Task #306 (developer file 16, compact layout): one toolbar (Latest / Upcoming, a search box that is always there, and the Companies, Has, Quarter and
// Type dropdowns of developer file 13, each with counts worked out on the server with the other filters applied), the filters on as chips, a count line
// with Sort, the calls grouped by day, rows about 58 px high with the four actions in fixed columns (one that cannot be used is a dashed 32 px icon with
// its reason), and "Show more" that adds the next 30 (it used to ask the server for 90, beyond its cap of 60, and the list disappeared).
// Styles: styles/concall-compact.css (p4-), discovery/discover.css (dbx-).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { CoLogo } from "../components/CoLogo";
import { useAuth } from "../lib/auth";
import { useDocTitle } from "../lib/title";
import { ApiError } from "../lib/api";
import { dayLabel, fileUrl, filedDay, shortDay, summaryBlocks, timeText, useCalls, useTranscript, writeSummary,
  type Call, type CallList, type Has, type Scope, type Sort, type Summary, type Tab } from "../lib/concalls";
import { Chips, Dd, Ico, OptList, Sw, type Opt } from "../discovery/Toolbar";
import "../styles/concall.css";
import "../discovery/discover.css";
import "../styles/concall-compact.css";

const SUBTITLE = "Listen to earnings call recordings, read transcripts & investor presentations, and track upcoming result meets.";   // the page's search description
const HEAD_DESC = "Earnings call recordings, transcripts, investor presentations and upcoming result meets.";   // the header's one line (founder, 22 Nov 2026)
const SCOPES: [Scope, string][] = [["all", "All companies"], ["portfolio", "My portfolio"], ["watchlist", "My watchlist"]];
const HAS: [Has, string][] = [["listen", "Recording"], ["transcript", "Transcript"], ["ppt", "Presentation"], ["summary", "AI summary possible"]];
const SORTS: [Sort, string][] = [["new", "Newest first"], ["old", "Oldest first"], ["az", "Company A–Z"]];
const NO_QUARTER = "none";
const nf = (n: number) => n.toLocaleString("en-IN");
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

const whyOf = (c: Call, p: Panel) => (p === "listen" ? c.listen.why : p === "summary" ? c.summary.why : (c[p] as { why?: string }).why) || undefined;

/** One call, one row. Its open panel is its own state: opening one row never changes another, and the row does not move. `az`: the list is sorted by
 *  company, so the row shows its date (there are no day headings then). */
export function CallCard({ c, az = false }: { c: Call; az?: boolean }) {
  const [open, setOpen] = useState<Panel | null>(null);
  const id = `ccm-${c.id.replace(/[^A-Za-z0-9]/g, "-")}`;
  const time = timeText(c.timeLabel);
  return (
    <article className={"ccm-card p4-cc" + (c.upcoming ? " is-up" : "") + (open ? " is-open" : "")} aria-labelledby={`${id}-n`}>
      <div className="p4-cr">
        <div className="ccm-co">
          <CoLogo symbol={c.symbol} name={c.name} size={34} />
          <div className="ccm-names">
            <Link id={`${id}-n`} className="ccm-name" to={`/stocks/${encodeURIComponent(c.symbol)}`}>{c.name}</Link>
            <span className="ccm-tick">{c.symbol}<span className="ccm-kind"> · {c.kind}{c.quarter ? ` · ${c.quarter}` : ""}</span>
              {c.mine === "portfolio" ? <span className="p4-tag pf">Portfolio</span> : c.mine === "watchlist" ? <span className="p4-tag wl">Watchlist</span> : null}</span>
          </div>
        </div>
        <div className={"p4-when" + (time ? "" : " none")}>
          {az ? <b title={c.dateNote || undefined}>{shortDay(c.date) || "Date not stated"}</b> : null}
          <span title={time ? "IST, as the company's letter states it" : c.timeNote || undefined}>{time ? `${time} IST` : (c.timeNote || "Time not stated in the filings")}</span>
          {c.upcoming ? <i className="ccm-up">Upcoming</i> : null}
        </div>
        <div className="p4-acts" role="group" aria-label={`${c.name}: recording, transcript, presentation, AI summary`}>
          {(Object.keys(LABEL) as Panel[]).map((p) => {
            const ok = has(c, p);
            return (
              <button key={p} type="button" className={"p4-ab p4-ab-" + p + (ok ? "" : " off") + (open === p ? " on" : "")} aria-expanded={open === p} aria-controls={`${id}-p`}
                aria-disabled={!ok} aria-label={ok ? undefined : `${LABEL[p]}: ${whyOf(c, p) || "not available"}`} title={ok ? undefined : whyOf(c, p)}
                onClick={() => setOpen(open === p ? null : p)}>{ICON[p]}<span>{LABEL[p]}</span></button>);
          })}
        </div>
      </div>
      {c.dateNote && !c.date ? <p className="ccm-note">{c.dateNote}</p> : null}
      {open ? (
        <div className="ccm-panel" id={`${id}-p`} role="region" aria-label={`${LABEL[open]}: ${c.name}`}>
          {open === "listen" ? <ListenPanel c={c} /> : open === "transcript" ? <TranscriptPanel c={c} /> : open === "ppt" ? <PptPanel c={c} /> : <SummaryPanel c={c} />}
        </div>) : null}
    </article>
  );
}

/** The calls in order, grouped by day (one heading per day, with how many calls that day has over the whole filtered list). */
function Days({ items, days, az }: { items: Call[]; days: Record<string, number>; az: boolean }) {
  if (az) return <section className="p4-day" aria-label="Calls by company"><div className="p4-cl">{items.map((c) => <CallCard key={c.id} c={c} az />)}</div></section>;
  const groups: { d: string | null; r: Call[] }[] = [];
  for (const c of items) { const g = groups[groups.length - 1]; if (g && g.d === c.date) g.r.push(c); else groups.push({ d: c.date, r: [c] }); }
  return <>{groups.map((g, i) => {
    const n = days[g.d || ""] ?? g.r.length, label = dayLabel(g.d);
    return <section key={(g.d || "none") + i} className="p4-day" aria-label={label}>
      <h3 className="p4-dh">{label}<span>{nf(n)} {n === 1 ? "call" : "calls"}</span></h3>
      <div className="p4-cl">{g.r.map((c) => <CallCard key={c.id} c={c} />)}</div></section>;
  })}</>;
}

export function ConcallMonitorPage() {
  useDocTitle("Concall Monitor", SUBTITLE);
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const scope = (SCOPES.some(([k]) => k === sp.get("scope")) ? sp.get("scope") : "all") as Scope;
  const tab: Tab = sp.get("tab") === "upcoming" ? "upcoming" : "latest";
  const hasOn = useMemo(() => (sp.get("has") || "").split(",").filter((h): h is Has => HAS.some(([k]) => k === h)), [sp]);
  const quarter = sp.get("quarter") || "", kind = sp.get("kind") || "";
  const sort = (SORTS.some(([k]) => k === sp.get("sort")) ? sp.get("sort") : "new") as Sort;
  const [typed, setTyped] = useState(sp.get("q") || "");
  const [q, setQ] = useState(typed);
  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    setSp(n, { replace: true });
  };
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => { setQ(typed); set({ q: typed.trim() || null }); }, 250);
    return () => clearTimeout(t);
  }, [typed]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = useCalls({ scope, tab, q, has: hasOn, quarter, kind, sort });
  const pages = r.data?.pages ?? [];
  const d: CallList | undefined = pages[0];
  const items = useMemo(() => { const seen = new Set<string>(); return pages.flatMap((p) => p.items).filter((c) => !seen.has(c.id) && !!seen.add(c.id)); }, [pages]);
  const f = d?.facets;
  const toggleHas = (h: Has, on: boolean) => { const n = on ? [...hasOn, h] : hasOn.filter((x) => x !== h); set({ has: n.length ? HAS.map(([k]) => k).filter((k) => n.includes(k)).join(",") : null }); };
  const scopeItems: Opt[] = SCOPES.map(([v, t]) => ({ v, t, c: f ? f.scope[v] : null, sel: scope === v, all: v === "all" }));
  const quarterItems: Opt[] = [{ v: "", t: "Any quarter", sel: !quarter, all: true },
    ...(f?.quarter ?? []).map((x) => ({ v: x.v, t: x.v === NO_QUARTER ? "Not stated in the filing" : x.v, c: x.n, sel: quarter === x.v }))];
  const kindItems: Opt[] = [{ v: "", t: "Any type", sel: !kind, all: true }, ...(f?.kind ?? []).map((x) => ({ v: x.v, t: x.v, c: x.n, sel: kind === x.v }))];
  const chips: [string, string][] = [];
  if (scope !== "all") chips.push(["scope", SCOPES.find(([k]) => k === scope)![1]]);
  for (const h of hasOn) chips.push(["has:" + h, "Has " + HAS.find(([k]) => k === h)![1].toLowerCase()]);
  if (quarter) chips.push(["quarter", quarter === NO_QUARTER ? "Quarter not stated" : quarter]);
  if (kind) chips.push(["kind", kind]);
  if (q.trim()) chips.push(["q", `“${q.trim()}”`]);
  const unset = (k: string) => {
    if (k === "all") { setTyped(""); setQ(""); set({ scope: null, has: null, quarter: null, kind: null, q: null }); return; }
    if (k.startsWith("has:")) { toggleHas(k.slice(4) as Has, false); return; }
    if (k === "q") { setTyped(""); setQ(""); }
    set({ [k]: null });
  };
  const filtered = chips.length > 0;
  const total = d?.total ?? 0, shown = items.length;
  const have = d?.have;
  return (
    <div className="page ccm p4">
      <PageHeader title="Concall Monitor" description={HEAD_DESC} art="calendar" links={["/results", "/results/quarter", "/news"]} learn={false} />
      <div className="p4-tools">
        <div className="ccm-seg" role="tablist" aria-label="Latest or upcoming calls">
          {(["latest", "upcoming"] as Tab[]).map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => set({ tab: k === "latest" ? null : k })}>
            {k === "latest" ? "Latest" : "Upcoming"}{d ? <em>{nf(d.counts[k])}</em> : null}</button>)}
        </div>
        <label className="dbx-q">{Ico.search}<input type="search" placeholder="Search a company or symbol" aria-label="Search a company" value={typed} autoComplete="off"
          onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setTyped(""); }} /></label>
        <div className="dbx-dds">
          <Dd label="Companies" value={scope !== "all" ? SCOPES.find(([k]) => k === scope)![1] : ""} icon={Ico.star} title="Which companies">
            {(close) => <><OptList title="Which companies" items={scopeItems} onPick={(v) => { set({ scope: v === "all" ? null : v }); close(); }} />
              {!user ? <p className="dbx-pn">Sign in to see the calls of the companies in your portfolio and watchlists.</p> : null}</>}
          </Dd>
          <Dd label="Has" badge={hasOn.length || null} icon={Ico.tune} title="Calls that have">
            {() => <>{HAS.map(([k, t]) => { const on = hasOn.includes(k), n = f ? f.has[k] : null;
              return <Sw key={k} label={t} on={on} n={n} disabled={!on && n === 0} onChange={(v) => toggleHas(k, v)} />; })}
              <p className="dbx-pn">Recording: a link the company filed. Transcripts come within 5 working days of the call (SEBI LODR).</p></>}
          </Dd>
          <Dd label="Quarter" value={quarter ? (quarter === NO_QUARTER ? "Not stated" : quarter) : ""} title="Quarter">
            {(close) => <OptList title="Quarter" items={quarterItems} onPick={(v) => { set({ quarter: v || null }); close(); }} />}
          </Dd>
          <Dd label="Type" value={kind} title="Type of call">
            {(close) => <OptList title="Type of call" items={kindItems} onPick={(v) => { set({ kind: v || null }); close(); }} />}
          </Dd>
        </div>
      </div>
      <Chips chips={chips} unset={unset} />
      {d && !d.signIn && total ? (
        <div className="dbx-rbar p4-rbar">
          <span className="dbx-cnt"><b>{nf(total)}</b> {tab === "upcoming" ? (total === 1 ? "upcoming call" : "upcoming calls") : (total === 1 ? "call" : "calls")}{filtered ? " match" : ""}
            {shown < total ? ` · showing the ${sort === "new" ? (tab === "upcoming" ? "soonest" : "newest") : sort === "old" ? (tab === "upcoming" ? "furthest" : "oldest") : "first"} ${nf(shown)}` : ""}
            {have ? <span className="p4-have">{nf(have.listen)} with a recording · {nf(have.transcript)} {have.transcript === 1 ? "transcript" : "transcripts"} · {nf(have.ppt)} {have.ppt === 1 ? "presentation" : "presentations"}</span> : null}</span>
          <div className="p4-sort"><span className="dbx-sl">Sort</span>
            <Dd label={SORTS.find(([k]) => k === sort)![1]} title="Sort by" right>
              {(close) => <OptList title="Sort by" items={SORTS.map(([v, t]) => ({ v, t, sel: sort === v }))} onPick={(v) => { set({ sort: v === "new" ? null : v }); close(); }} />}
            </Dd></div>
        </div>) : null}
      {r.isPending ? <p className="ccm-empty">Loading the calls…</p>
        : r.isError && !d ? <p className="ccm-empty">The calls could not be loaded just now ({r.error.message}). <button className="ccm-link" onClick={() => r.refetch()}>Try again</button></p>
        : d && d.signIn ? <p className="ccm-empty">{d.scopeNote} <Link to="/login">Sign in</Link></p>
        : d && !items.length ? <p className="ccm-empty">{d.scopeNote || (q.trim() ? `No ${tab} call matches “${q.trim()}”.` : filtered ? "No call matches these filters." : tab === "upcoming"
            ? "No earnings call is scheduled in the filings yet. Companies announce a call a few days before it; it appears here once the schedule is filed."
            : "No calls in the filings of the last four months.")}</p>
        : d ? (
          <>
            <Days items={items} days={d.days || {}} az={sort === "az"} />
            {r.hasNextPage ? <button className="ccm-more" onClick={() => r.fetchNextPage()} disabled={r.isFetchingNextPage}>{r.isFetchingNextPage ? "Loading…" : `Show more (${nf(total - shown)} left)`}</button> : null}
            {r.isFetchNextPageError ? <p className="ccm-why" role="alert">The next calls could not be loaded just now. The ones above stay; press Show more again.</p> : null}
          </>) : null}
      {d ? <p className="ccm-foot">Source: {d.source}{d.readAt ? `, read ${new Date(d.readAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}. Dates and times are as the companies' letters state them (IST). {d.disclaimer}</p> : null}
    </div>
  );
}
