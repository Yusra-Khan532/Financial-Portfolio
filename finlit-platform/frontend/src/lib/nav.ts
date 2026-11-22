// The site's map, in one place. The header menus, the phone menu, the left rail of the product pages and the footer are all built from this list,
// so a page is named, grouped and ordered the same way everywhere. Each entry is [path, label, one line about it, icon].
// `gold` marks tools that need the Gold plan (shown as a small tag, never hidden: locked tools stay visible behind an unlock card).

export type NavItem = { to: string; label: string; sub: string; icon: string; gold?: boolean; end?: boolean; not?: string; newUntil?: string };
export type NavGroup = { title?: string; items: NavItem[] };
export type NavSection = { id: string; label: string; wide?: boolean; groups: NavGroup[] };

const i = (to: string, label: string, sub: string, icon: string, o: { gold?: boolean; end?: boolean; not?: string; newUntil?: string } = {}): NavItem => ({ to, label, sub, icon, ...o });

/** A page carries a "New" tag in the menus until its `newUntil` day (task #136: 30 days from launch). */
export const isNew = (n: { newUntil?: string }, now: number = Date.now()) => !!n.newUntil && now < Date.parse(n.newUntil + "T00:00:00+05:30");

/** Pages a Gold member is not offered (founder, 13 Nov 2026, task #100). Empty since task #283: the Basic stock screener, the one page listed, is retired with its
 *  score, and its address opens the Advanced stock screener for everyone. Menus, the left rail, page links and tool cards still pass through `offeredTo`. */
