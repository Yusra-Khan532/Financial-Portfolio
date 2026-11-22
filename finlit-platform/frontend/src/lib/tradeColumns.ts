// Developer file 31 (founder, 22 Nov 2026: the "Add holdings" dialog he showed reads a Buy date column and a side column, Buy or Sell): what a broker
// file says about each buy and sale. Two kinds of file:
//   - a holdings file with a buy date on each line ("Buy date", "Purchase date", "Date of purchase"): each line is a buy on that date;
//   - a tradebook ("Trade type" / "Buy/Sell" / "Side" / "Action" with BUY and SELL, a trade date, the quantity and the price): each line is a buy or
//     a sale, and what is left of each share is worked out first in, first out, as the page's ledger (lib/ledger) does.
// The side column is found by what is in it (nearly every line BUY or SELL), not only by its heading, so a broker's own name for it does not matter.
// Dates are read day first, as Indian brokers write them; an Excel date cell is already "2024-03-15" (lib/holdingsFile). Nothing is guessed: a line
// with no readable side is not a trade, and a date that cannot be read stays empty and is said so. Information only, not investment advice.
import { isAvgLabel, isCostLabel, normLabel, num } from "./holdingsColumns";

export type Side = "buy" | "sell";
/** One buy or sale from a file. price null: the file gave none; date null: none that could be read; line: the line in the file. */
export type Trade = { side: Side; qty: number; price: number | null; date: string | null; line: number };

/** "BUY", "B", "Bought", "Purchase" -> buy; "SELL", "S", "Sold", "Sale" -> sell; anything else -> null. */
export function sideOf(v: string | null | undefined): Side | null {
  const t = String(v ?? "").trim().toLowerCase().replace(/[.\s]+$/, "");
  if (/^(b|buy|bought|purchase|purchased|buy order)$/.test(t)) return "buy";
  if (/^(s|sell|sold|sale|sell order)$/.test(t)) return "sell";
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** A day from a cell, day first (India), as the MF server's parse_date reads it: 15-03-2024, 15/03/2024, 15.03.24, 15 Mar 2024, 15-Mar-24,
 *  2024-03-15, 2024/03/15, with a time of day after it dropped ("15-03-2024 10:15 AM", "2024-03-15T09:15:02"). A day after `today` or before 1980 is
 *  not taken. -> "2024-03-15" or null. */
export function dayOf(v: string | null | undefined, today = new Date()): string | null {
  let s = String(v ?? "").trim();
  if (!s) return null;
  s = s.replace(/[T\s]+\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(\s?[ap]\.?m\.?)?(\s?(z|[+-]\d{2}:?\d{2}))?$/i, "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  let y: number, mo: number, d: number, m: RegExpExecArray | null;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s))) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/. ]+(\d{2}|\d{4})$/.exec(s)) && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) [d, mo, y] = [+m[1], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[3]];
  else if ((m = /^([A-Za-z]{3,9})[-/. ](\d{1,2})[-/. ]+(\d{4})$/.exec(s)) && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) [d, mo, y] = [+m[2], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[3]];
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s))) [d, mo, y] = [+m[1], +m[2], +m[3]];
  else return null;
  if (y < 100) y += y <= today.getFullYear() % 100 ? 2000 : 1900;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const now = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return iso < "1980-01-01" || iso > now ? null : iso;
}

/** A heading for the side of a trade. Used to prefer a column; the column is taken only when its cells are BUY / SELL. */
const SIDE_HEAD = /^((trade|transaction|txn|trans|order|deal) ?(type|side)|buy ?\/ ?sell|b ?\/ ?s|side|action|type|transaction|buy or sell)$/;
/** A heading for the day of a buy or a trade (not a price's date, "Value date" or "As on"). */
const DAY_HEAD = /^((buy|purchase|purchased|acquisition|acquired|trade|transaction|txn|trans|order|deal|execution|exec|allotment|investment|invested) ?(date|dt|day|on)( ?(and|&) ?time)?|date( of (purchase|acquisition|buy|buying|trade|transaction|investment|allotment))?|bought on|(trade|order|execution) ?time|date ?(and|&) ?time|time)$/;
/** The price of a trade: its own price column ("Price", "Trade price", "Rate", "Execution price", "Avg. price"), else its value ÷ quantity. */
const TRADE_PRICE = /^((trade|traded|execution|exec|exe|order|deal|net|avg|average|buy|sell|transaction|txn) ?)?(price|rate)( per (share|unit))?$/;
const TRADE_VALUE = /^((trade|traded|transaction|txn|order|deal|net|gross|total) ?)?(value|amount|amt|consideration)$/;

