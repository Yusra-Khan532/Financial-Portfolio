// @vitest-environment jsdom
// "Explore the platform" on the landing page: closed to begin with, one button opens it, six tabs show their own cards, and the data matches the design pack.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ExploreTools } from "./ExploreTools";
import { BUCKETS, FIGURE, SHORT } from "../lib/platformTools";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

afterEach(() => { cleanup(); history.replaceState(null, "", "#"); document.body.style.overflow = ""; });
const view = () => render(<MemoryRouter><ExploreTools /></MemoryRouter>);

describe("platform data", () => {
  it("has the six groups with 6, 6, 6, 6, 7 and 5 cards (36 tools; task #283 retired the Basic Stock Screener; the option chain is off, task #213; Correlation Chart and ETF Portfolio added, task #208), each with three points and an image", () => {
    expect(BUCKETS.map((b) => b.cards.length)).toEqual([6, 6, 6, 6, 7, 5]);
    for (const c of BUCKETS.flatMap((b) => b.cards)) { expect(c.points).toHaveLength(3); expect(c.image).toMatch(/-(light|dark)$/); expect(["FREE", "SILVER", "GOLD"]).toContain(c.badge); }
  });
  it("drops the Premium Report and Connect AI cards and adds FinLit Bot", () => {
    const names = BUCKETS.flatMap((b) => b.cards.map((c) => c.title));
    expect(names).not.toContain("Premium Report"); expect(names).not.toContain("Connect AI"); expect(names).toContain("FinLit Bot"); expect(names).toContain("Company Report");
  });
  it("has no plan-quota lines and no advice words", () => {
    const text = BUCKETS.flatMap((b) => b.cards.flatMap((c) => [c.what, ...c.points])).join(" ");
    expect(text).not.toMatch(/2 free|up to 4 on Gold/i); expect(text).not.toMatch(/\b(buy|sell|hold|multibagger|top pick)\b/i);
  });
});

