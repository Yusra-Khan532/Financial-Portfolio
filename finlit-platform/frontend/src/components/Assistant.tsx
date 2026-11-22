import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { faqForPath } from "../lib/pageFaqs";
import { SECOND } from "../lib/questionBank";
import { answerCompany, generalAnswer, matchQuestion, searchListed, type Match } from "../lib/askAnswers";
import { apiGet, type SearchIndex } from "../lib/api";
import type { Quotes } from "../lib/globalSearch";
import { AskRefused, askAi, safePages, useAskQuota, type AskTurn } from "../lib/askAi";
import { useAuth } from "../lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import {
  CATEGORIES, MARKET_QUESTIONS, QUARTERS, SEGMENTS, TABS, categoryQuestions, isLenderSector, financialYears, quarterQuestion, quarterTrendQuestion, related, tabQuestions,
  type CategoryId, type Q, type TabId,
} from "../lib/askFlow";
import { Icon } from "../lib/icons";
import { Link } from "react-router";
import { clearRecent, loadRecent, loadSaved, pushRecent, toggleSaved } from "../lib/askExplorer";
import { STARTERS } from "../lib/questionBank";
import "../styles/ask-ai.css";
import { CoLogo } from "./CoLogo";
import { AskSuggest, suggestCount, useSuggestKeys } from "./AskSuggest";
import { AnswerText } from "./AnswerText";
import { QUICK_PICKS } from "../lib/outlookPick";
import type { FundCtx } from "../lib/askFunds";
import type { Answer } from "../lib/askAnswers";
const AskFunds = lazy(() => import("./AskFunds").then((m) => ({ default: m.AskFunds })));   // task #203: the 1,391 fund questions load only when the theme opens
const AskDiscovery = lazy(() => import("./AskDiscovery").then((m) => ({ default: m.AskDiscovery })));   // task #221: loads only when Discovery opens

/** The theme card on the start screen (the other four are lib/askFlow.ts CATEGORIES). */
const FUNDS_CARD = { id: "funds", title: "Mutual funds & ETFs", sub: "Funds, returns, costs, ETFs", icon: "pie" } as const;

import { OPEN_AI } from "./assistantEvents";
import { coTitle, subLine, titleOf } from "../lib/companyLabel";
export { OPEN_AI };
/** `ai`: a written answer from FinLit AI (task #211): what it is reading while the words have not come yet, the disclaimer once done, a refusal, or the note
 *  that written answers are part of Silver and Gold (Basic and visitors keep the listed questions: founder, 17 Nov 2026). */
type Msg = { role: "user" | "assistant"; content: string; link?: { to: string; label: string }; actions?: { to: string; label: string }[]; suggest?: Q[]; ai?: { status?: string; disclaimer?: string; error?: boolean; plans?: boolean } };
type View = "home" | "segments" | "topic" | "company" | "chat" | "history" | "saved" | "funds" | "discovery";

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
 *  questions, the company kept in context. Chosen questions answer from written text or the company's own FinLit figures (task #138: no language model); nothing here is advice. */
