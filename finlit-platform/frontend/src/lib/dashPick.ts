// Task #248 (dashboard update pack of 19 Nov 2026): which portfolios the dashboard's Step 1 reads. One choice per kind (Equity, Mutual funds, ETFs), saved in
// the account's settings (prefs.dashPortfolios, the same on every device), "all" by default. The portfolios are the portfolio pages' own (task #235): Equity's
// from the portfolio store, the MF platforms and ETF accounts from their books. Step 1's blocks are given only the chosen holdings (Equity) or ask the server
// for the chosen accounts (MF and ETF, ?pf=a,b); how they draw does not change. Describes holdings; never advice.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import { prefs, usePrefs, type PfChoice } from "./prefs";
import { DEFAULT_PF, usePortfolio, type Holding, type Portfolio } from "./portfolio";
import { aggOf } from "./ledger";
import { useMfPortfolio, type MfPortfolio } from "./mfPortfolio";
import { toRow, type Book } from "./etfBook";

export type PickKind = "equity" | "mf" | "etf";
export const PICK_KINDS: PickKind[] = ["equity", "mf", "etf"];
export const KIND_WORD: Record<PickKind, string> = { equity: "Equity", mf: "Mutual funds", etf: "ETFs" };
/** The name each page gives its holdings before any portfolio is named (the portfolio pages' own words). */
export const DEFAULT_NAME: Record<PickKind, string> = { equity: "My portfolio", mf: "My funds", etf: "My ETFs" };
export const PAGE_OF: Record<PickKind, string> = { equity: "/holdings", mf: "/mf-portfolio", etf: "/etf-portfolio" };
const NOUN: Record<PickKind, [string, string]> = { equity: ["share", "shares"], mf: ["fund", "funds"], etf: ["ETF", "ETFs"] };

/** One portfolio in a picker: its name, where it comes from ("Dhan account" when a broker was named, else "Added by you") and how many holdings it has. */
export type Account = { id: string; name: string; from: string; n: number; noun: string };
/** "all", or the ids of the chosen portfolios (only ones that exist; every one of them chosen reads as "all"). */
export type Resolved = "all" | string[];

export function accountsOf(kind: PickKind, pfs: Portfolio[] | undefined, counts: ReadonlyMap<string, number>): Account[] {
  const list: Portfolio[] = pfs?.length ? pfs : [{ id: DEFAULT_PF, name: DEFAULT_NAME[kind] }];
  return list.map((p) => { const n = counts.get(p.id) ?? 0; return { id: p.id, name: p.name, from: p.broker ? `${p.broker} account` : "Added by you", n, noun: NOUN[kind][n === 1 ? 0 : 1] }; });
}

export function resolve(choice: PfChoice, accs: Account[]): Resolved {
  if (choice === "all") return "all";
  const ids = accs.filter((a) => choice.includes(a.id)).map((a) => a.id);
  return !ids.length || ids.length === accs.length ? "all" : ids;
}
/** The server's ?pf=: "all", one id, or ids joined by commas. */
export const pfParam = (r: Resolved) => (r === "all" ? "all" : r.join(","));
/** The button's text: "All accounts", one name, "Dhan + Upstox" or "3 of 5 accounts". With one portfolio it is that portfolio's name. */
export function choiceLabel(r: Resolved, accs: Account[]): string {
  if (r === "all") return accs.length === 1 ? accs[0].name : "All accounts";
  const names = accs.filter((a) => r.includes(a.id)).map((a) => a.name);
  return names.length === 1 ? names[0] : names.length === 2 ? names.join(" + ") : `${names.length} of ${accs.length} accounts`;
}
/** Ticking or unticking one portfolio; unticking the last goes back to All accounts. */
export function toggle(r: Resolved, id: string, accs: Account[]): PfChoice {
  const cur = r === "all" ? accs.map((a) => a.id) : r;
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  return !next.length || next.length === accs.length ? "all" : next;
}

