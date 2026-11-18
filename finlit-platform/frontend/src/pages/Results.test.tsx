// @vitest-environment jsdom
// The Results calendar as the final pages pack draws it (docs/design/finlit-final-pages/10): the view switch, the six KPI tiles, the calendar with declared and due
// counts, one day's results with the verdict filter and cards, and the week ahead with each company's industry so far.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dayCards, kpiTiles, soFar, weekCards, type VRow } from "../lib/resultsPack";

const st = vi.hoisted(() => ({ locked: false }));
const row = (symbol: string, o: Record<string, unknown> = {}) => ({ symbol, name: `${symbol} Ltd`, date: "2026-11-07", sector: "Healthcare", industry: "Pharmaceuticals & Biotechnology", cap: "Large", marketCap: 50000, status: "declared", hasNumbers: true,
  revenue: 3676, revenueYoY: 35.4, revenueQoQ: 5, netProfit: 1127, profitYoY: 63.6, profitQoQ: 4, npm: 30.7, npmChange: 3, loss: false, verdict: "Strong", checks: { rev: "up", profit: "up", margin: "up" }, ...o });
const totals = { companies: 4682, declared: 3040, due: 1642, awaiting: 0, withNumbers: 2622, flagged: 0, medianRevenueYoY: 18.4, medianProfitYoY: 15.4, profitUpShare: 62, marginUpShare: 47, nRevenue: 2349, nProfit: 1934, nMargin: 2000, beatShare: 32, verdicts: null };
vi.mock("../lib/feed", async (orig) => ({ ...(await orig<typeof import("../lib/feed")>()), useResultsStatus: () => ({ data: undefined }) }));
vi.mock("../lib/jobsStatus", () => ({ useJobsStatus: () => ({ data: undefined }), resultsDelayedNote: () => null }));
vi.mock("../lib/watchlist", () => ({ useWatchlist: () => ({ lists: [] }) }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: null, plan: "basic", ready: true }) }));
vi.mock("../lib/portfolio", () => ({ usePortfolio: () => ({ holdings: [] }) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "basic", upgrade: vi.fn(), has: () => false }), TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
// One source (task #193): the calendar's days and the day's list are the same rows. The mock gives 2 on Sat 7 Nov and 2 on Fri 6 Nov, as the lists do.
const CAL = [{ date: "2026-11-06", n: 2, names: ["SUNPHARMA", "CIPLA"], due: false, quarter: "2026-09" }, { date: "2026-11-07", n: 2, names: ["DIVISLAB", "TATACHEM"], due: false, quarter: "2026-09" },
  { date: "2026-11-10", n: 2, names: ["KALYANKJIL", "BLSPOLY"], due: true, quarter: "2026-09" }, { date: "2026-11-23", n: 1, names: ["Carver Roboweld Ltd"], due: true, quarter: "2026-09" }];
vi.mock("../lib/resultsCalendar", async (orig) => ({ ...(await orig<typeof import("../lib/resultsCalendar")>()),
  useResultsCalendar: (from: string, to: string) => ({ data: { today: "2026-11-09", from, to, days: CAL.filter((d) => d.date >= from && d.date <= to) }, isError: false }) }));
vi.mock("../lib/qresults", async (orig) => ({ ...(await orig<typeof import("../lib/qresults")>()), todayIST: () => "2026-11-09",
  useQuarterResults: (p: { date?: string; status?: string; scope?: string; cap?: string }) => ({ data: p.cap ? { totals: { ...totals, declared: 100, companies: 120 } } : p.status === "upcoming"
    ? { today: "2026-11-09", total: 2, locked: st.locked, rows: [row("KALYANKJIL", { date: "2026-11-10", status: "due", hasNumbers: false, industry: "Consumer Durables", verdict: null, marketCap: 60932 }),
        row("BLSPOLY", { date: "2026-11-10", status: "declared", hasNumbers: true, industry: "Macro sector: Industrials", verdict: null, marketCap: 1717 })], days: [{ date: "2026-11-10", n: 2 }] }
    : p.date ? { today: "2026-11-09", total: 2, locked: st.locked, summary: { ...totals, withNumbers: 2, verdicts: { Strong: 1, Good: 0, "In line": 0, Weak: 0, Poor: 0, Loss: 1 } }, rows: [row("DIVISLAB", { date: p.date }), row("TATACHEM", { date: p.date, verdict: "Loss", loss: true, netProfit: -10, profitYoY: null, checks: { rev: "down", profit: "loss", margin: "loss" }, marketCap: 20000 })] }
    : { today: "2026-11-09", quarter: { key: "2026-09", label: "Jul to Sep 2026", fiscal: "Q2 FY27", periodEnd: "2026-09-30", from: "2026-10-01", to: "2026-12-31" }, totals, locked: st.locked,
        days: [{ date: "2026-11-07", n: 2 }, { date: "2026-11-06", n: 2 }, { date: "2026-10-20", n: 3036 }], industries: [{ name: "Consumer Durables", companies: 148, declared: 103, medianProfitYoY: 25.4 }] } }) }));
import { ResultsPage } from "./Results";

afterEach(cleanup);
const open = (at = "/results") => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[at]}><ResultsPage /></MemoryRouter></QueryClientProvider>);

