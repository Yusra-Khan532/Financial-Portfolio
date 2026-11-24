// Task #385 (developer file 33, Top of the page): the dark score card and the three coloured tiles become four calm cards with a crown each.
//   ScoreCards   Score (ring, its word, "See the six parts ▾"), Strength (FinLit Prism · fundamental score), Spread and Risk; one accent each, the score card
//                in its band's colour; each with an i; "Open →" switches view, the open view's card says "You are here" (3px line in its colour, its icon, a
//                small bar picture; the open one tinted with a filled tag).
//   SixParts     the panel under the cards, closed until asked for: one row per part with its value (a word where the score sends only a word), its
//                reading and an i; and "Make the score yours" (open item 9: the choices the score request already sends).
//   SinceVisit   "Since your last visit on 24 Nov: nothing new from your companies. In the last 90 days, 6 of your 13 companies filed 17 updates."
//   DataAsOf     one line at the top of each view: which date each kind of figure runs to.
//   PageEnd      Questions and the disclaimer behind two buttons, with "Information only, not investment advice." beside them.
// Figures are the page's own (the score answer, the shares, the risk answer). Describes; never advice. Classes: eqc-.
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Info, MINUS, countOf, indexName, shortCo, times } from "../shared";
import { BENCHMARKS, GOALS, HORIZONS, RISKS, type Choices, type ScoreAnswer } from "../useScore";
import { VIEW_COLOR, VIEW_ICON } from "../ViewKit";
import type { View } from "./EquityPack";
import { PortfolioDisclaimer } from "../../components/PortfolioDisclaimer";
import { PageFaqs } from "../../components/PageFaqs";
import { faqForPath } from "../../lib/pageFaqs";
import "./eq385.css";

const CROWN = <span className="eqc-crown" title="FinLit's own model"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3 8.2l4.6 3.9L12 5l4.4 7.1L21 8.2 19.3 18H4.7z" fill="currentColor" /></svg></span>;
/** Prism's five words, to the band each colours: good (Strong, Healthy), middle (Average), bad (Weak, Poor). */
export const bandOf = (w: string | null | undefined): "hi" | "mid" | "lo" | "na" => { const x = (w ?? "").toLowerCase(); return /strong|healthy/.test(x) ? "hi" : /average|fair/.test(x) ? "mid" : /weak|poor/.test(x) ? "lo" : "na"; };
const ACCENT: Record<View, string> = { portfolio: VIEW_COLOR.first, diversification: VIEW_COLOR.second, risk: VIEW_COLOR.risk };
const ICON: Record<View, ReactNode> = { portfolio: VIEW_ICON.case, diversification: VIEW_ICON.pie, risk: VIEW_ICON.pulse };

export type CardsInput = {
  locked: boolean;
  score: { total: number | null; band: string | null } | null;
  strength: { avg: number | null; word: string | null; counts: [string, number][]; byValue: boolean } | null;
  spread: { score: number; word: string; byCount: number | null } | null;
  risk: { beta: number; swing: number; swingIndex: number; bench: string; byValue: boolean; /** the last weekly close both figures run to (open item 1) */ to?: string | null } | null;
};

/** The pill of the Risk card: how the list's beta sits against 1 (Above, Below, In line) and how its yearly swing sits beside the index's. */
export function riskPill(beta: number, swing: number, swingIndex: number) {
  const b = beta > 1.1 ? "Above" : beta < 0.9 ? "Below" : "In line", r = swingIndex ? swing / swingIndex : 1;
  return `${b} · ${r > 1.1 ? "swings more" : r < 0.9 ? "swings less" : "swings about the same"}`;
}

