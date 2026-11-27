// @vitest-environment jsdom
// Trading Lab > Order Flow (Global) > Global trade: India's trade with the world from UN Comtrade (a real load of 27 Nov 2026): the month in one
// line, 13 months, the largest partners and products each way, a card on every bar and month; facts only.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer } from "./FlowTips";
import { GlobalTrade, tradeLine, usdBn, type Trade } from "./GlobalTrade";
import SAMPLE from "./__fixtures__/trade.json";

const T = SAMPLE as Extract<Trade, { ready: true }>;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const urls: string[] = [];
beforeEach(() => { urls.length = 0; vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(String(u)); return json(T); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TipLayer><GlobalTrade /></TipLayer></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const point = (el: Element) => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" }); fireEvent(el, e); };

describe("Global trade", () => {
  it("writes dollars in billions and the month in one line", () => {
    expect(usdBn(43_722_286_821)).toBe("$43.7 bn"); expect(usdBn(-2_356_111_676, true)).toBe("−$2.36 bn"); expect(usdBn(256_126_795)).toBe("$256 mn");
    expect(tradeLine(T)).toBe("India, Aug 2026: exports $43.7 bn (+25.2% on Aug 2025) · imports $71.0 bn (+15.3%) · trade balance −$27.3 bn");
  });
  it("reads the Lab's trade route and shows 13 months, partners and products", async () => {
    wrap(); await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/trade"))).toBe(true);
    expect(document.querySelectorAll(".trd-m")).toHaveLength(13);
    expect(within(screen.getByRole("list", { name: "Largest export partners" })).getAllByRole("listitem")[0].textContent).toContain("USA");
    expect(within(screen.getByRole("list", { name: "Largest imports by product" })).getAllByRole("listitem")[0].textContent).toContain("Mineral fuels and oils");
  });
  it("pointing at a month or a bar shows its detail", async () => {
    wrap(); await settle();
    point(document.querySelectorAll(".trd-m")[12]);
    expect(within(screen.getByRole("tooltip")).getByText("Aug 2026")).toBeTruthy();
    point(within(screen.getByRole("list", { name: "Largest export partners" })).getAllByRole("listitem")[0]);
    const pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("USA")).toBeTruthy(); expect(within(pop).getByText("+21.2%")).toBeTruthy();
  });
  it("says when the first load has not run, and never advises", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ready: false, reason: "India's trade loads from UN Comtrade once a day; the first load has not run yet." })));
    wrap(); await settle();
    expect(document.body.textContent).toContain("the first load has not run yet");
    for (const w of ["buy", "sell", "bullish", "bearish", "outlook"]) expect((document.body.textContent ?? "").toLowerCase()).not.toContain(w);
  });
});
