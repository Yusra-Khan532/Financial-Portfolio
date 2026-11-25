// @vitest-environment jsdom
// Task #394 (developer file 37, sections 4 and 5): the chart panel of the ready-made lists. One test (or more) per item that code can show.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const seriesOpts: { kind: string; o: Record<string, unknown> }[] = [], priceLines: Record<string, unknown>[] = [], markerCalls: unknown[][] = [];
vi.mock("lightweight-charts", () => {
  const mk = () => ({ setData: vi.fn(), createPriceLine: (o: Record<string, unknown>) => { priceLines.push(o); }, attachPrimitive: vi.fn(), applyOptions: vi.fn(), priceToCoordinate: vi.fn(), coordinateToPrice: vi.fn() });
  return {
    CandlestickSeries: "candles", BarSeries: "bars", HistogramSeries: "volume", LineSeries: "line", ColorType: { Solid: "solid" }, CrosshairMode: { Normal: 0 }, LineStyle: { Dashed: 2 }, PriceScaleMode: { Normal: 0, Logarithmic: 1, Percentage: 2 },
    createSeriesMarkers: (_s: unknown, m: unknown[]) => { markerCalls.push(m); },
    createChart: () => ({ addSeries: (k: string, o: Record<string, unknown> = {}) => { seriesOpts.push({ kind: k, o }); return mk(); }, panes: () => [{ setStretchFactor: vi.fn() }, { setStretchFactor: vi.fn() }], priceScale: () => ({ applyOptions: vi.fn() }),
      timeScale: () => ({ fitContent: vi.fn(), setVisibleLogicalRange: vi.fn(), timeToCoordinate: vi.fn() }), subscribeCrosshairMove: vi.fn(), subscribeClick: vi.fn(), applyOptions: vi.fn(), remove: vi.fn() }),
  };
});
vi.mock("../../lib/ui", () => ({ useThemeKey: () => "light", useUI: () => ({ has: (t: string) => t === "silver" }) }));
let events: { date: string; type: string; title: string }[] = [];
let priceState: (range: string, grain?: string) => unknown = () => null;
vi.mock("../../lib/api", async (orig) => {
  const real = await orig<typeof import("../../lib/api")>();
  return {
    samePricePlaceholder: real.samePricePlaceholder,
    apiGet: (url: string) => (/\/events$/.test(url) ? Promise.resolve({ actions: events }) : Promise.reject(new Error("offline"))),
    useSummary: () => ({ data: null }),
    useSection: () => ({ data: { symbols: [] } }),
    usePrice: (_s: string, range: string, enabled = true, grain?: string) => (enabled ? priceState(range, grain) : { isLoading: false, isError: false, data: undefined, refetch: vi.fn() }),
  };
});

import { ChartPanel, type PanelRow } from "./ChartPanel";
import { ListChart } from "./presets/ListChart";
import { samePricePlaceholder, type PriceRange } from "../../lib/api";
import { axisPrice, behindNote, changeTo, chartToMark, datedWeeks, factValue, factsHeading, isPartWeek, legendHead, levelTitle, lineLabel, listClose, rupees, singleMark, volumeLine, type Bar } from "./chartPanelParts";

/** Daily candles from 1 Jun to `end` (weekdays), close rising by 1 from 100, volume 1,000 (the last day 2,000). */
function dailyTo(end: string) {
  const t: string[] = []; const d = new Date("2026-06-01T00:00:00Z");
  while (d.toISOString().slice(0, 10) <= end) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) t.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  const c = t.map((_, i) => 100 + i);
  return { t, o: c.map((x) => x - 0.5), h: c.map((x) => x + 1), l: c.map((x) => x - 1), c, v: t.map((_, i) => (i === t.length - 1 ? 2000 : 1000)), ema9: c, ema20: c, ema50: c, ema200: c };
}
const ok = (range: string, series: unknown, extra: Record<string, unknown> = {}) => ({ isLoading: false, isError: false, refetch: vi.fn(), data: { meta: { symbol: "AAA" }, range, grain: "daily", series, ...extra } });
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
const panel = (row: Partial<PanelRow> = {}) => wrap(<ChartPanel row={{ symbol: "AAA", name: "Alpha Ltd", ...row }} onClose={vi.fn()} onStep={vi.fn()} inline />);
const css = readFileSync(join(process.cwd(), "src/styles/chartpanel.css"), "utf8");

