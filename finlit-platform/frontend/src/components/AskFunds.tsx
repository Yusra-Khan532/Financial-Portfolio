// Task #203: the FinLit AI theme "Mutual funds & ETFs": the team's 1,391 questions in their 20 segments, a search over all of them, and, for a question about
// one fund (or two, or an ETF), a picker for it first. The chosen fund stays in context for the next question. Answers come from askFunds.ts (FinLit's own
// fund data, or written text); loaded only when the theme is opened. Styles: styles/ask-funds.css (afq-). Describes; never advises.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../lib/icons";
import { answerFundQ, filled, findEtfs, findFunds, loadFundBank, searchFundQs, shownText, type FundCtx, type FundQ, type FundSeg, type Picked, type PickedEtf, type Slot } from "../lib/askFunds";
import { FUND_TEXT } from "../lib/askFundsText";
import type { Answer } from "../lib/askAnswers";
import "../styles/ask-funds.css";

const SLOT_WORD: Record<Slot, string> = { fund: "Which fund?", fund2: "And the second fund?", etf: "Which ETF?" };

/** The picker for one slot: type a few letters of a fund (or an ETF symbol) and choose it. */
function Pick({ slot, onPick }: { slot: Slot; onPick: (p: Picked | PickedEtf) => void }) {
  const [term, setTerm] = useState(""), [hits, setHits] = useState<(Picked | PickedEtf)[]>([]), [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      (slot === "etf" ? findEtfs(term) : findFunds(term)).then((h) => { if (live) { setHits(h); setErr(""); } }).catch(() => live && setErr("The list could not be loaded just now. Please try again."));
    }, 200);
    return () => { live = false; window.clearTimeout(t); };
  }, [term, slot]);
  const id = "afq-pick-" + slot;
  return (
    <div className="afq-pick">
      <label htmlFor={id}>{SLOT_WORD[slot]}</label>
      <input id={id} type="search" value={term} onChange={(e) => setTerm(e.target.value)} autoComplete="off" autoFocus
        placeholder={slot === "etf" ? "An ETF symbol or name, e.g. NIFTYBEES or gold" : "A fund name, scheme code or ISIN, e.g. Parag Parikh Flexi Cap"} />
      {err && <p className="aif-err" role="status">{err}</p>}
      {hits.length > 0 && <ul className="afq-hits" aria-label="Matches">{hits.map((h) => <li key={"code" in h ? h.code : h.symbol}><button type="button" onClick={() => onPick(h)}>
        {"code" in h ? <><b>{h.name}</b><small>{[h.plan, h.option].filter(Boolean).join(" · ")}</small></> : <><b>{h.symbol}</b><small>{h.name}</small></>}</button></li>)}</ul>}
      {!hits.length && term.trim().length >= 2 && !err && <p className="aif-none">Nothing matches “{term.trim()}”.</p>}
    </div>
  );
}

