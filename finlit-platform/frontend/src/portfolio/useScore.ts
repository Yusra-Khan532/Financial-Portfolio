import { useQuery } from "@tanstack/react-query";
import { apiSend, type ApiError } from "../lib/api";

export const HORIZONS = [["lt1", "Under 1 year"], ["1-3", "1 to 3 years"], ["3-5", "3 to 5 years"], ["gt5", "Over 5 years"]] as const;
export const RISKS = [["low", "Low"], ["medium", "Medium"], ["high", "High"]] as const;
export const GOALS = [["grow", "Grow wealth"], ["income", "Regular income"], ["protect", "Protect capital"]] as const;
export const BENCHMARKS = [["NIF50", "NIFTY 50"], ["NIF500", "NIFTY 500"], ["NIFMID150", "NIFTY Midcap 150"], ["NIFSMA250", "NIFTY Smallcap 250"]] as const;
export type Choices = { horizon: string; risk: string; goal: string; benchmark: string };
export const DEFAULTS: Choices = { horizon: "3-5", risk: "medium", goal: "grow", benchmark: "NIF50" };
const KEY = "finlit-score-choices-v1";
export const loadChoices = (): Choices => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && typeof v === "object" ? { ...DEFAULTS, ...v } : DEFAULTS; } catch { return DEFAULTS; } };
export const saveChoices = (c: Choices) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private mode */ } };

type Word = { word: string; why?: string } & Record<string, any>;
export type ScoreAnswer = {
  locked: boolean; why?: string; needsQuantities?: boolean; total?: number | null; totalWhy?: string | null; band?: string; coverage?: number; confidence?: string; benchmark?: string;
  readings?: { strength: Word; spread: Word; risk: Word; trend: Word; valuation: Word; concentration: Word }; unknown?: string[]; noQuantity?: string[];
};
/** The portfolio score for the saved list. Quantities are sent for this answer only; the server keeps nothing. */
export function usePortfolioScore(items: { symbol: string; qty: number | null }[], c: Choices, enabled: boolean) {
  const key = items.map((i) => `${i.symbol}:${i.qty ?? ""}`).sort().join(",") + "|" + Object.values(c).join(",");
  return useQuery<ScoreAnswer, ApiError>({
    queryKey: ["portfolio-score", key],
    queryFn: () => apiSend<ScoreAnswer>("POST", "/api/portfolio/score", { items: items.map((i) => (i.qty ? i : { symbol: i.symbol })), ...c }),
    enabled: enabled && items.length > 0, retry: false, staleTime: 300_000,
  });
}