afterEach(cleanup);
beforeEach(() => {
  seriesOpts.length = 0; priceLines.length = 0; markerCalls.length = 0; events = []; sessionStorage.clear(); localStorage.clear();
  const s = dailyTo("2026-11-23"); priceState = (range) => ok(range, s);
});

describe("C3: rupees with Indian commas, and the price axis", () => {
  it("formats the figures box: 'Rs 11353.00' reads ₹11,353.00; a (Rs) label keeps its unit and gets commas", () => {
    expect(rupees(11353)).toBe("₹11,353.00");
    expect(rupees(123456.5)).toBe("₹1,23,456.50");
    expect(factValue("Closed above", "Rs 11353.00")).toBe("₹11,353.00");
    expect(factValue("Level", "₹2038.6")).toBe("₹2,038.60");
    expect(factValue("Level (Rs)", "123,456.00")).toBe("1,23,456.00");
    expect(factValue("Level (Rs)", "248.85")).toBe("248.85");
    expect(factValue("Now above the level", "3.3%")).toBe("3.3%");
    expect(factValue("When", "1 session ago")).toBe("1 session ago");
  });
  it("the price axis has commas and no decimals from ₹1,000 up", () => {
    expect(axisPrice(14000)).toBe("14,000");
    expect(axisPrice(11649.4)).toBe("11,649");
    expect(axisPrice(248.85)).toBe("248.85");
    expect(axisPrice(150000)).toBe("1,50,000");
  });
  it("only the PRICE series carries the custom format; the volume keeps its own", () => {
    panel();
    const price = seriesOpts.find((x) => x.kind === "candles")!, vol = seriesOpts.find((x) => x.kind === "volume")!;
    expect(price.o.priceFormat).toMatchObject({ type: "custom" });
    expect((price.o.priceFormat as { formatter: (p: number) => string }).formatter(11649)).toBe("11,649");
    expect(vol.o.priceFormat).toEqual({ type: "volume" });
  });
  it("the figures box shows ₹ with commas and leaves the server's labels as they are", () => {
    panel({ facts: [["Closed above", "Rs 11353.00"], ["When", "1 session ago"]] });
    const box = document.querySelector(".cp-fbox")!;
    expect(box.textContent).toContain("Closed above₹11,353.00");
    expect(box.textContent).toContain("When1 session ago");
  });
});

describe("C4: the level line's name, and the key for the event marks", () => {
  it("titles the level line from draw.levelLabel; a drawing without one keeps Pivot", () => {
    expect(levelTitle({ levelLabel: "Level" })).toBe("Level");
    expect(levelTitle({})).toBe("Pivot");
    panel({ draw: { level: 11353, levelLabel: "Level" } });
    expect(priceLines.map((p) => p.title)).toContain("Level");
    expect(priceLines.map((p) => p.title)).not.toContain("Pivot");
  });
  it("shows the key only when a corporate-action mark is on the chart, with the letters drawn", async () => {
    panel();
    expect(document.querySelector(".cp-key")).toBeNull();
    cleanup();
    events = [{ date: "2026-08-28", type: "final_dividend", title: "Final dividend · ₹3 per share" }];
    panel();
    await waitFor(() => expect(document.querySelector(".cp-key")).not.toBeNull());
    expect(document.querySelector(".cp-key")!.textContent).toBe("DDividend");
  });
});

