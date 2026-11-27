// @vitest-environment jsdom
// Trading Lab > Order Flow > Trading journal: a member's own trades and the numbers from the closed ones, add / close / remove, CSV import.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer } from "./FlowTips";
import { TradingJournal } from "./TradingJournal";
import { calendar, money, type Journal } from "../../lib/journal";

const J: Journal = { limit: 5000, trades: [
  { id: 3, symbol: "TCS", side: "long", qty: 5, entryPrice: 3000, exitPrice: null, entryAt: "2026-11-26T10:00:00+05:30", exitAt: null, fees: 0, setup: null, notes: null, pnl: null },
  { id: 2, symbol: "INFY", side: "short", qty: 10, entryPrice: 1500, exitPrice: 1510, entryAt: "2026-11-25T10:00:00+05:30", exitAt: "2026-11-25T11:00:00+05:30", fees: 0, setup: "Gap", notes: null, pnl: -100 },
  { id: 1, symbol: "RELIANCE", side: "long", qty: 10, entryPrice: 1400, exitPrice: 1430, entryAt: "2026-11-24T09:30:00+05:30", exitAt: "2026-11-24T11:00:00+05:30", fees: 0, setup: "ORB", notes: "first one", pnl: 300 },
], stats: { closed: 2, open: 1, net: 200, fees: 0, wins: 1, losses: 1, winRate: 50, profitFactor: 3, expectancy: 100, avgWin: 300, avgLoss: -100, largestWin: 300, largestLoss: -100,
  maxDrawdown: -100, bestDay: { day: "2026-11-24", net: 300 }, worstDay: { day: "2026-11-25", net: -100 }, longestWinRun: 1, longestLossRun: 1, currentRun: { kind: "loss", count: 1 },
  curve: [{ at: "2026-11-24T11:00:00+05:30", cum: 300, dd: 0 }, { at: "2026-11-25T11:00:00+05:30", cum: 200, dd: -100 }],
  days: [{ day: "2026-11-24", net: 300 }, { day: "2026-11-25", net: -100 }],
  setups: [{ setup: "ORB", trades: 1, net: 300, wins: 1 }, { setup: "Gap", trades: 1, net: -100, wins: 0 }] } };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const calls: { url: string; method: string; body: unknown }[] = [];
beforeEach(() => { calls.length = 0; vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET"; calls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : null });
  if (method === "GET") return json(J);
  if (String(url).endsWith("/import")) return json({ added: 1, rejected: [{ line: 3, reason: "side 'hold' is not long, short, buy or sell" }] });
  return json({ trade: J.trades[0], status: "removed" });
})); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TipLayer><TradingJournal today="2026-11-26" /></TipLayer></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const point = (el: Element) => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" }); fireEvent(el, e); };

describe("Trading journal, helpers", () => {
  it("writes money with a sign and Indian grouping", () => {
    expect(money(1250)).toBe("+₹1,250.00"); expect(money(-40)).toBe("−₹40.00"); expect(money(1400, false)).toBe("₹1,400.00"); expect(money(null)).toBe("—");
  });
  it("lays the days out as Monday-first weeks ending today, with nothing after today", () => {
    const w = calendar([{ day: "2026-11-24", net: 5 }], "2026-11-26", 2);
    expect(w).toHaveLength(2); expect(w[1][0].day).toBe("2026-11-23");              // Monday of the last week
    expect(w[1][1]).toMatchObject({ day: "2026-11-24", net: 5 }); expect(w[1][6].net).toBeNull();
  });
});

