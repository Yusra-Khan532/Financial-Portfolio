// Trading Lab > Order Flow > Setup scanner: the answer of GET /api/lab/scanner (backend finlit/lab/scanner.py, job lab-scanner) and the small
// pure helpers the tab uses. Each weekday evening every NSE stock's latest daily bar is checked against the Strategy backtest's 23 fixed rules
// (market-lab, MIT); a stock is listed under a rule when its latest bar matches that rule's conditions. Facts of past prices only.

export type Past = { trades: number; few: boolean; winRate: number | null; avgR: number | null; running: number };
export type Flag = "no_lower" | "lower_above" | "wide_risk" | "big_move";
export type Match = {
  symbol: string; name: string; sector: string | null; industry: string | null; fno: boolean; day: string; close: number | null;
  lower: number | null; distPct: number | null; volume: number | null; volAvg: number | null; volRatio: number | null; bars: number;
  past: Past; flags: Flag[]; spark: (number | null)[]; new?: boolean | null; streak?: number;
};
export type ScanRule = {
  id: string; name: string; kind: "trend" | "mean reversion"; trigger: string; lowerRule: string; volumeRule: boolean; available: boolean;
  note: string | null; count: number; matches: Match[];
};
export type Skipped = { tooShort: number; stale: number; noData: number; failed: number };
export type Scan = {
  status: "ok" | "partial" | "empty"; ready: boolean; note: string; rules: ScanRule[]; flags: Record<Flag, string>; detail?: string;
  version?: number; scannedAt?: string; barsDate?: string; previousDate?: string | null; universe?: number; fno?: number; scanned?: number;
  checked?: number; skipped?: Skipped; staleDays?: Record<string, number>; notReached?: number; seconds?: number; stoppedEarly?: boolean;
  stoppedNote?: string; exit?: string; exitName?: string; minBars?: number; nifty?: boolean; fewTrades?: number;
};
export type Row = Match & { rule: ScanRule; order: number };
export type Filters = { rule: string; sector: string; fresh: boolean; fno: boolean };

export const NOTE = "Stocks whose latest daily bar matches each fixed rule's conditions; not a recommendation.";
export const NO_SECTOR = "Sector not stated";
export const ALL: Filters = { rule: "", sector: "", fresh: false, fno: false };

/** Every match as one row, in the rules' own list order and then by symbol (never ranked by any result). */
export function rowsOf(s: Scan): Row[] {
  return s.rules.flatMap((rule, order) => rule.matches.map((m) => ({ ...m, rule, order })));
}

export function sectorsOf(rows: Row[]): string[] {
  return [...new Set(rows.map((r) => r.sector ?? NO_SECTOR))].sort((a, b) => (a === NO_SECTOR ? 1 : b === NO_SECTOR ? -1 : a.localeCompare(b)));
}

export function applyFilters(rows: Row[], f: Filters): Row[] {
  return rows.filter((r) => (!f.rule || r.rule.id === f.rule) && (!f.sector || (r.sector ?? NO_SECTOR) === f.sector) && (!f.fresh || r.new === true) && (!f.fno || r.fno));
}

/** Matches per rule for the summary row, all 23 in list order (0 when none), with how many are new today. */
export function perRule(s: Scan, rows: Row[]): { rule: ScanRule; count: number; fresh: number }[] {
  return s.rules.map((rule) => {
    const mine = rows.filter((r) => r.rule.id === rule.id);
    return { rule, count: mine.length, fresh: mine.filter((r) => r.new === true).length };
  });
}

/** "New today", "Also yesterday" (with the run of sessions), or why it cannot be said. */
export function since(m: Match, previous: string | null | undefined): { label: string; tone: "new" | "also" | "na"; title: string } {
  if (m.new === true) return { label: "New today", tone: "new", title: `Did not match this rule on ${dmy(previous)}, the previous stored session.` };
  if (m.new === false) {
    const n = m.streak ?? 2;
    return { label: "Also yesterday", tone: "also", title: `Matched this rule on ${dmy(previous)} too: ${n} sessions in a row.` };
  }
  return { label: "—", tone: "na", title: previous ? "This stock was not reached by the previous session's scan." : "No earlier session is stored to compare with." };
}

export const dmy = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
export const times = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2)}×`);
export const count = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-IN"));
export const backtestLink = (symbol: string, rule: string) => `/lab/flow?view=backtest&symbol=${encodeURIComponent(symbol)}&rule=${encodeURIComponent(rule)}`;