describe("C2: a single pattern mark is drawn", () => {
  const bars = [{ t: "2026-11-18" }, { t: "2026-11-19" }, { t: "2026-11-20" }];
  it("marks the close above over its candle, and a single base low under it", () => {
    expect(singleMark([{ date: "2026-11-19", price: 11723, kind: "Close above" }], bars, false, { level: "g", base: "b" }))
      .toEqual({ time: "2026-11-19", position: "aboveBar", shape: "arrowDown", color: "g", text: "Closed above · 19 Nov" });
    expect(singleMark([{ date: "2026-11-18", price: 1797.8, kind: "Base low" }], bars, false, { level: "g", base: "b" }))
      .toMatchObject({ position: "belowBar", shape: "arrowUp", color: "b", text: "Base low ₹1,797.80" });
    expect(singleMark([{ date: "2026-11-18", price: 1797.8, kind: "Base low" }], bars, true, { level: "g", base: "b" })!.text).toBe("Base low");
    expect(singleMark([{ date: "2026-10-01", price: 1, kind: "Base low" }], bars, false, { level: "g", base: "b" })).toBeNull();   // before the first candle shown
    expect(singleMark([{ date: "2026-11-18", price: 1, kind: "a" }, { date: "2026-11-19", price: 2, kind: "b" }], bars, false, { level: "g", base: "b" })).toBeNull();
  });
  it("the panel draws it (today one swing was dropped: only two or more were drawn)", () => {
    panel({ draw: { level: 11353, levelLabel: "Level", swings: [{ date: "2026-11-19", price: 11723, kind: "Close above" }] } });
    const all = markerCalls.flat() as { text: string }[];
    expect(all.map((m) => m.text)).toContain("Closed above · 19 Nov");
  });
});

describe("C1 and F6: the list's close beside the chart, and a chart that ends before the list", () => {
  it("uses the row's official close of the list day, never a weekend or a day the chart passes over", () => {
    const d = ["2026-11-19", "2026-11-20", "2026-11-23"];
    expect(listClose({ priceOn: 11649, listDay: "2026-11-23" }, d)).toEqual({ price: 11649, day: "2026-11-23" });
    expect(listClose({ priceOn: 11649, listDay: "2026-11-22" }, d)).toBeNull();              // a Sunday
    expect(listClose({ priceOn: 11649, listDay: "2026-11-21" }, ["2026-11-20", "2026-11-23"])).toBeNull();
    expect(listClose({ priceOn: 2039, listDay: "2026-11-23" }, ["2026-11-12", "2026-11-13"])).toBeNull();   // chart behind: the list's day is not proven a session, so no day is claimed
    expect(listClose({ priceOn: 2031, listDay: "2026-11-24" }, ["2026-11-20", "2026-11-23"])).toBeNull();   // 24 Nov 2026, an exchange holiday: never "24 Nov close"
    expect(listClose({ priceOn: 11000, listDay: "2026-11-20" }, d)).toBeNull();               // a past list: the chart runs past it
    expect(listClose({ priceOn: null, listDay: "2026-11-23" }, d)).toBeNull();               // only the live price: as before
  });
  it("works out 1M and 3M to that close", () => {
    expect(changeTo(["2026-10-22", "2026-10-23", "2026-11-23"], [100, 110, 121], "2026-11-23", 121, 1)).toBeCloseTo(10, 6);
    expect(changeTo(["2026-10-22"], [100], "2026-11-23", 121, 3)).toBeNull();
  });
  it("the header reads '₹11,649.00 23 Nov close' from price_on", () => {
    panel({ price: 11699.6, priceOn: 11649, listDay: "2026-11-23" });
    expect(document.querySelector(".cp-p")!.textContent).toMatch(/^₹11,649\.00 ?23 Nov close/);
  });
  it("with only the live price, the header keeps the chart's own close and its day", () => {
    panel({ price: 11699.6 });
    expect(document.querySelector(".cp-p .cp-asof")!.textContent).toBe("close of 23 Nov");
  });
  it("says it above the figures when the chart ends before the list's close", () => {
    expect(behindNote("2026-11-13", "2026-11-23", 2039)).toEqual(["This chart ends 13 Nov.", "The list beside it is from a later close (₹2,039.00)."]);
    expect(behindNote("2026-11-23", "2026-11-24", 2031)?.[1]).not.toMatch(/24 Nov/);   // a holiday list day is never named
    expect(behindNote("2026-11-23", "2026-11-23", 2039)).toBeNull();
    const s = dailyTo("2026-11-13"); priceState = (range) => ok(range, s);
    panel({ priceOn: 2039, listDay: "2026-11-23", facts: [["Level (Rs)", "2038.60"]] });
    const n = document.querySelector(".cp-note")!;
    expect(n.textContent).toBe("This chart ends 13 Nov. The list beside it is from a later close (₹2,039.00).");
    expect(n.nextElementSibling!.className).toBe("cp-fbox");
  });
  it("shows no note when the chart reaches the list's day", () => {
    panel({ priceOn: 11649, listDay: "2026-11-23" });
    expect(document.querySelector(".cp-note")).toBeNull();
  });
});

