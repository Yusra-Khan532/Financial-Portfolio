import { dayLabel } from "./holdingsColumns";
import { DEFAULT_PF, type Holding } from "./portfolio";
import type { Trade } from "./tradeColumns";

/** Adding imported shares with their quantity and average buy price (22 Nov 2026). Used by the three add paths of the equity portfolio page
 *  (Holdings chunk): the spreadsheet upload (`wn`), the PDF dialog's Add (`onAdd`), and the "please check" list's Add / Add all (`En`, `eq-addall`).
 *  Live today all three write `qty: 1, price: 0` (the PDF dialog writes its quantity, but price 0 always). */

export type Amounts = { qty?: number; avg?: number; avgHow?: "column" | "worked"; lines?: number; accounts?: number; rate?: number; rateOn?: string;
  /** developer file 31: each buy and sale in the file (a tradebook), or each dated buy (a holdings file with a buy date) */ trades?: Trade[] };
/** priceFrom "rate": the buy price is the statement's Rate (its price on `priceOn`), chosen by the member in the dialog, not what was paid.
 *  The money box says so (index `Up()` counts these; Holdings `ni` writes the note). */
export type NewHolding = { symbol: string; qty: number; price: number; owned?: true; isin?: string; priceFrom?: "rate"; priceOn?: string };
/** The import dialog's choice (22 Nov, round 2): "Use the statement's Rate as the buy price". It is used only where the statement has no buy price. */
export type ImportOpts = { rateAsBuy?: boolean };

/** The buy price of a line: the statement's average, else its Rate when the member chose that, else none (0). */
function buyOf(e: Amounts, o: ImportOpts): { price: number; priceFrom?: "rate"; priceOn?: string } {
  if (e.avg != null && e.avg > 0) return { price: e.avg };
  if (o.rateAsBuy && e.rate != null && e.rate > 0 && e.qty != null && e.qty > 0) return { price: e.rate, priceFrom: "rate", ...(e.rateOn ? { priceOn: e.rateOn } : {}) };
  return { price: 0 };
}

/** A new holding from an import line. price 0 still means "buy price not known" (the page's existing buy-price prompt shows for it). */
export function newHolding(e: { symbol: string } & Amounts, isin?: string, o: ImportOpts = {}): NewHolding {
  const b = buyOf(e, o);
  return {
    symbol: e.symbol,
    qty: e.qty != null && e.qty > 0 ? e.qty : 1,
    price: b.price,
    ...(e.qty != null && e.qty > 0 ? { owned: true as const } : {}),
    ...(isin ? { isin } : {}),
    ...(b.priceFrom ? { priceFrom: b.priceFrom, ...(b.priceOn ? { priceOn: b.priceOn } : {}) } : {}),
  };
}

/** A share that is already in the portfolio: the quantity from the statement replaces the one on the page (as the PDF dialog does today), and the buy
 *  price is filled in only when the page has none, so a price the member typed is never overwritten. Returns the patch, or null for no change. */
type HeldPatch = Partial<{ qty: number; price: number; owned: true; priceFrom: "rate"; priceOn: string }>;
export function updateHeld(cur: { qty: number; price: number }, e: Amounts, o: ImportOpts = {}): HeldPatch | null {
  const patch: HeldPatch = {};
  if (e.qty != null && e.qty > 0 && e.qty !== cur.qty) { patch.qty = e.qty; patch.owned = true; }
  if (!(cur.price > 0)) { const b = buyOf(e, o); if (b.price > 0) Object.assign(patch, b); }
  return Object.keys(patch).length ? patch : null;
}

/** The spreadsheet path matches lines to companies in `matchEntries` (mfspread `m`), whose finds carry `isin` or `input` (the name) but not the
 *  line's amounts: put them back on, by ISIN first, then by the name as written. */
export function attachAmounts<F extends { isin?: string; input?: string }>(found: F[], entries: ({ isin?: string; name: string } & Amounts)[]): (F & Amounts)[] {
  const byIsin = new Map<string, Amounts>(), byName = new Map<string, Amounts>();
  for (const e of entries) {
    const a: Amounts = { ...(e.qty != null ? { qty: e.qty } : {}), ...(e.avg != null ? { avg: e.avg, avgHow: e.avgHow } : {}), ...(e.lines ? { lines: e.lines } : {}), ...(e.rate != null ? { rate: e.rate, ...(e.rateOn ? { rateOn: e.rateOn } : {}) } : {}),
      ...(e.trades?.length ? { trades: e.trades } : {}) };
    if (e.isin) byIsin.set(e.isin, a);
    if (e.name) byName.set(e.name.toUpperCase().replace(/\s+/g, " ").trim(), a);
  }
  return found.map((f) => ({ ...f, ...((f.isin && byIsin.get(f.isin)) || (f.input && byName.get(f.input.toUpperCase().replace(/\s+/g, " ").trim())) || {}) }));
}

/** The page's message after an import ("Added 46 shares from the PDF, each with its quantity; no buy prices in this statement."). With the Rate
 *  chosen as the buy price: "Added 46 shares from the PDF, each with its quantity and the statement's Rate (the price of 20 Nov 2026) as its buy price." */
