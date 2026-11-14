// The Glossary as the "FinLit final pages" pack draws it (board 02, 13 Nov 2026): Learn › Glossary, the header panel with three links, the search box
// (Ctrl K), four tiles, the three views (Browse A to Z, FinLit words, New and updated), the topic list on the left, the letters, one letter's terms as
// rows that open (Why it matters, How to use it, the formula and How FinLit measures it), Other letters, the page's questions and the note under it.
// Board 03's change list is in the data: the `change` mark and the rewritten entries. Words: lib/glossaryPack.ts. Styles: styles/glossary-pack.css.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { PageFaqs } from "../components/PageFaqs";
import { Icon } from "../lib/icons";
import { LETTERS, TERMS, TOPICS, search, type Term } from "../lib/glossary";
import { DESC, EDU, FINLIT_WORDS, FOOT, SEARCH_HINT, badge, countLine, counts, firstLetter, letterCounts, pick, tabs, tiles, type Tab } from "../lib/glossaryPack";
import { useDocTitle } from "../lib/title";
import "../styles/sectors-pack.css";
import "../styles/glossary-pack.css";

const C = counts(TERMS, TOPICS);

/** One term as a row that opens: the name, its topic, New or Updated, and the meaning; open, the other parts. */
function Row({ t, open, onToggle, solo }: { t: Term; open: boolean; onToggle: () => void; solo?: boolean }) {
  const b = badge(t), body = `gp-b-${t.id}`;
  return (
    <li className={"gp-row" + (open ? " open" : "")} id={t.id}>
      <button type="button" className="gp-rh" aria-expanded={open} aria-controls={body} onClick={onToggle}>
        <span className="gp-rt"><b>{t.term}</b><span className="gp-topic">{t.topic}</span>{b && <span className={"gp-badge " + t.change}>{b}</span>}</span>
        <span className="gp-rm">{t.meaning}</span>
        <span className="gp-car" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="gp-rb" id={body}>
          <div className="gp-two"><div><span className="gp-k">Why it matters</span><p>{t.why}</p></div><div><span className="gp-k">How to use it</span><p>{t.how}</p></div></div>
          {t.formula && <div className="gp-f"><span className="gp-k">Formula</span><code>{t.formula}</code></div>}
          {t.finlit && <div className="gp-n"><span className="gp-k">How FinLit measures it</span><p>{t.finlit}</p></div>}
          {!solo && <Link className="gp-own" to={`/glossary/${t.id}`}>Open “{t.term}” on its own page</Link>}
        </div>)}
    </li>
  );
}

