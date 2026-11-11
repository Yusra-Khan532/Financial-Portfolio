import { useMemo, useState } from "react";
import { useDiversification } from "./useDiversification";
import type { Diversification, Horizon } from "./types";
import { EachStock, GroupsBlock, Heatmap, HorizonToggle, RecentBlock, RiskBlock, ScoreBlock, SpreadBlock, Tiles, TiltBlock } from "./sections";
import * as W from "./wording";
import "./diversification.css";

export type DiversificationProps = {
  /** Share names only. The card never asks for or sends amounts, quantities, prices or dates. */
  symbols: string[];
  /** A short name for the list ("Sample list", "Equity portfolio"); shown beside the score. */
  listLabel?: string;
  /** Names the person may search to ADD to the what-if list: [symbol, company name]. The card never proposes one. */
  candidates?: [string, string][];
  /** Show the what-if control (leave a name out, or add a name the person chooses). */
  whatIf?: boolean;
};

const Skeleton = () => <div className="dv-skel" role="status" aria-label="Working out the diversification figures"><i style={{ height: 120 }} /><i style={{ height: 60 }} /><i style={{ height: 180 }} /></div>;

/** The list being analysed, always on show (task #78): who is in it and how many. It follows every add, remove or change of the list. */
function CurrentList({ names, count }: { names: string[]; count: number }) {
  return (
    <div className="dv-cur" aria-label="The list being analysed">
      <span className="dv-cur-i" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></svg></span>
      <span className="dv-cur-t"><b>Current list</b><span title={names.join(", ")}>{names.length ? names.join(" + ") : "No names yet"}</span></span>
      <em className="dv-cur-n">{W.plural(count, "stock")}</em>
    </div>
  );
}

function WhatIf({ base, removed, added, candidates, onToggle, onAdd, onReset }: { base: string[]; removed: Set<string>; added: string[]; candidates: [string, string][]; onToggle: (s: string) => void; onAdd: (s: string) => void; onReset: () => void }) {
  const [text, setText] = useState("");
  const names = useMemo(() => new Map(candidates), [candidates]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim().toUpperCase(), hit = names.has(t) ? t : candidates.find(([, n]) => n.toLowerCase() === text.trim().toLowerCase())?.[0];
    if (hit) { onAdd(hit); setText(""); }
  };
  const changed = removed.size > 0 || added.length > 0;
  return (
    <>
      <p className="dv-note">Leave a name out, or add a name you choose, to see the same figures for that list. FinLit does not suggest names.</p>
      <ul className="dv-chips">{[...base, ...added].map((s) => { const off = removed.has(s); return <li key={s}><button type="button" aria-pressed={off} className={off ? "off" : ""} onClick={() => onToggle(s)}>{s}<span aria-hidden="true">{off ? " +" : " ×"}</span><span className="sr-only">{off ? ", left out. Put back" : ", included. Leave out"}</span></button></li>; })}</ul>
      <form className="dv-add" onSubmit={submit}>
        <label className="sr-only" htmlFor="dv-add-in">Add a name to the list</label>
        <input id="dv-add-in" list="dv-add-names" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a name, e.g. ITC" autoComplete="off" maxLength={80} />
        <datalist id="dv-add-names">{candidates.slice(0, 500).map(([s, n]) => <option key={s} value={s}>{n}</option>)}</datalist>
        <button className="dv-btn" disabled={!text.trim()}>Add</button>
        {changed && <button type="button" className="dv-btn ghost" onClick={onReset}>Back to the original list</button>}
      </form>
    </>
  );
}

