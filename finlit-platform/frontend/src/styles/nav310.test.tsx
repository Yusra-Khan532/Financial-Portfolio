// @vitest-environment jsdom
// Task #310 part D (the 22 Nov pack, 04-navigation.md): one layer per job. These lock the navigation rules in:
// - signed in on a tool page the top bar has no menus (the left menu moves between pages); marketing pages and visitors keep them;
// - the left menu is the same on every tool page, the company report included, in two states with one remembered setting, a rail under 1100px and a
//   sheet under 860px, with Help and feedback at its foot; the current page is aria-current="page" on the --s2 fill;
// - sibling pages are the shared page tabs; section bars use the ui-tab selected colour and show only with four or more sections;
// - the ticker strip only on the dashboard and the Markets pages; the floating dock is gone.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: { email: "a@b.c" }, isAdmin: false, plan: "gold" }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ plan: "gold" }) }));
vi.mock("../lib/screens", () => ({ useSavedScreens: () => [] }));
vi.mock("../lib/watchlist", () => ({ useWatchlist: () => ({ lists: [] }) }));
vi.mock("../lib/portfolio", () => ({ usePortfolio: () => ({ holdings: [] }) }));
vi.mock("../lib/alerts", () => ({ useAlerts: () => ({ alerts: [] }), useNotices: () => ({ unread: 0 }) }));
vi.mock("../components/Info", () => ({ Info: () => <button type="button" className="info">i</button> }));

import { AppShell } from "../components/AppShell";
import { PageTabs } from "../components/PageTabs";
import { StepsBar } from "../components/StepsBar";
import { SectionNav } from "../components/SectionNav";
import { useInShell } from "../lib/shellPresence";
import { SECTION_BAR_MIN, showsTape } from "../lib/nav";

const SRC = join(__dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const files = (dir: string, ext: RegExp): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p, ext) : ext.test(f) && !/\.test\./.test(f) ? [p] : []; });

afterEach(() => { cleanup(); localStorage.clear(); });

