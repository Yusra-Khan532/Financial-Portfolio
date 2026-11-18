/** Task #191: quantities from a depository statement (NSDL or CDSL e-CAS, or a depository "statement of holdings").
 *  One CAS lists every demat account of the investor, at every broker (Zerodha, Groww, Upstox, Angel One ...), so it is the free way to bring in
 *  everything at once. The companies themselves are found by the usual PDF reading (lib/holdingsPdf, matched by ISIN, task #128); this file only reads
 *  how many shares of each ISIN the statement shows, so the Equity portfolio can take the real quantity instead of asking for it.
 *  Accuracy first:
 *   - a quantity is read only from a holdings table whose heading row has an ISIN column AND a balance column ("No. of Shares", "Current Bal",
 *     "Quantity", "Units" or "Free Bal", in that order of preference: the current balance includes pledged and locked-in shares, which are still owned);
 *   - each number of a line is given to the heading it sits under (the nearest column by position), so a price or a value is never read as a quantity;
 *   - a table headed as transactions (credit, debit, opening or closing balance) is never read;
 *   - an ISIN held in several demat accounts is added up, and the number of accounts is kept so the page can say so;
 *   - a line whose quantity cannot be placed gets none (the page then leaves the quantity to the member), never a guess.
 *  Like the rest of the PDF reading, it runs in the browser: the statement never leaves the device. */
import type { PdfCell, PdfRow } from "./holdingsPdf";
import { isinIn } from "./isin";

export type CasQty = { qty: number; accounts: number };
export type CasRead = {
  /** "NSDL", "CDSL" or "depository" (the statement does not say which). */
  source: string;
  /** The date the balances are "as on" (the statement's end date), as "31 Mar 2026"; null when the statement does not show one. */
  asOf: string | null;
  /** The heading the quantities were read from, as the statement writes it ("Current Bal"). */
  column: string | null;
  /** Shares held, by ISIN (zero balances are left out). */
  byIsin: Map<string, CasQty>;
  /** ISINs in a holdings table whose quantity could not be placed under the balance column. */
  noQty: string[];
  /** ISINs whose balance is 0 in every account where they are listed (sold out): they are not holdings. */
  zero: string[];
};

const NUM = /^\(?-?\d[\d,]*(\.\d+)?\)?$/;
const isNumCell = (c: PdfCell) => NUM.test(c.t.trim().replace(/^(rs\.?|inr|₹)\s*/i, ""));
const toNum = (s: string) => Number(s.trim().replace(/[,()]/g, ""));

/** A statement from a depository: its title names NSDL or CDSL, or it calls itself a Consolidated Account Statement. */
const DEPOSITORY = /\b(NSDL|CDSL|National Securities Depository|Central Depository Services)\b/i;
const CAS_TITLE = /\bconsolidated\s+account\s+statement\b|\be-?CAS\b|\bstatement\s+of\s+holdings?\b|\bholding\s+statement\b/i;

/** The balance columns, best first. */
const QTY_HEADS: { rx: RegExp; rank: number }[] = [
  { rx: /\bno\.?\s*of\s*(shares|securities)\b/i, rank: 0 },
  { rx: /\bcurrent\s*bal(ance)?\b/i, rank: 1 },
  { rx: /^(quantity|qty\.?|units?|holdings?|total\s*bal(ance)?)$/i, rank: 2 },
  { rx: /\bfree\s*bal(ance)?\b/i, rank: 3 },
];
const NOT_HOLDINGS = /\b(credit|debit|opening\s*bal|closing\s*bal|transactions?|buy|sell|purchase|redemption)\b/i;
const ACCOUNT = /\b(?:BO\s*ID|Client\s*ID|DP\s*ID\s*[-/:]?\s*\w+\s*Client\s*ID)\s*[:\-]?\s*([A-Z0-9]{6,16})\b/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DATE = /\b(?:as\s+on|as\s+of|as\s+at|to)\s+(\d{1,2})[-/\s]([A-Za-z]{3,9}|\d{1,2})[-/\s](\d{4})\b/gi;

const text = (r: PdfRow) => r.cells.map((c) => c.t).join(" ");
const center = (c: { x0: number; x1: number }) => (c.x0 + c.x1) / 2;

/** "31-Mar-2026", "31/03/2026" to "31 Mar 2026"; null when it is not a real date. */
function day(d: string, m: string, y: string): string | null {
  const mi = /^\d+$/.test(m) ? Number(m) - 1 : MONTHS.indexOf(m.slice(0, 3).toLowerCase());
  const dd = Number(d);
  if (mi < 0 || mi > 11 || dd < 1 || dd > 31) return null;
  return `${dd} ${MONTHS[mi][0].toUpperCase()}${MONTHS[mi].slice(1)} ${y}`;
}

type Col = { x0: number; x1: number; label: string };