describe("C5, W3, W4, W5: the legend", () => {
  const mkBars = (n: number, v = 1000): Bar[] => Array.from({ length: n }, (_, i) => ({ t: `d${i}`, o: 1, h: 1, l: 1, c: 1, v: i === n - 1 ? 2 * v : v, e: {} }));
  it("daily volume against the 50 sessions before it", () => {
    expect(volumeLine(mkBars(60), 59, false, "2026-11-25")).toBe("Volume 2,000 · 2.0× its 50-day average");
    expect(volumeLine(mkBars(30), 29, false, "2026-11-25")).toBe("Volume 2,000");
  });
  it("averages named by unit", () => {
    expect(lineLabel("ema", 50, false)).toBe("50-day EMA");
    expect(lineLabel("ema", 200, true)).toBe("200-day EMA");
    expect(lineLabel("sma", 50, true)).toBe("50-week SMA");
    expect(lineLabel("sma", 20, false)).toBe("20-day SMA");
  });
  it("dates a week by its last regular trading day: the Diwali week is 6 Nov, not the Sunday Muhurat session", () => {
    const e = {}; const w = datedWeeks([{ t: "2026-10-30", o: 1, h: 1, l: 1, c: 1, v: 1, e }, { t: "2026-11-08", o: 1, h: 1, l: 1, c: 1, v: 1, e }],
      ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-08"]);
    expect(w.map((b) => b.t)).toEqual(["2026-10-30", "2026-11-06"]);
    expect(w[1].n).toBe(6);
    expect(legendHead(w, 1, true, "2026-11-25", (v) => String(v))).toMatch(/^Week to 6 Nov · O 1/);
  });
  it("the week in progress: '1 session so far', its volume so far and no ratio; the average uses full weeks only", () => {
    const e = {};
    const weeks: Bar[] = Array.from({ length: 21 }, (_, i) => ({ t: `2026-${String(7 + Math.floor(i / 4)).padStart(2, "0")}-${String(3 + (i % 4) * 7).padStart(2, "0")}`, o: 1, h: 1, l: 1, c: 1, v: 1000, e, n: 5 }));
    const last: Bar = { t: "2026-11-23", o: 250, h: 253.85, l: 241.05, c: 245.54, v: 305153, e, n: 1 };
    const all = [...weeks, last];
    expect(isPartWeek(last, true, "2026-11-25")).toBe(true);
    expect(isPartWeek(last, true, "2026-11-30")).toBe(false);     // the week is over
    expect(legendHead(all, all.length - 1, true, "2026-11-25", (v) => String(v))).toMatch(/^Week to 23 Nov · 1 session so far · O 250/);
    expect(volumeLine(all, all.length - 1, true, "2026-11-25")).toBe("Volume so far this week 3,05,153");
    const withShort = [...weeks.slice(0, 20), { ...weeks[20], v: 10, n: 2 }, { ...last, n: 5, v: 2000 }];   // a 2-session week stays out of the average
    expect(volumeLine(withShort, withShort.length - 1, true, "2026-11-30")).toBe("Volume that week 2,000 · 2.0× its average of the last 19 full weeks");
  });
  it("the panel's legend and menu use the new names", () => {
    panel();
    const leg = document.querySelector(".cp-leg")!.textContent!;
    expect(leg).toContain("23 Nov 2026 · O");
    expect(leg).toContain("50-day EMA");
    expect(leg).toMatch(/Volume 2,000 · 2\.0× its 50-day average/);
    fireEvent.click(screen.getByRole("button", { name: /Indicators/ }));
    expect(screen.getByLabelText(/50-day EMA/)).toBeTruthy();
    expect(screen.getByLabelText(/50-day SMA/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "W" }));     // the menu stays open
    expect(screen.getByLabelText(/50-week SMA/)).toBeTruthy();
    expect(screen.getByLabelText(/50-day EMA/)).toBeTruthy();
  });
});

