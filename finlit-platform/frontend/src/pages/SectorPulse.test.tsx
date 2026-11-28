// @vitest-environment jsdom
// Sector Pulse as the "FinLit final pages" pack draws it (docs/design/finlit-final-pages/05 and 06), on the 6 Nov 2026 close: the header, the Simple view's sections in the
// pack's order, the Full table view (?view=full) with its cards, filters and Friday squares, Basic's locked standouts, and the not-loaded sentence. Describes, never advises.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import board from "../lib/__fixtures__/pulse-board-6nov.json";
import history from "../../public/demo/sector-history.json";
import { ApiError } from "../lib/api";
import type { Board } from "../lib/sectors";

const st = vi.hoisted(() => ({ board: null as unknown, user: null as unknown }));
const q = (d: unknown) => (d instanceof Error ? { data: undefined, isLoading: false, isError: true, error: d, refetch: () => {} } : { data: d, isLoading: false, isError: false, error: null, refetch: () => {} });
vi.mock("../lib/sectors", async (orig) => ({ ...(await orig<typeof import("../lib/sectors")>()), useSectorBoard: () => q(st.board) }));
vi.mock("../lib/sectorHistory", async (orig) => ({ ...(await orig<typeof import("../lib/sectorHistory")>()), useSectorHistory: () => ({ data: history }) }));
vi.mock("../lib/sectorExtra", async (orig) => ({ ...(await orig<typeof import("../lib/sectorExtra")>()), useIndustryMap: () => ({ data: undefined }) }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: st.user }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: vi.fn(() => new Promise(() => {})), useSearchIndex: () => ({ data: undefined }) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "gold", upgrade: vi.fn(), has: () => true }), TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
// task #448: NSE's 59 industries, for the header's "59 NSE industries, read as 38 groups"
vi.mock("../lib/taxonomy", async (orig) => ({ ...(await orig<typeof import("../lib/taxonomy")>()), useTaxonomyIndex: () => ({ data: { industries: Array.from({ length: 59 }, (_, i) => ({ industry: `Industry ${i}`, sector: `Sector ${i % 22}` })) } }) }));
import { SectorPulsePage } from "./SectorPulse";

const B = board as unknown as Board;
beforeEach(() => { localStorage.clear(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); st.board = B; st.user = { id: "u" }; });
afterEach(cleanup);
const at = (path = "/sectors") => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><SectorPulsePage /></MemoryRouter></QueryClientProvider>);
const h2 = () => screen.getAllByRole("heading", { level: 2 }).map((h) => (h.textContent ?? "").replace(/i$/, ""));   // the (i) button inside a title writes "i" after it
const said = () => (document.body.textContent ?? "").replace(document.querySelector(".sp-disclaimer")?.textContent ?? "", "");   // the disclaimer itself says "not a recommendation to buy, sell or hold"
const ADVICE = /\b(buy|sell now|target price|accumulate|best (stock|sector|industry))\b/i;