// ------------------------------------------------------------------------------------------------ what each portfolio holds
/** Equity: each portfolio's shares still held (first in, first out within it; a name only counts, a share sold in full does not). */
export function equityHeld(hs: Holding[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const seen = new Set<string>();
  for (const h of hs) {
    const pf = h.pf ?? DEFAULT_PF, sym = h.symbol.toUpperCase(), k = pf + "|" + sym;
    if (seen.has(k)) continue;
    seen.add(k);
    const rows = hs.filter((x) => (x.pf ?? DEFAULT_PF) === pf && x.symbol.toUpperCase() === sym);
    const nameOnly = rows.every((x) => !x.owned);
    if (nameOnly || (aggOf(hs, sym, pf)?.qty ?? 0) > 0) { if (!out.has(pf)) out.set(pf, new Set()); out.get(pf)!.add(sym); }
  }
  return out;
}
/** Mutual funds: each platform's funds (bought less sold above zero); a fund only followed sits in the first platform. Keyed by scheme code. */
export function mfHeld(d: MfPortfolio | undefined, first: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (pf: string, code: string) => { if (!out.has(pf)) out.set(pf, new Set()); out.get(pf)!.add(code); };
  for (const h of d?.holdings ?? []) {
    const lines = h.lines ?? [];
    if (!lines.length) { add(first, String(h.code)); continue; }
    const net = new Map<string, number>();
    for (const l of lines) net.set(l.pf, (net.get(l.pf) ?? 0) + (l.side === "sell" ? -l.units : l.units));
    for (const [pf, u] of net) if (u > 1e-6) add(pf, String(h.code));
  }
  return out;
}
/** ETFs: each account's ETFs with units left (first in, first out within it); an ETF with no buys stored sits in the first account. */
export function etfHeld(b: Book | undefined, first: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (pf: string, sym: string) => { if (!out.has(pf)) out.set(pf, new Set()); out.get(pf)!.add(sym); };
  const rows = (b?.lots ?? []).map(toRow);
  for (const k of new Set(rows.map((r) => (r.pf ?? DEFAULT_PF) + "|" + r.symbol))) {
    const [pf, sym] = k.split("|");
    if ((aggOf(rows, sym, pf)?.qty ?? 0) > 0) add(pf, sym);
  }
  for (const s of b?.names ?? []) add(first, s);
  return out;
}
const countsOf = (m: Map<string, Set<string>>) => new Map([...m].map(([k, v]) => [k, v.size]));
/** Which chosen portfolios hold each item ("held in Dhan"), shown only when the kind has two or more portfolios. */
function heldIn(m: Map<string, Set<string>>, accs: Account[], r: Resolved): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (accs.length < 2) return out;
  for (const a of accs) {
    if (r !== "all" && !r.includes(a.id)) continue;
    for (const k of m.get(a.id) ?? []) out.set(k, [...(out.get(k) ?? []), a.name]);
  }
  return out;
}

export type DashPick = {
  accounts: Record<PickKind, Account[]>; choice: Record<PickKind, Resolved>; param: Record<PickKind, string>;
  /** Equity: the holdings of the chosen portfolios only */ holdings: Holding[];
  heldIn: Record<PickKind, Map<string, string[]>>;
  /** "Equity: Dhan · ETFs: Upstox" when anything is filtered, for the subtitle of "Your investments today" */ showing: string | null;
  set: (kind: PickKind, c: PfChoice) => void;
};

export function useDashPick(silver: boolean): DashPick {
  const p = usePrefs(), pf = usePortfolio();
  const mfAll = useMfPortfolio(silver);
  const mfBook = useQuery({ queryKey: ["mf-portfolio", "book"], queryFn: () => apiGet<{ portfolios: Portfolio[] }>("/api/me/mf-portfolio/book"), enabled: silver, staleTime: 60_000, retry: false });
  const etfBook = useQuery({ queryKey: ["etf-portfolio", "book"], queryFn: () => apiGet<Book>("/api/me/etf-portfolio/book"), enabled: silver, staleTime: 60_000, retry: false });
  return useMemo(() => {
    const eqM = equityHeld(pf.holdings);
    const mfFirst = mfBook.data?.portfolios?.[0]?.id ?? DEFAULT_PF, etfFirst = etfBook.data?.portfolios?.[0]?.id ?? DEFAULT_PF;
    const mfM = mfHeld(mfAll.data, mfFirst), etfM = etfHeld(etfBook.data, etfFirst);
    const accounts = { equity: accountsOf("equity", pf.portfolios, countsOf(eqM)), mf: accountsOf("mf", mfBook.data?.portfolios, countsOf(mfM)), etf: accountsOf("etf", etfBook.data?.portfolios, countsOf(etfM)) };
    const choice = { equity: resolve(p.dashPortfolios.equity, accounts.equity), mf: resolve(p.dashPortfolios.mf, accounts.mf), etf: resolve(p.dashPortfolios.etf, accounts.etf) };
    const eq = choice.equity;
    const holdings = eq === "all" ? pf.holdings : pf.holdings.filter((h) => eq.includes(h.pf ?? DEFAULT_PF));
    const showing = PICK_KINDS.filter((k) => choice[k] !== "all").map((k) => `${KIND_WORD[k]}: ${choiceLabel(choice[k], accounts[k])}`).join(" · ") || null;
    return {
      accounts, choice, param: { equity: pfParam(choice.equity), mf: pfParam(choice.mf), etf: pfParam(choice.etf) }, holdings, showing,
      heldIn: { equity: heldIn(eqM, accounts.equity, choice.equity), mf: heldIn(mfM, accounts.mf, choice.mf), etf: heldIn(etfM, accounts.etf, choice.etf) },
      set: (kind, c) => prefs.set({ dashPortfolios: { ...prefs.get().dashPortfolios, [kind]: c } }),
    };
  }, [p.dashPortfolios, pf.holdings, pf.portfolios, mfAll.data, mfBook.data, etfBook.data]);
}
