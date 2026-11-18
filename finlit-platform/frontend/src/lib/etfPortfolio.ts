// ETF portfolio (task #136): the member's ETFs from /api/me/etf-portfolio, what sits inside them (/inside) and their risk against the Nifty 500 (/risk).
// The server does the sums; this file holds the shapes, the requests and the reading of a broker file into rows (ISIN, symbol, quantity).
// Information only, not investment advice.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend, type ApiError } from "./api";
import type { Grid } from "./holdingsFile";

const BASE = "/api/me/etf-portfolio";
export const KEY = ["etf-portfolio"] as const;

export type Track = { key: string | null; label: string | null; basis: "index" | "kind" | "benchmark" | null };
export type Fig = { value: number | null; why?: string | null; asOf?: string | null; source?: string | null; from?: string | null; to?: string | null };
export type EtfRow = {
  symbol: string; name: string | null; gone: boolean; why?: string; isin?: string; fundHouse?: string | null; assetClass?: string | null; group?: string | null;
  category?: string | null; categoryLabel?: string | null; benchmark?: string | null; tracks: Track; twice: boolean; qty: number | null; value?: number | null; weight?: number | null;
  price?: number | null; previousClose?: number | null; changePct?: number | null; priceDate?: string | null;
  ret1y?: number | null; ret1yWhy?: string | null; ret3y?: number | null; ret3yWhy?: string | null; ret5y?: number | null; ret5yWhy?: string | null;
  /** task #183: Indian shares, gold, silver, shares abroad, debt or liquid (payout or growth for liquid ETFs) */ type?: EtfType;
  nav?: number | null; navDate?: string | null; /** the NAV is dated before the last close */ navBehind?: boolean; premium?: number | null; premiumWhy?: string | null; avgTurnover?: number | null; avgTurnoverWhy?: string | null;
  ter?: Fig; tracking?: Fig; firstDate?: string | null;
};
export type EtfType = { key: "indian" | "gold" | "silver" | "abroad" | "debt" | "liquid"; word: string; badge: string; payout: boolean | null };
export type Repeat = { key: string; label: string; symbols: string[] };
export type EtfPortfolio = { plan: string; limit: number; count: number; items: EtfRow[]; basis: "value" | "equal"; repeats: Repeat[]; asOf: string | null; missingQty?: string[]; disclaimer: string };

export type Top = { name: string; isin: string | null; symbol: string | null; /** NSE's industry, or "Listed abroad" (task #192) */ industry: string | null; w: number; etfs: string[]; abroad: boolean; size: string | null;
  score: { model: "prism" | "iq"; score: number | null; label: string | null } | null; scoreWhy: string | null };
