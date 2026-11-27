// Task #323 (developer file 22): one place that turns a company's overview, screener row and peer label into the equity sections' `Share`, so the
// equity portfolio (/holdings) and the Watchlists page (/watchlist) build the same figures from the same reads. Pure. Describes; never advice.
import { capBucket } from "./capBuckets";
import type { Share, Size } from "./equityPack";
import type { ListLeadFeed } from "./watchlistPack";
import type { OverviewHolding } from "./portfolioOverview";
import type { Row } from "./screener";

export const NOT_RANKED: Record<string, string> = { history: "has under a year of prices", liquidity: "trades too thinly to rank fairly", stale: "has no recent prices", group: "has no peer group", hidden: "is not ranked", pending: "is waiting for its first weekly reading" };

/** One company. `meta` is the portfolio page's own read (POST /api/portfolio/page), when there is one. */
export function shareOf(symbol: string, name: string | null | undefined, ov: OverviewHolding | undefined, u: Row | undefined, feed: ListLeadFeed | undefined,
  meta?: { name?: string | null; sector?: string | null }): Share {
  const h = ov && ov.status === "ready" ? ov : null, ld = feed && feed.available ? feed.rows[symbol] : undefined, pr = h?.prism;
  const size: Size | null = capBucket(h?.marketCapCr ?? u?.market_cap ?? null)?.short ?? null;
  const peer = ld && ld.available ? { label: ld.label, raw: ld.rawLabel ?? null, rank: ld.rank, of: ld.ranked, group: ld.group, vs: ld.rel52 == null ? null : ld.rel52 * 100, bench: ld.sectorKind === "index" ? ld.sector ?? "its sector index" : "peer average", direction: ld.direction ?? null } : null;
  return { symbol, name: name || h?.name || meta?.name || u?.name || null, industry: h?.sector ?? meta?.sector ?? null, size, chg: h?.changePct ?? null, prism: pr?.final ?? null, prismWord: pr?.label ?? null, valuation: pr?.parts?.valuation ?? null, risk: pr?.parts?.risk ?? null,
    st: pr?.shortTerm?.score ?? null, lt: pr?.longTerm?.score ?? null, stWord: pr?.shortTerm?.word ?? null, ltWord: pr?.longTerm?.word ?? null,
    below52: (u as { pct_from_high?: number | null } | undefined)?.pct_from_high ?? null, m1: u?.return_1m ?? null, peer,
    notCompared: ld && !ld.available ? NOT_RANKED[ld.reason] ?? "is not ranked" : feed && !feed.available ? NOT_RANKED[feed.reason] ?? "is not ranked" : null };
}
