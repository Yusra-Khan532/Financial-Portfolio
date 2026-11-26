// Trading Lab, Order Flow: the snapshot the engine (backend finlit/lab/flow.py) takes every 3 minutes in market hours. Types mirror its JSON;
// the formulas behind each figure are in that module's docstring and in docs/TRADING-LAB.md.
import { apiGet } from "./api";

export type Buildup = "long_buildup" | "short_buildup" | "short_covering" | "long_unwinding";
export type Zone = "above_r2" | "r1_r2" | "p_r1" | "s1_p" | "s2_s1" | "below_s2";
export type Pivots = { p: number; r1: number; r2: number; s1: number; s2: number };
export type FactKey = "newPositions" | "vwapSide" | "pastLevel" | "strongOi" | "rangeEnd";

export type FlowStock = {
  symbol: string; name: string; sector: string | null; industry: string | null; lot: number | null;
  price: number; previousClose: number | null; change: number | null; changePct: number | null;
  open: number | null; high: number | null; low: number | null; volume: number | null;
  vwap: number | null; vwapGapPct: number | null;
  oi: number | null; oiChange: number | null; oiChangePct: number | null; buildup: Buildup | null; direction: -1 | 0 | 1;
  pivots: Pivots | null; pivotsFrom: string | null; zone: Zone | null;
  agreement: { score: number; of: number; facts: Partial<Record<FactKey, boolean | null>> };
  asOf: string | null; notes: string[];
};
export type FlowSector = { sector: string; stocks: number; up: number; down: number; avgChangePct: number | null; buildups: Record<Buildup, number>; oiChange: number | null; symbols: string[] };
export type FlowBand = { from: number | null; to: number | null; count: number };
export type FlowSummary = { stocks: number; up: number; down: number; flat: number; medianChangePct: number | null; buildups: Record<Buildup, number>; distribution: FlowBand[]; sectors: FlowSector[] };
export type FlowLines = { times: string[]; change: Record<string, (number | null)[]> };
export type FlowSnapshot =
  | { ready: false; reason: string }
  | { ready: true; tradeDay: string; takenAt: string; summary: FlowSummary; stocks: FlowStock[]; notes: string[]; lines: FlowLines };

export const flowSnapshot = () => apiGet<FlowSnapshot>("/api/lab/flow");

/** Plain names and one-line meanings of the four build-ups (what moved, never what to do). */
export const BUILDUP: Record<Buildup, { name: string; short: string; what: string; tone: "gain" | "loss" }> = {
  long_buildup: { name: "Long build-up", short: "Long build-up", what: "Price up and open interest up: new positions opened as the price rose.", tone: "gain" },
  short_covering: { name: "Short covering", short: "Short covering", what: "Price up and open interest down: positions closed as the price rose.", tone: "gain" },
  short_buildup: { name: "Short build-up", short: "Short build-up", what: "Price down and open interest up: new positions opened as the price fell.", tone: "loss" },
  long_unwinding: { name: "Long unwinding", short: "Long unwinding", what: "Price down and open interest down: positions closed as the price fell.", tone: "loss" },
};
export const BUILDUP_ORDER: Buildup[] = ["long_buildup", "short_covering", "short_buildup", "long_unwinding"];

export const ZONE: Record<Zone, string> = {
  above_r2: "Above R2", r1_r2: "Between R1 and R2", p_r1: "Between pivot and R1", s1_p: "Between S1 and pivot", s2_s1: "Between S2 and S1", below_s2: "Below S2",
};

export const FACTS: { key: FactKey; up: string; down: string }[] = [
  { key: "newPositions", up: "Open interest rose with the move (new positions)", down: "Open interest rose with the move (new positions)" },
  { key: "vwapSide", up: "Price above the day's VWAP", down: "Price below the day's VWAP" },
  { key: "pastLevel", up: "Price above R1", down: "Price below S1" },
  { key: "strongOi", up: "Open interest changed 5% or more", down: "Open interest changed 5% or more" },
  { key: "rangeEnd", up: "Price in the top quarter of the day's range", down: "Price in the bottom quarter of the day's range" },
];

/** True between 09:15 and 15:40 IST on a weekday (the engine's closing snapshot is at 15:40), for the page's refresh rhythm. */
export function marketLive(now = new Date()): boolean {
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60_000);
  const d = ist.getDay(), m = ist.getHours() * 60 + ist.getMinutes();
  return d >= 1 && d <= 5 && m >= 555 && m <= 940;
}

export const pct = (v: number | null | undefined, digits = 2) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}%`);
export const inr = (v: number | null | undefined) => (v == null ? "—" : `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "gain" : "loss");
