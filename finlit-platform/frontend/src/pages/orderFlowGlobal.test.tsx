// @vitest-environment jsdom
// Trading Lab > Order Flow, Global (founder, 26 Nov 2026: "a switching option of global with a single button"): one India | Global switch that
// keeps the view; Global reads /api/lab/flow/global(/money), shows US dollars and "US companies", no futures build-up, and switches back.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inr, setFlowMarket, universe, usLive } from "../lib/flow";
import { cr } from "../lib/money";

const auth = { ready: true, user: { id: "u1", email: "m@example.com", role: "admin" } as unknown, features: ["trading_lab"] as string[] };
vi.mock("../lib/auth", () => ({ useAuth: () => auth }));
import { GLOBAL_TABS, OrderFlowPage } from "./OrderFlow";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const us = (symbol: string, changePct: number, sector: string) => ({
  symbol, name: `${symbol} Inc.`, sector, industry: null, lot: null, price: 100 + changePct, previousClose: 100, change: changePct, changePct,
  open: null, high: null, low: null, volume: 1_000_000, vwap: null, vwapGapPct: null, oi: null, oiChange: null, oiChangePct: null, buildup: null,
  direction: changePct > 0 ? 1 : -1, pivots: null, pivotsFrom: null, zone: null, agreement: { score: 0, of: 0, facts: {} }, asOf: null, notes: [],
});
const GLOBAL = {
  ready: true, market: "us", currency: "USD", tradeDay: "2026-11-25", takenAt: "2026-11-26T02:30:00+05:30", notes: ["US data: no futures open interest."],
  summary: { stocks: 3, up: 2, down: 1, flat: 0, medianChangePct: 1.2, buildups: { long_buildup: 0, short_buildup: 0, short_covering: 0, long_unwinding: 0 },
    distribution: [{ from: null, to: -5, count: 0 }, { from: 0, to: 0.5, count: 0 }, { from: 1, to: 2, count: 2 }, { from: -2, to: -1, count: 1 }],
    sectors: [{ sector: "Technology", stocks: 2, up: 2, down: 0, avgChangePct: 1.5, buildups: {}, oiChange: null, symbols: ["AAPL", "NVDA"] },
      { sector: "Finance", stocks: 1, up: 0, down: 1, avgChangePct: -1.4, buildups: {}, oiChange: null, symbols: ["JPM"] }] },
  stocks: [us("AAPL", 1.2, "Technology"), us("NVDA", 1.8, "Technology"), us("JPM", -1.4, "Finance")],
  lines: { times: ["20:00", "20:05"], change: { AAPL: [0.5, 1.2], NVDA: [0.9, 1.8], JPM: [-0.4, -1.4] } },
};
const urls: string[] = [];
beforeEach(() => { urls.length = 0; vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(String(u));
  if (String(u).includes("/api/lab/access")) return json({ access: true, reason: "admin", expiresAt: null, signals: false });
  if (String(u).includes("/api/lab/flow/global")) return json(GLOBAL);
  return json({ ready: false, reason: "The first snapshot is taken in the next market session." }); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setFlowMarket("india"); });
const wrap = (path: string) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><OrderFlowPage /></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

describe("Order Flow, the India | Global switch", () => {
  it("India by default; Global reads the US snapshot and speaks in dollars and US companies, with no futures build-up", async () => {
    wrap("/lab/flow?m=global"); await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/flow/global"))).toBe(true);
    expect(screen.getByRole("link", { name: "Global" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link", { name: "India" }).getAttribute("aria-pressed")).toBe("false");
    const main = document.body.textContent ?? "";
    expect(main).toContain("3 US companies"); expect(main).toContain("$101.20");
    expect(main).not.toContain("Futures build-up"); expect(main).toContain("Biggest moves");
  });
  it("the switch keeps the view, and Global shows only the views it has", async () => {
    wrap("/lab/flow?view=money"); await settle();
    expect(screen.getByRole("link", { name: "Global" }).getAttribute("href")).toBe("/lab/flow?view=money&m=global");
    cleanup(); wrap("/lab/flow?view=zones&m=global"); await settle();
    const tabs = screen.getAllByRole("link").filter((a) => a.classList.contains("oflow-tab")).map((a) => a.textContent);
    expect(tabs).not.toContain("Stock zones"); expect(tabs).toContain("Option Pulse"); expect(GLOBAL_TABS).toContain("money");
    expect(screen.getByRole("link", { name: "Market depth" }).getAttribute("aria-current")).toBe("page");   // a view Global lacks falls back to depth
    expect(screen.getByRole("link", { name: "India" }).getAttribute("href")).toBe("/lab/flow");
  });
  it("clicking India goes back to the India snapshot", async () => {
    wrap("/lab/flow?m=global"); await settle();
    fireEvent.click(screen.getByRole("link", { name: "India" })); await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/flow"))).toBe(true);
    expect(screen.getByRole("link", { name: "India" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("Order Flow, the market's own money and words", () => {
  it("rupees and crore for India, dollars and millions for Global", () => {
    setFlowMarket("india"); expect(inr(1234.5)).toBe("₹1,234.50"); expect(cr(1234, true)).toBe("+₹1,234 cr"); expect(universe()).toBe("F&O stocks");
    setFlowMarket("global"); expect(inr(1234.5)).toBe("$1,234.50"); expect(cr(-56.4, true)).toBe("−$56.4M"); expect(universe()).toBe("US companies");
  });
  it("the US session in New York time", () => {
    expect(usLive(new Date("2026-11-25T15:00:00Z"))).toBe(true);    // 10:00 New York, Wednesday
    expect(usLive(new Date("2026-11-25T22:00:00Z"))).toBe(false);   // 17:00 New York
    expect(usLive(new Date("2026-11-28T15:00:00Z"))).toBe(false);   // Saturday
  });
});
