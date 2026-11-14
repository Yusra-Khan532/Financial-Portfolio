// @vitest-environment jsdom
// MF portfolio (board 15 of the final pages pack): the tiles, the three views, Your funds, and the category card under Mix & overlap. The categories and the pie chart are for reading only (task #8): no tick boxes,
// no "Select All", nothing to click except the group tabs.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Holding, MfPortfolio } from "../lib/mfPortfolio";

const st = vi.hoisted(() => ({ data: null as unknown }));
const mutation = () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() });
vi.mock("../lib/mfPortfolio", async (orig) => ({
  ...(await orig<typeof import("../lib/mfPortfolio")>()),
  useMfSpread: () => ({ data: undefined, isPending: false, isError: false, error: null }),
  useMfPortfolio: () => ({ data: st.data, isPending: false, isError: false, error: null, refetch: () => {} }),
  useMfWrites: () => new Proxy({}, { get: () => mutation() }),
}));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "gold", upgrade: vi.fn(), has: () => true }), TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { MfPortfolioPage } from "./MfPortfolio";

const H = (id: string, name: string, category: string, categoryLabel: string, code: number): Holding => ({
  id, code, folio: "", units: 10, lots: [], name, amc: "A", plan: "Direct", option: "Growth", category, categoryLabel, active: true,
  nav: 10, navDate: "2026-10-29", navStale: false, navNote: null, invested: 80, investedWhy: null, current: 100, currentWhy: null, gain: 20, gainPct: 25, gainWhy: null, xirr: null, xirrWhy: null,
  xirrKind: "cagr", returns: { r1y: 5, r3y: null, r5y: null, asOf: null, why: null }, ter: 0.5, terDate: null, terWhy: null, aum: 100, aumAsOf: null, aumWhy: null, weight: 25, weightWhy: null,
  score: { locked: true, final: null, label: null, status: null, reason: null, runDate: null, parts: null, inherited: null },
});
const HOLDINGS = [
  H("1", "Alpha Large Cap Fund", "Equity Scheme - Large Cap Fund", "Large Cap", 1),
  H("2", "Beta Large Cap Fund", "Equity Scheme - Large Cap Fund", "Large Cap", 2),
  H("3", "Gamma Small Cap Fund", "Equity Scheme - Small Cap Fund", "Small Cap", 3),
  H("4", "Delta Corporate Bond Fund", "Debt Scheme - Corporate Bond Fund", "Corporate Bond", 4),
];
const DATA = {
  plan: "gold", scoreLocked: true, limit: 500, count: 4, dataDate: "2026-10-29", holdings: HOLDINGS,
  summary: { funds: 4, valued: 4, withCost: 4, gainFunds: 4, invested: 320, current: 400, gain: 80, gainPct: 25, navFrom: null, navTo: null, notes: [], xirr: null, xirrFunds: 0, xirrWhy: null, score: { locked: true, value: null, label: null, why: null } },
  allocation: { byCategory: [], byAmc: [] }, concentration: { level: null, text: "", top1Pct: null, top3Pct: null }, disclaimer: "", scoreDisclaimer: "",
} as unknown as MfPortfolio;

beforeEach(() => { st.data = DATA; vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(cleanup);
const card = () => document.querySelector("section.mp-cat") as HTMLElement;
const fundRows = () => [...document.querySelectorAll("table tbody tr")].map((r) => r.textContent || "");
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: () => new Promise(() => {}) }));
const show = (view = "mix") => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[`/mf-portfolio${view === "funds" ? "" : `?view=${view}`}`]}><MfPortfolioPage /></MemoryRouter></QueryClientProvider>);

describe("MF portfolio category card", () => {
  it("has no tick boxes and no Select All: the categories are read-only", () => {
    show();
    expect(card()).toBeTruthy();
    expect(card().querySelectorAll("input")).toHaveLength(0);
    expect(within(card()).queryByText(/Select All/i)).toBeNull();
    expect(card().textContent).not.toMatch(/ticked/i);
  });

  it("lists every category with its number of funds, and draws the pie chart", () => {
    show();
    const chips = [...card().querySelectorAll(".mp-cat-chip")].map((c) => (c.textContent || "").replace(/\s+/g, " ").trim());
    expect(chips).toEqual(["Corporate Bond1", "Large Cap2", "Small Cap1"]);
    expect(card().querySelector("svg")).toBeTruthy();
  });

  it("clicking a category does nothing, and Your funds always lists every fund", () => {
    show();
    fireEvent.click(card().querySelector(".mp-cat-chip") as HTMLElement);
    expect(card().querySelector(".mp-cat-chip")).toBeTruthy();
    cleanup(); show("funds");
    expect(fundRows()).toHaveLength(4);
  });

  it("the group tabs switch the categories and the pie chart", () => {
    show();
    fireEvent.click(within(card()).getByRole("tab", { name: "Debt" }));
    const chips = [...card().querySelectorAll(".mp-cat-chip")].map((c) => (c.textContent || "").replace(/\s+/g, " ").trim());
    expect(chips).toEqual(["Corporate Bond1"]);
    expect(screen.getByText(/Share of your debt funds by category/)).toBeTruthy();
  });

  it("the note under the pie chart no longer talks about ticking categories", () => {
    show();
    expect(screen.getByText(/Share of your funds by type/)).toBeTruthy();
  });
});

describe("MF portfolio as the pack draws it", () => {
  it("shows the five tiles, the three views and Your funds with the Gold plan words for a locked Health Score", () => {
    show("funds");
    expect([...document.querySelectorAll(".mfp-tile-k")].map((x) => x.firstChild?.textContent)).toEqual(["Funds", "Average health", "Highest overlap", "Top 10 stocks vs peers", "Risk level"]);
    expect(screen.getAllByRole("tab").map((t) => t.querySelector("b")?.textContent)).toEqual(["Your funds", "Mix & overlap", "Risk analytics"]);
    expect(screen.getByRole("heading", { name: "Your funds" })).toBeTruthy();
    expect(screen.getAllByText("Gold plan").length).toBeGreaterThan(1);
    document.querySelector(".mfp-disc")?.remove();   // the disclaimer itself says "not a recommendation to buy, sell or hold"
    const text = document.body.textContent || "";
    expect(text.match(/\b(buy|sell|hold|reduce|avoid|accumulate|best)\b/gi)).toBeNull();
  });
  it("the Returns & costs view keeps each fund's NAV, returns and costs", () => {
    show("funds");
    fireEvent.click(screen.getByRole("button", { name: "Returns & costs" }));
    expect(screen.getByRole("columnheader", { name: "Expense ratio" })).toBeTruthy();
    expect(fundRows()[0]).toContain("5.00%");
  });
});
