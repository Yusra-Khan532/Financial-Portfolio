// @vitest-environment jsdom
// Task #448 (Sector Pulse, developer file 42), part 2: Today (the first-visit line, For you this week, the headline box with fix 2, the no-shares row) and the
// short "Your industries" view (Count by, the lead, the stacked bar, the peer line, state cards, time in a state), the one alert for all your industries and
// the step bar's dots. A member with made-up shares: two Finance, one Power (both changed state this week) and one Banks (still sold off). Describes, never advises.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import board from "../lib/__fixtures__/pulse-board-6nov.json";
import history from "../../public/demo/sector-history.json";

const st = vi.hoisted(() => ({ holdings: [] as { id: string; symbol: string; qty: number; price: number; owned?: boolean }[], prefs: { sectorAlerts: [] as string[], viewsSeen: [] as string[] }, set: vi.fn() }));
const q = (d: unknown) => ({ data: d, isLoading: false, isError: false, error: null, refetch: () => {} });
const GROUP: Record<string, string> = { FINA: "finance", FINB: "finance", PWRA: "power", BNKA: "banks" };
const PRICE: Record<string, number> = { FINA: 100, FINB: 50, PWRA: 20, BNKA: 400 };
const PEER: Record<string, string> = { FINA: "Leader", FINB: "Laggard", BNKA: "In line" };
vi.mock("../lib/sectors", async (orig) => ({ ...(await orig<typeof import("../lib/sectors")>()), useSectorBoard: () => q(board) }));
vi.mock("../lib/sectorHistory", async (orig) => ({ ...(await orig<typeof import("../lib/sectorHistory")>()), useSectorHistory: () => ({ data: history }) }));
vi.mock("../lib/sectorExtra", async (orig) => ({ ...(await orig<typeof import("../lib/sectorExtra")>()), useIndustryMap: () => ({ data: undefined }) }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("../lib/portfolio", async (orig) => ({ ...(await orig<typeof import("../lib/portfolio")>()), usePortfolio: () => ({ holdings: st.holdings }) }));
vi.mock("../lib/watchlist", () => ({ useWatchlist: () => ({ lists: [], meta: {} }) }));
vi.mock("../lib/prefs", async (orig) => ({ ...(await orig<typeof import("../lib/prefs")>()), usePrefs: () => st.prefs, prefs: { set: (p: Record<string, unknown>) => { st.set(p); Object.assign(st.prefs, p); } } }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), useSearchIndex: () => ({ data: undefined }),
  useSearchQuotes: () => ({ data: { fields: [], amcLogos: {}, level: "gold", builtAt: 0, rows: Object.entries(PRICE).map(([s, p]) => [s, p, 0, "2026-11-06", null, null, null]) } }),
  apiGet: vi.fn((url: string) => {
    if (url.startsWith("/api/sectors/membership")) return Promise.resolve({ groups: Object.fromEntries(Object.entries(GROUP).map(([s, slug]) => [s, { slug, name: slug }])) });
    if (url.startsWith("/api/search/quotes")) return Promise.resolve({ fields: [], amcLogos: {}, level: "gold", builtAt: 0, rows: Object.entries(PRICE).map(([s, p]) => [s, p, 0, "2026-11-06", null, null, null]) });
    if (url.startsWith("/api/sector-next")) return Promise.resolve({ rows: [{ state: "washout", typical_weeks: 2 }, { state: "thrust_cap", typical_weeks: 2 }] });
    const m = url.match(/^\/api\/sectors\/([a-z-]+)/);
    if (m) return Promise.resolve({ slug: m[1], stocks: Object.entries(GROUP).filter(([, g]) => g === m[1]).map(([s]) => ({ symbol: s, peer_label: PEER[s] ?? null })) });
    if (url.startsWith("/api/alerts")) return Promise.resolve({ alerts: [], limit: 30 });
    return new Promise(() => {});
  }) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "gold", upgrade: vi.fn(), has: () => true }), TIER: { basic: { n: "Basic" }, silver: { n: "Silver" }, gold: { n: "Gold" } } }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { SectorPulsePage } from "./SectorPulse";

