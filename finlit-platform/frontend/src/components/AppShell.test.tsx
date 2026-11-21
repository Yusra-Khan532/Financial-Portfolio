// @vitest-environment jsdom
// The left rail: every group is a button that opens a labelled region, carries a quiet icon (no per-group colour), and the current page's group is open.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: { email: "a@b.c" }, isAdmin: false }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ plan: "gold" }) }));
vi.mock("../lib/screens", () => ({ useSavedScreens: () => [] }));
vi.mock("../lib/watchlist", () => ({ useWatchlist: () => ({ lists: [] }) }));
vi.mock("../lib/portfolio", () => ({ usePortfolio: () => ({ holdings: [] }) }));
vi.mock("../lib/alerts", () => ({ useAlerts: () => ({ alerts: [] }), useNotices: () => ({ unread: 0 }) }));

afterEach(() => { cleanup(); localStorage.clear(); });
/** The page with the menu: `expanded` stores the reader's choice of the full menu first (the default is the pack's icon rail, 13 Nov 2026). */
const show = (path: string, expanded = true) => {
  if (expanded && localStorage.getItem("finlit:ui:side-collapsed") == null) localStorage.setItem("finlit:ui:side-collapsed", JSON.stringify({ v: 1, data: false }));
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route element={<AppShell />}><Route path="*" element={<p>page</p>} /></Route></Routes></MemoryRouter>);
};

