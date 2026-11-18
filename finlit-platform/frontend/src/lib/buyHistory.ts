// Task #217: each share's buy history in the Equity portfolio. A buy is one stored holding row of that share with a quantity the member typed (owned): its
// quantity, the price paid for each share and the date. The page shows every buy under its share, the total quantity, the average price and what was
// invested; this file only adds them up. Average price = total invested ÷ total quantity across all buys that have a price. Describes; never advice.
import type { Holding } from "./portfolio";

export type Buy = Holding & { owned: true };
export type BuyTotals = {
  buys: Buy[];
  /** every share bought, priced or not */
  qty: number;
  /** Σ qty × price over the buys with a price */
  invested: number | null;
  /** invested ÷ the quantity of the buys with a price (weighted by quantity) */
  avg: number | null;
  /** buys entered without a price: left out of the average and of invested, and the page says so */
  unpriced: number;
};

/** A share's buys: the rows with a typed quantity, oldest first (a buy without a date goes last, in the order it was added). */
export function buysOf(hs: Holding[], symbol: string): Buy[] {
  const s = symbol.toUpperCase();
  return hs.filter((h): h is Buy => h.symbol.toUpperCase() === s && !!h.owned && h.qty > 0)
    .map((h, i) => [h, i] as const).sort(([a, i], [b, j]) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0) || i - j).map(([h]) => h);
}

export function totalsOf(buys: Buy[]): BuyTotals {
  const priced = buys.filter((b) => b.price > 0);
  const pq = priced.reduce((a, b) => a + b.qty, 0), invested = priced.reduce((a, b) => a + b.qty * b.price, 0);
  return { buys, qty: buys.reduce((a, b) => a + b.qty, 0), invested: priced.length ? invested : null, avg: pq ? invested / pq : null, unpriced: buys.length - priced.length };
}

/** What the priced buys are worth at today's price, and the gain or loss on them (amount and percent of what was invested). */
export function pnlOf(t: BuyTotals, price: number | null | undefined) {
  if (price == null || t.invested == null || !t.invested) return { value: null, pnl: null, pct: null };
  const pq = t.buys.filter((b) => b.price > 0).reduce((a, b) => a + b.qty, 0), value = pq * price, pnl = value - t.invested;
  return { value, pnl, pct: (pnl / t.invested) * 100 };
}

/** The list's Invested · Current value · Total P&L, over the shares with priced buys and a price today. Null when no buy has a price. */
export function listSummary(hs: Holding[], priceOf: (symbol: string) => number | null | undefined) {
  const syms = [...new Set(hs.map((h) => h.symbol.toUpperCase()))];
  let invested = 0, value = 0, n = 0;
  for (const s of syms) { const t = totalsOf(buysOf(hs, s)), p = pnlOf(t, priceOf(s)); if (p.value != null && t.invested != null) { invested += t.invested; value += p.value; n++; } }
  return n ? { invested, value, pnl: value - invested, pct: ((value - invested) / invested) * 100, shares: n } : null;
}

/** A new buy as the store keeps it (the page adds the id). Throws a plain sentence when a field cannot be a buy. */
export function buyFrom(symbol: string, f: { date: string; qty: string; price: string }, today = new Date().toISOString().slice(0, 10)): Omit<Buy, "id"> {
  const qty = Number(f.qty.replace(/,/g, "")), price = f.price.trim() === "" ? 0 : Number(f.price.replace(/,/g, ""));
  if (!Number.isFinite(qty) || qty <= 0 || qty > 1_000_000_000) throw new Error("Type how many shares you bought (more than 0).");
  if (!Number.isFinite(price) || price < 0 || price > 100_000_000) throw new Error("Type the price you paid for each share, or leave it empty.");
  if (f.date && !/^\d{4}-\d{2}-\d{2}$/.test(f.date)) throw new Error("Pick the date of the buy.");
  if (f.date && f.date > today) throw new Error("The date of a buy cannot be in the future.");
  return { symbol: symbol.toUpperCase(), qty, price, ...(f.date ? { date: f.date } : {}), owned: true };
}

type Store = { add: (h: Omit<Holding, "id">) => void; update: (id: string, h: Partial<Holding>) => void; remove: (id: string) => void };
/** The page's changes to the stored list (the Equity portfolio's store): the first buy fills the share's name-only line; removing the last buy turns it back
 *  into a name, so the share stays in the list; a bare quantity (a statement import) never replaces a buy history. */
export function historyActions(get: () => Holding[], store: Store) {
  return {
    add: (symbol: string, b: Omit<Buy, "id">) => {
      const hs = get(), sym = symbol.toUpperCase(), names = hs.filter((h) => h.symbol.toUpperCase() === sym && !h.owned), isin = hs.find((h) => h.symbol.toUpperCase() === sym)?.isin;
      if (names.length) { names.slice(1).forEach((h) => store.remove(h.id)); store.update(names[0].id, { ...b, date: b.date, isin: names[0].isin ?? isin }); }
      else store.add({ ...b, ...(isin ? { isin } : {}) });
    },
    edit: (id: string, b: Omit<Buy, "id">) => store.update(id, { qty: b.qty, price: b.price, date: b.date, owned: true }),
    remove: (id: string) => {
      const hs = get(), h = hs.find((x) => x.id === id);
      if (!h) return;
      if (buysOf(hs, h.symbol).length <= 1) store.update(id, { qty: 1, price: 0, date: undefined, owned: false });
      else store.remove(id);
    },
    /** A quantity without a price or date (a statement import): set only on a share that has no buys yet. Returns whether it was set. */
    setQty: (symbol: string, qty: number | null) => {
      const mine = get().filter((h) => h.symbol.toUpperCase() === symbol.toUpperCase());
      if (!mine.length || mine.some((h) => h.owned)) return false;
      store.update(mine[0].id, qty ? { qty, owned: true } : { qty: 1, owned: false });
      return true;
    },
  };
}
