// @vitest-environment jsdom
// Trading Lab > Order Flow, Market depth (founder, 26 Nov 2026; docs/TRADING-LAB.md "Order Flow" step 2): only Lab members see it; before the first
// snapshot it says when one comes; with a snapshot it shows rising/falling, the depth curve, the bands, the four build-ups, sectors (one can be
// chosen to filter the cards) and the stocks with the most facts lined up, each card with its facts; every number says what it is; no advice words.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marketLive, pct } from "../lib/flow";

const auth = { ready: true, user: { id: "u1", email: "m@example.com", role: "investor" } as unknown, features: ["trading_lab"] as string[] };
vi.mock("../lib/auth", () => ({ useAuth: () => auth }));
import { OrderFlowPage } from "./OrderFlow";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let access: unknown, flow: unknown;
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async (url: string) => json(200, String(url).includes("/api/lab/access") ? access : flow))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = (path = "/lab/flow") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><OrderFlowPage /></MemoryRouter></QueryClientProvider>);
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

const stock = (symbol: string, changePct: number, sector: string, buildup: string | null, score: number, extra: object = {}) => ({
  symbol, name: `${symbol} Ltd`, sector, industry: null, lot: 100, price: 100 + changePct, previousClose: 100, change: changePct, changePct,
  open: 100, high: 110, low: 90, volume: 1000, vwap: 100, vwapGapPct: changePct / 2, oi: 1000, oiChange: 50, oiChangePct: 5.5, buildup,
  direction: changePct > 0 ? 1 : -1, pivots: { p: 100, r1: 104, r2: 108, s1: 96, s2: 92 }, pivotsFrom: "2026-11-24", zone: changePct > 0 ? "r1_r2" : "s2_s1",
  agreement: { score, of: 5, facts: { newPositions: true, vwapSide: true, pastLevel: score > 2, strongOi: true, rangeEnd: null } }, asOf: "2026-11-25T11:02:10+05:30", notes: [], ...extra,
});
const SNAP = {
  ready: true, tradeDay: "2026-11-25", takenAt: "2026-11-25T11:03:00+05:30", notes: [],
  summary: {
    stocks: 4, up: 2, down: 2, flat: 0, medianChangePct: 0.5, buildups: { long_buildup: 1, short_buildup: 1, short_covering: 1, long_unwinding: 1 },
    distribution: [{ from: null, to: -5, count: 1 }, { from: -5, to: -3, count: 1 }, { from: 0, to: 0.5, count: 0 }, { from: 5, to: null, count: 2 }],
    sectors: [{ sector: "Financial Services", stocks: 2, up: 2, down: 0, avgChangePct: 6.2, buildups: {}, oiChange: 100, symbols: ["POLICYBZR", "HDFC"] },
      { sector: "Metals & Mining", stocks: 2, up: 0, down: 2, avgChangePct: -6.1, buildups: {}, oiChange: 100, symbols: ["TATASTEEL", "HINDALCO"] }],
  },
  stocks: [stock("POLICYBZR", 6.48, "Financial Services", "long_buildup", 5), stock("TATASTEEL", -8.43, "Metals & Mining", "short_buildup", 4),
    stock("HDFC", 5.9, "Financial Services", "short_covering", 2), stock("HINDALCO", -3.8, "Metals & Mining", null, 1, { notes: ["oi: the previous session's open interest is not stored yet"] })],
  lines: { times: ["10:00", "10:03", "11:03"], change: { POLICYBZR: [1, 3, 6.48], TATASTEEL: [-2, -5, -8.43], HDFC: [null, 2, 5.9], HINDALCO: [-1, null, -3.8] } },
};

