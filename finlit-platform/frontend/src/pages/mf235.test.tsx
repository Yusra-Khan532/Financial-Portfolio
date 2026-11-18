// @vitest-environment jsdom
// Task #235 phase 3b (the 18 Nov portfolios pack, C1, C4, C5, C6): the MF portfolio by platform. The platforms bar with the pack's platforms, Overview in three
// money groups (Units to 3 decimals, Avg buy NAV, Invested · Latest NAV, Value now · ₹, %; no Today), each fund's buys and sales first in, first out within
// each platform, the total row, three money tiles, the Sold list, and a change saved as the fund's lines with their platform and side (PUT /{id}).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Holding, Line, MfPortfolio } from "../lib/mfPortfolio";

const st = vi.hoisted(() => ({ data: null as unknown, put: [] as { path: string; body: unknown }[], asked: [] as string[] }));
vi.mock("../lib/mfPortfolio", async (orig) => ({
  ...(await orig<typeof import("../lib/mfPortfolio")>()),
  useMfSpread: () => ({ data: undefined, isPending: false, isError: false, error: null }),
  useMfPortfolio: (on: boolean, pf = "all") => { if (on) st.asked.push(pf); return { data: st.data, isPending: false, isError: false, error: null, refetch: () => {} }; },
  useMfWrites: () => new Proxy({}, { get: () => ({ mutateAsync: vi.fn(), isPending: false }) }),
}));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiGet: vi.fn(async (p: string) => (p.endsWith("/book") ? { portfolios: [{ id: "groww", name: "Groww", broker: "Groww" }, { id: "coin", name: "Coin by Zerodha", broker: "Coin by Zerodha" }] } : Promise.reject(Object.assign(new Error("not stood in"), { status: 503 })))),
  apiSend: vi.fn(async (_m: string, path: string, body: unknown) => { st.put.push({ path, body }); return { status: "saved" }; }) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "gold", upgrade: vi.fn(), has: () => true }), TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: { id: 1 } }) }));
import { MfPortfolioPage } from "./MfPortfolio";

const ln = (id: string, units: number, nav: number, boughtOn: string, pf: string, side: "buy" | "sell" = "buy"): Line => ({ id, units, invested: Math.round(units * nav * 100) / 100, boughtOn, pf, side });
const H = (id: string, name: string, nav: number, lines: Line[]): Holding => ({
  id, code: Number(id.length), folio: "", units: 10, lots: [], lines, name, amc: "A", plan: "Direct", option: "Growth", category: "Equity Scheme - Sectoral/ Thematic", categoryLabel: "Thematic", active: true,
  nav, navDate: "2026-11-17", navStale: false, navNote: null, invested: null, investedWhy: null, current: null, currentWhy: null, gain: null, gainPct: null, gainWhy: null, xirr: null, xirrWhy: null,
  xirrKind: "cagr", returns: { r1y: 5, r3y: null, r5y: null, asOf: null, why: null }, ter: 0.5, terDate: null, terWhy: null, aum: 100, aumAsOf: null, aumWhy: null, weight: 50, weightWhy: null,
  score: { locked: true, final: null, label: null, status: null, reason: null, runDate: null, parts: null, inherited: null },
});
// ICICI Prudential FMCG: five buys across Groww and Coin, and one sale in Groww (the pack's example of a fund held on two platforms)
const FMCG = H("aaa", "ICICI Prudential FMCG Fund", 520, [ln("f1", 10.123, 400, "2024-01-10", "groww"), ln("f2", 5, 420, "2024-06-10", "groww"), ln("f3", 8, 450, "2024-09-10", "coin"),
  ln("f4", 4, 480, "2025-01-10", "coin"), ln("f5", 2.5, 500, "2025-06-10", "groww"), ln("f6", 12, 510, "2025-09-10", "groww", "sell")]);