export function ScoreCards({ c, view, onView, sixOpen, onSix }: { c: CardsInput; view: View; onView: (v: View) => void; sixOpen: boolean; onSix: () => void }) {
  const sc = c.score, total = sc?.total == null ? null : Math.max(0, Math.min(100, sc.total)), b = bandOf(sc?.band), C = 2 * Math.PI * 26;
  const card = (id: View, name: string, about: string, body: ReactNode) => { const on = id === view;
    return <div className={"eqc-c eqc-v" + (on ? " on" : "")} style={{ ["--vc" as string]: ACCENT[id] }}>
      {CROWN}
      <p className="eqc-k"><span className="eqc-ic">{ICON[id]}</span>{name}<Info about={name} text={about} />
        {on ? <em className="eqc-here">You are here</em> : <button type="button" className="eqc-open" id={`eq-tab-${id}`} onClick={() => onView(id)} aria-label={`Open the ${id === "portfolio" ? "Portfolio" : id === "diversification" ? "Diversification" : "Risk"} view`}>Open →</button>}</p>
      {body}</div>; };
  const tot = (c.strength?.counts ?? []).reduce((a, [, n]) => a + n, 0);
  return (
    <section className="eqc-strip" aria-label="Your portfolio score and the three views">
      <div className={"eqc-c eqc-sc b-" + b}>
        {CROWN}
        {c.locked ? <><p className="eqc-k">Your portfolio score<Info about="Your portfolio score" text="One number from 0 to 100 that sums up how strong the shares are, how well spread, how risky against the index, the price trend, valuation and concentration." /></p>
          <p className="eqc-x">Worked out from FinLit Prism, part of the Gold plan. <Link to="/plans">See plans</Link></p></>
        : <>
          <div className="eqc-ring" role="img" aria-label={total == null ? "Score being worked out" : `${Math.round(total)} of 100`}>
            <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="26" className="t" /><circle cx="32" cy="32" r="26" className="f" strokeDasharray={`${((C * (total ?? 0)) / 100).toFixed(1)} ${C.toFixed(1)}`} /></svg>
            <b>{total == null ? MINUS : Math.round(total)}</b></div>
          <div className="eqc-sb">
            <p className="eqc-k">Your portfolio score<Info about="Your portfolio score" text="One number from 0 to 100 that sums up how strong the shares are, how well spread, how risky against the index, the price trend, valuation and concentration." how="Open the six parts to see each one for your list." /></p>
            <p className="eqc-v1">{sc?.band ? <span className={"eqc-pill " + b}>{sc.band}</span> : <span className="eqc-pill na">{total == null ? "Being worked out" : "Not scored"}</span>}</p>
            <p className="eqc-x">Six parts together: strength, spread, risk, price trend, valuation and concentration.</p>
            <button type="button" className="eqc-sixb" aria-expanded={sixOpen} aria-controls="eqc-six" onClick={onSix}>{sixOpen ? "Hide the six parts" : "See the six parts"} <i aria-hidden="true">{sixOpen ? "▴" : "▾"}</i></button>
          </div></>}
      </div>
      {card("portfolio", "Strength", "The average FinLit Prism of your shares, by their value now once every share has a quantity. FinLit Prism is the fundamental score: it reads the company's own figures, not the price trend. The bar splits your shares by Prism band.",
        c.locked || !c.strength ? <><p className="eqc-fs">FinLit Prism · fundamental score</p><p className="eqc-x">FinLit Prism scores each share on Gold. <Link to="/plans">See plans</Link></p></>
        : <><p className="eqc-v1"><b>{c.strength.avg == null ? MINUS : Math.round(c.strength.avg)}</b>{c.strength.word && <span className={"eqc-pill " + bandOf(c.strength.word)}>{c.strength.word}</span>}</p>
          <p className="eqc-fs">FinLit Prism · fundamental score</p>
          {tot > 0 && <span className="eqc-seg" aria-hidden="true">{c.strength.counts.filter(([, n]) => n).map(([w, n]) => <i key={w} className={bandOf(w)} style={{ flex: n }} />)}</span>}
          <p className="eqc-x">{c.strength.counts.filter(([, n]) => n).map(([w, n]) => `${n} ${w.toLowerCase()}`).join(" · ") || "No share scored yet"}</p></>)}
      {card("diversification", "Spread", "The diversification score, 0 to 100: how widely the shares spread across NSE's macro sectors and how independently they move. It measures how spread out the list is, not how safe it is.",
        !c.spread ? <p className="eqc-x">Needs at least two shares with a year of weekly prices.</p>
        : <><p className="eqc-v1"><b>{c.spread.score}</b><span className="eqc-pill n">{c.spread.word}</span></p>
          <span className="eqc-track" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, c.spread.score))}%` }} /></span>
          <p className="eqc-x">{c.spread.byCount != null ? `By what you hold now · ${c.spread.byCount} counting each share equally` : "Counting each share equally"}</p></>)}
      {card("risk", "Risk", `How much your list moves when the ${indexName(c.risk?.bench ?? "NIFTY 50")} moves, and its typical swing in a year beside the index's, both from the same weekly closes. Open the Risk view for falls, the risk split and each share.`,
        !c.risk ? <p className="eqc-x">Needs shares with a year of weekly prices.</p>
        : (() => { const r = c.risk, mx = Math.max(r.swing, r.swingIndex) || 1;
          return <><p className="eqc-v1"><b>{times(r.beta)}</b><span className="eqc-pill n">{riskPill(r.beta, r.swing, r.swingIndex)}</span></p>
            <p className="eqc-fs">as much as the {indexName(r.bench)} moves</p>
            <span className="eqc-two" aria-hidden="true"><span><em>Your list</em><i style={{ width: `${(r.swing / mx) * 100}%` }} /><b>{r.swing.toFixed(1)}%</b></span><span className="ix"><em>Index</em><i style={{ width: `${(r.swingIndex / mx) * 100}%` }} /><b>{r.swingIndex.toFixed(1)}%</b></span></span>
            <p className="eqc-x">Typical swing in a year{r.byValue ? ", by what you hold now" : ", each share counted equally"}{r.to ? ` · weekly closes to ${dayOf(r.to)}` : ""}</p></>; })())}
    </section>);
}