describe("Order Flow > Market depth", () => {
  it("is for Lab members only: a member without a grant gets the invitation message and no snapshot is asked for", async () => {
    access = { access: false, reason: "not_granted", expiresAt: null, signals: false };
    wrap(); await settle();
    expect(screen.getByRole("heading", { name: "The Trading Lab is open by invitation" })).toBeTruthy();
    expect((fetch as unknown as { mock: { calls: string[][] } }).mock.calls.some((c) => String(c[0]).includes("/api/lab/flow"))).toBe(false);
  });
  it("a visitor signing in comes back to the Order Flow page", async () => {
    access = { access: false, reason: "sign_in", expiresAt: null, signals: false };
    wrap(); await settle();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login?next=/lab/flow");
  });
  it("before the first snapshot it says when one comes", async () => {
    access = { access: true, reason: "granted", expiresAt: null, signals: false };
    flow = { ready: false, reason: "The first snapshot is taken in the next market session (every few minutes, 09:15 to 15:30 IST, weekdays)." };
    wrap(); await settle();
    expect(screen.getByRole("heading", { name: "No snapshot yet" })).toBeTruthy();
    expect(screen.getByText(/next market session/)).toBeTruthy();
  });
  it("shows breadth, the curve, the bands, the four build-ups, sectors and the cards with their facts", async () => {
    access = { access: true, reason: "granted", expiresAt: null, signals: false };
    flow = SNAP;
    wrap(); await settle();
    expect(screen.getByLabelText("2 rising, 2 falling")).toBeTruthy();
    expect(screen.getByRole("img", { name: /Change of 4 F&O stocks, lowest to highest: from −8.43% \(TATASTEEL\) to \+6.48% \(POLICYBZR\)/ })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Stocks by band of the day's change" }).querySelectorAll("li").length).toBe(4);
    const bu = screen.getByRole("list", { name: "Futures build-up across F&O stocks" });
    for (const n of ["Long build-up", "Short covering", "Short build-up", "Long unwinding"]) expect(within(bu).getByText(n)).toBeTruthy();
    const pb = screen.getByRole("article", { name: "POLICYBZR" });
    expect(within(pb).getByText("+6.48%")).toBeTruthy();
    expect(within(pb).getByText("Long build-up")).toBeTruthy();
    expect(within(pb).getByText("Between R1 and R2")).toBeTruthy();
    expect(within(pb).getByRole("img", { name: /^5 of 5 facts agree: Open interest rose with the move \(new positions\) — yes; Price above the day's VWAP — yes/ })).toBeTruthy();
    expect(within(pb).getByRole("link", { name: "POLICYBZR" }).getAttribute("href")).toBe("/stocks/POLICYBZR");
    const hin = screen.getByRole("article", { name: "HINDALCO" });
    expect(within(hin).getByText("No build-up").getAttribute("title")).toBe("the previous session's open interest is not stored yet");   // a blank says why
    expect(screen.getByText("Last session")).toBeTruthy();
  });
  it("choosing a sector shows only its stocks, and again clears it", async () => {
    access = { access: true, reason: "admin", expiresAt: null, signals: true };
    flow = SNAP;
    wrap(); await settle();
    const metals = screen.getByRole("button", { name: /^Metals & Mining: average −6.10%, 0 rising, 2 falling of 2/ });
    fireEvent.click(metals);
    expect(metals.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("article", { name: "POLICYBZR" })).toBeNull();
    expect(screen.getByRole("article", { name: "TATASTEEL" })).toBeTruthy();
    expect(screen.getByText("No rising stock in this sector.")).toBeTruthy();
    fireEvent.click(metals);
    expect(screen.getByRole("article", { name: "POLICYBZR" })).toBeTruthy();
  });
  it("no advice word in the page's own text (describe, never advise), even with signals on", async () => {
    access = { access: true, reason: "admin", expiresAt: null, signals: true };
    flow = SNAP;
    wrap(); await settle();
    const text = document.body.textContent!.toLowerCase().replace("does not tell anyone to buy, sell or hold", "");
    for (const w of [" buy ", " sell ", " hold ", "target", " best ", "multibagger", "top pick", "accumulate", "conviction", "pick "]) expect(text.includes(w), w).toBe(false);
  });
});

describe("Order Flow > Flow board", () => {
  beforeEach(() => { access = { access: true, reason: "granted", expiresAt: null, signals: false }; flow = SNAP; });
  afterEach(() => { vi.unstubAllGlobals(); });
  it("the tabs link the two views; the board shows every line flowing into rising, falling, sectors and build-ups", async () => {
    wrap("/lab/flow?view=board"); await settle();
    expect(screen.getByRole("link", { name: "Flow board" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Market depth" }).getAttribute("href")).toBe("/lab/flow");
    expect(screen.getByRole("heading", { name: "Flow board" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "The day's line of 4 F&O stocks flowing into 2 rising and 2 falling, then into 2 sectors and the futures build-ups." })).toBeTruthy();
    expect(document.querySelectorAll(".oflow-lines path").length).toBe(4);
    for (const n of ["Rising: 2 stocks", "Falling: 2 stocks", "Financial Services: 2 rising, 0 falling", "Metals & Mining: 0 rising, 2 falling", "Long build-up: 1 stocks", "No build-up: 1 stocks"])
      expect(screen.getByRole("button", { name: n })).toBeTruthy();
    expect(screen.getByText(/Choose a direction, a sector or a build-up/)).toBeTruthy();
  });
  it("choosing a part lists its stocks and lights only its path; choosing it again clears", async () => {
    wrap("/lab/flow?view=board"); await settle();
    const metals = screen.getByRole("button", { name: "Metals & Mining: 0 rising, 2 falling" });
    fireEvent.click(metals);
    expect(metals.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "Metals & Mining: 2 stocks" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "TATASTEEL" })).toBeTruthy();
    expect(screen.queryByRole("article", { name: "POLICYBZR" })).toBeNull();
    expect(document.querySelectorAll(".oflow-lines path.lit").length).toBe(2);
    expect(document.querySelectorAll(".oflow-lines path.dim").length).toBe(2);
    fireEvent.click(metals);
    expect(screen.queryByRole("article", { name: "TATASTEEL" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("button", { name: "Long build-up: 1 stocks" }), { key: "Enter" });
    expect(screen.getByRole("heading", { name: "Long build-up: 1 stock" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "POLICYBZR" })).toBeTruthy();
  });
  it("on a phone: the lines, a row per sector with its build-up mix, and build-up buttons", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("720"), addEventListener: () => {}, removeEventListener: () => {} }));
    wrap("/lab/flow?view=board"); await settle();
    expect(screen.getByRole("img", { name: "The day's line of 4 F&O stocks flowing into 2 rising and 2 falling." })).toBeTruthy();
    const rows = screen.getByRole("list", { name: "Sectors and their build-ups" });
    expect(within(rows).getAllByRole("button").length).toBe(2);
    fireEvent.click(within(screen.getByRole("group", { name: "Build-ups" })).getByRole("button", { name: /Short build-up/ }));
    expect(screen.getByRole("article", { name: "TATASTEEL" })).toBeTruthy();
  });
});

describe("helpers", () => {
  it("formats changes with a real minus sign and a dash for unknown", () => {
    expect(pct(6.481)).toBe("+6.48%");
    expect(pct(-8.4)).toBe("−8.40%");
    expect(pct(null)).toBe("—");
  });
  it("the market counts as live from 09:15 to 15:40 IST on weekdays", () => {
    expect(marketLive(new Date("2026-11-25T03:44:00Z"))).toBe(false);   // 09:14 IST
    expect(marketLive(new Date("2026-11-25T03:45:00Z"))).toBe(true);    // 09:15 IST
    expect(marketLive(new Date("2026-11-25T10:10:00Z"))).toBe(true);    // 15:40 IST
    expect(marketLive(new Date("2026-11-25T10:11:00Z"))).toBe(false);
    expect(marketLive(new Date("2026-11-29T05:00:00Z"))).toBe(false);   // Sunday
  });
});
