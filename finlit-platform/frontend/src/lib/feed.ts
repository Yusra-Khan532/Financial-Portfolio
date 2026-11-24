import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import type { Sentiment } from "./sentiment";

export type FeedItem = { id: number; kind: "news" | "result" | "document"; title: string; symbol: string | null; company: string | null; source: string | null; link: string | null; date: string; category: string | null; period: string | null; summary: string | null; auto: boolean; topic?: FeedTopic;
  /** task #365: the sentiment of its wording (-1 .. +1 and its band), null while not scored yet */ sentiment?: Sentiment | null };
/** FinLit's own topics above the exchange's category, in the order the News & filings page shows them (backend: finlit/feed.py TOPICS). */
export const FEED_TOPICS = [["results", "Results"], ["orders", "Orders & contracts"], ["people", "Management & board"], ["deals", "Deals & tie-ups"],
  ["capital", "Shares & fund raising"], ["rating", "Credit rating"], ["legal", "Regulatory & legal"], ["meetings", "Meetings & votes"],
  ["business", "Business updates"], ["compliance", "Compliance filings"], ["other", "Other updates"]] as const;
export type FeedTopic = (typeof FEED_TOPICS)[number][0] | "documents";
type FeedOpts = { scoped?: boolean; symbols?: string[]; q?: string; limit?: number; fresh?: boolean; from?: string; to?: string; upcoming?: boolean; manual?: boolean; before?: string;
  /** with `before`: the id of the last item shown, so a busy day cut by `limit` continues where it stopped */ beforeId?: number;
  /** leave out the results calendar's dates: filings only */ filed?: boolean; topics?: FeedTopic[];
  /** one exchange category, exact (task #309) */ category?: string };
/** `kind` may name several kinds: "news,result" is the News & filings page (exchange news and results filings together). */
type Kinds = FeedItem["kind"] | `${FeedItem["kind"]},${FeedItem["kind"]}` | `${FeedItem["kind"]},${FeedItem["kind"]},${FeedItem["kind"]}`;
const feedUrl = (kind: Kinds, opts: FeedOpts, sym: string) => `/api/feed?kind=${kind}&limit=${opts.limit || 100}${sym ? `&symbol=${encodeURIComponent(sym)}` : ""}${opts.q ? `&q=${encodeURIComponent(opts.q)}` : ""}${opts.from && opts.to ? `&from_date=${opts.from}&to_date=${opts.to}` : ""}${opts.upcoming ? "&upcoming=true" : ""}${opts.manual ? "&manual=true" : ""}${opts.before ? `&before=${opts.before}` : ""}${opts.before && opts.beforeId ? `&before_id=${opts.beforeId}` : ""}${opts.filed ? "&filed=true" : ""}${opts.topics?.length ? `&topic=${opts.topics.join(",")}` : ""}${opts.category ? `&category=${encodeURIComponent(opts.category)}` : ""}`;
export const useFeed = (kind: Kinds, opts: FeedOpts = {}) => {
  const sym = (opts.symbols || []).slice(0, 60).join(","), none = !!opts.scoped && !sym;   // "only my watchlist" with an empty watchlist is no companies, not all of them
  return useQuery({
    queryKey: ["feed", kind, none ? "(none)" : sym, opts.q || "", opts.limit || 100, !!opts.fresh, opts.from || "", opts.to || "", !!opts.upcoming, !!opts.manual, opts.before || "", opts.beforeId || 0, !!opts.filed, (opts.topics || []).join(",")], staleTime: 60_000, retry: 1,
    queryFn: () => none ? Promise.resolve<FeedItem[]>([]) : apiGet<{ items: FeedItem[] }>(feedUrl(kind, opts, sym), opts.fresh ? { cache: "reload" } : undefined).then((r) => r.items),
  });
};
/** Pages of the feed, newest first: each "Show more" asks for the items after the last one loaded (its date and id). */
export const useFeedPages = (kind: Kinds, opts: Omit<FeedOpts, "before" | "beforeId"> = {}) => {
  const sym = (opts.symbols || []).slice(0, 60).join(","), none = !!opts.scoped && !sym, limit = opts.limit || 60;
  return useInfiniteQuery({
    queryKey: ["feed-pages", kind, none ? "(none)" : sym, opts.q || "", limit, !!opts.filed, (opts.topics || []).join(","), opts.category || "", opts.from || "", opts.to || ""], staleTime: 60_000, retry: 1,
    initialPageParam: null as null | { before: string; beforeId: number },
    queryFn: ({ pageParam }) => none ? Promise.resolve<FeedItem[]>([]) : apiGet<{ items: FeedItem[] }>(feedUrl(kind, { ...opts, limit, ...(pageParam || {}) }, sym)).then((r) => r.items),
    getNextPageParam: (last) => last.length < limit ? undefined : { before: last[last.length - 1].date, beforeId: last[last.length - 1].id },
  });
};
/** GET /api/feed/counts: the numbers for the News & filings page's topic chips and dropdowns, for a date window (task #309). Topics are counted
 *  with every filter but the topic, categories with every filter but the category, days and the total with all of them. */
