// Task #235 (the 18 Nov portfolios pack, B9 and B11): a holding's buys and sales, first in, first out. For one share in one portfolio: buys and sales in date
// order (buys first on the same date); each sale uses up the earliest buy that still has shares left, then the next; what is left of each buy stays open, and
// everything the page shows about the holding comes from the open part. Each portfolio keeps its own order; All accounts adds each portfolio's result. Pure
// sums, no React. Charges, taxes and dividends are not included. Describes; never advice.
import { DEFAULT_PF, type Holding } from "./portfolio";

export type BuyRow = Holding & { owned: true; side?: undefined };
export type SaleRow = Holding & { owned: true; side: "sell" };
export type BuyFig = { row: BuyRow; left: number; sold: number; by: { id: string; date?: string; qty: number }[] };
export type SaleFig = { row: SaleRow; from: { id: string; date?: string; qty: number }[]; err: number | null; cost: number | null; got: number | null; gain: number | null };
export type Ledger = {
  symbol: string; pf: string; buys: BuyFig[]; sales: SaleFig[];
  /** what is left: Σ left of each buy (null when there are no buys) */ qty: number | null;
  /** Σ(left × buy price) ÷ Σ left; null until every open buy has a price */ avg: number | null;
  /** Σ(left × buy price); null when an open buy has no price */ invested: number | null;
  /** Σ booked gain of the sales; bookedOk false when a sale or a buy it used has no price */ booked: number; bookedOk: boolean;
  /** sales counted (with a quantity, not larger than what was held) */ nSales: number; /** sales larger than what was held then */ bad: number;
};

export const pfOf = (h: Holding) => h.pf ?? DEFAULT_PF;
const isBuy = (h: Holding): h is BuyRow => !!h.owned && h.side !== "sell" && h.qty > 0;
const isSale = (h: Holding): h is SaleRow => !!h.owned && h.side === "sell" && h.qty > 0;
const EPS = 1e-9;

/** One share in one portfolio, first in, first out. Rows of other shares or portfolios are ignored. */
export function ledgerOf(hs: Holding[], symbol: string, pf: string): Ledger {
  const s = symbol.toUpperCase(), mine = hs.filter((h) => h.symbol.toUpperCase() === s && pfOf(h) === pf);
  const buys: BuyFig[] = mine.filter(isBuy).map((row) => ({ row, left: row.qty, sold: 0, by: [] }));
  const sales: SaleFig[] = mine.filter(isSale).map((row) => ({ row, from: [], err: null, cost: null, got: null, gain: null }));
  const key = (d?: string) => d || "9999-12-31";                                       // a row without a date goes last, in the order it was added
  const ev = [...buys.map((b, i) => [0, i, b] as const), ...sales.map((x, i) => [1, i, x] as const)]
    .sort((a, b) => (key(a[2].row.date) < key(b[2].row.date) ? -1 : key(a[2].row.date) > key(b[2].row.date) ? 1 : a[0] - b[0] || a[1] - b[1]));
  const open: BuyFig[] = [];
  let booked = 0, bookedOk = true;
  for (const [k, , o] of ev) {
    if (k === 0) { open.push(o as BuyFig); continue; }
    const x = o as SaleFig, held = open.reduce((a, b) => a + b.left, 0);
    if (x.row.qty > held + EPS) { x.err = held; continue; }                            // larger than what was held then: left out of every figure
    let need = x.row.qty, cost = 0, costOk = true;
    while (need > EPS && open.length) {
      const b = open[0], u = Math.min(b.left, need);
      b.left -= u; b.sold += u; need -= u;
      b.by.push({ id: x.row.id, date: x.row.date, qty: u }); x.from.push({ id: b.row.id, date: b.row.date, qty: u });
      if (b.row.price > 0) cost += u * b.row.price; else costOk = false;
      if (b.left <= EPS) { b.left = 0; open.shift(); }
    }
    x.cost = costOk ? cost : null; x.got = x.row.price > 0 ? x.row.qty * x.row.price : null;
    x.gain = x.cost != null && x.got != null ? x.got - x.cost : null;
    if (x.gain == null) bookedOk = false; else booked += x.gain;
  }
  const live = buys.filter((b) => b.left > EPS), qty = live.reduce((a, b) => a + b.left, 0);
  const priced = live.every((b) => b.row.price > 0), invested = priced ? live.reduce((a, b) => a + b.left * b.row.price, 0) : null;
  return { symbol: s, pf, buys, sales, qty: buys.length ? qty : null, avg: priced && qty > EPS ? invested! / qty : null, invested: buys.length ? invested : null,
    booked, bookedOk, nSales: sales.filter((x) => x.err == null).length, bad: sales.filter((x) => x.err != null).length };
}

