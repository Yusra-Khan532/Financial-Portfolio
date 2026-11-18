// @vitest-environment jsdom
// MF portfolio, rebuilt from the 15 Nov pack (task #183 part 2): the page as a whole. The parts are tested in mf/pack/mf*183.test.tsx and lib/mfTop.test.ts.
import { cleanup, render, screen } from "@testing-library/react";
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
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: { id: 1 } }) }));
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
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: () => new Promise(() => {}) }));
const show = (view = "funds") => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[`/mf-portfolio${view === "funds" ? "" : `?view=${view}`}`]}><MfPortfolioPage /></MemoryRouter></QueryClientProvider>);

describe("MF portfolio page (task #183 part 2)", () => {
  it("opens with the list box and one tile per tab, then the tabs, the sections bar and Key figures", () => {
    show();
    expect(document.querySelector(".mfp-listbox")!.textContent).toMatch(/Your MF list.*4 funds.*Every fund counts the same until you add units|Each fund counts by the value/);
    expect([...document.querySelectorAll(".eqt-tile .eqt-k")].map((t) => t.textContent)).toEqual(["Your fundsi", "Mix & overlapi", "Risk analyticsi"]);
    expect(screen.getAllByRole("tab").map((t) => t.querySelector("b")?.textContent)).toEqual(["Your funds", "Mix & overlap", "Risk analytics"]);
    expect(screen.getByRole("navigation", { name: "Sections on this tab" }).textContent).toMatch(/All sections.*1Your funds/);
    expect(screen.queryByRole("heading", { name: "Key figures" })).toBeNull();      // no card has anything to say for this test list (no scores, theme or liquid fund): the row is left out
  });
  it("lists the funds in the new table, with Add units and Clear portfolio and no Remove all or download", () => {
    show();
    expect(screen.getByRole("heading", { name: /^Your funds/ })).toBeTruthy();
    expect([...document.querySelectorAll(".mff-t tbody th a")].map((a) => a.textContent)).toEqual(["Alpha Large Cap Fund", "Beta Large Cap Fund", "Delta Corporate Bond Fund", "Gamma Small Cap Fund"]);
    expect(screen.getByRole("button", { name: "Add units" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear portfolio" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Remove all|Export CSV/);
  });
  it("says each fund is read by its ISIN, and ends with the sources and the closing words", () => {
    show();
    expect(screen.getByText(/Each fund is read by its ISIN, which names the exact plan and option/)).toBeTruthy();
    const foot = document.querySelector(".mfp-foot")!;
    expect(foot.textContent).toMatch(/index levels from NSE\. Information only, not investment advice\.$/);
  });
});
