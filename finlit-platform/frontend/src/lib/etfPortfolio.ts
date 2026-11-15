// The ETF portfolio (task #136, pack 07): types and calls for /api/me/etf-portfolio, and the pure pieces the page is built from: the five tiles, the
// insight cards (only those that apply, at most three) and the reading of a broker file. Built like the MF portfolio. Describes, never advises.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend, type ApiError } from "./api";
import type { EtfItem } from "./etf";
import type { Card } from "./pulsePack";
import type { Grid } from "./holdingsFile";
import { dateIN } from "./format";

export type EtfHolding = EtfItem & {
  id: string; units: number | null; value: number | null; weight?: number; missing: string | null;
  index: { key: string; label: string } | null; twice?: boolean;
};
export type EtfPortfolio = { plan: string; limit: number; count: number; basis: "value" | "equal"; asOf: string | null; updatedAt: string | null; holdings: EtfHolding[]; disclaimer: string };
export type EtfRiskRow = { symbol: string; name: string; swing: number | null; worstFall: number | null; beta: number | null; fallsTaken: number | null; why: string | null; years?: number | null };
export type EtfRisk = {
  count: number; why?: string; basis: "value" | "equal"; etfs: EtfRiskRow[];
  bench: { name: string; swing: number | null; worstFall: number | null; from: string; to: string };
  list: { swing: number | null; worstFall: number | null; fallsTaken: number | null; level: { word: string; vs: string; because: string | null; riskier: string[] } | null; why: string | null };
  together: { symbols: string[]; C: (number | null)[][] | null; weeks: number; adds: Record<string, number> | null; why: string | null; leftOut: string[]; leftOutWhy: string | null };
};

const KEY = ["etf-portfolio"] as const;
const BASE = "/api/me/etf-portfolio";
export const useEtfPortfolio = (enabled: boolean) => useQuery<EtfPortfolio, ApiError>({ queryKey: KEY, queryFn: () => apiGet<EtfPortfolio>(BASE), enabled, staleTime: 30_000, retry: (n, e) => e.status >= 500 && n < 2 });
export const useEtfRisk = (enabled: boolean, n: number) => useQuery<EtfRisk, ApiError>({ queryKey: [...KEY, "risk", n], queryFn: () => apiGet<EtfRisk>(BASE + "/risk"), enabled, staleTime: 5 * 60_000, retry: false });

export type ImportRow = { isin?: string; symbol?: string; name?: string; units?: string };
export type PreviewRow = { i: number; isin: string | null; symbol: string | null; name?: string | null; status: "matched" | "not_found" | "invalid" | "duplicate"; via?: "isin" | "symbol"; units?: number | null; reason: string | null; etf: { symbol: string; name: string } | null; existing?: boolean };
export type Preview = { rows: PreviewRow[]; counts: Record<"matched" | "not_found" | "invalid" | "duplicate", number>; total: number; capacity: { limit: number; used: number; room: number } };

export function useEtfWrites() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    add: useMutation({ mutationFn: (b: { symbol: string; units?: string }) => apiSend<{ id: string; merged: boolean }>("POST", BASE, b), onSuccess: done }),
    units: useMutation({ mutationFn: (b: { id: string; units: string }) => apiSend("PUT", `${BASE}/${b.id}`, { units: b.units }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => apiSend("DELETE", `${BASE}/${id}`), onSuccess: done }),
    clear: useMutation({ mutationFn: () => apiSend<{ removed: number }>("DELETE", BASE), onSuccess: done }),
    preview: useMutation({ mutationFn: (rows: ImportRow[]) => apiSend<Preview>("POST", BASE + "/import-preview", { rows }) }),
    commit: useMutation({ mutationFn: (items: { symbol: string; units?: number | null }[]) => apiSend<{ added: number; updated: number }>("POST", BASE + "/import-commit", { items }), onSuccess: done }),
  };
}

// ------------------------------------------------------------------------------------------------ tiles
const TYPE_WORD: Record<string, [string, string]> = { equity: ["Indian shares", "Indian shares"], international: ["shares abroad", "shares abroad"], gold: ["gold", "gold"],
  silver: ["silver", "silver"], debt: ["debt", "debt"], hybrid: ["blend", "blend"] };
