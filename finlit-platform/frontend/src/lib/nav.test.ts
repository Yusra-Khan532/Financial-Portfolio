import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DASHBOARD, MENU, MORE, PRICING, SECTIONS, isHere, menuMatch, sectionHere } from "./nav";
const RESEARCH = SECTIONS.find((x) => x.id === "research")!;

const all = [...SECTIONS, MORE].flatMap((s) => s.groups.flatMap((g) => g.items));

describe("site map", () => {
  it("task #282: one list of ten groups, each with a heading, a line under it and a folded word, Dashboard on its own above them", () => {
    expect(MENU.map((g) => [g.title, g.short])).toEqual([["My portfolio & watchlists", "Portfolio"], ["Find stocks", "Find"], ["Analyse a company", "Company"], ["Compare & chart", "Compare"],
      ["Valuation & SIP calculators", "Calculators"], ["Markets & economy", "Markets"], ["Results, IPOs & news", "News"], ["Mutual funds & ETFs", "Funds"], ["Learn", "Learn"], ["Apps & add-ons", "Apps"]]);
    const names = (id: string) => MENU.find((g) => g.id === id)!.items.map((i) => i.label);
    expect(DASHBOARD.to).toBe("/dashboard");
    expect(names("mine")).toEqual(["All my investments", "Equity portfolio", "MF portfolio", "ETF portfolio", "Watchlists", "Alerts", "My baskets"]);
    expect(names("find")).toEqual(["Stock screener", "Advanced stock screener", "Query builder", "Discover", "Superinvestor portfolios"]);   // task #283: the Basic stock screener is retired
    expect(names("company")).toEqual(["Company report", "FinLit Prism", "Company financials", "Profit and revenue forecasting", "Stress Lab", "Annual reports & presentations"]);
    expect(names("compare")).toEqual(["Compare companies", "Chart builder", "Correlation charts"]);
    expect(names("calc")).toEqual(["P/E, EPS & PEG calculator", "DCF valuation calculator", "Reverse valuation", "SIP calculator"]);
    expect(names("markets")).toEqual(["Sector Pulse", "Sector Rotation", "Market events & index", "FII & DII flows", "India economy", "Commodity prices"]);
    expect(names("news")).toEqual(["Results calendar", "Latest results", "Concall Monitor", "IPO calendar", "News & filings"]);   // task #278 (after the pack): its line covers results and filings
    expect(names("funds")).toEqual(["Mutual funds", "Mutual fund screener", "ETFs"]);
    expect(names("learn")).toEqual(["Glossary", "How to use Sector Pulse", "How to use Sector Rotation", "Insights & blog", "Discussion forums"]);
    expect(names("apps")).toEqual(["Browser extension", "Connect AI assistants"]);
    // the rules for a heading: four words or fewer, one line under it, no plan names as headings
    for (const g of MENU) { expect(g.title.split(/\s+/).filter((w) => w !== "&").length, g.title).toBeLessThanOrEqual(4); expect(g.line.length, g.line).toBeLessThanOrEqual(59); expect(g.title).not.toMatch(/Gold|Silver|Basic/); }
    // the top bar keeps its seven menus; the group titles inside are the side menu's headings, word for word
    expect(SECTIONS.map((s) => s.label)).toEqual(["My portfolio", "Research", "Markets", "Results & news", "Funds"]);
    const titles = [...SECTIONS, MORE].flatMap((s) => s.groups.map((g) => g.title).filter(Boolean));
    expect(titles).toEqual(["My portfolio & watchlists", "Find stocks", "Analyse a company", "Compare & chart", "Valuation & SIP calculators", "Markets & economy", "Results, IPOs & news", "Mutual funds & ETFs", "Learn", "Apps & add-ons", "About FinLit"]);
    expect(titles).not.toContain("Gold dashboards");
  });
  it("marks the Gold tools, and every page of the old menu is in the new one", () => {
    expect(MENU.flatMap((g) => g.items).filter((i) => i.gold).map((i) => i.to).sort()).toEqual(["/advanced-score-screener", "/dcf", "/outlook", "/premium/fundamentals", "/premium/markets", "/prism", "/reverse-valuation"]);
    const inMenu = new Set([DASHBOARD.to, ...MENU.flatMap((g) => g.items.map((i) => i.to))]);
    for (const p of ["/dashboard", "/watchlist", "/my-investments", "/holdings", "/mf-portfolio", "/etf-portfolio", "/alerts", "/baskets", "/screener", "/advanced-score-screener", "/query-builder", "/discover", "/superinvestors",
      "/research", "/compare", "/prism", "/outlook", "/research/stress-lab", "/eps-calculator", "/dcf", "/reverse-valuation", "/sip-calculator", "/graphs", "/graphs/advanced", "/sectors", "/sectors/rotation", "/fii-dii", "/macro",
      "/commodities", "/results", "/results/quarter", "/concalls", "/ipo", "/news", "/funds", "/funds/screener", "/etfs", "/premium/fundamentals", "/premium/markets", "/glossary", "/browser-extension", "/blog", "/documents", "/forum",
      "/learn/sector-signals", "/learn/sector-rotation", "/mcp"]) expect(inMenu.has(p), p).toBe(true);
  });
  it("Find a page matches the page's name, its line, its group's heading, and the aliases", () => {
    const find = (q: string) => MENU.flatMap((g) => g.items.filter((it) => menuMatch(q, it, g)).map((it) => it.label));
    expect(find("inflation")).toEqual(["India economy"]);
    expect(find("crude")).toEqual(expect.arrayContaining(["Stress Lab", "Commodity prices"]));
    expect(find("annual")).toEqual(["Annual reports & presentations"]);
    expect(find("sip")).toEqual(expect.arrayContaining(["SIP calculator"]));                          // and the rest of "Valuation & SIP calculators", by its heading
    expect(find("documents")).toEqual(["Annual reports & presentations"]);
    expect(find("advanced")).toEqual(expect.arrayContaining(["Advanced stock screener"]));
    expect(find("gold")).toEqual(expect.arrayContaining(["FinLit Prism", "Company financials", "DCF valuation calculator", "Market events & index", "Commodity prices"]));
    expect(find("valuation")).toEqual(expect.arrayContaining(["P/E, EPS & PEG calculator", "SIP calculator"]));   // the group heading finds all of its pages
    expect(menuMatch("glance", DASHBOARD)).toBe(true);
  });
  it("lists every address once, and every one of them is a real route", () => {
    const paths = [...all.map((i) => i.to), PRICING.to];
    expect(new Set(paths).size).toBe(paths.length);
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const routes = [...app.matchAll(/path="([^"]+)"/g)].map((m) => "/" + m[1]);
    for (const p of paths) expect(routes.some((r) => r === p || r === p + "/*"), p).toBe(true);
  });
  it("knows which heading the visitor is under", () => {
    const research = RESEARCH;
    expect(sectionHere("/screener", research)).toBe(true);
    expect(sectionHere("/graphs/advanced/valuation", research)).toBe(true);
    expect(sectionHere("/funds/123", SECTIONS.find((x) => x.id === "funds")!)).toBe(true);
    expect(sectionHere("/funds", research)).toBe(false);
    expect(isHere("/results/quarter", all.find((i) => i.to === "/results")!)).toBe(false);   // "end" items match only themselves
    expect(isHere("/graphs/advanced", all.find((i) => i.to === "/graphs")!)).toBe(false);
  });
});

describe("Premium reports tab (task #4)", () => {
  it("is no longer listed under Analyse a company, so no menu, rail or footer shows it", () => {
    const all = [...SECTIONS, MORE].flatMap((s) => s.groups.flatMap((g) => g.items));
    expect(all.some((i) => i.to === "/premium/report")).toBe(false);
  });
});
