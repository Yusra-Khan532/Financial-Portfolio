// Watchlists are kept in this browser and, for signed-in Silver and Gold members, mirrored to their account (see lib/sync.tsx)
// so lists follow them to other devices and the app.
import { useSyncExternalStore } from "react";

/** `labelAlert`: the list's "Tell me when a label changes" choice (Watchlists page), sent after each weekly peer check by the server (finlit/labelalerts.py). */
export type LabelAlert = "any" | "laggard" | "leader";
/** Task #408, "Alerts for this list": target (Price near your target), peer (Peer label changes) and the kinds of the list's filing alert, saved with the
 *  list; the server reads them (finlit/targetalerts.py, finlit/labelalerts.py). A list without them shows the page's defaults. */
export type ListAlerts = { target: boolean; peer: "any" | "laggard" | "leader" | "off"; filings: string[] };
export type List = { id: string; name: string; symbols: string[]; labelAlert?: LabelAlert; alerts?: ListAlerts };
/** `addedPrice`: the last traded price when the stock was added (task #408, "Since added"); `nearAlert`: "Tell me when the price is within 5% of my
 *  target" (absent = on). */
export type Meta = { note?: string; target?: number; added: number; addedPrice?: number; nearAlert?: boolean };
export type WState = { lists: List[]; meta: Record<string, Meta>; seeded?: boolean };

const KEY = "finlit-watchlist-v1";
const fresh = (): WState => ({ lists: [{ id: "main", name: "My watchlist", symbols: [] }], meta: {} });
function read(): WState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null") as WState | null;
    if (s && Array.isArray(s.lists) && s.lists.length) return s;
    const st = fresh();
    // carry over stars from the first version of the stock-page button
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i) || ""; if (k.startsWith("finlit-watch-")) st.lists[0].symbols.push(k.slice(13)); }
    return st;
  } catch { return fresh(); }
}
let state = read();
const subs = new Set<() => void>();
let onSave: ((s: WState) => void) | null = null;
const emit = (remote = false) => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } subs.forEach((f) => f()); if (!remote) onSave?.(state); };
const set = (fn: (s: WState) => WState) => { state = fn(state); emit(); };
const uid = () => Math.random().toString(36).slice(2, 8);

export const watch = {
  get: () => state,
  /** Account sync hooks: `replace` loads the saved copy without echoing it back; `onSave` receives local changes. */
  replace: (s: WState) => { state = s.lists?.length ? s : fresh(); emit(true); },
  reset: () => { state = fresh(); emit(true); },
  onSave: (f: ((s: WState) => void) | null) => { onSave = f; },
  subscribe: (f: () => void) => { subs.add(f); return () => subs.delete(f); },
  has: (sym: string) => state.lists.some((l) => l.symbols.includes(sym)),
  total: () => new Set(state.lists.flatMap((l) => l.symbols)).size,
  /** Adds a stock; a stock new to the lists keeps the time and (task #408) the last traded price: `price` when the caller has it, else read once from
   *  the quote (the server fills any it misses from the stored closes, finlit/watchprices.py). */
  add: (sym: string, listId = state.lists[0].id, price?: number | null) => {
    const fresh = !state.meta[sym];
    set((s) => ({ ...s, lists: s.lists.map((l) => (l.id === listId && !l.symbols.includes(sym) ? { ...l, symbols: [...l.symbols, sym] } : l)),
      meta: { ...s.meta, [sym]: s.meta[sym] || { added: Date.now(), ...(price && price > 0 ? { addedPrice: price } : {}) } } }));
    if (fresh && !(price && price > 0)) fillAddedPrice(sym);
  },
  remove: (sym: string, listId?: string) => set((s) => ({ ...s, lists: s.lists.map((l) => (!listId || l.id === listId ? { ...l, symbols: l.symbols.filter((x) => x !== sym) } : l)) })),
  move: (sym: string, from: string, to: string) => set((s) => ({ ...s, lists: s.lists.map((l) => (l.id === from ? { ...l, symbols: l.symbols.filter((x) => x !== sym) } : l.id === to && !l.symbols.includes(sym) ? { ...l, symbols: [...l.symbols, sym] } : l)) })),
  create: (name: string) => { const id = uid(); set((s) => ({ ...s, lists: [...s.lists, { id, name: name.trim().slice(0, 28) || "New list", symbols: [] }] })); return id; },
  rename: (id: string, name: string) => set((s) => ({ ...s, lists: s.lists.map((l) => (l.id === id ? { ...l, name: name.trim().slice(0, 28) || l.name } : l)) })),
  drop: (id: string) => set((s) => (s.lists.length > 1 ? { ...s, lists: s.lists.filter((l) => l.id !== id) } : s)),
  setLabelAlert: (id: string, pick: LabelAlert | null) => set((s) => ({ ...s, lists: s.lists.map((l) => { if (l.id !== id) return l; const { labelAlert: _old, ...rest } = l; void _old; return pick ? { ...rest, labelAlert: pick } : rest; }) })),
  setAlerts: (id: string, a: ListAlerts) => set((s) => ({ ...s, lists: s.lists.map((l) => { if (l.id !== id) return l; const { labelAlert: _old, ...rest } = l; void _old;
    return a.peer === "off" ? { ...rest, alerts: a } : { ...rest, alerts: a, labelAlert: a.peer }; }) })),
  setMeta: (sym: string, m: Partial<Meta>) => set((s) => ({ ...s, meta: { ...s.meta, [sym]: { ...s.meta[sym], ...m, added: s.meta[sym]?.added ?? Date.now() } } })),
  seed: (syms: string[]) => set((s) => ({ ...s, seeded: true, lists: s.lists.map((l, i) => (i === 0 ? { ...l, symbols: [...new Set([...l.symbols, ...syms])] } : l)) })),
};
/** The quote's price for a stock just added, saved as its added price (only while it still has none). Quiet on failure: the server fills it later. */
function fillAddedPrice(sym: string) {
  if (typeof fetch !== "function") return;
  import("./api").then(({ apiGet }) => apiGet<{ quote?: { price?: number | null } }>(`/api/stocks/${encodeURIComponent(sym)}`)).then((r) => {
    const p = r?.quote?.price;
    if (p && p > 0 && state.meta[sym] && !state.meta[sym].addedPrice) watch.setMeta(sym, { addedPrice: p });
  }).catch(() => undefined);
}
export const useWatchlist = () => useSyncExternalStore(watch.subscribe, watch.get, watch.get);
