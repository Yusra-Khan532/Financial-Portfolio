// NSE's four classification levels for a company (task #192; backend finlit/taxonomy.py, docs/TAXONOMY.md):
// Macro sector (12) > Sector (22) > Industry (59) > Basic industry (197), each from NSE's own lists. Every page that names a company's group reads
// it from here, so a level is always called by its own name and every page agrees. One request per company, shared by every part of the page.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet } from "./api";

export type Level = "macro_sector" | "sector" | "industry" | "basic_industry";
export const LEVELS: Level[] = ["macro_sector", "sector", "industry", "basic_industry"];
export const LEVEL_LABEL: Record<Level, string> = { macro_sector: "Macro sector", sector: "Sector", industry: "Industry", basic_industry: "Basic industry" };

export type Classification = {
  symbol: string; isin: string | null;
  macro_sector: string | null; sector: string | null; industry: string | null; basic_industry: string | null;
  /** the rule that placed the company: basic_industry | nse_quote_page | industry | sector | macro_sector | null (not classified) */
  source: string | null;
  /** why a level is blank ("Basic industry not shown: ...", "Not classified: ..."); null when all four are known */
  note: string | null;
};

export const classificationKey = (symbol: string) => ["classification", symbol.toUpperCase()];

/** The company's four levels; `data` is null when it is not classified yet (404), undefined while loading. */
export function useClassification(symbol: string | null | undefined) {
  const sym = (symbol || "").toUpperCase();
  return useQuery<Classification | null, ApiError>({
    queryKey: classificationKey(sym), enabled: !!sym, staleTime: 10 * 60_000, retry: 1,
    queryFn: async () => {
      try {
        return await apiGet<Classification>(`/api/taxonomy/company/${encodeURIComponent(sym)}`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
}

/** NSE's levels of many companies at once (a watchlist, a portfolio: up to 200 per request): symbol -> classification; a company not placed yet is
 *  missing from the map. Each answer also fills the one-company cache, so the rest of the page reuses it. */
export function useClassifications(symbols: string[]) {
  const qc = useQueryClient();
  const syms = [...new Set(symbols.map((s) => s.toUpperCase()))].sort();
  return useQuery<Record<string, Classification>, ApiError>({
    queryKey: ["classifications", syms.join(",")], enabled: syms.length > 0, staleTime: 10 * 60_000, retry: 1,
    queryFn: async () => {
      const out: Record<string, Classification> = {};
      for (let i = 0; i < syms.length; i += 200) {
        const part = syms.slice(i, i + 200);
        const r = await apiGet<{ companies: Record<string, Classification> }>(`/api/taxonomy/companies?symbols=${encodeURIComponent(part.join(","))}`);
        Object.assign(out, r.companies);
        for (const s of part) qc.setQueryData(classificationKey(s), r.companies[s] ?? null);
      }
      return out;
    },
  });
}

/** One spelling for matching, as the server's finlit/taxonomy.py `key`: lower case, "and" as "&", only letters, digits and "&". */
export const nameKey = (name: string | null | undefined) => String(name ?? "").toLowerCase().replace(/ and /g, " & ").replace(/[^a-z0-9&]/g, "");

type TaxonomyIndex = { macro_sectors: { macro_sector: string }[]; sectors: { sector: string }[]; industries: { industry: string }[]; basic_industries: { basic_industry: string }[] };
/** A name in NSE's own spelling, whatever its commas or case ("Oil Gas & Consumable Fuels" -> "Oil, Gas & Consumable Fuels"); a name NSE's lists do not have stays as
 *  it is. Pages that receive group names from Sector Pulse (which drops NSE's commas) show them through this (task #192, rule T3: one spelling per name). */
export function useNseName(): (name: string) => string {
  const q = useQuery<TaxonomyIndex, ApiError>({ queryKey: ["taxonomy-index"], staleTime: 30 * 60_000, retry: 1, queryFn: () => apiGet<TaxonomyIndex>("/api/taxonomy") });
  const d = q.data;
  const map = new Map<string, string>();
  if (d) for (const n of [...d.macro_sectors.map((x) => x.macro_sector), ...d.sectors.map((x) => x.sector), ...d.industries.map((x) => x.industry), ...d.basic_industries.map((x) => x.basic_industry)])
    if (!map.has(nameKey(n))) map.set(nameKey(n), n);
  return (name: string) => map.get(nameKey(name)) ?? name;
}

/** For a page without React Query (the assistant's answers): the same request, same cache rules on the server. */
export async function fetchClassification(symbol: string): Promise<Classification | null> {
  try {
    return await apiGet<Classification>(`/api/taxonomy/company/${encodeURIComponent(symbol.toUpperCase())}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** The known levels, widest first, a name shared by two levels written once ("Information Technology" is both a macro sector and a sector):
 *  for a breadcrumb or a one-line mention. */
export function levelPath(c: Classification | null | undefined, levels: Level[] = LEVELS): string[] {
  const out: string[] = [];
  for (const l of levels) {
    const v = c?.[l];
    if (v && out[out.length - 1] !== v) out.push(v);
  }
  return out;
}