export const NOT_FOR_GOLD = new Set<string>();
export const offeredTo = (gold: boolean) => (n: { to: string }) => !(gold && NOT_FOR_GOLD.has(n.to.split(/[?#]/)[0]));

/* Task #282 (the workspace-menu file of 21 Nov 2026): ONE list of groups, each with its heading, the line under it, its folded word, its icon and its pages.
   The side menu, the folded rail and its pop-outs, Find a page and the top bar's group titles are all built from it, so they cannot drift apart again.
   Rules for a heading (for pages added later): name what is inside in the reader's words, four words or fewer; one line under it listing the kinds of
   pages inside; no plan names as headings (the Gold dot stays on the page); one name everywhere; a new page joins the group whose line describes it;
   order follows the job: what you own, finding, studying, comparing and valuing a company, markets, results, funds, learning. */
export type MenuGroup = { id: string; title: string; line: string; short: string; icon: string; items: NavItem[] };

/** Dashboard sits on its own at the top of the menu, not in a group. */
export const DASHBOARD: NavItem = i("/dashboard", "Dashboard", "Your day at a glance: prices, alerts and scores of what you follow", "table");

export const MENU: MenuGroup[] = [
  { id: "mine", title: "My portfolio & watchlists", line: "Your holdings, watchlists, alerts and baskets", short: "Portfolio", icon: "wallet", items: [
    i("/my-investments", "All my investments", "Your shares, mutual funds and ETFs together, looked through to the companies inside", "layers"),   // task #137 (NEW tag in the rail)
    i("/holdings", "Equity portfolio", "Score and mix of the shares you hold", "pie"),
    i("/mf-portfolio", "MF portfolio", "Score, value and returns of the mutual funds you hold", "pie"),
    i("/etf-portfolio", "ETF portfolio", "What your ETFs track and cost, what sits inside them and how risky they are together", "pie", { newUntil: "2026-12-15" }),
    i("/watchlist", "Watchlists", "Follow stocks in named lists", "wallet"),
    i("/alerts", "Alerts", "Price, signals, scores and filings", "bell"),
    i("/baskets", "My baskets", "Saved groups of companies from the query builder", "layers"),
  ] },
  { id: "find", title: "Find stocks", line: "Screeners, themes and what big investors hold", short: "Find", icon: "search", items: [
    i("/screener", "Stock screener", "Filter every listed company by size, valuation, growth and debt", "table"),
    i("/advanced-score-screener", "Advanced stock screener", "Every listed company with its FinLit Prism rating: four financial-health parts and two technical views", "layers", { gold: true }),
    i("/query-builder", "Query builder", "Type a rule like P/E < 15, get the companies; save baskets", "notes"),
    // task #260 (SHARED §6 of the 20 Nov pack): Discover sits after Query builder, with the green New tag and the pack's line
    i("/discover", "Discover", "Companies by what they are building: themes, filings, sectors", "globe", { newUntil: "2026-12-20" }),
    i("/superinvestors", "Superinvestor portfolios", "What named investors of 1% or more hold, from company filings", "users", { newUntil: "2026-12-17" }),
  ] },
  { id: "company", title: "Analyse a company", line: "One company in depth: report, rating, financials, forecasts", short: "Company", icon: "layers", items: [
    i("/research", "Company report", "A report for every listed company: score, financials, ratios", "search"),
    i("/prism", "FinLit Prism", "A company's financial health rated in four parts", "layers", { gold: true }),
    i("/outlook", "Profit and revenue forecasting", "Revenue and profit estimates from a company's own history and its sector", "activity", { gold: true }),
    i("/research/stress-lab", "Stress Lab", "How a shock to crude, the rupee or rates would move a company's earnings", "gauge"),
    i("/documents", "Annual reports & presentations", "Annual reports and investor presentations of listed companies", "layers"),
  ] },
  { id: "compare", title: "Compare & chart", line: "Companies side by side, and any figure on a chart", short: "Compare", icon: "line", items: [
    i("/compare", "Compare companies", "Two to four companies side by side, in charts", "compare"),
    i("/graphs", "Chart builder", "Combine metrics in side-by-side charts", "bars", { end: true }),
    i("/graphs/advanced", "Correlation charts", "How two measures move together, with tested trend lines", "spark"),
  ] },
  { id: "calc", title: "Valuation & SIP calculators", line: "Fair value, P/E, DCF and how a SIP grows", short: "Calculators", icon: "gauge", items: [
    i("/eps-calculator", "P/E, EPS & PEG calculator", "Estimate earnings per share and explore P/E and PEG.", "gauge"),
    i("/dcf", "DCF valuation calculator", "Estimate intrinsic value using projected future cash flows.", "rupee", { gold: true }),
    i("/reverse-valuation", "Reverse valuation", "Solve for the growth, margin, exit multiple or return today's price assumes.", "gauge", { gold: true }),
    i("/sip-calculator", "SIP calculator", "Project potential wealth creation through monthly investments.", "spark"),
  ] },
  { id: "markets", title: "Markets & economy", line: "Sectors, FII and DII money, the economy, commodities", short: "Markets", icon: "activity", items: [
    i("/sectors", "Sector Pulse", "Which NSE industries are sold off, bouncing back or losing steam", "activity"),   // SHARED §3 (20 Nov pack): the shared Pulse words
    i("/sectors/rotation", "Sector Rotation", "Which NSE industries are pulling ahead of the average industry, and which are falling behind", "activity"),
    i("/premium/markets", "Market events & index", "Index moves and the events behind them", "activity", { gold: true }),
    i("/fii-dii", "FII & DII flows", "Institutional buying and selling, streaks and history", "bars"),
    i("/macro", "India economy", "Inflation, growth, interest rates and reserves", "activity"),
  ] },
  { id: "news", title: "Results, IPOs & news", line: "Who reports when, the latest results, IPOs and filings", short: "News", icon: "bell", items: [
    i("/results", "Results", "Who reports when, how each industry did, every company's results", "calendar", { end: true }),   // task #330: one page
    i("/concalls", "Concall Monitor", "Earnings call recordings, transcripts, presentations and upcoming calls", "play", { newUntil: "2026-12-21" }),   // task #278 (after the pack): joins the group whose line describes it
    i("/ipo", "IPO calendar", "Issues open now, upcoming and listed", "activity", { end: true }),
    i("/ipo/all", "All IPOs", "Every IPO since 2020: listing price, subscription, GMP and returns", "layers", { newUntil: "2026-12-21" }),
    i("/news", "News & filings", "Exchange filings and headlines", "notes"),
  ] },
  { id: "funds", title: "Mutual funds & ETFs", line: "Find, screen and compare funds and ETFs", short: "Funds", icon: "pie", items: [
    i("/funds", "Mutual funds", "NAV, returns, fund size and risk for every scheme", "pie"),
    i("/funds/screener", "Mutual fund screener", "Filter every fund by type, cost, returns, risk and portfolio", "layers"),
    i("/etfs", "ETFs", "Exchange-traded funds: price, returns and risk", "bars"),
  ] },
  { id: "learn", title: "Learn", line: "Glossary, how-to guides, research notes and the forum", short: "Learn", icon: "book", items: [
    i("/glossary", "Glossary", "Terms in plain words, with formulas", "book"),
    i("/dashboard#dsh-learn", "Your bookmark", "The words you bookmarked from Word of the Day, on your dashboard", "book"),   // task #315 (the team's name)
    i("/learn/sector-signals", "How to use Sector Pulse", "Reading the states, the breadth bars and the leader flags", "book"),
    i("/learn/sector-rotation", "How to use Sector Rotation", "Reading the four corners and the rotation rank", "book"),
    i("/blog", "Insights & blog", "Research notes and explainers", "spark"),
    i("/forum", "Discussion forums", "Information and opinion only, moderated", "users"),
  ] },
  { id: "apps", title: "Apps & add-ons", line: "FinLit in your browser and in your AI assistant", short: "Apps", icon: "spark", items: [
    i("/browser-extension", "Browser extension", "Look up terms and scores on any web page", "spark"),
    i("/mcp", "Connect AI assistants", "Free, read-only data for Claude, ChatGPT and Cursor", "spark"),
  ] },
];
const G = (id: string) => MENU.find((g) => g.id === id)!;
const titled = (id: string): NavGroup => ({ title: G(id).title, items: G(id).items });

/** Find a page (task #282): a page matches on its name, its one line, its group's heading, and these short aliases (old names and plan words). */
export const ALIASES: Record<string, string[]> = {
  "/documents": ["documents", "annual report", "presentation"],
  "/advanced-score-screener": ["advanced", "prism screener", "advanced screener"],
  "/mcp": ["mcp", "claude", "chatgpt"],
};
export function menuMatch(q: string, it: NavItem, g?: { title: string }): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [it.label, it.sub, g?.title ?? "", ...(ALIASES[it.to.split(/[?#]/)[0]] ?? []), it.gold ? "gold" : ""].join(" ").toLowerCase();
  return hay.includes(s);
}

/** The top bar's menus, built from the same groups (the pack keeps seven menus; only the group titles inside change). */
export const SECTIONS: NavSection[] = [
  { id: "myfinlit", label: "My portfolio", groups: [{ items: [DASHBOARD] }, titled("mine")] },
  { id: "research", label: "Research", wide: true, groups: [titled("find"), titled("company"), titled("compare"), titled("calc")] },
  { id: "markets", label: "Markets", groups: [titled("markets")] },
  { id: "news", label: "Results & news", groups: [titled("news")] },
  { id: "funds", label: "Funds", groups: [titled("funds")] },
];

/** Everything else, under "More" in the header: learning, the apps and the company. */
export const MORE: NavSection = { id: "more", label: "More", groups: [
  titled("learn"),
  titled("apps"),
  { title: "About FinLit", items: [
    i("/about", "About FinLit", "Who we are and how we work", "users"),
    i("/why-we-exist", "Why we exist", "The problem we set out to fix", "quality"),
    i("/services", "Services", "Portfolio reviews and financial planning", "wallet"),
    i("/contact", "Contact", "Talk to the team", "notes"),
    i("/feedback", "Share feedback", "Help us build a smarter FinLit", "spark"),
  ] },
] };
MORE.wide = true;

/** Pricing sits in the header on its own. */
export const PRICING: NavItem = i("/plans", "Pricing", "Free, Silver and Gold", "crown");

/** Does this address belong to the item (itself or a page under it)? `end` items match only themselves; `not` names a sibling page that has its own item. */
export const isHere = (path: string, it: NavItem) => path === it.to || (!it.end && path.startsWith(it.to + "/") && !(it.not && (path === it.not || path.startsWith(it.not + "/"))));
export const sectionHere = (path: string, s: NavSection) => s.groups.some((g) => g.items.some((it) => isHere(path, it)));

/* Task #310 part D (the 22 Nov pack, 04-navigation.md): one layer per job. Signed in on a tool page, the left menu moves between pages and the top bar
   keeps the logo, search, Ask FinLit AI, theme, notifications and account; marketing pages and signed-out visitors keep the top menus. */

/** The ticker strip shows on the dashboard and the Markets pages only (the same values are on the dashboard); every other page gets its 34px back. */
export const TAPE_PAGES: NavItem[] = [DASHBOARD, ...G("markets").items];
export const showsTape = (path: string) => TAPE_PAGES.some((it) => isHere(path, it));

/** Sibling pages shown as page tabs (ui-tabs) directly under the title: the two sector pages and the three portfolios (the screeners have ScreenerHead). */
export type Sibling = { to: string; label: string };
export const SIBLINGS: Record<"sectors" | "portfolios", { label: string; items: Sibling[] }> = {
  sectors: { label: "Sector pages", items: [{ to: "/sectors", label: "Sector Pulse" }, { to: "/sectors/rotation", label: "Sector Rotation" }] },
  portfolios: { label: "Portfolios", items: [{ to: "/holdings", label: "Equity portfolio" }, { to: "/mf-portfolio", label: "MF portfolio" }, { to: "/etf-portfolio", label: "ETF portfolio" }] },
};

/** A section bar shows only when the page has this many sections or more. */
export const SECTION_BAR_MIN = 4;
