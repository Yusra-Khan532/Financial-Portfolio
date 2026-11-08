import { useQuery } from "@tanstack/react-query";
import { apiSend, type ApiError } from "../lib/api";
import type { MfTrend } from "../lib/mfPortfolio";

export type TrendAnswer = { locked: boolean; why?: string; trend?: MfTrend["all"]; perShare?: Record<string, { st: string | null; lt: string | null }> };
/** Short- and long-term trend of the saved list (names only; Gold gets the readings, Silver a lock note). */
export function usePortfolioTrend(symbols: string[], enabled: boolean) {
  const key = [...symbols].sort().join(",");
  return useQuery<TrendAnswer, ApiError>({ queryKey: ["portfolio-trend", key], queryFn: () => apiSend<TrendAnswer>("POST", "/api/portfolio/trend", { symbols }), enabled: enabled && symbols.length > 0, retry: false, staleTime: 300_000 });
}