describe("Results calendar (pack 10, 15 Nov changes: task #193)", () => {
  it("has the view switch, four calendar tiles with dropdowns (the quarter tiles are gone), the one-line quarter link, the calendar, the day and the week ahead", () => {
    open();
    expect(within(screen.getByRole("navigation", { name: /Choose a view/ })).getByRole("link", { name: /^Calendar/ }).getAttribute("aria-current")).toBe("page");
    expect(document.querySelectorAll(".rsc-tiles .dtl").length).toBe(4);
    expect(document.querySelectorAll(".ip-tile").length).toBe(0);
    expect([...document.querySelectorAll(".rsc-tiles .dtl-k")].map((x) => x.textContent)).toEqual(["Declared so far", "Due in the next 7 days", "Your companies", "Last full day · SAT 7 NOV"]);
    expect(screen.getByTestId("tile-declared").textContent).toContain("3,040of 4,682");
    expect(screen.getByTestId("tile-declared").textContent).toContain("64.9% in · 1,642 still due");
    expect(screen.getByTestId("tile-due").textContent).toContain("2companies");
    expect(screen.getByTestId("tile-due").textContent).toContain("Tue 10 Nov · 2");
    fireEvent.click(within(screen.getByTestId("tile-due")).getByRole("button", { name: /Who and when/ }));
    expect(screen.getByTestId("tile-due").textContent).toContain("KALYANKJIL, BLSPOLY");
    expect(screen.getByTestId("tile-due").textContent).toContain("After that: Mon 23 Nov · Carver Roboweld Ltd.");
    expect(document.querySelector(".rsc-qline")?.textContent).toBe("Quarter so far, Q2 FY27: typical revenue +18.4% · typical profit +15.4% · 32% beat their industry. See the quarter on Latest results →");
    expect(screen.getByRole("gridcell", { name: "Sat 7 Nov: 2 declared" })).toBeTruthy();
    expect(screen.getByRole("gridcell", { name: "Tue 10 Nov: 2 due" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sat 7 Nov · 2 companies declared" })).toBeTruthy();   // calendar and list counts match
    expect(within(document.getElementById("rsc-day")!).getByText("Strong").closest(".rs-vd")?.textContent).toBe("StrongRev ▲Profit ▲Margin ▲");
    fireEvent.click(screen.getByRole("button", { name: "Loss · 1" }));
    expect([...document.querySelectorAll("section[aria-labelledby='rs-day'] .rs-t tbody tr")].map((r) => r.querySelector("b")?.textContent)).toEqual(["TATACHEM"]);
    expect((document.body.textContent ?? "").replace(document.querySelector(".sp-disclaimer")?.textContent ?? "", "")).not.toMatch(/\b(buy|sell|hold|best|target)\b/i);
    expect(document.querySelector(".sp-disclaimer")?.textContent).toContain("Not a recommendation");
  });

  it("the declared table has its own day picker: ← select → Today and Calendar ↑; the day is in the link and the calendar follows it", () => {
    open("/results?day=2026-11-06");
    expect(screen.getByRole("heading", { name: "Fri 6 Nov · 2 companies declared" })).toBeTruthy();
    expect(screen.getByRole("gridcell", { name: "Fri 6 Nov: 2 declared" }).className).toContain(" on");
    const sel = within(screen.getByRole("group", { name: "Pick a day" })).getByRole("combobox") as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual(["Sat 7 Nov · 2 declared", "Fri 6 Nov · 2 declared"]);
    fireEvent.click(screen.getByRole("button", { name: "Next day with results" }));
    expect(screen.getByRole("heading", { name: "Sat 7 Nov · 2 companies declared" })).toBeTruthy();
    expect(screen.getByRole("gridcell", { name: "Sat 7 Nov: 2 declared" }).className).toContain(" on");
    fireEvent.change(sel, { target: { value: "2026-11-06" } });
    expect(screen.getByRole("heading", { name: "Fri 6 Nov · 2 companies declared" })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Pick a day" })).getByRole("button", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Calendar ↑" }).getAttribute("href")).toBe("#rsc-cal");
  });

  it("Coming up lists every company due (figures in or not), splits Industry so far and Typical profit growth, and says Industry not set", () => {
    open();
    const week = document.getElementById("rs-week")!.closest("section")!;
    expect(within(week).getByRole("heading", { name: /Coming up this week · 2 companies/ })).toBeTruthy();
    expect([...week.querySelectorAll("thead th")].map((t) => t.textContent?.replace(/i$/, "").replace(/[↕▲▼]/g, "").replace(/i$/, ""))).toEqual(["Day", "Company", "Industry", "Size", "Market value", "Industry so far", "Typical profit growth"]);
    expect(within(week).getByText("BLSPOLY")).toBeTruthy();                                         // its figures are in, its board date is still to come
    expect(within(week).getByText("Figures already filed")).toBeTruthy();
    expect(within(week).getByText("103 of 148 reported")).toBeTruthy();
    expect(within(week).getByText("+25.4%").className).toBe("rsc-chip up");
    expect(within(week).getByText("Industry not set")).toBeTruthy();
    expect(within(week).getByText("Macro sector: Industrials")).toBeTruthy();
    expect(within(week).getByText("Too few results to compare yet")).toBeTruthy();
    expect(week.textContent).not.toContain("(broad group)");
  });

  it("every callout shows its kind and headline; a round chevron opens the text; Open all / Close all opens every card", () => {
    open();
    const day = document.getElementById("rsc-day")!;
    const rows = within(day).getAllByRole("button", { expanded: false }).filter((b) => b.classList.contains("dsh-ic-row"));
    expect(rows.length).toBe(2);
    expect(day.querySelector(".dsh-ic-body")?.hasAttribute("hidden")).toBe(true);
    fireEvent.click(rows[0]);
    expect(rows[0].getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(within(day).getByRole("button", { name: "Open all" }));
    expect([...day.querySelectorAll(".dsh-ic-row")].every((b) => b.getAttribute("aria-expanded") === "true")).toBe(true);
    expect(within(day).getByRole("button", { name: "Close all" })).toBeTruthy();
  });

  it("for Basic the figures and verdicts are locked in words; the counts stay", () => {
    st.locked = true; open();
    expect(screen.getByText("Each company's figures and verdict are part of the Silver plan")).toBeTruthy();
    expect(document.querySelector(".rsc-qline")?.textContent).toContain("3,040 of 4,682 companies declared · the growth figures open with Silver");
    st.locked = false;
  });
});

describe("the words", () => {
  it("tiles, a day's cards and the week's cards", () => {
    expect(kpiTiles(totals as never).map((t) => t.v)).toEqual(["3,040", "+18.4%", "+15.4%", "62%", "47%", "32%"]);
    expect(kpiTiles(totals as never, true).map((t) => `${t.v} | ${t.sub}`)).toEqual(["3,040 | of 4,682 · 1,642 still due", ...Array(5).fill("Silver plan | Opens with Silver")]);
    const rows = [row("DIVISLAB", { name: "Divi's Laboratories Ltd" }), row("TATASTEEL", { verdict: "Poor", cap: "Large", marketCap: 200000 }), row("A", { verdict: "Loss", cap: "Small", marketCap: 10 })] as unknown as VRow[];
    const c = dayCards(rows, { Strong: 14, Good: 3, "In line": 9, Weak: 6, Poor: 8, Loss: 9 }, 49, "2026-11-07", [{ date: "2026-11-12", n: 428 }, { date: "2026-11-13", n: 604 }]);
    expect(c[0]).toEqual({ kind: "good", title: "17 of 49 beat their industry", text: "Divi's Laboratories was the largest Strong result: revenue +35.4% and profit +63.6% from a year ago." });
    expect(c[1].title).toBe("17 were Poor or made a loss");
    expect(c[2]).toEqual({ kind: "insight", title: "Saturday is a light day", text: "Only 49 companies reported. The big reporting days this week are Thursday and Friday." });
    // task #193 bug 3: "Only 1 companies reported, most of them small"
    const one = dayCards([row("SMT", { cap: "Small", verdict: "Good" })] as unknown as VRow[], { Strong: 0, Good: 1, "In line": 0, Weak: 0, Poor: 0, Loss: 0 }, 1, "2026-11-08", [{ date: "2026-11-12", n: 428 }]);
    expect(one[1]).toEqual({ kind: "insight", title: "Sunday is a light day", text: "Only 1 company reported, a small one. The big reporting days this week are Thursday." });
    const w = weekCards(0, { held: 14, watched: 3 }, [{ date: "2026-11-12", n: 428 }, { date: "2026-11-13", n: 604 }, { date: "2026-11-14", n: 445 }], [{ symbol: "HAL", name: "Hindustan Aeronautics Ltd", date: "2026-11-12" }]);
    expect(w[0]).toEqual({ kind: "insight", title: "Your stocks have all reported", text: "All 14 shares in your portfolio and the 3 you follow have already declared. Nothing of yours is due this week." });
    expect(w[1]).toEqual({ kind: "watch", title: "The heaviest days are Friday and Saturday", text: "428 companies on Thursday, 604 companies on Friday and 445 companies on Saturday, including HAL." });
    expect(soFar(undefined)).toBe("No industry figures to compare");
    expect(soFar({ name: "Power", companies: 35, declared: 23, medianProfitYoY: 38.7 })).toBe("23 of 35 have reported · typical profit +38.7%");
  });
});