export function DiversificationCard({ symbols, listLabel, candidates = [], whatIf = true }: DiversificationProps) {
  const [horizon, setHorizon] = useState<Horizon>("weekly");
  const [riskView, setRiskView] = useState<"equal" | "mcap">("equal"), [riskBy, setRiskBy] = useState<"sector" | "stock">("sector");
  const [removed, setRemoved] = useState<Set<string>>(new Set()), [added, setAdded] = useState<string[]>([]);
  const [copied, setCopied] = useState(false), [wiOpen, setWiOpen] = useState(false);
  const nameOf = useMemo(() => new Map(candidates), [candidates]);
  const base = useMemo(() => [...new Set(symbols.map((s) => s.toUpperCase()))], [symbols]);
  const live = useMemo(() => [...base.filter((s) => !removed.has(s)), ...added.filter((s) => !removed.has(s) && !base.includes(s))], [base, removed, added]);
  const weekly = useDiversification(live, "weekly");
  const other = useDiversification(live, horizon, horizon !== "weekly");
  const w = weekly.data;
  const v: Diversification | undefined = horizon === "weekly" ? w : other.data?.horizon === horizon ? other.data : undefined;
  const toggle = (s: string) => { if (added.includes(s)) setAdded(added.filter((x) => x !== s)); else setRemoved((r) => { const n = new Set(r); if (n.has(s)) n.delete(s); else n.add(s); return n; }); };
  const reset = () => { setRemoved(new Set()); setAdded([]); };
  const copy = () => { if (!w) return; const t = W.summaryText(horizon === "weekly" || !v?.headline ? w : { ...w, headline: v.headline, clusters: v.clusters }, horizon); navigator.clipboard?.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => undefined); };

  let body;
  if (!live.length) body = <p className="dv-empty"><b>No names in this list.</b> Add at least one name above to see how spread out it is.</p>;
  else if (weekly.isPending) body = <Skeleton />;
  else if (weekly.isError || !w) {
    const e = weekly.error;
    body = <div className="dv-empty" role="alert"><b>The diversification figures could not be worked out.</b><p>{e?.status === 422 ? "One of the names was not understood. Check the spelling or use the NSE ticker." : e?.body?.detail || "The service did not answer. Please try again in a moment."}</p><button className="dv-btn" onClick={() => weekly.refetch()}>Try again</button></div>;
  } else body = (
    <>
      <div className="dv-top"><span>{W.plural(live.length, "stock")}{w.asOf ? ` · ${W.windowText(w.asOf)}` : ""} {"·"} compared with NIFTY 50</span>{listLabel && <em className="dv-pill">{listLabel}</em>}</div>
      {w.score && w.headline ? (
        <>
          <ScoreBlock d={w} listLabel={undefined} />
          <HorizonToggle value={horizon} onChange={setHorizon} />
          {!v ? (other.isError ? <p className="dv-empty" role="alert">{other.error?.body?.detail || "This view could not be loaded."} <button className="dv-btn" onClick={() => other.refetch()}>Try again</button></p> : <Skeleton />)
            : !v.headline ? <p className="dv-empty">{v.viewNote || "Not enough monthly prices for this view."}</p>
            : (
              <>
                <p className="dv-view">{W.horizonSentence(v, horizon)}</p>
                <Tiles w={w} v={v} h={horizon} />
                <div className="dv-two big"><SpreadBlock d={w} /><GroupsBlock d={w} v={v} h={horizon} /></div>
              </>)}
          {horizon !== "weekly" && v?.headline && <p className="dv-note">The sections below use weekly returns over 3 years.</p>}
          <RecentBlock d={w} />
          {w.riskShare && w.basket && <RiskBlock d={w} view={riskView} by={riskBy} onView={setRiskView} onBy={setRiskBy} />}
          {v?.headline || horizon === "weekly" ? <EachStock d={w} v={v ?? w} h={horizon} /> : null}
          <TiltBlock d={w} />
          <Heatmap d={w} />
        </>
      ) : (
        <>
          <p className="dv-empty"><b>{W.NEEDS_THREE}.</b> {W.NEEDS_THREE_NOTE}</p>
          <SpreadBlock d={w} />
        </>
      )}
      {W.excludedNotes(w).length > 0 && <ul className="dv-notes" aria-label="Stocks left out of the co-movement figures">{W.excludedNotes(w).map((n) => <li key={n}>{n}</li>)}</ul>}
      {w.score && <div className="dv-foot"><p className="dv-method">{W.methodLine(v?.asOf ?? w.asOf, horizon)}</p><button type="button" className="dv-btn ghost" onClick={copy}>{copied ? "Copied" : "Copy summary"}</button></div>}
    </>
  );

  return (
    <section className="dv" aria-labelledby="dv-title" data-testid="diversification-card">
      <header className="dv-head"><div><p className="dv-eyebrow">Diversification</p><h2 id="dv-title">How spread out these stocks are</h2></div><p className="dv-side">{W.SIDE_NOTE}</p></header>
      <div className="dv-listrow">
        <CurrentList names={live.map((x) => nameOf.get(x) || x)} count={live.length} />
        {whatIf && <button type="button" className={"dv-try" + (wiOpen || removed.size > 0 || added.length > 0 ? " on" : "")} aria-expanded={wiOpen || removed.size > 0 || added.length > 0} aria-controls="dv-whatif" onClick={() => setWiOpen((o) => !o)}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg><span>Try a different list</span><svg className="dv-car" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>}
      </div>
      {whatIf && (wiOpen || removed.size > 0 || added.length > 0) && <div id="dv-whatif" className="dv-whatif"><WhatIf base={base} removed={removed} added={added} candidates={candidates} onToggle={toggle} onAdd={(s) => { if (!live.includes(s) && !added.includes(s)) { if (removed.has(s)) toggle(s); else setAdded([...added, s]); } }} onReset={reset} /></div>}
      <div className={"dv-body" + (weekly.isFetching && !weekly.isPending ? " busy" : "")} aria-busy={weekly.isFetching}>{body}</div>
    </section>
  );
}
