import type { Range } from "./proscreen";

/** The Stock screener's "Type rules" box: `pe < 20 and roe > 15`, `debt < 0.5, yield > 2`. Short names or a figure's own key, with < or >.
 *  A second rule on the same figure fills the other end. A line it cannot read gets a plain message; longer logic goes to the Query builder. */
export const SHORT: Record<string, string> = {
  pe: "pe", pb: "pb", roe: "roe", roce: "roce", debt: "debt_to_equity", yield: "dividend_yield", mcap: "market_cap", price: "price", sales3y: "sales_cagr_3y", profit3y: "profit_cagr_3y",
  "1d": "ret_1d", "1m": "ret_1m", "3m": "ret_3m", "6m": "ret_6m", "1y": "ret_1y", high: "pct_from_high", iq: "overall",
};
export type Parsed = { ranges: Record<string, Range>; errors: string[] };

export function parseRules(text: string, known: (key: string) => boolean): Parsed {
  const ranges: Record<string, Range> = {}, errors: string[] = [];
  const parts = text.split(/\s*(?:,|;|\band\b|\n)\s*/i).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const m = /^([a-z0-9_]+)\s*(<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)$/i.exec(part);
    if (!m) { errors.push(`I could not read “${part}”. Write a figure, then < or >, then a number, for example pe < 20.`); continue; }
    const name = m[1].toLowerCase(), key = SHORT[name] ?? name, n = Number(m[3]);
    if (!known(key)) { errors.push(`“${m[1]}” is not a figure I know. Try pe, pb, roe, roce, debt, yield, mcap, price, sales3y, profit3y, 1d, 1m, 3m, 6m, 1y, high or iq, or a filter's full name.`); continue; }
    const r = ranges[key] ?? (ranges[key] = {});
    if (m[2].startsWith("<")) r.max = r.max == null ? n : Math.min(r.max, n); else r.min = r.min == null ? n : Math.max(r.min, n);
  }
  return { ranges, errors };
}
