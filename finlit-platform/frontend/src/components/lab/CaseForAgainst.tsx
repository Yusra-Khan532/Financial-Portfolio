// Trading Lab > Order Flow > Case for / against (docs/TRADING-LAB.md, build order item 7). For one company, FinLit AI writes what FinLit's stored
// figures support, what they challenge and what they cannot settle (backend finlit/lab/case.py). Every sentence with a figure ends with its source
// numbers; pointing at a number shows the fact and where it is stored, and the numbered Sources list is below. Written on demand (the button), kept
// until a new filing or new prices. It gives no verdict.
import { useMemo, useState, type FocusEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, useSearchIndex } from "../../lib/api";
import { rankCompanies } from "../../lib/companySearch";
import { codeText, subOf, titleOf } from "../../lib/companyLabel";
import { Icon } from "../../lib/icons";
import { CASE_HOW, CASE_NOTE, caseDay, caseTime, factGroups, getCase, limitLine, writeCase, type CaseFact, type CaseSection, type LabCase } from "../../lib/labCase";
import { useTip } from "./FlowTips";

const QUICK = ["RELIANCE", "HDFCBANK", "TCS", "INFY", "ITC", "LT"];
const SHOW_SOURCES = 15;
const ICONS: Record<CaseSection["id"], "check" | "alert" | "info"> = { support: "check", challenge: "alert", unsettled: "info" };

function FactPop({ f }: { f: CaseFact }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>Source [{f.n}]</b><small>{f.groupLabel}</small></div></header>
      <p className="lcase-pop-fact">{f.text}</p>
      <p className="muted lcase-pop-src">{f.source}</p>
    </>
  );
}

/** A sentence's source numbers: each a link to its row in Sources, with the fact in a hover card (pointer) or on focus (keyboard). */
function Refs({ ns, by, onOpen }: { ns: number[]; by: Map<number, CaseFact>; onOpen: (n: number) => void }) {
  const tip = useTip();
  const focusShow = (e: FocusEvent<HTMLAnchorElement>, body: ReactNode) => {
    const r = e.currentTarget.getBoundingClientRect();
    tip.show({ clientX: r.right, clientY: r.top + r.height / 2, pointerType: "mouse" }, body);
  };
  return (
    <>{ns.map((n) => {
      const f = by.get(n);
      if (!f) return null;
      return (
        <a key={n} href={`#lcase-src-${n}`} className="lcase-ref" aria-label={`Source ${n}: ${f.text}`}
          onPointerMove={(e) => tip.show(e, <FactPop f={f} />)} onPointerLeave={() => tip.hide()}
          onFocus={(e) => focusShow(e, <FactPop f={f} />)} onBlur={() => tip.hide()} onClick={() => onOpen(n)}>[{n}]</a>
      );
    })}</>
  );
}

function SectionCard({ s, by, onOpen }: { s: CaseSection; by: Map<number, CaseFact>; onOpen: (n: number) => void }) {
  return (
    <article className={`lcase-card ${s.id}`} aria-labelledby={`lcase-${s.id}-h`}>
      <h3 id={`lcase-${s.id}-h`}><span className="lcase-ic" aria-hidden="true"><Icon name={ICONS[s.id]} /></span>{s.title}</h3>
      {s.sentences.length ? (
        <ul className="lcase-sents">{s.sentences.map((x, i) => (
          <li key={i}>{x.text}{x.sources.length > 0 && <> <span className="lcase-refs"><Refs ns={x.sources} by={by} onOpen={onOpen} /></span></>}</li>
        ))}</ul>
      ) : <p className="muted">Nothing was written under this heading.</p>}
    </article>
  );
}

function Sources({ facts, open, setOpen, hot }: { facts: CaseFact[]; open: boolean; setOpen: (v: boolean) => void; hot: number | null }) {
  const shown = open ? facts : facts.slice(0, SHOW_SOURCES);
  const groups = factGroups(shown);
  return (
    <section className="lcase-srcs" aria-labelledby="lcase-src-h">
      <h3 id="lcase-src-h">Sources</h3>
      <p className="muted lcase-sub">The numbered sheet FinLit AI wrote from: {facts.length} figures, each with the table it is stored in and its date.</p>
      {groups.map((g) => (
        <div key={g.label} className="lcase-sgroup">
          <h4>{g.label}</h4>
          <ol className="lcase-slist">{g.facts.map((f) => (
            <li key={f.n} id={`lcase-src-${f.n}`} className={hot === f.n ? "hot" : undefined}>
              <b className="lcase-n">[{f.n}]</b><span className="lcase-stext">{f.text}<small>{f.source}</small></span>
            </li>))}</ol>
        </div>
      ))}
      {facts.length > SHOW_SOURCES && (
        <button type="button" className="chip lcase-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Show fewer" : `Show ${facts.length - SHOW_SOURCES} more`}</button>)}
    </section>
  );
}

