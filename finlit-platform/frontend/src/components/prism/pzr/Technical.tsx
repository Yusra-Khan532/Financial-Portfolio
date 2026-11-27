// The technical view on the Prism report: a short-term and a long-term score on a -100..+100 scale, the combined trend and every signal
// behind them, each by its direction only. How the scores are built (weights, points, rules, band edges, look-back lengths) stays on the server.
// It is an additive, independent assessment (report.technicalAssessment): it is not a part of the 0-100 Prism score and never changes it.
// Older reports without the field get a calm "recalculate" note.
// Words: the model's own rating and verdict words are never shown; lib/prismTechnical.ts maps them to descriptive trend words (Positive, Neutral...).
// Colour only decorates: every conclusion is also a word and a shape. Styles: styles/prism-technical.css (pzt-*).
import { useMemo, useState } from "react";
import { PzHead, PzProp } from "./Shell";
import { Icon } from "../../../lib/icons";
import type { PrismReport } from "../../../lib/prism";
import {
  ALIGN_NA, FACTOR_GROUP_WORD, STAGE_WORD, TECH_NOTE, factorGroup, filterTechFactors, fmtScore, parseTechnical, ratingWord, safeText,
  scalePos, scoreBand, trendAlignment, verdictView,
  type FactorGroup, type TechAssessment, type TechFactor, type TechHorizon,
} from "../../../lib/prismTechnical";
import { TrendMap, alignmentSentence } from "./TechBreakdown";
import { TabGroup } from "../../TabGroup";
import { TechnicalSection } from "../../../stock/PrismCardView";
import type { PrismLatest } from "../../../stock/PrismCard";

export const TECH_ID = "pzr-technical";
const FILTERS: (FactorGroup | "all")[] = ["all", "supporting", "adverse", "neutral", "unavailable"];
const minus = (s: string) => s.replace("-", "−");

/** One sentence for a screen reader: the horizon, its score, the word, and how complete it is. */
export function horizonSummary(name: string, h: TechHorizon): string {
  const w = ratingWord(h.rating, h.score);
  const have = `${h.availableCount} of ${h.requiredCount} signals available`;
  if (h.score == null) return `${name}: no score, because ${have}.`;
  return `${name}: ${fmtScore(h.score)} on a scale from minus 100 to plus 100, ${w.word.toLowerCase()}. ${have}.${h.provisional ? " Provisional score: a recent listing." : ""}`;
}

/** The -100..+100 scale with a centre line and a marker; the word beside it says what the score reads. The band edges are not drawn. */
export function TechGauge({ score, label }: { score: number | null; label: string }) {
  const tone = scoreBand(score), pos = scalePos(score);
  return (
    <div className={"pzt-gauge " + tone} role="img" aria-label={label}>
      <div className="pzt-g-bar pzt-g-plain" aria-hidden="true">
        <i className="b1" style={{ flex: 50 }} /><i className="b5" style={{ flex: 50 }} />
        <u className="pzt-g-zero" />
        {score != null && <b className="pzt-g-mk" style={{ left: `${pos}%` }}><span>{fmtScore(score)}</span></b>}
      </div>
      <div className="pzt-g-ticks" aria-hidden="true">{[[-100, "−100"], [0, "0"], [100, "+100"]].map(([v, t]) => <span key={v} style={{ left: `${((v as number) + 100) / 2}%` }}>{t}</span>)}</div>
    </div>
  );
}


function SignalRow({ f }: { f: TechFactor }) {
  const g = factorGroup(f) ?? "unavailable";
  const label = safeText(f.label), detail = safeText(f.detail);
  const word = FACTOR_GROUP_WORD[g];
  return (
    <li className={"pzt-sg " + g}>
      <span className="pzt-sg-n"><b>{label}</b>{detail && <small>{detail}</small>}</span>
      <span className="pzt-sg-b" aria-hidden="true"><i className="pzt-sg-t">{(g === "supporting" || g === "adverse") && <em className={g === "supporting" ? "up" : "dn"} style={{ width: "50%" }} />}</i></span>
      <span className="pzt-sg-w"><i aria-hidden="true">{g === "supporting" ? "▲" : g === "adverse" ? "▼" : g === "neutral" ? "◆" : "–"}</i>{word}</span>
    </li>
  );
}

function SignalList({ title, h, filter }: { title: string; h: TechHorizon; filter: FactorGroup | "all" }) {
  const rows = filterTechFactors(h.factors, filter);
  return (
    <section className="pzt-col" aria-label={`${title} signals`}>
      <h5>{title} signals <small>{h.availableCount} of {h.requiredCount} available</small></h5>
      {rows.length ? <ul className="pzt-sgl">{rows.map((f) => <SignalRow key={f.key} f={f} />)}</ul>
        : <p className="pzt-none">{h.factors.length ? "No signal here matches the filter." : "No signals were returned for this horizon."}</p>}
    </section>
  );
}