const SHARES = [{ id: "1", symbol: "FINA", qty: 10, price: 1 }, { id: "2", symbol: "FINB", qty: 4, price: 1 }, { id: "3", symbol: "PWRA", qty: 5, price: 1 }, { id: "4", symbol: "BNKA", qty: 2, price: 1 }];
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); st.holdings = SHARES; st.prefs = { sectorAlerts: [], viewsSeen: [] }; st.set.mockClear(); });
afterEach(cleanup);
const at = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/sectors?show=industries"]}><SectorPulsePage /></MemoryRouter></QueryClientProvider>);
const bar = () => screen.getByRole("navigation", { name: "Steps on this page" });

describe("task #448 part 2: Today", () => {
  it("For you this week: which of the member's industries changed, the value line with the label's meaning, the changed rows with their peer-labelled shares", async () => {
    at();
    const fy = await screen.findByTestId("for-you");
    await waitFor(() => expect(fy.textContent).toContain("of your portfolio is in"));
    expect(within(fy).getByRole("heading", { name: "For you this week" })).toBeTruthy();
    expect(fy.textContent).toContain("Your 4 shares, in 3 industries");
    expect(fy.textContent).toContain("2 of your 3 industries changed state this week. 1 stayed where it was.");
    // value: Finance 1,200 + Power 100 bounce after a crash (1,300 of 2,100 = 62%), Banks 800 sold off; a week ago all three were sold off
    expect(fy.textContent).toContain("62% of your portfolio is in industries bouncing back after a crash, against 0% a week ago.");
    expect(fy.textContent).toContain("Bouncing back after a crash means the same broad bounce, but after a deep fall in which almost every stock in the industry hit a new low.");
    const rows = [...fy.querySelectorAll("tbody tr")];
    expect(rows.map((r) => r.querySelector(".sp-ind")!.textContent)).toEqual(["Finance", "Power"]);           // largest value first
    expect(rows[0].textContent).toContain("was Sold off");
    await waitFor(() => expect(rows[0].querySelector(".sx-pl-lead")?.textContent).toBe("FINA"));
    expect([...rows[0].querySelectorAll(".sx-pl")].map((p) => p.textContent)).toEqual(["FINA", "FINB"]);   // Leader first, then Laggard
    expect(rows[0].lastElementChild!.textContent).toBe("57%");                                                 // 1,200 of 2,100
    fireEvent.click(within(fy).getByRole("button", { name: "See all your industries →" }));
    expect(within(bar()).getByRole("button", { name: /^2 Your industries/ }).getAttribute("aria-current")).toBe("step");
  });
  it("one alert for all your industries: two kinds, saved as 'mine', the same setting on Your industries", async () => {
    at();
    const fy = await screen.findByTestId("for-you");
    fireEvent.click(within(fy).getByRole("button", { name: /Get an alert when your industries change/ }));
    const d = screen.getByRole("dialog", { name: "One alert for all 3 of your industries" });
    expect(within(d).getAllByRole("checkbox").map((c) => c.parentElement!.textContent)).toEqual(["When one changes state on Sector Pulse", "When one changes box on Sector Rotation"]);
    expect(d.textContent).toContain("Sent after the Friday update. Industries of shares you add later are covered too.");
    fireEvent.click(within(d).getByRole("button", { name: "Turn on" }));
    expect(st.set).toHaveBeenCalledWith({ sectorAlerts: ["state:industries:mine", "box:industries:mine"] });
    cleanup(); at();
    expect(await screen.findByRole("button", { name: /Alert on for your industries ✓/ })).toBeTruthy();
  });
  it("the headline box carries fix 2 (the market is up while most groups are sold off), and the first-visit line closes for good", async () => {
    at();
    const box = document.querySelector(".sx-hlbox")!;
    expect(box.textContent).toMatch(/Yet the market is up: the Nifty 50 is just 50 large companies, 4\.6% above their 200-day average\. Across all [\d,]+ stocks, only \d+ in 100 are rising\./);
    const nh = screen.getByTestId("new-here");
    expect(nh.textContent).toContain("Sector Pulse covers the last few weeks; Sector Rotation covers 6 months. So an industry can read differently on each.");
    expect(within(nh).getByRole("link", { name: "Sector Rotation" }).getAttribute("href")).toBe("/sectors/rotation?show=industries");
    fireEvent.click(within(nh).getByRole("button", { name: "What the labels mean" }));
    expect(screen.getByRole("dialog", { name: "What the labels mean" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(within(nh).getByRole("button", { name: "Close: New here?" }));
    expect(screen.queryByTestId("new-here")).toBeNull();
    cleanup(); at();
    expect(screen.queryByTestId("new-here")).toBeNull();
  });
  it("the step bar: Today and Your industries carry the 'new since your last visit' dot until opened; the seen steps are kept with the member's settings", async () => {
    at();
    await waitFor(() => expect(st.set).toHaveBeenCalled());
    expect(st.prefs.viewsSeen).toContain("sp:i-261106-today");                                 // Today was opened on load
    const yours = within(bar()).getByRole("button", { name: /^2 Your industries/ });
    await waitFor(() => expect(yours.getAttribute("aria-label")).toBe("2 Your industries, new since your last visit"));   // Finance and Power changed state
    expect(document.body.textContent).toContain("New since your last visit");
    fireEvent.click(yours);
    await waitFor(() => expect(st.prefs.viewsSeen).toContain("sp:i-261106-yours"));
  });
});

describe("task #448 part 2: the short Your industries view", () => {
  const open = async () => { at(); fireEvent.click(within(bar()).getByRole("button", { name: /^2 Your industries/ })); return (await screen.findByText(/hold 4 of your 4 shares|industries hold your 4 shares/)).closest("section")!; };
  it("the shares line, Count by (Value by default) with its lead and stacked bar, the peer line, and one card per state with time in the state", async () => {
    const sec = await open();
    expect(sec.textContent).toContain("3 industries hold your 4 shares.");
    await waitFor(() => expect(sec.textContent).toContain("62% of your portfolio value is in industries bouncing back after a crash."));
    expect(sec.textContent).toContain("The rest: 38% sold off.");
    const cb = within(sec).getByRole("group", { name: "Count by" });
    expect(within(cb).getByRole("button", { name: "Value" }).getAttribute("aria-pressed")).toBe("true");
    expect(sec.querySelector(".sx-vbar")!.getAttribute("aria-label")).toBe("Bouncing back after a crash 62%, Sold off 38%");
    await waitFor(() => expect(sec.querySelector(".sx-peerline")!.textContent).toContain("1 Leader"));
    expect(sec.querySelector(".sx-peerline")!.textContent).toMatch(/1 Leader.*1 In line.*1 Laggard.*1 No label/);   // one Leader, not "1 Leaders"
    const cards = [...sec.querySelectorAll(".sx-yr-card")];
    expect(cards.map((c) => c.querySelector(".sx-yr-ch")!.textContent)).toEqual([
      "Bouncing back after a crash2 industries · 3 of your shares · 62% of your portfolio", "Sold off1 industry · 1 of your shares · 38% of your portfolio"]);
    expect(cards[0].textContent).toMatch(/1 week in this state; usually about 2 weeks/);
    fireEvent.click(within(cb).getByRole("button", { name: "Number of shares" }));
    expect(sec.textContent).toContain("2 of your 3 industries are bouncing back after a crash. 1 is sold off.");
    fireEvent.click(within(sec).getByRole("button", { name: /^Sold off/ }));                        // one state at a time
    expect([...sec.querySelectorAll(".sx-yr-card")]).toHaveLength(1);
    fireEvent.click(within(sec).getByRole("button", { name: "See every column, as a table ▾" }));
    expect(sec.querySelector("table.sp-yours")).toBeTruthy();
    expect(within(sec).getByRole("button", { name: "Back to the short view ▴" })).toBeTruthy();
    // the end of the quick check
    expect(screen.getByRole("button", { name: "Go deeper: 3 All groups →" })).toBeTruthy();
  });
});