describe("AppShell rail", () => {
  it("renders every group as a button with aria-expanded, controlling a labelled region", () => {
    const { container } = show("/dashboard");
    const heads = [...container.querySelectorAll<HTMLButtonElement>("button.side-gb")];
    expect(heads.length).toBeGreaterThanOrEqual(10);
    for (const h of heads) {
      expect(["true", "false"]).toContain(h.getAttribute("aria-expanded"));
      const region = container.querySelector("#" + h.getAttribute("aria-controls"));
      expect(region?.getAttribute("role")).toBe("region");
      expect(region?.getAttribute("aria-label")).toBe(h.querySelector(".side-gname")?.textContent);
    }
  });
  it("gives each group an icon and no colour of its own, and opens the group of the current page", () => {
    const { container } = show("/dashboard");
    for (const g of container.querySelectorAll<HTMLElement>(".side-g")) {
      const name = g.querySelector(".side-gname")!.textContent!;
      expect(g.querySelector(".side-gbd svg"), name).toBeTruthy();
      expect(g.getAttribute("style"), name).toBeNull();
    }
    expect(screen.getByRole("button", { name: /Find stocks/ }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /Compare & chart/ }).getAttribute("aria-expanded")).toBe("false");
  });
  it("task #282: titles the panel All pages; Dashboard sits on its own; every group shows its line under the heading, open or closed", () => {
    const { container } = show("/dashboard");
    expect(container.querySelector(".side-tt")!.textContent).toBe("All pages");
    const dash = container.querySelector<HTMLAnchorElement>("a.side-dash")!;
    expect(dash.getAttribute("href")).toBe("/dashboard");
    expect(dash.textContent).toBe("DashboardYour day at a glance: prices, alerts and scores of what you follow");
    const heads = [...container.querySelectorAll<HTMLButtonElement>("button.side-gb")];
    expect(heads.map((h) => [h.querySelector(".side-gname")!.textContent, h.querySelector(".side-gs")!.textContent])).toEqual([
      ["My portfolio & watchlists", "Your holdings, watchlists, alerts and baskets"], ["Find stocks", "Screeners, themes and what big investors hold"],
      ["Analyse a company", "One company in depth: report, rating, financials, forecasts"], ["Compare & chart", "Companies side by side, and any figure on a chart"],
      ["Valuation & SIP calculators", "Fair value, P/E, DCF and how a SIP grows"], ["Markets & economy", "Sectors, FII and DII money, the economy, commodities"],
      ["Results, IPOs & news", "Who reports when, the latest results, IPOs and filings"], ["Mutual funds & ETFs", "Find, screen and compare funds and ETFs"],
      ["Learn", "Glossary, how-to guides, research notes and the forum"], ["Apps & add-ons", "FinLit in your browser and in your AI assistant"], ["Account", "Your profile, appearance and plan"]]);
    expect(heads.find((h) => h.getAttribute("aria-expanded") === "false")!.querySelector(".side-gs")).toBeTruthy();   // the line stays when the group is closed
  });
  it("toggles a group by click and remembers it", () => {
    show("/dashboard");
    const b = screen.getByRole("button", { name: /Compare & chart/ });
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(JSON.parse(localStorage.getItem("finlit:ui:side-groups")!).data["compare"]).toBe(true);           // task #282: remembered by the group's id
  });
  it("keeps the Gold tag on gold tools and the collapse button", () => {
    show("/dashboard");
    expect(screen.getAllByLabelText("Gold plan").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Collapse the side menu" })).toBeTruthy();
  });
  it("folds the menu to the icon rail on the Find stocks pages (the table gets the room), and keeps the reader's own choice elsewhere", () => {
    localStorage.clear();
    const find = show("/screener", false);
    expect(find.container.querySelector(".shell")!.classList.contains("is-collapsed")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Expand the side menu" }));
    expect(find.container.querySelector(".shell")!.classList.contains("is-collapsed")).toBe(false);
    cleanup();
    const other = show("/dashboard", false);
    expect(other.container.querySelector(".shell")!.classList.contains("is-collapsed")).toBe(true);       // opening it on a screener never changed the menu elsewhere (the rail is the default there too)
    cleanup();
    expect(show("/advanced-score-screener", false).container.querySelector(".shell")!.classList.contains("is-collapsed")).toBe(false);   // and the choice made there is remembered there
  });
  it("filters the pages from the search box, opens the matching groups and says when nothing matches", () => {
    const { container } = show("/dashboard");
    const box = screen.getByRole("searchbox", { name: "Find a page" });
    fireEvent.change(box, { target: { value: "glossary" } });
    expect(container.querySelectorAll(".side-i").length).toBeGreaterThan(0);
    expect([...container.querySelectorAll(".side-i")].every((a) => /glossary/i.test(a.textContent!))).toBe(true);
    expect(screen.getByRole("button", { name: /Learn/ }).getAttribute("aria-expanded")).toBe("true");
    // task #282: a page is found by its line too ("inflation" is in India economy's line), and the old name "documents" finds its new name
    fireEvent.change(box, { target: { value: "inflation" } });
    expect([...container.querySelectorAll(".side-g .side-lt")].map((x) => x.textContent)).toEqual(["India economy"]);
    fireEvent.change(box, { target: { value: "documents" } });
    expect([...container.querySelectorAll(".side-g .side-lt")].map((x) => x.textContent)).toEqual(["Annual reports & presentations"]);
    fireEvent.change(box, { target: { value: "zzzz-nothing" } });
    expect(screen.getByRole("status").textContent).toMatch(/No page matches/);
    fireEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    expect(container.querySelectorAll("button.side-gb").length).toBeGreaterThanOrEqual(10);
  });
  it("moves focus with the arrow keys and Ctrl+/ focuses the search box", () => {
    const { container } = show("/dashboard");
    const first = container.querySelector<HTMLElement>("a.side-dash")!, heads = [...container.querySelectorAll<HTMLButtonElement>("button.side-gb")];   // task #282: Dashboard is the first row
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(heads[0]);
    fireEvent.keyDown(window, { key: "/", ctrlKey: true });
    return new Promise<void>((done) => requestAnimationFrame(() => { expect(document.activeElement).toBe(screen.getByRole("searchbox")); done(); }));
  });
  // The "FinLit final pages" pack (13 Nov 2026): the menu is folded to an icon rail by default, one entry per group with the pack's short names.
  it("starts folded to the icon rail: Dashboard and the ten groups (task #282) with their folded words; each tooltip is the heading and its line", () => {
    show("/dashboard", false);
    const rail = screen.getByRole("navigation", { name: "All pages, collapsed" });
    const entries = [...rail.querySelectorAll<HTMLElement>(".side-rail-g")];
    expect(entries.map((b) => b.textContent)).toEqual(["Dashboard", "Portfolio", "Find", "Company", "Compare", "Calculators", "Markets", "News", "Funds", "Learn", "Apps", "Account"]);
    expect(entries[0].tagName).toBe("A"); expect(entries[0].getAttribute("href")).toBe("/dashboard");                  // Dashboard's icon opens the dashboard
    expect(entries[2].getAttribute("aria-label")).toBe("Find stocks: Screeners, themes and what big investors hold");
    expect(entries[2].getAttribute("title")).toBe("Find stocks: Screeners, themes and what big investors hold");
    for (const b of entries) expect(b.querySelector("svg")).toBeTruthy();
    expect(rail.querySelector("button[aria-label='Expand the side menu']")).toBeTruthy();
  });
  it("highlights the group of the current page", () => {
    show("/sectors", false);
    const on = [...document.querySelectorAll("button.side-rail-g.on")];
    expect(on.map((b) => b.textContent)).toEqual(["Markets"]); expect(on[0].getAttribute("aria-current")).toBe("true");   // the Markets & economy group
  });
  it("a group opens its pages beside the rail; Escape closes it and the group's button keeps the focus", () => {
    show("/dashboard", false);
    const markets = screen.getByRole("button", { name: /^Markets & economy:/ });
    fireEvent.click(markets); expect(markets.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByRole("dialog", { name: "Markets & economy" });
    expect(panel.querySelector(".side-fly-s")!.textContent).toBe("Sectors, FII and DII money, the economy, commodities");   // the pop-out repeats the line
    const links = [...panel.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toContain("/sectors"); expect(links).toContain("/sectors/rotation");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Markets & economy" })).toBeNull(); expect(document.activeElement).toBe(markets);
  });
  it("Expand shows the full menu and is remembered; Collapse brings the rail back", () => {
    show("/dashboard", false);
    fireEvent.click(screen.getByRole("button", { name: "Expand the side menu" }));
    expect(screen.queryByRole("navigation", { name: "All pages, collapsed" })).toBeNull();
    expect(JSON.parse(localStorage.getItem("finlit:ui:side-collapsed")!).data).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Collapse the side menu" }));
    expect(screen.getByRole("navigation", { name: "All pages, collapsed" })).toBeTruthy();
  });
});
