// Developer file 42 (founder, 26 Nov 2026: the "Profit and loss in charts" images "need to be revamped/improved").
// The figures behind "From revenue to net profit" and "Where each ₹100 of income goes", worked out so that every step adds up.
//
// Why: the statement's `expenses` line is TOTAL expenses, interest and depreciation included (plDefinitions: "Every cost the company reports
// for the period, including interest and depreciation"). The old charts took it as the operating costs and then took interest and
// depreciation off again, so the steps did not add up (FY26: revenue less "expenses" is ₹94,200 Cr, but the next bar, operating profit, is
// ₹1,78,949 Cr) and the ₹100 columns came to about ₹109. Operating costs are revenue less operating profit (EBITDA), which is how
// operating profit is defined. Net profit is the profit of the company's own shareholders, so a group's minority shareholders' share and its
// share of associates sit between profit after tax and net profit; that difference is its own step, so the last bar adds up too.

type N = number | null;
export type PlRows = Record<string, N[]>;

export type BridgeStep = { key: string; label: string; value: number; total?: boolean };
/** A gap smaller than this (₹ crore, or 0.1% of revenue) is rounding in the filings, not a step of its own. */
const tiny = (gap: number, rev: number) => Math.abs(gap) < Math.max(1, Math.abs(rev) * 0.001);

/** The steps from revenue to net profit for one year (column `i`), or null when a figure the walk needs is missing. */
export function bridge(rows: PlRows, i: number): BridgeStep[] | null {
  const g = (k: string) => rows[k]?.[i] ?? null;
  const rev = g("revenue"), op = g("operating_profit"), pbt = g("profit_before_tax"), np = g("net_profit");
  if (rev == null || op == null || pbt == null || np == null) return null;
  const oi = g("other_income") ?? 0, fin = Math.abs(g("finance_costs") ?? 0), dep = Math.abs(g("depreciation") ?? 0), ex = g("exceptional_items") ?? 0, tax = g("tax") ?? 0;
  const other = pbt - (op + oi - fin - dep + ex), adj = np - (pbt - tax);
  const out: BridgeStep[] = [
    { key: "revenue", label: "Revenue", value: rev, total: true },
    { key: "opcost", label: "Operating costs", value: -(rev - op) },
    { key: "op", label: "Operating profit", value: op, total: true },
  ];
  if (oi) out.push({ key: "oi", label: "Other income", value: oi });
  if (fin) out.push({ key: "fin", label: "Interest", value: -fin });
  if (dep) out.push({ key: "dep", label: "Depreciation", value: -dep });
  if (!tiny(ex, rev)) out.push({ key: "ex", label: "One-offs", value: ex });
  if (!tiny(other, rev)) out.push({ key: "other", label: "Other items", value: other });
  out.push({ key: "pbt", label: "Profit before tax", value: pbt, total: true });
  if (tax) out.push({ key: "tax", label: "Tax", value: -tax });
  if (!tiny(adj, rev)) out.push({ key: "adj", label: "Minority & other", value: adj });
  out.push({ key: "np", label: "Net profit", value: np, total: true });
  return out;
}

/** Runs the steps: where each bar starts and ends (a total starts at zero). */
export function runs(steps: BridgeStep[]) {
  let run = 0;
  return steps.map((s) => { if (s.total) { run = s.value; return { from: 0, to: s.value }; } const from = run; run += s.value; return { from, to: run }; });
}

/** True when each total equals the steps before it (to within rounding): the check the old chart failed. */
export function addsUp(steps: BridgeStep[], rev: number): boolean {
  let run = 0;
  for (const s of steps) { if (s.total) { if (run && !tiny(s.value - run, rev)) return false; run = s.value; } else run += s.value; }
  return true;
}

export type SplitPart = { key: string; label: string; value: number };
/** Where each ₹100 of income goes in one year: income is revenue plus other income (plus a one-off gain or a group's net gain from
 *  associates, when there is one); the parts are what it pays for and the net profit left, in ₹ per ₹100 of income. A loss year has no
 *  profit part and its costs come to more than ₹100 (by the loss). */
export function hundred(rows: PlRows, i: number): { income: number; parts: SplitPart[]; loss: number } | null {
  const steps = bridge(rows, i);
  if (!steps) return null;
  const v = (k: string) => steps.find((s) => s.key === k)?.value ?? 0;
  const gains = steps.filter((s) => !s.total && s.value > 0), income = v("revenue") + gains.reduce((a, s) => a + s.value, 0);
  if (income <= 0) return null;
  const per = (x: number) => (x / income) * 100, np = v("np");
  const cost = (key: string, label: string) => { const x = v(key); return x < 0 ? [{ key, label, value: per(-x) }] : []; };
  const parts: SplitPart[] = [
    ...cost("opcost", "Operating costs"), ...cost("fin", "Interest"), ...cost("dep", "Depreciation"), ...cost("ex", "One-offs"), ...cost("other", "Other items"),
    ...cost("tax", "Tax"), ...cost("adj", "Minority & other"), ...(np > 0 ? [{ key: "np", label: "Net profit", value: per(np) }] : []),
  ];
  return { income, parts, loss: np < 0 ? per(-np) : 0 };
}
