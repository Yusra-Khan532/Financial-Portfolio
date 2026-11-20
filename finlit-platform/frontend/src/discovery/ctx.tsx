// Task #251: what every part of the Discover page shares: the joined rows, the member's own names (the site's real portfolio and watchlist stores), the
// watchlist write (the plan limits of the Watchlists page), the address, and each page's table state.
// Task #260 (SPEC §14): one real path per view and the table's filters, sort and page in the query string, so every page and every filtered list can be
// linked and shared, and Back returns to the same view.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { usePortfolio } from "../lib/portfolio";
import { useWatchlist, watch } from "../lib/watchlist";
import { useUI } from "../lib/ui";
import { limitsFor, useAuth } from "../lib/auth";
import { parseRoute, readT, routeKey, treeOf, writeT, freshT, type DRow, type Route, type TState, type Tree, type useDiscover } from "./model";

export type Discover = ReturnType<typeof useDiscover>;
export type Ctx = {
  d: Discover; by: Map<string, DRow>; themes: string[]; sectors: string[]; tree: Tree; industries: string[]; route: Route;
  /** Opens a page; `patch` sets that page's table state (filters, a company to find) in its query string. */
  go: (path: string, patch?: Partial<TState>, sort?: string) => void;
  signedIn: boolean; held: string[]; watched: string[]; onList: (s: string) => boolean; isHeld: (s: string) => boolean; isWatched: (s: string) => boolean;
  toggleWatch: (s: string, name: string) => void; prismOpen: boolean;
  /** The table state of this page (from the query string); `setT` changes it in place (replace, so Back leaves the page, not each filter). */
  T: (key: string, sort?: string) => TState; setT: (key: string, patch: Partial<TState>, sort?: string) => void; open: Set<string>; toggleOpen: (s: string, on?: boolean) => void;
};
const C = createContext<Ctx | null>(null);
export const useDsc = () => { const c = useContext(C); if (!c) throw new Error("Discover context missing"); return c; };

export function DiscoverProvider({ d, children }: { d: Discover; children: React.ReactNode }) {
  const loc = useLocation(), nav = useNavigate();
  const { user } = useAuth();
  const { has, plan, toast, upgrade } = useUI();
  const pf = usePortfolio(), wl = useWatchlist();
  const signedIn = !!user;
  const held = useMemo(() => (signedIn ? [...new Set(pf.holdings.filter((h) => h.owned !== false && h.side !== "sell").map((h) => h.symbol))] : []), [pf, signedIn]);
  const watched = useMemo(() => (signedIn ? [...new Set(wl.lists.flatMap((l) => l.symbols))] : []), [wl, signedIn]);
  const by = useMemo(() => new Map(d.rows.map((r) => [r.s, r])), [d.rows]);
  const themes = useMemo(() => [...new Set(d.rows.map((r) => r.th))], [d.rows]);
  const sectors = useMemo(() => [...new Set(d.rows.map((r) => r.mac).filter((x): x is string => !!x))], [d.rows]);
  const tree = useMemo(() => treeOf(d.rows), [d.rows]);
  const industries = useMemo(() => [...new Set(d.rows.map((r) => r.ind).filter((x): x is string => !!x))].sort(), [d.rows]);
  const route = useMemo(() => parseRoute(loc.pathname, { themes, macros: sectors, sectors: [...tree.macroOf.keys()], industries }), [loc.pathname, themes, sectors, tree, industries]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const sp = useMemo(() => new URLSearchParams(loc.search), [loc.search]);
  // task #273 (suggested): &open=<symbol> opens that company's row on arrival (the other pages link here with ?q=<name>&open=<symbol>)
  const openSym = (sp.get("open") || "").trim().toUpperCase();
  useEffect(() => {
    if (!openSym || !by.has(openSym)) return;
    setOpen((o) => (o.has(openSym) ? o : new Set(o).add(openSym)));
    const t = setTimeout(() => document.querySelector(`[data-dsc-row="${CSS.escape(openSym)}"]`)?.scrollIntoView?.({ block: "center" }), 120);
    return () => clearTimeout(t);
  }, [openSym, by]);
  const go = useCallback((path: string, patch?: Partial<TState>, sort?: string) => {
    const search = patch ? "?" + writeT({ ...freshT(sort), ...patch }, sort).toString() : "";
    if (loc.pathname !== path || loc.search !== (search === "?" ? "" : search)) nav({ pathname: path, search: search === "?" ? "" : search });
  }, [loc.pathname, loc.search, nav]);
  const heldSet = useMemo(() => new Set(held), [held]), watchSet = useMemo(() => new Set(watched), [watched]);
  const ctx: Ctx = {
    d, by, themes, sectors, tree, industries, route, go, signedIn, held, watched, prismOpen: has("gold"),
    onList: (s) => heldSet.has(s) || watchSet.has(s), isHeld: (s) => heldSet.has(s), isWatched: (s) => watchSet.has(s),
    toggleWatch: (s, name) => {
      if (!signedIn) { toast("Sign in to keep a watchlist."); return; }
      if (watch.has(s)) { watch.remove(s); toast(`${name} removed from your watchlist.`); return; }
      const lim = limitsFor(plan);
      if (watch.total() >= lim.watchlist_symbols) {
        if (has("gold")) toast(`Your watchlist is full (${lim.watchlist_symbols} stocks).`);
        else upgrade(has("silver") ? "gold" : "silver", "Silver holds up to 30 stocks; Gold holds up to 1,000.");
        return;
      }
      watch.add(s); toast(`${name} added to your watchlist.`);
    },
    T: (_key, sort) => readT(sp, sort),
    setT: (_key, patch, sort) => {
      const next = writeT({ ...readT(sp, sort), ...patch }, sort).toString();
      nav({ pathname: loc.pathname, search: next ? "?" + next : "" }, { replace: true });
    },
    open, toggleOpen: (s, on) => setOpen((o) => { const n = new Set(o); if (on ?? !n.has(s)) n.add(s); else n.delete(s); return n; }),
  };
  return <C.Provider value={ctx}>{children}</C.Provider>;
}
export const keyOf = (r: Route) => routeKey(r);
