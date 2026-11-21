// Task #283: which plan opens each gated feature, in one place. The old overall score is retired and FinLit Prism is FinLit's only company score; the plans are
// being rebuilt and the new plan map comes separately. Until then the gates point at these names, so setting the new map is one change here.
// The values keep today's behaviour: FinLit Prism opens on Gold (administrators in the "everything" view see it too); the rest open where they did.
import type { Plan } from "./auth";

/** FinLit Prism, the company score, and everything that reads it (scores on lists, bands, score columns, the dots on chips). */
export const PLAN_FOR_PRISM: Plan = "gold";
/** Watchlists and adding a company to one. */
export const PLAN_FOR_WATCHLIST: Plan = "silver";
/** The parts of a company report that opened on Silver (strengths and watch-outs, price statistics, the 5D and 1M intraday charts). */
export const PLAN_FOR_REPORT_EXTRAS: Plan = "silver";
/** Comparing companies: the extra columns and rows that opened on Silver. */
export const PLAN_FOR_COMPARE: Plan = "silver";
/** The dashboard's tiles and panels that opened on Silver. */
export const PLAN_FOR_DASHBOARD: Plan = "silver";
/** Alerts beyond the free ones. */
export const PLAN_FOR_ALERTS: Plan = "silver";
/** Portfolio pages (equity, mutual fund, ETF, All my investments) and their tracking. */
export const PLAN_FOR_PORTFOLIO: Plan = "silver";
/** The Stress Lab. */
export const PLAN_FOR_STRESS_LAB: Plan = "silver";
/** The stock screener's Silver features, where a page outside the screener links to them. */
export const PLAN_FOR_SCREENER: Plan = "silver";
/** Superinvestors: Gold (task #289, 21 Nov 2026: the whole feature moved to Gold; the Silver badge and lock are gone). */
export const PLAN_FOR_SUPERINVESTORS: Plan = "gold";
/** Discover (themes). */
export const PLAN_FOR_DISCOVER: Plan = "silver";
/** The forum's Silver features. */
export const PLAN_FOR_FORUM: Plan = "silver";
