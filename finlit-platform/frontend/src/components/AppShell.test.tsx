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
    expect(screen.getByRole("button", { name: /Charts/ }).getAttribute("aria-expanded")).toBe("false");
  });
  it("toggles a group by click and remembers it", () => {
    show("/dashboard");
    const b = screen.getByRole("button", { name: /Charts/ });
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(JSON.parse(localStorage.getItem("finlit:ui:side-groups")!).data["Charts"]).toBe(true);
  });
  it("keeps the Gold tag on gold tools and the collapse button", () => {
    show("/dashboard");
    expect(screen.getAllByLabelText("Gold plan").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Collapse the side menu" })).toBeTruthy();
  });
  it("folds the menu to the icon rail on the Find stocks pages (the table gets the room), and keeps the reader's own choice elsewhere", () => {
    localStorage.clear();
    const find = show("/score-screener", false);
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
    fireEvent.change(box, { target: { value: "zzzz-nothing" } });
    expect(screen.getByRole("status").textContent).toMatch(/No page matches/);
    fireEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    expect(container.querySelectorAll("button.side-gb").length).toBeGreaterThanOrEqual(10);
  });
  it("moves focus with the arrow keys and Ctrl+/ focuses the search box", () => {
    const { container } = show("/dashboard");
    const heads = [...container.querySelectorAll<HTMLButtonElement>("button.side-gb")];
    heads[0].focus();
    fireEvent.keyDown(heads[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(heads[0]);
    fireEvent.keyDown(window, { key: "/", ctrlKey: true });
    return new Promise<void>((done) => requestAnimationFrame(() => { expect(document.activeElement).toBe(screen.getByRole("searchbox")); done(); }));
  });
  // The "FinLit final pages" pack (13 Nov 2026): the menu is folded to an icon rail by default, one entry per group with the pack's short names.
  it("starts folded to the pack's icon rail: twelve groups in the pack's order with their short names under the icons", () => {
    show("/dashboard", false);
    const rail = screen.getByRole("navigation", { name: "Workspace, collapsed" });
    const entries = [...rail.querySelectorAll<HTMLButtonElement>("button.side-rail-g")];
    expect(entries.map((b) => b.textContent)).toEqual(["Overview", "Find", "Company", "Calculators", "Charts", "Markets", "News", "Funds", "Workspace", "Gold", "Learn", "Account"]);
    expect(entries.map((b) => b.getAttribute("aria-label"))).toEqual(["Overview", "Find stocks", "Analyse a company", "Investment calculators", "Charts", "Markets", "News & events", "Funds", "Your workspace", "Gold dashboards", "Learn", "Account"]);
    for (const b of entries) expect(b.querySelector("svg")).toBeTruthy();
    expect(rail.querySelector("button[aria-label='Expand the side menu']")).toBeTruthy();
  });
  it("highlights the group of the current page", () => {
    show("/sectors", false);
    const on = [...document.querySelectorAll("button.side-rail-g.on")];
    expect(on.map((b) => b.textContent)).toEqual(["Markets"]); expect(on[0].getAttribute("aria-current")).toBe("true");
  });
  it("a group opens its pages beside the rail; Escape closes it and the group's button keeps the focus", () => {
    show("/dashboard", false);
    const markets = screen.getByRole("button", { name: "Markets" });
    fireEvent.click(markets); expect(markets.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByRole("dialog", { name: "Markets" });
    const links = [...panel.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toContain("/sectors"); expect(links).toContain("/sectors/rotation");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Markets" })).toBeNull(); expect(document.activeElement).toBe(markets);
  });
  it("Expand shows the full menu and is remembered; Collapse brings the rail back", () => {
    show("/dashboard", false);
    fireEvent.click(screen.getByRole("button", { name: "Expand the side menu" }));
    expect(screen.queryByRole("navigation", { name: "Workspace, collapsed" })).toBeNull();
    expect(JSON.parse(localStorage.getItem("finlit:ui:side-collapsed")!).data).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Collapse the side menu" }));
    expect(screen.getByRole("navigation", { name: "Workspace, collapsed" })).toBeTruthy();
  });
});
