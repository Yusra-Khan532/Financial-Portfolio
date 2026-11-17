// Tests only: wrap a component in a React Query client already holding companies' NSE classifications (lib/taxonomy.ts), so a static or synchronous
// render shows them without a request. A symbol given as null reads as "not classified yet" (404); a symbol left out stays loading.
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { classificationKey, type Classification } from "./taxonomy";

export const cls = (symbol: string, macro: string | null, sector: string | null, industry: string | null, basic: string | null, note: string | null = null): Classification =>
  ({ symbol, isin: null, macro_sector: macro, sector, industry, basic_industry: basic, source: macro ? (basic ? "basic_industry" : "industry") : null, note });

export function withClassifications(node: ReactNode, known: Record<string, Classification | null> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, enabled: false } } });
  for (const [symbol, c] of Object.entries(known)) client.setQueryData(classificationKey(symbol), c);
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}