describe("<ExploreTools />", () => {
  it("starts with the directory shown; the main button always reads Explore the platform, a quiet button under the tools hides them, Explore brings them back", () => {
    view();
    expect(screen.getByRole("list", { name: /six groups and their tools/i })).toBeTruthy();
    const go = screen.getByRole("button", { name: /explore the platform/i }); expect(go.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /hide the platform tools/i }));
    expect(screen.queryByRole("list", { name: /six groups and their tools/i })).toBeNull();
    expect(screen.getByRole("button", { name: /explore the platform/i }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /explore the platform/i }));
    expect(screen.getByRole("list", { name: /six groups and their tools/i })).toBeTruthy();
  });
  it("the platform header is the team's design (#119): THE PLATFORM pill, the two-line heading, its line, one panel with three ticks, two buttons and five figures (ETFs added by #237)", () => {
    view();
    expect(screen.getByText("The platform").closest(".xt-pill")).toBeTruthy();
    const h = screen.getByRole("heading", { level: 2 }); expect(h.textContent).toBe("Everything you need. Nothing you don't."); expect(h.querySelector("em")!.textContent).toBe("Nothing you don't.");
    expect(screen.getByText("A complete toolkit to explore companies, run quantitative models, track your portfolio and stay informed across sectors.")).toBeTruthy();
    const panel = document.querySelector(".xt-panel")!;
    expect([...within(panel as HTMLElement).getByRole("list", { name: /what the platform is for/i }).querySelectorAll("li")].map((l) => l.textContent)).toEqual(["Screen & discover opportunities", "Analyse companies in depth", "Value with proven models"]);
    expect(within(panel as HTMLElement).getByRole("button", { name: /explore the platform/i })).toBeTruthy(); expect(within(panel as HTMLElement).getByRole("link", { name: /watch the tour/i }).getAttribute("href")).toBe("#tour");
    expect([...panel.querySelectorAll(".xt-stats > div")].map((d) => `${d.querySelector("dd")!.textContent} ${d.querySelector("dt")!.textContent}`)).toEqual(["5,800+ Listed companies", "8,300+ Mutual funds", "350+ ETFs", "22 Sectors", "220+ Indices"]);
  });
  it("a group button replaces the directory in the same place with that group's cards, a bar of six chips and a bottom bar", () => {
    view(); fireEvent.click(screen.getByRole("button", { name: /See the 6 Discover cards/ }));
    expect(screen.queryByRole("list", { name: /six groups and their tools/i })).toBeNull();
    const bar = screen.getByRole("group", { name: /tool groups/i });
    const chips = within(bar).getAllByRole("button").filter((b) => b.classList.contains("fl-gchip"));
    expect(chips).toHaveLength(6); expect(chips[0].getAttribute("aria-pressed")).toBe("true"); expect(chips[1].getAttribute("aria-pressed")).toBe("false");
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(6);
    expect(location.hash).toBe("#tools-discover");
    fireEvent.click(chips[1]);
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(6); expect(location.hash).toBe("#tools-company-360");
    const foot = screen.getByRole("navigation", { name: /between groups/i });
    expect(within(foot).getByText("Previous group").parentElement!.textContent).toMatch(/Discover/); expect(within(foot).getByText("Next group").parentElement!.textContent).toMatch(/Quant Lab/);
    fireEvent.click(within(foot).getByRole("button", { name: /All six groups/ }));
    expect(screen.getByRole("list", { name: /six groups and their tools/i })).toBeTruthy();
  });
  it("Next from Learn & connect goes to Discover and Previous from Discover goes to Learn & connect", () => {
    view(); fireEvent.click(screen.getByRole("button", { name: /See the 5 Learn & connect cards/ }));
    fireEvent.click(within(screen.getByRole("navigation", { name: /between groups/i })).getByRole("button", { name: /Next group/ }));
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(6);
    fireEvent.click(within(screen.getByRole("navigation", { name: /between groups/i })).getByRole("button", { name: /Previous group/ }));
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(5); expect(screen.getByRole("button", { name: /open finlit bot/i })).toBeTruthy();
  });
  it("the address opens the group, so a shared link or Back works", () => {
    history.replaceState(null, "", "#tools-quant-lab"); view();
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(6);
    history.replaceState(null, "", "#");
  });
  it("Expand opens a real dialog with the tool, runs through all 36 tools, locks the page scroll and closes with Esc", () => {
    view(); fireEvent.click(screen.getByRole("button", { name: /See the 6 Discover cards/ }));
    fireEvent.click(document.querySelector('[data-exp="stock-screener"]')!);
    const dlg = screen.getByRole("dialog"); expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(dlg.textContent).toMatch(/DISCOVER · 1 OF 6/); expect(within(dlg).getByRole("heading", { name: "Stock Screener" })).toBeTruthy();
    expect(dlg.querySelector("img")!.getAttribute("src")).toMatch(/landing\/expanded\/stock-screener\.webp$/);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(within(dlg).getByRole("button", { name: /Next: Advanced Stock Screener/ }));
    expect(screen.getByRole("dialog").textContent).toMatch(/DISCOVER · 2 OF 6/);
    for (let i = 0; i < 5; i++) fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Next:/ }));
    expect(screen.getByRole("dialog").textContent).toMatch(/COMPANY 360 · 1 OF 6/);   // moving into another group's tool switches the group view behind it
    expect(location.hash).toBe("#tools-company-360");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(document.body.style.overflow).not.toBe("hidden");
  });
  it("a tool with no tall picture uses its card picture in the large view", () => {
    history.replaceState(null, "", "#tools-company-360"); view();
    fireEvent.click(document.querySelector('[data-exp="chart-builder"]')!);
    expect(screen.getByRole("dialog").querySelector("img")!.getAttribute("src")).toMatch(/landing\/tools\/chart-builder/);
    history.replaceState(null, "", "#");
  });
  it("the directory has one row per group naming every tool in a few words, each linking to its page", () => {
    view();
    const rows = within(screen.getByRole("list", { name: /six groups and their tools/i })).getAllByRole("listitem").filter((li) => li.classList.contains("xt-row"));
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.querySelectorAll(".xt-tool").length)).toEqual([6, 6, 6, 6, 7, 5]);
    const first = rows[0].querySelector("a.xt-tool")!;
    expect(first.getAttribute("href")).toBe("/screener"); expect(first.textContent).toMatch(/Stock Screener.*190\+ filters/);
    expect(rows[0].textContent).toMatch(/Advanced Stock Screener.*Gold/);
    // task #151: one tool per row, name and plan mark on the left, the figure in its own pill on the right; the count reads "06 TOOLS"
    expect(Array.from(first.children).map((e) => e.className.split(" ")[0])).toEqual(["xt-ti", "xt-nm", "xt-fig", ""]);
    expect(rows[0].querySelector(".xt-cnt")!.textContent).toBe("06 tools");
    const adv = rows[0].querySelectorAll("a.xt-tool")[1]; expect(Array.from(adv.children).map((e) => e.className.split(" ")[0])).toEqual(["xt-ti", "xt-nm", "xt-fig", ""]);
    // task #158: no "Gold" / "Silver" word on the rows; every paid tool (Silver or Gold) has one golden crown after its name, free tools none; the plan is still read out
    const dir = screen.getByRole("list", { name: /six groups and their tools/i });
    expect(dir.querySelectorAll(".xt-badge")).toHaveLength(0);
    for (const c of BUCKETS.flatMap((b) => b.cards)) {
      const a = dir.querySelector(`.xt-tool[href="${c.link}"], .xt-tool[title="${SHORT[c.id]}"]`)!;
      expect(a.querySelectorAll(".xt-nm .xt-crown").length, c.id).toBe((c.crown === undefined ? c.badge !== "FREE" : c.crown !== false) ? 1 : 0);   // task #208: `crown` overrides
    }
    for (const el of Array.from(dir.querySelectorAll(".xt-tool"))) {   // visible text: name, figure and the short line only, never the plan word
      const seen = Array.from(el.querySelectorAll("b, .xt-fig")).map((e) => e.textContent).join(" ");
      expect(seen).not.toMatch(/\b(Gold|Silver)\b/);
    }
    expect(adv.querySelector(".xt-crown")!.textContent).toBe(", Gold plan");
    // task #208: a crown on Chart Builder (free to open, more with Silver) and on the new Correlation Chart; task #283: no Basic Stock Screener row any more
    const row = (name: RegExp) => screen.getAllByRole("link", { name }).find((l) => l.classList.contains("xt-tool"))!;
    expect(screen.queryAllByRole("link", { name: /^Basic Stock Screener/ })).toHaveLength(0);
    expect(row(/^Chart Builder/).querySelector(".xt-crown")!.textContent).toBe(", free to open, more with the Silver plan");
    expect(row(/^Correlation Chart/).querySelector(".xt-crown")!.textContent).toBe(", Silver plan");
    // follow-up: the crown is bound to the name's last word, so a wrapped name never leaves the crown alone on a line
    expect(adv.querySelector(".xt-tail")!.textContent).toBe("Screener, Gold plan");
    expect(adv.querySelector(".xt-nm")!.textContent).toBe("Advanced Stock Screener, Gold plan");
    for (const c of BUCKETS.flatMap((b) => b.cards)) expect(SHORT[c.id], c.id).toBeTruthy();
    expect(Object.values(SHORT).every((t) => t.split(" ").length <= 4 && !/\b(buy|sell)\b/i.test(t))).toBe(true);
  });
  it("cards link to their pages and show the plan badge", () => {
    view(); fireEvent.click(screen.getByRole("button", { name: /See the 6 Discover cards/ }));
    expect(screen.getByRole("link", { name: /open stock screener/i }).getAttribute("href")).toBe("/screener");
    expect(screen.getByRole("link", { name: /open advanced stock screener/i }).getAttribute("href")).toBe("/advanced-score-screener");
  });
});

