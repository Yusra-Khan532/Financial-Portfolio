// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const added: string[] = [], opts: Record<string, unknown>[] = [], lines: string[] = [];
let withOHL = true;
vi.mock("lightweight-charts", () => {
  const mk = () => ({ setData: vi.fn(), createPriceLine: vi.fn(), attachPrimitive: vi.fn(), applyOptions: vi.fn(), priceToCoordinate: vi.fn(), coordinateToPrice: vi.fn() });
  return {
    CandlestickSeries: "candles", BarSeries: "bars", HistogramSeries: "volume", LineSeries: "line", ColorType: { Solid: "solid" }, CrosshairMode: { Normal: 0 }, LineStyle: { Dashed: 2 }, PriceScaleMode: { Normal: 0, Logarithmic: 1, Percentage: 2 }, createSeriesMarkers: vi.fn(),
    createChart: (_el: unknown, o: Record<string, unknown>) => { opts.push(o); return { addSeries: (k: string, so?: { color?: string }) => { added.push(k); if (so?.color) lines.push(so.color); return mk(); }, panes: () => [{ setStretchFactor: vi.fn() }, { setStretchFactor: vi.fn() }], priceScale: () => ({ applyOptions: vi.fn() }), timeScale: () => ({ fitContent: vi.fn(), setVisibleLogicalRange: vi.fn(), timeToCoordinate: vi.fn() }), subscribeCrosshairMove: vi.fn(), subscribeClick: vi.fn(), applyOptions: vi.fn(), remove: vi.fn() }; },
  };
});
vi.mock("../../lib/ui", () => ({ useThemeKey: () => "light" }));
vi.mock("../../lib/api", () => ({
  apiGet: () => Promise.reject(new Error("offline")),
  useSummary: () => sumRes,
  useSection: () => peersRes,
  usePrice: (_s: string, range: string) => priceFor(range),
}));
const sumRes = ({ data: { score: { overall: 71.4, band: { key: "healthy", label: "Healthy" }, pillars: [{ key: "q", label: "Quality", score: 80, band: { key: "strong", label: "Strong" } }] } } });
const peersRes = { data: { symbols: ["BBB", "CCC"] } };
const cache = new Map<string, unknown>();
function priceFor(range: string) {
  const key = range + withOHL; if (cache.has(key)) return cache.get(key);
  const r = ({ isLoading: false, isError: false, refetch: vi.fn(), data: { range, grain: range === "5Y" ? "weekly" : "daily", series: {
    t: ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"], ...(withOHL ? { o: [10, 11, 12, 13, 14], h: [12, 13, 14, 15, 16], l: [9, 10, 11, 12, 13] } : {}), c: [11, 12, 13, 14, 15], v: [100, 200, 300, 400, 500],
    ema9: [11, 11, 12, 13, 14], ema20: [10, 10, 11, 12, 13], ema50: [null, 11, 12, 12, 13], ema200: [null, null, 11, 11, 12] } } }); cache.set(key, r); return r;
}
import { ChartPanel, defaultIndicators, toWeekly } from "./ChartPanel";

const show = (screenId?: string, extra = {}) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ChartPanel row={{ symbol: "AAA", name: "Alpha Ltd", sector: "IT", screen: screenId, ...extra }} onClose={vi.fn()} onStep={vi.fn()} /></MemoryRouter></QueryClientProvider>);
afterEach(cleanup);
beforeEach(() => { added.length = 0; opts.length = 0; lines.length = 0; withOHL = true; sessionStorage.clear(); localStorage.clear(); });

describe("ChartPanel", () => {
  it("draws candles, volume and the 50 and 200 day lines by default, switches range, and closes", () => {
    const onClose = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ChartPanel row={{ symbol: "AAA", name: "Alpha Ltd", sector: "IT" }} onClose={onClose} /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByText("Alpha Ltd")).toBeTruthy();
    expect(added).toEqual(expect.arrayContaining(["candles", "volume", "line"]));
    expect(lines).toEqual(expect.arrayContaining(["#f59e0b", "#6366f1"]));
    fireEvent.click(screen.getByRole("button", { name: "1Y" }));
    expect(screen.getByRole("button", { name: "1Y" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Close chart" }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText(/Charts by TradingView/)).toBeTruthy();
  });
  it("never draws a grid, and shows the score badge and the score tiles", () => {
    show();
    expect(opts[0].grid).toEqual({ vertLines: { visible: false }, horzLines: { visible: false } });
    expect(screen.getByText("FinLit IQ 71")).toBeTruthy();
    expect(screen.getByLabelText("FinLit IQ scores").textContent).toContain("Quality");
  });
  it("opens with the 9-day line for the 9 EMA screen and the 20-day line for the pulled-back breakout, remembering the reader's choice", () => {
    expect(defaultIndicators("setup-ema9-consolidation")).toMatchObject({ ema9: true, ema20: false, ema50: false, ema200: false });
    expect(defaultIndicators("basic-setup-breakout-pullback")).toMatchObject({ ema20: true, ema9: false, ema50: false });
    expect(defaultIndicators("top-rated")).toMatchObject({ ema50: true, ema200: true, ema9: false });
    show("setup-ema9-consolidation");
    expect(lines).toContain("#06b6d4"); expect(lines).not.toContain("#f59e0b");
    fireEvent.click(screen.getByRole("button", { name: /Indicators/ }));
    fireEvent.click(screen.getByLabelText(/EMA 50/));
    expect(JSON.parse(sessionStorage.getItem("fl.chart.ind") || "{}")).toMatchObject({ ema9: true, ema50: true });
  });
  it("draws a line, never dots, when a bar has no open, high or low", () => {
    withOHL = false; show();
    expect(added).not.toContain("candles");
    expect(screen.getByRole("button", { name: "Candles" }).hasAttribute("disabled")).toBe(true);
  });
  it("switches the price scale to percent when NIFTY 500 is compared", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /Compare/ }));
    fireEvent.click(screen.getByLabelText(/NIFTY 500/));
    expect(screen.getByRole("button", { name: "Log" }).hasAttribute("disabled")).toBe(true);
    expect((opts[opts.length - 1].rightPriceScale as { mode: number }).mode).toBe(2);
  });
  it("builds weekly candles from daily bars: first open, highest high, lowest low, last close, summed volume", () => {
    const e = { ema9: null, ema20: null, ema50: null, ema200: null };
    const w = toWeekly([{ t: "2026-11-02", o: 10, h: 12, l: 9, c: 11, v: 1, e }, { t: "2026-11-06", o: 11, h: 15, l: 8, c: 14, v: 2, e }, { t: "2026-11-09", o: 14, h: 16, l: 13, c: 15, v: 4, e }]);
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ t: "2026-11-06", o: 10, h: 15, l: 8, c: 14, v: 3 });
  });
  it("moves between companies with the arrow keys", () => {
    const onStep = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ChartPanel row={{ symbol: "AAA" }} onClose={vi.fn()} onStep={onStep} /></MemoryRouter></QueryClientProvider>);
    fireEvent.keyDown(window, { key: "ArrowDown" }); fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(onStep.mock.calls).toEqual([[1], [-1]]);
  });
});
