// Trading Lab > Order Flow > Strategy backtest: the answer of GET /api/lab/backtest/{symbol} (backend finlit/lab/backtest.py) and the small
// pure helpers the tab uses (sorting, the running total of R, dates). market-lab's 23 swing rules (MIT), re-implemented on FinLit's prices.

export type Basis = "net" | "gross";
export type Run = { count: number; from: string | null; to: string | null; r: number };
export type Drawdown = { r: number; from: string | null; to: string | null };
export type Figures = {
  trades: number; few: boolean; winRate: number | null; avgR: number | null; medianR: number | null; totalR: number; avgDays: number | null;
  worstRun: Run; drawdown: Drawdown;
};
export type Trade = {
  trigger: string; entry: string; exit: string; entryPrice: number; lower: number; upper: number | null; exitPrice: number; days: number;
  how: "gap" | "lower" | "upper" | "rule" | "time"; riskPct: number; pctGross: number; pctNet: number; rGross: number; rNet: number;
};
export type Rule = {
  id: string; name: string; kind: "trend" | "mean reversion"; trigger: string; entry: string; lower: string; source: string; available: boolean;
  note: string | null; exitApplies: boolean; net: Figures; gross: Figures; running: number; trades: Trade[]; shown: number;
};
export type ExitDef = { id: string; name: string; rule: string; meanReversionOnly: boolean };
export type CostPart = { name: string; pct: number };
export type Backtest = {
  status: "ok"; symbol: string; version: number; exit: string; exits: ExitDef[];
  coverage: { first: string; last: string; bars: number; years: number; testedFrom: string; exchangeFrom: string | null; text: string; source: string | null };
  costs: { roundTripPct: number; entryPct: number; exitPct: number; parts: { entry: CostPart[]; exit: CostPart[] }; text: string };
  fewTrades: number; prices: { t: string[]; o: number[]; h: number[]; l: number[]; c: number[] }; rules: Rule[]; computeMs: number; cached: boolean; note: string;
};

export const NOTE = "Past results of fixed rules on past prices; not a forecast or a recommendation.";
export const HOW: Record<Trade["how"], string> = {
  gap: "Opened under the lower exit level (filled at the open)", lower: "Lower exit level reached", upper: "Upper exit level reached",
  rule: "Exit rule (at the close)", time: "Time limit reached (at the close)",
};

export type SortKey = "order" | "name" | "trades" | "winRate" | "avgR" | "medianR" | "totalR" | "worstRun" | "drawdown";
export type Sort = { key: SortKey; dir: "asc" | "desc" };
export const LIST_ORDER: Sort = { key: "order", dir: "asc" };

/** The value a column sorts by; a rule with no trades sorts last whichever way. */
function value(r: Rule, b: Basis, k: SortKey, i: number): number | string | null {
  const f = r[b];
  switch (k) {
    case "order": return i;
    case "name": return r.name.toLowerCase();
    case "trades": return f.trades;
    case "winRate": return f.winRate;
    case "avgR": return f.avgR;
    case "medianR": return f.medianR;
    case "totalR": return f.trades ? f.totalR : null;
    case "worstRun": return f.trades ? f.worstRun.count : null;
    case "drawdown": return f.trades ? f.drawdown.r : null;
  }
}

/** The rules in the chosen order. The default is the rules' own list order (never by result). */
export function sortRules(rules: Rule[], b: Basis, s: Sort): Rule[] {
  const rows = rules.map((r, i) => ({ r, v: value(r, b, s.key, i), i }));
  rows.sort((x, y) => {
    if (x.v == null && y.v == null) return x.i - y.i;
    if (x.v == null) return 1;
    if (y.v == null) return -1;
    const c = x.v < y.v ? -1 : x.v > y.v ? 1 : 0;
    return (s.dir === "asc" ? c : -c) || x.i - y.i;
  });
  return rows.map((x) => x.r);
}

/** The running total of R after each trade, starting at 0 on the first trade's entry. */
export function equity(trades: Trade[], b: Basis): { d: string; r: number; t: Trade | null }[] {
  const out: { d: string; r: number; t: Trade | null }[] = trades.length ? [{ d: trades[0].entry, r: 0, t: null }] : [];
  let tot = 0;
  for (const t of trades) { tot += b === "net" ? t.rNet : t.rGross; out.push({ d: t.exit, r: Math.round(tot * 1000) / 1000, t }); }
  return out;
}

export const dmy = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
export const rr = (v: number | null | undefined, sign = true) =>
  v == null ? "—" : `${sign && v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)} R`;
export const pc = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`);
export const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "gain" : "loss");
export const resultOf = (t: Trade, b: Basis) => (b === "net" ? t.rNet : t.rGross);
export const pctOf = (t: Trade, b: Basis) => (b === "net" ? t.pctNet : t.pctGross);