describe("task #159: three landing cards", () => {
  const card = (id: string) => BUCKETS.flatMap((b) => b.cards).find((c) => c.id === id)!;
  it("Stock Screener and Company Report are for Silver and Gold, never Free", () => {
    expect(card("stock-screener").badge).toBe("SILVER");
    expect(card("company-report").badge).toBe("SILVER");
  });
  it("the fund score card is called Mutual Fund Score", () => {
    expect(card("fund-health-score").title).toBe("Mutual Fund Score");
    expect(card("fund-health-score").badge).toBe("GOLD");
  });
  it("the company report card says what the team wrote", () => {
    expect(card("company-report").points).toEqual([
      "FinLit Prism: four financial-health parts and two technical views",   // task #283 (the old line also miscounted Prism's parts)
      "Valuation comparison, sector leaders and laggards",
      "20 sections in total: financials, advanced ratios, charts, ownership and filings, and many more",
    ]);
  });
});

describe("task #169: Reverse Valuation in Quant Lab", () => {
  it("is a Quant Lab tool, row and card, with the team's three lines and its own picture", () => {
    const q = BUCKETS.find((b) => b.id === "quant-lab")!;
    const rv = q.cards.find((c) => c.id === "reverse-valuation")!;
    expect(q.cards.map((c) => c.id).slice(0, 2)).toEqual(["dcf-calculator", "reverse-valuation"]);
    expect(rv.title).toBe("Reverse Valuation"); expect(rv.badge).toBe("GOLD"); expect(rv.link).toMatch(/^\/reverse-valuation/);
    expect(rv.points).toEqual(["Find the growth needed to justify today's price", "Understand the profit margins already expected", "See the returns implied by market expectations"]);
    expect(rv.image).toBe("reverse-valuation-light"); expect(SHORT["reverse-valuation"]).toBeTruthy();
  });
  it("splits the combined cards and adds the new tools in the team's words (tasks #172, #175, #176, #177, #178, #180)", () => {
    const at = (id: string) => BUCKETS.flatMap((b) => b.cards.map((c) => ({ ...c, group: b.id }))).find((c) => c.id === id)!;
    const ids = BUCKETS.flatMap((b) => b.cards.map((c) => c.id));
    for (const gone of ["portfolios", "results-ipo", "calculators"]) expect(ids).not.toContain(gone);
    const want: [string, string, string, string, string, string][] = [
      ["equity-portfolio", "track", "Equity Portfolio", "SILVER", "/holdings", "Understand the strength, risk and diversification of your stock holdings."],
      ["mf-portfolio", "track", "MF Portfolio", "SILVER", "/mf-portfolio", "Track mutual fund performance and assess the overall health of your investments."],
      ["results-calendar", "market", "Results Calendar", "FREE", "/results", "Know when companies announce their financial results."],
      ["ipo-calendar", "market", "IPO Calendar", "FREE", "/ipo", "Discover IPO opportunities from opening to listing."],
      ["browser-extension", "learn", "Browser Extension", "FREE", "/browser-extension", "Get instant financial insights while browsing any website."],
      ["insights-blog", "learn", "Investing & Finance Articles", "FREE", "/blog", "Explore investing, finance and market insights in simple language."],
      ["eps-calculator", "quant-lab", "EPS Calculator", "FREE", "/eps-calculator", "Understand how future earnings translate into share value."],
      ["sip-calculator", "quant-lab", "SIP Calculator", "FREE", "/sip-calculator", "Plan your investments and estimate future wealth."],
      ["stress-lab", "quant-lab", "Stress Lab", "SILVER", "/research/stress-lab", "See how market shocks could impact company earnings."],
    ];
    for (const [id, group, title, badge, link, what] of want) { const c = at(id); expect([c.group, c.title, c.badge, c.link, c.what]).toEqual([group, title, badge, link, what]); expect(SHORT[id]).toBeTruthy(); }
    expect(at("mf-portfolio").points).toEqual(["Track latest NAV and historical returns", "Evaluate mutual fund health scores", "Compare 1, 3 and 5-year performance"]);
    expect(at("stress-lab").points).toEqual(["Test changes in crude, rupee and inflation", "Analyse the impact of interest rates and demand", "Explore possible earnings under different scenarios"]);
    expect(at("browser-extension").points).toEqual(["Understand financial terms instantly", "View FinLit scores for listed companies", "Access FinLit Prism scores on a plan that has it"]);
    view();
    const learn = document.querySelector('.xt-row[data-group="learn"]') as HTMLElement;
    expect(within(learn).getByRole("link", { name: /Insights & Blog/ }).getAttribute("href")).toBe("/blog");   // the directory row says Insights & Blog; the card carries the team's title
    expect(within(learn).getByRole("link", { name: /Browser Extension/ }).getAttribute("href")).toBe("/browser-extension");
    const quant = document.querySelector('.xt-row[data-group="quant-lab"]') as HTMLElement;
    expect(within(quant).getByRole("link", { name: /Stress Lab/ }).querySelector(".xt-crown")).toBeTruthy();
  });
});

