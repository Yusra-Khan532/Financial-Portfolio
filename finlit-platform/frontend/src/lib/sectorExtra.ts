// The data behind "Industry map" (Sector Pulse) and "A year of <industry>" (an industry page), 9 Nov 2026 pages update. Insights and moments are written by the server.
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "./api";
import type { PulseInsight, StateKey } from "./sectorHistory";

export type IndustryMap = { date?: string; words: Record<StateKey, string>; insights: PulseInsight[];
  rows: { name: string; slug: string; state: StateKey; state_word: string; rising: number; below_high: number; corner: string | null }[] };
export type IndustryYear = { name: string; slug: string; dates: string[]; rising: (number | null)[]; states: (StateKey | null)[]; words: Record<StateKey, string>;
  moments: { n: number; i: number; date: string; text: string }[]; insights: PulseInsight[]; bounces: { from: string; to: string; days: number }[]; days_in_state: Record<StateKey, number> };
export const useIndustryMap = () => useQuery<IndustryMap, ApiError>({ queryKey: ["sectors", "map"], queryFn: () => apiGet<IndustryMap>("/api/sector-map"), staleTime: 5 * 60_000, retry: false });
export const useIndustryYear = (slug: string) => useQuery<IndustryYear, ApiError>({ queryKey: ["sectors", "year", slug], queryFn: () => apiGet<IndustryYear>(`/api/sectors/${encodeURIComponent(slug)}/year`), enabled: !!slug, staleTime: 5 * 60_000, retry: false });