function Signals({ a }: { a: TechAssessment }) {
  const [filter, setFilter] = useState<FactorGroup | "all">("all");
  const both = useMemo(() => [...a.shortTerm.factors, ...a.longTerm.factors], [a]);
  const count = (f: FactorGroup | "all") => filterTechFactors(both, f).length;
  return (
    <div className="pzt-sigs">
      <div className="pzr-tools pzr-noprint">
        <div className="pzr-chipsrow" role="group" aria-label="Filter signals">
          {FILTERS.map((f) => <button key={f} type="button" className={"pzr-chip" + (filter === f ? " on" : "")} aria-pressed={filter === f} onClick={() => setFilter(f)}>{FACTOR_GROUP_WORD[f]} <small>{count(f)}</small></button>)}
        </div>
      </div>
      <div className="pzt-cols"><SignalList title="Short-term" h={a.shortTerm} filter={filter} /><SignalList title="Long-term" h={a.longTerm} filter={filter} /></div>
    </div>
  );
}

const pctText = (v: number, d = 1) => minus((v >= 0 ? "+" : "") + v.toFixed(d)) + "%";

function Observations({ a }: { a: TechAssessment }) {
  const o = a.observations;
  const items: { k: string; v: string }[] = [];
  if (o.stage) items.push({ k: "Market stage", v: STAGE_WORD[o.stage] + (o.stage === 2 && o.freshStage2 != null ? (o.freshStage2 ? ". A fresh advance that began recently after a basing phase." : ". An established advance.") : ".") });
  if (o.slope150Pct != null) items.push({ k: "Longer-term average price", v: `The longer-term average price has moved ${pctText(o.slope150Pct)} over recent weeks.` });
  if (o.benchmark) items.push({ k: "Compared with", v: `${o.benchmark}, the index picked by the company's size.${o.benchmarksUsed.length > 1 ? ` Over the comparison window the size group changed, so it also used ${o.benchmarksUsed.filter((n) => n !== o.benchmark).join(", ")}.` : ""}` });
  if (o.beta != null) items.push({ k: "Beta", v: `${o.beta.toFixed(2)}. How strongly the stock has moved with that index.` });
  if (o.rsRatingST != null) items.push({ k: "Short-term relative strength", v: `${o.rsRatingST.toFixed(1)} out of 100. Its recent gain over the index, allowing for beta, against its own recent record. Higher means it has been doing better than the index.` });
  if (o.rsRatingLT != null) items.push({ k: "Long-term relative strength", v: `${o.rsRatingLT.toFixed(1)} out of 100. The same comparison over the past year.` });
  if (!items.length) return <p className="pzt-none">No market observations were returned.</p>;
  return <dl className="pzt-obs">{items.map((i) => <div key={i.k}><dt>{i.k}</dt><dd>{i.v}</dd></div>)}</dl>;
}

function Missing({ a }: { a: TechAssessment }) {
  const groups = ([["Short term", a.shortTerm], ["Long term", a.longTerm]] as const).map(([n, h]) => [n, h.factors.filter((f) => f.status === "unavailable")] as const).filter(([, rows]) => rows.length);
  const incomplete = a.status === "incomplete";
  if (!incomplete && !groups.length) return null;
  return (
    <section className="pzt-miss" aria-label="Missing inputs">
      <h4><Icon name="alert" />{incomplete ? "Some inputs are missing" : "Inputs that could not be used"}</h4>
      <p>{incomplete ? "A score is shown only when every signal it needs is available. Missing signals are listed here with the reason; none is filled in or counted as neutral." : "These signals were not available. They are listed here with the reason."}</p>
      {groups.map(([n, rows]) => (
        <div key={n}><h5>{n}</h5><ul>{rows.map((f) => <li key={f.key}><b>{safeText(f.label)}</b><span>{safeText(f.detail) || "No reason was given."}</span></li>)}</ul></div>
      ))}
      {!groups.length && <p className="pzt-none">No individual signal is listed as missing; see the notes below.</p>}
    </section>
  );
}

/** A one-line pointer under the hero: the two words, linking to the section. Nothing when the report has no technical view. */
export function TechPointer({ report }: { report: PrismReport }) {
  const a = parseTechnical(report.technicalAssessment);
  if (!a) return null;
  const s = ratingWord(a.shortTerm.rating, a.shortTerm.score), l = ratingWord(a.longTerm.rating, a.longTerm.score);
  return (
    <p className="pzt-ptr pzr-noprint">
      <Icon name="activity" /><span>Technical view: short term <b>{s.word.toLowerCase()}</b>, long term <b>{l.word.toLowerCase()}</b>. Separate from the score above. <a href={`#${TECH_ID}`}>See the details of the technical view</a></span>
    </p>
  );
}

