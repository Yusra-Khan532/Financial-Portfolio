// @vitest-environment jsdom
// Task #316 (dashboard file 22): the cards that read data. Global markets on the page shows one region (point 10) and everything in its expanded view;
// Latest quarter results is one table with revenue and net profit, YoY and QoQ, and a company held under its BSE code shows its name (point 13).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normaliseDashUi, prefs } from "../../lib/prefs";

const GM = {
  asOfIst: "16:46", summary: { open: 2, markets: 7, indices: 4, down: 4, up: 0 }, disclaimer: "Information only, not investment advice.", sources: "FRED (St. Louis Fed)",
  home: { city: "Mumbai", lat: 19.08, lon: 72.88, open: true },
  rows: [
    { key: "sp500", label: "S&P 500", group: "US", unit: "pts", source: "FRED", last: 7175.83, asOf: "2026-11-19", d1: -2.02, w1: -5.49, m1: -6.96, line: [["2026-10-20", 7700], ["2026-11-19", 7175.83]], why: null, place: { city: "New York", lat: 40.71, lon: -74.01, open: false } },
    { key: "nikkei", label: "Nikkei 225", group: "Asia", unit: "pts", source: "FRED", last: 56436.65, asOf: "2026-11-20", d1: -5.06, w1: -7.7, m1: -12.67, line: [["2026-10-21", 64600], ["2026-11-20", 56436.65]], why: null, place: { city: "Tokyo", lat: 35.68, lon: 139.69, open: false } },
    { key: "hangseng", label: "Hang Seng", group: "Asia", unit: "pts", source: "FRED", last: 24000, asOf: "2026-11-20", d1: -1.1, w1: -2, m1: -3, line: [["2026-10-21", 25000], ["2026-11-20", 24000]], why: null, place: { city: "Hong Kong", lat: 22.3, lon: 114.2, open: false } },
    { key: "brent", label: "Brent crude", group: "Commodities", unit: "US$/bbl", source: "FRED", last: 92.94, asOf: "2026-11-17", d1: 0.04, w1: 3.08, m1: -22.12, line: [], why: null, place: null },
  ],
};
const PL = (rev: number[], np: number[]) => ({ quarterly: { pl: { periods: ["Sep 2025", "Dec 2025", "Mar 2026", "Jun 2026", "Sep 2026"], periodEnds: [], rows: { revenue: rev, net_profit: np } } } });
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), apiGet: async (u: string) => {
  if (u.startsWith("/api/global-markets")) return GM;
  if (u.includes("/526433/")) return PL([100, 110, 120, 130, 150], [10, 11, 12, 13, 12]);
  if (u.includes("/TCS/")) return PL([200, 205, 210, 215, 220], [40, 41, 42, 43, 44]);
  throw Object.assign(new Error("no"), { status: 404 });
} }));
import { XCtx } from "./dx";
import { GlobalMarkets } from "./GlobalMarkets";
import { Results } from "./Legacy";

beforeEach(() => { localStorage.clear(); prefs.set({ dashUi: normaliseDashUi(null) }); });
afterEach(cleanup);
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("Global markets on the page: one region at a time (point 10)", () => {
  it("shows the saved region's table only, chosen with the five region buttons; no globe, no 1-month column", async () => {
    render(<QueryClientProvider client={qc()}><MemoryRouter><GlobalMarkets /></MemoryRouter></QueryClientProvider>);
    await screen.findByText("S&P 500");
    expect(screen.queryByText("Nikkei 225")).toBeNull();
    expect(document.querySelector(".gm-world")).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "1 month" })).toBeNull();
    const tiles = within(screen.getByRole("group", { name: "Region to show" })).getAllByRole("button");
    expect(tiles.length).toBe(5);
    fireEvent.click(tiles.find((t) => t.dataset.group === "Asia")!);
    expect(screen.getByText("Nikkei 225")).toBeTruthy(); expect(screen.getByText("Hang Seng")).toBeTruthy();
    expect(screen.queryByText("S&P 500")).toBeNull();
    expect(prefs.get().dashUi.region).toBe("asia");
    expect(screen.getByRole("button", { name: "Region: Asia" })).toBeTruthy();   // the phone's dropdown reads the same choice
  });
  it("the expanded view has the live card in full: introduction, globe, every region, the 1-month lines and the sources", async () => {
    render(<QueryClientProvider client={qc()}><MemoryRouter><XCtx.Provider value={true}><GlobalMarkets /></XCtx.Provider></MemoryRouter></QueryClientProvider>);
    await screen.findByText("S&P 500");
    expect(screen.getByRole("rowheader", { name: /Nikkei 225/ })).toBeTruthy(); expect(screen.getByRole("rowheader", { name: /Brent crude/ })).toBeTruthy();
    expect(document.querySelector(".gm-world svg")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "1 month" })).toBeTruthy();
    expect(screen.getByText(/overnight and intraday context/)).toBeTruthy();
    expect(screen.getByText(/Sources: FRED/)).toBeTruthy();
  });
});

describe("Latest quarter results: one table (point 13)", () => {
  it("one row per company with revenue and net profit, each with YoY and QoQ; a BSE code shows the company's name", async () => {
    render(<QueryClientProvider client={qc()}><MemoryRouter><Results symbols={["TCS", "526433"]} names={new Map([["526433", "Asm Technologies"], ["TCS", "Tata Consultancy"]])} /></MemoryRouter></QueryClientProvider>);
    await screen.findByText("Asm Technologies");
    const t = screen.getByRole("table");
    expect(within(t).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Company", "RevenueYoY", "YoY", "QoQ", "Net profitYoY", "YoY", "QoQ"]);
    expect(within(t).queryByText("526433")).toBeNull();
    const asm = within(t).getByText("Asm Technologies").closest("tr")!;
    expect(asm.textContent).toContain("+50.0%");   // revenue 150 against 100 a year earlier
    expect(asm.textContent).toContain("+15.4%");   // against 130 the quarter before
    expect(document.querySelector(".rcs")).toBeNull();   // no chart cards
  });
});
