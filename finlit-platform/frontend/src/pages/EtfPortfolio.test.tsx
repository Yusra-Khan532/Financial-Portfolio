// @vitest-environment jsdom
// Task #136: the ETF portfolio page: five tiles, the "Twice" tag, equal weights until quantities are added (and the page says so), the three column sets,
// quantities that save, and remove.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EtfHolding, EtfPortfolio } from "../lib/etfPortfolio";

vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/Gate", () => ({ Gate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: () => true, toast: () => undefined, plan: "silver" }) }));
const calls: { units: { id: string; units: string }[]; remove: string[] } = { units: [], remove: [] };
const data: { p: EtfPortfolio | undefined } = { p: undefined };
vi.mock("../lib/etfPortfolio", async (orig) => {
  const real = await orig<typeof import("../lib/etfPortfolio")>();
  const m = (f: (x: never) => void) => ({ mutateAsync: async (x: never) => { f(x); return { merged: false, removed: 1, added: 0, updated: 0 }; }, isPending: false });
  return { ...real, useEtfPortfolio: () => ({ data: data.p, isPending: false, isError: false }), useEtfRisk: () => ({ data: undefined, isPending: false, isError: false }),
    useEtfWrites: () => ({ add: m(() => {}), units: m((x: { id: string; units: string }) => calls.units.push(x)), remove: m((x: string) => calls.remove.push(x)), clear: m(() => {}), preview: m(() => {}), commit: m(() => {}) }) };
});
import { EtfPortfolioPage } from "./EtfPortfolio";

afterEach(() => { cleanup(); calls.units.length = 0; calls.remove.length = 0; });
const h = (o: Partial<EtfHolding>): EtfHolding => ({ id: "id-" + o.symbol, symbol: "X", name: "X ETF", isin: "", fundHouse: null, category: "nifty50", categoryLabel: "Nifty 50", assetClass: "equity",
  price: 286.64, previousClose: 288, changePct: -0.55, priceDate: "2026-11-13", volume: 0, avgTurnover: 2.7e9, ret1m: null, ret6m: null, ret1y: -1.97, ret3y: null, ret5y: 46.65, cagr3y: null, cagr5y: null,
  vol1y: null, mdd1y: null, mdd3y: null, mdd5y: null, high52: null, low52: null, from52: null, rangeFrom: null, firstDate: null, points: 0, breakDate: null, nav: 287, navDate: "2026-11-13",
  premium: -0.12, premiumWide: false, why: {}, rank: 1, hot: true, ter: 0.04, units: null, value: null, weight: 33.33, missing: null, index: { key: "nifty50", label: "Nifty 50" }, twice: true, ...o } as EtfHolding);
const open = () => {
  data.p = { plan: "silver", limit: 30, count: 3, basis: "equal", asOf: "2026-11-13", updatedAt: null, disclaimer: "Information only. Not investment advice.",
    holdings: [h({ symbol: "NIFTYBEES" }), h({ symbol: "SETFNIF50", ter: 0.07 }), h({ symbol: "GOLDBEES", assetClass: "gold", category: "gold", index: { key: "gold", label: "Gold" }, twice: false, ter: 0.79, ret5y: null, why: { ret_5y: "Listed less than 5 years" } })] };
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/etf-portfolio"]}><EtfPortfolioPage /></MemoryRouter></QueryClientProvider>);
};

describe("ETF portfolio page (task #136)", () => {
  it("shows the five tiles, with the index followed twice tagged", () => {
    open();
    const tiles = screen.getByRole("region", { name: "Your ETFs at a glance" });
    for (const k of ["ETFs", "What they track", "Yearly cost", "Price against value", "Risk level"]) expect(within(tiles).getByText(k)).toBeTruthy();
    expect(within(tiles).getByText("Nifty 50 twice")).toBeTruthy();
    expect(screen.getAllByText("Twice")).toHaveLength(2);                                     // both Nifty 50 rows
    expect(screen.getByText("Two ETFs follow the Nifty 50")).toBeTruthy();                       // the Watch out card
  });
  it("says weights are equal until every ETF has a quantity, and Add quantities saves units", () => {
    open();
    expect(screen.getByText(/Weights are equal until every ETF has a quantity/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Add quantities" })).toHaveLength(2);           // in the header, and in the equal-weights note
    fireEvent.click(screen.getAllByRole("button", { name: "Add quantities" })[0]);
    const box = screen.getByRole("textbox", { name: "Units of GOLDBEES" });
    fireEvent.change(box, { target: { value: "40" } }); fireEvent.blur(box);
    return new Promise((r) => setTimeout(r, 0)).then(() => expect(calls.units).toEqual([{ id: "id-GOLDBEES", units: "40" }]));
  });
  it("switches between the three column sets; a blank says why", () => {
    open();
    const heads = () => [...document.querySelectorAll(".etfp-tb thead th")].map((e) => e.textContent?.replace(/i$/, ""));
    expect(heads()).toEqual(expect.arrayContaining(["ETF", "Tracks", "Price", "1 day", "1 year", "5 years", "Expense ratio"]));
    expect(screen.getByTitle("Listed less than 5 years")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trading" }));
    expect(heads()).toEqual(expect.arrayContaining(["Price vs NAV", "Traded a day", "Tracking difference"]));
    fireEvent.click(screen.getByRole("button", { name: "Risk" }));
    expect(heads()).toEqual(expect.arrayContaining(["Swing a year", "Worst fall", "Beta", "Falls taken"]));
  });
  it("removes an ETF with its cross", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Remove GOLDBEES" }));
    return new Promise((r) => setTimeout(r, 0)).then(() => expect(calls.remove).toEqual(["id-GOLDBEES"]));
  });
});
