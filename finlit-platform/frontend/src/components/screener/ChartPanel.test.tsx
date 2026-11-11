// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const added: string[] = [];
vi.mock("lightweight-charts", () => {
  const series = () => ({ setData: vi.fn() });
  return {
    CandlestickSeries: "candles", HistogramSeries: "volume", LineSeries: "line", ColorType: { Solid: "solid" }, CrosshairMode: { Normal: 0 }, LineStyle: { Dashed: 2 }, createSeriesMarkers: vi.fn(),
    createChart: () => ({ addSeries: (k: string) => { added.push(k); return { ...series(), createPriceLine: vi.fn() }; }, priceScale: () => ({ applyOptions: vi.fn() }), timeScale: () => ({ fitContent: vi.fn() }), subscribeCrosshairMove: vi.fn(), remove: vi.fn() }),
  };
});
vi.mock("../../lib/api", () => ({
  apiGet: () => Promise.reject(new Error("offline")),
  usePrice: (_s: string, range: string) => ({ isLoading: false, isError: false, refetch: vi.fn(), data: { range, series: { t: ["2026-11-04", "2026-11-05", "2026-11-06"], o: [10, 11, 12], h: [12, 13, 14], l: [9, 10, 11], c: [11, 12, 13], v: [100, 200, 300], ema50: [null, 11, 12], ema200: [null, null, 11] } } }),
}));
import { ChartPanel } from "./ChartPanel";

describe("ChartPanel", () => {
  it("draws candles, volume and both averages, switches range, and closes", () => {
    const onClose = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ChartPanel row={{ symbol: "AAA", name: "Alpha Ltd", sector: "IT" }} onClose={onClose} /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByText("Alpha Ltd")).toBeTruthy();
    expect(added).toEqual(expect.arrayContaining(["candles", "volume", "line"]));
    fireEvent.click(screen.getByRole("button", { name: "1Y" }));
    expect(screen.getByRole("button", { name: "1Y" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Close chart" }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText(/Charts by TradingView/)).toBeTruthy();
  });
});