describe("Sector Pulse, the pack's header", () => {
  it("has the title, the date line from the board, the two page tabs, the view switch, Find and the Market backdrop", () => {
    at();
    expect(screen.getByRole("heading", { level: 1, name: "Sector Pulse" })).toBeTruthy();
    expect(document.body.textContent).toContain("Updated every weekend, to the close of Fri 6 Nov 2026 · 1,202 actively traded stocks");
    expect(document.body.textContent).toContain("59 NSE industries, read as 38 groups");   // task #448 (01 §2)
    expect(screen.getByRole("button", { name: "About “NSE industries”" })).toBeTruthy();
    const tabs = screen.getByRole("navigation", { name: "Sector pages" });
    expect(within(tabs).getByRole("link", { name: "Sector Rotation" })).toBeTruthy();
    const view = screen.getByRole("group", { name: "View" });
    expect(within(view).getByRole("button", { name: "Simple" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("combobox", { name: /Find/ })).toBeTruthy();
    // task #448 (01 §2, 01 §3): the Market backdrop side box is one line with its i; the ⋯ menu after Find
    expect(document.querySelector("aside.sp-side")).toBeNull();
    expect(document.body.textContent).toContain("Market backdrop: +4.6% Nifty 50 above its long-term average");
    expect(screen.getByRole("button", { name: /^More on this page: How to read and use this page, What the labels mean, Which stocks are counted, Words on this page$/ }).getAttribute("aria-haspopup")).toBe("menu");
    expect(document.querySelector(".sp-disclaimer")?.textContent).toMatch(/^Describes price data for NSE industries; not a recommendation to buy, sell or hold any security\./);
  });
});

describe("Sector Pulse, Simple view (pack 05)", () => {
  it("task #333 (file 30): Today, Your industries, the two boxes and the three closed rows, in that order, each title once", () => {
    at();
    const order = ["Today in one minute", "How your industries are doing", "All 38 groups, by state", "Momentum and strength, side by side"].map((t) => h2().findIndex((x) => x?.startsWith(t)));
    expect(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1]))).toBe(true);
    // box 1 opens on By state; Map and Over time are its other tabs; box 2 opens on Against other industries
    const all = screen.getByRole("tablist", { name: "All 38 groups" });
    expect(within(all).getAllByRole("tab").map((t) => t.textContent)).toEqual(["1By state", "2Map", "3Over time"]);
    expect(within(all).getByRole("tab", { name: /By state$/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(within(all).getByRole("tab", { name: /Over time$/ }));
    expect(h2()).toContain("The market's mood, week by week");
    expect(localStorage.getItem("finlit-sx-box-all")).toBe("time");          // remembered for the member
    const chk = screen.getByRole("tablist", { name: "Three checks on the price picture" });
    fireEvent.click(within(chk).getByRole("tab", { name: /What happened next/ }));
    expect(h2()).toContain("The cycle industries move through");
    // the closed rows: title, one line and Show; nothing inside is drawn until opened
    // task #448 (01 §3): Which stocks are counted and Words on this page moved to the ⋯ menu; Standout stocks stays a closed row until the step bar
    const folds = [...document.querySelectorAll("details.sx-fold > summary b")].map((b) => b.textContent);
    expect(folds).toEqual(["Standout stocks in weak industries"]);
    expect(document.querySelectorAll("details.sx-fold .sx-fs").length).toBe(1);
    expect(said()).not.toMatch(ADVICE);
  });
  it("a link can open box 1 on a tab (&tab=map, &tab=time)", () => {
    at("/sectors?tab=time");
    expect(within(screen.getByRole("tablist", { name: "All 38 groups" })).getByRole("tab", { name: /Over time$/ }).getAttribute("aria-selected")).toBe("true");
  });
  it("no Hide buttons in the new layout; the headline is a coloured chip; three things to know under Today, as one quiet list (task #448, 01 §4)", () => {
    at();
    expect(screen.queryAllByRole("button", { name: /^Hide: / })).toHaveLength(0);
    const chip = document.querySelector(".sp-lead .sx-hl")!;
    expect(chip.className).toMatch(/sx-hl-(bad|watch|good)/);
    const today = document.getElementById("sx-today")!.closest("section")!;
    expect(today.querySelectorAll(".sp-card")).toHaveLength(0);
    const rows = today.querySelectorAll(".sx-ql-r");
    expect(rows).toHaveLength(3);
    expect(today.textContent).toMatch(/\d+ still marked Sold off/);
    const first = rows[0].querySelector("button")!;
    expect(first.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(within(today).getByRole("button", { name: "Open all" }));
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(within(today).getByRole("button", { name: "Close all" })).toBeTruthy();
    expect(today.querySelectorAll(".sx-tile").length).toBeGreaterThanOrEqual(5);
  });
  it("for Basic the standout stocks are locked in words, never an empty table", () => {
    st.board = { ...B, leader_flags: null, rows: B.rows.map((r) => ({ ...r, leader_flags: null })), locked: { leader_flags: "silver" } } as Board;
    at();
    const fold = document.getElementById("sx-standouts") as HTMLDetailsElement;
    fold.open = true; fireEvent(fold, new Event("toggle"));
    expect(screen.getByText("The standout stocks are part of the Platinum plan")).toBeTruthy();   // task #333: Silver is retired
  });
  it("when the data is not loaded it says why, with the server's sentence and Try again", () => {
    st.board = new ApiError(503, { status: "not_loaded", reason: "Sector data is not loaded yet: the nightly sector job is switched off on this server." } as never);
    at();
    expect(screen.getByText(/Sector data is not loaded yet: the nightly sector job is switched off/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("Sector Pulse, Full table view (pack 06)", () => {
  it("opens from the address, with the three cards counted from the board", () => {
    at("/sectors?view=full");
    expect(within(screen.getByRole("group", { name: "View" })).getByRole("button", { name: "Full table" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^\d+ things? to know$/ }));   // task #448 (01 §4): the cards are a pill beside the box's tab bar
    const text = document.body.textContent ?? "";
    expect(text).toContain("Breadth is improving fast");
    fireEvent.click(screen.getByRole("button", { name: "Open all" }));
    const opened = document.body.textContent ?? "";
    expect(opened).toContain("32 groups now have more than half their stocks above the short trend.");
    expect(opened).toContain("In 29 of 38 groups, half or fewer of the stocks are above their longer trend.");
    expect(h2()).toContain("Every industry, every number");
    fireEvent.click(screen.getByRole("tab", { name: /Six months, week by week/ }));      // task #333: the other parts are tabs of the one box
    expect(h2()).toContain("Six months of every industry");
    expect(said()).not.toMatch(ADVICE);
  });
  it("groups the rows by state, and the filter buttons narrow them", () => {
    at("/sectors?view=full");
    const rows = () => document.querySelectorAll(".sp-full .sp-row").length;
    expect(rows()).toBe(38);
    const show = screen.getByRole("group", { name: "Show" });
    fireEvent.click(within(show).getByRole("button", { name: "Sold off 21" }));   // task #448 (03 §7): a plain count, never "· 21"
    expect(rows()).toBe(21);
    fireEvent.click(within(show).getByRole("button", { name: "Losing steam 2" }));
    expect(rows()).toBe(2);
    fireEvent.click(within(show).getByRole("button", { name: "All 38" }));
    expect(rows()).toBe(38);
    expect(screen.queryByRole("button", { name: "Download CSV" })).toBeNull();   // task #333: no plan offers downloads
  });
  it("draws one row of Friday squares per industry with a reading, today's column outlined", () => {
    at("/sectors?view=full");
    fireEvent.click(screen.getByRole("tab", { name: /Six months, week by week/ }));
    const six = screen.getByRole("img", { name: /industries' state at \d+ Friday closes/ });
    expect(six.querySelectorAll("g").length).toBe(38);
    expect(six.querySelectorAll(".sp-fri-now").length).toBe(1);
    expect(screen.getByRole("button", { name: "Hide: Six months of every industry" })).toBeTruthy();
  });
});

describe("task #192 round 4a-2 (SECTOR-PAGES.md 2 to 8), Sector Pulse", () => {
  it("task #448 (01 §3): the guide opens from the ⋯ menu over the page, with the page's own counts and the state table word for word; Esc closes it and focus goes back to ⋯", () => {
    at();
    expect(document.querySelector(".sp-guide")).toBeNull();                       // no longer on the page
    const more = screen.getByRole("button", { name: /^More on this page/ });
    fireEvent.click(more);
    fireEvent.click(within(screen.getByRole("menu", { name: "More on this page" })).getByRole("menuitem", { name: "How to read and use this page" }));
    const panel = screen.getByRole("dialog", { name: "How to read and use this page" });
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(panel.textContent).toContain("in each of the 38 groups (33 industries and 5 sectors) are above their trend");
    const rows = [...panel.querySelectorAll(".sp-guide-t tbody tr")].map((r) => [r.children[0].textContent, r.children[1].textContent]);
    expect(rows.find((r) => r[0] === "No clear signal")?.[1]).toBe("No sell-off, bounce or broad rise: its stocks are not moving together.");
    expect(rows).toHaveLength(6);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(more);
  });
  it("task #448 (04 §4): What the labels mean opens from the ⋯ menu, worded for the view, with no wallet row for a member without shares", () => {
    at();
    fireEvent.click(screen.getByRole("button", { name: /^More on this page/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "What the labels mean" }));
    const card = screen.getByRole("dialog", { name: "What the labels mean" });
    expect(card.textContent).toContain("Every label on Sector Pulse and Sector Rotation, in plain words. They describe past prices, not what to buy or sell.");
    expect(card.textContent).toContain("Most of the industry's stocks have fallen below their usual price level, and they have not turned up together yet.");
    expect(card.textContent).toContain("Your shares against their own industry.");
    expect(card.textContent).not.toContain("In your portfolio");
    expect(card.textContent).not.toMatch(/\ba industry\b/);
  });
  it("task #333: the section bar names every stop (task #448: Stocks counted and Words explained moved to the ⋯ menu); pressing a closed row's name opens it", () => {
    at();
    const bar = screen.getByRole("navigation", { name: "On this page" });
    expect(within(bar).getAllByRole("link").map((a) => a.textContent)).toEqual(["1Today", "2Your industries", "3All 38 groups", "4Price checks", "5Inside an industry", "6Standout stocks"]);
    fireEvent.click(within(bar).getByRole("link", { name: /Standout stocks$/ }));
    expect((document.getElementById("sx-standouts") as HTMLDetailsElement).open).toBe(true);
  });
  it("keeps the i buttons on titles and group headers, none beside a chip in a table row", () => {
    at();
    for (const t of ["Today in one minute", "All 38 groups, by state", "How your industries are doing"]) expect(screen.getByRole("button", { name: `About “${t}”` })).toBeTruthy();
    expect(document.querySelectorAll(".sp-yours tbody .sp-i").length).toBe(0);
  });
  it("starts each state group at 5 rows with Show all, and turns 'and 12 more' into +12 more ▾", () => {
    at();
    const sold = [...document.querySelectorAll(".sp-grp-sold_off tbody tr")];
    expect(sold).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Show all 21 ▾" }));
    expect(document.querySelectorAll(".sp-grp-sold_off tbody tr")).toHaveLength(21);
    // task #448 (01 §4): the card is a row of the quiet list; opened, a long list reads "and 12 more ▸"
    const today = document.getElementById("sx-today")!.closest("section")!;
    fireEvent.click(within(today).getByRole("button", { name: /groups are bouncing back/ }));
    const more = screen.getByRole("button", { name: "and 12 more ▸" });
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
  });
  it("task #333: Full table is one box (1 Every number · 2 Six months, week by week · 3 Standout stocks (N)), two callouts, Too small closed, no section strip", () => {
    at("/sectors?view=full");
    expect(screen.queryByRole("navigation", { name: "Sections on this page" })).toBeNull();
    const tabs = within(screen.getByRole("tablist", { name: "All 38 groups" })).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs[0]).toBe("1Every number"); expect(tabs[1]).toBe("2Six months, week by week"); expect(tabs[2]).toMatch(/^3Standout stocks( \(\d+\))?$/);
    // task #448: the two callouts are a "2 things to know" pill beside the tab bar, outside the tab list; Too small and the guide are in the ⋯ menu
    const pill = screen.getByRole("button", { name: "2 things to know" });
    expect(pill.closest("[role=tablist]")).toBeNull();
    expect(screen.getByRole("button", { name: "About “Every industry, every number”" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^More on this page: How to read and use this page, What the labels mean, Too small for a reading, Words on this page$/ })).toBeTruthy();
    expect(document.querySelectorAll("details.sx-fold").length).toBe(0);
  });
  it("task #333: Columns opens on Key figures (Stocks rising, Below 1-yr high, Alert), All columns adds Short, Longer, Held up and Standouts", () => {
    at("/sectors?view=full");
    const t = document.querySelector("table.sx-ft")!;
    expect(t.className).toContain("sx-key");
    expect(t.querySelectorAll("thead .sx-cx").length).toBe(4);                       // hidden by the Key figures set
    expect(t.querySelector("th.sx-alh")!.textContent).toBe("Alert");
    expect(t.querySelectorAll("tbody .sx-alc button").length).toBe(38);
    fireEvent.click(within(screen.getByRole("group", { name: "Columns" })).getByRole("button", { name: "All columns" }));
    expect(document.querySelector("table.sx-ft")!.className).not.toContain("sx-key");
    expect(localStorage.getItem("finlit-sx-cols-full")).toBe("all");
  });
});
