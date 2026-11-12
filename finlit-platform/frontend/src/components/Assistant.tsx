import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { faqForPath } from "../lib/pageFaqs";
import { SECOND } from "../lib/questionBank";
import { askAssistant } from "../lib/siteApi";
import { apiGet, type SearchIndex } from "../lib/api";
import {
  CATEGORIES, QUARTERS, SEGMENTS, TABS, categoryQuestions, isLenderSector, financialYears, quarterQuestion, quarterTrendQuestion, related, tabQuestions, writtenAnswer,
  type CategoryId, type Q, type TabId,
} from "../lib/askFlow";
import { Icon } from "../lib/icons";
import { Link } from "react-router";
import { TOPICS, clearRecent, loadRecent, loadSaved, pushRecent, searchQuestions, toggleSaved } from "../lib/askExplorer";
import { STARTERS } from "../lib/questionBank";
import "../styles/ask-ai.css";

/** Fired by the header button; the assistant panel listens for it. */
export const OPEN_AI = "finlit:open-ai";
type Msg = { role: "user" | "assistant"; content: string };
type View = "home" | "segments" | "topic" | "company" | "chat" | "history" | "saved";

let indexPromise: Promise<SearchIndex> | null = null;
/** Companies matching what the user typed (symbol first, then name), from the site's own search index (loaded once). */
async function findCompanies(q: string): Promise<{ symbol: string; name: string }[]> {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  indexPromise ??= apiGet<SearchIndex>("/api/stocks/search-index").catch((e) => { indexPromise = null; throw e; });
  const idx = await indexPromise;
  const rows = idx.rows.map((r) => ({ symbol: r[0], name: r[1] }));
  const starts = rows.filter((r) => r.symbol.toLowerCase().startsWith(t) || r.name.toLowerCase().startsWith(t));
  const has = rows.filter((r) => !starts.includes(r) && r.name.toLowerCase().includes(t));
  return [...starts, ...has].slice(0, 6);
}

const companyOf = (pathname: string) => { const m = /^\/stocks\/([A-Za-z0-9&.\-]{1,20})\/?$/.exec(pathname); return m ? decodeURIComponent(m[1]).toUpperCase() : null; };

/** Ask FinLit AI. The flow: a general landing, a choice of segment, a company with its question tabs (Q1 to Q4 for results), then answers with related
 *  questions, the company kept in context. Chosen questions answer from the written starters or the site's language model; nothing here is advice. */
