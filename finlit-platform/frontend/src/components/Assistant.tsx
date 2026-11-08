import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { faqForPath } from "../lib/pageFaqs";
import { SECOND } from "../lib/questionBank";
import { askAssistant } from "../lib/siteApi";
import { apiGet, type SearchIndex } from "../lib/api";
import {
  CATEGORIES, QUARTERS, SEGMENTS, TABS, categoryQuestions, isLenderSector, quarterQuestion, quarterTrendQuestion, related, tabQuestions, writtenAnswer,
  type CategoryId, type Q, type TabId,
} from "../lib/askFlow";
import { Icon } from "../lib/icons";
import "../styles/ask-ai.css";

/** Fired by the header button; the assistant panel listens for it. */
export const OPEN_AI = "finlit:open-ai";
type Msg = { role: "user" | "assistant"; content: string };
type View = "home" | "segments" | "topic" | "company" | "chat";

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
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [pick, setPick] = useState(0);                      // bumps when the input must select XYZ
  const loc = useLocation();
  const pageCompany = companyOf(loc.pathname);
  const lender = isLenderSector(sector);

  useEffect(() => { const o = () => setOpen(true); addEventListener(OPEN_AI, o); return () => removeEventListener(OPEN_AI, o); }, []);   // the "Ask FinLit AI" button in the header bar
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [msgs, view, tab, open, busy, found]);
  useEffect(() => {   // Esc closes the panel (a dialog must)
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [open]);
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
    setBack(via === "chat" ? back : via); setView("chat"); setText("");
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
        <section className="ai aif" role="dialog" aria-label="FinLit AI assistant">
          <header>
            {view !== "home" && <button type="button" className="aif-back" onClick={goBack} aria-label="Back"><Icon name="arrow" /></button>}
            <div className="aif-title"><b>FinLit AI</b><span>{sub ?? "Your investing & market research assistant"}</span></div>
            {company && view !== "home" && <button type="button" className="aif-change" onClick={() => { setCompany(null); setView("segments"); }}>Change company</button>}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </header>
          <div className="ai-body">
            {view === "home" && <>
              <div className="bub bot aif-hi"><b>Hi, I'm FinLit AI</b><span>How can I help you today?</span></div>
              <ul className="aif-cats" aria-label="What would you like to explore?">
                {CATEGORIES.map((c) => (
                  <li key={c.id}><button type="button" className="aif-cat" onClick={() => { if (c.id === "company") { if (company) setView("company"); else setView("segments"); } else { setCategory(c.id); setView("topic"); } }}>
                    <Icon name={c.icon} /><b>{c.title}</b><small>{c.sub}</small></button></li>))}
              </ul>
              {pageFaq && <><p className="aif-label">Questions about this page</p><ul className="aif-qs" aria-label={`Questions about ${pageFaq.title}`}>
                {pageFaq.items.slice(0, 4).map((it) => <li key={it.q}><button type="button" className="aif-q" onClick={() => askPage(it.q, it.a)}><Icon name="chat" /><span>{it.q}</span><Icon name="arrow" /></button></li>)}</ul></>}
            </>}

            {view === "segments" && <>
              <div className="aif-h"><h2>Explore a company</h2><p>Get insights on financials, performance, risks and more.</p></div>
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

            {view === "company" && company && <>
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
              {msgs.map((m, i) => <div key={i} className={"bub " + (m.role === "user" ? "me" : "bot")} style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>)}
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
