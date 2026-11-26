// Trading Lab > Option Pulse > OI Flow: how fast call and put open interest changes by strike (backend finlit/lab/oiflow.py,
// GET /api/lab/oiflow/{u}). Snapshots of each index's nearest-expiry chain every 3 minutes in market hours; every figure is a plain
// difference of stored OI. Describe-only: a rise means positions were opened at that strike, a fall that they were closed.
import { apiGet } from "./api";

export const OIFLOW_UNDERLYINGS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX"] as const;
export type FlowWindow = "m15" | "m60" | "day";
export const WINDOW_NAME: Record<FlowWindow, string> = { m15: "15 minutes", m60: "1 hour", day: "Today" };

export type FlowSide = { oi: number | null; day: number | null; m15: number | null; m60: number | null };
export type FlowStrike = { strike: number; atm: boolean; ce: FlowSide; pe: FlowSide };
export type Mover = { strike: number; change: number };
export type OIFlow = {
  status: string; underlying: string; session: string | null; today: boolean; marketOpen: boolean;
  available: boolean; detail?: string;
  expiry?: string; spot?: number | null; atm?: number; asOf?: string; firstAt?: string; snapshots?: number;
  gapMinutes?: { m15: number | null; m60: number | null };
  strikes?: FlowStrike[];
  movers?: { ce: { build: Mover[]; unwind: Mover[] }; pe: { build: Mover[]; unwind: Mover[] } };
  totals?: { ce: Record<FlowWindow, number | null>; pe: Record<FlowWindow, number | null> };
  heat?: { times: string[]; strikes: number[]; ce: (number | null)[][]; pe: (number | null)[][] };
};

export const getOIFlow = (u: string) => apiGet<OIFlow>(`/api/lab/oiflow/${encodeURIComponent(u)}`);

export const isFlowUnderlying = (u: string) => (OIFLOW_UNDERLYINGS as readonly string[]).includes(u);

/** The window's real length in words ("over 15 minutes", or why it is not there yet). */
export function windowNote(f: OIFlow, w: FlowWindow): string {
  if (w === "day") return "against the previous close";
  const g = f.gapMinutes?.[w];
  if (g == null) return w === "m15" ? "needs 15 minutes of snapshots" : "needs an hour of snapshots";
  return `over the last ${g} minutes`;
}

/** The section's one-line summary, from the chosen window's totals across the shown strikes. */
export function flowLine(f: OIFlow, w: FlowWindow, compact: (n: number | null | undefined) => string): string {
  const t = f.totals;
  if (!t) return "";
  const s = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${compact(v)}`);
  return `${f.underlying} ${WINDOW_NAME[w].toLowerCase()}: call OI ${s(t.ce[w])} · put OI ${s(t.pe[w])} across the ${f.strikes?.length ?? 0} strikes around ATM`;
}

/** The largest absolute value in a heat map side, for the colour scale (at least 1). */
export function heatMax(rows: (number | null)[][]): number {
  let m = 1;
  for (const r of rows) for (const v of r) if (v != null && Math.abs(v) > m) m = Math.abs(v);
  return m;
}
