/** Which column of a holdings statement holds the quantity, and which the average buy price (22 Nov 2026).
 *  Shared by the PDF reader (holdingsAmounts.ts) and the spreadsheet reader (holdingsFile.ts), so a broker's file is read the same way
 *  whichever format it is saved in. Accuracy first:
 *   - the quantity is the shares held in total ("Current Qty", "Quantity", "No. of shares"); a free, pledged, locked or frozen part is used only
 *     when nothing else is there (free), or never (pledged, locked, frozen, remat, lent, collateral, T+1);
 *   - the average price is only a column headed as an average or a buy price ("Avg. cost", "Avg buy price", "Average Cost Price", "Buy Avg",
 *     "Avg Rate", "Buy price"). "Rate", "Price", "LTP", "CMP", "Closing price", "Market rate" and every value column are today's price, not what
 *     was paid, so they are never taken as the average;
 *   - with no average column, an "Invested" / "Buy value" / "Total cost" column divided by the quantity gives it (marked as worked out);
 *   - nothing is guessed: a column that cannot be told apart is left out and the page says so;
 *   - a "Rate" / "LTP" / "Closing price" column is read as the line's price (`rate`), with its date when the line has one ("Value Date"). It is
 *     used as the buy price only when the member ticks "Use the statement's Rate as the buy price" in the import dialog (22 Nov, round 2). */

export type ColumnPick = {
  qty: number; qtyLabel: string; qtyRank: number;
  avg: number; avgLabel: string;
  cost: number; costLabel: string;
  rate: number; rateLabel: string;     // the line's own price on a date (Rate, LTP, Closing price): not the buy price
  date: number;                        // the date of that price ("Value Date"), when the file has one
};

/** A heading as compared: lower case, one space, no currency marks or trailing dots ("Avg. price (₹)" -> "avg price"). */
export const normLabel = (s: string) =>
  s.toLowerCase().replace(/\((₹|rs\.?|inr|in ₹|in rs\.?)\)|₹|\brs\.?(?=\s|$)|\binr\b/g, " ").replace(/[._:/\\*]+/g, " ").replace(/\s+/g, " ").trim();

/** Quantity headings, best first. Rank 0-2 are the shares held in total; 3-4 only a part of them, used when nothing better is there. */
export const QTY_RANKS: { rx: RegExp; rank: number }[] = [
  { rx: /\bno ?of ?(shares|securities|units)\b/, rank: 0 },
  { rx: /\bcurrent ?(bal(ance)?|qty|quantity|holdings?)\b/, rank: 1 },
  { rx: /^(total ?|net ?|holding ?|balance ?|closing ?)?(quantity|qty|units?|holdings?|shares)( ?held)?$/, rank: 2 },
  { rx: /^(total|net) ?bal(ance)?$/, rank: 2 },
  { rx: /^(quantity|qty) ?(held|owned)$/, rank: 2 },
  { rx: /\bfree ?(bal(ance)?|qty|quantity)\b/, rank: 3 },
  { rx: /^(quantity|qty) ?(available|free)$/, rank: 3 },
  { rx: /\b(available|saleable|sellable|settled) ?(qty|quantity|bal(ance)?)\b/, rank: 4 },
];
/** A part of the holding, or a trade: never the quantity held. */
const QTY_PART = /\b(pledged?|locked|lock ?in|freeze|frozen|remat|demat ?pending|pending|lent|collateral|t ?\+ ?\d|blocked|earmark\w*|margin|sold|bought|buy|sell|purchased?)\b/;

