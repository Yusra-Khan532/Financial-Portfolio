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
    expect(screen.getByRole("button", { name: "Find stocks" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Compare & chart" }).getAttribute("aria-expanded")).toBe("false");
  });
  it("task #282 rework (slim menu): All pages; Dashboard one line with its own i; each heading one line, its line behind an i; no page count", () => {
    const { container } = show("/dashboard");
    expect(container.querySelector(".side-tt")!.textContent).toBe("All pages");
    const dash = container.querySelector<HTMLAnchorElement>("a.side-dash")!;
    expect(dash.getAttribute("href")).toBe("/dashboard");
    expect(dash.textContent).toBe("Dashboard");
    expect(screen.getByRole("button", { name: "What is on the Dashboard" }).getAttribute("aria-controls")).toBe("side-dash-d");
    const heads = [...container.querySelectorAll<HTMLButtonElement>("button.side-gb")];
    expect(heads.map((h) => h.textContent)).toEqual(["My portfolio & watchlists", "Find stocks", "Analyse a company", "Compare & chart", "Valuation & SIP calculators",
      "Markets & economy", "Results, IPOs & news", "Mutual funds & ETFs", "Learn", "Apps & add-ons", "Account"]);     // one line each: no line, no count
    expect(container.querySelector(".side-gn, .side-gs, .side-gw")).toBeNull();
    // the lines are kept, each behind its group's i, as a hidden note
    const notes = [...container.querySelectorAll<HTMLElement>(".side-g > p.side-desc")];
    expect(notes.map((n) => n.textContent)).toEqual(["Your holdings, watchlists and alerts", "Screeners, themes and what big investors hold",
      "One company in depth: report, rating, financials, forecasts", "Companies side by side, and any figure on a chart", "Fair value, P/E, DCF and how a SIP grows",
      "Sectors, FII and DII money, the economy, commodities", "Who reports when, the latest results, IPOs and filings", "Find, screen and compare funds and ETFs",
      "Glossary, bookmarked words, research notes and the forum", "FinLit in your browser and in your AI assistant", "Your profile, appearance and plan"]);
    expect(notes.every((n) => n.hidden)).toBe(true);
  });
  it("the i opens its note under the heading without opening the group; one note at a time; Escape closes it", () => {
    const { container } = show("/dashboard");
    const head = screen.getByRole("button", { name: "Compare & chart" }), i = screen.getByRole("button", { name: "What is in Compare & chart" });
    fireEvent.click(i);
    expect(i.getAttribute("aria-expanded")).toBe("true");
    expect(head.getAttribute("aria-expanded")).toBe("false");                                         // the group stays closed
    expect((container.querySelector("#" + i.getAttribute("aria-controls")) as HTMLElement).hidden).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "What is on the Dashboard" }));                  // another note: the first closes
    expect(i.getAttribute("aria-expanded")).toBe("false");
    const d = screen.getByRole("button", { name: "What is on the Dashboard" });
    fireEvent.keyDown(d, { key: "Escape" });
    expect(d.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(head);                                                                               // the heading opens the group, not the note
    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(i.getAttribute("aria-expanded")).toBe("false");
  });
  it("one group open at a time: opening one closes the other, and the last one opened is remembered under one key", () => {
    show("/dashboard");
    const find = screen.getByRole("button", { name: "Find stocks" }), cmp = screen.getByRole("button", { name: "Compare & chart" }), mk = screen.getByRole("button", { name: "Markets & economy" });
    expect(find.getAttribute("aria-expanded")).toBe("true");                                            // a first visit: Find stocks
    fireEvent.click(cmp);
    expect(cmp.getAttribute("aria-expanded")).toBe("true"); expect(find.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(mk);
    expect(mk.getAttribute("aria-expanded")).toBe("true"); expect(cmp.getAttribute("aria-expanded")).toBe("false");
    expect(JSON.parse(localStorage.getItem("finlit:ui:side-open")!).data).toBe("markets");
    fireEvent.click(mk);                                                                                 // closing it leaves none open
    expect(document.querySelectorAll('button.side-gb[aria-expanded="true"]')).toHaveLength(0);
    cleanup();
    show("/superinvestors");                                                                             // the page's own group opens on arrival
    expect(screen.getByRole("button", { name: "Find stocks" }).getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelectorAll('button.side-gb[aria-expanded="true"]')).toHaveLength(1);
  });
  it("keeps the Gold tag on gold tools and the collapse button", () => {
    show("/dashboard");
    expect(screen.getAllByLabelText("Gold plan").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Collapse the side menu" })).toBeTruthy();
  });
  it("task #310 part D: one remembered choice for every page: opening the menu on a screener opens it on the dashboard, the report and Sector Pulse too", () => {
    localStorage.clear();
    localStorage.setItem("finlit:ui:side-collapsed-find", JSON.stringify({ v: 1, data: true }));         // the old per-section setting is no longer read
    const find = show("/screener", false);
    expect(find.container.querySelector(".shell")!.classList.contains("is-collapsed")).toBe(true);       // the rail by default
    fireEvent.click(screen.getByRole("button", { name: "Expand the side menu" }));
    expect(find.container.querySelector(".shell")!.classList.contains("is-collapsed")).toBe(false);
    expect(localStorage.getItem("finlit:ui:side-collapsed-find")).toBeNull();
    for (const p of ["/dashboard", "/stocks/RELIANCE", "/sectors", "/advanced-score-screener"]) {
      cleanup();
      expect(show(p, false).container.querySelector(".shell")!.classList.contains("is-collapsed"), p).toBe(false);
    }
  });
  it("filters the pages from the search box, opens the matching groups and says when nothing matches", () => {
    const { container } = show("/dashboard");
    const box = screen.getByRole("searchbox", { name: "Find a page" });
    fireEvent.change(box, { target: { value: "glossary" } });
    expect(container.querySelectorAll(".side-i").length).toBeGreaterThan(0);
    expect([...container.querySelectorAll(".side-i")].every((a) => /glossary/i.test(a.textContent!))).toBe(true);
    expect(screen.getByRole("button", { name: "Learn" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByRole("button", { name: "Compare & chart" })).toBeNull();                                // only the groups with a match show, open
    // task #282: a page is found by its line too ("inflation" is in India economy's line), and the old name "documents" finds its new name
    fireEvent.change(box, { target: { value: "inflation" } });
    expect([...container.querySelectorAll(".side-g .side-lt")].map((x) => x.textContent)).toEqual(["India economy"]);
    fireEvent.change(box, { target: { value: "documents" } });
    expect([...container.querySelectorAll(".side-g .side-lt")].map((x) => x.textContent)).toEqual(["Annual reports & presentations"]);
    fireEvent.change(box, { target: { value: "" } });                                                           // clearing it: back to the one group open before
    expect(document.querySelectorAll('button.side-gb[aria-expanded="true"]')).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Find stocks" }).getAttribute("aria-expanded")).toBe("true");
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
    expect(entries.map((b) => b.textContent)).toEqual(["Dashboard", "Portfolio", "Find", "Company", "Compare", "Calculators", "Markets", "News", "Funds", "Learn", "Apps", "Account", "Help"]);   // task #310 part D: Help and feedback at the foot
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

describe("task #285: an i button on every page shows its description", () => {
  it("gives every page row in the side menu an 'About' button that opens and closes the page's line", () => {
    const { container } = show("/dashboard");
    const rows = [...container.querySelectorAll<HTMLElement>(".side-gin > .side-row")];
    expect(rows.length).toBeGreaterThan(30);
    for (const r of rows) {
      const name = r.querySelector(".side-lt")!.textContent!;
      const b = r.querySelector<HTMLButtonElement>("button.side-info");
      expect(b, name).toBeTruthy();
      expect(b!.getAttribute("aria-label")).toBe("About " + name);
      expect(b!.closest("a")).toBeNull();   // the button sits beside the link, never inside it
    }
    const b = screen.getByRole("button", { name: "About Stock screener" });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("#" + b.getAttribute("aria-controls"))!.textContent).toBe("Filter every listed company by size, valuation, growth and debt");
    fireEvent.click(screen.getByRole("button", { name: "About Profile & security" }));
    expect(b.getAttribute("aria-expanded")).toBe("false");   // one open at a time
    expect(screen.getByRole("note").textContent).toBe("Your name, email, password and sign-in");
    fireEvent.click(screen.getByRole("button", { name: "About Profile & security" }));
    expect(screen.queryByRole("note")).toBeNull();
  });
  it("shows the same i buttons in the folded rail's pop-out", () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
    const { container } = show("/dashboard", false);
    fireEvent.click(container.querySelector<HTMLButtonElement>('.side-rail-g[data-group="find"]')!);
    const fly = document.querySelector(".side-fly")!;
    const btns = [...fly.querySelectorAll<HTMLButtonElement>("button.side-info")];
    expect(btns.length).toBe(fly.querySelectorAll("a.side-fly-i").length);
    fireEvent.click(btns[0]);
    expect(fly.querySelector(".side-desc")!.textContent!.length).toBeGreaterThan(10);
    delete (window as { matchMedia?: unknown }).matchMedia;
  });
});