/** The columns of a heading row, with a heading that wrapped onto the line below or above it ("Current" / "Bal.") joined by position. */
function headingColumns(rows: PdfRow[], i: number): Col[] {
  const r = rows[i], h = Math.max(6, r.h || 8);
  const near = (j: number) => j >= 0 && j < rows.length && rows[j].page === r.page && Math.abs(rows[j].y - r.y) <= h * 2.2
    && !rows[j].cells.some(isNumCell) && !rows[j].cells.some((c) => isinIn(c.t));
  const block = [i - 1, i, i + 1].filter((j) => j === i || near(j)).map((j) => rows[j]).sort((a, b) => b.y - a.y);
  const cols: Col[] = [];
  for (const row of block) for (const c of row.cells) {
    const hit = cols.find((k) => c.x0 < k.x1 && c.x1 > k.x0);
    if (hit) { hit.label = `${hit.label} ${c.t.trim()}`; hit.x0 = Math.min(hit.x0, c.x0); hit.x1 = Math.max(hit.x1, c.x1); }
    else cols.push({ x0: c.x0, x1: c.x1, label: c.t.trim() });
  }
  return cols.sort((a, b) => a.x0 - b.x0);
}

const isHeading = (r: PdfRow) => !r.cells.some(isNumCell) && r.cells.some((c) => /^isin\b/i.test(c.t.trim()) && !isinIn(c.t));

/** The quantity of each ISIN in a depository statement's rows, or null when the rows are not a depository statement. */
export function casQuantities(rows: PdfRow[]): CasRead | null {
  const top = rows.slice(0, 60).map(text).join(" \n ");
  const all = rows.map(text).join(" \n ");
  if (!DEPOSITORY.test(top) && !CAS_TITLE.test(top)) return null;
  const dep = DEPOSITORY.exec(top) || DEPOSITORY.exec(all);
  const source = dep ? (/nsdl|national/i.test(dep[1]) ? "NSDL" : "CDSL") : "depository";

  let asOf: string | null = null;
  for (const m of top.matchAll(DATE)) asOf = day(m[1], m[2], m[3]) ?? asOf;     // the last one: "for the period 01-Mar-2026 to 31-Mar-2026"

  const byIsin = new Map<string, Map<string, number>>();     // ISIN -> demat account -> balance (one balance per account: a second listing in the same account is not added again)
  const noQty: string[] = [], zeroSeen = new Set<string>();
  let cols: Col[] | null = null, qtyCol: Col | null = null, column: string | null = null, account = "";

  // Records: an ISIN line, and the number-only lines next to it that belong to it (a wrapped name can push the figures one line down).
  const isinOf = rows.map((r) => r.cells.map((c) => isinIn(c.t)).find(Boolean) ?? null);
  const claimed = new Set<number>();
  const figuresFor = (i: number): PdfCell[] => {
    const own = rows[i].cells.filter(isNumCell);
    if (own.length) return own;
    const h = Math.max(6, rows[i].h || 8);
    for (const j of [i + 1, i - 1, i + 2]) {
      if (j < 0 || j >= rows.length || claimed.has(j) || isinOf[j] || rows[j].page !== rows[i].page || Math.abs(rows[j].y - rows[i].y) > h * 2.6) continue;
      const nums = rows[j].cells.filter(isNumCell);
      if (nums.length && nums.length === rows[j].cells.length) { claimed.add(j); return nums; }
    }
    return [];
  };

  rows.forEach((r, i) => {
    const acc = ACCOUNT.exec(text(r));
    if (acc) account = acc[1];
    if (isHeading(r)) {
      const c = headingColumns(rows, i);
      const above = [rows[i - 1], rows[i - 2]].filter((x) => x && x.page === r.page && !x.cells.some(isNumCell)).map(text).join(" ");
      const best = c.map((k) => ({ k, rank: QTY_HEADS.find((q) => q.rx.test(k.label))?.rank ?? 99 })).sort((a, b) => a.rank - b.rank)[0];
      const transactions = c.some((k) => NOT_HOLDINGS.test(k.label)) || /\btransactions?\b/i.test(above);
      cols = c; qtyCol = !transactions && best && best.rank < 99 ? best.k : null;
      if (qtyCol && !column) column = qtyCol.label.replace(/\s+/g, " ");
      return;
    }
    const isin = isinOf[i];
    if (!isin || !cols || !qtyCol || !isin.startsWith("IN")) return;
    const figures = figuresFor(i);
    // every figure goes to the heading whose centre is nearest; the one under the balance heading is the quantity
    const mine = figures.filter((f) => {
      const near = cols!.reduce((b, k) => (Math.abs(center(k) - center(f)) < Math.abs(center(b) - center(f)) ? k : b));
      return near === qtyCol;
    });
    if (mine.length !== 1) { if (!noQty.includes(isin)) noQty.push(isin); return; }
    const q = toNum(mine[0].t);
    if (!(q > 0)) { zeroSeen.add(isin); return; }          // a zero balance: nothing held in this account
    const per = byIsin.get(isin) ?? new Map<string, number>();
    per.set(account || `line ${i}`, q);
    byIsin.set(isin, per);
  });

  const out = new Map<string, CasQty>();
  byIsin.forEach((per, k) => out.set(k, { qty: Math.round([...per.values()].reduce((a, b) => a + b, 0) * 1000) / 1000, accounts: per.size }));
  return { source, asOf, column, byIsin: out, noQty: noQty.filter((i) => !out.has(i)), zero: [...zeroSeen].filter((i) => !out.has(i)) };
}
