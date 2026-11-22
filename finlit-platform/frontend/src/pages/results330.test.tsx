// @vitest-environment jsdom
// Task #330 (developer file 28): one Results page. The view is in the address and remembered (rule 3), the old Latest results address redirects with its
// query (rule 2), a switched-away view keeps its state (rule 5), and the view bar names what the open view shows.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/feed", async (orig) => ({ ...(await orig<typeof import("../lib/feed")>()), useResultsStatus: () => ({ data: undefined }) }));
vi.mock("../lib/jobsStatus", () => ({ useJobsStatus: () => ({ data: undefined }), resultsDelayedNote: () => null, useResultsDelayedNote: () => null }));
vi.mock("../lib/watchlist", () => ({ useWatchlist: () => ({ lists: [] }), watch: { add: vi.fn() } }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: null, plan: "basic", ready: true }), useAuthMaybe: () => ({ user: null, plan: "basic", ready: true }) }));
vi.mock("../lib/portfolio", () => ({ usePortfolio: () => ({ holdings: [] }) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "basic", upgrade: vi.fn(), has: () => false }), useThemeKey: () => "light", TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
vi.mock("../lib/resultsCalendar", async (orig) => ({ ...(await orig<typeof import("../lib/resultsCalendar")>()), useResultsCalendar: (from: string, to: string) => ({ data: { today: "2026-11-09", from, to, days: [] }, isError: false }) }));
const totals = { companies: 4682, declared: 3040, due: 1642, awaiting: 0, withNumbers: 2622, flagged: 0, medianRevenueYoY: 18.4, medianProfitYoY: 15.4, profitUpShare: 62, marginUpShare: 47, nRevenue: 2349, nProfit: 1934, nMargin: 2000, beatShare: 32, verdicts: null };
vi.mock("../lib/qresults", async (orig) => ({ ...(await orig<typeof import("../lib/qresults")>()), todayIST: () => "2026-11-09",
  useQuarterResults: () => ({ data: { today: "2026-11-09", quarter: { key: "2026-09", label: "Jul to Sep 2026", fiscal: "Q2 FY27", periodEnd: "2026-09-30", from: "2026-10-01", to: "2026-12-31" }, totals, summary: totals, locked: true,
    days: [], rows: [], total: 0, facets: { sectors: [], indices: [] }, quarters: [{ key: "2026-09", label: "Jul to Sep 2026", fiscal: "Q2 FY27", total: 4682, declared: 3040, due: 1642 }], industries: [{ name: "Banks", companies: 40, declared: 30, medianProfitYoY: 10 }] }, isError: false }) }));
import { ResultsPage, openView } from "./Results";
import { QuarterResultsPage } from "./QuarterResults";

const Where = () => { const l = useLocation(); return <output data-testid="at">{l.pathname + l.search}</output>; };
const open = (at = "/results") => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[at]}><Routes>
  <Route path="/results" element={<><ResultsPage /><Where /></>} /><Route path="/results/quarter" element={<QuarterResultsPage />} /></Routes></MemoryRouter></QueryClientProvider>);
afterEach(() => { cleanup(); localStorage.clear(); });

describe("one Results page (task #330)", () => {
  it("opens the view in the address, else the member's last view, else Calendar", () => {
    expect(openView("industries", "companies")).toBe("industries");
    expect(openView(null, "companies")).toBe("companies");
    expect(openView("nonsense", null)).toBe("calendar");
    expect(openView(null, null)).toBe("calendar");
  });
  it("switching views writes the address, remembers the choice and keeps the visited view mounted (hidden)", () => {
    open();
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("Calendar");
    fireEvent.click(screen.getByRole("tab", { name: /Industries/ }));
    expect(screen.getByTestId("at").textContent).toBe("/results?view=industries");
    expect(localStorage.getItem("finlit-results-view")).toBe("industries");
    expect(document.getElementById("mg-pane-calendar")!.hidden).toBe(true);          // kept, so its day and month survive a switch back
    expect(document.getElementById("mg-pane-industries")!.hidden).toBe(false);
    expect(document.getElementById("mg-pane-companies")).toBeNull();                    // a view loads its data only once opened
    expect(document.querySelector(".mg-tabs-d")!.textContent).toBe("Showing: How each industry did this quarter");
    cleanup();
    open();                                                                             // no view in the address: the last one
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("Industries");
  });
  it("the counts on the view bar, and no view switch of the old pages", () => {
    open("/results?view=companies");
    expect([...document.querySelectorAll(".mg-tabs button")].map((b) => b.textContent)).toEqual(["1Calendar0 due this week", "2Industries1", "3Companies4,682"]);
    expect(document.querySelector(".xvr")).toBeNull();
    expect(document.querySelector(".rs-tabs")).toBeNull();
  });
  it("/results/quarter redirects to the Companies view, and ?view=industries to Industries, keeping every other parameter", () => {
    open("/results/quarter?industry=Banks&quarter=2026-09");
    expect(screen.getByTestId("at").textContent).toBe("/results?industry=Banks&quarter=2026-09&view=companies");
    cleanup();
    open("/results/quarter?view=industries&quarter=2026-06");
    expect(screen.getByTestId("at").textContent).toBe("/results?view=industries&quarter=2026-06");
  });
});
