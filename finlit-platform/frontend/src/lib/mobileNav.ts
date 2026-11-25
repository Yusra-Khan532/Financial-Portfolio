// The phone app's map (docs/MOBILE-APP.md): which bottom tab a page belongs to, the section chips at the top of that tab's pages, the Tools
// button's list and the Menu sheet's "Most used" row. Built on lib/nav.ts, so a page keeps one name everywhere. Phone only (under 860px).
import { MENU, type NavItem } from "./nav";
import { PLAN_FOR_PORTFOLIO, PLAN_FOR_WATCHLIST } from "./planGates";

export type TabId = "home" | "markets" | "discover" | "folio";
export type Chip = { to: string; label: string; /** other addresses that light this chip (a page under it, a sibling tool) */ also?: string[] };

/** The section chips of each tab, in the order people use them most (the priority research of 24 Nov 2026). */
export const HUBS: Record<Exclude<TabId, "home">, Chip[]> = {
  markets: [
    { to: "/markets", label: "Today" },
    { to: "/sectors", label: "Sectors", also: ["/learn/sector-signals"] },
    { to: "/sectors/rotation", label: "Rotation", also: ["/learn/sector-rotation"] },
    { to: "/ipo", label: "IPOs" },
    { to: "/results", label: "Results" },
    { to: "/fii-dii", label: "FII & DII" },
    { to: "/news", label: "News", also: ["/documents"] },
    { to: "/concalls", label: "Concalls" },
    { to: "/macro", label: "Economy" },
    { to: "/premium/markets", label: "Events" },
  ],
  discover: [
    { to: "/screener", label: "Stocks", also: ["/advanced-score-screener", "/query-builder", "/superinvestors", "/companies"] },
    { to: "/discover", label: "Themes" },
    { to: "/funds", label: "Mutual funds", also: ["/fund-score-screener", "/methodology/mf-score"] },
    { to: "/etfs", label: "ETFs" },
    { to: "/tools", label: "All tools", also: ["/research", "/stocks", "/prism", "/outlook", "/compare", "/graphs", "/eps-calculator", "/dcf", "/reverse-valuation", "/sip-calculator", "/premium/report", "/premium"] },
  ],
  folio: [
    { to: "/watchlist", label: "Watchlist" },
    { to: "/my-investments", label: "All" },
    { to: "/holdings", label: "Shares" },
    { to: "/mf-portfolio", label: "Funds" },
    { to: "/etf-portfolio", label: "ETFs" },
    { to: "/alerts", label: "Alerts" },
    { to: "/baskets", label: "Baskets" },
  ],
};

const under = (path: string, to: string) => path === to || path.startsWith(to + "/");

/** The chip a page lights: the longest matching address wins, so /sectors/rotation lights Rotation, not Sectors. */
export function chipFor(path: string): { tab: Exclude<TabId, "home">; chip: Chip } | null {
  let best: { tab: Exclude<TabId, "home">; chip: Chip; len: number } | null = null;
  for (const tab of Object.keys(HUBS) as Exclude<TabId, "home">[]) {
    for (const chip of HUBS[tab]) {
      for (const to of [chip.to, ...(chip.also ?? [])]) {
        if (under(path, to) && (!best || to.length > best.len)) best = { tab, chip, len: to.length };
      }
    }
  }
  return best && { tab: best.tab, chip: best.chip };
}

/** The bottom tab a page belongs to; null for pages outside the four (About, Pricing, an article): no tab is lit there. */
export function tabFor(path: string): TabId | null {
  if (path === "/" || path === "/dashboard") return "home";
  return chipFor(path)?.tab ?? null;
}

/** Where each tab opens. Home is the landing page for everyone (owner, 25 Nov 2026: the landing first, then the dashboard from there); a member's
 *  landing opens with "Continue to your dashboard". */
export const tabHome = (tab: TabId): string => (tab === "home" ? "/" : HUBS[tab][0].to);

/** The phone "Most used" row of the Menu sheet and the Home tools grid (priority research: what people open first). */
export const MOST_USED: { to: string; label: string; icon: string }[] = [
  { to: "/watchlist", label: "Watchlist", icon: "star" },
  { to: "/research", label: "Company report", icon: "search" },
  { to: "/screener", label: "Screener", icon: "table" },
  { to: "/ipo", label: "IPOs", icon: "calendar" },
  { to: "/results", label: "Results", icon: "bars" },
  { to: "/sectors", label: "Sector Pulse", icon: "activity" },
  { to: "/funds", label: "Mutual funds", icon: "pie" },
  { to: "/news", label: "News", icon: "notes" },
];

/** Tools the floating button lists everywhere, in a fixed order (the same place every time). */
export const TOOLS: { to: string; label: string; icon: string }[] = [
  { to: "/screener", label: "Stock screener", icon: "table" },
  { to: "/compare", label: "Compare companies", icon: "compare" },
  { to: "/prism", label: "FinLit Prism", icon: "prism" },
  { to: "/sectors", label: "Sector Pulse", icon: "activity" },
  { to: "/ipo", label: "IPOs", icon: "calendar" },
  { to: "/sip-calculator", label: "SIP calculator", icon: "spark" },
  { to: "/alerts", label: "Alerts", icon: "bell" },
];