/** The portfolios a share is held in (any row of it, buys, sales or a name only). */
export const pfsOf = (hs: Holding[], symbol: string) => [...new Set(hs.filter((h) => h.symbol.toUpperCase() === symbol.toUpperCase()).map(pfOf))];

export type Agg = { qty: number | null; avg: number | null; invested: number | null; booked: number; bookedOk: boolean; nSales: number; bad: number; nBuys: number; pfs: string[]; ledgers: Ledger[] };
/** A share in one portfolio, or in All accounts ("all"): each portfolio worked out on its own, then added up (pack B1: quantity summed, average weighted). */
export function aggOf(hs: Holding[], symbol: string, pf: string | "all"): Agg | null {
  const pfs = pf === "all" ? pfsOf(hs, symbol) : pfsOf(hs, symbol).filter((p) => p === pf);
  if (!pfs.length) return null;
  const ls = pfs.map((p) => ledgerOf(hs, symbol, p));
  const withBuys = ls.filter((l) => l.qty != null), qty = withBuys.length ? withBuys.reduce((a, l) => a + (l.qty as number), 0) : null;
  const allPriced = withBuys.every((l) => l.qty === 0 || l.invested != null), invested = withBuys.length && allPriced ? withBuys.reduce((a, l) => a + (l.invested ?? 0), 0) : null;
  return { qty, avg: qty && invested != null ? invested / qty : null, invested, booked: ls.reduce((a, l) => a + l.booked, 0), bookedOk: ls.every((l) => l.bookedOk),
    nSales: ls.reduce((a, l) => a + l.nSales, 0), bad: ls.reduce((a, l) => a + l.bad, 0), nBuys: ls.reduce((a, l) => a + l.buys.length, 0), pfs, ledgers: ls };
}

/** True when a share in a portfolio was sold in full (it has buys and none left): it moves to the Sold list (pack B14). */
export const soldInFull = (l: Ledger) => l.buys.length > 0 && l.qty === 0;

export type Money = { n: number; withQty: number; full: number; invested: number; now: number; gain: number; today: number; prev: number;
  booked: number; bookedOk: boolean; nSales: number; bad: number; missing: { symbol: string; what: "qty" | "price" }[];
  /** task #323 (developer file 21, part 6): the shares really in the money figures (a quantity, a buy price and a price today); those with no price today
   *  yet (counted, not valued); and those whose buy price is a statement's Rate (priceFrom "rate"), with that Rate's day */
  covered: string[]; noPrice: string[]; rate: string[]; rateOn: string | null };
/** The money row and the total row (pack B7, B11): over the shares held in the portfolio (sold in full left out); a share without a buy price counts in
 *  Value now, not in Invested or Gain. priceOf: the latest price; changeOf: today's change in percent. */
