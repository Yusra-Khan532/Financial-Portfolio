// @vitest-environment jsdom
// Trading Lab > Order Flow > Stock zones: 5-minute candles of one F&O stock with its order blocks, fair-value gaps and levels from
// /api/lab/zones/{symbol}, a card on every candle, zone and level, the nearest open zones, and facts only.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer } from "./FlowTips";
import { StockZones } from "./StockZones";
import { between, nearest, zonesLine, type Zone, type Zones } from "../../lib/zones";

const t = (d: string, i: number) => { const m = 9 * 60 + 15 + 5 * i; return `${d}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00+05:30`; };
const T = [...[0, 1, 2, 3].map((i) => t("2026-11-25", i)), ...[0, 1, 2, 3, 4, 5].map((i) => t("2026-11-26", i))];
const zone = (o: Partial<Zone>): Zone => ({ kind: "ob", side: "up", lo: 1400, hi: 1405, at: T[5], index: 5, status: "untested", touches: 0, moveAvg: 2.6, distancePct: -1.2, ...o });
const Z: Zones = {
  status: "ok", symbol: "RELIANCE", available: true, exchange: "NSE", source: "Dhan", asOf: "2026-11-26T11:00:00+05:30", stale: false, phase: "closed",
  session: "2026-11-26", previousSession: "2026-11-25", interval: 5, last: 1421.5, dayHigh: 1425, dayLow: 1398, changePct: 0.85, vsVwap: "above",
  openingRange: "above the opening range",
  candles: { t: T, o: [1400, 1402, 1401, 1403, 1404, 1401, 1406, 1410, 1415, 1419], h: [1404, 1405, 1404, 1406, 1408, 1405, 1411, 1416, 1420, 1425],
    l: [1398, 1400, 1399, 1401, 1402, 1398, 1404, 1409, 1413, 1417], c: [1402, 1401, 1403, 1404, 1403, 1405, 1410, 1415, 1419, 1421.5], v: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  vwap: [null, null, null, null, 1405, 1404.5, 1406, 1408, 1410, 1412],
  levels: [
    { key: "R1", label: "Pivot R1", price: 1430, group: "pivot", note: "A floor pivot from the previous session's high, low and close." },
    { key: "PDH", label: "Previous day high", price: 1406, group: "previous", note: "The highest price of 2026-11-25." },
    { key: "VWAP", label: "VWAP", price: 1412, group: "vwap", note: "The session's volume-weighted average price so far." },
    { key: "PDL", label: "Previous day low", price: 1398, group: "previous", note: "The lowest price of 2026-11-25." },
  ].sort((a, b) => b.price - a.price) as Zones["levels"],
  zones: [zone({}), zone({ kind: "fvg", lo: 1411, hi: 1413, index: 7, at: T[7], status: "open", moveAvg: null, distancePct: -0.6 }),
    zone({ kind: "ob", side: "down", lo: 1403, hi: 1406, index: 3, at: T[3], status: "broken", distancePct: -1.1 })],
};
// Liquidity map: put walls 1,400 / 1,380 (the second outside the drawn range: listed only), call walls 1,430 / 1,500
const WALLS = { status: "ok", symbol: "RELIANCE", expiry: "2026-12-30", asOf: "26 Nov 15:30", state: "fresh", spot: 1421.5, pcrOi: 0.91, maxPain: 1420,
  put: [{ rank: 1, strike: 1400, oi: 1_240_000, oiChange: 85_000, oiChangePct: 7.4, distancePct: -1.51 }, { rank: 2, strike: 1300, oi: 900_000, oiChange: -20_000, oiChangePct: -2.2, distancePct: -8.55 }],
  call: [{ rank: 1, strike: 1430, oi: 1_610_000, oiChange: 120_000, oiChangePct: 8.0, distancePct: 0.6 }, { rank: 2, strike: 1500, oi: 700_000, oiChange: null, oiChangePct: null, distancePct: 5.52 }] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const urls: string[] = [];
beforeEach(() => { urls.length = 0; vi.stubGlobal("fetch", vi.fn(async (url: string) => { urls.push(String(url));
  if (String(url).includes("/underlyings")) return json({ indices: [], stocks: [{ key: "TATAMOTORS", name: "Tata Motors", securityId: 1, lotSize: 1 }, { key: "NOPE", name: "Delisted Ltd", securityId: 2, lotSize: 1 }], connected: true });
  if (String(url).endsWith("/walls")) return String(url).includes("/NOPE/") ? json({ status: "not_fno", symbol: "NOPE", detail: "NOPE has no listed options, so it has no option walls." }, 404)
    : json(WALLS);
  if (String(url).includes("/NOPE")) return json({ status: "not_found", symbol: "NOPE", detail: "We could not find that company." }, 404);
  return json({ ...Z, symbol: String(url).split("/").pop() }); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TipLayer><StockZones /></TipLayer></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const point = (el: Element) => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" }); fireEvent(el, e); };

describe("Stock zones, the words", () => {
  it("puts the stock's day in one plain line", () => {
    expect(zonesLine(Z)).toBe("RELIANCE at ₹1,421.50 (+0.85%) · above VWAP · above the opening range · between VWAP ₹1,412.00 and Pivot R1 ₹1,430.00");
  });
  it("names the nearest level above and below, and leaves filled or broken zones out of the open list", () => {
    expect(between(Z.levels, 1421.5)).toMatchObject({ above: { key: "R1" }, below: { key: "VWAP" } });
    expect(nearest(Z.zones).map((z) => z.kind + z.index)).toEqual(["fvg7", "ob5"]);
  });
});

describe("Stock zones, the tab", () => {
  it("reads the Lab's zones route for the chosen stock and draws every candle and zone", async () => {
    wrap(); await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/zones/RELIANCE"))).toBe(true);
    expect(document.querySelectorAll(".zon-k")).toHaveLength(10);
    expect(document.querySelectorAll(".zon-band")).toHaveLength(3);
    expect(document.querySelector(".zon-band.broken")).toBeTruthy();
    expect(screen.getByRole("img", { name: "RELIANCE: 10 candles of 5 minutes, 3 zones, 4 levels" })).toBeTruthy();
  });
  it("pointing at a candle, a zone or a level shows its detail", async () => {
    wrap(); await settle();
    point(document.querySelectorAll(".zon-k")[9]);
    let pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("RELIANCE 09:40")).toBeTruthy(); expect(within(pop).getByText("₹1,425.00")).toBeTruthy();
    point(document.querySelectorAll(".zon-band")[0]);
    pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("Order block left by a rise")).toBeTruthy(); expect(within(pop).getByText("2.6× avg candle")).toBeTruthy();
    point(document.querySelector(".zon-lvl.prev") as Element);
    expect(within(screen.getByRole("tooltip")).getByText("Previous day high")).toBeTruthy();
  });
  it("switches zone kinds off and on", async () => {
    wrap(); await settle();
    fireEvent.click(screen.getByRole("button", { name: "Fair-value gaps" }));
    expect(document.querySelectorAll(".zon-band.fvg")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Fair-value gaps" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Levels" }));
    expect(document.querySelectorAll(".zon-lvl")).toHaveLength(0);
  });
  it("finds any F&O stock and switches to it", async () => {
    wrap(); await settle();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find an F&O stock" }), { target: { value: "tata" } });
    await settle();
    fireEvent.click(within(screen.getByRole("list", { name: "Matching stocks" })).getByRole("button"));
    await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/zones/TATAMOTORS"))).toBe(true);
  });
  it("says why when a stock cannot be read", async () => {
    wrap(); await settle();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find an F&O stock" }), { target: { value: "delisted" } });
    await settle();
    fireEvent.click(within(screen.getByRole("list", { name: "Matching stocks" })).getByRole("button"));
    await settle();
    expect(screen.getByRole("alert").textContent).toBe("We could not find that company.");
    expect(document.querySelector(".zon-chart")).toBeNull();
  });
  it("never tells anyone to trade", async () => {
    wrap(); await settle();
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const w of ["buy", "sell", "target", "stop loss", "entry", "bullish", "bearish", "best"]) expect(text).not.toContain(w);
  });
});

describe("Stock zones, the Liquidity map (option walls)", () => {
  it("draws the walls near the price on the chart, lists every wall, and shows each one's facts", async () => {
    urls.length = 0; wrap(); await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/zones/RELIANCE/walls"))).toBe(true);
    expect([...document.querySelectorAll(".zon-wall text")].map((x) => x.textContent)).toEqual(["Put wall 1,400 · 12.40 L", "Call wall 1,430 · 16.10 L"]);
    const list = screen.getByRole("list", { name: "Option walls" });
    expect(list.querySelectorAll("li")).toHaveLength(4);
    expect(list.textContent).toMatch(/Put 1.*1,400 · 12\.40 L.*−1\.51%.*Put 2.*1,300.*Call 1.*1,430.*\+0\.60%.*Call 2.*1,500/);
    expect(screen.getByText(/Nearest expiry 2026-12-30 · PCR 0\.91/)).toBeTruthy();
    point(document.querySelector(".zon-wall.call")!);
    expect(screen.getByRole("tooltip").textContent).toMatch(/Call wall 1 · 1,430.*Expiry 30 Dec.*16\.10 L.*\+1\.20 L.*\+0\.60%.*not a level the price is bound to respect/);
    fireEvent.click(screen.getByRole("button", { name: "Option walls" }));
    expect(document.querySelectorAll(".zon-wall")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/\b(support|resistance|buy|sell|target)\b/i);
  });
  it("says why when a stock has no options, and the candles still show", async () => {
    wrap(); await settle();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find an F&O stock" }), { target: { value: "TATA" } });
    fireEvent.click(screen.getByRole("button", { name: /TATAMOTORS/ })); await settle();
    expect(document.querySelectorAll(".zon-k")).toHaveLength(10);
  });
});
