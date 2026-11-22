/** Quantities and average buy prices from a holdings PDF (22 Nov 2026).
 *  Live today (mfspread chunk): the quantity reader `A()` runs only when the first 60 lines name NSDL, CDSL or a CAS, and only knows the headings
 *  "No. of shares", "Current balance", "Quantity/Qty/Units/Holdings/Total balance" and "Free balance". A broker's own statement (Upstox, Zerodha,
 *  Groww ...) never says NSDL or CDSL, and "Current Qty" is none of those headings, so every share came in as 1 share. No path read a buy price
 *  (every add used price: 0).
 *  Here:
 *   - any statement whose table heading has an ISIN column and a quantity column is read, whoever issued it; who issued it only names the source;
 *   - the headings are the shared ones of holdingsColumns.ts ("Current Qty", "Qty.", "Free Qty" when nothing else ...), and a heading with
 *     "buy" in it ("Avg buy price", "Buy value") no longer makes the table look like a list of trades;
 *   - the average buy price is read from an average column, or worked out as Invested / quantity; "Rate", "LTP", "Closing price" never count;
 *   - a table with no ISIN column (Zerodha's Instrument / Qty. / Avg. cost) gives each line's quantity and average by the same headings
 *     (`tableAmounts`, used by findHoldingsInRows);
 *   - the same company on several lines is added up (quantity) and weighted (average), and the page says so;
 *   - round 2 (22 Nov): each line's own price ("Rate", with its "Value Date") is read too, by ISIN, for the dialog's opt-in "Use the statement's
 *     Rate as the buy price"; ETF and fund lines (ISIN INF...) keep their units and Rate, for the ETF portfolio. */
import { avgOf, combine, isinIn, isoDay, isPriceLabel, issuerOf, num, pickColumns, TRADE_HEADS, type Part } from "./holdingsColumns";
export { isinIn };
import type { PdfCell, PdfRow } from "./holdingsPdf";

const AMT = /^\(?-?\d[\d,]*(\.\d+)?\)?$/;
export const isAmt = (c: PdfCell) => AMT.test(c.t.trim().replace(/^(rs\.?|inr|₹)\s*/i, ""));

const DEPOSITORY = /\b(NSDL|CDSL|National Securities Depository|Central Depository Services)\b/i;
const CAS = /\bconsolidated\s+account\s+statement\b|\be-?CAS\b/i;
/** A statement of trades, not of holdings: these words in a heading (a price heading like "Avg buy price" is not one of them). */
const TRADES = /\b(credit|debit|opening\s*bal|closing\s*bal|transactions?|buy|sell|purchase|redemption)\b/i;
const ACCOUNT = /\b(?:BO\s*ID|Client\s*ID|DP\s*ID\s*[-/:]?\s*\w+\s*Client\s*ID)\s*[:\-]?\s*([A-Z0-9]{6,16})\b/i;
/** "as on 21-11-2026", "as of 21 Nov 2026", "to 21/11/2026", and now "Report Date Till : 21-11-2026" (Upstox). */
const DATE = /\b(?:as\s+on|as\s+of|as\s+at|to|till|upto|up\s+to)\s*[:\-]?\s*(\d{1,2})[-/\s.]([A-Za-z]{3,9}|\d{1,2})[-/\s.](\d{4})\b/gi;
const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const text = (r: PdfRow) => r.cells.map((c) => c.t).join(" ");
const mid = (c: { x0: number; x1: number }) => (c.x0 + c.x1) / 2;

function day(d: string, m: string, y: string): string | null {
  const mi = /^\d+$/.test(m) ? Number(m) - 1 : MON.indexOf(m.slice(0, 3).toLowerCase()), di = Number(d);
  return mi < 0 || mi > 11 || di < 1 || di > 31 ? null : `${di} ${MON[mi][0].toUpperCase()}${MON[mi].slice(1)} ${y}`;
}

export type HeadCol = { x0: number; x1: number; label: string };
/** A table heading, with the words that wrapped onto the line above or below put back ("Current" / "Qty"). */
export function headerCols(rows: PdfRow[], i: number): HeadCol[] {
  const r = rows[i], h = Math.max(6, r.h || 8);
  const near = (j: number) => j >= 0 && j < rows.length && rows[j].page === r.page && Math.abs(rows[j].y - r.y) <= h * 2.2
    && !rows[j].cells.some(isAmt) && !rows[j].cells.some((c) => isinIn(c.t));
  // a line above or below is part of the heading only when it looks like wrapped heading words: each of its cells sits under exactly one heading
  // cell, no two under the same one, and a lone cell is not over the first (name) column. A table's title ("Current Holdings") is not.
  const own = [...r.cells].sort((a, b) => a.x0 - b.x0);
  const over = (c: PdfCell) => own.filter((k) => c.x0 < k.x1 && c.x1 > k.x0);
  const wrapped = (j: number) => {
    const hits = rows[j].cells.map(over);
    if (hits.some((x) => x.length !== 1) || new Set(hits.map((x) => x[0])).size !== hits.length) return false;
    return hits.length >= 2 || hits[0][0] !== own[0];
  };
  const lines = [i - 1, i, i + 1].filter((j) => j === i || (near(j) && wrapped(j))).map((j) => rows[j]).sort((a, b) => b.y - a.y);
  const cols: HeadCol[] = [];
  for (const line of lines) for (const c of line.cells) {
    const hit = cols.find((k) => c.x0 < k.x1 && c.x1 > k.x0);
    if (hit) { hit.label = `${hit.label} ${c.t.trim()}`; hit.x0 = Math.min(hit.x0, c.x0); hit.x1 = Math.max(hit.x1, c.x1); }
    else cols.push({ x0: c.x0, x1: c.x1, label: c.t.trim() });
  }
  return cols.sort((a, b) => a.x0 - b.x0);
}

