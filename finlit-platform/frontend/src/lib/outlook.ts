// Profit and revenue outlook (Gold): API types, the hook, and the pure logic of the "Build your own growth model" sliders (each input's own growth rate, task #146).
// All forecast arithmetic is on the server (backend/finlit/outlook/model.py); the chart series, ticks and formats are in lib/outlookChart.ts.
import { useQuery } from "@tanstack/react-query";
import { apiSend, type ApiError } from "./api";

export type Kind = "profit" | "revenue";
export type Horizon = "short" | "mid" | "long";
export type Weights = Record<string, number>;
export type RateRow = {
  key: string; label: string; who: "company" | "sector"; weightPct: number; effectiveWeightPct: number; valuePct: number | null; rawPct: number | null; capped: boolean;
  contributionPts: number | null; status: "ok" | "unavailable"; method: string | null; reason: string | null; detail: string | null;
  assumed?: boolean; actualPct?: number | null;   // set by the user's own growth rate; the company's (or sector's) figure it replaced
};
export type Values = Record<string, number>;
export type YearRow = { period: string; valueCr: number; growthPct: number; changeCr: number };
export type HistoryPoint = { period: string; valueCr: number | null; reportedCr: number | null; adjusted: boolean };
export type Outlook = {
  symbol: string; statement: string; kind: Kind; mode: "model" | "custom"; name: string | null; isLender: boolean; asOf: { yearly: string | null }; reportGeneratedAt: string | null;
  weights: Weights; values?: Values | null; defaultWeights: Weights; adjustedYears: string[];
  horizon: { key: Horizon; years: number; label: string; span: string };
  history: { unit: string; points: HistoryPoint[] };
  rate: { ratePct: number | null; rows: RateRow[]; unavailable: string[]; weightLeftPct: number };
  forecast: { available: boolean; reason: string | null; base: { period: string; valueCr: number } | null; years: YearRow[]; rule: string };
  inputCapPct: number; minPeers: number; disclaimer: string;
};

export const HORIZONS: { key: Horizon; label: string; span: string; years: number }[] = [
  { key: "short", label: "Short-term", span: "1 year", years: 1 }, { key: "mid", label: "Mid-term", span: "3 years", years: 3 }, { key: "long", label: "Long-term", span: "5 years", years: 5 },
];
export const KIND_LABEL: Record<Kind, string> = { profit: "Profit", revenue: "Revenue" };

/** The team's proposed starting weights (percent) for each horizon: the same numbers the server uses (it is the source; this copy lets the sliders start from them and "Reset" return to them). */
export const DEFAULT_WEIGHTS: Record<Kind, Record<Horizon, Weights>> = {
  revenue: {
    short: { co_1y: 50, co_3y: 10, co_5y: 5, sec_1y: 25, sec_3y: 5, sec_5y: 5 },
    mid: { co_1y: 10, co_3y: 40, co_5y: 10, sec_1y: 20, sec_3y: 10, sec_5y: 10 },
    long: { co_1y: 5, co_3y: 15, co_5y: 40, sec_1y: 20, sec_3y: 5, sec_5y: 15 },
  },
  profit: {
    short: { co_1y: 35, co_3y: 10, co_5y: 5, sec_1y: 25, sec_3y: 5, sec_5y: 5, margin: 15 },
    mid: { co_1y: 10, co_3y: 25, co_5y: 10, sec_1y: 20, sec_3y: 10, sec_5y: 10, margin: 15 },
    long: { co_1y: 5, co_3y: 15, co_5y: 30, sec_1y: 20, sec_3y: 5, sec_5y: 15, margin: 10 },
  },
};
/** Names of the parameters, in table order (the server sends the same labels with every result; these show on the sliders before the first result). */
export const PARAM_LABELS: Record<Kind, Record<string, string>> = {
  revenue: { co_1y: "Company revenue growth (1Y)", co_3y: "Company revenue CAGR (3Y)", co_5y: "Company revenue CAGR (5Y)", sec_1y: "Sector revenue growth (1Y)", sec_3y: "Sector revenue CAGR (3Y)", sec_5y: "Sector revenue CAGR (5Y)" },
  profit: { co_1y: "Company net profit growth (1Y)", co_3y: "Company net profit CAGR (3Y)", co_5y: "Company net profit CAGR (5Y)", sec_1y: "Sector net profit growth (1Y)", sec_3y: "Sector net profit CAGR (3Y)", sec_5y: "Sector net profit CAGR (5Y)", margin: "Net profit margin trend" },
};

/** "Build your own growth model" (task #146): each slider is that input's expected growth rate, percent a year, set on its own: not a weight, no total.
 *  The server limits every input to this range (model.INPUT_CAP); FinLit's weights for the horizon combine the rates into one yearly rate. */
export const VALUE_MIN = -50, VALUE_MAX = 50, VALUE_STEP = 0.1;   // a tenth of a point: the knob sits exactly on the company's figure as shown (one decimal)
export const clampValue = (v: number) => (Number.isFinite(v) ? Math.max(VALUE_MIN, Math.min(VALUE_MAX, Number(v.toFixed(1)))) : 0);
/** The company's own figure for each input that has one (the FinLit model's answer): where every slider starts. */
export const companyValues = (d: Outlook | null | undefined): Values =>
  Object.fromEntries((d?.rate.rows ?? []).filter((r) => r.status === "ok" && r.valuePct != null).map((r) => [r.key, r.valuePct as number]));
/** Only the inputs the user moved away from the company's figure (what is sent; the others keep the company's figure on the server). */
export const changedValues = (base: Values, mine: Values): Values =>
  Object.fromEntries(Object.entries(mine).filter(([k, v]) => base[k] == null || Math.abs(base[k] - v) >= VALUE_STEP / 2).map(([k, v]) => [k, clampValue(v)]));
export const signedPct = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}%`;

/** One estimate: the FinLit model's (values null), or the user's own growth rates combined by the model's weights. */
export function useOutlook(symbol: string | undefined, kind: Kind, horizon: Horizon, values: Values | null, enabled: boolean) {
  const key = values ? Object.entries(values).sort().map(([k, v]) => `${k}${v}`).join(",") : "model";
  return useQuery<Outlook, ApiError>({
    queryKey: ["outlook3", symbol, kind, horizon, key],
    queryFn: () => apiSend<Outlook>("POST", `/api/outlook/${encodeURIComponent(symbol as string)}`, values ? { kind, horizon, values } : { kind, horizon }),
    enabled: enabled && !!symbol, retry: false, staleTime: 300_000,
  });
}