describe("Trading journal, the tab", () => {
  it("shows the numbers, the curve, the calendar and every trade", async () => {
    wrap(); await settle();
    expect(document.querySelector(".oflow-money-line")?.textContent).toBe("+₹200.00 over 2 closed trades · 50% won");
    const tiles = document.querySelector(".jr-tiles")!.textContent!;
    for (const t of ["Net P&L+₹200.00", "Win rate50%", "Profit factor3.00", "Deepest drawdown−₹100.00", "Runs1 lost in a row"]) expect(tiles).toContain(t);
    expect(screen.getByRole("img", { name: /Cumulative P&L over 2 closed trades, ending at \+₹200.00/ })).toBeTruthy();
    expect(document.querySelectorAll(".jr-day.up")).toHaveLength(1); expect(document.querySelectorAll(".jr-day.down")).toHaveLength(1);
    const rows = within(screen.getByRole("table", { name: "Your trades" })).getAllByRole("row");
    expect(rows).toHaveLength(4); expect(rows[1].textContent).toContain("open");
    expect(within(screen.getByRole("list", { name: "P&L by setup" })).getAllByRole("listitem")[0].textContent).toContain("ORB+₹300.00");
  });
  it("pointing at a day or a point of the curve shows its P&L", async () => {
    wrap(); await settle();
    point(document.querySelector(".jr-day.down")!);
    expect(within(screen.getByRole("tooltip")).getByText("−₹100.00")).toBeTruthy();
    point(document.querySelectorAll(".jr-curve .hit")[1]);
    expect(within(screen.getByRole("tooltip")).getByText("After trade 2")).toBeTruthy();
  });
  it("adds a trade with the form, as Indian time", async () => {
    wrap(); await settle();
    fireEvent.click(screen.getByRole("button", { name: "Add a trade" }));
    const f = screen.getByRole("form", { name: "Add a trade" });
    fireEvent.change(within(f).getByLabelText("Symbol"), { target: { value: "SBIN" } });
    fireEvent.change(within(f).getByLabelText("Quantity"), { target: { value: "20" } });
    fireEvent.change(within(f).getByLabelText("Entry price"), { target: { value: "800" } });
    fireEvent.change(within(f).getByLabelText("Entry time"), { target: { value: "2026-11-26T09:45" } });
    fireEvent.submit(f); await settle();
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toMatch(/\/api\/lab\/journal$/);
    expect(post?.body).toMatchObject({ symbol: "SBIN", side: "long", qty: 20, entryPrice: 800, entryAt: "2026-11-26T09:45:00+05:30", exitPrice: null, exitAt: null });
  });
  it("refuses an exit price without an exit time before sending", async () => {
    wrap(); await settle();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    const f = screen.getByRole("form", { name: "Change the trade" });
    fireEvent.change(within(f).getByLabelText("Exit price"), { target: { value: "3050" } });
    fireEvent.submit(f); await settle();
    expect(screen.getByRole("alert").textContent).toContain("needs both its exit price and exit time");
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    fireEvent.change(within(f).getByLabelText("Exit time"), { target: { value: "2026-11-26T14:00" } });
    fireEvent.submit(f); await settle();
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({ url: expect.stringMatching(/\/api\/lab\/journal\/3$/), body: { exitPrice: 3050, exitAt: "2026-11-26T14:00:00+05:30" } });
  });
  it("removes a trade after asking", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    wrap(); await settle();
    fireEvent.click(screen.getByRole("button", { name: "Remove the INFY trade" })); await settle();
    expect(calls.find((c) => c.method === "DELETE")?.url).toMatch(/\/api\/lab\/journal\/2$/);
  });
  it("imports CSV and lists each line it could not read", async () => {
    wrap(); await settle();
    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    fireEvent.change(screen.getByRole("textbox", { name: "CSV text" }), { target: { value: "symbol,side,qty,entry,entry time\nA,long,1,10,2026-11-24\nB,hold,1,1,2026-11-24" } });
    fireEvent.click(screen.getByRole("button", { name: "Import" })); await settle();
    expect(calls.find((c) => c.url.endsWith("/import"))?.body).toMatchObject({ csv: expect.stringContaining("A,long") });
    expect(screen.getByRole("status").textContent).toContain("1 trade added.");
    expect(screen.getByRole("status").textContent).toContain("Line 3: side 'hold'");
  });
  it("never tells anyone what to trade", async () => {
    wrap(); await settle();
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const w of ["buy", "sell", "target", "stop loss", "bullish", "bearish", "best setup"]) expect(text).not.toContain(w);
  });
});

describe("Trading journal, a long record", () => {
  it("lists 25 trades at first and more on request; the numbers use every trade", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...J.trades[1], id: 100 + i, symbol: `S${i}` }));
    vi.stubGlobal("fetch", vi.fn(async () => json({ ...J, trades: many })));
    wrap(); await settle();
    const body = () => within(screen.getByRole("table", { name: "Your trades" })).getAllByRole("row").length - 1;
    expect(body()).toBe(25);
    fireEvent.click(screen.getByRole("button", { name: "Show 5 more" }));
    expect(body()).toBe(30); expect(screen.queryByRole("button", { name: /more$/ })).toBeNull();
  });
});
