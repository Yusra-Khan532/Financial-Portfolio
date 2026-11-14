// One score per plan, everywhere a company's score is shown (founder, 13 Nov 2026, task #100): Gold (and an administrator) sees FinLit Prism and never
// the FinLit IQ; Silver sees the FinLit IQ and never Prism; Basic sees neither (the page's own lock says why). Prism comes from the stored reports
// (GET /api/prism/scores, batched); nothing is calculated here. A company with no stored rating says "Prism: not rated yet", never a made-up number.
import { usePlanModel, type ScoreModel } from "./planGate";
import { seesAllNow } from "./adminView";
import { MINUS } from "./format";
import { scoreBand, type ScoreBand } from "./scoreBands";
import { LABEL_WORD, type PrismLabel } from "./scorePrism";
import { PART_LABEL, PRISM_PARTS, TECH_LABEL, usePrismScores, type PrismScore, type PrismScoreMap } from "./prismScores";
import "../styles/planScore.css";

export { usePlanModel, type ScoreModel };

/** The stored Prism scores of these companies, asked only when the plan's model is Prism (Silver never asks: the server would refuse). */
export function usePlanPrism(symbols: readonly string[], model: ScoreModel | null): PrismScoreMap {
  return usePrismScores(symbols, model === "prism");
}

/** What one company's score reads as, for the plan's model. `pending` while the Prism score is on its way (nothing is drawn yet: no flicker). */
export type ScoreView = { model: ScoreModel; name: string; score: number | null; word: string | null; band: ScoreBand; why: string | null; pending: boolean;
  /** An administrator seeing every plan's features: the FinLit IQ beside FinLit Prism (founder, 14 Nov 2026). */
  also?: ScoreView };

export function prismWord(p: PrismScore): string | null {
  return p.label ? (LABEL_WORD[p.label as PrismLabel] ?? p.label.charAt(0) + p.label.slice(1).toLowerCase()) : null;
}

export function scoreView(model: ScoreModel, iq: { score: number | null | undefined; word?: string | null }, prism: PrismScore | null | "error" | undefined): ScoreView {
  const v = scoreView1(model, iq, prism);
  return model === "prism" && seesAllNow() ? { ...v, also: scoreView1("iq", iq, undefined) } : v;
}
function scoreView1(model: ScoreModel, iq: { score: number | null | undefined; word?: string | null }, prism: PrismScore | null | "error" | undefined): ScoreView {
  if (model === "iq") {
    const s = iq.score ?? null;
    return { model, name: "FinLit IQ", score: s, word: s == null ? null : iq.word ?? null, band: scoreBand(s), why: s == null ? "This company has no FinLit IQ yet." : null, pending: false };
  }
  if (prism === undefined) return { model, name: "Prism", score: null, word: null, band: "na", why: null, pending: true };
  if (prism === "error") return { model, name: "Prism", score: null, word: null, band: "na", why: "The Prism score could not be loaded. Try again in a moment.", pending: false };
  if (prism === null) return { model, name: "Prism", score: null, word: null, band: "na", why: "FinLit Prism has not rated this company yet.", pending: false };
  if (!prism.rated || prism.final == null) return { model, name: "Prism", score: null, word: "Not rated", band: "na", why: "FinLit Prism could not rate this company: the evidence is too thin.", pending: false };
  const v = Math.round(prism.final);
  return { model, name: "Prism", score: v, word: prismWord(prism), band: scoreBand(v), why: null, pending: false };
}

/** The parts the plan's model shows on a card: the four Prism parts and the two technical views (Gold), or the FinLit IQ pillars (Silver). */
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

/** "Prism 78 · Healthy" / "FinLit IQ 71 · Healthy" / "Prism: not rated yet": the chip used wherever one company's score is shown in a line. */
export function ScoreChip({ v, className = "" }: { v: ScoreView; className?: string }) {
  if (v.pending) return null;
  const title = v.why ?? `${v.model === "prism" ? "FinLit Prism" : "FinLit IQ"} ${v.score} out of 100${v.word ? `: ${v.word}` : ""}. Higher is better.`;
  const chip = (
    <span className={`plan-chip b-${v.band}${className ? " " + className : ""}`} title={title}>
      {v.score == null ? <>{v.name}: {v.word ? v.word.toLowerCase() : v.model === "iq" ? "not scored yet" : "not rated yet"}</> : <>{v.name} <b>{v.score}</b>{v.word && <small>{v.word}</small>}</>}
    </span>
  );
  return v.also ? <>{chip} <ScoreChip v={v.also} className={className} /></> : chip;
}

/** The plan's score straight from a screener-universe row (it carries both models for Gold; Prism fields are absent below Gold). */
type UniRow = { overall?: number | null; band?: string | null; prism_final?: number | null; prism_label?: string | null; prism_status?: string | null };
const IQ_WORD: Record<string, string> = { strong: "Strong", healthy: "Healthy", mixed: "Mixed", watch: "Watch", insufficient: "Not enough data" };
export function rowView(model: ScoreModel, r: UniRow): ScoreView {
  const v = rowView1(model, r);
  return model === "prism" && seesAllNow() ? { ...v, also: rowView1("iq", r) } : v;
}
function rowView1(model: ScoreModel, r: UniRow): ScoreView {
  if (model === "iq") return scoreView("iq", { score: r.overall ?? null, word: r.band ? IQ_WORD[r.band] ?? r.band : null }, undefined);
  if (r.prism_final == null) return { model, name: "Prism", score: null, word: r.prism_status === "NOT RATED" ? "Not rated" : null, band: "na", pending: false,
    why: r.prism_status === "NOT RATED" ? "FinLit Prism could not rate this company: the evidence is too thin." : "FinLit Prism has not rated this company yet." };
  const v = Math.round(r.prism_final);
  return { model, name: "Prism", score: v, word: r.prism_label ? LABEL_WORD[r.prism_label as PrismLabel] ?? r.prism_label : null, band: scoreBand(v), why: null, pending: false };
}
/** The number to sort or average by: the plan's score of a universe row, or null. */
export const rowScore = (model: ScoreModel, r: UniRow): number | null => (model === "prism" ? r.prism_final ?? null : r.overall ?? null);
