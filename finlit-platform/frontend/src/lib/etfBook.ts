// Task #235 phase 3a (the 18 Nov portfolios pack, C2, C5, C6): the ETF portfolio's accounts and each buy and sale, from /api/me/etf-portfolio/book.
// The rows have the Equity page's shape (lib/portfolio Holding), so lib/ledger works them out first in, first out within each account, and the Equity
// page's parts (portfolios bar, buy and sale rows, money row, Sold list) show them. The server keeps the open units of each ETF as its quantity.
// Information only, not investment advice.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "./api";
import { DEFAULT_PF, type Holding, type Portfolio } from "./portfolio";
import { KEY } from "./etfPortfolio";

const BASE = "/api/me/etf-portfolio/book";
export type BookLot = { id: string; symbol: string; pf: string; side: "buy" | "sell"; qty: number; price: number; date: string | null; legacy?: boolean };
export type Book = { portfolios: Portfolio[]; lots: BookLot[]; names: string[] };

/** A stored buy or sale as a page row. */
export const toRow = (l: BookLot): Holding => ({ id: l.id, symbol: l.symbol, qty: l.qty, price: l.price, ...(l.date ? { date: l.date } : {}), owned: true, pf: l.pf, ...(l.side === "sell" ? { side: "sell" as const } : {}) });
/** The rows the server keeps: buys and sales with a quantity (a draft row stays in this browser; a name only is the ETF list itself). */
export const toLots = (hs: Holding[]) => hs.filter((h) => h.owned && h.qty > 0).map((h) => ({ id: h.id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40), symbol: h.symbol, pf: h.pf ?? DEFAULT_PF,
  side: h.side === "sell" ? "sell" : "buy", qty: h.qty, price: h.price > 0 ? h.price : null, date: h.date || null }));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** The book in the page: rows, accounts, and a store with the shape lib/ledger's lotActions expects. Every change is saved after a short pause. */
export function useEtfBook(on: boolean, names: string[]) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Holding[]>([]), [pfs, setPfs] = useState<Portfolio[]>([]), [ready, setReady] = useState(false), [err, setErr] = useState<string | null>(null);
  const cur = useRef({ rows, pfs }); cur.current = { rows, pfs };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), dirty = useRef(false);
  useEffect(() => {
    if (!on) return; let live = true;
    apiGet<Book>(BASE).then((b) => { if (!live) return; setPfs(b.portfolios); setRows(b.lots.map(toRow)); setReady(true); }).catch((e) => live && setErr(e?.body?.detail?.detail ?? "Your buys and sales could not be loaded."));
    return () => { live = false; };
  }, [on]);
  const save = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    dirty.current = true;
    timer.current = setTimeout(async () => {
      dirty.current = false;
      try { await apiSend("PUT", BASE, { portfolios: cur.current.pfs, lots: toLots(cur.current.rows) }); setErr(null); qc.invalidateQueries({ queryKey: KEY }); }
      catch (e) { setErr((e as { body?: { detail?: { detail?: string } } })?.body?.detail?.detail ?? "Your change could not be saved. Please try again."); }
    }, 900);
  }, [qc]);
  const set = (f: (hs: Holding[]) => Holding[]) => { setRows((hs) => { const n = f(hs); cur.current.rows = n; return n; }); save(); };
  const store = {
    add: (h: Omit<Holding, "id">) => set((hs) => [...hs, { ...h, id: uid() }]),
    update: (id: string, h: Partial<Holding>) => set((hs) => (hs.some((x) => x.id === id) ? hs.map((x) => (x.id === id ? { ...x, ...h } : x))
      : id.startsWith("name-") && h.symbol ? [...hs, { qty: 0, price: 0, ...h, symbol: h.symbol, id: uid() }] : hs)),   // the first buy of an ETF that was a name only
    remove: (id: string) => set((hs) => hs.filter((x) => x.id !== id)),
  };
  const setPortfolios = (p: Portfolio[]) => { setPfs(p); cur.current.pfs = p; save(); };
  const pfId = () => "a" + Math.random().toString(36).slice(2, 9);
  const accounts = {
    /** the first account added turns "My ETFs" (the rows saved before accounts) into a named account of its own */
    add: (a: { name: string; broker?: string }, list: Portfolio[]) => { const id = pfId(); setPortfolios([...list, { ...a, id, created: new Date().toISOString().slice(0, 10) }]); return id; },
    rename: (id: string, name: string, list: Portfolio[]) => setPortfolios(list.map((x) => (x.id === id ? { ...x, name } : x))),
    remove: (id: string, list: Portfolio[]) => { set((hs) => hs.filter((h) => (h.pf ?? DEFAULT_PF) !== id)); setPortfolios(list.filter((x) => x.id !== id)); },
  };
  // an ETF in the list with no buys yet reads as a name in the first account, so its row offers "add a buy"
  const first = pfs[0]?.id ?? DEFAULT_PF;
  const withNames = [...rows, ...names.filter((s) => !rows.some((r) => r.symbol === s)).map((s): Holding => ({ id: `name-${s}`, symbol: s, qty: 1, price: 0, owned: false, pf: first }))];
  return { rows: withNames, own: rows, pfs, ready, err, store, accounts, touch: save, get: () => [...cur.current.rows, ...withNames.filter((h) => !h.owned)], pending: () => dirty.current };
}
