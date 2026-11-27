// One company score everywhere a company's score is shown. Task #283: the old overall score is retired; FinLit Prism is FinLit's only company score. A plan with
// Prism (and an administrator) sees it; any other plan sees no score (the page's own lock says which plan shows it). Prism comes from the stored reports
// (GET /api/prism/scores, batched); nothing is calculated here. A company with no stored rating says "Prism: not rated yet", never a made-up number.
import { usePlanModel, type ScoreModel } from "./planGate";
import { MINUS } from "./format";
import { scoreBand, type ScoreBand } from "./scoreBands";
import { LABEL_WORD, type PrismLabel } from "./scorePrism";
import { PART_LABEL, PRISM_PARTS, TECH_LABEL, usePrismScores, type PrismScore, type PrismScoreMap } from "./prismScores";
import "../styles/planScore.css";

export { usePlanModel, type ScoreModel };

/** The stored Prism scores of these companies, asked only when the plan has Prism (other plans never ask: the server would refuse). */
export function usePlanPrism(symbols: readonly string[], model: ScoreModel | null): PrismScoreMap {
  return usePrismScores(symbols, model === "prism");
}

/** What one company's score reads as. `pending` while the Prism score is on its way (nothing is drawn yet: no flicker). */
export type ScoreView = { model: ScoreModel; name: string; score: number | null; word: string | null; band: ScoreBand; why: string | null; pending: boolean };

export function prismWord(p: PrismScore): string | null {
  return p.label ? (LABEL_WORD[p.label as PrismLabel] ?? p.label.charAt(0) + p.label.slice(1).toLowerCase()) : null;
}

/** The four bands FinLit Prism's scores are grouped in (task #283): Strong 80 or more, Healthy 65 to 79, Average 50 to 64, Weak below 50. */
export type PrismBand = "strong" | "healthy" | "average" | "weak";
export const PRISM_BANDS: { key: PrismBand; word: string; rule: string }[] = [
  { key: "strong", word: "Strong", rule: "80 or more" }, { key: "healthy", word: "Healthy", rule: "65 to 79" },
  { key: "average", word: "Average", rule: "50 to 64" }, { key: "weak", word: "Weak", rule: "below 50" },
];
export const PRISM_BAND_WORD: Record<PrismBand, string> = { strong: "Strong", healthy: "Healthy", average: "Average", weak: "Weak" };
/** The band of one Prism score, or null when there is none. */
export function prismBandOf(v: number | null | undefined): PrismBand | null {
  if (v == null || !Number.isFinite(v)) return null;
  const s = Math.round(v * 10) / 10;
  return s >= 80 ? "strong" : s >= 65 ? "healthy" : s >= 50 ? "average" : "weak";
}

export function scoreView(prism: PrismScore | null | "error" | undefined): ScoreView {
  const model = "prism" as const;
  if (prism === undefined) return { model, name: "Prism", score: null, word: null, band: "na", why: null, pending: true };
  if (prism === "error") return { model, name: "Prism", score: null, word: null, band: "na", why: "The Prism score could not be loaded. Try again in a moment.", pending: false };
  if (prism === null) return { model, name: "Prism", score: null, word: null, band: "na", why: "FinLit Prism has not rated this company yet.", pending: false };
  if (!prism.rated || prism.final == null) return { model, name: "Prism", score: null, word: "Not rated", band: "na", why: "FinLit Prism could not rate this company: the evidence is too thin.", pending: false };
  const v = Math.round(prism.final);
  return { model, name: "Prism", score: v, word: prismWord(prism), band: scoreBand(v), why: null, pending: false };
}

/** The parts Prism shows on a card: the four Prism parts and the two technical views. */
export type PartView = { key: string; label: string; value: number | null; text: string; band: ScoreBand; word?: string | null };
export function prismParts(p: PrismScore | null | "error" | undefined): PartView[] {
  if (!p || p === "error") return [];
  const out: PartView[] = PRISM_PARTS.map((k) => {
    const v = p.parts?.[k] ?? null;
    return { key: k, label: PART_LABEL[k], value: v, text: v == null ? MINUS : String(Math.round(v)), band: scoreBand(v) };
  });
  for (const k of ["shortTerm", "longTerm"] as const) {
    const t = p[k], v = t?.score ?? null;
    out.push({ key: k, label: TECH_LABEL[k], value: v, text: v == null ? MINUS : `${v > 0 ? "+" : v < 0 ? MINUS : ""}${Math.abs(Math.round(v))}`,
      band: v == null ? "na" : v >= 20 ? "hi" : v > -20 ? "mid" : "lo", word: t?.word ?? null });
  }
  return out;
}

/** "Prism 78 · Healthy" / "Prism: not rated yet": the chip used wherever one company's score is shown in a line. */
export function ScoreChip({ v, className = "" }: { v: ScoreView; className?: string }) {
  if (v.pending) return null;
  const title = v.why ?? `FinLit Prism ${v.score} out of 100${v.word ? `: ${v.word}` : ""}. Higher is better.`;
  return (
    <span className={`plan-chip b-${v.band}${className ? " " + className : ""}`} title={title}>
      {v.score == null ? <>{v.name}: {v.word ? v.word.toLowerCase() : "not rated yet"}</> : <>{v.name} <b>{v.score}</b>{v.word && <small>{v.word}</small>}</>}
    </span>
  );
}

/** For a plan without Prism: a locked chip that says where the score is ("FinLit Prism · see plans"). */
export function PrismLockChip({ className = "" }: { className?: string }) {
  return <a className={`plan-chip b-na plan-lock${className ? " " + className : ""}`} href="/plans" title="FinLit Prism, FinLit's only company score, comes with a plan that has it.">FinLit Prism · see plans</a>;
}

/** The Prism score straight from a screener-universe row (Prism fields are absent for a plan without Prism). */
type UniRow = { prism_final?: number | null; prism_label?: string | null; prism_status?: string | null };
export function rowView(r: UniRow): ScoreView {
  const model = "prism" as const;
  if (r.prism_final == null) return { model, name: "Prism", score: null, word: r.prism_status === "NOT RATED" ? "Not rated" : null, band: "na", pending: false,
    why: r.prism_status === "NOT RATED" ? "FinLit Prism could not rate this company: the evidence is too thin." : "FinLit Prism has not rated this company yet." };
  const v = Math.round(r.prism_final);
  return { model, name: "Prism", score: v, word: r.prism_label ? LABEL_WORD[r.prism_label as PrismLabel] ?? r.prism_label : null, band: scoreBand(v), why: null, pending: false };
}
/** The number to sort or average by: the Prism score of a universe row, or null. */
export const rowScore = (r: UniRow): number | null => r.prism_final ?? null;
