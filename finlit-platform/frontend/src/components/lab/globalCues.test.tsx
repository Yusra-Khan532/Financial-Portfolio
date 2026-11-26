// @vitest-environment jsdom
// Trading Lab > Order Flow > Global cues: international ETFs on NSE and India VIX live; US yields, dollar, currencies and crude daily; a hover
// card on every tile and every point of its line; facts only, never an index level.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer } from "./FlowTips";
import { GlobalCues, changeText, cuesLine, valueText, type Cue, type GlobalCuesAnswer } from "./GlobalCues";

const spark = (a: number, b: number): [string, number][] => [["2026-11-20", a], ["2026-11-21", (a + b) / 2], ["2026-11-24", b]];
const c = (o: Partial<Cue>): Cue => ({ key: "k", label: "L", unit: "index", group: "fx", what: "What it is.", source: "Federal Reserve (H.10)", sourceUrl: "u",
  value: 1, prev: 1, change: 0, changePct: 0, date: "2026-11-24", prevDate: "2026-11-21", ...o });
const A: GlobalCuesAnswer = { asOf: "2026-11-26T18:00:00+05:30", notes: [], groups: [
  { key: "etf", name: "Global markets on NSE", items: [c({ key: "mon100", symbol: "MON100", label: "Nasdaq 100 ETF", unit: "₹", group: "etf", value: 231.5, prev: 229, change: 2.5, changePct: 1.09, live: true, dayLow: 229, dayHigh: 232, asOf: "2026-11-26T15:29:00+05:30", source: "NSE via Dhan" })] },
  { key: "rates", name: "US interest rates", items: [c({ key: "us10y", label: "US 10-year Treasury yield", unit: "%", group: "rates", value: 4.33, prev: 4.41, change: -0.08, changePct: null, yearLow: 3.9, yearHigh: 4.8, spark: spark(4.41, 4.33), source: "Federal Reserve (H.15)" })] },
  { key: "fx", name: "Dollar and currencies", items: [c({ key: "dxy", label: "US dollar index (broad)", value: 121.4, prev: 121.16, change: 0.24, changePct: 0.2, yearLow: 118, yearHigh: 128, spark: spark(121.16, 121.4) })] },
  { key: "oil", name: "Crude oil", items: [c({ key: "brent", label: "Brent crude", unit: "US$/bbl", group: "oil", value: 91.8, prev: 91.2, change: 0.6, changePct: 0.66, spark: spark(91.2, 91.8), source: "U.S. EIA" })] },
  { key: "india", name: "India", items: [c({ key: "indiavix", label: "India VIX", group: "india", value: 13.2, prev: 13.6, change: -0.4, changePct: -2.94, live: true, source: "NSE via Dhan" })] },
] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const urls: string[] = [];
beforeEach(() => { urls.length = 0; vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(String(u)); return json(A); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TipLayer><GlobalCues /></TipLayer></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const point = (el: Element, x = 10) => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" }); fireEvent(el, e); };

describe("Global cues, the words", () => {
  it("writes a rate's change in points and a price's in per cent", () => {
    expect(changeText(A.groups[1].items[0])).toBe("−0.08 pts");
    expect(changeText(A.groups[2].items[0])).toBe("+0.20%");
    expect(valueText(A.groups[1].items[0])).toBe("4.33%"); expect(valueText(A.groups[0].items[0])).toBe("₹231.50");
    expect(changeText(c({ change: null }))).toBe("—");
  });
  it("says the day in one line of facts", () => {
    expect(cuesLine(A)).toBe("US 10-year 4.33% (−0.08 pts) · dollar index 121.4 (+0.20%) · Brent $91.80 (+0.66%) · Nasdaq 100 ETF ₹231.50 (+1.09%) · India VIX 13.20 (−2.94%)");
  });
});

describe("Global cues, the tab", () => {
  it("reads the Lab's own route and shows every group and tile", async () => {
    wrap(); await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/global"))).toBe(true);
    for (const g of ["Global markets on NSE", "US interest rates", "Dollar and currencies", "Crude oil", "India"]) expect(screen.getByRole("region", { name: g })).toBeTruthy();
    expect(document.querySelectorAll(".gcue")).toHaveLength(5);
    expect(document.querySelectorAll(".gcue-live")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Markets today" }).getAttribute("href")).toBe("/markets");
  });
  it("pointing at a tile shows what it is, where it comes from and its range", async () => {
    wrap(); await settle();
    point(screen.getByRole("article", { name: /US 10-year Treasury yield/ }));
    const pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("−0.08 pts")).toBeTruthy(); expect(within(pop).getByText("4.80%")).toBeTruthy();
    expect(pop.textContent).toContain("Source: Federal Reserve (H.15).");
  });
  it("pointing along a line shows that day's value", async () => {
    wrap(); await settle();
    const svg = document.querySelector(".gcue-spark")!;
    point(svg, 0);
    expect(within(screen.getByRole("tooltip")).getByText("20 Nov 2026")).toBeTruthy();
  });
  it("never shows an index level or tells anyone what to do", async () => {
    wrap(); await settle();
    const t = (document.querySelector(".gcues")?.textContent ?? "").toLowerCase();
    for (const w of ["buy", "sell", "bullish", "bearish", "target", "outlook positive"]) expect(t).not.toContain(w);
  });
});