export function AskFunds({ ctx, setCtx, onAnswer, compact = false }: { ctx: FundCtx; setCtx: (c: FundCtx) => void; onAnswer: (question: string, answer: Promise<Answer>) => void; compact?: boolean }) {
  const [bank, setBank] = useState<{ segments: FundSeg[]; all: FundQ[] } | null>(null), [failed, setFailed] = useState(false);
  const [term, setTerm] = useState(""), [open, setOpen] = useState<number | null>(null), [want, setWant] = useState<FundQ | null>(null);
  useEffect(() => { loadFundBank().then(setBank).catch(() => setFailed(true)); }, []);
  const hits = useMemo(() => (bank && term.trim() ? searchFundQs(bank.all, term, 40) : []), [bank, term]);
  // the slot still to fill for the chosen question (a fund, a second fund, an ETF), in that order
  const missing = (q: FundQ, c: FundCtx): Slot | null => q.slots.find((s) => !c[s]) ?? null;
  const send = (q: FundQ, c: FundCtx) => { setWant(null); onAnswer(filled(q, c), answerFundQ(q, c, FUND_TEXT)); };
  const choose = (q: FundQ) => {
    const c = q.slots.includes("fund2") ? { ...ctx, fund2: undefined } : ctx;   // a second fund is chosen each time: it is the one being compared
    if (missing(q, c)) { setCtx(c); setWant(q); } else send(q, c);
  };
  const picked = (slot: Slot, p: Picked | PickedEtf) => {
    const c = { ...ctx, [slot]: p } as FundCtx;
    setCtx(c);
    if (want && !missing(want, c)) send(want, c);
  };
  const qRow = (q: FundQ, sub?: string) => (
    <li key={q.id}><button type="button" className="aif-q" onClick={() => choose(q)}>
      <Icon name="chat" /><span>{shownText(q.text).replace(/\{fund2\}/g, "a second fund").replace(/\{fund\}/g, ctx.fund?.name ?? "a fund").replace(/\{etf\}/g, ctx.etf?.symbol ?? "an ETF")}{sub && <small>{sub}</small>}</span><Icon name="arrow" /></button></li>);

  if (failed) return <p className="aif-err" role="status">The mutual fund questions could not be loaded just now. Please try again.</p>;
  if (!bank) return <p className="aif-none" role="status">Loading the mutual fund and ETF questions…</p>;
  if (want) {
    const slot = missing(want, ctx)!;
    return (
      <div className={"afq" + (compact ? " sm" : "")}>
        <button type="button" className="afq-back" onClick={() => setWant(null)}><Icon name="arrow" /> All questions</button>
        <p className="afq-want"><Icon name="chat" />{shownText(want.text).replace(/\{fund2\}/g, ctx.fund2?.name ?? "a second fund").replace(/\{fund\}/g, ctx.fund?.name ?? "a fund").replace(/\{etf\}/g, ctx.etf?.symbol ?? "an ETF")}</p>
        <Pick key={slot} slot={slot} onPick={(p) => picked(slot, p)} />
      </div>
    );
  }
  return (
    <div className={"afq" + (compact ? " sm" : "")}>
      <label className="aif-exs afq-search"><Icon name="search" /><span className="sr-only">Search the mutual fund and ETF questions</span>
        <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={`Search ${bank.all.length.toLocaleString("en-IN")} questions (e.g. expense ratio, SIP, gold ETF)`} autoComplete="off" /></label>
      {(ctx.fund || ctx.etf) && <p className="afq-ctx">In context: {ctx.fund && <b>{ctx.fund.name}</b>}{ctx.fund && ctx.etf && " and "}{ctx.etf && <b>{ctx.etf.symbol}</b>}
        <button type="button" onClick={() => setCtx({})}>Clear</button></p>}
      {term.trim() ? (hits.length ? <ul className="aif-qs" aria-label="Matching questions">{hits.map((q) => qRow(q, `${q.segTitle} · ${q.sub}`))}</ul>
        : <p className="aif-none">No question matches “{term.trim()}”. Try fewer words, or open a segment below.</p>)
        : <ul className="afq-segs" aria-label="Segments">
          {bank.segments.map((s) => {
            const n = s.subs.reduce((a, b) => a + b.qs.length, 0), on = open === s.n;
            return (
              <li key={s.n} className={on ? "on" : ""}>
                <button type="button" className="afq-seg" aria-expanded={on} aria-controls={"afq-s" + s.n} onClick={() => setOpen(on ? null : s.n)}>
                  <span className="afq-n" aria-hidden="true">{s.n}</span><b>{s.title}</b><small>{n} questions</small><i aria-hidden="true">▾</i></button>
                {on && <div id={"afq-s" + s.n} className="afq-subs">{s.subs.map((b) => (
                  <section key={b.name} aria-label={b.name}><h4>{b.name}</h4><ul className="aif-qs">{b.qs.map((q) => qRow(q))}</ul></section>))}</div>}
              </li>);
          })}
        </ul>}
    </div>
  );
}
