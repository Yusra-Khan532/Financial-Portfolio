// The reading on the landing page's Mutual Fund Score card (task #239, 19 Nov 2026): the sample fund's newest stored score (Parag Parikh Flexi Cap Fund,
// Direct plan, Growth, unless the server names another), read from /api/mf/score-showcase with its four parts' figures and words, its name and its date.
// There is no made-up fallback: while it loads, or when it cannot be read, the card says so in words. Every word describes; "not a recommendation" stays in the caption.
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import { dayText, partTone, type PartTone } from "./prismShowcase";
import { scoreSentence, scoreText, type ScorePillar } from "./mfScore";

export type MfPartKey = "performance" | "risk" | "cost" | "quality";
/** What /api/mf/score-showcase sends (backend/finlit/mfscore/api.py, score_showcase). */
export type MfShowcaseReading = {
  code: number; name: string; plan: string | null; category: string | null; categoryLabel: string | null; final: number | null; label: string | null;
  status: string | null; runDate: string | null; parts: { key: MfPartKey; name: string; points: number | null; reading: string | null }[]; disclaimer?: string;
};
export type MfShowcasePart = { key: MfPartKey; name: string; v: number; word: string; tone: PartTone };
export type MfShowcaseView = { code: number; fund: string; tag: string; date: string; score: number; scoreText: string; label: string; tone: PartTone; line: string; parts: MfShowcasePart[]; caption: string };

export const MF_PART_ORDER: MfPartKey[] = ["performance", "risk", "cost", "quality"];
const NOTE = "Shown as an example, not a recommendation.";
const LABELS = ["Strong", "Healthy", "Average", "Weak", "Poor"];
const WORDS = ["Strong", "Fair", "Weak"];
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A part's colour family from its word (the fund page's bands: Strong green, Fair gold, Weak red); the score's label uses Prism's families. */
export const mfPartTone = (word: string): PartTone => (word === "Strong" ? "green" : word === "Weak" ? "red" : "gold");
/** "Parag Parikh Flexi Cap Fund - Direct Plan - Growth" as "Parag Parikh Flexi Cap Fund" (the scheme's own name without plan and option). */
export const fundName = (n: string) => n.replace(/\s*[-–]\s*(Direct|Regular)\b.*$/i, "").trim();
/** The pill on the card: the category in the page's words and the plan, e.g. "Flexi Cap · Direct plan". */
export const fundTag = (r: Pick<MfShowcaseReading, "categoryLabel" | "plan">) =>
  [r.categoryLabel?.replace(/\s+funds?$/i, ""), r.plan ? `${r.plan} plan` : null].filter(Boolean).join(" · ");

/** The reading as the card draws it, or null when it lacks any figure the card shows (then the card says it cannot be shown, never a half-filled card). */
export function mfShowcaseView(r: MfShowcaseReading | null | undefined): MfShowcaseView | null {
  if (!r || !num(r.final) || !r.label || !LABELS.includes(r.label) || !r.runDate || !Array.isArray(r.parts)) return null;
  const parts = MF_PART_ORDER.map((k) => r.parts.find((p) => p.key === k));
  if (!parts.every((p) => p && num(p.points) && p.reading && WORDS.includes(p.reading))) return null;
  const ps = parts as { key: MfPartKey; name: string; points: number; reading: string }[];
  const fund = fundName(r.name || `Scheme ${r.code}`), date = dayText(r.runDate);
  const line = scoreSentence({ final: r.final, label: r.label, rank: null, family: null, pillars: ps.map((p) => ({ key: p.key, name: p.name, reading: p.reading }) as ScorePillar) }) ?? "";
  return {
    code: r.code, fund, tag: fundTag(r), date, score: r.final, scoreText: scoreText(r.final), label: r.label, tone: partTone(r.label), line,
    parts: ps.map((p) => ({ key: p.key, name: p.name, v: p.points, word: p.reading, tone: mfPartTone(p.reading) })),
    caption: `${fund}${r.plan ? ` (${r.plan} plan)` : ""} on Mutual Fund Score, ${date}. Updated daily. ${NOTE}`,
  };
}

/** The card's reading: the view once read; `state` says what to show meanwhile ("loading") or instead ("none": no rated score, "error": cannot be read). */
export function useMfShowcase(): { view: MfShowcaseView | null; state: "ready" | "loading" | "none" | "error" } {
  const q = useQuery<MfShowcaseReading>({ queryKey: ["mf-score-showcase"], queryFn: () => apiGet<MfShowcaseReading>("/api/mf/score-showcase"), staleTime: 300_000,
    retry: (n, e) => (e as { status?: number })?.status !== 404 && n < 1 });   // "none stored" is an answer, not a fault: asked once
  const view = mfShowcaseView(q.data);
  return { view, state: view ? "ready" : q.isPending ? "loading" : q.isError && (q.error as { status?: number })?.status !== 404 ? "error" : "none" };
}
