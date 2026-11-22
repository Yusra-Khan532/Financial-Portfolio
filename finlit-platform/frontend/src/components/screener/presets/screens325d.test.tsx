// @vitest-environment jsdom
// Task #325 D1 (developer file 25, section 1 rows 1 to 4, section 5): the view switch, List + chart, the chart wall and the one prices call.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../ChartPanel", () => ({ ChartPanel: ({ row, inline }: { row: { name?: string; symbol: string }; inline?: boolean }) => <aside data-testid="panel" data-inline={String(!!inline)}>{row.name || row.symbol}</aside> }));
vi.mock("lightweight-charts", () => ({ createChart: () => ({ addSeries: () => ({ setData: () => undefined, createPriceLine: () => undefined }), timeScale: () => ({ fitContent: () => undefined }), remove: () => undefined }),
  CandlestickSeries: {}, LineSeries: {}, ColorType: { Solid: "solid" }, LineStyle: { Dashed: 1, Dotted: 2 } }));
vi.mock("../../../lib/ui", async (o) => ({ ...(await o<object>()), useThemeKey: () => "light" }));
vi.mock("../../CoLogo", () => ({ CoLogo: () => null }));
import { ListChart } from "./ListChart";
import { ChartCards } from "../ChartCards";
import { readScreenView, saveScreenView } from "../../../lib/presets";

afterEach(cleanup);
const rows = ["AAA", "BBB", "CCC"].map((s, i) => ({ symbol: s, name: s + " Ltd", sector: "IT", price: 100 + i, ret_1d: i - 1 }) as never);
const wrap = (el: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>);

describe("screen views (task #325 D1)", () => {
  it("the view choice is remembered; List + chart is the default", () => {
    localStorage.removeItem("finlit-screen-view");
    expect(readScreenView()).toBe("list");
    saveScreenView("charts"); expect(readScreenView()).toBe("charts");
    saveScreenView("table"); expect(readScreenView()).toBe("table");
  });
  it("List + chart: the list on the left, the picked company's chart inline beside it; picking a row changes the chart", () => {
    const onPick = vi.fn();
    wrap(<ListChart rows={rows} pick="BBB" onPick={onPick} toPanel={(r) => ({ symbol: (r as { symbol: string }).symbol, name: (r as { name: string }).name })} figure={null} />);
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByRole("option", { selected: true }).textContent).toContain("BBB");
    expect(screen.getByTestId("panel").textContent).toBe("BBB Ltd"); expect(screen.getByTestId("panel").dataset.inline).toBe("true");
    fireEvent.click(screen.getAllByRole("option")[2]); expect(onPick).toHaveBeenCalledWith("CCC");
  });
  it("the chart wall: 2, 3 or 4 a row, the card's figures, and 'Chart is being prepared' for a company with no prices", () => {
    const cards = rows.map((r) => ({ ...(r as object), symbol: (r as { symbol: string }).symbol, prism: 70, ret3m: 4.2, lt: "Uptrend", figure: ["From 52-week high", "−5.0%"] as [string, string] }));
    const { container } = wrap(<ChartCards rows={cards as never} perRow={4} loading={false} onOpen={() => undefined}
      series={{ AAA: { t: ["2026-11-19", "2026-11-20"], o: [1, 2], h: [2, 3], l: [1, 1], c: [2, 3] }, BBB: null }} />);
    expect(container.querySelector(".cc-grid")!.className).toContain("cc-cols-4");
    expect(container.querySelectorAll(".cc-card")).toHaveLength(3);
    expect(container.querySelector(".cc-fx")!.textContent).toBe("Prism703 months+4.2%Long termUptrendFrom 52-week high−5.0%");
    expect([...container.querySelectorAll(".cc-chart small")].map((s) => s.textContent)).toEqual(["Chart is being prepared", "Chart is being prepared"]);
  });
  it("one prices call per page, the switch in the screen header, and the chart button beside the company", () => {
    const sv = readFileSync(resolve(__dirname, "ScreenView.tsx"), "utf8"), lib = readFileSync(resolve(__dirname, "../../../lib/presets.ts"), "utf8");
    expect(lib).toContain("/api/screener/presets/${encodeURIComponent(id!)}/prices?range=");
    expect(sv).toContain('[["table", "Table"], ["list", "List + chart"], ["charts", "Charts"]]');
    expect(sv).toContain('<th scope="col" className="psx-a-left psx3-spk">3 months</th>');
    expect(sv).toContain("const CARDS = 12;");
  });
});
