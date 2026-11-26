// @vitest-environment jsdom
// Order Flow, the new look (founder, 26 Nov 2026: "our graphics look too bad ... a good 3D way: wherever I point the mouse, a pop-up appears with
// more detail"). Pointing at a stock card, the depth curve, a band, a build-up tile, a sector, a board line, a sector box, a build-up box or a
// direction bar shows a detail card; a touch never opens one; cards lean toward the pointer; the board has a % grid and big count badges; the CSS
// keeps the pop-up opaque, turns motion off for reduced motion, and keeps one path per stock on the board.
import { readFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { layout } from "../lib/flowboard";

const auth = { ready: true, user: { id: "u1", email: "m@example.com", role: "investor" } as unknown, features: ["trading_lab"] as string[] };
vi.mock("../lib/auth", () => ({ useAuth: () => auth }));
import { OrderFlowPage } from "./OrderFlow";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const stock = (symbol: string, changePct: number, sector: string, buildup: string | null, score: number) => ({
  symbol, name: `${symbol} Ltd`, sector, industry: null, lot: 100, price: 100 + changePct, previousClose: 100, change: changePct, changePct,
  open: 100, high: 110, low: 90, volume: 1000, vwap: 100, vwapGapPct: changePct / 2, oi: 1000, oiChange: 50, oiChangePct: 5.5, buildup,
  direction: changePct > 0 ? 1 : -1, pivots: { p: 100, r1: 104, r2: 108, s1: 96, s2: 92 }, pivotsFrom: "2026-11-24", zone: changePct > 0 ? "r1_r2" : "s2_s1",
  agreement: { score, of: 5, facts: { newPositions: true, vwapSide: true, pastLevel: score > 2, strongOi: true, rangeEnd: null } }, asOf: "2026-11-25T11:02:10+05:30", notes: [],
});
const SNAP = {
  ready: true, tradeDay: "2026-11-25", takenAt: "2026-11-25T11:03:00+05:30", notes: [],
  summary: { stocks: 4, up: 2, down: 2, flat: 0, medianChangePct: 0.5, buildups: { long_buildup: 1, short_buildup: 1, short_covering: 1, long_unwinding: 1 },
    distribution: [{ from: null, to: -5, count: 1 }, { from: -5, to: -3, count: 1 }, { from: 0, to: 0.5, count: 0 }, { from: 5, to: null, count: 2 }],
    sectors: [{ sector: "Financial Services", stocks: 2, up: 2, down: 0, avgChangePct: 6.2, buildups: {}, oiChange: 100, symbols: ["POLICYBZR", "HDFC"] },
      { sector: "Metals & Mining", stocks: 2, up: 0, down: 2, avgChangePct: -6.1, buildups: {}, oiChange: 100, symbols: ["TATASTEEL", "HINDALCO"] }] },
  stocks: [stock("POLICYBZR", 6.48, "Financial Services", "long_buildup", 5), stock("TATASTEEL", -8.43, "Metals & Mining", "short_buildup", 4),
    stock("HDFC", 5.9, "Financial Services", "short_covering", 2), stock("HINDALCO", -3.8, "Metals & Mining", "long_unwinding", 1)],
  lines: { times: ["10:00", "10:03", "11:03"], change: { POLICYBZR: [1, 3, 6.48], TATASTEEL: [-2, -5, -8.43], HDFC: [null, 2, 5.9], HINDALCO: [-1, null, -3.8] } },
};
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async (url: string) => json(200, String(url).includes("/api/lab/access") ? { access: true, reason: "granted", expiresAt: null, signals: false } : SNAP))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = (path = "/lab/flow") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><OrderFlowPage /></MemoryRouter></QueryClientProvider>);
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const point = (el: Element, pointerType = "mouse") => {   // jsdom's pointer events carry no pointerType, so it is set on the event itself
  const e = new MouseEvent("pointermove", { bubbles: true, clientX: 100, clientY: 100 });
  Object.defineProperty(e, "pointerType", { value: pointerType });
  return fireEvent(el, e);
};
const pop = () => screen.queryByRole("tooltip");

