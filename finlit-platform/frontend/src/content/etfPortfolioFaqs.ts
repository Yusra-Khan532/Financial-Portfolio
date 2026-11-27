import type { PageFaq } from "./pageFaqs";
import { LIMITS, tierOf } from "../lib/auth";
import { planName, plansOpening } from "../lib/planNames";
import { PLAN_FOR_FUND_PORTFOLIO } from "../lib/planGates";

/** Task #390 (developer file 39 v4, C1): the member's own limit, "Your plan holds up to 15 ETFs.", with the number from `limit` in
 *  /api/me/etf-portfolio (the page passes it in with setEtfLimit once the list has loaded). Without it (a visitor, or a plan without the page: task #390
 *  fault 1, Basic was told "up to 15 ETFs"), how many each plan that has the page holds, from the plan list and the plan limits. Exported for tests. */
let shownLimit: number | null = null;
export const setEtfLimit = (n: number | null) => { shownLimit = n; };
export function etfLimitLine(n: number | null = shownLimit): string {
  if (n != null) return `Your plan holds up to ${n} ETFs.`;
  const by = new Map<number, string[]>();
  for (const p of plansOpening(PLAN_FOR_FUND_PORTFOLIO)) { const k = LIMITS[tierOf(p.id)].etf_holdings; by.set(k, [...(by.get(k) ?? []), p.name]); }   // task #410
  const and = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  return [...by].map(([k, names]) => `${and(names)} ${names.length === 1 ? "holds" : "hold"} up to ${k} ETFs.`).join(" ");
}

/** The ETF portfolio's seven questions (task #183 part 3, the 15 Nov pack 03 §5), in the pack's words. */
export const ETF_PORTFOLIO_FAQ: PageFaq = {
  id: "etf-portfolio", title: "ETF portfolio", section: "Your workspace", routes: ["/etf-portfolio"], plan: planName(PLAN_FOR_FUND_PORTFOLIO),   // task #390 (fault 1): read from the plan list, never a fixed name
  items: [
    { q: "How do I add my ETFs?", get a() { return "Search by name, NSE symbol or ISIN, or import a broker file. Each ETF is read by its ISIN; a row without one is matched on the NSE symbol and shown for you to confirm. \"Clear portfolio\" removes them all, with 10 seconds to undo. Add quantities to count each ETF by its value; until every ETF has a quantity, each counts the same. " + etfLimitLine(); } },   // read when shown, from the plan list and limits
    { q: "Why does an ETF trade above or below its NAV?", a: "Its price is set by buyers and sellers on the exchange; its NAV is the value of what it holds. When demand runs ahead of new units being made, as with some overseas ETFs, the price can sit well above the NAV. An ETF that holds shares abroad publishes its NAV a day behind its price; the page says so under the figure." },
    { q: "Why is the beta against the Nifty 500 and not each ETF's own index?", a: "An index ETF is built to copy its own index, so its beta against that index is close to 1 by design. Against the Nifty 500 the beta shows how much the ETF moves with the Indian market as a whole. Where the Nifty 500 explains under a fifth of an ETF's moves (gold, shares abroad), the page calls it a different asset and leaves out its down-week and up-week figures." },
    { q: "What is tracking difference?", a: "The gap between the ETF's return and its index's return over a year. Costs and cash held usually make it slightly negative. It is blank where the index's daily levels are not on file." },
    { q: "Why do two ETFs show 100% overlap?", a: "They follow the same index, so they hold the same companies in the same weights. Holding both adds no spread across companies; what differs is the fund house, the cost and how much trades each day." },
    { q: "Why is the 5-year return blank for some ETFs?", a: "The ETF has less than five years of prices. A liquid ETF that pays out what it earns keeps a flat price, so its price return is left blank too; hover over or focus the dash to read the reason." },
    { q: "Are dividends included in the returns?", a: "No. Returns are price returns, from NSE closing prices. Information only, not investment advice." },
  ],
};