export type Inside = {
  count: number; why?: string; basis: "value" | "equal"; files: { symbol: string; asOf: string | null; source: string | null; why: string | null }[]; asOf: string | null;
  mix: Record<"indian" | "abroad" | "gold" | "silver" | "debt", number>; mixFromType: string[]; size: Record<"Large" | "Mid" | "Small" | "Not sized", number> | null;
  overlap: { symbols: string[]; pairs: { a: string; b: string; pct: number; n: number }[] }; top: Top[]; scoreModel: "prism" | "iq";
  /** task #183: the look-through grid over Indian shares (the MF page's shape), each share ETF's own split, holdings abroad apart */
  knownShares?: number; lookThrough?: Record<"macro" | "sector", Record<string, LtCell>>; sectorMacro?: Record<string, string>;
  perEtf?: Record<string, Record<"macro" | "sector" | "size", Record<string, number>>>; abroadTop?: Record<string, { name: string; isin: string | null; pct: number }[]>;
  etfs?: { symbol: string; assetClass: string | null; split: Record<string, number> | null; type: EtfType }[];
};
export type LtCell = { w: number; n: number; stocks: { name: string; symbol: string | null; w: number; score?: { model: "prism" | "iq"; score: number | null; label: string | null } | null }[] };
export type Band = { key: "less" | "defensive" | "similar" | "more" | "high" | "very_high"; word: string };
export type EtfRisk = {
  count: number; why?: string; basis: "value" | "equal";
  etfs: { symbol: string; category: string; liquid: boolean; weight: number; swing: number | null; worstFall: number | null; beta: number | null; fallsTaken: number | null; why: string | null;
    years?: number | null; from?: string | null; to?: string | null;
    /** task #183: against the Nifty 500 on weekly closes, past year */ type?: EtfType; compared?: boolean; betaPast?: number | null; explained?: number | null; band?: Band | null;
    downPer100?: number | null; upPer100?: number | null; oneYear?: number | null; benchOneYear?: number | null; riskShare?: number | null; differentAsset?: boolean; betaWhy?: string | null }[];
  bench: { name: string; swing: number | null; worstFall: number | null; from: string; to: string };
  list: { swing: number | null; worstFall: number | null; fallsTaken: number | null; beta: number | null; level: { word: string; vs: string; because: string | null } | null; why: string | null };
  together: { symbols: string[]; pairs: { a: string; b: string; r: number | null; weeks: number; why: string | null }[]; from: string | null; to: string | null; leftOut: string[] };
  adds: { shares: Record<string, number>; why: string | null; from?: string; to?: string };
  own?: { from: string; to: string; list: { betaOwn: number | null; betaOwnBand: Band | null; betaExLiquid: number | null; betaExLiquidBand: Band | null; beta500: number | null; beta500Band: Band | null;
    betaIndian: number | null; betaIndianBand: Band | null; liquidShare: number | null; worst10: { list: number | null; nifty500: number | null };
    fall10: { own: number | null; nifty500: number | null; indian: number | null }; leftOutOfFall: string[] } };
};

const retry = (n: number, e: ApiError) => e.status >= 500 && n < 2;
/** Task #235: `pf` reads one account ("all": every account together, as before). */
const q = (pf: string) => (pf && pf !== "all" ? `?pf=${encodeURIComponent(pf)}` : "");
export const useEtfPortfolio = (on: boolean, pf = "all") => useQuery<EtfPortfolio, ApiError>({ queryKey: pf === "all" ? KEY : [...KEY, "pf", pf], queryFn: () => apiGet<EtfPortfolio>(BASE + q(pf)), enabled: on, staleTime: 30_000, retry });
export const useEtfInside = (on: boolean, n: string, pf = "all") => useQuery<Inside, ApiError>({ queryKey: [...KEY, "inside", n, pf], queryFn: () => apiGet<Inside>(BASE + "/inside" + q(pf)), enabled: on, staleTime: 5 * 60_000, retry: false });
export const useEtfRisk = (on: boolean, n: string, pf = "all") => useQuery<EtfRisk, ApiError>({ queryKey: [...KEY, "risk", n, pf], queryFn: () => apiGet<EtfRisk>(BASE + "/risk" + q(pf)), enabled: on, staleTime: 5 * 60_000, retry: false });

export type RawRow = { row: number; isin?: string; symbol?: string; name?: string; qty?: string };
export type PreviewRow = { i: number; row: number; name: string | null; isin: string | null; symbol: string | null; qty: number | null; status: "matched" | "not_found" | "ignored" | "invalid" | "duplicate";
  reason: string; existing: boolean; etf: { symbol: string; name: string; fundHouse: string | null } | null };
export type Preview = { rows: PreviewRow[]; counts: Record<PreviewRow["status"], number>; total: number; capacity: { limit: number; used: number; room: number } };

