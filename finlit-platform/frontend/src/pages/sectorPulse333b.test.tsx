// @vitest-environment jsdom
// Task #333 part B (developer file 30, additions 5 and 6): "Your sectors" with the switch My portfolio · My watchlist · Both, small pills (three, then +N), a watchlist
// share with a dashed outline, a share in both shown once, every row shown, a bell in its own last column that opens the Alert me card and saves the choice in the
// member's preferences, and the "Your sectors will show here" box when there are no shares and no watchlist.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import board from "../lib/__fixtures__/pulse-board-6nov.json";
import history from "../../public/demo/sector-history.json";
import type { Board } from "../lib/sectors";

const st = vi.hoisted(() => ({ holdings: [] as { symbol: string }[], watch: [] as string[], prefs: { sectorAlerts: [] as string[] }, set: vi.fn() }));
vi.mock("../lib/sectors", async (orig) => ({ ...(await orig<typeof import("../lib/sectors")>()), useSectorBoard: () => ({ data: board, isLoading: false, isError: false }) }));
vi.mock("../lib/sectorHistory", async (orig) => ({ ...(await orig<typeof import("../lib/sectorHistory")>()), useSectorHistory: () => ({ data: history }) }));
vi.mock("../lib/sectorExtra", async (orig) => ({ ...(await orig<typeof import("../lib/sectorExtra")>()), useIndustryMap: () => ({ data: undefined }) }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("../lib/portfolio", () => ({ usePortfolio: () => ({ holdings: st.holdings }) }));
vi.mock("../lib/watchlist", () => ({ useWatchlist: () => ({ lists: [{ id: "main", name: "My watchlist", symbols: st.watch }], meta: {} }) }));
vi.mock("../lib/prefs", async (orig) => ({ ...(await orig<typeof import("../lib/prefs")>()), usePrefs: () => st.prefs, prefs: { set: (p: unknown) => { st.set(p); Object.assign(st.prefs, p); } } }));
const GROUP: Record<string, { slug: string; name: string }> = {
  HDFCBANK: { slug: "finance", name: "Finance" }, BAJFINANCE: { slug: "finance", name: "Finance" }, SBICARD: { slug: "finance", name: "Finance" }, CHOLAFIN: { slug: "finance", name: "Finance" },
  NTPC: { slug: "power", name: "Power" }, LT: { slug: "construction", name: "Construction" },
};
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiGet: vi.fn((url: string) => url.startsWith("/api/alerts") ? Promise.resolve({ alerts: [], limit: 30 })
    : url.startsWith("/api/sectors/membership") ? Promise.resolve({ groups: Object.fromEntries(decodeURIComponent(url.split("symbols=")[1].split("&")[0]).split(",").filter((s) => GROUP[s]).map((s) => [s, GROUP[s]])) })
    : new Promise(() => {})),
  useSearchIndex: () => ({ data: undefined }) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "gold", upgrade: vi.fn(), has: () => true }), TIER: { basic: { n: "Basic" }, silver: { n: "Silver" }, gold: { n: "Gold" } } }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { SectorPulsePage } from "./SectorPulse";

void (board as unknown as Board);
beforeEach(() => { localStorage.clear(); st.holdings = []; st.watch = []; st.prefs.sectorAlerts = []; st.set.mockClear(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(cleanup);
const at = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/sectors?show=industries"]}><SectorPulsePage /></MemoryRouter></QueryClientProvider>);
const yours = () => document.getElementById("sx-yours")!.closest("section")!;
const rows = () => [...yours().querySelectorAll(".sp-yours tbody tr")];

describe("Your industries: portfolio, watchlist or both (task #333, addition 6)", () => {
  it("switches between the portfolio, the watchlist and both; a share in both shows once; watchlist pills are dashed", async () => {
    st.holdings = [{ symbol: "HDFCBANK" }, { symbol: "BAJFINANCE" }, { symbol: "SBICARD" }, { symbol: "CHOLAFIN" }, { symbol: "NTPC" }];
    st.watch = ["LT", "NTPC"];
    at();
    const sw = within(yours()).getByRole("group", { name: "Which shares" });
    expect(within(sw).getByRole("button", { name: /My portfolio/ }).textContent).toBe("My portfolio 5 shares");
    expect(within(sw).getByRole("button", { name: /My portfolio/ }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    expect(rows().map((r) => r.querySelector(".sp-ind")!.textContent).sort()).toEqual(["Finance", "Power"]);
    // four Finance shares: three pills, then +1 which opens the rest
    const fin = rows().find((r) => r.textContent!.startsWith("Finance"))!;
    expect(fin.querySelectorAll("a.sp-sym")).toHaveLength(3);
    fireEvent.click(within(fin as HTMLElement).getByRole("button", { name: "+1" }));
    expect(fin.querySelectorAll("a.sp-sym")).toHaveLength(4);
    // the callout is about the portfolio: on My watchlist it is gone
    fireEvent.click(within(sw).getByRole("button", { name: /My watchlist/ }));
    expect(rows().map((r) => r.querySelector(".sp-ind")!.textContent).sort()).toEqual(["Construction", "Power"]);
    expect(yours().querySelectorAll(".sp-card")).toHaveLength(0);
    expect(yours().querySelectorAll("a.sp-sym.sx-wl").length).toBeGreaterThan(0);
    fireEvent.click(within(sw).getByRole("button", { name: "Both" }));
    expect(rows()).toHaveLength(3);
    expect([...yours().querySelectorAll("a.sp-sym")].filter((a) => a.textContent === "NTPC")).toHaveLength(1);   // held and watched: once, as held
    expect(yours().querySelector('a.sp-sym[href="/stocks/NTPC"]')!.className).not.toContain("sx-wl");
    expect(within(yours()).queryByRole("button", { name: /^Show all/ })).toBeNull();
  });
  it("no shares and no watchlist: 'Your industries will show here' with Add my shares and Open my watchlist", () => {
    at();
    const box = screen.getByTestId("your-empty");
    expect(box.textContent).toContain("Your industries will show here");
    expect(within(box).getByRole("link", { name: "Add my shares" }).getAttribute("href")).toBe("/portfolio");
    expect(within(box).getByRole("link", { name: "Open my watchlist" }).getAttribute("href")).toBe("/watchlists");
    expect(document.querySelectorAll("tr.sx-mine, .sp-yourtag")).toHaveLength(0);
  });
});

describe("Alert me (task #333, addition 5)", () => {
  it("the bell opens the card with three tick boxes and the plan line; Set alert saves the choice and the bell reads Alert set", async () => {
    st.holdings = [{ symbol: "NTPC" }];
    at();
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    const bell = within(yours()).getByRole("button", { name: "Alert me about Power" });
    fireEvent.click(bell);
    const card = await screen.findByRole("dialog", { name: "Alert me about Power" });
    expect(within(card).getAllByRole("checkbox").map((c) => c.parentElement!.textContent)).toEqual(["When its state changes (Sector Pulse)", "When it moves to another box (Sector Rotation)", "When it enters or leaves the top 5 by rank"]);
    expect(card.textContent).toContain("Sent after the weekly close. Counts towards your alert limit");
    fireEvent.click(within(card).getAllByRole("checkbox")[2]);
    fireEvent.click(within(card).getByRole("button", { name: "Set alert" }));
    expect(st.set).toHaveBeenCalledWith({ sectorAlerts: ["state:industries:power", "box:industries:power", "top5:industries:power"] });
    cleanup(); at();
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    expect(within(yours()).getByRole("button", { name: "Alert set for Power" }).className).toContain("on");
  });
});
