// Concall Monitor (task #278): the calls from companies' own exchange filings (GET /api/concalls), a call's transcript text, its PDF shown in place
// and its AI summary (POST /api/concalls/summary). Every button that has nothing to open carries the reason from the server, never a dead click.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ApiError, apiGet, apiSend, apiUrl } from "./api";

export type CallDoc = { link: string; title: string | null; filed: string; pages: number | null };
export type Listen = { audio?: string; page?: string; letter?: CallDoc | null; pageNote?: string; why?: string };
export type Slot = { doc?: CallDoc | null; why?: string };
export type SummarySlot = { source?: "transcript" | "presentation"; link?: string; why?: string };
export type Call = {
  id: string; symbol: string; name: string; date: string | null; time: string | null; timeLabel: string | null; dateNote: string | null; timeNote: string | null;
  kind: "Earnings call" | "Investor call"; quarter: string | null; upcoming: boolean; schedule: CallDoc | null;
  listen: Listen; transcript: Slot; ppt: Slot; summary: SummarySlot;
};
export type Scope = "all" | "portfolio" | "watchlist";
export type Tab = "latest" | "upcoming";
export type CallList = {
  items: Call[]; total: number; counts: { latest: number; upcoming: number }; scope: Scope; tab: Tab; readAt: string | null; source: string;
  disclaimer: string; scopeNote: string | null; signIn: boolean;
};
export type Transcript = { symbol: string; link: string; title?: string | null; filed: string; pages: string[]; why?: string; source?: string };
export type Summary = { text: string; source: "transcript" | "presentation"; link: string; written: string | null; cached: boolean; limit: number; used: number; left: number; resets: string; disclaimer: string };

export const PAGE = 30;

export function useCalls(scope: Scope, tab: Tab, q: string, limit: number) {
  const p = new URLSearchParams({ scope, tab, limit: String(limit) });
  if (q.trim()) p.set("q", q.trim());
  return useQuery<CallList, ApiError>({ queryKey: ["concalls", scope, tab, q.trim(), limit], queryFn: () => apiGet<CallList>(`/api/concalls?${p}`),
    staleTime: 120_000, placeholderData: keepPreviousData, retry: 1 });
}

export const useTranscript = (link: string | null) =>
  useQuery<Transcript, ApiError>({ queryKey: ["concall-transcript", link], queryFn: () => apiGet<Transcript>(`/api/concalls/transcript?link=${encodeURIComponent(link!)}`),
    enabled: !!link, staleTime: 3_600_000, retry: 1 });

export const writeSummary = (link: string) => apiSend<Summary>("POST", "/api/concalls/summary", { link });

/** The PDF served from this site, so the page can show it in place (the exchange's archive refuses to be shown inside another site). */
export const fileUrl = (link: string) => apiUrl(`/api/concalls/file?link=${encodeURIComponent(link)}`);

/** '2026-11-19' -> 'Nov 19, 2026' (the reference design's form). */
export const callDay = (iso: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null);
export const filedDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** The summary's text as lines: '**Heading**' lines and '- point' lines (with **bold** words inside). */
export function summaryBlocks(text: string): ({ h: string } | { li: string })[] {
  return (text || "").split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) =>
    /^\*\*[^*]+\*\*:?$/.test(l) ? { h: l.replace(/\*\*/g, "").replace(/:$/, "") } : { li: l.replace(/^[-•*]\s*/, "") });
}
