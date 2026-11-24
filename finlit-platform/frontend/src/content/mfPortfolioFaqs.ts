import type { PageFaq } from "./pageFaqs";
import { planName } from "../lib/planNames";
import { PLAN_FOR_PORTFOLIO } from "../lib/planGates";

// Task #183 part 2: the pack's nine questions (02-mf-portfolio, 15 Nov), written for any list and any plan.
export const MF_PORTFOLIO_FAQ: PageFaq = {
  id: "mf-portfolio", title: "MF portfolio", section: "Your workspace", routes: ["/mf-portfolio"], plan: planName(PLAN_FOR_PORTFOLIO),   // task #389 (fault 1): read from the plan list, never a fixed name
  items: [
    { q: "How does FinLit see inside my funds?", a: "Each fund house publishes its holdings once a month. FinLit reads those files, adds up the stocks across your funds and describes how much they overlap and how they are spread. A fund whose file is not loaded yet is named and left out." },
    { q: "Why is each fund compared with a different benchmark?", a: "A small-cap fund is measured against small companies and a hybrid fund against a mix of shares, debt and gold. Comparing every fund with one broad index makes a small-cap fund look riskier than its own market, and a hybrid fund look calmer than it is against its own." },
    { q: "How are company sizes decided here?", a: "By market value, in fixed amounts that are the same on every FinLit page: above ₹75,000 Cr is large, ₹25,000 to 75,000 Cr mid, ₹10,000 to 25,000 Cr small, below ₹10,000 Cr micro. SEBI's fund categories rank companies instead (the first 100 large, the next 150 mid), so a fund's category and its sizes here can differ." },
    { q: "How do I add my mutual funds?", a: "Search by name or ISIN, or import a CAS statement, Excel or CSV file. Each fund is read by its ISIN: Direct and Regular plans, and Growth and IDCW options, each have their own." },
    { q: "What does the Mutual Fund Score show here?", a: "How a fund has done on performance, risk, cost and quality against funds in its own category. It describes the past; it is not a recommendation." },
    { q: "Why are the 1, 3 and 5 year returns blank for some funds?", a: "IDCW options pay out, so their NAV does not show the full return. The Growth option of the same fund does. A fund younger than a year has no 1-year return yet, and one younger than 3 or 5 years has no 3- or 5-year return." },
    { q: "Why does the liquid fund lower every risk figure?", a: "Until units are added, each fund counts the same, so a liquid fund is a full share of the list. It barely moves, so it pulls the list's swings and beta down by its share. The Risk analytics tab shows the beta with and without it." },
    { q: "What happens when the same fund appears twice?", a: "It is shown once, with both folios. A line repeated in a file is counted once." },
    { q: "How many funds can I add?", a: "Up to your plan's limit; the header shows how many you have. \"Clear portfolio\" removes them all, with 10 seconds to undo. The portfolio pages have no download." },
  ],
};
