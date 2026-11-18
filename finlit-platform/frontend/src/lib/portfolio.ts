// Holdings live in this browser and, for signed-in Silver and Gold members, in their account (see lib/sync.tsx).
import { useSyncExternalStore } from "react";

/** isin (task #183): the share's ISIN, the key that survives a rename (ZOMATO → ETERNAL); the symbol is what the page shows. */
/** pf (task #235): the portfolio (broker account) the row belongs to; none = the first portfolio. side "sell": a sale (first in, first out), else a buy. */
export type Holding = { id: string; symbol: string; qty: number; price: number; date?: string; note?: string; owned?: boolean; isin?: string; pf?: string; side?: "sell" };
/** Task #235 (pack B1): a member's portfolios, one per broker account. The list's rows carry the id in `pf`. */
export type Portfolio = { id: string; name: string; broker?: string; created?: string };
export type PState = { holdings: Holding[]; portfolios?: Portfolio[] };
const KEY = "finlit-portfolio-v1";
/** The first portfolio's id: rows saved before task #235 have no `pf` and belong to it. */
export const DEFAULT_PF = "main";
const fresh = (): PState => ({ holdings: [] });
function read(): PState {
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null") as PState | null; return s && Array.isArray(s.holdings) ? s : fresh(); } catch { return fresh(); }
}
let state: PState = typeof localStorage === "undefined" ? fresh() : read();
const subs = new Set<() => void>();
let onSave: ((s: PState) => void) | null = null;
const emit = (remote = false) => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } subs.forEach((f) => f()); if (!remote) onSave?.(state); };
const uid = () => Math.random().toString(36).slice(2, 10);

export const portfolio = {
  get: () => state,
  subscribe: (f: () => void) => { subs.add(f); return () => subs.delete(f); },
  onSave: (f: ((s: PState) => void) | null) => { onSave = f; },
  replace: (s: PState) => { state = s?.holdings ? s : fresh(); emit(true); },
  reset: () => { state = fresh(); emit(true); },
  add: (h: Omit<Holding, "id">) => { state = { ...state, holdings: [...state.holdings, { ...h, symbol: h.symbol.toUpperCase(), id: uid() }] }; emit(); },
  update: (id: string, h: Partial<Holding>) => { state = { ...state, holdings: state.holdings.map((x) => (x.id === id ? { ...x, ...h } : x)) }; emit(); },
  remove: (id: string) => { state = { ...state, holdings: state.holdings.filter((x) => x.id !== id) }; emit(); },
  /** "Remove all" (task #127): an empty list, saved to the account like any other change. Returns what was there, so the page can offer Undo. */
  clear: (): PState => { const before = state; state = fresh(); emit(); return before; },
  /** Undo of "Remove all": puts the earlier list back exactly (ids, quantities, notes), saved to the account like any other change. */
  restore: (s: PState) => { state = s?.holdings ? { ...s, holdings: [...s.holdings] } : fresh(); emit(); },
  addMany: (hs: Omit<Holding, "id">[]) => { state = { ...state, holdings: [...state.holdings, ...hs.map((h) => ({ ...h, symbol: h.symbol.toUpperCase(), id: uid() }))] }; emit(); },
  /** Task #235 (pack B1): add, rename and remove a portfolio. Removing one removes its rows; the first portfolio's rows have no `pf`. */
  addPortfolio: (p: Omit<Portfolio, "id">): string => { const id = uid(); state = { ...state, portfolios: [...(state.portfolios ?? []), { ...p, id, created: p.created ?? new Date().toISOString().slice(0, 10) }] }; emit(); return id; },
  renamePortfolio: (id: string, name: string) => { state = { ...state, portfolios: (state.portfolios ?? []).map((p) => (p.id === id ? { ...p, name } : p)) }; emit(); },
  removePortfolio: (id: string) => { state = { ...state, portfolios: (state.portfolios ?? []).filter((p) => p.id !== id), holdings: state.holdings.filter((h) => (h.pf ?? DEFAULT_PF) !== id) }; emit(); },
};
export const usePortfolio = () => useSyncExternalStore(portfolio.subscribe, portfolio.get, portfolio.get);

/** Parse pasted or uploaded text: symbol, quantity, average buy price and an optional date (YYYY-MM-DD), comma or tab separated. */
export function parseHoldings(text: string): { rows: Omit<Holding, "id">[]; skipped: number } {
  const rows: Omit<Holding, "id">[] = []; let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    const p = line.split(/[,\t;]/).map((x) => x.trim().replace(/^"|"$/g, ""));
    if (p.length < 3 || /^symbol$/i.test(p[0]) || !p[0]) { if (p[0] && !/^symbol$/i.test(p[0])) skipped++; continue; }
    const qty = Number(p[1].replace(/,/g, "")), price = Number(p[2].replace(/[,₹]/g, ""));
    if (!/^[A-Za-z0-9&_.-]{1,24}$/.test(p[0]) || !(qty > 0) || !(price >= 0)) { skipped++; continue; }
    rows.push({ symbol: p[0].toUpperCase(), qty, price, ...(p[3] && /^\d{4}-\d{2}-\d{2}$/.test(p[3]) ? { date: p[3] } : {}) });
  }
  return { rows, skipped };
}
