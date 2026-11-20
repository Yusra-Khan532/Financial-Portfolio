// Typo-tolerant company search over the search index (/api/stocks/search-index rows: [symbol, name, bse, ready, nse?]).
// Order: exact symbol > symbol prefix > name words > fuzzy (a near-miss symbol beats a near-miss name, so "relaince" puts RELIANCE first).
// Pure, so it is tested without the page. Reuses the edit distance and word matching of metricSearch.
import { distance, score, tokens } from "./metricSearch";

export type CompanyRow = readonly [symbol: string, name: string, ...rest: unknown[]];
export type CompanyHit = { symbol: string; name: string; rank: number };

const allow = (n: number) => (n <= 3 ? 0 : n <= 5 ? 1 : 2);
/** Index rows that are not companies (Graph Studio prefixes indices with "^"). */
const isCompany = (sym: string) => !!sym && !sym.startsWith("^");

/** Rank of one row for a query; 0 = no match. Higher is better. */
export function companyRank(query: string, symbol: string, name: string): number {
  const q = query.trim();
  if (!q) return 0;
  const qs = q.toUpperCase().replace(/\s+/g, ""), sym = symbol.toUpperCase();
  if (sym === qs) return 1000;
  if (sym.startsWith(qs)) return 900 - Math.min(99, sym.length - qs.length);
  if (/^\d+$/.test(qs)) return 0;                // task #274 (pack change 1): digits only are a BSE code: matched exactly or by its start, never as a close match ("526433" brought 5 unrelated codes)
  const n = score(q, name);                       // 100 exact, 90 prefix, 80 every word starts a name word, 60 contained, 40 near miss
  if (n >= 60) return 400 + n;
  const qc = tokens(q).join(""), sc = sym.toLowerCase().replace(/[^a-z0-9]/g, "");
  const symNear = qc.length >= 4 && (distance(qc, sc) <= allow(qc.length) || distance(qc, sc.slice(0, qc.length)) <= allow(qc.length));
  if (symNear) return 300 - Math.min(distance(qc, sc), distance(qc, sc.slice(0, qc.length)));   // a typo in what was typed so far ("relai" is RELIANCE, not RELAXO)
  return n > 0 ? 200 : 0;
}

/** Rank by the other names a company is found under: its BSE code (row[2]), a differing NSE code (row[4]) and its ISIN. */
export function aliasRank(query: string, row: CompanyRow, isin?: string): number {
  const qs = query.trim().toUpperCase().replace(/\s+/g, "");
  if (!qs) return 0;
  const bse = row[2], nse = row[4];
  if (typeof bse === "string" && bse && bse === qs) return 950;
  if (typeof nse === "string" && nse && nse.toUpperCase().startsWith(qs)) return 880;
  if (isin && qs.length >= 6 && /^[A-Z0-9]+$/.test(qs) && isin.startsWith(qs)) return isin === qs ? 960 : 870;
  return 0;
}

/** Best matches first; clear matches (name or symbol, rank 400+) keep shorter names first (the parent company before its subsidiaries), close matches go by the
 *  index order, which is company size (task #274); when 3 or more clear matches exist, close matches are left out ("aarti" gives the four Aartis only). */
export function rankCompanies(rows: readonly CompanyRow[] | undefined, query: string, limit = 8, exclude: readonly string[] = [], isin?: ReadonlyMap<string, string>): CompanyHit[] {
  if (!rows?.length || !query.trim()) return [];
  const skip = new Set(exclude.map((s) => s.toUpperCase()));
  const out: (CompanyHit & { i: number })[] = [];
  rows.forEach((r, i) => {
    const symbol = String(r[0] ?? ""), name = String(r[1] ?? symbol);
    if (!isCompany(symbol) || skip.has(symbol.toUpperCase())) return;
    let rank = companyRank(query, symbol, name);
    rank = Math.max(rank, aliasRank(query, r, isin?.get(symbol)));
    if (rank > 0) out.push({ symbol, name, rank, i });
  });
  out.sort((a, b) => b.rank - a.rank || (b.rank >= 400 ? a.name.length - b.name.length : 0) || a.i - b.i);
  const clear = out.filter((x) => x.rank >= 400);
  return (clear.length >= 3 ? clear : out).slice(0, limit).map(({ symbol, name, rank }) => ({ symbol, name, rank }));
}