/** Headings that are an average price or a buy price. */
const AVG_RX = [
  /\b(avg|average|wac|weighted avg|weighted average)\b/,
  /^(buy|purchase|cost|acquisition|entry) ?(price|rate)$/,
  /\bcost ?per ?(share|unit)\b/,
];
/** Today's price, a total, a change or a ratio: never the average. */
const NOT_AVG = /\b(ltp|cmp|market|mkt|closing|close|current|cur|last|prev|previous|nav|day|today|value|val|amount|amt|p ?& ?l|pnl|gain|loss|returns?|chg|change|%|sell|sale|sold|realised|realized|unrealised|unrealized|qty|quantity)\b/;
/** What was paid in total for the shares held. */
const COST_RX = /^(invested|investment|buy value|cost value|value at cost|total cost|purchase value|acquisition cost|amount invested|invested value|invested amount|investment value|holding cost|cost of acquisition|total invested|total investment|buy amount|purchase amount)$/;

export const qtyRank = (label: string): number => {
  const t = normLabel(label);
  if (!t || QTY_PART.test(t) && !/^(current|total|net|no ?of)\b/.test(t)) return 99;
  return QTY_RANKS.find((r) => r.rx.test(t))?.rank ?? 99;
};
export const isAvgLabel = (label: string) => { const t = normLabel(label); return !!t && AVG_RX.some((r) => r.test(t)) && !NOT_AVG.test(t); };
export const isCostLabel = (label: string) => COST_RX.test(normLabel(label));
/** The line's own price ("Rate", "LTP", "CMP", "Closing price", "Market price", "NAV"): what the statement values it at on its date. */
export const RATE_HEAD = /^(rate|price|ltp|cmp|closing( price| rate)?|close|market (price|rate)|mkt (price|rate)|current price|last price|nav)\b/i;
export const isRateLabel = (label: string) => { const t = normLabel(label); return !!t && RATE_HEAD.test(t) && !AVG_RX.some((r) => r.test(t)) && !COST_RX.test(t) && !/\b(value|val|amount|amt)\b/.test(t); };
/** The date of that price ("Value Date", "Price date", "As on"). */
const DATE_HEAD = /^(value|price|rate|valuation|nav|closing|holding) ?date$|^as ?(on|of)( date)?$/;
export const isDateLabel = (label: string) => DATE_HEAD.test(normLabel(label));
/** "20-11-2026", "20/11/2026", "20 Nov 2026", "2026-11-20" -> "2026-11-20" (null when it is not a date). */
const MONS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function isoDay(s: string | null | undefined): string | null {
  const t = String(s ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/. ]([A-Za-z]{3,9}|\d{1,2})[-/. ](\d{4})$/.exec(t);
  if (!m) return null;
  const mo = /^\d+$/.test(m[2]) ? +m[2] : MONS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
  return ok(+m[3], mo, +m[1]);
  function ok(y: number, mo: number, d: number) { return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null; }
}
/** "2026-11-20" -> "20 Nov 2026" (for the page's wording). */
export const dayLabel = (iso: string | null | undefined) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? ""); return m ? `${+m[3]} ${MONS[+m[2] - 1][0].toUpperCase()}${MONS[+m[2] - 1].slice(1)} ${m[1]}` : null; };
/** A heading that names a price or what was paid: "buy" in it does not make the table a list of trades. */
export const isPriceLabel = (label: string) => isAvgLabel(label) || isCostLabel(label);

/** The quantity, average and total-cost columns among one table's headings (-1 when there is none). */
export function pickColumns(labels: string[]): ColumnPick {
  const out: ColumnPick = { qty: -1, qtyLabel: "", qtyRank: 99, avg: -1, avgLabel: "", cost: -1, costLabel: "", rate: -1, rateLabel: "", date: -1 };
  labels.forEach((raw, i) => {
    const l = raw.replace(/\s+/g, " ").trim();
    if (!l) return;
    const r = qtyRank(l);
    if (r < out.qtyRank) { out.qty = i; out.qtyLabel = l; out.qtyRank = r; }
    if (out.avg < 0 && isAvgLabel(l)) { out.avg = i; out.avgLabel = l; }
    if (out.cost < 0 && isCostLabel(l)) { out.cost = i; out.costLabel = l; }
    if (out.rate < 0 && isRateLabel(l)) { out.rate = i; out.rateLabel = l; }
    if (out.date < 0 && isDateLabel(l)) out.date = i;
  });
  if (out.avg === out.qty) { out.avg = -1; out.avgLabel = ""; }
  return out;
}