// ------------------------------------------------------------------------------------------------ the six parts
const HZ: Record<string, string> = { lt1: "under 1 year", "1-3": "1 to 3 years", "3-5": "3 to 5 years", gt5: "over 5 years" };
const GL: Record<string, string> = { grow: "growth", income: "income", protect: "protection" };
const pc = (x: number | null | undefined) => (x == null ? MINUS : `${(Math.round(x * 1000) / 10).toString()}%`);
const wordTone = (part: string, w: string) => { const x = w.toLowerCase();
  if (part === "spread") return /well spread|fairly spread/.test(x) ? "hi" : /somewhat/.test(x) ? "mid" : /concentrated/.test(x) ? "lo" : "na";
  if (part === "risk") return /within|below/.test(x) ? "hi" : /above/.test(x) ? "lo" : "na";
  if (part === "trend") return /rising/.test(x) ? "hi" : /falling/.test(x) ? "lo" : "mid";
  if (part === "valuation") return /weak/.test(x) ? "lo" : /fair/.test(x) ? "mid" : /strong/.test(x) ? "hi" : "na";
  if (part === "concentration") return /low/.test(x) ? "hi" : /high/.test(x) ? "lo" : /moderate/.test(x) ? "mid" : "na";
  return bandOf(w); };

/** One row per part. `nameOf`: a share's short name (the largest holding is named, not coded). */
export function SixParts({ s, choices, onChoices, nameOf, open }: { s: ScoreAnswer; choices: Choices; onChoices: (c: Choices) => void; nameOf: (sym: string) => string; open: boolean }) {
  const [edit, setEdit] = useState(false);
  const R = s.readings; if (!R) return null;
  const st = R.strength, sp = R.spread, rk = R.risk, tr = R.trend, va = R.valuation, co = R.concentration, sv = s.byValue?.spread ?? null;
  const W = (part: string, w: string | undefined) => <b className={"eqc-w t-" + wordTone(part, w ?? "")}><i aria-hidden="true" />{w ?? MINUS}</b>;
  const row = (k: string, label: string, about: string, value: ReactNode, fact: ReactNode, tag?: string) => <li className="eqc-p" key={k}>
    <p className="eqc-pk">{label}<Info about={label} text={about} /></p><div className="eqc-pv">{value}</div><p className="eqc-px">{fact}</p>{tag && <p className="eqc-pt">{tag}</p>}</li>;
  const up = Math.round((tr.upShare ?? 0) * 100), dn = Math.round((tr.downShare ?? 0) * 100);
  const bench = indexName(rk.benchmark ?? s.benchmark ?? "NIFTY 50");
  return (
    <section className="eqc-six" id="eqc-six" aria-labelledby="eqc-six-h" hidden={!open}>
      <div className="eqc-sh"><h3 id="eqc-six-h">What makes up your score of {s.total ?? MINUS}<Info about="What makes up your score" text="Six readings of your whole list. Strength, spread and risk are the same readings as the three cards above; price trend, valuation and concentration show only here." /></h3>
        <p>{s.basis === "value" ? `All ${countOf(s.of ?? 0, "share")} counted, by value now` : `${countOf(s.of ?? 0, "share")}, each counted equally until every share has a quantity`} · set for {HZ[choices.horizon] ?? choices.horizon}, {choices.risk} risk, {GL[choices.goal] ?? choices.goal}, against the {indexName(BENCHMARKS.find((b) => b[0] === choices.benchmark)?.[1] ?? "NIFTY 50")}
          {" "}<button type="button" className="eqc-lnk" aria-expanded={edit} onClick={() => setEdit(!edit)}>{edit ? "Done" : "Make the score yours"}</button></p>
        {edit && <div className="eqc-mine" role="group" aria-label="Make the score yours">
          <label>Horizon<select value={choices.horizon} onChange={(e) => onChoices({ ...choices, horizon: e.target.value })}>{HORIZONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Risk level<select value={choices.risk} onChange={(e) => onChoices({ ...choices, risk: e.target.value })}>{RISKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Goal<select value={choices.goal} onChange={(e) => onChoices({ ...choices, goal: e.target.value })}>{GOALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Index<select value={choices.benchmark} onChange={(e) => onChoices({ ...choices, benchmark: e.target.value })}>{BENCHMARKS.map(([v, l]) => <option key={v} value={v}>{indexName(l)}</option>)}</select></label>
          <p className="eqc-px">These choices change how the six parts add up to one score for your situation; they are kept in this browser. Under 3 years, the price-trend part reads the short-term trend. Nothing here suggests what to do with any share.</p></div>}
      </div>
      <ol className="eqc-sg">
        {row("strength", "Strength", "The same reading as the Strength card: the average FinLit Prism, the fundamental score, of your shares by value.",
          <><b className="eqc-num">{st.figure ?? MINUS}</b>{st.figure != null && <small>of 100</small>}{st.word && <span className={"eqc-pill " + bandOf(st.word)}>{st.word}</span>}</>,
          st.figure != null ? `Average FinLit Prism of the shares, by value · ${st.scoredShare === 1 ? `all ${s.of} rated` : `${pc(st.scoredShare)} of the value rated`}` : st.why, "Same as the Strength card")}
        {row("spread", "Spread", "The same reading as the Spread card. Moves like counts shares that rise and fall together as one bet.",
          <><b className="eqc-num">{sp.figure ?? MINUS}</b>{sp.figure != null && <small>of 100</small>}<span className="eqc-pill n">{sp.word}</span></>,
          sp.figure != null ? (sv ? `Moves like ${sv.effective_stocks.toFixed(1)} of ${s.of} shares · spread like ${sv.effective_sectors.toFixed(1)} sectors` : "Counting each share equally") : sp.why, "Same as the Spread card")}
        {row("risk", "Risk against the index", "How bumpy the list has been against the index, and whether that sits within the risk level the score is set for.",
          <>{W("risk", rk.against ? String(rk.against).replace(/ with the index$/, "") : rk.word)}{rk.against && <span className={"eqc-pill t-" + wordTone("risk", rk.word)}>{rk.word}</span>}</>,
          rk.beta != null ? `Moves ${times(rk.beta)} as much as the ${bench} · swing ${Number(rk.swing).toFixed(1)}% a year vs ${Number(rk.swingIndex).toFixed(1)}% · worst fall ${MINUS}${Math.abs(rk.worstFall).toFixed(1)}% vs ${MINUS}${Math.abs(rk.worstFallIndex).toFixed(1)}%` : rk.why, "Same as the Risk card")}
        {row("trend", "Price trend", "How much of the list's value is in a long-term uptrend or downtrend, from FinLit Prism's technical view. The only part that reads price trends.",
          <>{W("trend", tr.word)}<span className="eqc-tech">Technical view</span></>,
          tr.upShare != null ? <>{up}% of the value in uptrends, {dn}% in downtrends<span className="eqc-ud" aria-hidden="true"><i className="u" style={{ flex: up }} /><i style={{ flex: Math.max(0, 100 - up - dn) }} /><i className="d" style={{ flex: dn }} /></span></> : tr.why,
          `Uses FinLit Prism's technical view, ${tr.term === "short" ? "short" : "long"} term`)}
        {row("valuation", "Valuation", "How richly the list is priced, read across your shares by value. The score sends this part as a word only.", W("valuation", va.word), va.why ?? "A word only: FinLit Prism's valuation part, read across your shares by value")}
        {row("concentration", "Concentration", "How much of the list sits in the largest holding and in the top five.", W("concentration", co.word),
          co.largest != null ? `Largest: ${nameOf(co.largestName)} ${pc(co.largest)}${(s.of ?? 0) <= 5 ? ` · ${countOf(s.of ?? 0, "share")} in all` : ` · top five ${pc(co.topFive)}`}` : co.why)}
      </ol>
    </section>);
}

// ------------------------------------------------------------------------------------------------ since your last visit, data as of
/** "Since your last visit on 24 Nov: nothing new from your companies." + "In the last 90 days, 6 of your 13 companies filed 17 updates." */
export function sinceText(visit: string | null, fresh: number, filed: number, total: number, updates: number, days = 90): { lead: string; rest: string } {
  const lead = !visit ? "What is new shows from your next visit." : fresh ? `Since your last visit on ${visit}: ${countOf(fresh, "new filing")} from your companies.` : `Since your last visit on ${visit}: nothing new from your companies.`;
  const rest = !total ? "" : !updates ? `None of your ${countOf(total, "company")} filed an update in the last ${days} days.` : `In the last ${days} days, ${filed} of your ${countOf(total, "company")} filed ${countOf(updates, "update")}.`;
  return { lead, rest };
}
export function SinceVisit({ lead, rest, onSee }: { lead: string; rest: string; onSee: () => void }) {
  return <div className="eqc-since" role="note"><i className="eqc-dot" aria-hidden="true" /><span><b>{lead}</b>{rest ? ` ${rest}` : ""}</span>
    <button type="button" className="eqc-see" onClick={onSee}>See what changed →</button></div>;
}
export function DataAsOf({ parts }: { parts: string[] }) {
  if (!parts.length) return null;
  return <p className="eqc-asof"><span>Data as of</span>{parts.map((p) => <b key={p}>{p}</b>)}</p>;
}
/** "23 Nov" from an ISO date (a time reads on India's calendar). */
export const dayOf = (iso: string | null | undefined, year = false) => {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return Number.isNaN(+d) ? null : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "Asia/Kolkata" });
};

// ------------------------------------------------------------------------------------------------ the end of the page
export function PageEnd() {
  const n = faqForPath("/holdings")?.items.length ?? 0;
  const [faq, setFaq] = useState(false), [disc, setDisc] = useState(false);
  return <div className="eqc-end">
    <div className="eqc-endb"><button type="button" className="eqc-endbtn" aria-expanded={faq} aria-controls="eqc-faq" onClick={() => setFaq(!faq)}>Questions about this page{n ? ` · ${n}` : ""}</button>
      <button type="button" className="eqc-endbtn" aria-expanded={disc} aria-controls="eqc-disc" onClick={() => setDisc(!disc)}>Disclaimer</button>
      <span className="eqc-endn">Information only, not investment advice.</span></div>
    <div id="eqc-faq" hidden={!faq}>{faq && <PageFaqs inline />}</div>
    <div id="eqc-disc" className="sp-sec" hidden={!disc}>{disc && <PortfolioDisclaimer kind="equity" />}</div>
  </div>;
}

/** A share's name for the six parts: the short name from the company record. */
export const nameFrom = (meta: Record<string, { name?: string | null } | undefined>) => (sym: string) => shortCo(meta[sym]?.name, sym);
