// Concall Monitor (task #278): the calls from companies' own exchange filings (GET /api/concalls), a call's transcript text, its PDF shown in place
// and its AI summary (POST /api/concalls/summary). Every button that has nothing to open carries the reason from the server, never a dead click.
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ApiError, apiGet, apiSend, apiUrl } from "./api";

export type CallDoc = { link: string; title: string | null; filed: string; pages: number | null };
export type Listen = { audio?: string; page?: string; letter?: CallDoc | null; pageNote?: string; why?: string };
export type Slot = { doc?: CallDoc | null; why?: string };
export type SummarySlot = { source?: "transcript" | "presentation"; link?: string; why?: string };
export type Call = {
  id: string; symbol: string; name: string; date: string | null; time: string | null; timeLabel: string | null; dateNote: string | null; timeNote: string | null;
  kind: "Earnings call" | "Investor call"; quarter: string | null; upcoming: boolean; schedule: CallDoc | null;
  listen: Listen; transcript: Slot; ppt: Slot; summary: SummarySlot;
  /** task #306: the member's own list this company is on (portfolio first), for the tag beside the name */
  mine?: "portfolio" | "watchlist" | null;
};
export type Has = "listen" | "transcript" | "ppt" | "summary";
export type Sort = "new" | "old" | "az";
export type Filters = { scope: Scope; tab: Tab; q: string; has: Has[]; quarter: string; kind: string; sort: Sort };
/** Counts for every dropdown, each worked out on the server with the other filters applied (task #306). */
export type Facets = { scope: { all: number; portfolio: number | null; watchlist: number | null }; has: Record<Has, number>;
  quarter: { v: string; n: number }[]; kind: { v: string; n: number }[] };
export type Scope = "all" | "portfolio" | "watchlist";
export type Tab = "latest" | "upcoming";
export type CallList = {
  items: Call[]; total: number; counts: { latest: number; upcoming: number }; scope: Scope; tab: Tab; readAt: string | null; source: string;
  disclaimer: string; scopeNote: string | null; signIn: boolean;
  /** task #306 */ offset?: number; facets?: Facets | null; have?: Record<Has, number> | null; days?: Record<string, number>;
};
export type Transcript = { symbol: string; link: string; title?: string | null; filed: string; pages: string[]; why?: string; source?: string };
export type Summary = { text: string; source: "transcript" | "presentation"; link: string; written: string | null; cached: boolean; rewritten?: boolean; limit: number; used: number; left: number; resets: string; disclaimer: string };

export const PAGE = 30;

/** Task #306: the calls a page at a time; "Show more" asks for the next 30 (offset) and adds them to the list, so every call can be reached and the
 *  server's cap of 60 a request is never passed (a second "Show more" used to ask for 90, got 422 and emptied the list). The filters run on the server,
 *  over all the calls. */
export function useCalls(f: Filters) {
  const key = { ...f, q: f.q.trim(), has: [...f.has].sort() };
  return useInfiniteQuery<CallList, ApiError>({
    queryKey: ["concalls", key],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ scope: key.scope, tab: key.tab, limit: String(PAGE), offset: String(pageParam) });
      if (key.q) p.set("q", key.q);
      if (key.has.length) p.set("has", key.has.join(","));
      if (key.quarter) p.set("quarter", key.quarter);
      if (key.kind) p.set("kind", key.kind);
      if (key.sort !== "new") p.set("sort", key.sort);
      return apiGet<CallList>(`/api/concalls?${p}`);
    },
    getNextPageParam: (last, all) => { const n = all.reduce((a, x) => a + x.items.length, 0); return n < last.total && last.items.length ? n : undefined; },
    staleTime: 120_000, placeholderData: keepPreviousData, retry: 1,
  });
}

export const useTranscript = (link: string | null) =>
  useQuery<Transcript, ApiError>({ queryKey: ["concall-transcript", link], queryFn: () => apiGet<Transcript>(`/api/concalls/transcript?link=${encodeURIComponent(link!)}`),
    enabled: !!link, staleTime: 3_600_000, retry: 1 });

export const writeSummary = (link: string) => apiSend<Summary>("POST", "/api/concalls/summary", { link });

/** The PDF served from this site, so the page can show it in place (the exchange's archive refuses to be shown inside another site). */
export const fileUrl = (link: string) => apiUrl(`/api/concalls/file?link=${encodeURIComponent(link)}`);

/** Task #306: a day heading in the en-IN form, "Fri, 20 Nov"; today, yesterday and tomorrow are named ("Today · Sat, 22 Nov"). */
export function dayLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "Date not stated in the filings";
  const d = new Date(iso + "T00:00:00");
  const base = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((d.getTime() - t0) / 86_400_000);
  const name = diff === 0 ? "Today" : diff === -1 ? "Yesterday" : diff === 1 ? "Tomorrow" : null;
  return name ? `${name} · ${base}` : base;
}
/** "2026-11-20" -> "20 Nov 2026" (the row's date when the list is sorted by company). */
export const shortDay = (iso: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null);
/** "04:00 PM" -> "4:00 PM" */
export const timeText = (label: string | null) => (label ? label.replace(/^0/, "") : null);
export const filedDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** The summary's text as lines: '**Heading**' lines and '- point' lines (with **bold** words inside). */
/** The summary as headings and points. Task #432: "## " a heading the model chose, "### " a subheading (`sub`), "- " a point; a summary kept in
 *  the old form ("**Heading**" lines) still reads the same way. */
export function summaryBlocks(text: string): ({ h: string; sub?: boolean } | { li: string })[] {
  return (text || "").split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^(#{2,4})\s+(.+)$/.exec(l);
    if (m) return m[1].length >= 3 ? { h: m[2].replace(/\*\*/g, "").replace(/:$/, ""), sub: true } : { h: m[2].replace(/\*\*/g, "").replace(/:$/, "") };
    return /^\*\*[^*]+\*\*:?$/.test(l) ? { h: l.replace(/\*\*/g, "").replace(/:$/, "") } : { li: l.replace(/^[-•*]\s*/, "") };
  });
}