const liquidOf = (h: EtfHolding) => h.category === "liquid";
export const typeOf = (h: EtfHolding): string => (liquidOf(h) ? "liquid" : TYPE_WORD[h.assetClass ?? ""]?.[0] ?? "other");
const pct2 = (v: number) => `${v.toFixed(2)}%`;

export type Tiles = {
  count: { n: number; types: string };
  track: { n: number; twice: string | null; notTold: number };
  cost: { avg: number | null; perLakh: number | null; known: number };
  nav: { word: string; within: number; of: number; day: string | null; furthest: { symbol: string; premium: number } | null };
};
/** "2 Indian shares · 1 gold · 1 shares abroad · 1 liquid", the indexes followed with a "Nifty 50 twice" tag, the weighted cost and how close prices were to NAV. */
export function tiles(hs: EtfHolding[]): Tiles {
  const live = hs.filter((h) => !h.missing);
  const types = new Map<string, number>();
  for (const h of live) types.set(typeOf(h), (types.get(typeOf(h)) ?? 0) + 1);
  const idx = new Map<string, { label: string; n: number }>();
  for (const h of live) if (h.index) idx.set(h.index.key, { label: h.index.label, n: (idx.get(h.index.key)?.n ?? 0) + 1 });
  const rep = [...idx.values()].filter((x) => x.n > 1).sort((a, b) => b.n - a.n);
  const withTer = live.filter((h) => h.ter != null);
  const tw = withTer.reduce((a, h) => a + (h.weight ?? 0), 0);
  const avg = withTer.length ? (tw > 0 ? withTer.reduce((a, h) => a + (h.ter as number) * (h.weight ?? 0), 0) / tw : withTer.reduce((a, h) => a + (h.ter as number), 0) / withTer.length) : null;
  const prem = live.filter((h) => h.premium != null);
  const within = prem.filter((h) => Math.abs(h.premium as number) <= 0.2).length;
  const far = [...prem].sort((a, b) => Math.abs(b.premium as number) - Math.abs(a.premium as number))[0];
  const days = prem.map((h) => h.navDate).filter(Boolean).sort();
  return {
    count: { n: live.length, types: [...types.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t}`).join(" · ") },
    track: { n: idx.size, twice: rep.length ? rep.map((x) => `${x.label} ${x.n === 2 ? "twice" : `${x.n} times`}`).join(", ") : null, notTold: live.filter((h) => !h.index).length },
    cost: { avg: avg == null ? null : Math.round(avg * 100) / 100, perLakh: avg == null ? null : Math.round((Math.round(avg * 100) / 100) * 1000), known: withTer.length },   // the ₹ figure from the % shown
    nav: { word: !prem.length ? "No NAV yet" : within === prem.length ? "Close to NAV" : within * 2 >= prem.length ? "Mostly close to NAV" : "Often away from NAV",
      within, of: prem.length, day: days.length ? days[days.length - 1] ?? null : null, furthest: far && Math.abs(far.premium as number) > 0.2 ? { symbol: far.symbol, premium: far.premium as number } : null },
  };
}

// ------------------------------------------------------------------------------------------------ insight cards (only those that apply, at most three)
export function cards(hs: EtfHolding[], risk?: EtfRisk): Card[] {
  const live = hs.filter((h) => !h.missing), out: Card[] = [];
  const byIdx = new Map<string, EtfHolding[]>();
  for (const h of live) if (h.index) byIdx.set(h.index.key, [...(byIdx.get(h.index.key) ?? []), h]);
  const pair = [...byIdx.values()].find((g) => g.length > 1);
  if (pair) {
    const [a, b] = pair;
    const n = pair.length === 2 ? "Two" : String(pair.length);
    out.push({ kind: "watch", title: `${n} ETFs follow the ${a.index!.label}`, text: `${pair.map((x) => x.symbol).join(" and ")} follow the same index, so they hold the same companies; together they are ${Math.round(pair.reduce((s, x) => s + (x.weight ?? 0), 0))}% of your ETFs.${a.ter != null && b.ter != null && a.ter !== b.ter ? ` ${a.ter > b.ter ? a.symbol : b.symbol} costs more a year (${pct2(Math.max(a.ter, b.ter))} against ${pct2(Math.min(a.ter, b.ter))}).` : ""}`,
      groups: [{ label: `Same index · ${pair.length}`, chips: pair.map((x) => ({ symbol: x.symbol, label: x.symbol, note: x.ter != null ? pct2(x.ter) : undefined })) }] });
  }
  const prem = live.filter((h) => h.premium != null && (h.premium as number) > 1).sort((a, b) => (b.premium as number) - (a.premium as number))[0];
  if (prem) out.push({ kind: "watch", title: `${prem.symbol} closed ${pct2(prem.premium as number)} above its NAV`, text: `On ${prem.navDate ? dateIN(prem.navDate) : "the last day"} its last price was ${pct2(prem.premium as number)} above the value of what it holds (AMFI NAV); a price above NAV is paid on top of the holdings.` });
  if (risk && risk.list.swing != null) {
    const shares = risk.etfs.filter((e) => e.swing != null && ["Indian shares", "shares abroad"].includes(typeOf(live.find((h) => h.symbol === e.symbol) ?? ({} as EtfHolding))));
    const types = new Set(live.map(typeOf));
    if (types.size > 1 && shares.length && shares.every((e) => (e.swing as number) > (risk.list.swing as number)))
      out.push({ kind: "good", title: "Mixing asset types made the list steadier", text: `Your ETFs together swung ${risk.list.swing.toFixed(1)}% a year, less than any one of your share ETFs (${shares.map((e) => `${e.symbol} ${(e.swing as number).toFixed(1)}%`).join(", ")}), because ${[...types].filter((t) => !["Indian shares", "shares abroad"].includes(t)).join(" and ")} moved differently.` });
  }
  const liq = live.find(liquidOf);
  if (liq) out.push({ kind: "insight", title: `${liq.symbol} earns through payouts`, text: `A liquid ETF pays out what it earns each day, so its price barely moves: its price return says little about what it earned.` });
  for (const g of byIdx.values()) {
    if (out.length >= 3 || g.length < 2) continue;
    const priced = g.filter((h) => h.ter != null).sort((a, b) => (b.ter as number) - (a.ter as number));
    if (priced.length >= 2 && priced[0].ter !== priced[priced.length - 1].ter && !pair)
      out.push({ kind: "insight", title: `${priced[0].symbol} is the costliest on its index`, text: `${priced[0].symbol} costs ${pct2(priced[0].ter as number)} a year; ${priced[priced.length - 1].symbol}, on the same index, costs ${pct2(priced[priced.length - 1].ter as number)}.` });
  }
  return out.slice(0, 3);
}

// ------------------------------------------------------------------------------------------------ a broker file
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const SYM_HEAD = /^(symbol|trading ?symbol|scrip( ?code)?|ticker|instrument|nse ?symbol|stock ?symbol)$/i;
const QTY_HEAD = /^(qty|quantity|units?|holding qty|available qty|free qty|total qty|quantity available|balance|no\.? of (units|shares))$/i;
const NAME_HEAD = /^(name|scrip ?name|security( ?name)?|instrument ?name|company( ?name)?|stock ?name|description)$/i;
/** The rows of a broker's holdings file the server can match: any cell holding an ISIN, the symbol and quantity columns when the header names them. */
export function etfRowsFromGrid(grid: Grid): ImportRow[] {
  const head = grid.findIndex((r) => r.some((c) => SYM_HEAD.test(c.trim()) || QTY_HEAD.test(c.trim())));
  const h = head >= 0 ? grid[head].map((c) => c.trim()) : [];
  const sym = h.findIndex((c) => SYM_HEAD.test(c)), qty = h.findIndex((c) => QTY_HEAD.test(c)), name = h.findIndex((c) => NAME_HEAD.test(c));
  const out: ImportRow[] = [];
  for (const r of grid.slice(head + 1)) {
    const isin = r.map((c) => c.trim().toUpperCase()).find((c) => ISIN.test(c));
    const s = sym >= 0 ? (r[sym] ?? "").trim().toUpperCase().replace(/-(EQ|BE)$/, "") : "";
    if (!isin && (!/^[A-Z0-9&_.-]{2,24}$/.test(s) || /^(TOTAL|GRAND ?TOTAL|SUB ?TOTAL|NET)$/.test(s))) continue;   // a total line is not an ETF
    out.push({ isin, symbol: s || undefined, name: name >= 0 ? r[name]?.trim() : undefined, units: qty >= 0 ? (r[qty] ?? "").trim() : undefined });
  }
  return out.slice(0, 500);
}