/** "1,64,000.50", "₹ 1,450", "15.0", "(3.5)" -> a number; "-", "", "NA", a date or a word -> null. */
export function num(s: string | number | null | undefined): number | null {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const t = String(s ?? "").trim().replace(/^(rs\.?|inr|₹)\s*/i, "").replace(/\s*(cr|dr)\.?$/i, "").replace(/\s+/g, "");
  if (!/^\(?[-+]?\d[\d,]*(\.\d+)?\)?$/.test(t)) return null;
  const v = Number(t.replace(/[(),]/g, ""));
  return Number.isFinite(v) ? (/^\(/.test(t) ? -v : v) : null;
}

/** The average buy price of one line: the average column, else total cost / quantity (rounded to the paisa). */
export function avgOf(qty: number | null, avg: number | null, cost: number | null): { avg: number; how: "column" | "worked" } | null {
  if (avg != null && avg > 0 && avg < 1e7) return { avg, how: "column" };
  if (cost != null && cost > 0 && qty != null && qty > 0) { const a = Math.round((cost / qty) * 100) / 100; if (a > 0 && a < 1e7) return { avg: a, how: "worked" }; }
  return null;
}

/** One company's lines added up (two demat accounts, or the NSE and BSE lines of one share): quantities add, the average is weighted by quantity,
 *  and it is kept only when every line had one (a part with no price would make the average wrong). */
export type Part = { qty: number; avg?: number };
export function combine(parts: Part[]): { qty: number; avg?: number; parts: number } {
  const qty = Math.round(parts.reduce((s, p) => s + p.qty, 0) * 1e3) / 1e3;
  const priced = parts.every((p) => p.avg != null && p.avg > 0);
  const avg = priced && qty > 0 ? Math.round((parts.reduce((s, p) => s + p.qty * (p.avg as number), 0) / qty) * 100) / 100 : undefined;
  return { qty, ...(avg != null ? { avg } : {}), parts: parts.length };
}

/** Who issued a statement, from its first lines (only to say where the numbers came from). */
const ISSUERS: [RegExp, string][] = [
  [/\b(NSDL|National Securities Depository)\b/i, "NSDL"], [/\b(CDSL|Central Depository Services)\b/i, "CDSL"],
  [/\b(upstox|rksv)\b/i, "Upstox"], [/\bzerodha\b/i, "Zerodha"], [/\b(groww|nextbillion)\b/i, "Groww"], [/\bangel ?(one|broking)\b/i, "Angel One"],
  [/\b(icici ?securities|icici ?direct)\b/i, "ICICI Direct"], [/\bhdfc ?securities\b/i, "HDFC Securities"], [/\bkotak ?securities\b/i, "Kotak Securities"],
  [/\bmotilal\b/i, "Motilal Oswal"], [/\bsharekhan\b/i, "Sharekhan"], [/\b5 ?paisa\b/i, "5paisa"], [/\bdhan\b/i, "Dhan"], [/\bpaytm money\b/i, "Paytm Money"],
  [/\baxis ?(securities|direct)\b/i, "Axis Direct"], [/\bsbi ?cap\b/i, "SBI Securities"], [/\bfyers\b/i, "Fyers"],
];
export function issuerOf(text: string, brokersOnly = false): string | null {
  for (const [rx, n] of ISSUERS) if (!(brokersOnly && (n === "NSDL" || n === "CDSL")) && rx.test(text)) return n;
  return null;
}

/** A heading of a list of trades or orders (a tradebook, a contract note): such a file has no holdings quantities. */
export const TRADE_HEADS = /\b(trade|order|transaction|contract)s? ?(type|date|time|id|no|number|side)\b|^(buy ?\/ ?sell|b ?\/ ?s|side|txn type)$/i;

/** The ISIN written in a text, and the check-digit test: the site's own (lib/isin.ts), so the two readers never disagree. */
export { isinIn, isinValid as isinOk } from "./isin";