export function useEtfWrites() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    add: useMutation({ mutationFn: (b: { symbol: string; qty?: string | null }) => apiSend<{ symbol: string; merged: boolean }>("POST", BASE, b), onSuccess: done }),
    quantities: useMutation({ mutationFn: (items: { symbol: string; qty: string | null }[]) => apiSend<{ updated: number }>("PUT", BASE + "/quantities", { items }), onSuccess: done }),
    remove: useMutation({ mutationFn: (symbol: string) => apiSend("DELETE", `${BASE}/${encodeURIComponent(symbol)}`), onSuccess: done }),
    clear: useMutation({ mutationFn: () => apiSend<{ removed: number; undoSeconds: number }>("POST", BASE + "/clear"), onSuccess: done }),
    undoClear: useMutation({ mutationFn: () => apiSend<{ restored: number }>("POST", BASE + "/undo-clear"), onSuccess: done }),
    preview: useMutation({ mutationFn: (rows: RawRow[]) => apiSend<Preview>("POST", BASE + "/import-preview", { rows }) }),
    commit: useMutation({ mutationFn: (b: { items: { symbol: string; qty: number | null }[]; existing: "skip" | "replace" }) =>
      apiSend<{ added: number; replaced: number; skipped: number }>("POST", BASE + "/import-commit", b), onSuccess: done }),
  };
}

// ------------------------------------------------------------------------------------------------ a broker file -> rows
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const H_ISIN = /^isin(\s*(code|no\.?|number))?$/i;
const H_SYM = /^(symbol|trading ?symbol|tradingsymbol|ticker|scrip( ?(code|name|symbol))?|stock( ?(symbol|name))?|instrument( ?name)?|security( ?name)?|nse ?(symbol|code)?)$/i;
const H_NAME = /^(name|company( ?name)?|security name|scheme( ?name)?|etf( ?name)?|description)$/i;
const H_QTY = /^(qty|quantity|quantity available|total quantity|units?|no\.? of (shares|units)|shares|holding|holdings|balance|free ?qty|available ?qty|current ?qty)\.?$/i;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** The rows of one sheet: the header row is the first that names an ISIN or symbol column; the quantity is read from its own column when there is one.
 *  Lines without an ISIN or symbol (totals, titles) are left out. A sheet with no header still gives its ISINs, found in any cell. */
export function etfRowsFromGrid(grid: Grid): RawRow[] {
  const at = grid.findIndex((r) => r.some((c) => H_ISIN.test(clean(c))) || r.some((c) => H_SYM.test(clean(c))));
  if (at < 0) {
    const out: RawRow[] = [];
    grid.forEach((r, i) => { const isin = r.map((c) => clean(c).toUpperCase()).find((c) => ISIN_RE.test(c)); if (isin) out.push({ row: i + 1, isin }); });
    return out;
  }
  const head = grid[at].map(clean);
  const col = (re: RegExp) => head.findIndex((c) => re.test(c));
  const ci = col(H_ISIN), cs = col(H_SYM), cn = col(H_NAME), cq = col(H_QTY);
  const out: RawRow[] = [];
  for (let i = at + 1; i < grid.length; i++) {
    const r = grid[i], cell = (k: number) => (k >= 0 ? clean(r[k] ?? "") : "");
    const isin = cell(ci).toUpperCase(), sym = cell(cs);
    if (!ISIN_RE.test(isin) && !(sym && /^[A-Za-z0-9&_.:\-]{1,30}$/.test(sym) && !/^(total|grand total)$/i.test(sym))) continue;
    out.push({ row: i + 1, ...(ISIN_RE.test(isin) ? { isin } : {}), ...(sym ? { symbol: sym } : {}), ...(cell(cn) ? { name: cell(cn) } : {}), ...(cell(cq) ? { qty: cell(cq) } : {}) });
  }
  return out;
}

/** The rows of a whole file: the sheet with the most usable rows wins. */
export async function etfRowsFromFile(file: File): Promise<RawRow[]> {
  const { gridsFromFile } = await import("./holdingsFile");
  let best: RawRow[] = [];
  for (const g of await gridsFromFile(file)) { const r = etfRowsFromGrid(g); if (r.length > best.length) best = r; }
  return best;
}