export function Technical({ report, onRecalculate }: { report: PrismReport; onRecalculate?: () => void }) {
  const a = parseTechnical(report.technicalAssessment);
  if (!a) {
    return (
      <section className="pzr-sec pzt pzs" id={TECH_ID} tabIndex={-1} aria-labelledby="pzt-h">
        <PzHead no="02" id="pzt-h" title="Technical view" desc="Recent price and trend behaviour, short term and long term." />
        <div className="pzt-empty" role="note">
          <Icon name="activity" />
          <div><b>This stored report does not include the technical view.</b>
            <p>It was calculated before the technical view was added. {onRecalculate ? <><button type="button" className="pzr-link pzr-noprint" onClick={onRecalculate}>Recalculate</button> to add it.</> : "Recalculate to add it."} The financial-health score above is unaffected.</p></div>
        </div>
        <p className="pzr-small pzt-line">{TECH_NOTE}</p>
      </section>
    );
  }
  const v = verdictView(a), al = trendAlignment(a.shortTerm.score, a.longTerm.score);
  return (
    <section className="pzr-sec pzt pzs" id={TECH_ID} tabIndex={-1} aria-labelledby="pzt-h" aria-describedby="pzt-lead">
      <PzHead no="02" id="pzt-h" title="Technical view" desc={<span id="pzt-lead">How the share price has been behaving, in the recent weeks (short term) and over the past year or so (long term). It describes past prices and does not predict them. It is calculated separately from the 0 to 100 financial-health score and does not change it. Short term is {ratingWord(a.shortTerm.rating, a.shortTerm.score).word.toLowerCase()}; long term is {ratingWord(a.longTerm.rating, a.longTerm.score).word.toLowerCase()}; {v.word.toLowerCase()}.</span>} />
      {/* task #220 (README 3.2): the score card's own trend cards (the same component, rendered again), the verdict sentence under the alignment card */}
      <div className="pzt-clone">
        <TechnicalSection bare a={a} report={report as unknown as PrismLatest}
          after={al ? <p className="pzt-vd2">{alignmentSentence(a)} It is separate from the 0 to 100 financial-health score.</p> : null} />
        {!al && <p className="pzt-vd2">{ALIGN_NA}: a combined trend needs both scores.</p>}
        {([["Short term", a.shortTerm], ["Long term", a.longTerm]] as const).filter(([, h]) => h.provisional).map(([n, h]) => (
          <p key={n} className="pzt-vd2 pzt-prov"><Icon name="info" /><span><span className="sr-only">Provisional score: a recent listing. </span><b>{n} is provisional.</b> {h.provisionalNote ?? "The relative-strength rating needs about two years of prices, so this score uses the other signals only."}</span></p>))}
        {([["Short term", a.shortTerm], ["Long term", a.longTerm]] as const).filter(([, h]) => h.score == null && h.status === "incomplete").map(([n, h]) => (
          h.historyNote   /* task #247: withheld only because the price history is short: say how long and when it is shown */
            ? <p key={n + "-w"} className="pzt-vd2"><b>{n}: not available yet.</b> {h.historyNote.replace(/^Not available yet: /, "")}</p>
            : <p key={n + "-w"} className="pzt-vd2"><b>{n}: not available, score withheld.</b> A score is shown only when every signal it needs is available; the missing ones are listed below.</p>))}
      </div>
      <Missing a={a} />
      <TabGroup label="Technical view" sticky views={[
        { key: "signals", label: "Every signal", chip: a.shortTerm.factors.length + a.longTerm.factors.length, content: (
          <div className="pzt-blk">
            <p className="pzt-sub">Each signal either supports the trend, works against it (adverse) or is neutral. Unavailable means it could not be calculated.</p>
            <PzProp lead="These are some of the signals the technical view is based on.">How the signals are weighted and combined is proprietary to FinLit Ventures.</PzProp>
            <Signals a={a} /></div>) },
        { key: "map", label: "Trend map", content: <div className="pzt-blk pzt-mapblk"><h4>Where the two trends meet</h4>{al ? <TrendMap al={al} /> : <p className="pzt-none">The trend map needs both scores.</p>}</div> },
        { key: "market", label: "What the market shows", content: (
          <div className="pzt-blk"><Observations a={a} />
            {a.notes.length > 0 && <ul className="pzt-notes" aria-label="Notes">{a.notes.map((n, i) => <li key={i}>{safeText(n)}</li>)}</ul>}</div>) },
      ]} />
      <p className="pzr-small pzt-line">{TECH_NOTE} It is not an investment recommendation.</p>
    </section>
  );
}