export function moneyOf(hs: Holding[], pf: string | "all", priceOf: (s: string) => number | null | undefined, changeOf: (s: string) => number | null | undefined): Money {
  const t: Money = { n: 0, withQty: 0, full: 0, invested: 0, now: 0, gain: 0, today: 0, prev: 0, booked: 0, bookedOk: true, nSales: 0, bad: 0, missing: [], covered: [], noPrice: [], rate: [], rateOn: null };
  for (const sym of [...new Set(hs.map((h) => h.symbol.toUpperCase()))]) {
    const a = aggOf(hs, sym, pf);
    if (!a) continue;
    if (a.nSales || a.bad) { t.booked += a.booked; t.nSales += a.nSales; t.bad += a.bad; if (!a.bookedOk) t.bookedOk = false; }
    if (a.qty === 0) continue;                                                           // sold in full: in Sold, not in the counts
    t.n++;
    const fromRate = hs.find((h) => h.symbol.toUpperCase() === sym && (pf === "all" || pfOf(h) === pf) && h.priceFrom === "rate" && h.price > 0);
    if (fromRate) { t.rate.push(sym); t.rateOn = fromRate.priceOn ?? t.rateOn; }
    const p = priceOf(sym);
    if (a.qty == null) { t.missing.push({ symbol: sym, what: "qty" }); continue; }
    if (p == null) { t.noPrice.push(sym); continue; }                                    // no price today yet: counted, not valued
    const now = a.qty * p, c = changeOf(sym) ?? 0, prev = now / (1 + c / 100);
    t.withQty++; t.now += now; t.today += now - prev; t.prev += prev;
    if (a.invested != null) { t.full++; t.covered.push(sym); t.invested += a.invested; t.gain += now - a.invested; } else t.missing.push({ symbol: sym, what: "price" });
  }
  return t;
}

/** The rows the page lists under a holding (buys and sales, drafts with no quantity yet included), in date order, buys first on the same date; each with
 *  its figure from the ledger of its own portfolio. pf "all": every portfolio's rows, each tagged by its portfolio. */
export function rowsOf(hs: Holding[], symbol: string, pf: string | "all") {
  const s = symbol.toUpperCase(), pfs = pf === "all" ? pfsOf(hs, s) : [pf];
  const figs = new Map<string, BuyFig | SaleFig>();
  for (const p of pfs) { const l = ledgerOf(hs, s, p); l.buys.forEach((b) => figs.set(b.row.id, b)); l.sales.forEach((x) => figs.set(x.row.id, x)); }
  const key = (d?: string) => d || "9999-12-31";
  return hs.filter((h) => h.symbol.toUpperCase() === s && h.owned && pfs.includes(pfOf(h)))
    .map((h, i) => ({ row: h, sale: h.side === "sell", fig: figs.get(h.id) ?? null, i }))
    .sort((a, b) => (key(a.row.date) < key(b.row.date) ? -1 : key(a.row.date) > key(b.row.date) ? 1 : Number(a.sale) - Number(b.sale) || a.i - b.i));
}

type Store = { add: (h: Omit<Holding, "id">) => void; update: (id: string, h: Partial<Holding>) => void; remove: (id: string) => void };
/** The page's changes (pack B9, B11): "+ Add a buy" / "− Add a sale" add a row dated today with no quantity yet (kept in this browser until it has one); the
 *  first buy fills the share's name-only line in that portfolio; removing the last row of a share keeps the share, as a name. */
export function lotActions(get: () => Holding[], store: Store) {
  return {
    add: (symbol: string, pf: string, side: "buy" | "sell", today = new Date().toISOString().slice(0, 10)) => {
      const hs = get(), sym = symbol.toUpperCase(), isin = hs.find((h) => h.symbol.toUpperCase() === sym)?.isin;
      const base = { symbol: sym, qty: 0, price: 0, date: today, owned: true as const, ...(pf !== DEFAULT_PF ? { pf } : {}), ...(isin ? { isin } : {}), ...(side === "sell" ? { side: "sell" as const } : {}) };
      const name = hs.find((h) => h.symbol.toUpperCase() === sym && pfOf(h) === pf && !h.owned);
      if (name && side === "buy") store.update(name.id, base); else store.add(base);
    },
    edit: (id: string, patch: Partial<Pick<Holding, "qty" | "price" | "date">>) => store.update(id, patch.price != null ? { ...patch, priceFrom: undefined, priceOn: undefined } : patch),   // task #323: a typed price is no longer the Rate
    remove: (id: string) => {
      const hs = get(), h = hs.find((x) => x.id === id);
      if (!h) return;
      const others = hs.filter((x) => x.id !== id && x.symbol === h.symbol && pfOf(x) === pfOf(h));
      if (!others.length) store.update(id, { qty: 1, price: 0, date: undefined, owned: false, side: undefined, priceFrom: undefined, priceOn: undefined }); else store.remove(id);
    },
  };
}

/** The holdings the server keeps: draft rows (no quantity yet) stay in this browser until they have one. */
export const savable = (hs: Holding[]) => hs.filter((h) => h.qty > 0);
