// @vitest-environment jsdom
// The Results calendar as the final pages pack draws it (docs/design/finlit-final-pages/10): the view switch, the six KPI tiles, the calendar with declared and due
// counts, one day's results with the verdict filter and cards, and the week ahead with each company's industry so far.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dayCards, kpiTiles, soFar, weekCards, type VRow } from "../lib/resultsPack";

const st = vi.hoisted(() => ({ feed: [] as unknown[], locked: false }));
const row = (symbol: string, o: Record<string, unknown> = {}) => ({ symbol, name: `${symbol} Ltd`, date: "2026-11-07", sector: "Healthcare", industry: "Pharmaceuticals & Biotechnology", cap: "Large", marketCap: 50000, status: "declared", hasNumbers: true,
  revenue: 3676, revenueYoY: 35.4, revenueQoQ: 5, netProfit: 1127, profitYoY: 63.6, profitQoQ: 4, npm: 30.7, npmChange: 3, loss: false, verdict: "Strong", checks: { rev: "up", profit: "up", margin: "up" }, ...o });
const totals = { companies: 4682, declared: 3040, due: 1642, awaiting: 0, withNumbers: 2622, flagged: 0, medianRevenueYoY: 18.4, medianProfitYoY: 15.4, profitUpShare: 62, marginUpShare: 47, nRevenue: 2349, nProfit: 1934, nMargin: 2000, beatShare: 32, verdicts: null };
vi.mock("../lib/feed", async (orig) => ({ ...(await orig<typeof import("../lib/feed")>()), useFeed: () => ({ data: st.feed, isLoading: false, isError: false }), useResultsStatus: () => ({ data: undefined }) }));
vi.mock("../lib/jobsStatus", () => ({ useJobsStatus: () => ({ data: undefined }), resultsDelayedNote: () => null }));
vi.mock("../lib/watchlist", () => ({ useWatchlist: () => ({ lists: [] }) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "basic", upgrade: vi.fn(), has: () => false }), TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
vi.mock("../lib/qresults", async (orig) => ({ ...(await orig<typeof import("../lib/qresults")>()), todayIST: () => "2026-11-09",
  useQuarterResults: (p: { date?: string; status?: string; scope?: string }) => ({ data: p.scope ? { rows: [], total: 0 } : p.status === "due"
    ? { today: "2026-11-09", total: 1648, rows: [row("KALYANKJIL", { date: "2026-11-10", status: "due", hasNumbers: false, industry: "Consumer Durables", verdict: null, marketCap: 60932 })], days: [{ date: "2026-11-12", n: 428 }, { date: "2026-11-13", n: 604 }, { date: "2026-11-14", n: 445 }] }
    : p.date ? { today: "2026-11-09", total: 2, locked: st.locked, summary: { ...totals, verdicts: { Strong: 1, Good: 0, "In line": 0, Weak: 0, Poor: 0, Loss: 1 } }, rows: [row("DIVISLAB"), row("TATACHEM", { verdict: "Loss", loss: true, netProfit: -10, profitYoY: null, checks: { rev: "down", profit: "loss", margin: "loss" }, marketCap: 20000 })] }
    : { today: "2026-11-09", quarter: { key: "2026-09", label: "Jul to Sep 2026", fiscal: "Q2 FY27", periodEnd: "2026-09-30", from: "", to: "" }, totals, locked: false, industries: [{ name: "Consumer Durables", companies: 148, declared: 103, medianProfitYoY: 25.4 }] } }) }));
import { ResultsPage } from "./Results";

afterEach(cleanup);
const open = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ResultsPage /></MemoryRouter></QueryClientProvider>);

