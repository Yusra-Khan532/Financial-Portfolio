// @vitest-environment jsdom
// The phone app (docs/MOBILE-APP.md, owner 25 Nov 2026), locked in:
// - under 860px the site draws an app: a small top bar with a search box, five bottom tabs (Home, Markets, Discover, Portfolio, Menu), section chips
//   on each tab's pages, a Menu sheet with every page, a floating Tools button (the team's suggestion) and a one-line footer; above 860px none of it,
//   so "Desktop site" in a phone browser (about 980px wide) shows the desktop site;
// - the questions of a page fold into one row on a phone;
// - "/" on a phone opens Markets today for a visitor; /markets and /tools exist.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let signedIn = false;
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: signedIn ? { email: "a@b.c", name: "Asha" } : null, isAdmin: false, ready: true, signOut: vi.fn() }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ theme: "light", toggleTheme: vi.fn(), plan: "basic" }) }));
vi.mock("../lib/planGate", () => ({ useIsGold: () => false }));
vi.mock("../components/PageFeedback", () => ({ HelpActions: () => <button type="button">Report a problem</button> }));
vi.mock("../components/SystemControl", () => ({ SystemControl: () => null }));

import { HUBS, MOST_USED, TOOL_GROUPS, chipFor, tabFor, tabHome, toolsList } from "../lib/mobileNav";
import { HubChips, MobileMenu, MobileTabs, OPEN_PHONE_MENU, ToolsButton } from "../components/mobile/MobileApp";
import { MENU } from "../lib/nav";

