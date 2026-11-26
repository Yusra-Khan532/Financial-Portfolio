// @vitest-environment jsdom
// Trading Lab > Order Flow > RSI heatmap: the grid of /api/lab/rsi as band counts per timeframe and the stocks by sector (sector average row,
// collapsible), sorted and filtered; a card on every cell; one timeframe as tiles on a phone; the waiting and stale states; describe-only words.
import { readFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer } from "./FlowTips";
import { RsiHeatmap } from "./RsiHeatmap";
import { bandOf, filterStocks, groupBySector, sortStocks, type BandKey, type RsiGrid, type RsiStock, type Tf } from "../../lib/rsi";

const TF: Tf[] = ["5m", "15m", "1h", "1D"];
const per = <T,>(f: (t: Tf) => T) => Object.fromEntries(TF.map((t) => [t, f(t)])) as Record<Tf, T>;
const stock = (sym: string, sector: string, v: (number | null)[], forming = false): RsiStock => ({
  sym, name: `${sym} Ltd`, sector, price: 100, rsi: per((t) => v[TF.indexOf(t)]), prev: per((t) => (v[TF.indexOf(t)] == null ? null : (v[TF.indexOf(t)] as number) - 2)),
  band: per((t) => bandOf(v[TF.indexOf(t)])), bars: per(() => 60), forming: per((t) => forming && t !== "1D"),
  barAt: { "5m": "2026-11-26T11:00:00+05:30", "15m": "2026-11-26T11:00:00+05:30", "1h": "2026-11-26T10:15:00+05:30", "1D": "2026-11-26" },
  reason: v[2] == null ? { "1h": "40 bars stored; RSI(14) is shown from 50 bars." } : {}, lastBar: "2026-11-26T11:00:00+05:30",
});
const STOCKS = [
  stock("HDFCBANK", "Banks", [72, 65, 55, 48], true),
  stock("SBIN", "Banks", [28, 35, 45, 52]),
  stock("TCS", "IT", [50, 62, null, 71]),
  stock("ZZZ", "Other", [null, null, null, null]),
];
const counts = per((t) => {
  const c: Record<BandKey | "none", number> = { oversold: 0, weak: 0, middle: 0, strong: 0, overbought: 0, none: 0 };
  for (const s of STOCKS) c[s.band[t] ?? "none"] += 1;
  return c;
});
const GRID: RsiGrid = {
  ready: true, takenAt: "2026-11-26T11:02:00+05:30", asOf: "2026-11-26T11:02:00+05:30", stale: false, period: 14, minBars: 50, timeframes: TF,
  stocks: STOCKS, counts, note: "RSI is a fixed formula on past closes; it is not a forecast.",
  sectors: [
    { sector: "Banks", stocks: 2, avg: { "5m": 50, "15m": 50, "1h": 50, "1D": 50 }, band: per(() => "middle" as BandKey), counted: per(() => 2) },
    { sector: "IT", stocks: 1, avg: { "5m": 50, "15m": 62, "1h": null, "1D": 71 }, band: per(() => null), counted: per(() => 1) },
    { sector: "Other", stocks: 1, avg: per(() => null), band: per(() => null), counted: per(() => 0) },
  ],
};
let answer: unknown = GRID;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => { answer = GRID; vi.stubGlobal("fetch", vi.fn(async () => json(answer))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TipLayer><RsiHeatmap /></TipLayer></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const point = (el: Element) => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" }); fireEvent(el, e); };
const rows = () => [...document.querySelectorAll(".rsi-stock")].map((r) => r.getAttribute("aria-label"));

describe("RSI heatmap, the helpers", () => {
  it("bands use the server's edges", () => {
    expect([0, 30, 30.1, 40, 60, 60.1, 70].map(bandOf)).toEqual(["oversold", "oversold", "weak", "middle", "middle", "strong", "overbought"]);
  });
  it("sorts by name or by one timeframe (no value last), filters, and groups by sector with Other last", () => {
    expect(sortStocks(STOCKS, "high", "5m").map((s) => s.sym)).toEqual(["HDFCBANK", "TCS", "SBIN", "ZZZ"]);
    expect(sortStocks(STOCKS, "low", "1h").map((s) => s.sym)).toEqual(["SBIN", "HDFCBANK", "TCS", "ZZZ"]);
    expect(filterStocks(STOCKS, { tf: "1D", band: "overbought", sector: null, q: "" }).map((s) => s.sym)).toEqual(["TCS"]);
    expect(filterStocks(STOCKS, { tf: "5m", band: "none", sector: null, q: "" }).map((s) => s.sym)).toEqual(["ZZZ"]);
    expect(filterStocks(STOCKS, { tf: "5m", band: null, sector: "Banks", q: "sb" }).map((s) => s.sym)).toEqual(["SBIN"]);
    expect(groupBySector(sortStocks(STOCKS, "name", "5m"), GRID.ready ? GRID.sectors : []).map((g) => g.sector)).toEqual(["Banks", "IT", "Other"]);
  });
});

describe("RSI heatmap, the tab", () => {
  it("shows the band counts per timeframe and the stocks by sector with the sector average row", async () => {
    wrap(); await settle();
    expect(screen.getByRole("button", { name: "5 minutes, Overbought band: 1 stocks" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 hour, no value: 2 stocks" })).toBeTruthy();
    expect([...document.querySelectorAll(".rsi-sec")].map((g) => g.getAttribute("aria-label"))).toEqual(["Banks", "IT", "Other"]);
    expect(rows()).toEqual(["HDFCBANK", "SBIN", "TCS", "ZZZ"]);
    expect(screen.getByLabelText("Banks average 5 minutes: 50.0")).toBeTruthy();
    const cell = screen.getByLabelText("HDFCBANK 5 minutes: 72.0, overbought band");
    expect(cell.className).toMatch(/b-overbought/);
    expect(cell.className).toMatch(/forming/);
    expect(screen.getByLabelText("TCS 1 hour: no value").textContent).toBe("—");
    expect(screen.getAllByRole("button", { name: /Enlarge chart/ }).length).toBeGreaterThanOrEqual(1);
  });

  it("a sector closes and opens again", async () => {
    wrap(); await settle();
    const b = screen.getByRole("button", { name: /^Banks/ });
    expect(b.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(b);
    expect(rows()).toEqual(["TCS", "ZZZ"]);
    expect(screen.getByRole("button", { name: /^Banks/ }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /^Banks/ }));
    expect(rows()).toEqual(["HDFCBANK", "SBIN", "TCS", "ZZZ"]);
  });

  it("sorts by the chosen timeframe and filters by band, sector and search", async () => {
    wrap(); await settle();
    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    expect(screen.getByRole("button", { name: "1 day" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByLabelText("Sort the stocks"), { target: { value: "low" } });
    expect(rows()).toEqual(["HDFCBANK", "SBIN", "TCS", "ZZZ"]);           // inside Banks: 48 before 52
    fireEvent.change(screen.getByLabelText("Sort the stocks"), { target: { value: "high" } });
    expect(rows()).toEqual(["SBIN", "HDFCBANK", "TCS", "ZZZ"]);
    fireEvent.change(screen.getByLabelText("Show one band"), { target: { value: "overbought" } });
    expect(rows()).toEqual(["TCS"]);
    fireEvent.change(screen.getByLabelText("Show one band"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Show one sector"), { target: { value: "Banks" } });
    expect(rows()).toEqual(["SBIN", "HDFCBANK"]);
    fireEvent.change(screen.getByLabelText("Find a stock"), { target: { value: "hdfc" } });
    expect(rows()).toEqual(["HDFCBANK"]);
    fireEvent.change(screen.getByLabelText("Find a stock"), { target: { value: "nothing" } });
    expect(screen.getByText("No stock matches these filters.")).toBeTruthy();
  });

  it("choosing a part of a band bar filters to it, and choosing it again clears it", async () => {
    wrap(); await settle();
    const part = screen.getByRole("button", { name: "5 minutes, Oversold band: 1 stocks" });
    fireEvent.click(part);
    expect(part.getAttribute("aria-pressed")).toBe("true");
    expect(rows()).toEqual(["SBIN"]);
    fireEvent.click(part);
    expect(rows()).toHaveLength(4);
  });

  it("pointing at a cell shows the stock's card: four values, bands, the value before, the bar times, the forming bar", async () => {
    wrap(); await settle();
    point(screen.getByLabelText("HDFCBANK 15 minutes: 65.0, strong"));
    const t = screen.getByRole("tooltip");
    expect(within(t).getByText("HDFCBANK")).toBeTruthy();
    expect(within(t).getByText(/HDFCBANK Ltd · Banks/)).toBeTruthy();
    expect(within(t).getByText("₹100.00")).toBeTruthy();
    for (const n of ["5 minutes", "15 minutes", "1 hour", "1 day"]) expect(within(t).getByText(n)).toBeTruthy();
    expect(t.textContent).toMatch(/65\.0 strong · before 63\.0 \(\+2\.0\)/);
    expect(t.textContent).toMatch(/48\.0 middle · before 46\.0/);
    expect(t.textContent).toMatch(/Last 5-minute bar 26 Nov, 11:00 IST; last daily close 26 Nov\./);
    expect(t.textContent).toMatch(/5 minutes, 15 minutes, 1 hour includes the bar still forming/);
    fireEvent.pointerLeave(screen.getByLabelText("HDFCBANK 15 minutes: 65.0, strong"));
    expect(screen.queryByRole("tooltip")).toBeNull();
    point(screen.getByLabelText("TCS 1 hour: no value"));
    expect(screen.getByRole("tooltip").textContent).toMatch(/1 hour: 40 bars stored/);
  });

  it("on a phone: a timeframe picker and compact tiles, no table", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("560"), addEventListener() {}, removeEventListener() {} }));
    wrap(); await settle();
    expect(document.querySelector(".rsi-head")).toBeNull();
    expect(document.querySelectorAll(".rsi-stock")).toHaveLength(0);
    const banks = screen.getByRole("list", { name: "Banks stocks, 15 minutes" });
    expect(within(banks).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["HDFCBANK65.0", "SBIN35.0"]);
    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    expect(within(screen.getByRole("list", { name: "Banks stocks, 1 day" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["HDFCBANK48.0", "SBIN52.0"]);
    expect(document.querySelector(".rsi-tile.b-overbought")!.textContent).toBe("TCS71.0");
  });

  it("before the first grid it says when it comes; an old grid is marked stale; an empty grid says so", async () => {
    answer = { ready: false, asOf: null, stale: false, note: "", reason: "The first RSI grid is worked out in the next market session." };
    const { unmount } = wrap(); await settle();
    expect(screen.getByText("No RSI grid yet")).toBeTruthy();
    expect(screen.getByText(/next market session/)).toBeTruthy();
    unmount();
    answer = { ...GRID, stale: true };
    const second = wrap(); await settle();
    expect(screen.getByText(/older than it should be/)).toBeTruthy();
    second.unmount();
    answer = { ...GRID, stocks: [], sectors: [] };
    wrap(); await settle();
    expect(screen.getByText("No F&O stock is in the grid yet.")).toBeTruthy();
  });

  it("an error reads as a plain message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ status: "lab_access_required" }, 403)));
    wrap(); await settle();
    expect(screen.getByRole("alert").textContent).toMatch(/could not be loaded/);
  });
});

describe("RSI heatmap, the words and the look", () => {
  it("describes and never advises", async () => {
    wrap(); await settle();
    point(screen.getByLabelText("HDFCBANK 15 minutes: 65.0, strong"));
    const note = "RSI is a fixed formula on past closes; it is not a forecast.";
    expect(document.body.textContent).toContain(note);
    const text = [document.body.textContent ?? "", readFileSync("src/components/lab/RsiHeatmap.tsx", "utf8"), readFileSync("src/lib/rsi.ts", "utf8")].map((x) => x.replace(/e\.target/g, ""))
      .join(" ").split(note).join(" ").toLowerCase();
    for (const w of [/\bbuy\b/, /\bsell\b/, /\bhold\b/, /\btarget/, /\bbest\b/, /\bpick/, /forecast/, /signal/, /reversal/, /buy zone/]) expect(text).not.toMatch(w);
  });
  it("the styles use tokens: no raw colour, radius and sizes from the scale, nothing at weight 800", () => {
    const css = readFileSync("src/styles/orderflow.css", "utf8");
    const rsi = css.slice(css.indexOf("/* ---- RSI heatmap"), css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(rsi.length).toBeGreaterThan(500);
    expect(rsi).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|font-weight: 800/i);
    for (const m of rsi.matchAll(/border-radius: ([^;]+);/g)) expect(m[1]).toMatch(/^var\(--(ui-r-mark|r-ctl|r-card|ui-r-pill)\)$/);
    for (const m of rsi.matchAll(/font-size: ([^;]+);/g)) expect(m[1]).toMatch(/^var\(--fs-\d+\)$/);
    expect(css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"))).toMatch(/\.rsi-bar button \{ transition: none; \}/);
  });
});
