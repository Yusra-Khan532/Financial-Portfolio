// Task #365 (Chinmay, 24 Nov 2026): the sentiment score of a news item or exchange filing, from the financial-news language model the nightly job
// runs (backend finlit/sentiment.py): P(positive) - P(negative), from -1 to +1, in the team's plan's five draft bands. It describes the wording of
// what was published; it is not a view on the share and not advice.
// Re-check (28 Nov 2026): a routine filing (an ESOP allotment, a trading-window notice, a meet schedule, a certificate) is not scored: the API gives
// it the band "routine" and no score, the chip says "Routine filing", and averages leave it out. An average says how many items it covers.
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

export type SentBand = "clearly_positive" | "positive" | "neutral" | "negative" | "clearly_negative";
/** An item the model read: its score and band. */
export type Reading = { score: number; band: SentBand; state?: "read" };
/** A routine filing: no score, by nature it carries no news. */
export type RoutineMark = { score: null; band: "routine"; state?: "routine" };
export type Sentiment = Reading | RoutineMark;
/** The mean of the items read, and how many it covers. */
export type Average = Reading & { n: number };

export const SENT_WORD: Record<SentBand, string> = {
  clearly_positive: "Clearly positive", positive: "Positive", neutral: "Neutral", negative: "Negative", clearly_negative: "Clearly negative",
};
export const ROUTINE_WORD = "Routine filing";
export const ROUTINE_HELP = "A routine filing (for example a share allotment under an employee stock plan, a trading-window notice, a meeting schedule or a "
  + "certificate) carries no news by nature, so its wording is not scored and it is left out of the averages.";
export const isReading = (s: Sentiment | null | undefined): s is Reading => !!s && s.band !== "routine" && typeof s.score === "number";
/** The plan's edges: +0.5 and +0.1 belong to the band above, -0.1 and -0.5 to the band below the middle (as the backend's band()). */
export function bandOf(s: number): SentBand {
  return s >= 0.5 ? "clearly_positive" : s >= 0.1 ? "positive" : s > -0.1 ? "neutral" : s > -0.5 ? "negative" : "clearly_negative";
}
/** The score to two decimals with its sign; a score that rounds to zero is "0.00", never "−0.00". */
export const fmtScore = (s: number) => {
  const r = Math.round(s * 100) / 100;
  return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r).toFixed(2);
};
export const SENT_HELP = "Sentiment of the wording, from −1 (clearly negative) to +1 (clearly positive), read by a financial-news language model: "
  + "+0.5 and above clearly positive, +0.1 to +0.5 positive, −0.1 to +0.1 neutral, −0.5 to −0.1 negative, below −0.5 clearly negative. "
  + "Most exchange filings are procedural and read neutral. It describes the words of the filing, not the share; not a recommendation.";

/** The mean score of the items read (routine filings and items not scored are left out) and how many it covers, or null when none was read. */
export function meanSentiment(list: (Sentiment | null | undefined)[]): Average | null {
  const xs = list.filter(isReading);
  if (!xs.length) return null;
  const m = xs.reduce((a, x) => a + x.score, 0) / xs.length;
  const score = Math.round(m * 100) / 100 + 0;
  return { score, band: bandOf(score), n: xs.length };
}

type Row = { date: string; link: string | null; title: string; score?: number | null; band?: SentBand | "routine" };
const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
/** The feed's own title of an announcement (backend feed.rows_from_announcements): its text when 10 to 160 letters, else "category: text". */
export const feedTitleOf = (description: string, category: string | null) => {
  const d = description.replace(/\s+/g, " ").trim(), c = category || "General";
  return d.length >= 10 && d.length <= 160 ? d : `${c}: ${d.slice(0, 140)}`.replace(/^[:\s]+|[:\s]+$/g, "");
};

/** One company's scored filings, for the report's News and filings section: a lookup by link, else by date and title. */
export function useSymbolSentiment(symbol?: string) {
  const q = useQuery({
    queryKey: ["feed-sentiment", symbol], enabled: !!symbol, staleTime: 5 * 60_000,
    queryFn: () => apiGet<{ items: Row[] }>(`/api/feed/sentiment?symbol=${encodeURIComponent(symbol!)}`),
  });
  const byLink = new Map<string, Sentiment>(), byKey = new Map<string, Sentiment>();
  for (const r of q.data?.items ?? []) {
    const s: Sentiment | null = r.band === "routine" ? { score: null, band: "routine" } : r.score != null && r.band ? { score: r.score, band: r.band } : null;
    if (!s) continue;
    if (r.link) byLink.set(r.link, s);
    byKey.set(r.date + "|" + norm(r.title), s);
  }
  return (f: { date: string; link: string | null; description: string; category: string | null }): Sentiment | null =>
    (f.link && byLink.get(f.link)) || byKey.get(f.date + "|" + norm(feedTitleOf(f.description, f.category))) || null;
}
