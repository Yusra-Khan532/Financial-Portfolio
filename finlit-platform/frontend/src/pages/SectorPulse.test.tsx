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
    expect(document.body.textContent).toContain("38 groups: 33 industries and 5 sectors, as NSE groups them");
    const tabs = screen.getByRole("navigation", { name: "Sector pages" });
    expect(within(tabs).getByRole("link", { name: "Sector Rotation" })).toBeTruthy();
    const view = screen.getByRole("group", { name: "View" });
    expect(within(view).getByRole("button", { name: "Simple" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByLabelText("Market backdrop").textContent).toMatch(/Nifty 50 above its long-term average/);
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
    expect(h2()).toContain("The market's mood, day by day");
    expect(localStorage.getItem("finlit-sx-box-all")).toBe("time");          // remembered for the member
    const chk = screen.getByRole("tablist", { name: "Checks on the price picture" });
    fireEvent.click(within(chk).getByRole("tab", { name: /What happened next$/ }));
    expect(h2()).toContain("The cycle industries move through");
    // the closed rows: title, one line and Show; nothing inside is drawn until opened
    const folds = [...document.querySelectorAll("details.sx-fold > summary b")].map((b) => b.textContent);
    expect(folds).toEqual(["Standout stocks in weak industries", "Which stocks are counted, and what is too small for a reading", "Words on this page"]);
    expect(document.querySelectorAll("details.sx-fold .sx-fs").length).toBe(3);
    expect(said()).not.toMatch(ADVICE);
  });
  it("a link can open box 1 on a tab (&tab=map, &tab=time)", () => {
    at("/sectors?tab=time");
    expect(within(screen.getByRole("tablist", { name: "All 38 groups" })).getByRole("tab", { name: /Over time$/ }).getAttribute("aria-selected")).toBe("true");
  });
  it("no Hide buttons in the new layout; the headline is a coloured chip; three callouts under Today", () => {
    at();
    expect(screen.queryAllByRole("button", { name: /^Hide: / })).toHaveLength(0);
    const chip = document.querySelector(".sp-lead .sx-hl")!;
    expect(chip.className).toMatch(/sx-hl-(bad|watch|good)/);
    const today = document.getElementById("sx-today")!.closest("section")!;
    expect(today.querySelectorAll(".sp-card")).toHaveLength(3);
    expect(today.textContent).toMatch(/\d+ still marked Sold off/);
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
    const text = document.body.textContent ?? "";
    expect(text).toContain("Breadth is improving fast");
    expect(text).toContain("32 groups now have more than half their stocks above the short trend.");
    expect(text).toContain("In 29 of 38 groups half or fewer of the stocks are above their longer trend.");
    expect(h2()).toEqual(expect.arrayContaining(["Every industry, every number", "Too small for a reading", "Six months of every industry"]));
    expect(said()).not.toMatch(ADVICE);
  });
  it("groups the rows by state, and the filter buttons narrow them", () => {
    at("/sectors?view=full");
    const rows = () => document.querySelectorAll(".sp-full .sp-row").length;
    expect(rows()).toBe(38);
    const show = screen.getByRole("group", { name: "Show" });
    fireEvent.click(within(show).getByRole("button", { name: "Sold off · 21" }));
    expect(rows()).toBe(21);
    fireEvent.click(within(show).getByRole("button", { name: "Losing steam · 2" }));
    expect(rows()).toBe(2);
    fireEvent.click(within(show).getByRole("button", { name: "All 38" }));
    expect(rows()).toBe(38);
    expect(screen.queryByRole("button", { name: "Download CSV" })).toBeNull();   // task #333: no plan offers downloads
  });
  it("draws one row of Friday squares per industry with a reading, today's column outlined", () => {
    at("/sectors?view=full");
    const six = screen.getByRole("img", { name: /industries' state at \d+ Friday closes/ });
    expect(six.querySelectorAll("g").length).toBe(38);
    expect(six.querySelectorAll(".sp-fri-now").length).toBe(1);
    expect(screen.getByRole("button", { name: "Hide: Six months of every industry" })).toBeTruthy();
  });
});

describe("task #192 round 4a-2 (SECTOR-PAGES.md 2 to 8), Sector Pulse", () => {
  it("has the guide under the header, closed by default, with the page's own counts and the state table word for word", () => {
    at();
    const open = screen.getByRole("button", { name: /How to read and use this page/ });
    expect(open.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.textContent).not.toContain("How to read this page");   // the old box is gone
    fireEvent.click(open);
    expect(document.body.textContent).toContain("in each of the 38 groups (33 industries and 5 sectors) are above their trend");
    const rows = [...document.querySelectorAll(".sp-guide-t tbody tr")].map((r) => [r.children[0].textContent, r.children[1].textContent]);
    expect(rows.find((r) => r[0] === "No clear signal")?.[1]).toBe("No sell-off, bounce or broad rise: its stocks are not moving together.");
    expect(rows).toHaveLength(6);
  });
  it("task #333: the section bar names every stop and sits after the guide; pressing a closed row's name opens it", () => {
    at();
    const bar = screen.getByRole("navigation", { name: "On this page" });
    expect(within(bar).getAllByRole("link").map((a) => a.textContent)).toEqual(["1Today", "2Your industries", "3All 38 groups", "4Price checks", "5Standout stocks", "6Stocks counted", "7Words explained"]);
    expect(document.querySelector(".sp-guide")!.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(bar).getByRole("link", { name: /Words explained$/ }));
    expect((document.getElementById("sx-words") as HTMLDetailsElement).open).toBe(true);
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
    expect(document.body.textContent).not.toMatch(/and \d+ more/);
    const more = screen.getByRole("button", { name: "+12 more ▾" });
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
  });
  it("Full table: 1 Every number → 2 Six months → 3 Standout stocks → 4 Too small, the table's i button, and the guide", () => {
    at("/sectors?view=full");
    const bar = screen.getByRole("navigation", { name: "Sections on this page" });
    expect(within(bar).getAllByRole("link").map((a) => a.textContent)).toEqual(["1Every number", "2Six months", "3Standout stocks", "4Too small"]);
    expect(screen.getByRole("button", { name: "About “Every industry, every number”" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /How to read and use this page/ })).toBeTruthy();
    const order = ["Every industry, every number", "Six months of every industry", "Standout stocks", "Too small for a reading"].map((t) => h2().findIndex((x) => x?.startsWith(t)));
    expect(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1]))).toBe(true);
  });
});
