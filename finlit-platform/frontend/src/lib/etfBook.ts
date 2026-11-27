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
/** An ETF in the list with no buys yet, as a row: a name in the first account, so its row offers "add a buy" (counted, not valued). */
export const nameRows = (names: string[], rows: Holding[], first: string): Holding[] =>
  names.filter((s) => !rows.some((r) => r.symbol === s)).map((s): Holding => ({ id: `name-${s}`, symbol: s, qty: 1, price: 0, owned: false, pf: first }));
/** Developer file 33: the rows of a stored book as the ETF page reads them (its buys and sales, and the names in the first account), for a page that only
 *  reads it (All my investments works out each account's ETFs from these, as the ETF page's own Your portfolios box does). */
export const bookRows = (b: Book): Holding[] => { const rows = b.lots.map(toRow); return [...rows, ...nameRows(b.names ?? [], rows, b.portfolios[0]?.id ?? DEFAULT_PF)]; };

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
  const withNames = [...rows, ...nameRows(names, rows, first)];
  return { rows: withNames, own: rows, pfs, ready, err, store, accounts, touch: save, get: () => [...cur.current.rows, ...withNames.filter((h) => !h.owned)], pending: () => dirty.current };
}

// ------------------------------------------------------------------------------------------------ developer file 35: a broker file into one account
/** One ETF of a broker file (quantity, average buy price when the file has one). */
export type FileItem = { symbol: string; qty: number | null; avg?: number };
/** What a broker file does to one account of the book (the ETF page's Import, into the account picked under "ETFs you add or upload go to"):
 *   - an ETF with no buys in this account: the file's line becomes its buy (`added`), whatever other accounts hold of it;
 *   - with buys here and "Keep what I have": left as it is (`kept`);
 *   - with buys here and "Use the file's quantities": one buy (or a quantity from before buys existed) takes the file's units (`set`); its price is the
 *     file's average buy price, or, when the file has none, the buy's own price if the units went down (what is left of the same buy), else none (the
 *     extra units' cost is not in the file: the page asks for it). Already the file's: `same`. Several buys, or a sale: not changed (`several`), because
 *     one line of a holdings file cannot say which buy changed; the member changes them under Edit.
 *  The server sets each ETF's units from every account's buys when the book is saved, so the units are set here, in the book. Until this file the
 *  import only sent "replace" to the list, and the book saved right after put each ETF's units back to its buys'. */
export function fileIntoAccount(own: Holding[], items: FileItem[], pf: string, useFile: boolean):
  { adds: Omit<Holding, "id">[]; updates: { id: string; symbol: string; patch: Partial<Holding> }[]; added: string[]; set: string[]; same: string[]; kept: string[]; several: string[] } {
  const out = { adds: [] as Omit<Holding, "id">[], updates: [] as { id: string; symbol: string; patch: Partial<Holding> }[], added: [] as string[], set: [] as string[], same: [] as string[], kept: [] as string[], several: [] as string[] };
  for (const it of items) {
    if (!(it.qty != null && it.qty > 0)) continue;
    const mine = own.filter((h) => h.symbol === it.symbol && (h.pf ?? DEFAULT_PF) === pf && h.owned);
    if (!mine.length) { out.adds.push({ symbol: it.symbol, qty: it.qty, price: it.avg ?? 0, owned: true, pf }); out.added.push(it.symbol); continue; }
    if (!useFile) { out.kept.push(it.symbol); continue; }
    const one = mine.length === 1 && mine[0].side !== "sell" ? mine[0] : null;
    if (!one) { out.several.push(it.symbol); continue; }
    const price = it.avg != null && it.avg > 0 ? it.avg : it.qty <= one.qty && one.price > 0 ? one.price : 0;
    if (Math.abs(one.qty - it.qty) < 1e-9 && Math.abs((one.price || 0) - price) < 0.005) { out.same.push(it.symbol); continue; }
    out.updates.push({ id: one.id, symbol: it.symbol, patch: { qty: it.qty, price } }); out.set.push(it.symbol);
  }
  return out;
}

/** The line after the import: "Imported into First account: 1 added; units set to the file's for NIFTYBEES and GOLDBEES; BANKBEES has several buys or a
 *  sale in this account, so its units were not set: change them under Edit. The file's average buy price went to HDFCMID150 and NIFTYBEES." */
export function fileMessage(account: string, r: { added: string[]; set: string[]; same: string[]; kept: string[]; several: string[] }, opts: { traded?: number; priced?: string[]; unpricedSet?: string[] } = {}): string {
  const list = (xs: string[]) => (xs.length <= 3 ? (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`) : `${xs.slice(0, 3).join(", ")} and ${xs.length - 3} more`);
  const one = (xs: string[]) => xs.length === 1;
  const n = r.added.length + (opts.traded ?? 0);
  const parts = [
    n ? `${n} added` : "",
    r.set.length ? `units set to the file's for ${list(r.set)}${opts.unpricedSet?.length ? ` (${list(opts.unpricedSet)}: no buy price in the file for the extra units; add ${one(opts.unpricedSet) ? "it" : "them"} under Edit)` : ""}` : "",
    r.same.length ? `${list(r.same)} already ${one(r.same) ? "has" : "have"} the file's units` : "",
    r.kept.length ? `${list(r.kept)} kept as you have ${one(r.kept) ? "it" : "them"}` : "",
    r.several.length ? `${list(r.several)} ${one(r.several) ? "has" : "have"} several buys or a sale in this account, so ${one(r.several) ? "its" : "their"} units were not set: change them under Edit` : "",
  ].filter(Boolean);
  const priced = opts.priced?.length ? ` The file's average buy price went to ${list(opts.priced)}.` : "";
  return parts.length ? `Imported into ${account}: ${parts.join("; ")}.${priced}` : `Nothing to import into ${account}.`;
}