/** Tools for the page in view, listed first (Material's "related actions"). `symbol` is the company on a company page. */
export function toolsForPage(path: string): { to: string; label: string; icon: string }[] {
  const m = /^\/stocks\/([^/?#]+)/.exec(path);
  if (m) {
    const s = decodeURIComponent(m[1]).toUpperCase();
    return [
      { to: `/compare?c=${encodeURIComponent(s)}`, label: `Compare ${s}`, icon: "compare" },
      { to: `/prism/${encodeURIComponent(s)}`, label: `Prism report: ${s}`, icon: "prism" },
      { to: `/dcf?sym=${encodeURIComponent(s)}`, label: `DCF value of ${s}`, icon: "rupee" },
      { to: `/research/stress-lab/${encodeURIComponent(s)}`, label: `Stress Lab: ${s}`, icon: "gauge" },
      { to: `/alerts?symbol=${encodeURIComponent(s)}`, label: `Set an alert on ${s}`, icon: "bell" },
    ];
  }
  if (/^\/funds\/[^/]+$/.test(path) && !/^\/funds\/(screener|compare|insights)$/.test(path)) return [
    { to: "/sip-calculator", label: "SIP calculator", icon: "spark" },
    { to: "/funds/compare", label: "Compare funds", icon: "compare" },
    { to: "/funds/screener", label: "Mutual fund screener", icon: "layers" },
  ];
  if (/^\/etfs\/[^/]+$/.test(path) && !/^\/etfs\/compare/.test(path)) return [
    { to: "/etfs/compare", label: "Compare ETFs", icon: "compare" },
    { to: "/etfs/compare-index-funds", label: "ETF against an index fund", icon: "layers" },
  ];
  if (under(path, "/sectors")) return [
    { to: "/learn/sector-signals", label: "How to read Sector Pulse", icon: "book" },
    { to: "/learn/sector-rotation", label: "How to read Sector Rotation", icon: "book" },
  ];
  if (under(path, "/screener") || under(path, "/advanced-score-screener")) return [
    { to: "/query-builder", label: "Query builder", icon: "notes" },
    { to: "/baskets", label: "My baskets", icon: "layers" },
  ];
  if (["/watchlist", "/my-investments", "/holdings", "/mf-portfolio", "/etf-portfolio"].some((p) => under(path, p))) return [
    { to: "/alerts", label: "New alert", icon: "bell" },
    { to: "/compare", label: "Compare companies", icon: "compare" },
  ];
  return [];
}

/** The same page under two names (Prism's page and its landing) is listed once. */
const SAME: Record<string, string> = { "/prism": "/prism", "/compare": "/compare", "/funds/compare": "/compare", "/etfs/compare": "/compare", "/alerts": "/alerts" };
const base = (to: string) => to.split(/[?#]/)[0].replace(/^\/prism\/.*/, "/prism").replace(/^\/alerts.*/, "/alerts");

/** The floating list: this page's tools first, then the fixed tools, at most 7 rows before "All tools". */
export function toolsList(path: string): { to: string; label: string; icon: string; here: boolean }[] {
  const ctx = toolsForPage(path).map((t) => ({ ...t, here: true }));
  const taken = new Set(ctx.map((t) => SAME[base(t.to)] ?? base(t.to)));
  const rest = TOOLS.filter((t) => !taken.has(SAME[base(t.to)] ?? base(t.to)) && base(t.to) !== path).map((t) => ({ ...t, here: false }));
  return [...ctx, ...rest].slice(0, 7);
}

/** Every tool, by group, for the "All tools" page (lib/nav.ts groups, so a tool added there appears here too). */
export const TOOL_GROUPS: { title: string; items: NavItem[] }[] = ["find", "company", "compare", "calc", "markets", "funds"]
  .map((id) => MENU.find((g) => g.id === id)!).map((g) => ({ title: g.title, items: g.items }));

/** "Desktop site" on any phone browser: kept on this device only, read by public/theme-init.js before the first paint. */
export const DESKTOP_KEY = "finlit-desktop-site";
export function setDesktopSite(on: boolean) {
  try { if (on) localStorage.setItem(DESKTOP_KEY, "1"); else localStorage.removeItem(DESKTOP_KEY); } catch { /* private window: the reload below still applies it once */ }
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) vp.setAttribute("content", on ? "width=1180" : "width=device-width, initial-scale=1, viewport-fit=cover");
  location.reload();
}
export const desktopSiteOn = () => { try { return localStorage.getItem(DESKTOP_KEY) === "1"; } catch { return false; } };

/** What a free (Basic) account really keeps, read from the plan gates so the phone copy can never promise a gated feature (audit of 24 Nov 2026:
 *  the site said "a free account keeps your watchlist" while watchlists open on Silver). Alerts: 3 on Basic (docs/accounts-and-plans.md). */
export function freeAccountLine(): string {
  const parts = ["3 alerts", "saved screens", "your own dashboard"];
  if (PLAN_FOR_WATCHLIST === "basic") parts.unshift("watchlists");
  if (PLAN_FOR_PORTFOLIO === "basic") parts.push("your portfolio");
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

/** The paid side of the same card: which of watchlists and portfolio tracking a plan adds, and which plan, from the same gates. */
export function planAddsLine(): string {
  const g: [string, string][] = [];
  if (PLAN_FOR_WATCHLIST !== "basic") g.push([PLAN_FOR_WATCHLIST, "watchlists"]);
  if (PLAN_FOR_PORTFOLIO !== "basic") g.push([PLAN_FOR_PORTFOLIO, "portfolio tracking"]);
  if (!g.length) return "";
  const plans = [...new Set(g.map(([p]) => p[0].toUpperCase() + p.slice(1)))];
  return `${plans.join(" and ")} ${plans.length > 1 ? "add" : "adds"} ${g.map(([, w]) => w).join(" and ")}.`;
}