describe("Results calendar (pack 10)", () => {
  it("has the view switch, the six tiles, the calendar, the day and the week ahead", () => {
    st.feed = [{ id: 1, symbol: "DIVISLAB", company: "Divi's", date: "2026-11-07", title: "Results", category: "Result" }, { id: 2, symbol: "KALYANKJIL", company: "Kalyan", date: "2026-11-10", title: "Results", category: "Result" }];
    open();
    expect(within(screen.getByRole("group", { name: "View" })).getByRole("link", { name: "Calendar" }).getAttribute("aria-current")).toBe("page");
    expect(document.querySelectorAll(".rs-tiles .ip-tile").length).toBe(6);
    expect(document.body.textContent).toContain("3,040of 4,682 · 1,642 still due");
    expect(screen.getByRole("gridcell", { name: "Sat 7 Nov: 1 declared" })).toBeTruthy();
    expect(screen.getByRole("gridcell", { name: "Tue 10 Nov: 1 due" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sat 7 Nov · 2 companies declared" })).toBeTruthy();
    expect(screen.getByText("Strong").closest(".rs-vd")?.textContent).toBe("StrongRev ▲Profit ▲Margin ▲");
    fireEvent.click(screen.getByRole("button", { name: "Loss · 1" }));
    const dayRows = document.querySelectorAll("section[aria-labelledby='rs-day'] .rs-t tbody tr");
    expect([...dayRows].map((r) => r.querySelector("b")?.textContent)).toEqual(["TATACHEM"]);
    expect(screen.getByText("103 of 148 have reported · typical profit +25.4%")).toBeTruthy();
    expect((document.body.textContent ?? "").replace(document.querySelector(".sp-disclaimer")?.textContent ?? "", "")).not.toMatch(/\b(buy|sell|hold|best|target)\b/i);
  });
  it("for Basic the figures and verdicts are locked in words; the counts stay", () => {
    st.locked = true; open();
    expect(screen.getByText("Each company's figures and verdict are part of the Silver plan")).toBeTruthy();
    st.locked = false;
  });
});

describe("the words", () => {
  it("tiles, a day's cards and the week's cards", () => {
    expect(kpiTiles(totals as never).map((t) => t.v)).toEqual(["3,040", "+18.4%", "+15.4%", "62%", "47%", "32%"]);
    const rows = [row("DIVISLAB", { name: "Divi's Laboratories Ltd" }), row("TATASTEEL", { verdict: "Poor", cap: "Large", marketCap: 200000 }), row("A", { verdict: "Loss", cap: "Small", marketCap: 10 })] as unknown as VRow[];
    const c = dayCards(rows, { Strong: 14, Good: 3, "In line": 9, Weak: 6, Poor: 8, Loss: 9 }, 49, "2026-11-07", [{ date: "2026-11-12", n: 428 }, { date: "2026-11-13", n: 604 }]);
    expect(c[0]).toEqual({ kind: "good", title: "17 of 49 beat their industry", text: "Divi's Laboratories was the largest Strong result: revenue +35.4% and profit +63.6% from a year ago." });
    expect(c[1].title).toBe("17 were Poor or made a loss");
    expect(c[2]).toEqual({ kind: "insight", title: "Saturday is a light day", text: "Only 49 companies reported. The big reporting days this week are Thursday and Friday." });
    const w = weekCards(0, { held: 14, watched: 3 }, [{ date: "2026-11-12", n: 428 }, { date: "2026-11-13", n: 604 }, { date: "2026-11-14", n: 445 }], [{ symbol: "HAL", name: "Hindustan Aeronautics Ltd", date: "2026-11-12" }]);
    expect(w[0]).toEqual({ kind: "insight", title: "Your stocks have all reported", text: "All 14 shares in your portfolio and the 3 you follow have already declared. Nothing of yours is due this week." });
    expect(w[1]).toEqual({ kind: "watch", title: "The heaviest days are Friday and Saturday", text: "428 companies on Thursday, 604 companies on Friday and 445 companies on Saturday, including HAL." });
    expect(soFar({ name: "Power", companies: 35, declared: 23, medianProfitYoY: 38.7 })).toBe("23 of 35 have reported · typical profit +38.7%");
  });
});
