// Task #382 (24 Nov 2026, "Improve FinLit AI Summary: explain the meaning behind every number"): what each figure of the FinLit Prism card means,
// from the method itself. The bands are the card's own (prismCardLogic partWord and BAND_RULE, site-api RATING_BANDS), the trend words and the nine
// alignments come from the shared wording file (lib/technicalWording.json), and what each part measures is the wording the page already uses. The
// server hands FinLit AI the same sheet (backend/finlit/ask/prism_meaning.py); a backend test keeps the two in step, phrase by phrase.
// Nothing is calculated here and no threshold is new. It describes; it never advises. A figure without a score is flagged, never guessed.
import { bandTip, BANDS, ratingWord, trendAlignment, type TechHorizon, type TrendTone } from "../lib/prismTechnical";
import { MINUS } from "../lib/format";

export type Tone = "good" | "mixed" | "weak";
/** The card's bands for the overall score and the four parts. Higher is better on all five, Risk included (a higher Risk score means lower risk). */
export const BAND_RULE = "Strong 80 and above, Healthy 65 to 79, Average 50 to 64, Weak 35 to 49, Poor below 35";
export const SCALE = "0 to 100 on FinLit Prism's own scale: each measure is scored against the method's fixed bands (some valuation measures against industry peers or the company's own history), not ranked against other companies";

type PartMeaning = { area: string; measures: string; matters: string } & Record<Tone, string>;
/** What each band of each part means, in the words of what the model measures. */
export const PARTS: Record<string, PartMeaning> = {
  fundamental: { area: "business performance", measures: "how steadily sales and profit grow, and margins",
    good: "sales and profit have grown steadily, with sound margins", mixed: "sales and profit growth and margins are middling",
    weak: "sales and profit growth has been slow or uneven, or margins are thin",
    matters: "it shows how the business itself has been doing, apart from the share price" },
  valuation: { area: "share price against earnings", measures: "the share price against earnings, book value, peers and the company's own history",
    good: "the share price looks modest against its earnings and its own history", mixed: "the share price is roughly in line with its earnings and its own history",
    weak: "the share price looks high against its earnings and its own history",
    matters: "it is about the price paid for the business, not the health of the business" },
  quality: { area: "financial strength", measures: "borrowing, interest cover, returns on capital and cash backing for profit",
    good: "borrowing is under control, interest is well covered and profits are backed by cash", mixed: "borrowing, interest cover, returns and cash backing are middling",
    weak: "borrowing is heavy, interest cover or returns are thin, or profits are not well backed by cash",
    matters: "it shows how sound the balance sheet and the cash behind the profits are" },
  risk: { area: "market risk of the share", measures: "price swings, the largest fall, trading activity and pledged promoter shares",
    good: "the share price has moved calmly, with smaller falls, ample trading and few pledged shares", mixed: "price swings, falls and trading activity are moderate",
    weak: "the share price swings widely or has fallen sharply, trading is thin or shares are pledged",
    matters: "a higher Risk score means lower risk: it describes how the share has traded and promoter pledges, not the business's results" },
};
/** The overall reading: its key word and what it means. */
export const OVERALL: Record<string, [string, string]> = {
  STRONG: ["strong", "most of what FinLit Prism measures is sound"],
  HEALTHY: ["healthy", "more of what FinLit Prism measures is sound than weighs on it"],
  AVERAGE: ["mixed", "some parts are sound while others weigh on it"],
  WEAK: ["weak", "more of what FinLit Prism measures weighs on it than is sound"],
  POOR: ["poor", "most of what FinLit Prism measures weighs on it"],
};

const sign = (v: number) => (v > 0 ? "+" : v < 0 ? MINUS : "") + Math.abs(v);
/** The scale of the two trend scores, from the shared bands. */
export const TREND_SCALE = `${MINUS}100 to +100: above 0 the price signals point up, below 0 down. Strong uptrend ${sign(BANDS.strongPositive)} or more; Uptrend ${sign(BANDS.positive)} up to ${sign(BANDS.strongPositive)}; Sideways above ${sign(BANDS.neutral)} up to ${sign(BANDS.positive)}; Downtrend above ${sign(BANDS.negative)} up to ${sign(BANDS.neutral)}; Strong downtrend ${sign(BANDS.negative)} or less. It describes the share price only, not the business`;

/** A score as the stored card states it: one decimal, without a trailing ".0"; a trend score signed. */
export const figure = (v: number, signed = false): string => { const s = String(Math.round(v * 10) / 10); return signed ? (v > 0 ? `+${s}` : v < 0 ? `${MINUS}${s.slice(1)}` : s) : s; };

/** The detail behind a part's (i): what it measures, why it matters, the bands and the direction. */
export const partDetail = (key: string): string | null => {
  const p = PARTS[key];
  return p ? `Measures ${p.measures}. Why it matters: ${p.matters}. Scored ${SCALE}. ${BAND_RULE}; higher is better.` : null;
};
export const OVERALL_DETAIL = `The four parts taken together, weighted by the method. Scored ${SCALE}. ${BAND_RULE}; higher is better (a higher Risk score means lower risk).`;

/** A trend horizon's word and its one-line meaning, or null when it has no score (flagged by the caller). */
export function trendMeaning(h: Pick<TechHorizon, "score" | "rating"> | null | undefined): { word: string; tone: TrendTone; text: string } | null {
  if (!h || h.score == null || !Number.isFinite(h.score)) return null;
  const w = ratingWord(h.rating, h.score);
  return w.tone === "na" ? null : { word: w.word, tone: w.tone, text: bandTip(w.tone) };
}
export const trendDetail = (span: string): string => `The share price over ${span}, on ${TREND_SCALE}.`;
export { trendAlignment };