export function addedMessage(kind: "PDF" | "file", added: Amounts[], updated: number, priceColumn: string | null, o: ImportOpts & { rateCol?: string | null; rateOn?: string | null } = {}): string {
  const withQty = added.filter((x) => x.qty != null).length, withAvg = added.filter((x) => x.avg != null).length, n = added.length;
  const withRate = o.rateAsBuy ? added.filter((x) => x.avg == null && x.qty != null && x.rate != null && x.rate > 0).length : 0;
  const each = (k: number) => (k === n ? "each" : `${k}`);
  const on = o.rateOn ? dayLabel(o.rateOn) : null;
  const rateWords = `the ${kind === "PDF" ? "statement" : "file"}'s ${o.rateCol || "Rate"}${on ? ` (the price of ${on})` : ""}`;
  const parts = [
    n ? `Added ${n} ${n === 1 ? "share" : "shares"} from the ${kind}${withQty ? `, ${each(withQty)} with its quantity` : ""}${withAvg ? ` and ${withAvg === withQty ? "buy price" : `${withAvg} with a buy price`}` : ""}${!withAvg && withRate ? ` and ${withRate === withQty ? rateWords + " as its buy price" : `${withRate} with ${rateWords} as the buy price`}` : ""}` : "",
    updated ? `quantity set for ${updated} already in the portfolio` : "",
    n && withQty && !withAvg && !withRate ? (priceColumn ? "no buy prices could be read" : "this statement has no buy prices; add them under Edit") : "",
  ].filter(Boolean);
  return parts.length ? parts.join("; ") + "." : "Nothing new to add.";
}