describe("top bar", () => {
  const layout = read("components/Layout.tsx");
  it("drops the seven menus only when signed in on a page with the left menu; marketing pages and visitors keep them", () => {
    expect(layout).toMatch(/const inShell = useInShell\(\), tool = !!user && inShell;/);
    expect(layout).toMatch(/\{tool \? <><div className="grow" \/>\{find\}<div className="grow" \/>\{ai\}<\/> : <>\s*<nav className="topnav" aria-label="Site">/);
    expect(layout).toMatch(/className=\{"top" \+ \(tool \? " top--tool" : ""\)\}/);
    expect(strip(read("styles/ai-top.css"))).toMatch(/:root \.top\.top--tool \.search \{ flex: 0 1 520px; max-width: 520px;/);   // wider, centred search
  });
  it("the account menu does not repeat the left menu's pages on a tool page, and carries Help and feedback", () => {
    expect(layout).toMatch(/\{!inShell && <>\s*<Link to="\/dashboard" role="menuitem">/);
    expect(layout).toMatch(/<span className="ddt acct-help">Help and feedback<\/span>\s*<HelpActions asMenu/);
  });
  it("the AppShell says it is on screen, so the header knows (and stops knowing once it is gone)", () => {
    const Probe = () => <i data-testid="p">{String(useInShell())}</i>;
    const r = render(<MemoryRouter initialEntries={["/screener"]}><Probe /><Routes><Route element={<AppShell />}><Route path="*" element={<p>page</p>} /></Route></Routes></MemoryRouter>);
    expect(screen.getByTestId("p").textContent).toBe("true");
    r.unmount();
    const r2 = render(<Probe />);
    expect(r2.getByTestId("p").textContent).toBe("false");
  });
});

describe("left menu", () => {
  const shell = read("components/AppShell.tsx");
  it("the company report sits inside AppShell like every other tool page", () => {
    const app = read("App.tsx"), open = app.indexOf("<Route element={<AppShell />}>"), stock = app.indexOf('<Route path="stocks/:symbol" element={<StockPage />} />');
    const close = app.indexOf("</Route>", open);
    expect(open).toBeGreaterThan(0);
    expect(stock).toBeGreaterThan(open);
    expect(stock).toBeLessThan(close);
  });
  it("one remembered setting for every page; a rail from 860 to 1100px; a sheet under 860px", () => {
    expect(shell).toContain('loadUi("side-collapsed", 1, isBool, true)');
    expect(shell).not.toMatch(/loadUi\("side-collapsed-find"|onFind/);
    expect(shell).toContain('DESKTOP_Q = "(min-width: 861px)", NARROW_Q = "(max-width: 1099px)"');
    const css = strip(read("styles/sidebar.css"));
    expect(css).toMatch(/@media \(min-width: 861px\)/);
    expect(css).not.toMatch(/96[01]px/);
    for (const f of ["styles/account.css", "styles/overlay.css", "styles/pagefaqs.css"]) {
      for (const m of strip(read(f)).matchAll(/@media \(max-width: 960px\) \{([^{}]*\{[^{}]*\})/g)) expect(m[1], f).not.toMatch(/\.shell|\.side\b/);
    }
  });
  it("the current page is aria-current=page on the --s2 fill, in the menu and in the rail", () => {
    const css = strip(read("styles/sidebar.css"));
    expect(css).toMatch(/\.side-i\.on \{ background: var\(--s2\);/);
    expect(css).toMatch(/\.side-rail-g\.on \{ background: var\(--s2\);/);
    expect(css).not.toMatch(/#EFE8D7|#fff\b/i);
    render(<MemoryRouter initialEntries={["/sectors"]}><Routes><Route element={<AppShell />}><Route path="*" element={<p>page</p>} /></Route></Routes></MemoryRouter>);
    const cur = document.querySelectorAll('.side-rail [aria-current="page"], .side-rail [aria-current="true"]');
    expect(cur.length).toBe(1);
    expect(cur[0].getAttribute("data-group")).toBe("markets");
    cleanup();
    render(<MemoryRouter initialEntries={["/stocks/RELIANCE"]}><Routes><Route element={<AppShell />}><Route path="*" element={<p>page</p>} /></Route></Routes></MemoryRouter>);
    expect(document.querySelector('.side-rail [aria-current="true"]')?.getAttribute("data-group")).toBe("company");   // the report is "Company report"
    cleanup();
    localStorage.setItem("finlit:ui:side-collapsed", JSON.stringify({ v: 1, data: false }));
    render(<MemoryRouter initialEntries={["/stocks/RELIANCE"]}><Routes><Route element={<AppShell />}><Route path="*" element={<p>page</p>} /></Route></Routes></MemoryRouter>);
    const on = [...document.querySelectorAll('.side [aria-current="page"]')];
    expect(on.map((a) => a.textContent)).toEqual(["Company report"]);
    expect(on[0].classList.contains("on")).toBe(true);
  });
  it("Help and feedback at the foot of the rail and of the open menu opens Raise a Query and Share feedback", () => {
    render(<MemoryRouter initialEntries={["/dashboard"]}><Routes><Route element={<AppShell />}><Route path="*" element={<p>page</p>} /></Route></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Help and feedback" }));
    const fly = screen.getByRole("dialog", { name: "Help and feedback" });
    expect([...fly.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Raise a Query", "Share feedback"]);
    cleanup();
    localStorage.setItem("finlit:ui:side-collapsed", JSON.stringify({ v: 1, data: false }));
    render(<MemoryRouter initialEntries={["/dashboard"]}><Routes><Route element={<AppShell />}><Route path="*" element={<p>page</p>} /></Route></Routes></MemoryRouter>);
    const b = screen.getByRole("button", { name: "Help and feedback" });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    act(() => { fireEvent.click(b); });
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Raise a Query" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share feedback" })).toBeTruthy();
  });
});

describe("page tabs and section bars", () => {
  it("sibling pages are ui-tabs with the current one aria-current=page, left-aligned under the title", () => {
    render(<MemoryRouter initialEntries={["/mf-portfolio"]}><PageTabs set="portfolios" /></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "Portfolios" });
    expect(nav.classList.contains("ui-tabs")).toBe(true);
    const links = [...nav.querySelectorAll("a")];
    expect(links.map((a) => a.textContent)).toEqual(["Equity portfolio", "MF portfolio", "ETF portfolio"]);
    expect(links.every((a) => a.classList.contains("ui-tab"))).toBe(true);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page", null]);
    for (const f of ["components/sectors/pack/PulseHead.tsx", "portfolio/pack/EqTop.tsx", "pages/MfPortfolio.tsx", "pages/EtfPortfolio.tsx"]) expect(read(f), f).toMatch(/<PageTabs set="(sectors|portfolios)"/);
    expect(strip(read("styles/ui.css"))).toMatch(/\.page-tabs \{ justify-content: flex-start;/);
  });
  it("a section bar shows only with four or more sections", () => {
    expect(SECTION_BAR_MIN).toBe(4);
    const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "s" + i, n: i + 1, title: "Step " + i, sections: [{ id: "x" + i, label: "X" }] }));
    const { container, rerender } = render(<StepsBar steps={steps(3)} />);
    expect(container.querySelector(".stb")).toBeNull();
    rerender(<StepsBar steps={steps(4)} />);
    expect(container.querySelector(".stb")).toBeTruthy();
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "j" + i, label: "J" + i, about: "about" }));
    rerender(<SectionNav items={items(3)} scope="body" />);
    expect(container.querySelector(".jumpbar")).toBeNull();
    rerender(<SectionNav items={items(4)} scope="body" />);
    expect(container.querySelector(".jumpbar")).toBeTruthy();
    expect(read("components/sectors/pack/Guide.tsx")).toContain("if (items.length < SECTION_BAR_MIN) return null;");
  });
  it("every section bar marks the section in view with the ui-tab selected colour, not an underline or emerald", () => {
    const ui = strip(read("styles/ui.css"));
    expect(ui).toMatch(/:root :is\(\.stb-chip\[aria-current="step"\], \.sp-secbar-c\[aria-current="location"\], \.eqt-chip\[aria-current="true"\]\) \{\s*background: var\(--ui-on-bg\); color: var\(--ui-on-fg\);/);
    expect(strip(read("styles/section-nav.css"))).toMatch(/\.jumpbar-i\.on \{ background: var\(--ui-on-bg\);[^}]*\}\s*\.jumpbar-i\.on \.jumpbar-b, \.jumpbar-i\.on \.info \{ color: var\(--ui-on-fg\); \}/);
    expect(strip(read("styles/steps-bar.css"))).not.toMatch(/aria-current="step"\][^{]*\{[^}]*inset 0 -2px/);
    expect(strip(read("styles/sectors-pack.css"))).not.toMatch(/\.sp-secbar-c\.on/);
    expect(strip(read("portfolio/pack/pagetop.css"))).not.toMatch(/\.eqt-chip\[aria-current="true"\]/);
    expect(strip(read("styles/section-nav.css"))).not.toMatch(/--gain-soft|inset 0 0 0 1px var\(--gain\)/);
  });
});

describe("ticker strip and floating dock", () => {
  it("the ticker strip shows on the dashboard and the Markets pages only", () => {
    for (const p of ["/dashboard", "/sectors", "/sectors/rotation", "/sectors/banks", "/fii-dii", "/macro", "/premium/markets"]) expect(showsTape(p), p).toBe(true);
    for (const p of ["/", "/screener", "/stocks/RELIANCE", "/funds", "/holdings", "/plans", "/about"]) expect(showsTape(p), p).toBe(false);
    expect(read("components/Layout.tsx")).toContain("{showsTape(loc.pathname) && <Tape />}");
  });
  it("nothing floats over content: no .pf-dock anywhere; Raise a Query and Share feedback are in the account menu, the left menu, the phone sheet and the footer", () => {
    for (const p of files(SRC, /\.(css|tsx?)$/)) expect(readFileSync(p, "utf8"), p).not.toMatch(/pf-dock|PageFeedbackDock/);
    const layout = read("components/Layout.tsx");
    expect(layout.match(/<HelpActions\b/g)?.length).toBe(3);                    // account menu, phone Menu sheet, footer
    expect(read("components/AppShell.tsx")).toContain('<HelpActions className="side-help-i" />');
    expect(read("components/SideRail.tsx")).toContain('<HelpActions className="side-fly-i"');
  });
});
