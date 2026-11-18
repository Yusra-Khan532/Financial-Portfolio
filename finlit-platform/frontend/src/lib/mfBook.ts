// Task #235 phase 3b (the 18 Nov portfolios pack, C1, C5, C6): the MF portfolio's platforms (an app, a broker or the fund house) and each buy and sale.
// The lines are shaped like the Equity page's rows (lib/portfolio Holding): the row key is the holding's id, units are the quantity and the NAV the price, so
// lib/ledger works them out first in, first out within each fund and platform, and the Equity page's parts show them. A change to a fund's lines is saved
// with PUT /api/me/mf-portfolio/{id} after a short pause. Information only, not investment advice.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "./api";
import { DEFAULT_PF, type Holding, type Portfolio } from "./portfolio";
import type { Line, MfPortfolio } from "./mfPortfolio";

const BASE = "/api/me/mf-portfolio";
const KEY = ["mf-portfolio"];
export const keyOf = (holdingId: string) => holdingId.toUpperCase();
/** A stored line as a page row: NAV = amount ÷ units. */
export const lineRow = (hid: string, l: Line): Holding => ({ id: l.id, symbol: keyOf(hid), qty: l.units, price: l.invested != null && l.units > 0 ? Math.round((l.invested / l.units) * 10000) / 10000 : 0,
  ...(l.boughtOn ? { date: l.boughtOn } : {}), owned: true, pf: l.pf, ...(l.side === "sell" ? { side: "sell" as const } : {}) });
const uid = () => "n" + Math.random().toString(36).slice(2, 10);

export function useMfBook(on: boolean, all: MfPortfolio | undefined) {
  const qc = useQueryClient();
  const [pfs, setPfs] = useState<Portfolio[]>([]), [rows, setRows] = useState<Holding[]>([]), [err, setErr] = useState<string | null>(null);
  const cur = useRef(rows); cur.current = rows;
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const ids = useMemo(() => new Map([...(all?.holdings ?? []), ...(all?.sold ?? [])].map((h) => [keyOf(h.id), h.id])), [all]);
  useEffect(() => { if (on) apiGet<{ portfolios: Portfolio[] }>(BASE + "/book").then((b) => setPfs(b.portfolios)).catch(() => setErr("Your platforms could not be loaded.")); }, [on]);
  // the server's lines are the truth whenever the list is read again (after a save, an import or a clear); rows still being typed stay
  useEffect(() => {
    if (!all) return;
    const fromServer = [...all.holdings.flatMap((h) => (h.lines ?? []).map((l) => lineRow(h.id, l))), ...(all.sold ?? []).flatMap((h) => h.lines.map((l) => lineRow(h.id, l)))];
    setRows((old) => [...fromServer, ...old.filter((r) => r.owned && !(r.qty > 0) && !fromServer.some((x) => x.symbol === r.symbol && x.id === r.id))]);
  }, [all]);
  const saveFund = useCallback((sym: string) => {
    const t = pending.current.get(sym); if (t) clearTimeout(t);
    pending.current.set(sym, setTimeout(async () => {
      pending.current.delete(sym);
      const hid = ids.get(sym); if (!hid) return;
      const lots = cur.current.filter((r) => r.symbol === sym && r.owned && r.qty > 0).map((r) => ({ units: String(r.qty), ...(r.price > 0 ? { avgCost: String(r.price) } : {}), ...(r.date ? { boughtOn: r.date } : {}), pf: r.pf ?? DEFAULT_PF, side: r.side === "sell" ? "sell" : "buy" }));
      try { await apiSend("PUT", `${BASE}/${hid}`, { lots }); setErr(null); qc.invalidateQueries({ queryKey: KEY }); }
      catch (e) { setErr((e as { body?: { detail?: { detail?: string } } })?.body?.detail?.detail ?? "Your change could not be saved. Please try again."); }
    }, 900));
  }, [ids, qc]);
  const set = (sym: string, f: (hs: Holding[]) => Holding[]) => { setRows((hs) => { const n = f(hs); cur.current = n; return n; }); saveFund(sym); };
  const symOf = (id: string) => cur.current.find((x) => x.id === id)?.symbol ?? (id.startsWith("name-") ? id.slice(5) : "");
  const store = {
    add: (h: Omit<Holding, "id">) => set(h.symbol, (hs) => [...hs, { ...h, id: uid() }]),
    update: (id: string, h: Partial<Holding>) => { const sym = h.symbol ?? symOf(id);
      set(sym, (hs) => (hs.some((x) => x.id === id) ? hs.map((x) => (x.id === id ? { ...x, ...h } : x)) : id.startsWith("name-") ? [...hs, { qty: 0, price: 0, ...h, symbol: sym, id: uid() }] : hs)); },
    remove: (id: string) => { const sym = symOf(id); set(sym, (hs) => hs.filter((x) => x.id !== id)); },
  };
  const savePfs = (p: Portfolio[]) => { setPfs(p); apiSend("PUT", BASE + "/book", { portfolios: p }).then(() => qc.invalidateQueries({ queryKey: KEY })).catch(() => setErr("Your platforms could not be saved. Please try again.")); };
  const accounts = {
    add: (a: { name: string; broker?: string }, list: Portfolio[]) => { const id = "p" + Math.random().toString(36).slice(2, 9); savePfs([...list, { ...a, id, created: new Date().toISOString().slice(0, 10) }]); return id; },
    rename: (id: string, name: string, list: Portfolio[]) => savePfs(list.map((x) => (x.id === id ? { ...x, name } : x))),
    remove: (id: string, list: Portfolio[]) => { setRows((hs) => hs.filter((h) => (h.pf ?? DEFAULT_PF) !== id)); savePfs(list.filter((x) => x.id !== id)); },
  };
  // a fund only followed (no lines) reads as a name in the first platform, so its row offers "add a buy"
  const first = pfs[0]?.id ?? DEFAULT_PF;
  const withNames = [...rows, ...(all?.holdings ?? []).filter((h) => !rows.some((r) => r.symbol === keyOf(h.id))).map((h): Holding => ({ id: `name-${keyOf(h.id)}`, symbol: keyOf(h.id), qty: 1, price: 0, owned: false, pf: first }))];
  return { rows: withNames, pfs, err, store, accounts, get: () => [...cur.current, ...withNames.filter((h) => !h.owned)] };
}