export type TradeColumns = { side: number; sideLabel: string; day: number; dayLabel: string; price: number; priceLabel: string; value: number; valueLabel: string };

/** The side, day, price and value columns of a table (-1 when there is none). `body`: the table's lines under the heading. */
export function tradeColumns(heads: string[], body: string[][]): TradeColumns {
  const out: TradeColumns = { side: -1, sideLabel: "", day: -1, dayLabel: "", price: -1, priceLabel: "", value: -1, valueLabel: "" };
  const width = Math.max(heads.length, ...body.map((r) => r.length), 0);
  const filled = (c: number) => body.map((r) => (r[c] ?? "").trim()).filter(Boolean);
  const share = (c: number, ok: (v: string) => boolean) => { const v = filled(c); return v.length ? v.filter(ok).length / v.length : 0; };
  // side: a column whose cells are nearly all BUY / SELL (a headed one first)
  const sides = Array.from({ length: width }, (_, c) => c).filter((c) => filled(c).length >= 1 && share(c, (v) => sideOf(v) != null) >= 0.9);
  const s = sides.find((c) => SIDE_HEAD.test(normLabel(heads[c] ?? ""))) ?? sides[0];
  if (s != null) { out.side = s; out.sideLabel = (heads[s] ?? "").trim(); }
  // day: a column headed as a buy or trade day whose cells read as days
  for (let c = 0; c < width; c++) {
    if (c === out.side || !DAY_HEAD.test(normLabel(heads[c] ?? ""))) continue;
    if (share(c, (v) => dayOf(v) != null) >= 0.6) { out.day = c; out.dayLabel = (heads[c] ?? "").trim(); break; }
  }
  heads.forEach((raw, c) => {
    const l = normLabel(raw ?? "");
    if (!l || c === out.side || c === out.day) return;
    if (out.price < 0 && (TRADE_PRICE.test(l) || isAvgLabel(raw))) { out.price = c; out.priceLabel = raw.trim(); }
    if (out.value < 0 && (TRADE_VALUE.test(l) || isCostLabel(raw))) { out.value = c; out.valueLabel = raw.trim(); }
  });
  return out;
}

/** The price of one trade: its price column, else value ÷ quantity (to the paisa); null when neither is there. */
export function tradePrice(r: string[], qty: number, tc: TradeColumns): number | null {
  const p = tc.price >= 0 ? num(r[tc.price]) : null;
  if (p != null && p > 0 && p < 1e7) return p;
  const v = tc.value >= 0 ? num(r[tc.value]) : null;
  if (v != null && v !== 0 && qty > 0) { const a = Math.round((Math.abs(v) / qty) * 100) / 100; if (a > 0 && a < 1e7) return a; }
  return null;
}

/** What is left of one share after its trades, first in, first out, the page ledger's rule (lib/ledger): buys and sales in date order (buys first on
 *  the same day, undated ones last, in file order). qty: what is left; avg: the average price of what is left (null when a buy left open has no price);
 *  over: sales larger than what was held then (the earlier buys are not in the file), left out of the figures as the ledger leaves them out. */
export function leftAfter(trades: Trade[]): { qty: number; avg: number | null; over: Trade[] } {
  const key = (d: string | null) => d ?? "9999-12-31";
  const ev = trades.map((t, i) => ({ t, i })).sort((a, b) => (key(a.t.date) < key(b.t.date) ? -1 : key(a.t.date) > key(b.t.date) ? 1 : (a.t.side === "buy" ? 0 : 1) - (b.t.side === "buy" ? 0 : 1) || a.i - b.i));
  const open: { qty: number; price: number | null }[] = [], over: Trade[] = [];
  for (const { t } of ev) {
    if (t.side === "buy") { open.push({ qty: t.qty, price: t.price }); continue; }
    const held = open.reduce((a, b) => a + b.qty, 0);
    if (t.qty > held + 1e-9) { over.push(t); continue; }
    let need = t.qty;
    while (need > 1e-9 && open.length) { const b = open[0], u = Math.min(b.qty, need); b.qty -= u; need -= u; if (b.qty <= 1e-9) open.shift(); }
  }
  const qty = Math.round(open.reduce((a, b) => a + b.qty, 0) * 1e4) / 1e4;
  const priced = open.every((b) => b.price != null && b.price > 0);
  const avg = qty > 0 && priced ? Math.round((open.reduce((a, b) => a + b.qty * (b.price as number), 0) / qty) * 100) / 100 : null;
  return { qty, avg, over };
}