/** Why there is no written case yet, or what stopped it, in one plain line. */
function stateLine(c: LabCase | undefined, err: ApiError | null): { text: string; tone: "muted" | "warn" } | null {
  if (err) return { text: err.body.detail || "FinLit AI could not write the case just now. Try again in a minute.", tone: "warn" };
  if (!c) return null;
  if (c.outcome === "not_written" || c.outcome === "too_few") return { text: c.message || "", tone: "warn" };
  if (!c.enabled && c.outcome === "none") return { text: "FinLit AI's written answers are not switched on yet. The numbered figures are listed under Sources.", tone: "warn" };
  return null;
}

export function CaseForAgainst() {
  const [sym, setSym] = useState("RELIANCE");
  const [find, setFind] = useState("");
  const [open, setOpen] = useState(false);
  const [hot, setHot] = useState<number | null>(null);
  const qc = useQueryClient();
  const idx = useSearchIndex(true);
  const q = useQuery<LabCase, ApiError>({ queryKey: ["lab-case", sym], queryFn: () => getCase(sym), retry: false, staleTime: 60_000 });
  const w = useMutation<LabCase, ApiError, string>({
    mutationFn: writeCase,
    onSuccess: (data, s) => qc.setQueryData(["lab-case", s], data),
  });
  const matches = useMemo(() => (find.trim() ? rankCompanies(idx.data?.rows, find, 8) : []), [find, idx.data]);
  const pick = (s: string) => { setSym(s); setFind(""); setOpen(false); w.reset(); };
  const c = q.data;
  const by = useMemo(() => new Map((c?.sources ?? []).map((f) => [f.n, f])), [c]);
  const writing = w.isPending && w.variables === sym;
  const limitErr = w.error?.status === 429 || (c?.limit.left ?? 1) <= 0;
  const written = c?.outcome === "written";
  const state = stateLine(c, w.error && w.variables === sym ? w.error : null);
  const canWrite = !!c && !written && c.enabled && c.outcome !== "too_few" && !limitErr && !writing;
  const onOpen = (n: number) => { setHot(n); if (n > SHOW_SOURCES) setOpen(true); };
  return (
    <section className="card oflow-board lcase" aria-labelledby="lcase-h">
      <div className="oflow-hero-h"><div><h2 id="lcase-h">Case for / against</h2>
        <p className="muted">What FinLit's stored figures support, what they challenge and what they cannot settle for one company, written by FinLit AI with a source after every figure.</p></div></div>
      <div className="opul-pick lcase-pick">
        <div className="oflow-bchips" role="group" aria-label="Companies">{QUICK.map((s) => (
          <button key={s} type="button" className="oflow-bchip" aria-pressed={sym === s} onClick={() => pick(s)}>{s}</button>))}</div>
        <div className="opul-find">
          <input type="search" value={find} onChange={(e) => setFind(e.currentTarget.value)} placeholder="Any listed company" aria-label="Find a company" />
          {matches.length > 0 && <ul className="opul-found" aria-label="Matching companies">{matches.map((m) => (
            <li key={m.symbol}><button type="button" onClick={() => pick(m.symbol)}><b>{titleOf(m)}</b> <span className="muted">{subOf(m) ?? codeText(m.symbol)}</span></button></li>))}</ul>}
        </div>
      </div>

      {q.isPending && <div className="skeleton" style={{ height: 220 }} aria-label="Loading the figures" />}
      {q.isError && <div className="formerr" role="alert">{q.error.body.detail || `The figures for ${sym} could not be read right now. Try again in a minute.`}</div>}
      {c && <>
        <div className="lcase-bar">
          <div className="lcase-co"><b>{c.name}</b><small className="muted">{codeText(c.symbol)} · {c.inputs.statement} statements · {c.sources.length} figures</small></div>
          <div className="lcase-act">
            {!written && <button type="button" className="btn primary lcase-go" onClick={() => w.mutate(sym)} disabled={!canWrite} aria-busy={writing}>
              {writing ? "Writing the case…" : "Write the case"}</button>}
            {written && <span className="lcase-done" role="status"><Icon name="check" /> {c.cached ? "Opened from the saved case" : "Written just now"}</span>}
            <small className={`lcase-limit${limitErr ? " warn" : ""}`}>{limitLine(w.error?.status === 429 ? { ...c.limit, left: 0, used: c.limit.limit } : c.limit)}</small>
          </div>
        </div>
        {writing && <p className="lcase-wait" role="status"><span className="lcase-dot" aria-hidden="true" />FinLit AI is writing from {c.sources.length} figures and checking every sentence. This takes up to a minute.</p>}
        {state && !writing && <p className={`lcase-state ${state.tone}`} role="status">{state.text}</p>}
        {written && <>
          <div className="lcase-grid">{c.sections.map((s) => <SectionCard key={s.id} s={s} by={by} onOpen={onOpen} />)}</div>
          <p className="muted lcase-meta">Written {caseTime(c.generatedAt)} · latest filing {caseDay(c.inputs.filingDate)} · prices to {caseDay(c.inputs.priceDate)} · kept until a new filing or new prices</p>
        </>}
        <p className="lcase-note" role="note"><Icon name="info" /> {CASE_NOTE}</p>
        <Sources facts={c.sources} open={open} setOpen={setOpen} hot={hot} />
      </>}
      <details className="oflow-how"><summary>How it is written</summary><p className="muted oflow-method">{CASE_HOW}</p></details>
    </section>
  );
}