const SRC = join(__dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const css = read("styles/mobile-app.css").replace(/\/\*[\s\S]*?\*\//g, "");
const at = (path: string, ui: React.ReactNode) => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

beforeEach(() => { signedIn = false; localStorage.clear(); });
afterEach(() => { cleanup(); });

describe("which tab and chip a page lights", () => {
  it("Home for / and the dashboard; Markets, Discover and Portfolio for their pages; the longest address wins", () => {
    expect(tabFor("/")).toBe("home");
    expect(tabFor("/dashboard")).toBe("home");
    expect(chipFor("/sectors/rotation")?.chip.label).toBe("Rotation");
    expect(chipFor("/sectors/banks")?.chip.label).toBe("Sectors");
    expect(chipFor("/ipo/123")?.chip.label).toBe("IPOs");
    expect(chipFor("/funds/120503")?.chip.label).toBe("Mutual funds");
    expect(chipFor("/etfs/NIFTYBEES")?.chip.label).toBe("ETFs");
    expect(chipFor("/stocks/RELIANCE")?.chip.label).toBe("All tools");
    expect(tabFor("/stocks/RELIANCE")).toBe("discover");
    expect(tabFor("/holdings")).toBe("folio");
    expect(tabFor("/about")).toBeNull();
    expect(tabFor("/plans")).toBeNull();
  });
  it("each tab opens its first chip; Home is the dashboard for a member, the phone home for a visitor", () => {
    expect(tabHome("home", false)).toBe("/");
    expect(tabHome("home", true)).toBe("/dashboard");
    expect(tabHome("markets", false)).toBe("/markets");
    expect(tabHome("discover", false)).toBe("/screener");
    expect(tabHome("folio", false)).toBe("/watchlist");
  });
  it("every chip and every Most used page is a real page of the site (in the menu, or one of the two new phone pages)", () => {
    const known = new Set([...MENU.flatMap((g) => g.items.map((i) => i.to)), "/markets", "/tools", "/premium/markets"]);
    for (const tab of Object.values(HUBS)) for (const c of tab) expect(known.has(c.to), c.to).toBe(true);
    for (const m of MOST_USED) expect(known.has(m.to), m.to).toBe(true);
    const app = read("App.tsx");
    expect(app).toMatch(/<Route path="markets" element=\{<MarketsToday \/>\} \/>/);
    expect(app).toMatch(/<Route path="tools" element=\{<AllToolsPage \/>\} \/>/);
    expect(app).toMatch(/function IndexPage\(\) \{ return useIsPhone\(\) \? <MarketsToday home \/> : <Home \/>; \}/);
  });
  it("All tools lists every group of tools from the menus", () => {
    expect(TOOL_GROUPS.map((g) => g.title)).toEqual(["Find stocks", "Analyse a company", "Compare & chart", "Valuation & SIP calculators", "Markets & economy", "Mutual funds & ETFs"]);
  });
});

describe("the Tools button's list", () => {
  it("on a company page: that company's tools first, then the fixed tools, at most 7 rows, nothing twice", () => {
    const l = toolsList("/stocks/RELIANCE");
    expect(l.slice(0, 5).map((t) => t.label)).toEqual(["Compare RELIANCE", "Prism report: RELIANCE", "DCF value of RELIANCE", "Stress Lab: RELIANCE", "Set an alert on RELIANCE"]);
    expect(l.slice(0, 5).every((t) => t.here)).toBe(true);
    expect(l).toHaveLength(7);
    expect(l.map((t) => t.label)).not.toContain("FinLit Prism");   // the company's Prism report is already there
    expect(l.map((t) => t.label)).not.toContain("Compare companies");
    expect(l[0].to).toBe("/compare?c=RELIANCE");
    expect(l[2].to).toBe("/dcf?sym=RELIANCE");
  });
  it("elsewhere: the fixed tools in a fixed order, without the page you are on", () => {
    expect(toolsList("/").map((t) => t.label)).toEqual(["Stock screener", "Compare companies", "FinLit Prism", "Sector Pulse", "IPOs", "SIP calculator", "Alerts"]);
    expect(toolsList("/ipo").map((t) => t.label)).not.toContain("IPOs");
    expect(toolsList("/sectors")[0].label).toBe("How to read Sector Pulse");
  });
});

describe("the bottom tabs", () => {
  it("Home, Markets, Discover, Portfolio and Menu; the tab of the page is lit; Menu opens the Menu sheet", () => {
    at("/sectors", <><MobileTabs /><MobileMenu /></>);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect([...nav.querySelectorAll(".ma-tab")].map((e) => e.textContent)).toEqual(["Home", "Markets", "Discover", "Portfolio", "Menu"]);
    expect(nav.querySelector(".ma-tab.on")?.textContent).toBe("Markets");
    expect(nav.querySelector('a[href="/markets"]')).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
  });
  it("a member's Home tab opens the dashboard", () => {
    signedIn = true;
    at("/", <MobileTabs />);
    expect(screen.getByRole("navigation", { name: "Main" }).querySelector('a[href="/dashboard"]')).toBeTruthy();
  });
});

describe("the section chips", () => {
  it("on a Markets page: Today, Sectors, Rotation, IPOs, Results, FII & DII, News, Concalls, Economy, Events; the page's chip is lit", () => {
    at("/sectors/rotation", <HubChips />);
    const row = screen.getByRole("navigation", { name: "Markets sections" });
    expect([...row.querySelectorAll(".ma-chip")].map((e) => e.textContent)).toEqual(["Today", "Sectors", "Rotation", "IPOs", "Results", "FII & DII", "News", "Concalls", "Economy", "Events"]);
    expect(row.querySelector('.ma-chip[aria-current="page"]')?.textContent).toBe("Rotation");
  });
  it("none on a page outside the four tabs", () => {
    at("/about", <HubChips />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("the Menu sheet", () => {
  it("a visitor: Sign in, Create a free account, the theme and Tools button switches, Most used, every page of the menus by group, Desktop site", () => {
    at("/", <MobileMenu />);
    act(() => { dispatchEvent(new Event(OPEN_PHONE_MENU)); });
    const d = screen.getByRole("dialog", { name: "Menu" });
    expect(d.textContent).toContain("Sign in");
    expect(screen.getByRole("link", { name: "Create a free account" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Dark theme/ })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Tools button/ }).getAttribute("aria-checked")).toBe("true");
    for (const g of MENU) for (const it of g.items) expect(d.querySelector(`a[href="${it.to}"]`), it.to).toBeTruthy();
    expect(d.textContent).toContain("Desktop site");
    expect(d.textContent).toContain("not investment advice");
  });
  it("the Tools button switch hides the button and is remembered", () => {
    at("/", <><MobileMenu /><ToolsButton /></>);
    expect(screen.getByRole("button", { name: "Tools" })).toBeTruthy();
    act(() => { dispatchEvent(new Event(OPEN_PHONE_MENU)); });
    fireEvent.click(screen.getByRole("switch", { name: /Tools button/ }));
    expect(screen.queryByRole("button", { name: "Tools" })).toBeNull();
    expect(localStorage.getItem("finlit.tools.button")).toBe("false");
  });
  it("Escape closes it", () => {
    at("/", <MobileMenu />);
    act(() => { dispatchEvent(new Event(OPEN_PHONE_MENU)); });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
  });
});

describe("the Tools button", () => {
  it("closed: one button 'Tools' with aria-expanded=false; open: the list with All tools last; Escape closes and returns focus", () => {
    at("/stocks/RELIANCE", <ToolsButton />);
    const b = screen.getByRole("button", { name: "Tools" });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu", { name: "Tools" });
    const items = [...menu.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent);
    expect(items[0]).toBe("Compare RELIANCE");
    expect(items[items.length - 1]).toBe("All tools");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(b);
  });
  it("not on the sign-in pages", () => {
    at("/login", <ToolsButton />);
    expect(screen.queryByRole("button", { name: "Tools" })).toBeNull();
  });
});

describe("the styles: phone only, compact, 44px taps", () => {
  it("nothing of the phone app is drawn above 860px", () => {
    expect(css).toMatch(/^\.ma-tabs, \.ma-hub, \.ma-fab, \.ma-fabp, \.ma-scrim, \.ma-menu, \.ma-foot \{ display: none; \}/m);
    expect(css).toMatch(/@media \(max-width: 860px\) \{/);
    const main = read("main.tsx");
    expect(main.indexOf('import "./styles/mobile-app.css"')).toBeGreaterThan(main.indexOf('import "./styles/phone310.css"'));
    expect(main.indexOf('import "./styles/mobile-app.css"')).toBeLessThan(main.indexOf('import "./styles/overlay.css"'));
  });
  it("the tabs are 56px, the Tools button 52px and 16px from the edge and the tabs, chips have a 44px tap area", () => {
    expect(css).toMatch(/\.ma-tab \{[^}]*min-height: var\(--ui-bar-h\);/);
    expect(css).toMatch(/\.ma-fab \{[^}]*right: 16px; bottom: calc\(var\(--ui-bar-h\) \+ 16px/);
    expect(css).toMatch(/\.ma-fab \{[^}]*height: 52px;/);
    expect(css).toMatch(/\.ma-chip::after \{ content: ""; position: absolute; inset: -5px -2px; \}/);
    expect(css).toMatch(/\.ma-fab\.hid \{ transform: translateY\(90px\); opacity: 0; pointer-events: none; \}/);
    expect(css).toMatch(/:root:root footer\.band :is\(\.fcta, \.fcols, \.fslim\) \{ display: none; \}/);
  });
  it("the questions fold into one row on a phone", () => {
    expect(read("components/PageFaqs.tsx")).toMatch(/const phone = typeof matchMedia === "function" && matchMedia\("\(max-width: 860px\)"\)\.matches;\s*if \(pathname === "\/dashboard" \|\| phone\) return \(/);
  });
  it("Desktop site: chosen in the Menu, applied before the first paint, with a way back at the foot of every page", () => {
    expect(read("../public/theme-init.js")).toMatch(/localStorage\.getItem\("finlit-desktop-site"\) === "1"[\s\S]*vp\.setAttribute\("content", "width=1180"\)/);
    expect(read("components/Layout.tsx")).toContain("Back to the mobile site");
  });
});

describe("upgrade round 1: locked parts, the company report's actions, tap areas", () => {
  it("a locked part is one compact card on a phone (no blurred example, no list of points), only when locked", () => {
    expect(css).toMatch(/:root:root \.gate\.is-locked > :not\(\.lock\) \{ display: none; \}/);
    expect(css).toMatch(/:root:root \.gate\.is-locked > \.lock \{ position: static; display: block; padding: 0; \}/);
    expect(css).toMatch(/:root:root \.gate\.is-locked \.lock-card ul \{ display: none; \}/);
    expect(css).not.toMatch(/\.gate:not\(\.is-locked\)/);   // an unlocked part is never touched
  });
  it("the company report's four actions sit in one sideways row", () => {
    expect(css).toMatch(/:root:root main \.hx-acts \.actions \{ flex-wrap: nowrap; overflow-x: auto;/);
  });
  it("small links and buttons get a transparent tap area that moves nothing", () => {
    expect(css).toMatch(/\.dbx-ddb\)::after \{ content: ""; position: absolute; inset: -13px -4px; \}/);
    expect(css).toMatch(/\.feed-sym, \.p4-open, \.p4-ab, \.ccm-name/);
  });
});