describe("W2: 3Y and 5Y on weekly candles", () => {
  const weeklyS = { t: ["2026-11-13", "2026-11-20"], o: [1, 2], h: [2, 3], l: [1, 1], c: [2, 3], v: [1, 1], ema50: [1, 1], ema200: [1, 1] };
  it("says so under the buttons and keeps D off when the server has no daily candles for the range", () => {
    const d = dailyTo("2026-11-23");
    priceState = (range) => (range === "3Y" ? { ...ok(range, weeklyS), data: { ...ok(range, weeklyS).data, grain: "weekly" } } : ok(range, d));
    localStorage.setItem("fl.chart.v2", JSON.stringify({ range: "3Y" }));
    panel();
    expect(document.querySelector(".cp-wk")!.textContent).toBe("3Y and 5Y show weekly candles.");
    expect(screen.getByRole("button", { name: "D" }).hasAttribute("disabled")).toBe(true);
  });
  it("lets D ask for ?grain=daily when the weekly answer says dailyAvailable", () => {
    const d = dailyTo("2026-11-23"), asked: string[] = [];
    priceState = (range, grain) => { asked.push(`${range}:${grain ?? ""}`); return range === "3Y" && !grain ? { ...ok(range, weeklyS), data: { ...ok(range, weeklyS).data, grain: "weekly", dailyAvailable: true } } : ok(range, d); };
    localStorage.setItem("fl.chart.v2", JSON.stringify({ range: "3Y" }));
    panel();
    const D = screen.getByRole("button", { name: "D" });
    expect(D.hasAttribute("disabled")).toBe(false);
    fireEvent.click(D);
    expect(asked).toContain("3Y:daily");
    expect(screen.getByRole("button", { name: "D" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".cp-wk")).toBeNull();
  });
  it("shows no line on the daily ranges", () => {
    panel();
    expect(document.querySelector(".cp-wk")).toBeNull();
  });
});

describe("F7: stepping between companies", () => {
  it("keeps the previous answer only for the same company", () => {
    const prev = { meta: { symbol: "CRAFTSMAN" } } as PriceRange;
    expect(samePricePlaceholder("craftsman")(prev)).toBe(prev);
    expect(samePricePlaceholder("LALPATHLAB")(prev)).toBeUndefined();
    expect(samePricePlaceholder("LALPATHLAB")(undefined)).toBeUndefined();
  });
  it("a 202 answer shows that the chart is being prepared, not another company's candles", () => {
    priceState = () => ({ isLoading: true, isError: false, data: undefined, failureReason: { status: 202 }, refetch: vi.fn() });
    panel();
    expect(document.querySelector(".cp-m")!.textContent).toBe("Preparing this company's chart…");
  });
  it("the price hook passes the symbol check, not the previous data as it is", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/api.ts"), "utf8");
    expect(src).toMatch(/placeholderData: samePricePlaceholder\(s\)/);
  });
});