export type TableCols = { cols: HeadCol[]; qty: HeadCol | null; avg: HeadCol | null; cost: HeadCol | null; rate: HeadCol | null; date: HeadCol | null; trades: boolean };
/** The quantity, average and cost columns of a heading (null where there is none). */
export function tableCols(cols: HeadCol[], above = ""): TableCols {
  const pick = pickColumns(cols.map((c) => c.label));
  const trades = cols.some((c) => !isPriceLabel(c.label) && (TRADES.test(c.label) || TRADE_HEADS.test(c.label))) || /\btransactions?\b/i.test(above);
  const qty = !trades && pick.qty >= 0 ? cols[pick.qty] : null;
  return {
    cols, qty, avg: qty && pick.avg >= 0 ? cols[pick.avg] : null, cost: qty && pick.cost >= 0 ? cols[pick.cost] : null,
    rate: qty && pick.rate >= 0 ? cols[pick.rate] : null, date: qty && pick.date >= 0 ? cols[pick.date] : null, trades,
  };
}

/** The one number of a line that sits under a column (its centre is nearer that column's centre than any other's), or null. */
function under(cells: PdfCell[], t: TableCols, col: HeadCol | null): number | null {
  if (!col) return null;
  const hits = cells.filter((c) => t.cols.reduce((a, b) => (Math.abs(mid(b) - mid(c)) < Math.abs(mid(a) - mid(c)) ? b : a)) === col);
  return hits.length === 1 ? num(hits[0].t) : null;
}

/** The date under the price-date column ("Value Date"), from all the cells of a line (a date is not an amount). */
function dateUnder(cells: PdfCell[], t: TableCols): string | null {
  if (!t.date) return null;
  const hits = cells.filter((c) => t.cols.reduce((a, b) => (Math.abs(mid(b) - mid(c)) < Math.abs(mid(a) - mid(c)) ? b : a)) === t.date);
  return hits.length === 1 ? isoDay(hits[0].t) : null;
}

/** One line of a table with no ISIN column: its quantity and average (live: none; findHoldingsInRows records carry their row). */
export function tableAmounts(t: TableCols | null, row: PdfRow): { qty: number; avg?: number; how?: "column" | "worked"; rate?: number; rateOn?: string } | null {
  if (!t?.qty) return null;
  const cells = row.cells.filter(isAmt);
  const qty = under(cells, t, t.qty);
  if (!(qty != null && qty > 0)) return null;
  const p = avgOf(qty, under(cells, t, t.avg), under(cells, t, t.cost));
  const rate = under(cells, t, t.rate), on = dateUnder(row.cells, t);
  return { qty, ...(p ? { avg: p.avg, how: p.how } : {}), ...(rate != null && rate > 0 ? { rate, ...(on ? { rateOn: on } : {}) } : {}) };
}

export type StatementAmounts = {
  source: string;                       // "NSDL", "CDSL", "Upstox", "Zerodha" ... or "broker"
  asOf: string | null;
  column: string | null;                // the quantity column's heading, as printed
  price: string | null;                 // the average or cost column's heading, or null when the statement has none
  priceHow: "column" | "worked" | null; // read, or worked out as cost / quantity
  byIsin: Map<string, { qty: number; accounts: number; avg?: number; lines: number; rate?: number; rateOn?: string }>;
  rate: string | null;                  // the line-price column's heading ("Rate"), or null
  rateOn: string | null;                // the date of most lines' price ("2026-11-20", from "Value Date"), else the statement's date
  noQty: string[];                      // ISINs whose quantity could not be read
  zero: string[];                       // ISINs with a balance of 0
};

