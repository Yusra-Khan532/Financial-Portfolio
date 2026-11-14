// The state history behind two Sector Pulse charts (9 Nov 2026 pages update): every group's state on each of the last six months of sessions, and the insight cards, both written by the server.
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "./api";

/** "crash" is "Bouncing back after a crash", kept apart from "bouncing" since the final pages pack (13 Nov 2026). */
export type StateKey = "sold_off" | "crash" | "bouncing" | "rising" | "losing" | "no_signal";
export const STATE_KEYS: StateKey[] = ["sold_off", "crash", "bouncing", "rising", "losing", "no_signal"];
export type PulseInsight = { kind: "good" | "insight" | "watch" | "warning"; title: string; text: string };
export type SectorHistory = {
  date?: string; dates: string[]; words: Record<StateKey, string>;
  /** `rising`: each day, out of every 100 counted stocks, how many were above their medium trend. */
  groups: { name: string; slug: string; kind: string; states: (StateKey | null)[]; rising?: (number | null)[] }[];
  counts: Record<StateKey, number[]>; weeks: { date: string; counts: Record<StateKey, number> }[]; week_ends: number[];
  insights: { mood: PulseInsight[]; strip: PulseInsight[] };
  changed_this_week: { name: string; slug: string; last: string | null; now: string | null }[];
};
export const useSectorHistory = () => useQuery<SectorHistory, ApiError>({ queryKey: ["sectors", "history"], queryFn: () => apiGet<SectorHistory>("/api/sector-history"), staleTime: 5 * 60_000, retry: false });
