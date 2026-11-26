// @vitest-environment jsdom
// Trading Lab > Order Flow > Stock radar: the Flow board's five facts of one stock as a radar. Each axis's 0-1 strength comes from the number
// behind the fact (lib/radar.ts), its label carries the engine's ✓ / ✕ / ?, a stock can be chosen by chip or search, up to two more laid over
// it, every axis opens a hover card with the fact and its number, the small radars list the stocks with the most facts each way, facts only.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { TipLayer } from "./FlowTips";
import { StockRadar } from "./StockRadar";
import { linedUp, matchStocks, outline, piecewise, radarAxes } from "../../lib/radar";
import type { FlowLines, FlowStock } from "../../lib/flow";

const PV = { p: 100, r1: 104, r2: 108, s1: 96, s2: 92 };
const st = (symbol: string, o: Partial<FlowStock>): FlowStock => ({
  symbol, name: `${symbol} Ltd`, sector: "Financial Services", industry: null, lot: 100, price: 100, previousClose: 100, change: 1, changePct: 1,
  open: 100, high: 110, low: 90, volume: 1000, vwap: 100, vwapGapPct: 0, oi: 1000, oiChange: 50, oiChangePct: 5, buildup: "long_buildup", direction: 1,
  pivots: PV, pivotsFrom: "2026-11-24", zone: "r1_r2", agreement: { score: 0, of: 5, facts: {} }, asOf: "2026-11-25T11:02:10+05:30", notes: [], ...o,
});
// rising: price 106 between R1 and R2, 0.5% above VWAP, OI +5.5%, at 73% of the day's range (95 to 110)
const A = st("POLICYBZR", { price: 106, changePct: 6.48, high: 110, low: 95, vwap: 104, vwapGapPct: 0.5, oiChangePct: 5.5,
  agreement: { score: 4, of: 5, facts: { newPositions: true, vwapSide: true, pastLevel: true, strongOi: true, rangeEnd: false } } });
// falling: price 92 on S2, 0.8% below VWAP, OI −2%, at 11% of the day's range (91 to 100)
const B = st("TATASTEEL", { price: 92, changePct: -8.43, direction: -1, buildup: "long_unwinding", high: 100, low: 91, vwap: 92.74, vwapGapPct: -0.8, oiChangePct: -2, zone: "s2_s1",
  agreement: { score: 3, of: 5, facts: { newPositions: false, vwapSide: true, pastLevel: true, strongOi: false, rangeEnd: true } } });
// rising, but its open interest and pivots are not known yet
const C = st("HDFCBANK", { price: 101, changePct: 0.9, buildup: null, oiChangePct: null, oiChange: null, pivots: null, zone: null, vwapGapPct: 0.2,
  notes: ["oi: the previous session's open interest is not stored yet", "pivots: no previous session in FinLit's daily prices"],
  agreement: { score: 1, of: 5, facts: { newPositions: null, vwapSide: true, pastLevel: null, strongOi: null, rangeEnd: false } } });
// did not move
const D = st("ITC", { price: 100, changePct: 0, change: 0, direction: 0, buildup: null });
const E = st("HINDALCO", { price: 95, changePct: -3.8, direction: -1, buildup: "short_buildup", vwapGapPct: -0.3, oiChangePct: 3,
  agreement: { score: 2, of: 5, facts: { newPositions: true, vwapSide: true, pastLevel: true, strongOi: false, rangeEnd: false } } });
const STOCKS = [A, B, E, C, D];
const LINES: FlowLines = { times: ["10:00", "11:03"], change: { POLICYBZR: [1, 6.48], TATASTEEL: [-2, -8.43], HINDALCO: [-1, -3.8], HDFCBANK: [0.2, 0.9], ITC: [0, 0] } };

afterEach(cleanup);
const wrap = (stocks = STOCKS) => render(<MemoryRouter><TipLayer><StockRadar stocks={stocks} lines={LINES} /></TipLayer></MemoryRouter>);
const point = (el: Element) => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" }); fireEvent(el, e); };
const mainSvg = () => document.querySelector(".srad-main .srad-svg") as SVGElement;
const labels = () => [...document.querySelectorAll(".srad-main .srad-lbl")].map((l) => l.textContent);
const BANNED = /\b(buy|sell|hold|target|best|pick|forecast|signal|bullish|bearish|recommend\w*|entry|exit|stop.?loss)\b/i;

