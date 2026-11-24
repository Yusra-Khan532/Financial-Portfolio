// Task #365 (Chinmay, 24 Nov 2026): the sentiment score of a news item or exchange filing, from the financial-news language model the nightly job
// runs (backend finlit/sentiment.py): P(positive) - P(negative), from -1 to +1, in the team's plan's five draft bands. It describes the wording of
// what was published; it is not a view on the share and not advice.
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

export type SentBand = "clearly_positive" | "positive" | "neutral" | "negative" | "clearly_negative";
export type Sentiment = { score: number; band: SentBand };

export const SENT_WORD: Record<SentBand, string> = {
  clearly_positive: "Clearly positive", positive: "Positive", neutral: "Neutral", negative: "Negative", clearly_negative: "Clearly negative",
};
/** The plan's edges: +0.5 and +0.1 belong to the band above, -0.1 and -0.5 to the band below the middle (as the backend's band()). */
export function bandOf(s: number): SentBand {
  return s >= 0.5 ? "clearly_positive" : s >= 0.1 ? "positive" : s > -0.1 ? "neutral" : s > -0.5 ? "negative" : "clearly_negative";
}
export const fmtScore = (s: number) => (s >= 0.005 ? "+" : s <= -0.005 ? "−" : "") + Math.abs(s).toFixed(2);
export const SENT_HELP = "Sentiment of the wording, from −1 (clearly negative) to +1 (clearly positive), read by a financial-news language model: "
  + "+0.5 and above clearly positive, +0.1 to +0.5 positive, −0.1 to +0.1 neutral, −0.5 to −0.1 negative, below −0.5 clearly negative. "
  + "Most exchange filings are procedural and read neutral. It describes the words of the filing, not the share; not a recommendation.";

/** The mean score of the scored items, or null when none is scored. */
export function meanSentiment(list: (Sentiment | null | undefined)[]): Sentiment | null {
  const xs = list.filter((x): x is Sentiment => !!x);
  if (!xs.length) return null;
  const m = xs.reduce((a, x) => a + x.score, 0) / xs.length;
  return { score: Math.round(m * 100) / 100, band: bandOf(m) };
}

type Row = { date: string; link: string | null; title: string; score?: number; band?: SentBand };
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
    if (r.score == null || !r.band) continue;
    const s = { score: r.score, band: r.band };
    if (r.link) byLink.set(r.link, s);
    byKey.set(r.date + "|" + norm(r.title), s);
  }
  return (f: { date: string; link: string | null; description: string; category: string | null }): Sentiment | null =>
    (f.link && byLink.get(f.link)) || byKey.get(f.date + "|" + norm(feedTitleOf(f.description, f.category))) || null;
}