export function GlossaryPage() {
  const { id } = useParams();                                   // /glossary/<term>: one term on its own address (searchable and shareable)
  const one = id ? TERMS.find((t) => t.id === id) : undefined;
  useDocTitle(one ? `${one.term}: meaning and formula` : "Glossary", one ? one.meaning.slice(0, 155) : `FinLit Glossary: ${TERMS.length} investing terms in plain words, from A to Z, with formulas and how FinLit measures them.`);
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("az"), [q, setQ] = useState(""), [topic, setTopic] = useState(""), [changed, setChanged] = useState(false);
  const counted = useMemo(() => letterCounts(TERMS, LETTERS, { topic, changed }), [topic, changed]);
  const [letter, setLetter] = useState("A");   // the pack opens on A (0–9 holds one term)
  const [opened, setOpened] = useState<Set<string> | null>(null);   // null: the first row of the view is open, as in the pack
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!counted[letter]) setLetter(firstLetter(counted, LETTERS)); }, [counted, letter]);
  useEffect(() => {   // Ctrl K (or Cmd K) puts the cursor in the search box
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); box.current?.focus(); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, []);
  useEffect(() => {   // a deep link #term-id opens that term at its letter
    const h = decodeURIComponent(location.hash.slice(1)), t = TERMS.find((x) => x.id === h);
    if (t) { setLetter(t.letter); setOpened(new Set([t.id])); setTimeout(() => document.getElementById(t.id)?.scrollIntoView?.({ block: "start" }), 60); }
  }, []);

  const query = q.trim();
  const list = useMemo(() => {
    if (one) return [one];
    if (query) return search(query, TERMS.filter((t) => !topic || t.topic === topic));
    if (tab === "fw") return pick(TERMS, { topic: FINLIT_WORDS });
    if (tab === "nu") { const ch = pick(TERMS, { changed: true }); return [...ch.filter((t) => t.change === "new"), ...ch.filter((t) => t.change === "updated")]; }
    return pick(TERMS, { letter, topic, changed });
  }, [one, query, tab, topic, letter, changed]);
  const shownOpen = opened ?? new Set(list[0] && !query ? [list[0].id] : []);
  const isOpen = (t: Term) => !!one || shownOpen.has(t.id);
  const toggle = (t: Term) => { const n = new Set(shownOpen); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); setOpened(n); };
  const fresh = () => setOpened(null);
  const heading = one ? one.term : query ? `Results for “${query}”` : tab === "fw" ? FINLIT_WORDS : tab === "nu" ? "New and updated" : letter;
  const sub = query ? `${list.length} term${list.length === 1 ? "" : "s"} match` : countLine(list.length);

  return (
    <div className="wrap gp sp">
      <nav className="gp-crumb" aria-label="Breadcrumb"><span>Learn</span><span aria-hidden="true">›</span><span aria-current="page">Glossary</span></nav>
      <header className="gp-head" aria-labelledby="gp-title">
        <div className="gp-head-top">
          <div><p className="gp-eyebrow">Learn</p><h1 id="gp-title">Glossary</h1><p className="gp-desc">{DESC(C.terms)}</p></div>
          <nav className="gp-links" aria-label="Related pages"><Link to="/blog">Insights &amp; blog →</Link><Link to="/faq">FAQs →</Link><Link to="/stocks/RELIANCE">Company report →</Link></nav>
        </div>
        <label className="gp-search"><Icon name="search" /><input ref={box} type="search" value={q} onChange={(e) => { setQ(e.target.value); fresh(); if (one) nav("/glossary"); }} placeholder={SEARCH_HINT(C.terms)} aria-label="Search the glossary" /><kbd>Ctrl K</kbd></label>
        <div className="gp-tiles">{tiles(C).map((x) => <div key={x.k} className="gp-tile"><span>{x.k}</span><b>{x.v}</b><small>{x.s}</small></div>)}</div>
        <p className="gp-edu">{EDU}</p>
      </header>

      <div className="gp-tabs" role="group" aria-label="Views">
        {tabs(C).map((t) => <button key={t.id} type="button" className="gp-tab" aria-pressed={!one && !query && tab === t.id} onClick={() => { setTab(t.id); setQ(""); fresh(); if (one) nav("/glossary"); }}><b>{t.title}</b><small>{t.sub}</small></button>)}
      </div>

      <div className="gp-cols">
        <aside className="gp-side" aria-label="Topics">
          <p className="gp-k">Topic</p>
          <label className="gp-topsel"><span className="sr-only">Topic</span><select value={topic} onChange={(e) => { setTopic(e.target.value); setTab("az"); fresh(); if (one) nav("/glossary"); }}>
            <option value="">All topics ({C.terms})</option>{TOPICS.map((tp) => <option key={tp} value={tp}>{tp} ({TERMS.filter((t) => t.topic === tp).length})</option>)}</select></label>
          <ul>
            <li><button type="button" aria-pressed={!topic} onClick={() => { setTopic(""); setTab("az"); fresh(); if (one) nav("/glossary"); }}><span>All topics</span><b>{C.terms}</b></button></li>
            {TOPICS.map((tp) => <li key={tp}><button type="button" aria-pressed={topic === tp} onClick={() => { setTopic(tp); setTab("az"); fresh(); if (one) nav("/glossary"); }}><span>{tp}</span><b>{TERMS.filter((t) => t.topic === tp).length}</b></button></li>)}
          </ul>
        </aside>

        <section className="gp-main" aria-labelledby="gp-h">
          {one ? <p className="gp-back"><Link to="/glossary">All {C.terms} glossary terms</Link></p> : tab === "az" && !query && (<>
            <div className="gp-letters" role="group" aria-label="Letters">{LETTERS.map((l) => <button key={l} type="button" aria-pressed={letter === l} disabled={!counted[l]} onClick={() => { setLetter(l); fresh(); }}>{l}</button>)}</div>
            <div className="gp-chips" role="group" aria-label="Show">
              <button type="button" className="gp-chip" aria-pressed={!changed} onClick={() => { setChanged(false); fresh(); }}>All terms</button>
              <button type="button" className="gp-chip" aria-pressed={changed} onClick={() => { setChanged(true); fresh(); }}>New and updated</button>
            </div></>)}
          <div className="gp-lh"><h2 id="gp-h">{heading}</h2>{!one && <span>{sub}</span>}</div>
          {list.length ? <ul className="gp-list">{list.map((t) => <Row key={t.id} t={t} open={isOpen(t)} onToggle={() => toggle(t)} solo={!!one} />)}</ul>
            : <p className="gp-empty">No matching terms. Try a different word, or choose All topics.</p>}
          {!one && tab === "az" && !query && (
            <div className="gp-other"><p className="gp-k">Other letters</p>
              <div>{LETTERS.filter((l) => l !== letter && counted[l]).map((l) => <button key={l} type="button" onClick={() => { setLetter(l); fresh(); document.getElementById("gp-h")?.scrollIntoView?.({ block: "start", behavior: "smooth" }); }}><b>{l}</b> {counted[l]}</button>)}</div>
            </div>)}
        </section>
      </div>

      <PageFaqs inline />
      <p className="gp-foot">{FOOT}</p>
    </div>
  );
}
