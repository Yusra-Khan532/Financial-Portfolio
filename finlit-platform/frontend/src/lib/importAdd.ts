import { dayLabel } from "./holdingsColumns";

/** Adding imported shares with their quantity and average buy price (22 Nov 2026). Used by the three add paths of the equity portfolio page
 *  (Holdings chunk): the spreadsheet upload (`wn`), the PDF dialog's Add (`onAdd`), and the "please check" list's Add / Add all (`En`, `eq-addall`).
 *  Live today all three write `qty: 1, price: 0` (the PDF dialog writes its quantity, but price 0 always). */

export type Amounts = { qty?: number; avg?: number; avgHow?: "column" | "worked"; lines?: number; accounts?: number; rate?: number; rateOn?: string };
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
    const a: Amounts = { ...(e.qty != null ? { qty: e.qty } : {}), ...(e.avg != null ? { avg: e.avg, avgHow: e.avgHow } : {}), ...(e.lines ? { lines: e.lines } : {}), ...(e.rate != null ? { rate: e.rate, ...(e.rateOn ? { rateOn: e.rateOn } : {}) } : {}) };
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
export function fileNotes(a: { qty: string | null; price: string | null; priceHow: "column" | "worked" | null; trades: boolean; rateLike: string | null; otherParts?: number }, entries: Amounts[]): string[] {
  const out: string[] = [];
  if (a.trades) return ["This file lists trades (buys and sells), not holdings, so only the company names are taken and each comes in as 1 share."];
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
