// The reading on the landing page's FinLit Prism card. Task #153 (14 Nov 2026): the showcase company's live reading (Reliance Industries), its actual
// score on each of the four parts and the two technical views, read daily from /api/prism/showcase and shown with the company's name and its date.
// PRISM_SAMPLE (the real reading of 6 Nov 2026, task #122) is shown, with its own date, only while the live one loads or when it cannot be read.
// Every word describes; "not a recommendation" stays in the caption.
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

export type PartTone = "gold" | "red" | "green";
export type ShowcasePart = { name: string; v: number; word: string };
export type ShowcaseTech = { name: string; span: string; v: number; word: string };
export type ShowcaseView = { symbol: string; company: string; date: string; score: number; word: string; parts: ShowcasePart[]; tech: ShowcaseTech[]; caption: string; live: boolean };

const NOTE = "Shown as an example, not a recommendation.";
export const PRISM_SAMPLE: ShowcaseView = {
  symbol: "RELIANCE", company: "Reliance Industries", date: "6 Nov 2026",
  score: 59.4, word: "Average",
  parts: [
    { name: "Growth & Profitability", v: 58, word: "Average" },
    { name: "Valuation", v: 39, word: "Weak" },
    { name: "Quality", v: 79, word: "Healthy" },
    { name: "Risk", v: 86, word: "Strong" },
  ],
  tech: [
    { name: "Technical short term", span: "5–20 sessions", v: 29, word: "Uptrend" },
    { name: "Technical long term", span: "6–18 months", v: -55, word: "Strong downtrend" },
  ],
  caption: `Reliance Industries on FinLit Prism, 6 Nov 2026. ${NOTE}`,
  live: false,
};

/** What /api/prism/showcase sends: the newest stored reading of the showcase company (finlit/prism.py, showcase). */
export type ShowcaseReading = {
  symbol: string; name: string; final: number | null; label: string | null; status: string | null; at: string | null; techAt: string | null;
  parts: { fundamental: number | null; valuation: number | null; quality: number | null; risk: number | null };
  st: { score: number | null; word: string | null }; lt: { score: number | null; word: string | null };
};

/** The colour family of a Prism word: Average gold, Weak and Poor red, Healthy and Strong green. */
export const partTone = (word: string): PartTone => (/weak|poor/i.test(word) ? "red" : /healthy|strong/i.test(word) ? "green" : "gold");
/** Where a technical view (−100 strong downtrend … +100 strong uptrend) sits on its bar, as a percentage from the left. */
export const techPos = (v: number) => Math.max(0, Math.min(100, (v + 100) / 2));
/** A part's word, on the Prism page's own bands (stock/prismCardLogic.partWord): Strong 80+, Healthy 65+, Average 50+, Weak 35+, Poor below. */
export const partWordOf = (v: number): string => (v >= 80 ? "Strong" : v >= 65 ? "Healthy" : v >= 50 ? "Average" : v >= 35 ? "Weak" : "Poor");
/** The four parts in the card's order: the reading's key and the name the card shows. */
const PART_NAMES: [keyof ShowcaseReading["parts"], string][] = [["fundamental", "Growth & Profitability"], ["valuation", "Valuation"], ["quality", "Quality"], ["risk", "Risk"]];
const LABEL_WORD: Record<string, string> = { STRONG: "Strong", HEALTHY: "Healthy", AVERAGE: "Average", WEAK: "Weak", POOR: "Poor" };
/** "2026-11-13" as "13 Nov 2026" (the date the reading was worked out, read as a calendar day). */
export const dayText = (iso: string): string => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};
/** "Reliance Industries Ltd" as "Reliance Industries" (the short name the page uses). */
const shortName = (n: string) => n.replace(/\s+(Ltd\.?|Limited)$/i, "").trim();
const num = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** The live reading as the card draws it, or null when it lacks any figure the card shows (then the dated example stays, never a half-filled card). */
export function showcaseView(r: ShowcaseReading | null | undefined): ShowcaseView | null {
  if (!r || !num(r.final) || !r.label || !LABEL_WORD[r.label] || !r.at) return null;
  const parts = PART_NAMES.map(([key, name]) => [name, r.parts?.[key] ?? null] as [string, number | null]);
  if (!parts.every(([, v]) => num(v)) || !num(r.st?.score) || !num(r.lt?.score) || !r.st.word || !r.lt.word) return null;
  const company = shortName(r.name || r.symbol), date = dayText(r.at), tech = r.techAt && r.techAt !== r.at ? dayText(r.techAt) : null;
  return {
    symbol: r.symbol, company, date, score: r.final, word: LABEL_WORD[r.label], live: true,
    parts: parts.map(([name, v]) => ({ name, v: Math.round(v as number), word: partWordOf(v as number) })),
    tech: [
      { name: "Technical short term", span: "5–20 sessions", v: Math.round(r.st.score), word: r.st.word },
      { name: "Technical long term", span: "6–18 months", v: Math.round(r.lt.score), word: r.lt.word },
    ],
    caption: `${company} on FinLit Prism, ${date}${tech ? ` (technical views to ${tech})` : ""}. Updated daily. ${NOTE}`,
  };
}

/** The card's reading: the live one once it is read, else the dated example. */
export function useShowcase(): ShowcaseView {
  const q = useQuery<ShowcaseReading>({ queryKey: ["prism-showcase"], queryFn: () => apiGet<ShowcaseReading>("/api/prism/showcase"), staleTime: 300_000, retry: 1 });
  return showcaseView(q.data) ?? PRISM_SAMPLE;
}
