// @vitest-environment jsdom
// Trading Lab > Order Flow > Money Flow (founder, 26 Nov 2026, second reference video): a plain headline of where money went, each sector's net
// ₹ crore, the flow into the day's inflow and outflow, the stocks with most money in and out, the latest surge, hover cards, no advice words.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cr, headline } from "../lib/money";

const auth = { ready: true, user: { id: "u1", email: "m@example.com", role: "investor" } as unknown, features: ["trading_lab"] as string[] };
vi.mock("../lib/auth", () => ({ useAuth: () => auth }));
import { OrderFlowPage } from "./OrderFlow";

const st = (symbol: string, sector: string, inn: number, out: number, surge = 0) => ({ symbol, sector, in: inn, out, net: +(inn - out).toFixed(2), surge });
const stocks = [st("TCS", "IT", 300, 100, 2.5), st("INFY", "IT", 120, 60), st("TATASTEEL", "Metals & Mining", 50, 260, -4.1), st("HINDALCO", "Metals & Mining", 40, 90)];
const sector = (name: string) => { const g = stocks.filter((s) => s.sector === name); const sum = (k: "in" | "out" | "net" | "surge") => g.reduce((a, s) => a + s[k], 0);
  return { sector: name, in: sum("in"), out: sum("out"), net: sum("net"), surge: sum("surge"), stocks: g }; };
const MONEY = { ready: true, tradeDay: "2026-11-25", takenAt: "2026-11-25T11:03:00+05:30", in: 510, out: 510, net: 0, sectors: [sector("IT"), sector("Metals & Mining")],
  stocks: [...stocks].sort((a, b) => b.net - a.net), surge: stocks[2], stepMinutes: 3, steps: 20, latest: "11:03" };
const SNAP = { ready: true, tradeDay: "2026-11-25", takenAt: "2026-11-25T11:03:00+05:30", notes: [], stocks: [], lines: { times: [], change: {} },
  summary: { stocks: 0, up: 0, down: 0, flat: 0, medianChangePct: null, buildups: { long_buildup: 0, short_buildup: 0, short_covering: 0, long_unwinding: 0 }, distribution: [], sectors: [] } };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
let money: unknown = MONEY;
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async (url: string) => json(String(url).includes("/api/lab/access") ? { access: true, reason: "granted", expiresAt: null, signals: false }
  : String(url).includes("/api/lab/flow/money") ? money : SNAP))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); money = MONEY; });
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/lab/flow?view=money"]}><OrderFlowPage /></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

describe("Money Flow", () => {
  it("says where money went, shows each sector's net, the inflow and outflow, the top stocks and the surge", async () => {
    wrap(); await settle();
    expect(screen.getByRole("link", { name: "Money Flow" }).getAttribute("aria-current")).toBe("page");
    expect(document.querySelector(".oflow-money-line")?.textContent).toBe("Money moving into IT; out of Metals & Mining.");
    const bars = screen.getByRole("list", { name: "Net money by sector" });
    expect(within(bars).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["IT+₹260 cr", "Metals & Mining−₹260 cr"]);
    expect(screen.getByRole("img", { name: /Money flow: 1 sectors with more money in, 1 with more out; in ₹510 cr, out ₹510 cr/ })).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Most money in" })).getAllByRole("link").map((a) => a.textContent)).toEqual(["TCS", "INFY"]);
    expect(within(screen.getByRole("list", { name: "Most money out" })).getAllByRole("link").map((a) => a.textContent)).toEqual(["TATASTEEL", "HINDALCO"]);
    expect(screen.getByText(/Fastest now:/).textContent).toMatch(/TATASTEEL −₹4\.1 cr a minute over the latest 3 minutes/);
  });
  it("pointing at a sector or a stock shows its in, out and net", async () => {
    wrap(); await settle();
    const e = new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" });
    fireEvent(within(screen.getByRole("list", { name: "Net money by sector" })).getAllByRole("listitem")[1], e);
    const pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("Metals & Mining")).toBeTruthy();
    expect(within(pop).getByText("In ₹90 cr")).toBeTruthy();
    expect(within(pop).getByText("Out ₹350 cr")).toBeTruthy();
  });
  it("before two snapshots it says why there is nothing yet", async () => {
    money = { ready: false, reason: "Money Flow needs two snapshots of the day with traded volume; it fills in after the next few minutes of trading." };
    wrap(); await settle();
    expect(screen.getByRole("heading", { name: "No Money Flow yet" })).toBeTruthy();
  });
  it("never uses an advice word, and says every trade has a buyer and a seller", async () => {
    wrap(); await settle();
    const text = document.querySelector(".oflow-money")!.textContent!;
    expect(text).not.toMatch(/\b(buy now|sell now|accumulate|target|top pick|multibagger|should)\b/i);
    expect(text).toMatch(/Every trade has a buyer and a seller/);
  });
  it("formats crore and builds the headline from the sectors", () => {
    expect(cr(12658.4)).toBe("₹12,658 cr"); expect(cr(-4.12, true)).toBe("−₹4.1 cr"); expect(cr(60.8, true)).toBe("+₹60.8 cr"); expect(cr(null)).toBe("—");
    expect(headline({ ...MONEY, sectors: [] } as never)).toBe("No sector with more money in than out.");
  });
});
