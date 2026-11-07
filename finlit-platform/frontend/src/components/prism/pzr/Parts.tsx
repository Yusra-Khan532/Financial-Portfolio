// The part cards (one per part in the data, and a quiet note that the technical view is separate). How much each part counts stays on the
// server: the page shows each part's own score, never its weight (the "what moved the score" chart, which multiplied by the weights, is gone).
import { nf } from "../../../lib/format";
import {
  factorValue, isRated, labelTone, partInfo, partsOf, partsSentence, pctWhole, score1, scoreTone,
  type PartKey, type PrismMetric, type PrismReport, type PrismReview, type ReviewPart,
} from "../../../lib/prism";
import { THRESHOLDS, bandLabel, partVar, topFactors } from "../../../lib/prismReport";
import { partHint } from "../../../lib/scoreBands";
import { parseTechnical } from "../../../lib/prismTechnical";

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
/** Scroll to a part's factor section and move focus there for keyboard and screen-reader users. */
export function goToPart(key: PartKey) {
  const el = document.getElementById(`pzr-part-${key}`);
  if (!el) return;
  el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

function MiniRing({ score, color }: { score: number | null; color: string }) {
  const r = 26, c = 2 * Math.PI * r, f = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <svg className="pzr-pring" width="68" height="68" viewBox="0 0 68 68" aria-hidden="true" style={{ "--c": color } as React.CSSProperties}>
      <circle cx="34" cy="34" r={r} className="pzr-pring-t" />
      {f > 0 && <circle cx="34" cy="34" r={r} className="pzr-pring-f" strokeDasharray={`${(c * f).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 34 34)" />}
      <text x="34" y="39" textAnchor="middle" className="pzr-pring-n">{score == null ? "—" : nf(score, 0)}</text>
    </svg>
  );
}

export function ThresholdBar({ value, color, ticks = THRESHOLDS }: { value: number | null; color: string; ticks?: number[] }) {
  return (
    <span className="pzr-tb" aria-hidden="true" style={{ "--c": color } as React.CSSProperties}>
      <i style={{ width: `${value == null ? 0 : Math.max(0, Math.min(100, value))}%` }} />
      {ticks.map((t) => <u key={t} style={{ left: `${t}%` }} />)}
    </span>
  );
}

function PartCard({ k, index, report, review, rows }: { k: PartKey; index: number; report: PrismReport; review: PrismReview; rows: PrismMetric[] }) {
  const { rating } = report, rated = isRated(rating);
  const part: ReviewPart | undefined = review.parts.find((p) => p.key === k);
  const score = rated ? (part?.score ?? rating.parts[k] ?? null) : null;
  const tone = scoreTone(score), word = score == null ? "Not rated" : labelTone(bandLabel(score)).word;
  const { strength, drag } = rated ? topFactors(rows) : { strength: null, drag: null };
  const color = partVar(k, index);
  const missing = rows.filter((r) => r.status === "F" || r.status === "L").length;
  const lines = [partInfo(k).what, rated && part?.notes?.[0] ? part.notes[0] : null].filter(Boolean) as string[];
  return (
    <button type="button" className="pzr-part" onClick={() => goToPart(k)} style={{ "--c": color } as React.CSSProperties}
      aria-label={`${partInfo(k).name}: ${score == null ? "not rated" : `${score1(score)} out of 100, ${word}`}. Go to its factors.`}>
      <span className="pzr-part-h"><MiniRing score={score} color={color} />
        <span className="pzr-part-t"><b>{partInfo(k).name}</b>{partHint(k) && <small className="pzr-hint" title={partHint(k)!.long}>{partHint(k)!.short}{k === "risk" ? ": higher means lower risk" : ""}</small>}</span>
        <span className={"pzr-part-w " + tone}><i aria-hidden="true" />{word}</span>
      </span>
      <ThresholdBar value={score} color={color} />
      <span className="pzr-part-ln">
        {lines.map((l, i) => <span key={i}>{l}</span>)}
        <span>{pctWhole(rating.coverage[k])} of its inputs available{missing ? `; ${missing} estimated or missing` : ""}.</span>
      </span>
      {rated && (strength || drag) && <span className="pzr-part-tf">
        {strength && <span className="pos"><em>Top strength</em>{strength.label} <small>{factorValue(strength)}</small></span>}
        {drag && <span className="neg"><em>Biggest drag</em>{drag.label} <small>{factorValue(drag)}</small></span>}
      </span>}
      <span className="pzr-part-go" aria-hidden="true">See the factors →</span>
    </button>
  );
}

export function PartCards({ report, review }: { report: PrismReport; review: PrismReview }) {
  const keys = partsOf(report.rating);
  return (
    <section className="pzr-sec" aria-labelledby="pzr-h-parts">
      <header className="pzr-sh"><h3 id="pzr-h-parts">The parts of the score</h3><p>Select a card to jump to its factors. Ticks mark 35, 50, 65 and 80, where the labels change. For all four, higher is better: a higher Risk score means lower risk.</p></header>
      {!isRated(report.rating) && <p className="pzr-withheld">{partsSentence(report.rating)}</p>}
      <div className="pzr-parts">
        {keys.map((k, i) => <PartCard key={k} k={k} index={i} report={report} review={review} rows={report.rating.metrics.filter((m) => m.part === k)} />)}
        {!keys.includes("technical") && <div className="pzr-part soon" role="note"><b>Technical view: separate from this score</b><span>{parseTechnical(report.technicalAssessment) ? "Short-term and long-term price trend. It is calculated on its own, is not a part of the score above and never changes it. See the Technical view below." : "Short-term and long-term price trend. It is not a part of the score above. This stored report does not include it; recalculate to add it."}</span></div>}
      </div>
    </section>
  );
}
