// Trading Lab > Order Flow > Money Flow (founder, 26 Nov 2026): ₹ crore traded on up-moves (in) and down-moves (out) per stock and sector, from
// the engine's 3-minute snapshots (backend finlit/lab/flow.py `money`). A description of where traded value went with the moves, not of who bought.
import { apiGet } from "./api";

export type MoneyStock = { symbol: string; sector: string; in: number; out: number; net: number; surge: number };
export type MoneySector = { sector: string; in: number; out: number; net: number; surge: number; stocks: MoneyStock[] };
export type MoneyFlow =
  | { ready: false; reason: string }
  | { ready: true; tradeDay: string; takenAt: string; in: number; out: number; net: number; sectors: MoneySector[]; stocks: MoneyStock[];
      surge: MoneyStock | null; stepMinutes: number | null; steps: number; latest: string | null };

export const moneyFlow = () => apiGet<MoneyFlow>("/api/lab/flow/money");

/** ₹ crore with Indian grouping; a sign when asked. */
export const cr = (v: number | null | undefined, sign = false) =>
  v == null ? "—" : `${sign ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : ""}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 })} cr`;

/** The day in one plain sentence: where money went in and out (describe, never advise). */
export function headline(m: Extract<MoneyFlow, { ready: true }>): string {
  const into = m.sectors.filter((s) => s.net > 0).slice(0, 2).map((s) => s.sector);
  const outof = [...m.sectors].reverse().filter((s) => s.net < 0).slice(0, 2).map((s) => s.sector);
  const a = into.length ? `Money moving into ${into.join(" and ")}` : "No sector with more money in than out";
  const b = outof.length ? `; out of ${outof.join(" and ")}` : "";
  return `${a}${b}.`;
}
