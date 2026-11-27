// Trading Lab > Order Flow > Trading journal: the answer of /api/lab/journal (backend finlit/lab/journal.py) and small helpers for the page.
// A member's own record; nothing here suggests a trade.

export type JTrade = {
  id: number; symbol: string; side: "long" | "short"; qty: number; entryPrice: number; exitPrice: number | null;
  entryAt: string; exitAt: string | null; fees: number; setup: string | null; notes: string | null; pnl: number | null;
};
export type JStats = {
  closed: number; open: number; net: number; fees: number; wins: number; losses: number; winRate: number | null; profitFactor: number | null;
  expectancy: number | null; avgWin: number | null; avgLoss: number | null; largestWin: number | null; largestLoss: number | null; maxDrawdown: number;
  bestDay: { day: string; net: number } | null; worstDay: { day: string; net: number } | null; longestWinRun: number; longestLossRun: number;
  currentRun: { kind: "win" | "loss"; count: number } | null;
  curve: { at: string; cum: number; dd: number }[]; days: { day: string; net: number }[];
  setups: { setup: string; trades: number; net: number; wins: number }[];
};
export type Journal = { trades: JTrade[]; stats: JStats; limit: number };
export type TradeIn = Omit<JTrade, "id" | "pnl">;

/** ₹ with Indian grouping and a sign: "+₹1,250.00", "−₹40.00". */
export const money = (v: number | null | undefined, sign = true) =>
  v == null ? "—" : `${sign ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : ""}₹${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The weeks of a calendar ending at `last` (Monday-first columns), each day with its P&L if any: the daily heatmap. */
export function calendar(days: { day: string; net: number }[], last: string, weeks = 17): { day: string; net: number | null; month: string }[][] {
  const by = new Map(days.map((d) => [d.day, d.net]));
  const end = new Date(last + "T00:00:00Z");
  const dow = (end.getUTCDay() + 6) % 7;                       // Monday 0
  const start = new Date(end); start.setUTCDate(end.getUTCDate() - dow - (weeks - 1) * 7);
  const out: { day: string; net: number | null; month: string }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const t = new Date(start); t.setUTCDate(start.getUTCDate() + w * 7 + d);
      const iso = t.toISOString().slice(0, 10);
      col.push({ day: iso, net: t > end ? null : by.get(iso) ?? null, month: t.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }) });
    }
    out.push(col);
  }
  return out;
}

/** A blank trade for the form: now, in Indian time, as the input's "YYYY-MM-DDTHH:MM". */
export function nowIst(d = new Date()): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  return ist.toISOString().slice(0, 16);
}

/** "2026-11-26T10:15" from the form (Indian time) to an ISO time with the +05:30 offset. */
export const fromInput = (v: string) => (v ? `${v}:00+05:30` : null);
export const toInput = (iso: string | null) => (iso ? iso.slice(0, 16) : "");

export const CSV_SAMPLE = "symbol,side,qty,entry price,exit price,entry time,exit time,fees,setup,notes\nRELIANCE,long,10,1400,1420,2026-11-24 09:30,2026-11-24 11:00,25,Opening range,";