/** Quantities (added up across demat accounts) and average prices by ISIN, from every table headed ISIN + a quantity column. Port of live `A()`. */
export function statementAmounts(rows: PdfRow[]): StatementAmounts | null {
  const head = rows.slice(0, 60).map(text).join("\n"), all = rows.map(text).join("\n");
  const dep = DEPOSITORY.exec(head) || (CAS.test(head) ? DEPOSITORY.exec(all) : null);
  // a CAS is named after its depository; a broker's statement after the broker, even when it names its depository (Zerodha: "DP: CDSL")
  const broker = issuerOf(head, true);
  const source = CAS.test(head) || !broker ? (dep ? (/nsdl|national/i.test(dep[1]) ? "NSDL" : "CDSL") : broker ?? (CAS.test(head) ? "depository" : "broker")) : broker;
  let asOf: string | null = null;
  for (const m of head.matchAll(DATE)) asOf = day(m[1], m[2], m[3]) ?? asOf;

  const isinAt = rows.map((r) => r.cells.map((c) => isinIn(c.t)).find(Boolean) ?? null);
  const isHead = (r: PdfRow) => !r.cells.some(isAmt) && r.cells.some((c) => /^isin\b/i.test(c.t.trim()) && !isinIn(c.t));
  const taken = new Set<number>();
  /** A line's numbers; when a line has none (a wrapped name), the numbers on the line just below or above it. */
  const numbersOf = (i: number) => {
    const own = rows[i].cells.filter(isAmt);
    if (own.length) return own;
    const h = Math.max(6, rows[i].h || 8);
    for (const j of [i + 1, i - 1, i + 2]) {
      if (j < 0 || j >= rows.length || taken.has(j) || isinAt[j] || rows[j].page !== rows[i].page || Math.abs(rows[j].y - rows[i].y) > h * 2.6) continue;
      const c = rows[j].cells.filter(isAmt);
      if (c.length && c.length === rows[j].cells.length) { taken.add(j); return c; }
    }
    return [];
  };

  const parts = new Map<string, Map<string, Part[]>>();
  const rates = new Map<string, { rate: number; on: string | null }>(), dates = new Map<string, number>();
  const noQty: string[] = [], zero = new Set<string>(), hows = new Set<"column" | "worked">();
  let account = "", t: TableCols | null = null, column: string | null = null, price: string | null = null, rateCol: string | null = null, anyQtyTable = false;
  rows.forEach((row, i) => {
    const acc = ACCOUNT.exec(text(row)); if (acc) account = acc[1];
    if (isHead(row)) {
      const above = [rows[i - 1], rows[i - 2]].filter((r) => r && r.page === row.page && !r.cells.some(isAmt)).map(text).join(" ");
      t = tableCols(headerCols(rows, i), above);
      if (t.qty) { anyQtyTable = true; column ??= t.qty.label.replace(/\s+/g, " "); if (!price && (t.avg || t.cost)) price = (t.avg || t.cost)!.label.replace(/\s+/g, " "); if (!rateCol && t.rate) rateCol = t.rate.label.replace(/\s+/g, " "); }
      return;
    }
    const isin = isinAt[i];
    if (!isin || !t?.qty || !isin.startsWith("IN")) return;
    const cells = numbersOf(i);
    const q = under(cells, t, t.qty);
    if (q == null) { if (!noQty.includes(isin)) noQty.push(isin); return; }
    if (!(q > 0)) { zero.add(isin); return; }
    const p = avgOf(q, under(cells, t, t.avg), under(cells, t, t.cost));
    if (p) hows.add(p.how);
    const rt = under(cells, t, t.rate);
    if (rt != null && rt > 0 && !rates.has(isin)) {
      const on = dateUnder(rows[i].cells, t);
      rates.set(isin, { rate: rt, on }); if (on) dates.set(on, (dates.get(on) ?? 0) + 1);
    }
    const byAcc = parts.get(isin) ?? new Map<string, Part[]>();
    const key = account || `line ${i}`;
    // one account lists an ISIN once; a second line for it in the same account (a lock-in lot) is added to it
    byAcc.set(key, [...(byAcc.get(key) || []), { qty: q, ...(p ? { avg: p.avg } : {}) }]);
    parts.set(isin, byAcc);
  });
  if (!anyQtyTable) return null;
  const byIsin = new Map<string, { qty: number; accounts: number; avg?: number; lines: number; rate?: number; rateOn?: string }>();
  const asOfIso = asOf ? isoDay(asOf) : null;
  parts.forEach((acc, isin) => {
    const c = combine([...acc.values()].flat()), r = rates.get(isin);
    const on = r?.on ?? asOfIso;
    byIsin.set(isin, { qty: c.qty, accounts: acc.size, lines: c.parts, ...(c.avg != null ? { avg: c.avg } : {}), ...(r ? { rate: r.rate, ...(on ? { rateOn: on } : {}) } : {}) });
  });
  const rateOn = [...dates.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (rates.size ? asOfIso : null);
  return {
    source, asOf, column, price: hows.size ? price : null, priceHow: hows.has("column") ? "column" : hows.has("worked") ? "worked" : null,
    rate: rates.size ? rateCol : null, rateOn,
    byIsin, noQty: noQty.filter((x) => !byIsin.has(x)), zero: [...zero].filter((x) => !byIsin.has(x)),
  };
}