export type FeedCounts = { from: string; to: string; total: number; topics: [FeedTopic, string, number][]; categories: [string, number][]; days: [string, number][] };
export const useFeedCounts = (kind: Kinds, opts: Pick<FeedOpts, "scoped" | "symbols" | "q" | "filed" | "topics" | "category" | "from" | "to"> = {}) => {
  const sym = (opts.symbols || []).slice(0, 60).join(","), none = !!opts.scoped && !sym;
  const url = `/api/feed/counts?kind=${kind}${sym ? `&symbol=${encodeURIComponent(sym)}` : ""}${opts.q ? `&q=${encodeURIComponent(opts.q)}` : ""}${opts.filed ? "&filed=true" : ""}`
    + `${opts.topics?.length ? `&topic=${opts.topics.join(",")}` : ""}${opts.category ? `&category=${encodeURIComponent(opts.category)}` : ""}${opts.from && opts.to ? `&from_date=${opts.from}&to_date=${opts.to}` : ""}`;
  return useQuery({
    queryKey: ["feed-counts", none ? "(none)" : url], staleTime: 60_000, retry: 1,
    queryFn: () => none ? Promise.resolve<FeedCounts>({ from: opts.from || "", to: opts.to || "", total: 0, topics: [], categories: [], days: [] }) : apiGet<FeedCounts>(url),
  });
};
export const dayLabel = (iso: string) => {
  const d = new Date(iso + "T00:00:00"), t = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) + "T00:00:00");   // "today" is the Indian market day, whatever the browser clock says
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  const base = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric" });
  return diff === 0 ? `Today · ${base}` : diff === 1 ? `Tomorrow · ${base}` : diff === -1 ? `Yesterday · ${base}` : base;
};
/** What the Documents page calls a filing. Task #218: NSE files meeting notices as "Analysts/Institutional Investor Meet/Con. Call Updates", so "investor" or
 *  "analyst" alone no longer makes an investor presentation (8 of Reliance's 9 "presentations" were such notices); a transcript is checked before a
 *  presentation. FinLit AI uses the same rule (backend finlit/ask/pages.py doc_type), so the page and the AI agree. */
export const docType = (i: Pick<FeedItem, "category" | "title">): string => {
  const s = `${i.category || ""} ${i.title}`.toLowerCase();
  return /annual report|integrated report/.test(s) ? "Annual report" : /transcript|concall|earnings call/.test(s) ? "Call transcript" : /presentation/.test(s) ? "Investor presentation" : /prospectus|offer document|\brhp\b|\bdrhp\b/.test(s) ? "Offer document" : /result/.test(s) ? "Results filing" : "Other filing";
};

/** What to call a feed row: the ticker, except for BSE-only companies whose "ticker" is a number such as 539984; then the name. */
export const who = (x: { symbol?: string | null; company?: string | null }) => (x.symbol && !/^\d+$/.test(x.symbol) ? x.symbol : x.company || x.symbol || "");

/** What GET /api/results/status says: when each results job last ran and the newest result held. */
export type RunInfo = { at?: string; status?: string; counts?: Record<string, number>; newestResultDate?: string | null; error?: string } | null;
export type ResultsStatus = { todayIST: string; newestResultInDb: string | null; newestFilingInDb: string | null; upcomingCount: number; lastRun: { calendars: RunInfo; results: RunInfo; resultsLight: RunInfo } };
export const useResultsStatus = () => useQuery({ queryKey: ["results-status"], staleTime: 60_000, retry: 0, queryFn: () => apiGet<ResultsStatus>("/api/results/status") });

const dayNum = (iso: string) => Math.round(new Date(iso + "T00:00:00Z").getTime() / 86_400_000);
/** Results seasons in India: the weeks after each quarter closes (15 Jan to 14 Feb, 15 Apr to 31 May, 15 Jul to 14 Aug, 15 Oct to 14 Nov). */
export const inResultsSeason = (iso: string) => { const m = +iso.slice(5, 7), d = +iso.slice(8, 10); return (m === 1 && d >= 15) || (m === 2 && d <= 14) || (m === 4 && d >= 15) || m === 5 || (m === 7 && d >= 15) || (m === 8 && d <= 14) || (m === 10 && d >= 15) || (m === 11 && d <= 14); };
/** A neutral note when, on a weekday in results season, the newest result held is more than 2 days old; else null. */
export const staleResultsNote = (s?: Pick<ResultsStatus, "todayIST" | "newestResultInDb"> | null): string | null => {
  if (!s || !s.todayIST) return null;
  const dow = new Date(s.todayIST + "T00:00:00Z").getUTCDay();
  if (dow === 0 || dow === 6 || !inResultsSeason(s.todayIST)) return null;
  if (s.newestResultInDb && dayNum(s.todayIST) - dayNum(s.newestResultInDb) <= 2) return null;
  const since = s.newestResultInDb ? new Date(s.newestResultInDb + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
  return since ? `The latest results have not been refreshed since ${since}. We are checking again every hour.` : "No results are held yet. We are checking again every hour.";
};