describe("dashboard cards, task #208 (the team's list of 16 Nov)", () => {
  const card = (id: string) => BUCKETS.flatMap((b) => b.cards.map((c) => ({ ...c, group: b.id }))).find((c) => c.id === id);
  it("Discover: no Basic Stock Screener (task #283); Mutual Funds shows the funds AMFI lists today (8,332 active on 17 Nov; 8,500+ would not be true yet)", () => {
    expect(card("basic-score-screener")).toBeUndefined();
    expect(FIGURE["mutual-funds"]).toEqual(["8,300+", "funds"]);
  });
  it("Company 360: Company Report 20 sections (the report's sections menu); Chart Builder crowned; Correlation Chart added, crowned, and counted", () => {
    expect(FIGURE["company-report"]).toEqual(["20", "sections"]);
    expect(card("chart-builder")!.crown).toBe("SILVER");
    expect(card("correlation-charts")).toMatchObject({ group: "company-360", title: "Correlation Chart", badge: "SILVER", link: "/graphs/advanced" });
    expect(BUCKETS.find((b) => b.id === "company-360")!.cards).toHaveLength(6);
  });
  it("Quant Lab: no Option Chain (taken off the site, task #213)", () => {
    expect(card("option-chain")).toBeUndefined();
  });
  it("Track & manage: Compare Mutual Funds; ETF Portfolio added", () => {
    expect(card("compare-funds")!.title).toBe("Compare Mutual Funds");
    expect(card("etf-portfolio")).toMatchObject({ group: "track", title: "ETF Portfolio", badge: "SILVER", link: "/etf-portfolio" });
  });
  it("Follow the market: IPO Calendar keeps its card and link but has no '3 IPO lists' tag", () => {
    expect(card("ipo-calendar")).toMatchObject({ title: "IPO Calendar", link: "/ipo" });
    expect(FIGURE["ipo-calendar"]).toBeUndefined();
  });
  it("the two new cards have their pictures", () => {
    for (const f of ["correlation-charts-light", "etf-portfolio-light"]) expect(existsSync(join(process.cwd(), "public/landing/tools", f + ".webp")), f).toBe(true);
  });
});

describe("Correlation Chart card, task #179 (the team's wording, word for word)", () => {
  it("describes the feature as the task wrote it", () => {
    const c = BUCKETS.find((b) => b.id === "company-360")!.cards.find((x) => x.id === "correlation-charts")!;
    expect(c.what).toBe("Discover how financial metrics move together across companies.");
    expect(c.points).toEqual(["Compare relationships between two measures.", "View regression trends when statistically valid.", "Add companies to compare their positions."]);
    expect(c.link).toBe("/graphs/advanced");
  });
});

// task #236: the six group cards have no coloured line along their top (the team's red boxes)
describe("task #236: no top line on the group cards", () => {
  it("explore-tools.css draws nothing before a group card", () => {
    const css = readFileSync(join(__dirname, "../styles/explore-tools.css"), "utf8");
    expect(css).not.toMatch(/\.xt-row::?before/);
  });
});
