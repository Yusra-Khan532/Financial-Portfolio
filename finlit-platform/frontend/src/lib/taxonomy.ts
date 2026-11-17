// NSE's four classification levels for a company (task #192; backend finlit/taxonomy.py, docs/TAXONOMY.md):
// Macro sector (12) > Sector (22) > Industry (59) > Basic industry (197), each from NSE's own lists. Every page that names a company's group reads
// it from here, so a level is always called by its own name and every page agrees. One request per company, shared by every part of the page.
import { useQuery } from "@tanstack/react-query";
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