export function Assistant({ sector, startOpen = false }: { sector?: string | null; startOpen?: boolean } = {}) {
  const [open, setOpen] = useState(startOpen);   // AssistantLauncher mounts it on the first "open" event, which fired before this panel listened
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
  const [sgOpen, setSgOpen] = useState(false);              // task #268: the suggestion panel of the box being typed in
  const pickRef = useRef<(i: number) => void>(() => {});
  const [found, setFound] = useState<{ symbol: string; name: string }[]>([]);
  const [findErr, setFindErr] = useState("");
  const [menuOpen, setMenuOpen] = useState(true);
  const [qtr, setQtr] = useState<number | null>(null), [fy, setFy] = useState<string>(() => financialYears()[1]);   // the period chosen in the full window (the latest finished financial year first)
  const [big, setBig] = useState<boolean>(() => { try { const v = localStorage.getItem("finlit-ai-full"); if (v != null) return v === "1"; } catch { /* private window */ } return typeof window !== "undefined" && window.innerWidth >= 1100; });   // the full window: remembered once chosen, and the first choice on a wide screen (task #59)
  const toggleBig = () => setBig((b) => { try { localStorage.setItem("finlit-ai-full", b ? "0" : "1"); } catch { /* private window */ } return !b; });
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [pick, setPick] = useState(0);                      // bumps when the input must select XYZ
  const [fundCtx, setFundCtx] = useState<FundCtx>({});   // task #203: the fund or ETF in context for the next fund question   // the question explorer of the full window
  const [recent, setRecent] = useState<string[]>(() => loadRecent()), [saved, setSaved] = useState<string[]>(() => loadSaved());
  const loc = useLocation();
  const pageCompany = companyOf(loc.pathname);
  const lender = isLenderSector(sector);

  useEffect(() => { const o = () => setOpen(true); addEventListener(OPEN_AI, o); return () => removeEventListener(OPEN_AI, o); }, []);   // the "Ask FinLit AI" button in the header bar
  useEffect(() => {   // the conversation keeps its newest message in view; every other screen opens at its top (task #201: the start screen used to open scrolled down, its top cut off)
    if (view === "chat") end.current?.scrollIntoView?.({ block: "end" });
    else end.current?.closest(".ai-body")?.scrollTo?.({ top: 0 });
  }, [msgs, view, tab, open, busy, found]);
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
  const { user } = useAuth();
  const qc = useQueryClient();
  const quota = useAskQuota(open);
  const qd = quota.data;
  const aiOn = !!qd?.enabled;                                   // written answers are switched on (ANTHROPIC_API_KEY on the server)
  const aiPlan = aiOn && (!user || quota.data?.limit === 0);           // a visitor or a Basic member: written answers are part of Silver and Gold
  const aiReady = aiOn && !!user && (quota.data?.left ?? 0) > 0;        // a Silver or Gold member with questions left this month
  // task #268: the company card of the side panel (the reference's): its price and day change, and its name from the site's search index
  const [coRow, setCoRow] = useState<[number, number | null] | null>(null);    // price and day change, read again each minute while the window is open
  useEffect(() => {
    setCoRow(null);
    if (!company || !open || !big) return;
    let live = true;
    const read = () => apiGet<Quotes>(`/api/search/quotes?symbols=${encodeURIComponent(company)}`).then((d) => {
      const r = d?.rows?.find((x) => x[0] === company);
      if (live) setCoRow(r && typeof r[1] === "number" ? [r[1], typeof r[2] === "number" ? r[2] : null] : null);
    }).catch(() => undefined);
    void read();
    const t = setInterval(read, 60_000);
    return () => { live = false; clearInterval(t); };
  }, [company, open, big]);
  const [coName, setCoName] = useState<string | null>(null);
  useEffect(() => {
    if (!company || !open || !big) { setCoName(null); return; }
    let live = true;
    findCompanies(company).then((r) => { if (live) setCoName(r.find((x) => x.symbol === company)?.name ?? null); }).catch(() => undefined);
    return () => { live = false; };
  }, [company, open, big]);
  const typed = text.trim().length >= 2 && !text.includes(SECOND) ? searchListed(text, company, 5) : [];   // the typing box searches the listed questions
  const sgShow = sgOpen && text.trim().length >= 2 && !text.includes(SECOND);
  const keys = useSuggestKeys(suggestCount(typed), sgShow, (i) => pickRef.current(i), () => setSgOpen(false));   // a hook: before the return below
  if (loc.pathname.startsWith("/admin")) return null;

  const pool: Q[] = category ? categoryQuestions(category) : company ? [...tabQuestions(tab, company, lender), ...tabQuestions("suggested", company, lender)] : [];
  const relatedQs = related(pool, asked);

  const goCompany = (sym: string, t: TabId) => { setCompany(sym); setTab(t); setFind(""); setFound([]); setView("company"); };
  /** Task #138 (founder, 14 Nov 2026): no language model. A listed question answers at once: a general one from its written answer, a company one from
   *  that company's own FinLit figures. Anything else typed is matched against the listed questions and the closest ones are offered. */
  /** A question the listed answers do not cover: FinLit AI reads FinLit's own data as this member and the answer streams into the last bubble. */
  const written = async (q: string, before: Msg[]) => {
    const history: AskTurn[] = before.filter((m) => m.content && !m.ai?.error && !m.ai?.plans && !m.suggest).map((m) => ({ role: m.role, content: m.content }));
    while (history.length && history[0].role !== "user") history.shift();
    const pairs: AskTurn[] = [];                                         // only whole question-and-answer pairs, in order
    for (let i = 0; i + 1 < history.length; i++) if (history[i].role === "user" && history[i + 1].role === "assistant") { pairs.push(history[i], history[i + 1]); i++; }
    const patch = (f: (m: Msg) => Msg) => setMsgs((ms) => { const c = [...ms]; c[c.length - 1] = f(c[c.length - 1]); return c; });
    setMsgs((m) => [...m, { role: "assistant", content: "", ai: { status: "Reading FinLit's data" } }]);
    setBusy(true);
    try {
      await askAi(q, pairs, company, (e) => {
        if (e.type === "status") patch((m) => ({ ...m, ai: { ...m.ai, status: e.text } }));
        else if (e.type === "text") patch((m) => ({ ...m, content: m.content + e.text, ai: { ...m.ai, status: undefined } }));
        else if (e.type === "replace") patch((m) => ({ ...m, content: e.text, ai: { ...m.ai, status: undefined } }));
        else if (e.type === "done") patch((m) => { const pages = safePages(e.pages); return { ...m, ai: { disclaimer: e.disclaimer }, ...(pages.length ? { actions: pages } : {}) }; });   // task #218: the FinLit pages the answer read
        else if (e.type === "error") patch((m) => ({ ...m, content: m.content ? `${m.content}\n\n${e.text}` : e.text, ai: { error: true } }));
      });
    } catch (err) {
      const text = err instanceof AskRefused ? err.message : "FinLit AI could not be reached just now. Please try again.";
      patch((m) => ({ ...m, content: text, ai: { error: true, plans: err instanceof AskRefused && err.code === "plan_required" } }));
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ["ask-quota"] });
    }
  };
  const ask = async (q: string, via: View, meta?: Partial<Match>) => {
    if (!q || busy) return;
    setBack(via === "chat" ? back : via); setView("chat"); setText(""); setRecent((r) => pushRecent(r, q));
    const before = msgs;
    setMsgs((m) => [...m, { role: "user", content: q }]);
    const listedAnswer = generalAnswer(q);
    if (listedAnswer) { setMsgs((m) => [...m, { role: "assistant", content: listedAnswer }]); return; }
    const found = meta?.id && meta.sym ? (meta as Match) : matchQuestion(q, company);
    if (!found && aiReady) { await written(q, before); return; }
    if (!found && aiPlan) {
      const close = searchListed(q, company, 6, true);
      setMsgs((m) => [...m, { role: "assistant", content: "Written answers to your own questions are part of the Silver plan (50 a month) and the Gold plan (100 a month). The listed questions answer at once on every plan." + (close.length ? " These are the closest to yours:" : ""), suggest: close, ai: { plans: true } }]);
      return;
    }
    if (!found) {
      const close = searchListed(q, company, 6, true);
      setMsgs((m) => [...m, { role: "assistant", content: close.length ? "FinLit AI answers its listed questions. These are the closest to yours; pick one for its answer:" : `FinLit AI answers its listed questions, and none matches “${q}”. Choose a topic or a company to see them all.`, suggest: close }]);
      return;
    }
    setBusy(true);
    try {
      let second = found.second;
      if (found.id === "C.11.Q39" && second) { const hit = (await findCompanies(second).catch(() => []))[0]; second = hit ? hit.symbol : second.toUpperCase(); }
      const a = await answerCompany(found.id, found.sym, { second, quarter: found.quarter, fy: found.fy });
      const sym = encodeURIComponent(found.sym);   // task #201: clear next steps after an answer about a company
      setMsgs((m) => [...m, { role: "assistant", content: a.text, link: a.link, actions: [{ to: `/graphs?c=${sym}`, label: "View in Chart Builder" }, { to: `/compare?c=${sym}`, label: "Compare with peers" }] }]);
    } catch { setMsgs((m) => [...m, { role: "assistant", content: "This answer could not be put together just now. Please try again, or open the company report." }]); }
    finally { setBusy(false); }
  };
  /** A fund question (task #203): asked like any other, answered from FinLit's fund data or written text; the back button returns to the fund questions. */
  const askFund = async (question: string, answer: Promise<Answer>) => {
    if (busy) return;
    setBack("funds"); setView("chat"); setRecent((r) => pushRecent(r, question));
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setBusy(true);
    try { const a = await answer; setMsgs((m) => [...m, { role: "assistant", content: a.text, link: a.link }]); }
    catch { setMsgs((m) => [...m, { role: "assistant", content: "This answer could not be put together just now. Please try again, or open the mutual funds list." , link: { to: "/funds", label: "Open the mutual funds list" } }]); }
    finally { setBusy(false); }
  };
  const tapQ = (q: Q) => {
    if (q.needsSecondCompany) { setText(q.text); setPick((n) => n + 1); return; }   // the second company is the user's to name: nothing is sent yet
    void ask(q.text, view, company && /^C\./.test(q.id) && q.text.toUpperCase().includes(company) ? { id: q.id, sym: company } : undefined);
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
  // the box: a few search words ask their best listed question; a sentence that matches none exactly is offered the closest listed ones
  // with written answers on, a sentence that is not a listed question goes to FinLit AI as typed; without them, its closest listed question is asked
  const sendNow = () => { const t = text.trim(); if (!t) return; setSgOpen(false); const top = searchListed(t, company, 1)[0]; void ask(generalAnswer(t) || matchQuestion(t, company) || aiReady || aiPlan || !top ? t : top.text, view === "chat" ? back : view); };
  const send = (e: React.FormEvent) => { e.preventDefault(); sendNow(); };
  // task #268: the suggestions show beside the box being typed in (above the bottom box, under the start screen's): the listed questions, then the words as typed
  pickRef.current = (i: number) => { setSgOpen(false); if (i < typed.length) tapQ(typed[i]); else sendNow(); };
  const comboProps = (listId: string) => ({ role: "combobox" as const, "aria-autocomplete": "list" as const, "aria-expanded": sgShow, "aria-controls": sgShow ? listId : undefined,
    "aria-activedescendant": sgShow && keys.active >= 0 ? `${listId}-${keys.active}` : undefined, onKeyDown: keys.onKeyDown,
    onFocus: () => setSgOpen(true), onBlur: () => setSgOpen(false) });
  const suggest = (listId: string, place: "up" | "down") => sgShow && <AskSuggest id={listId} text={text} qs={typed} company={company} aiReady={aiReady} aiPlan={aiPlan} left={qd?.left ?? null}
    active={keys.active} place={place} onPick={(q) => { setSgOpen(false); tapQ(q); }} onAsk={sendNow} />;
  /** Task #201: the start screen's search, above the cards: ask anything at once, with a few things to try. On the start screen it is the one box (the box at the
   *  bottom is hidden there), and the listed questions that match show under it. */
  const TRY: { label: string; go: () => void }[] = [
    { label: "Reliance financials", go: () => goCompany("RELIANCE", "financials") },
    { label: "P/E ratio", go: () => void ask("What is P/E and how is it used?", "home") },
    { label: "Sector outlook", go: () => void ask(MARKET_QUESTIONS[3].text, "home") },
    { label: "Red flags", go: () => void ask("What are the key red flags in the financials?", "home") },
  ];
  const askBox = (
    <div className="aif-askw">
      <form className="aif-ask" onSubmit={send} role="search">
        <Icon name="search" />
        <input value={text} onChange={(e) => { setText(e.target.value); setSgOpen(true); }} maxLength={300} aria-label="Ask FinLit AI anything"
          placeholder="Ask anything about a company, sector or investment concept…" autoComplete="off" {...comboProps("aif-sg-top")} />
        <kbd className="aif-enter" aria-hidden="true">Enter</kbd>
        <button disabled={busy || !text.trim()} aria-label="Ask"><Icon name="arrow" /></button>
      </form>
      {suggest("aif-sg-top", "down")}
      <p className="aif-try"><span>Try asking</span>{TRY.map((t) => <button key={t.label} type="button" onClick={t.go}>{t.label}</button>)}</p>
    </div>);
  // task #268: the five themes are the five cards (Mutual funds & ETFs is the fifth, no longer under "More"); Discovery stays here
  const moreThemes = <p className="aif-more"><span>Also</span><button type="button" onClick={() => setView("discovery")}><Icon name="globe" />Discovery</button></p>;

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
              <button type="button" className={view === "discovery" ? "on" : ""} aria-current={view === "discovery" ? "page" : undefined} onClick={() => setView("discovery")}><Icon name="globe" />Discovery</button>
            </nav>
            {company && <div className="aif-sco" aria-label={`In context: ${company}`}>
              <div className="aif-sco-h"><span><b>{company}</b>{coName && <small>{coName}</small>}</span>
                <button type="button" className="aif-sco-x" onClick={() => { setCompany(null); if (view === "company") setView("home"); }} aria-label={`Stop asking about ${company}`} title="Clear the company">×</button></div>
              {coRow && <p className="aif-sco-p"><span>₹{coRow[0].toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                {coRow[1] != null && <em className={coRow[1] >= 0 ? "up" : "dn"}>{coRow[1] >= 0 ? "+" : "−"}{Math.abs(coRow[1]).toFixed(2)}%</em>}</p>}
              <button type="button" className="aif-sco-c" onClick={() => { setCompany(null); setView("segments"); }}>Change company</button>
            </div>}
            <p className="aif-sl"><Icon name="refresh" /> History</p>
            {recent.length ? <ul className="aif-hist" aria-label="Your recent questions">{recent.slice(0, 5).map((t) => <li key={t}><button type="button" title={t} onClick={() => void ask(t, "home")}>{t}</button></li>)}</ul>
              : <p className="aif-hist-none">Nothing yet. Ask a question and it collects here.</p>}
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
              {askBox}
              {/* task #305: the four questions about this page come right under the ask box, so they show without scrolling */}
              {pageFaq && <section className="aif-pq" aria-label="Questions about this page"><p className="aif-label">Questions about this page</p><ul className="aif-qs" aria-label={`Questions about ${pageFaq.title}`}>
                {pageFaq.items.slice(0, 4).map((it) => <li key={it.q}><button type="button" className="aif-q" onClick={() => askPage(it.q, it.a)}><Icon name="chat" /><span>{it.q}</span><Icon name="arrow" /></button></li>)}</ul></section>}
              <ul className="aif-cats five" aria-label="What would you like to explore?">
                {CATEGORIES.map((c) => (
                  <li key={c.id}><button type="button" className={"aif-cat aif-c-" + c.id} onClick={() => { if (c.id === "company") { if (company) setView("company"); else setView("segments"); } else { setCategory(c.id); setView("topic"); } }}>
                    <Icon name={c.icon} /><b>{c.title}</b><small>{c.sub}</small><i className="aif-go" aria-hidden="true"><Icon name="arrow" /></i></button></li>))}
                <li><button type="button" className="aif-cat aif-c-funds" onClick={() => setView("funds")}><Icon name={FUNDS_CARD.icon} /><b>{FUNDS_CARD.title}</b><small>{FUNDS_CARD.sub}</small><i className="aif-go" aria-hidden="true"><Icon name="arrow" /></i></button></li>
              </ul>
              {moreThemes}
            </>}
            {view === "home" && !big && <>
              <div className="bub bot aif-hi"><b>Hi, I'm FinLit AI</b><span>How can I help you today?</span></div>
              {askBox}
              {/* task #305: the four questions about this page come right under the ask box, so they show without scrolling */}
              {pageFaq && <section className="aif-pq" aria-label="Questions about this page"><p className="aif-label">Questions about this page</p><ul className="aif-qs" aria-label={`Questions about ${pageFaq.title}`}>
                {pageFaq.items.slice(0, 4).map((it) => <li key={it.q}><button type="button" className="aif-q" onClick={() => askPage(it.q, it.a)}><Icon name="chat" /><span>{it.q}</span><Icon name="arrow" /></button></li>)}</ul></section>}
              <ul className="aif-cats five" aria-label="What would you like to explore?">
                {CATEGORIES.map((c) => (
                  <li key={c.id}><button type="button" className="aif-cat" onClick={() => { if (c.id === "company") { if (company) setView("company"); else setView("segments"); } else { setCategory(c.id); setView("topic"); } }}>
                    <Icon name={c.icon} /><b>{c.title}</b><small>{c.sub}</small></button></li>))}
                <li><button type="button" className="aif-cat" onClick={() => setView("funds")}><Icon name={FUNDS_CARD.icon} /><b>{FUNDS_CARD.title}</b><small>{FUNDS_CARD.sub}</small></button></li>
              </ul>
              {moreThemes}
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
                <li><i>3</i><span><b>Pick a question</b><small>Choose from the listed questions, or search them below</small></span></li>
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
                {found.length > 0 && <ul className="aif-found" aria-label="Matching companies">{found.map((c) => <li key={c.symbol}><button type="button" onClick={() => goCompany(c.symbol, pendingTab)}><b title={coTitle(c)}>{titleOf(c)}</b><span>{subLine(c, c.name)}</span></button></li>)}</ul>}
                {!found.length && find.trim().length >= 2 && !findErr && <p className="aif-none">No company matches “{find.trim()}”.</p>}
                {!find.trim() && <><p className="aif-label">Or choose from popular companies</p>
                  <ul className="aif-pops" aria-label="Popular companies">{QUICK_PICKS.map((c) => <li key={c.symbol}><button type="button" onClick={() => goCompany(c.symbol, pendingTab)}><CoLogo symbol={c.symbol} name={c.name} size={28} inline /><span>{c.name}</span></button></li>)}</ul></>}
              </div>}
            </>}

            {view === "topic" && category && <>
              <div className="aif-h"><h2>{CATEGORIES.find((c) => c.id === category)!.title}</h2><p>{CATEGORIES.find((c) => c.id === category)!.sub}</p></div>
              <ul className="aif-qs" aria-label="Questions you can ask">{categoryQuestions(category).map((q) => row(q))}</ul>
            </>}

            {view === "funds" && <>
              <div className="aif-h"><h2>{FUNDS_CARD.title}</h2><p>Questions on mutual funds and ETFs, answered from AMFI's and the NSE's figures on FinLit. Pick a segment, or search.</p></div>
              <Suspense fallback={<p className="aif-none" role="status">Loading…</p>}><AskFunds ctx={fundCtx} setCtx={setFundCtx} onAnswer={(q, a) => void askFund(q, a)} /></Suspense>
            </>}

            {view === "discovery" && <>
              <div className="aif-h"><h2>Discovery</h2><p>Themes from companies' own investor presentations: AI, defence, solar, batteries, data centres, EVs, nuclear, drones and more. <Link to="/discover" onClick={() => setOpen(false)}>Open the full page</Link></p></div>
              <Suspense fallback={<p className="aif-none" role="status">Loading…</p>}><AskDiscovery onLeave={() => setOpen(false)} /></Suspense>
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
                <button type="button" className="btn primary aif-askq" disabled={qtr == null || busy} onClick={() => { const q = QUARTERS.find((x) => x.n === qtr); if (q) void ask(quarterQuestion(company, q, fy), "company", { id: "quarter", sym: company, quarter: q.n, fy }); }}>{qtr == null ? "Choose a quarter to ask" : `Ask about Q${qtr} ${fy}`}</button>
                <button type="button" className="aif-qtrend" onClick={() => void ask(quarterTrendQuestion(company), "company", { id: "quarter-trend", sym: company })}>Compare Q1 to Q4 over two years <Icon name="arrow" /></button>
                <p className="aif-note">Answers are general information drawn from the company's reported figures, filings and prices. They are not investment advice.</p>
              </aside>
              <div className="aif-cm">
                <div className="aif-h"><h2>What do you want to understand about {company}?</h2><p>Pick a group, then one of the questions. Or search them below.</p></div>
                <ol className="aif-steps" aria-label="How it works">
                  <li className="done"><i>1</i><span><b>Company</b><small>{company} is chosen</small></span></li>
                  <li className={qtr != null ? "done" : ""}><i>2</i><span><b>Period (optional)</b><small>Set the quarter and year in the company box</small></span></li>
                  <li><i>3</i><span><b>Question</b><small>Choose below, or search them</small></span></li>
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
                    {QUARTERS.map((q) => <button key={q.n} type="button" onClick={() => void ask(quarterQuestion(company, q), "company", { id: "quarter", sym: company, quarter: q.n })}><b>Q{q.n}</b><small>{q.months}</small></button>)}
                  </div>
                  <button type="button" className="aif-qtrend" onClick={() => void ask(quarterTrendQuestion(company), "company", { id: "quarter-trend", sym: company })}>Compare Q1 to Q4 over two years <Icon name="arrow" /></button>
                </div>}
                <ul className="aif-qs" aria-label="Questions about this company">{tabQuestions(tab, company, lender).map((q) => row(q))}</ul>
              </div>
            </>}

            {view === "chat" && <>
              {msgs.map((m, i) => <div key={i} className={"bub " + (m.role === "user" ? "me" : "bot") + (m.ai?.error ? " aif-bub-err" : "") + (big && m.role === "assistant" ? " aif-lab" : "")} style={m.role === "user" ? { whiteSpace: "pre-wrap" } : undefined} aria-busy={!!m.ai?.status || undefined}>{m.ai?.status && !m.content ? <span className="aif-reading" role="status"><i />{m.ai.status}…</span> : m.role === "assistant" ? <AnswerText text={m.content} /> : m.content}
                {m.ai?.disclaimer && <small className="aif-disc">{m.ai.disclaimer}</small>}
                {m.ai?.plans && <Link className="aif-ans-link" to="/plans" onClick={() => { if (!big) setOpen(false); }}>See the plans <Icon name="arrow" /></Link>}{m.role === "user" && <button type="button" className={"aif-save" + (saved.includes(m.content) ? " on" : "")} aria-pressed={saved.includes(m.content)} aria-label={saved.includes(m.content) ? "Remove this question from saved" : "Save this question"} title={saved.includes(m.content) ? "Saved" : "Save this question"} onClick={() => setSaved((l) => toggleSaved(l, m.content))}><Icon name="star" /></button>}
                {m.link && <Link className="aif-ans-link" to={m.link.to} onClick={() => { if (!big) setOpen(false); }}>{m.link.label} <Icon name="arrow" /></Link>}
                {m.actions && <p className="aif-acts">{m.ai && <span className="aif-acts-l">Read on FinLit</span>}{m.actions.map((a) => <Link key={a.to} to={a.to} onClick={() => { if (!big) setOpen(false); }}>{a.label} <Icon name="arrow" /></Link>)}</p>}
                {m.suggest && m.suggest.length > 0 && <ul className="aif-qs aif-sugq" aria-label="Closest listed questions">{m.suggest.map((q) => row(q))}</ul>}</div>)}
              {busy && !msgs[msgs.length - 1]?.ai && <div className="bub bot typing" role="status" aria-label="Putting the answer together from FinLit's figures"><i /><i /><i /></div>}
              {!busy && msgs.length > 0 && relatedQs.length > 0 && <div className="aif-rel"><p className="aif-label">Related questions</p>
                <ul className="aif-qs" aria-label="Related questions">{relatedQs.map((q) => row(q))}</ul></div>}
              {!busy && msgs.length > 0 && <div className="chips">{back === "funds" ? <button type="button" className="back" onClick={() => setView("funds")}>← More fund and ETF questions</button>
                : <button type="button" className="back" onClick={() => setView(company ? "company" : "home")}>{company ? `← More about ${company}` : "← Main menu"}</button>}
                {company && <button type="button" className="back" onClick={() => { setCompany(null); setView("segments"); }}>Change company</button>}</div>}
            </>}
            <div ref={end} />
          </div>
          <div className="aif-inw" hidden={view === "home"}>
          {view !== "home" && suggest("aif-sg-bottom", "up")}
          <form onSubmit={send}>
            <input ref={field} value={text} onChange={(e) => { setText(e.target.value); setSgOpen(true); }} maxLength={300} autoComplete="off" {...comboProps("aif-sg-bottom")}
              placeholder={aiReady ? (company && view !== "home" ? `Ask anything, not just ${company}` : "Ask about a company, a fund or the market") : company && view !== "home" ? `Search ${company}'s questions (e.g. debt, dividend, P/E)` : "Search the questions (e.g. P/E, cash flow, debt)"}
              aria-label={aiReady ? "Your question for FinLit AI" : "Search the listed questions"} />
            <kbd className="aif-enter" aria-hidden="true">Enter</kbd>
            <button disabled={busy || !text.trim()} aria-label="Send"><Icon name="arrow" /></button>
          </form>
          </div>
          <p className="ai-fine">General information, not investment advice.{aiOn && user && qd && (qd.limit ?? 0) > 0 && <> <span className="aif-left">FinLit AI: {qd.left} of {qd.limit} written answers left this month{qd.left === 0 && qd.resets ? `; they renew on ${new Date(qd.resets).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}.</span></>}</p>
        </section>
      )}
    </>
  );
}