/** The notes the spreadsheet path shows under its message (the PDF path writes its own in withAmounts). */
export function fileNotes(a: { qty: string | null; price: string | null; priceHow: "column" | "worked" | null; trades: boolean; rateLike: string | null; otherParts?: number; book?: Book }, entries: Amounts[]): string[] {
  const out: string[] = [];
  if (a.book) return bookNotes(a.book, a.price);
  if (a.trades) return ["This file lists trades (buys and sells) with no Buy / Sell column that could be read, so only the company names are taken and each comes in as 1 share."];
  if (!a.qty) return entries.length ? ["This file has no quantity column, so each share comes in as 1 share; type the quantities in the list."] : [];
  const noQty = entries.filter((e) => e.qty == null).length;
  if (noQty) out.push(`${noQty === 1 ? "One company has" : `${noQty} companies have`} no quantity in the file's ${a.qty} column, so ${noQty === 1 ? "it comes" : "they come"} in as 1 share.`);
  if (a.otherParts) out.push(`Quantities are from the file's ${a.qty} column. ${a.otherParts === 1 ? "One company also has" : `${a.otherParts} companies also have`} pledged or locked shares in other columns, which are not added: please check ${a.otherParts === 1 ? "it" : "them"}.`);
  if (!a.price) out.push(`This file has no buy price column${a.rateLike ? ` (its ${a.rateLike} column is today's price, not what you paid)` : ""}, so the shares come in without a buy price. Type it under Edit.`);
  else if (a.priceHow === "worked") out.push(`Buy prices are worked out from the file's ${a.price} column divided by the quantity.`);
  const many = entries.filter((e) => (e.lines ?? 1) > 1).length;
  if (many) out.push(`${many === 1 ? "One company is" : `${many} companies are`} on more than one line; ${many === 1 ? "its" : "their"} quantities are added up and the buy price is the average, weighted by quantity.`);
  return out;
}

// ------------------------------------------------------------------------------------------------ developer file 31: buys and sales with their dates

export type Book = { kind: "trades" | "dated"; side: string | null; day: string | null; price: string | null; buys: number; sells: number; undated: number[]; unpriced: number[]; over: number[] };
const lines = (xs: number[]) => { const l = xs.slice(0, 6).join(", ") + (xs.length > 6 ? ` and ${xs.length - 6} more` : ""); return `${xs.length === 1 ? "line" : "lines"} ${l}`; };

/** What the page says a tradebook or a dated holdings file brought (the notes under the import message). */
export function bookNotes(b: Book, price: string | null): string[] {
  const out: string[] = [];
  if (b.kind === "trades") out.push(`This file lists trades: ${b.buys} ${b.buys === 1 ? "buy" : "buys"} and ${b.sells ? `${b.sells} ${b.sells === 1 ? "sale" : "sales"}` : "no sales"} (its ${b.side || "Buy / Sell"} column), each with its ${b.day ? "date, " : ""}quantity and price. What is left of each share is worked out first in, first out, and each sale's gain or loss is booked.`);
  else out.push(`Each line comes in as its own buy, dated by the file's ${b.day} column, with its quantity and buy price.`);
  if (b.kind === "trades" && !b.day) out.push("The file has no trade date column, so the trades are kept in the file's order.");
  if (b.undated.length && b.day) out.push(`No date could be read on ${lines(b.undated)}; ${b.undated.length === 1 ? "it is" : "they are"} put after the dated ones. Add the date under Edit.`);
  if (b.unpriced.length) out.push(`No price on ${lines(b.unpriced)}${price ? ` (the ${price} column)` : ""}; add it under Edit.`);
  if (b.over.length) out.push(`${b.over.length === 1 ? "A sale is" : `${b.over.length} sales are`} larger than the buys before ${b.over.length === 1 ? "it" : "them"} in this file (${lines(b.over)}): the earlier buys are not in it. ${b.over.length === 1 ? "It is" : "They are"} kept but left out of the figures until those buys are added.`);
  return out;
}

const tkey = (h: { side?: string; date?: string | null; qty: number; price: number | null }) => `${h.side === "sell" ? "s" : "b"}|${h.date || ""}|${Math.round(h.qty * 1e4)}|${h.price != null && h.price > 0 ? Math.round(h.price * 100) : 0}`;
type Row = Omit<Holding, "id">;

/** The rows a share's trades give in one portfolio (`pf`) of a store whose rows are `hs` (the equity portfolio or the ETF book). Accuracy first:
 *   - a share not in the portfolio, or there by name only: every trade comes in (the first buy takes the place of the name);
 *   - a share with buys or sales of its own there: only when some of the file's trades are already there (the same side, day, quantity and price) is it
 *     the same history going on, and only the trades not there yet come in; otherwise nothing comes in and the share is named (`kept`), because adding a
 *     second history beside the first would count its shares twice. A dated holdings file (no sales) never adds to a share that has buys (task #235: a
 *     statement never replaces a history).
 *  Returns the rows to add, the name row to turn into the first buy, and what was done. */
export function tradeRows(sym: string, trades: Trade[], hs: Holding[], pf: string, base: Partial<Holding> = {}, holdingsOnly = false):
  { adds: Row[]; first: { id: string; patch: Partial<Holding> } | null; buys: number; sells: number; already: number; kept: boolean } {
  const mine = hs.filter((h) => h.symbol.toUpperCase() === sym.toUpperCase() && (h.pf ?? DEFAULT_PF) === pf);
  const owned = mine.filter((h) => h.owned && h.qty > 0), name = mine.find((h) => !h.owned);
  const have = new Set(owned.map((h) => tkey({ side: h.side, date: h.date ?? null, qty: h.qty, price: h.price })));
  const fileKeys = trades.map((t) => tkey(t));
  const already = fileKeys.filter((k) => have.has(k)).length;
  if (owned.length && (holdingsOnly || !already)) return { adds: [], first: null, buys: 0, sells: 0, already, kept: true };
  const fresh = trades.filter((_, i) => !have.has(fileKeys[i]));
  const rows: Row[] = fresh.map((t) => ({ ...base, symbol: sym, qty: t.qty, price: t.price != null && t.price > 0 ? t.price : 0, ...(t.date ? { date: t.date } : {}), owned: true as const,
    ...(pf !== DEFAULT_PF ? { pf } : {}), ...(t.side === "sell" ? { side: "sell" as const } : {}) }));
  const k = name ? rows.findIndex((r) => r.side !== "sell") : -1;
  const first = name && k >= 0 ? { id: name.id, patch: rows[k] as Partial<Holding> } : null;
  return { adds: first ? rows.filter((_, i) => i !== k) : rows, first, buys: fresh.filter((t) => t.side === "buy").length, sells: fresh.filter((t) => t.side === "sell").length, already, kept: false };
}

/** The import message for a file with trades: "Added 6 shares from the file with 14 buys and 5 sales, each with its date; 3 trades already in the portfolio
 *  were not added again; RELIANCE already has buys of its own here, so its trades were not added (nothing is counted twice)." */
export function tradesMessage(r: { shares: number; buys: number; sells: number; already: number; kept: string[]; dated: boolean; kind: "trades" | "dated" }): string {
  const list = (xs: string[]) => (xs.length <= 3 ? (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`) : `${xs.slice(0, 3).join(", ")} and ${xs.length - 3} more`);
  const what = r.kind === "trades" ? `${r.buys} ${r.buys === 1 ? "buy" : "buys"}${r.sells ? ` and ${r.sells} ${r.sells === 1 ? "sale" : "sales"}` : ""}` : `${r.buys} dated ${r.buys === 1 ? "buy" : "buys"}`;
  const parts = [
    r.buys + r.sells ? `Added ${what}${r.shares ? ` for ${r.shares} ${r.shares === 1 ? "share" : "shares"}` : ""}${r.dated ? ", each with its date" : ""}` : "",
    r.already ? `${r.already} ${r.already === 1 ? "trade was" : "trades were"} already in the portfolio and ${r.already === 1 ? "was" : "were"} not added again` : "",
    r.kept.length ? `${list(r.kept)} already ${r.kept.length === 1 ? "has" : "have"} buys of ${r.kept.length === 1 ? "its" : "their"} own in this portfolio, so ${r.kept.length === 1 ? "its" : "their"} lines from this file were not added (nothing is counted twice)` : "",
  ].filter(Boolean);
  return parts.length ? parts.join("; ") + "." : "Nothing new to add.";
}