describe("Stock radar, the axes", () => {
  it("measures each axis from its number for a rising stock", () => {
    const ax = radarAxes(A);
    expect(ax.map((a) => a.key)).toEqual(["newPositions", "vwapSide", "pastLevel", "strongOi", "rangeEnd"]);
    expect(ax[0].value).toBe(1);                       // 0.5 + 5.5 / 10, capped at the rim
    expect(ax[1].value).toBeCloseTo(0.75);             // 0.5 + 0.5 / 2
    expect(ax[2].value).toBeCloseTo(0.75);             // halfway from R1 (104) to R2 (108)
    expect(ax[3].value).toBeCloseTo(0.55);             // 5.5 / 10
    expect(ax[4].value).toBeCloseTo((11 / 15) / 0.75 * 0.5);   // 73% of the range, below the top quarter
    expect(ax.map((a) => a.state)).toEqual(["yes", "yes", "yes", "yes", "no"]);
    expect(ax.map((a) => a.short)).toEqual(["New positions", "Above VWAP", "Beyond R1", "OI change 5%+", "Top of range"]);
  });
  it("measures along the move for a falling stock", () => {
    const ax = radarAxes(B);
    expect(ax[0].value).toBeCloseTo(0.3);              // OI down 2%
    expect(ax[1].value).toBeCloseTo(0.9);              // 0.8% below VWAP, the move's side
    expect(ax[2].value).toBe(1);                       // on S2
    expect(ax[3].value).toBeCloseTo(0.2);
    expect(ax[4].value).toBeCloseTo(0.5 + ((8 / 9) - 0.75) / 0.25 * 0.5);
    expect(ax.map((a) => a.state)).toEqual(["no", "yes", "yes", "no", "yes"]);
    expect(ax.map((a) => a.short)).toEqual(["New positions", "Below VWAP", "Beyond S1", "OI change 5%+", "Bottom of range"]);
    expect(ax[1].number).toBe("Price ₹92.00 is −0.80% from VWAP ₹92.74");
    expect(ax[2].number).toBe("Price ₹92.00 is −4.17% from S1 ₹96.00");
  });
  it("the dashed ring is each fact's line: a met fact lies outside it, an unmet one inside", () => {
    for (const s of [A, B, E]) for (const a of radarAxes(s)) if (a.value != null && a.state !== "unknown") expect(a.state === "yes" ? a.value >= 0.5 : a.value <= 0.5, `${s.symbol} ${a.key}`).toBe(true);
  });
  it("a number that is not known is blank with its reason, never drawn as zero", () => {
    const ax = radarAxes(C);
    expect(ax.map((a) => a.state)).toEqual(["unknown", "yes", "unknown", "unknown", "no"]);
    expect(ax[0].value).toBeNull(); expect(ax[2].value).toBeNull(); expect(ax[3].value).toBeNull();
    expect(ax[0].note).toBe("the previous session's open interest is not stored yet");
    expect(ax[2].note).toBe("no previous session in FinLit's daily prices");
    expect(outline(ax.map((a) => a.value), 0, 0, 1).closed).toBe(false);
    expect(outline(radarAxes(A).map((a) => a.value), 0, 0, 1).closed).toBe(true);
  });
  it("a stock that did not move counts no facts", () => {
    const ax = radarAxes(D);
    expect(ax.every((a) => a.state === "unknown" && a.value == null)).toBe(true);
    expect(ax[0].note).toMatch(/moved neither way/);
  });
  it("helpers: straight lines between levels, the search, the stocks lined up each way", () => {
    expect(piecewise(102, [[96, 0], [100, 0.25], [104, 0.5], [108, 1]])).toBeCloseTo(0.375);
    expect(piecewise(80, [[96, 0], [100, 0.25]])).toBe(0);
    expect(matchStocks(STOCKS, "hd").map((s) => s.symbol)).toEqual(["HDFCBANK"]);
    expect(matchStocks(STOCKS, "steel").map((s) => s.symbol)).toEqual(["TATASTEEL"]);
    expect(linedUp(STOCKS, true).map((s) => s.symbol)).toEqual(["POLICYBZR", "HDFCBANK"]);
    expect(linedUp(STOCKS, false).map((s) => s.symbol)).toEqual(["TATASTEEL", "HINDALCO"]);
  });
});