describe("Order Flow: hover detail cards on Market depth", () => {
  it("a stock card shows the full detail of its stock and leans toward the pointer; leaving hides it", async () => {
    wrap(); await settle();
    const card = screen.getByRole("article", { name: "POLICYBZR" });
    point(card);
    const t = pop()!;
    expect(t).toBeTruthy();
    expect(within(t).getByText("POLICYBZR")).toBeTruthy();
    for (const label of ["Rank", "OI", "OI change", "VWAP", "S1 / S2", "R1 / R2", "Zone", "Day range", "Facts", "Lot"]) expect(within(t).getByText(label)).toBeTruthy();
    expect(within(t).getByText("96 / 92")).toBeTruthy();                          // S1 / S2 of the pivots
    expect(within(t).getByText("104 / 108")).toBeTruthy();                        // R1 / R2
    expect(within(t).getByText("Between R1 and R2")).toBeTruthy();
    expect(within(t).getByText(/5 of 5/)).toBeTruthy();
    expect(card.className).toMatch(/oflow-3d/);
    fireEvent.pointerLeave(card);
    expect(pop()).toBeNull();
  });
  it("a touch never opens a card (tapping keeps its own behaviour)", async () => {
    wrap(); await settle();
    point(screen.getByRole("article", { name: "POLICYBZR" }), "touch");
    expect(pop()).toBeNull();
  });
  it("the curve, a band, a build-up tile and a sector each show their own detail", async () => {
    wrap(); await settle();
    point(screen.getByRole("img", { name: /Change of 4 F&O stocks/ }));
    expect(within(pop()!).getByText("Facts")).toBeTruthy();
    point(within(screen.getByRole("list", { name: "Stocks by band of the day's change" })).getAllByRole("listitem")[3]);
    expect(within(pop()!).getByText("Change above 5%")).toBeTruthy();
    expect(within(pop()!).getByText("POLICYBZR")).toBeTruthy();
    point(within(screen.getByRole("list", { name: "Futures build-up across F&O stocks" })).getAllByRole("listitem")[0]);
    expect(within(pop()!).getByText("Long build-up")).toBeTruthy();
    point(screen.getByRole("button", { name: /^Metals & Mining: average/ }).closest("li")!);
    expect(within(pop()!).getByText("Metals & Mining")).toBeTruthy();
    expect(within(pop()!).getByText("2 falling")).toBeTruthy();
  });
  it("the curve has a % axis and the falling | rising label where it crosses zero", async () => {
    wrap(); await settle();
    expect(document.querySelectorAll(".oflow-yaxis span").length).toBeGreaterThanOrEqual(3);
    expect(document.querySelector(".oflow-cross-lbl")!.textContent).toBe("← 2 falling2 rising →");
  });
});

describe("Order Flow: hover detail cards on the Flow board", () => {
  it("a line, a sector box, a build-up box and a direction bar each show their own detail", async () => {
    wrap("/lab/flow?view=board"); await settle();
    point(document.querySelectorAll(".oflow-lines path")[0]);
    expect(within(pop()!).getByText("Facts")).toBeTruthy();
    expect(within(pop()!).getByText(/^#1 of 2 (rising|falling)$/)).toBeTruthy();   // its rank among the stocks moving its way
    point(screen.getByRole("button", { name: "Metals & Mining: 0 rising, 2 falling" }));
    expect(within(pop()!).getByText("2 F&O stocks")).toBeTruthy();
    point(screen.getByRole("button", { name: "Long build-up: 1 stocks" }));
    expect(within(pop()!).getByText("Long build-up")).toBeTruthy();
    point(screen.getByRole("button", { name: "Rising: 2 stocks" }));
    expect(within(pop()!).getByText("Rising")).toBeTruthy();
  });
  it("keeps one path per stock, with a % grid, the rising and falling counts, and a box for every stock that moved", async () => {
    wrap("/lab/flow?view=board"); await settle();
    expect(document.querySelectorAll(".oflow-lines path").length).toBe(4);
    expect(document.querySelectorAll(".oflow-gridg text").length).toBeGreaterThanOrEqual(2);
    expect([...document.querySelectorAll(".oflow-tlbl-t")].map((t) => t.textContent)).toEqual(["2 rising", "2 falling"]);
    expect(document.querySelectorAll(".oflow-tile").length).toBe(4);
    expect(document.querySelectorAll(".oflow-tile.big").length).toBe(4);         // two a side: both are among the three largest moves
  });
  it("the layout gives the % ticks of the lines area", () => {
    const b = layout(SNAP.stocks as never, SNAP.lines, ["Financial Services", "Metals & Mining"]);
    expect(b.ticks.map((t) => t.label)).toEqual(["−8%", "−4%", "0%", "+4%"]);
    expect(b.lineX[0]).toBeLessThan(b.lineX[1]);
  });
});

describe("Order Flow look: the stylesheet", () => {
  const css = readFileSync("src/styles/orderflow.css", "utf8");
  it("the pop-up is opaque (the site's overlay surface) and never takes the pointer", () => {
    const rule = css.match(/\.oflow-pop \{([^}]*)\}/)![1];
    expect(rule).toMatch(/background: var\(--ov-surface\)/);
    expect(rule).toMatch(/pointer-events: none/);
  });
  it("cards lean with --rx/--ry, and every motion stops for reduced motion", () => {
    expect(css).toMatch(/transform: perspective\(900px\) rotateX\(var\(--rx, 0deg\)\) rotateY\(var\(--ry, 0deg\)\)/);
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.oflow \.oflow-3d, \.oflow \.oflow-card:hover \{ transform: none; transition: none; \}/);
    expect(reduced).toMatch(/\.oflow-draw, \.oflow-lines path, \.oflow-fade, \.oflow-pop \{ animation: none; stroke-dashoffset: 0; \}/);
  });
});
