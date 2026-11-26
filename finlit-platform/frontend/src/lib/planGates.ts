// Task #283: which plan opens each gated feature, in one place. FinLit Prism is FinLit's only company score.
// Task #410 (owner, 27 Nov 2026): the plans are the landing page's (landing/goliveData.js). A gate names an access tier (basic, silver, gold) or what a
// tier cannot say: "platinum" (a Platinum-only tool), "equity" (the shares you own: Equity Portfolio, combined, Gold, Platinum) and "mfetf" (funds and
// ETFs: Mutual Fund + ETF, combined, Gold, Platinum). lib/ui's has() reads all of them; the server checks the same (entitlements.is_platinum, in_area).
// Every account that had a feature before keeps it: migration 145 moved old Silver and Gold accounts to Platinum.
import type { Plan } from "./auth";
import type { Gate } from "./ui";

/** FinLit Prism, the company score, and everything that reads it (scores on lists, bands, score columns, the dots on chips). */
export const PLAN_FOR_PRISM: Plan = "gold";
/** Watchlists and adding a company to one (goliveData: Equity Portfolio 1 list, Gold 4, Platinum 8). */
export const PLAN_FOR_WATCHLIST: Gate = "equity";
/** The parts of a company report that opened on Silver (strengths and watch-outs, price statistics, the 5D and 1M intraday charts). */
export const PLAN_FOR_REPORT_EXTRAS: Plan = "silver";
/** Comparing companies: the extra columns and rows that opened on Silver. */
export const PLAN_FOR_COMPARE: Plan = "silver";
/** The dashboard's tiles and panels that opened on Silver. */
export const PLAN_FOR_DASHBOARD: Plan = "silver";
/** Alerts beyond the free ones. */
export const PLAN_FOR_ALERTS: Plan = "silver";
/** The equity portfolio and its tracking (the shares you own): Equity Portfolio, combined, Gold and Platinum. */
export const PLAN_FOR_PORTFOLIO: Gate = "equity";
/** Task #410: the mutual fund and ETF portfolios: Mutual Fund + ETF, combined, Gold and Platinum. */
export const PLAN_FOR_FUND_PORTFOLIO: Gate = "mfetf";
/** The Stress Lab: a Platinum tool (goliveData), or the Stress Lab add-on. */
export const PLAN_FOR_STRESS_LAB: Gate = "platinum";
/** The stock screener's Silver features, where a page outside the screener links to them. */
export const PLAN_FOR_SCREENER: Plan = "silver";
/** Superinvestors: Gold (task #289, 21 Nov 2026: the whole feature moved to Gold). */
export const PLAN_FOR_SUPERINVESTORS: Plan = "gold";
/** Discover (themes). */
export const PLAN_FOR_DISCOVER: Plan = "silver";
/** The forum's Silver features. */
export const PLAN_FOR_FORUM: Plan = "silver";
/** Task #410: All my investments (shares, funds and ETFs together): the combined plan, Gold and Platinum (goliveData; not a one-area plan alone). */
export const PLAN_FOR_ALL_INVESTMENTS: Gate = "combined";