describe("Stock radar, the tab", () => {
  it("starts on the stock with the most facts and puts the fact state on every axis label", () => {
    wrap();
    expect(screen.getByRole("heading", { name: "Stock radar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "POLICYBZR" }).getAttribute("aria-pressed")).toBe("true");
    expect(labels()).toEqual(["✓ New positions100%", "✓ Above VWAP75%", "✓ Beyond R175%", "✓ OI change 5%+55%", "✕ Top of range49%"]);
    expect(mainSvg().getAttribute("aria-label")).toMatch(/^Stock radar\. POLICYBZR \(rising, 4 of 5 facts\): New positions 100% met; Above VWAP 75% met/);
    expect(document.querySelectorAll(".srad-main .srad-shape")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Enlarge chart: POLICYBZR stock radar/ })).toBeTruthy();
  });
  it("chooses a stock by chip or by search", () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "TATASTEEL" }));
    expect(screen.getByRole("button", { name: "TATASTEEL" }).getAttribute("aria-pressed")).toBe("true");
    expect(labels()).toEqual(["✕ New positions30%", "✓ Below VWAP90%", "✓ Beyond S1100%", "✕ OI change 5%+20%", "✓ Bottom of range78%"]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Find an F&O stock" }), { target: { value: "hdfc" } });
    fireEvent.click(within(screen.getByRole("list", { name: "Find an F&O stock: matching stocks" })).getByRole("button", { name: /HDFCBANK/ }));
    expect(labels()).toEqual(["? New positions—", "✓ Above VWAP60%", "? Beyond R1—", "? OI change 5%+—", "✕ Top of range37%"]);
    expect(document.querySelectorAll(".srad-main .srad-gap")).toHaveLength(3);
  });
  it("lays up to two more stocks over it, and takes them off again", () => {
    wrap();
    const add = () => screen.getByRole("searchbox", { name: "Add a stock to compare" }) as HTMLInputElement;
    fireEvent.change(add(), { target: { value: "tata" } });
    fireEvent.click(within(screen.getByRole("list", { name: "Add a stock to compare: matching stocks" })).getByRole("button", { name: /TATASTEEL/ }));
    fireEvent.change(add(), { target: { value: "hind" } });
    fireEvent.click(within(screen.getByRole("list", { name: "Add a stock to compare: matching stocks" })).getByRole("button", { name: /HINDALCO/ }));
    expect(document.querySelectorAll(".srad-main .srad-shape")).toHaveLength(3);
    expect(document.querySelectorAll(".srad-main .srad-shape.k1, .srad-main .srad-shape.k2")).toHaveLength(2);
    expect(add().disabled).toBe(true);
    expect(mainSvg().getAttribute("aria-label")).toMatch(/TATASTEEL \(falling, 3 of 5 facts\).*HINDALCO \(falling, 2 of 5 facts\)/);
    fireEvent.click(screen.getByRole("button", { name: "Remove TATASTEEL from the comparison" }));
    expect(document.querySelectorAll(".srad-main .srad-shape")).toHaveLength(2);
    expect(add().disabled).toBe(false);
  });
  it("pointing at an axis shows the fact and its number plainly, for each stock on the chart", () => {
    wrap();
    fireEvent.change(screen.getByRole("searchbox", { name: "Add a stock to compare" }), { target: { value: "tata" } });
    fireEvent.click(screen.getByRole("button", { name: /TATASTEEL TATASTEEL Ltd/ }));
    point(document.querySelector('.srad-hit[data-axis="vwapSide"]')!);
    const pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("Price above the day's VWAP")).toBeTruthy();
    expect(within(pop).getByText("Price ₹106.00 is +0.50% from VWAP ₹104.00")).toBeTruthy();
    expect(within(pop).getByText("Price ₹92.00 is −0.80% from VWAP ₹92.74")).toBeTruthy();
    expect(pop.textContent).toMatch(/Strength on this axis: 75%/);
    expect(pop.textContent).toMatch(/Centre: 1% or more on the other side of VWAP · dashed ring: at VWAP/);
    point(document.querySelector('.srad-main .srad-lbl[data-axis="strongOi"]')!);
    expect(screen.getByRole("tooltip").textContent).toMatch(/Open interest changed 5\.50% \(up\)/);
    expect(document.querySelector('.srad-main .srad-lbl[data-axis="strongOi"]')!.className).toMatch(/hot/);
  });
  it("the small radars show the stocks with the most facts each way, and choosing one shows it", () => {
    wrap();
    const rise = screen.getByRole("list", { name: "Rising stocks with the most facts" }), fall = screen.getByRole("list", { name: "Falling stocks with the most facts" });
    expect(within(rise).getAllByRole("button").map((b) => b.querySelector("b")!.textContent)).toEqual(["POLICYBZR", "HDFCBANK"]);
    expect(within(fall).getAllByRole("button").map((b) => b.querySelector("b")!.textContent)).toEqual(["TATASTEEL", "HINDALCO"]);
    const hin = within(fall).getAllByRole("button")[1];
    fireEvent.click(hin);
    expect(hin.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/HINDALCO · /, { selector: ".oflow-money-line" })).toBeTruthy();
    point(hin);
    expect(within(screen.getByRole("tooltip")).getByText("HINDALCO")).toBeTruthy();
  });
  it("describes, never advises: no advice word in the tab or its hover cards", () => {
    wrap();
    let text = document.body.textContent!;
    for (const k of ["newPositions", "vwapSide", "pastLevel", "strongOi", "rangeEnd"]) { point(document.querySelector(`.srad-hit[data-axis="${k}"]`)!); text += screen.getByRole("tooltip").textContent; }
    fireEvent.click(screen.getByRole("button", { name: "TATASTEEL" }));
    point(document.querySelector('.srad-hit[data-axis="pastLevel"]')!);
    text += screen.getByRole("tooltip").textContent;
    expect(text.match(BANNED)).toBeNull();
  });
  it("with no stocks in the snapshot it says so instead of drawing an empty chart", () => {
    wrap([]);
    expect(screen.getByRole("status").textContent).toMatch(/no F&O stocks with a quote/);
    expect(document.querySelector(".srad-svg")).toBeNull();
  });
  it("a stock that did not move shows an empty radar with the reason", () => {
    wrap([D]);
    expect(labels()).toEqual(["? New positions—", "? Above VWAP—", "? Beyond R1—", "? OI change 5%+—", "? Top of range—"]);
    expect(screen.getByText(/ITC moved neither way in this snapshot/)).toBeTruthy();
  });
});