const SMALL = H("bbb", "Quant Small Cap Fund", 250, [ln("s1", 20, 200, "2025-02-02", "coin")]);
const DATA = {
  plan: "gold", scoreLocked: true, limit: 500, count: 2, dataDate: "2026-11-17", holdings: [FMCG, SMALL],
  sold: [{ id: "ccc", code: 9, folio: "", name: "Delta Liquid Fund", lines: [ln("d1", 100, 30, "2025-01-01", "groww"), ln("d2", 100, 31, "2025-07-01", "groww", "sell")] }],
  summary: { funds: 2, valued: 2, withCost: 2, gainFunds: 2, invested: null, current: null, gain: null, gainPct: null, navFrom: null, navTo: null, notes: [], xirr: null, xirrFunds: 0, xirrWhy: null, score: { locked: true, value: null, label: null, why: null } },
  allocation: { byCategory: [], byAmc: [] }, concentration: { level: null, text: "", top1Pct: null, top3Pct: null }, disclaimer: "", scoreDisclaimer: "",
} as unknown as MfPortfolio;

beforeEach(() => { st.data = DATA; st.put = []; st.asked = []; vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); localStorage.clear(); });
const show = async () => { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}><MemoryRouter initialEntries={["/mf-portfolio"]}><MfPortfolioPage /></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(document.querySelector('.acc-t[data-acc="groww"]')).toBeTruthy()); };

describe("MF platforms, buys and sales (pack C1, C5, C6)", () => {
  it("the platforms bar lists All accounts, Groww and Coin; picking one reads that platform", async () => {
    await show();
    expect([...document.querySelectorAll(".acc-t b")].map((b) => b.textContent)).toEqual(["All accounts", "Groww", "Coin by Zerodha"]);
    expect(screen.getByText("One tab for each place you hold funds: an app, a broker or the fund house.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Coin by Zerodha/ }));
    expect(st.asked).toContain("coin");
  });
  it("Overview has the three money groups without Today; a fund opens into its buys and sales with units to 3 decimals", async () => {
    await show();
    expect([...document.querySelectorAll("table.x-grp th.x-g")].map((t) => [t.textContent, t.getAttribute("colspan")])).toEqual([["What you paid", "3"], ["What it is worth now", "2"], ["Gain or loss", "2"]]);
    const heads = [...document.querySelectorAll("table.x-grp thead tr:last-child th")].slice(2, 9).map((t) => t.textContent!.replace(/[▲▼]/g, "").trim());
    expect(heads).toEqual(["Units", "Avg buy NAV", "Invested", "Latest NAV", "Value now", "₹", "%"]);
    // first in, first out in Groww: the sale of 12 uses the 10.123 of Jan 24 and 1.877 of Jun 24; 3.123 + 2.5 left in Groww, 12 in Coin
    const btn = screen.getByRole("button", { name: "Show the 5 buys · 1 sale of ICICI Prudential FMCG Fund" });
    expect(btn.querySelector("b")!.textContent).toBe("17.623");
    fireEvent.click(btn);
    const rows = [...document.querySelectorAll('tr.x-lot[data-lsym="AAA"]')];
    expect(rows).toHaveLength(6);
    expect(rows[0].textContent).toMatch(/all sold/); expect(rows[1].textContent).toMatch(/3\.123 left · 1\.877 sold/);
    expect(within(rows[5] as HTMLElement).getByLabelText("Sell NAV in this sale of ICICI Prudential FMCG Fund")).toBeTruthy();
    expect(document.querySelector("tr.x-lot .l-day")).toBeNull();                       // no Today: NAVs change once a day
    expect(document.querySelector("tr.x-tot")!.textContent).toMatch(/^Total · 2 funds in 2 portfolios/);
  });
  it("three money tiles (no Today), the Sold list names the fund sold in full", async () => {
    await show();
    expect([...document.querySelectorAll(".xm-row .xm-k")].map((k) => k.textContent)).toEqual(["Invested", "Value now", "Gain or loss", "Booked gain"]);
    expect(document.querySelector(".x-sold-t")!.textContent).toMatch(/1 fund sold in full.*\+₹100 booked/);
  });
  it("a change is saved as the fund's lines, each with its platform and side", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: /of Quant Small Cap Fund$/ }));
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("Units in this buy of Quant Small Cap Fund"), { target: { value: "25.5" } });
    await act(async () => { vi.advanceTimersByTime(1000); });
    vi.useRealTimers();
    expect(st.put.at(-1)).toEqual({ path: "/api/me/mf-portfolio/bbb", body: { lots: [{ units: "25.5", avgCost: "200", boughtOn: "2025-02-02", pf: "coin", side: "buy" }] } });
  });
});
