// @vitest-environment jsdom
// Task #277, QA of 21 Nov 2026 (signed-in check on Gold): the fixes, one test each. 1: the shares' beta names the holdings left out; 7: what the "through"
// count counts; 8: Largest inside largest first; 11: ETFs that share a kind label are named by their own names; 12: the Discover links open a new tab.
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: null }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ has: () => true, toast: vi.fn(), upgrade: vi.fn(), plan: "gold" }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: vi.fn(async () => ({ days: 90, events: [], notPlaced: [],
  companies: [{ s: "HDFCBANK", n: "HDFC Bank", ev: { order: { n: 1, d: "2026-11-18", t: "Order", l: null, dates: ["2026-11-18"] } } }] })) }));
import demo from "../../public/demo/my-investments.json";
import { betaWindowTxt, type AllInvestments } from "../lib/myInvest";
import { InvestChanges, smallLine } from "./Changes277";
import { trackNames } from "./KeyFigures277";

afterEach(cleanup);
const D = () => structuredClone(demo) as unknown as AllInvestments;

describe("QA of 21 Nov", () => {
  it("1: the beta's window says how many were counted and names the ones with under a year of prices", () => {
    const w = { index: "Nifty 500", grain: "weekly", window: "past year" };
    expect(betaWindowTxt(w)).toBe("vs Nifty 500 · weekly · past year");
    expect(betaWindowTxt({ ...w, counted: 69, of: 71, short: ["UTLSOLAR", "TIMEX"] })).toBe("vs Nifty 500 · weekly · past year · 69 of 71 (UTLSOLAR and TIMEX: under a year of prices)");
    expect(betaWindowTxt({ ...w, counted: 66, of: 71, short: ["A", "B", "C", "D", "E"] })).toBe("vs Nifty 500 · weekly · past year · 66 of 71 (A, B and 3 more: under a year of prices)");
    expect(betaWindowTxt({ ...w, counted: 3, of: 3, short: [] })).toBe("vs Nifty 500 · weekly · past year");
  });
  it("7: the through count is the 0.1% rule, and the foot line says how many smaller ones are left out", () => {
    const d = D(); const only = d.companies.filter((c) => c.symbol && !c.abroad && c.direct === 0).length;
    expect(smallLine(d, { through: ["X"] })).toBe(`1 of the ${only} companies held only through funds and ETFs are 0.1% or more of everything; the ${only - 1} smaller ones are left out here.`);
    expect(smallLine(d, { through: new Array(only).fill("X") })).toBeUndefined();
  });
  it("11: ETFs that share a kind label are named by their own names", () => {
    expect(trackNames([{ symbol: "MAFANG", name: "Mirae Asset NYSE FANG+ ETF", tracks: "International" }, { symbol: "GOLDBEES", name: "Nippon Gold", tracks: "Gold" },
      { symbol: "MASPTOP50", name: "Mirae Asset S&P 500 Top 50 ETF", tracks: "International" }])).toEqual(["Mirae Asset NYSE FANG+ ETF", "Gold", "Mirae Asset S&P 500 Top 50 ETF"]);
  });
  it("12: Details in Discover and What changed in Discover open in a new tab on this page", async () => {
    const d = D(); d.changes = { direct: ["HDFCBANK"], through: [] };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><MemoryRouter><InvestChanges d={d} /></MemoryRouter></QueryClientProvider>);
    const row = (await screen.findByRole("link", { name: "HDFC Bank" })).closest("li")!;
    for (const a of [within(row).getByRole("link", { name: "Details in Discover ↗" }), screen.getByRole("link", { name: "What changed in Discover ↗" })]) {
      expect(a.getAttribute("target")).toBe("_blank"); expect(a.getAttribute("rel")).toContain("noopener");
    }
  });
});