export function Assistant({ sector }: { sector?: string | null } = {}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("home");
  const [back, setBack] = useState<View>("home");          // where the back arrow goes from the conversation
  const [category, setCategory] = useState<Exclude<CategoryId, "company"> | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("suggested");
  const [pendingTab, setPendingTab] = useState<TabId>("financials");   // the segment chosen before a company was
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [find, setFind] = useState("");
  const [found, setFound] = useState<{ symbol: string; name: string }[]>([]);
  const [findErr, setFindErr] = useState("");
  const [menuOpen, setMenuOpen] = useState(true);
  const [qtr, setQtr] = useState<number | null>(null), [fy, setFy] = useState<string>(() => financialYears()[1]);   // the period chosen in the full window (the latest finished financial year first)
  const [big, setBig] = useState<boolean>(() => { try { const v = localStorage.getItem("finlit-ai-full"); if (v != null) return v === "1"; } catch { /* private window */ } return typeof window !== "undefined" && window.innerWidth >= 1100; });   // the full window: remembered once chosen, and the first choice on a wide screen (task #59)
  const toggleBig = () => setBig((b) => { try { localStorage.setItem("finlit-ai-full", b ? "0" : "1"); } catch { /* private window */ } return !b; });
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [pick, setPick] = useState(0);                      // bumps when the input must select XYZ
  const [topicId, setTopicId] = useState(TOPICS[0].id), [exq, setExq] = useState("");   // the question explorer of the full window
  const [recent, setRecent] = useState<string[]>(() => loadRecent()), [saved, setSaved] = useState<string[]>(() => loadSaved());
  const loc = useLocation();
  const pageCompany = companyOf(loc.pathname);
  const lender = isLenderSector(sector);

  useEffect(() => { const o = () => setOpen(true); addEventListener(OPEN_AI, o); return () => removeEventListener(OPEN_AI, o); }, []);   // the "Ask FinLit AI" button in the header bar
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [msgs, view, tab, open, busy, found]);
  useEffect(() => {   // Esc closes the panel (a dialog must)
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key !== "Escape") return; if (big) setBig(false); else setOpen(false); };   // Esc leaves the full window first
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [open, big]);
  useEffect(() => {   // the page behind a full window does not scroll
    if (!open || !big) return;
    const o = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = o; };
  }, [open, big]);
  useEffect(() => {   // a question about two companies lands in the input with XYZ selected, ready to be typed over
    const el = field.current;
    if (!pick || !el) return;
    const at = el.value.indexOf(SECOND);
    el.focus();
    if (at >= 0) el.setSelectionRange(at, at + SECOND.length);
  }, [pick]);
  useEffect(() => {   // on a company page the assistant starts in that company's context; moving to another company page follows it
    if (pageCompany) { setCompany(pageCompany); setView((v) => (v === "home" && !msgs.length ? "company" : v)); setTab("suggested"); }
  }, [pageCompany]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // company search as the user types
    if (view !== "segments") return;
    let live = true;
    const id = setTimeout(() => { findCompanies(find).then((r) => { if (live) { setFound(r); setFindErr(""); } }).catch(() => live && setFindErr("The company list could not be loaded just now. Please try again.")); }, 150);
    return () => { live = false; clearTimeout(id); };
  }, [find, view]);
  const asked = useMemo(() => msgs.filter((m) => m.role === "user").map((m) => m.content), [msgs]);
  if (loc.pathname.startsWith("/admin")) return null;

  const pool: Q[] = category ? categoryQuestions(category) : company ? [...tabQuestions(tab, company, lender), ...tabQuestions("suggested", company, lender)] : [];
  const relatedQs = related(pool, asked);

  const goCompany = (sym: string, t: TabId) => { setCompany(sym); setTab(t); setFind(""); setFound([]); setView("company"); };
  const ask = async (q: string, via: View) => {
    if (!q || busy) return;
    setBack(via === "chat" ? back : via); setView("chat"); setText(""); setRecent((r) => pushRecent(r, q));
    const written = writtenAnswer(q);
    const history = msgs.filter((m) => m.content);
    setMsgs((m) => [...m, { role: "user", content: q }]);
    if (written) { setMsgs((m) => [...m, { role: "assistant", content: written }]); return; }
    setBusy(true);
    const withContext = company && !q.toUpperCase().includes(company) ? `About ${company}: ${q}` : q;   // the company stays in context for a follow-up
    try { const r = await askAssistant(withContext, history); setMsgs((m) => [...m, { role: "assistant", content: r.response }]); }
    catch (er) { setMsgs((m) => [...m, { role: "assistant", content: (er as Error).message || "I couldn't answer that just now. Please try again or use the contact form." }]); }
    finally { setBusy(false); }
  };
  const tapQ = (q: Q) => {
    if (q.needsSecondCompany) { setText(q.text); setPick((n) => n + 1); return; }   // the second company is the user's to name: nothing is sent yet
    void ask(q.text, view);
  };
  const askPage = (q: string, a: string) => { setBack(view); setView("chat"); setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: a }]); };
  const goBack = () => {
    if (view === "chat") { setView(back); return; }
    if (view === "company") { setView(pageCompany ? "home" : "segments"); return; }
    setView("home");
  };
  const pageFaq = faqForPath(loc.pathname);
  const sub = view === "company" || (view === "chat" && company) ? company : null;
  const row = (q: Q) => <li key={q.id}><button type="button" className="aif-q" onClick={() => tapQ(q)} title={q.needsSecondCompany ? `Replace ${SECOND} with the second company, then send` : undefined}><Icon name="chat" /><span>{q.text}</span><Icon name="arrow" /></button></li>;
  const send = (e: React.FormEvent) => { e.preventDefault(); void ask(text.trim(), view === "chat" ? back : view); };

  return (
    <>
      {open && (
        <section className={"ai aif" + (big ? " full" : "") + (big && !menuOpen ? " nomenu" : "")} role="dialog" aria-label="FinLit AI assistant">
          {big && !menuOpen && <button type="button" className="aif-unfold" onClick={() => setMenuOpen(true)} aria-label="Show the menu" title="Show the menu"><Icon name="bars" /></button>}
          {big && menuOpen && <aside className="aif-side" aria-label="FinLit AI menu">
            <div className="aif-brand"><Icon name="bars" /><b>FinLit</b><span>AI</span><button type="button" className="aif-fold" onClick={() => setMenuOpen(false)} aria-label="Hide the menu" title="Hide the menu"><Icon name="bars" /></button></div>
            <nav aria-label="FinLit AI sections">
              <button type="button" className={view === "home" ? "on" : ""} aria-current={view === "home" ? "page" : undefined} onClick={() => setView("home")}><Icon name="home" />Home</button>
              <button type="button" className={view === "history" ? "on" : ""} aria-current={view === "history" ? "page" : undefined} onClick={() => setView("history")}><Icon name="refresh" />Chat History</button>
              <button type="button" className={view === "saved" ? "on" : ""} aria-current={view === "saved" ? "page" : undefined} onClick={() => setView("saved")}><Icon name="star" />Saved Questions</button>
            </nav>
            <p className="aif-sl"><Icon name="spark" /> Popular Questions</p>
            <ul className="aif-pop">{STARTERS.slice(0, 4).map((x) => <li key={x.q}><button type="button" onClick={() => void ask(x.q, "home")}><Icon name="chat" /><span>{x.q}</span></button></li>)}</ul>
            <button type="button" className="aif-va" onClick={() => setView("home")}>View all <Icon name="arrow" /></button>
            <Link className="aif-pro" to="/pricing" onClick={() => setOpen(false)}><Icon name="crown" /><span><b>FinLit AI <em>Pro</em></b><small>Deeper analysis · More questions</small></span><Icon name="arrow" /></Link>
          </aside>}
          <header className={big ? "aif-hd" : undefined}>
            {view !== "home" && <button type="button" className="aif-back" onClick={goBack} aria-label="Back"><Icon name="arrow" /></button>}
            <div className="aif-title"><b>FinLit AI</b><span>{sub ?? "Your investing & market research assistant"}</span></div>
            {company && view !== "home" && <button type="button" className="aif-change" onClick={() => { setCompany(null); setView("segments"); }}>Change company</button>}
            <button type="button" className="aif-full" onClick={toggleBig} aria-pressed={big} aria-label={big ? "Back to the small window" : "Open in a full window"} title={big ? "Back to the small window" : "Full window"}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{big ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}</svg></button>
            {big && <Link className="aif-help" to="/faq" onClick={() => setOpen(false)} aria-label="Help and frequently asked questions" title="Help"><Icon name="info" /></Link>}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </header>
          <div className="ai-body">
            {view === "home" && big && <>
              <div className="aif-hero"><svg className="aif-bot" viewBox="0 0 120 110" width="132" height="120" aria-hidden="true">
                <defs><radialGradient id="aifbg" cx="50%" cy="55%" r="60%"><stop offset="0" stopColor="currentColor" stopOpacity=".35" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></radialGradient>
                  <linearGradient id="aifbh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".28" /><stop offset="1" stopColor="currentColor" stopOpacity=".06" /></linearGradient></defs>
                <ellipse cx="60" cy="62" rx="58" ry="44" fill="url(#aifbg)" />
                <line x1="60" y1="8" x2="60" y2="22" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /><circle cx="60" cy="8" r="4.5" fill="currentColor" />
                <rect x="22" y="22" width="76" height="62" rx="26" fill="url(#aifbh)" stroke="currentColor" strokeWidth="3.5" />
                <rect x="32" y="35" width="56" height="36" rx="18" fill="#04120c" fillOpacity=".75" />
                <circle cx="48" cy="53" r="6.5" fill="currentColor" /><circle cx="72" cy="53" r="6.5" fill="currentColor" />
                <rect x="14" y="44" width="8" height="18" rx="4" fill="currentColor" fillOpacity=".7" /><rect x="98" y="44" width="8" height="18" rx="4" fill="currentColor" fillOpacity=".7" /></svg>
                <h2>Hi, I’m <em>FinLit AI</em></h2><p>Your investing &amp; market research assistant</p></div>
              <ul className="aif-cats" aria-label="What would you like to explore?">
                {CATEGORIES.map((c) => (
                  <li key={c.id}><button type="button" className={"aif-cat aif-c-" + c.id} onClick={() => { if (c.id === "company") { if (company) setView("company"); else setView("segments"); } else { setCategory(c.id); setView("topic"); } }}>
                    <Icon name={c.icon} /><b>{c.title}</b><small>{c.sub}</small><i className="aif-go" aria-hidden="true"><Icon name="arrow" /></i></button></li>))}
              </ul>
              <div className="aif-ex">
                <div className="aif-exh"><h3><Icon name="spark" /> Choose a question to ask</h3>
                  <label className="aif-exs"><Icon name="search" /><span className="sr-only">Search questions</span><input type="search" value={exq} onChange={(e) => setExq(e.target.value)} placeholder="Search questions (e.g., P/E, cash flow, DuPont)" autoComplete="off" /></label></div>
                {exq.trim() ? (() => { const hits = searchQuestions(exq); return hits.length ? <ul className="aif-exq" aria-label="Matching questions">{hits.map(({ topic, q }) => <li key={q.id}><button type="button" onClick={() => tapQ(q)}><Icon name="chat" /><span>{q.text}<small>{topic.title}</small></span><Icon name="arrow" /></button></li>)}</ul> : <p className="aif-none">No question matches “{exq.trim()}”. Try a single word, or type your own question below.</p>; })() : (
                  <div className="aif-expane">
                    <div className="aif-ext" role="tablist" aria-label="Question topics" aria-orientation="vertical">{TOPICS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={topicId === t.id} className={topicId === t.id ? "on" : ""} onClick={() => setTopicId(t.id)}><Icon name={t.icon} />{t.title}</button>)}</div>
                    <ul className="aif-exq" role="tabpanel" aria-label={TOPICS.find((t) => t.id === topicId)!.title}>{TOPICS.find((t) => t.id === topicId)!.questions.map((q) => <li key={q.id}><button type="button" onClick={() => tapQ(q)}><Icon name="chat" /><span>{q.text}</span><Icon name="arrow" /></button></li>)}</ul>
                  </div>)}
              </div>
              {pageFaq && <><p className="aif-label">Questions about this page</p><ul className="aif-qs" aria-label={`Questions about ${pageFaq.title}`}>
                {pageFaq.items.slice(0, 4).map((it) => <li key={it.q}><button type="button" className="aif-q" onClick={() => askPage(it.q, it.a)}><Icon name="chat" /><span>{it.q}</span><Icon name="arrow" /></button></li>)}</ul></>}
            </>}
            {view === "home" && !big && <>
              <div className="bub bot aif-hi"><b>Hi, I'm FinLit AI</b><span>How can I help you today?</span></div>
              <ul className="aif-cats" aria-label="What would you like to explore?">
                {CATEGORIES.map((c) => (
                  <li key={c.id}><button type="button" className="aif-cat" onClick={() => { if (c.id === "company") { if (company) setView("company"); else setView("segments"); } else { setCategory(c.id); setView("topic"); } }}>
                    <Icon name={c.icon} /><b>{c.title}</b><small>{c.sub}</small></button></li>))}
              </ul>
              {pageFaq && <><p className="aif-label">Questions about this page</p><ul className="aif-qs" aria-label={`Questions about ${pageFaq.title}`}>
                {pageFaq.items.slice(0, 4).map((it) => <li key={it.q}><button type="button" className="aif-q" onClick={() => askPage(it.q, it.a)}><Icon name="chat" /><span>{it.q}</span><Icon name="arrow" /></button></li>)}</ul></>}
            </>}

            {view === "history" && <>
              <div className="aif-h"><h2>Chat History</h2><p>Your recent questions, kept in this browser only.</p></div>
              {recent.length ? <><ul className="aif-qs" aria-label="Recent questions">{recent.map((t) => <li key={t}><button type="button" className="aif-q" onClick={() => void ask(t, "home")}><Icon name="chat" /><span>{t}</span><Icon name="arrow" /></button></li>)}</ul>
                <button type="button" className="aif-clear" onClick={() => setRecent(clearRecent())}>Clear history</button></> : <p className="aif-none">No questions yet. Ask one and it appears here.</p>}
            </>}
            {view === "saved" && <>
              <div className="aif-h"><h2>Saved Questions</h2><p>Questions you starred, kept in this browser only.</p></div>
              {saved.length ? <ul className="aif-qs" aria-label="Saved questions">{saved.map((t) => <li key={t} className="aif-sv"><button type="button" className="aif-q" onClick={() => void ask(t, "home")}><Icon name="star" /><span>{t}</span><Icon name="arrow" /></button><button type="button" className="aif-unsave" aria-label={`Remove from saved: ${t}`} onClick={() => setSaved((l) => toggleSaved(l, t))}>×</button></li>)}</ul>
                : <p className="aif-none">Nothing saved yet. Use the star beside an answer’s question to keep it here.</p>}
            </>}

            {view === "segments" && <>
              <div className="aif-h"><h2>{big ? "What do you want to understand?" : "Explore a company"}</h2><p>{big ? "FinLit AI answers from a company's reported figures, filings and prices." : "Get insights on financials, performance, risks and more."}</p></div>
              {big && <ol className="aif-steps" aria-label="How it works">
                <li className={company ? "done" : ""}><i>1</i><span><b>Pick a company</b><small>Search below for Reliance, TCS or any listed stock</small></span></li>
                <li><i>2</i><span><b>Choose the period</b><small>Set the quarter and financial year in the company box once a company is chosen</small></span></li>
                <li><i>3</i><span><b>Pick a question</b><small>Choose from the curated questions, or type your own</small></span></li>
              </ol>}
              <ul className="aif-segs" aria-label="Choose a segment">
                {SEGMENTS.map((s) => (
                  <li key={s.id}><button type="button" className={"aif-seg" + (pendingTab === s.id ? " on" : "")} aria-pressed={pendingTab === s.id} onClick={() => { setPendingTab(s.id); if (company) goCompany(company, s.id); }}>
                    <Icon name={s.icon} /><span><b>{s.title}</b><small>{s.sub}</small></span><Icon name="arrow" /></button></li>))}
              </ul>
              {!company && <div className="aif-find">
                <label htmlFor="aif-find">Which company?</label>
                <input id="aif-find" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search a company (e.g. Reliance, TCS)" autoComplete="off" />
                {findErr && <p className="aif-err" role="status">{findErr}</p>}
                {found.length > 0 && <ul className="aif-found" aria-label="Matching companies">{found.map((c) => <li key={c.symbol}><button type="button" onClick={() => goCompany(c.symbol, pendingTab)}><b>{c.symbol}</b><span>{c.name}</span></button></li>)}</ul>}
                {!found.length && find.trim().length >= 2 && !findErr && <p className="aif-none">No company matches “{find.trim()}”.</p>}
              </div>}
            </>}

            {view === "topic" && category && <>
              <div className="aif-h"><h2>{CATEGORIES.find((c) => c.id === category)!.title}</h2><p>{CATEGORIES.find((c) => c.id === category)!.sub}</p></div>
              <ul className="aif-qs" aria-label="Questions you can ask">{categoryQuestions(category).map((q) => row(q))}</ul>
            </>}

            {view === "company" && company && big && <div className="aif-ctx">
              <aside className="aif-cp" aria-label="This company and the period">
                <div className="aif-cpc"><span className="aif-logo" aria-hidden="true">{company.slice(0, 2)}</span><div><b>{company}</b><small>In context for every question</small></div>
                  <button type="button" className="aif-change" onClick={() => { setCompany(null); setQtr(null); setView("segments"); }}>Change</button></div>
                <p className="aif-label">Quarter</p>
                <div className="aif-qchips" role="group" aria-label="Quarter of the financial year">
                  {QUARTERS.map((q) => <button key={q.n} type="button" className={qtr === q.n ? "on" : ""} aria-pressed={qtr === q.n} onClick={() => setQtr(qtr === q.n ? null : q.n)}><b>Q{q.n}</b><small>{q.months}</small></button>)}
                </div>
                <label className="aif-label" htmlFor="aif-fy">Financial year</label>
                <select id="aif-fy" value={fy} onChange={(e) => setFy(e.target.value)}>{financialYears().map((y) => <option key={y} value={y}>{y} (Apr {2000 + Number(y.slice(2)) - 1} to Mar {2000 + Number(y.slice(2))})</option>)}</select>
                <button type="button" className="btn primary aif-askq" disabled={qtr == null || busy} onClick={() => { const q = QUARTERS.find((x) => x.n === qtr); if (q) void ask(quarterQuestion(company, q, fy), "company"); }}>{qtr == null ? "Choose a quarter to ask" : `Ask about Q${qtr} ${fy}`}</button>
                <button type="button" className="aif-qtrend" onClick={() => void ask(quarterTrendQuestion(company), "company")}>Compare Q1 to Q4 over two years <Icon name="arrow" /></button>
                <p className="aif-note">Answers are general information drawn from the company's reported figures, filings and prices. They are not investment advice.</p>
              </aside>
              <div className="aif-cm">
                <div className="aif-h"><h2>What do you want to understand about {company}?</h2><p>Pick a group, then one of the questions. Or type your own below.</p></div>
                <ol className="aif-steps" aria-label="How it works">
                  <li className="done"><i>1</i><span><b>Company</b><small>{company} is chosen</small></span></li>
                  <li className={qtr != null ? "done" : ""}><i>2</i><span><b>Period (optional)</b><small>Set the quarter and year in the company box</small></span></li>
                  <li><i>3</i><span><b>Question</b><small>Choose below, or type your own</small></span></li>
                </ol>
                <div className="aif-tabs" role="tablist" aria-label="Question groups">
                  {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>)}
                </div>
                <ul className="aif-qs" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label}>{tabQuestions(tab, company, lender).slice(0, 10).map((q) => row(q))}</ul>
              </div>
            </div>}
            {view === "company" && company && !big && <>
              <div className="aif-co"><span className="aif-logo" aria-hidden="true">{company.slice(0, 2)}</span><div><b>{company}</b><small>Questions about this company</small></div></div>
              <div className="aif-tabs" role="tablist" aria-label="Question groups">
                {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>)}
              </div>
              <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label}>
                {tab === "financials" && <div className="aif-qtr">
                  <p className="aif-label">Results by quarter</p>
                  <div className="aif-qchips" role="group" aria-label="Ask about a quarter of the financial year">
                    {QUARTERS.map((q) => <button key={q.n} type="button" onClick={() => void ask(quarterQuestion(company, q), "company")}><b>Q{q.n}</b><small>{q.months}</small></button>)}
                  </div>
                  <button type="button" className="aif-qtrend" onClick={() => void ask(quarterTrendQuestion(company), "company")}>Compare Q1 to Q4 over two years <Icon name="arrow" /></button>
                </div>}
                <ul className="aif-qs" aria-label="Questions about this company">{tabQuestions(tab, company, lender).map((q) => row(q))}</ul>
              </div>
            </>}

            {view === "chat" && <>
              {msgs.map((m, i) => <div key={i} className={"bub " + (m.role === "user" ? "me" : "bot")} style={{ whiteSpace: "pre-wrap" }}>{m.content}{m.role === "user" && <button type="button" className={"aif-save" + (saved.includes(m.content) ? " on" : "")} aria-pressed={saved.includes(m.content)} aria-label={saved.includes(m.content) ? "Remove this question from saved" : "Save this question"} title={saved.includes(m.content) ? "Saved" : "Save this question"} onClick={() => setSaved((l) => toggleSaved(l, m.content))}><Icon name="star" /></button>}</div>)}
              {busy && <div className="bub bot typing"><i /><i /><i /></div>}
              {!busy && msgs.length > 0 && relatedQs.length > 0 && <div className="aif-rel"><p className="aif-label">Related questions</p>
                <ul className="aif-qs" aria-label="Related questions">{relatedQs.map((q) => row(q))}</ul></div>}
              {!busy && msgs.length > 0 && <div className="chips"><button type="button" className="back" onClick={() => setView(company ? "company" : "home")}>{company ? `← More about ${company}` : "← Main menu"}</button>
                {company && <button type="button" className="back" onClick={() => { setCompany(null); setView("segments"); }}>Change company</button>}</div>}
            </>}
            <div ref={end} />
          </div>
          <form onSubmit={send}>
            <input ref={field} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000}
              placeholder={company && view !== "home" ? `Ask a follow-up about ${company}` : "Ask a question or choose a topic"} aria-label="Your question" />
            <button disabled={busy || !text.trim()} aria-label="Send"><Icon name="arrow" /></button>
          </form>
          <p className="ai-fine">General information, not investment advice.</p>
        </section>
      )}
    </>
  );
}