describe("C7: refit on resize", () => {
  it("fixes the left edge and refits when the chart's box changes width", () => {
    const src = readFileSync(join(process.cwd(), "src/components/screener/ChartPanel.tsx"), "utf8");
    expect(src).toMatch(/fixLeftEdge: true/);
    expect(src).toMatch(/new ResizeObserver\(/);
  });
});

describe("C8: the figures' heading", () => {
  it("carries the day when factsAsOf is sent, and none otherwise", () => {
    expect(factsHeading("2026-11-23")).toBe("What the chart shows · 23 Nov close");
    expect(factsHeading(null)).toBe("What the chart shows");
    panel({ facts: [["Level (Rs)", "248.85"]], factsAsOf: "2026-11-23" });
    expect(document.querySelector(".cp-fbox > b")!.textContent).toBe("What the chart shows · 23 Nov close");
  });
});

describe("C9: the selected buttons use the shared selected state", () => {
  it("black in light and cream in dark (--ui-on-bg / --ui-on-fg), not gold", () => {
    expect(css).toMatch(/\.cp-bar button\.on, \.cp-seg button\.on \{ background: var\(--ui-on-bg\); border-color: var\(--ui-on-bg\); color: var\(--ui-on-fg\); \}/);
    expect(css).not.toMatch(/\.cp-seg button\.on \{ background: var\(--gold\)/);
  });
});

describe("C11: the mark under a list row whose chart is behind", () => {
  it("words it 'Chart to 20 Nov', and says nothing when the chart reaches the list's day or is not known", () => {
    expect(chartToMark("2026-11-20", "2026-11-23")).toBe("Chart to 20 Nov");
    expect(chartToMark("2026-11-23", "2026-11-23")).toBeNull();
    expect(chartToMark(undefined, "2026-11-23")).toBeNull();
  });
  it("the list shows it on its own line under the row once the chart's last candle is known", async () => {
    const s = dailyTo("2026-11-20"); priceState = (range) => ok(range, s);
    const rows = [{ symbol: "AAA", name: "Alpha Ltd", price: 100, ret_1d: 1 }, { symbol: "BBB", name: "Beta Ltd", price: 50, ret_1d: -1 }];
    wrap(<ListChart rows={rows} pick="AAA" onPick={vi.fn()} toPanel={(r) => ({ symbol: r.symbol, name: r.name })} figure={null} listDay="2026-11-23" />);
    await act(async () => undefined);
    const li = document.querySelectorAll(".psx-lc-list li");
    expect(li[0].querySelector(".psx-lc-mk")!.textContent).toBe("Chart to 20 Nov");
    expect(li[0].lastElementChild!.className).toBe("psx-lc-mk");
    expect(li[1].querySelector(".psx-lc-mk")).toBeNull();          // not opened yet: nothing to say
    expect(css).toMatch(/\.psx-lc-list li \.psx-lc-mk \{ grid-column: 2 \/ -1;/);
  });
});

describe("while a company's chart loads (live check 25 Nov: Line looked selected and the header price had no word for what it was)", () => {
  const src = readFileSync(join(process.cwd(), "src/components/screener/ChartPanel.tsx"), "utf8");
  it("the chosen chart kind stays selected and enabled until candles arrive; only a loaded series with no open/high/low falls back to a line", () => {
    expect(src).toContain('const mode: Mode = bars.length > 0 && !hasOHL ? "line" : opt.mode;');
    expect(src).toContain('disabled={m !== "line" && bars.length > 0 && !hasOHL}');
  });
  it("before the chart loads, the header's price is labelled as the list's price, not as a close", () => {
    expect(src).toMatch(/\{!lastBar && row\.price != null && <small className="cp-asof"[^>]*>list price<\/small>\}/);
  });
});

describe("stepping through the list (live check 25 Nov: the row stepped away from kept its focus ring)", () => {
  it("focus follows the selected row when it was in the list", () => {
    const src = readFileSync(join(process.cwd(), "src/components/screener/presets/ListChart.tsx"), "utf8");
    expect(src).toContain("if (el && list.current?.contains(document.activeElement) && document.activeElement !== el) el.focus({ preventScroll: true });");
  });
});
