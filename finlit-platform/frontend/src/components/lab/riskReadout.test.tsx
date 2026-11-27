// @vitest-environment jsdom
// Trading Lab > Order Flow > Risk read-out (docs/TRADING-LAB.md "Risk read-out"): one stock's figures from /api/lab/risk/{symbol} beside the
// Nifty 50's, each with its window and a one-line explanation, short windows flagged, four charts (underwater, rolling volatility, return
// histogram with VaR and expected shortfall, beta scatter) each with the enlarge arrow and a hover card, a stock picker, the tab on Order Flow,
// and no advice words anywhere.
import { readFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer } from "./FlowTips";
import { RiskReadout } from "./RiskReadout";
import { NOTE, bins, fallLine, fit, ordinal, windowLine, type Fall, type Risk, type RiskFigures, type RiskWindow } from "../../lib/risk";

const auth = { ready: true, user: { id: "u1", email: "m@example.com", role: "investor" } as unknown, features: ["trading_lab"] as string[] };
vi.mock("../../lib/auth", () => ({ useAuth: () => auth }));
import { OrderFlowPage } from "../../pages/OrderFlow";

const W = (label: string, returns: number, wanted: number, from = "2025-12-09", to = "2026-11-26"): RiskWindow =>
  ({ label, from, to, returns, wanted, full: returns >= wanted, short: wanted > 20 ? returns < 200 : returns < 20 });
const fall = (o: Partial<Fall> = {}): Fall => ({ depthPct: -18.4, peak: { d: "2026-01-05", close: 1600 }, trough: { d: "2026-03-20", close: 1305.6 }, fallSessions: 52,
  fallDays: 74, recovered: { d: "2026-08-11", close: 1602 }, recoverySessions: 98, recoveryDays: 144, ...o });
const figs = (k: number, o: Partial<RiskFigures> = {}): RiskFigures => ({
  vol20: { pct: 19.15 * k, window: W("20 sessions", 20, 20, "2026-10-29") }, vol1y: { pct: 25.62 * k, window: W("1 year", 252, 252) },
  volRatio: { value: 0.75, window: W("20 sessions against 1 year", 252, 252) },
  drawdown1y: { deepest: fall(), window: W("1 year", 252, 252) },
  drawdown3y: { deepest: fall({ depthPct: -42.83, peak: { d: "2024-08-09", close: 1657.2 }, trough: { d: "2025-10-27", close: 947.4 }, recovered: null, recoverySessions: null, recoveryDays: null,
    sessionsSincePeak: 599, daysSincePeak: 839, belowPeakPct: -4.13 }), window: W("3 years", 756, 756, "2024-01-03") },
  tail: { levels: [{ level: 0.95, k: 13, n: 252, varPct: 2.5 * k, esPct: 3.01 * k, varRs: 2500 * k, esRs: 3008 * k }, { level: 0.99, k: 3, n: 252, varPct: 3.4 * k, esPct: 3.89 * k, varRs: 3396 * k, esRs: 3890 * k }], window: W("1 year", 252, 252) },
  sortino1y: { value: 2.07, meanPct: 0.138, downsidePct: 1.06, window: W("1 year", 252, 252) },
  sortino3y: { value: 0.61, meanPct: 0.05, downsidePct: 1.1, window: W("3 years", 756, 756, "2024-01-03") },
  calmar1y: { value: 2.66, annReturnPct: 37.06, maxFallPct: -13.92, window: W("1 year", 252, 252) },
  calmar3y: { value: 0.33, annReturnPct: 14.1, maxFallPct: -42.83, window: W("3 years", 756, 756, "2024-01-03") },
  last: { d: "2026-11-26", close: 1520 }, ...o,
});
const D = ["2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"];
const R: Risk = {
  status: "ok", symbol: "RELIANCE", name: "Reliance Industries Ltd", asOf: "2026-11-26",
  source: { table: "daily_candles", label: "Exchange daily candles (Dhan), NSE", from: "2023-09-04", to: "2026-11-26", closes: 800 },
  index: { name: "Nifty 50", table: "flows_index", label: "Nifty 50 daily closes (FinLit index store)", closes: 1240, from: "2021-11-26", to: "2026-11-26" },
  stock: figs(1), nifty: figs(0.5, { volRatio: { value: 0.9, window: W("20 sessions against 1 year", 252, 252) } }),
  beta: { value: 1.11, corr: 0.63, alphaPct: 0.075, r2: 0.4, aligned: 251, onlyStock: 1, onlyIndex: 0, window: W("1 year", 251, 252) },
  pairs: { d: D, s: [1.2, -2.1, 0.4, -0.6, 2.2, -3.5], m: [1, -1.5, 0.2, -0.4, 1.8, -2.4] },
  returns1y: { d: D, r: [1.2, -2.1, 0.4, -0.6, 2.2, -3.5] },
  underwater: { d: D, c: [100, 104, 99, 95, 101, 104.5], dd: [0, 0, -4.81, -8.65, -2.88, 0] },
  rolling: { d: D, v: [21, 22.5, 24, 23, 26, 27.5] },
  bigMoves: [], notes: ["The Nifty 50's newest stored close is from 2026-11-25, the stock's from 2026-11-26: beta uses the days both have."],
  explain: {
    vol20: "How widely the daily price changes swung over the last 20 sessions, scaled to a year.", vol1y: "How widely the daily price changes swung over the last year (252 sessions), scaled to a year.",
    volRatio: "The 20-session volatility divided by the 1-year level: above 1, recent swings were wider than the year's; below 1, narrower.",
    drawdown: "The largest drop from a closing high to a later closing low in the window, and when the price closed back at that high.",
    var: "The one-day loss that was reached or passed on the worst 5% (or 1%) of days in the last year.", es: "The average one-day loss on those worst 5% (or 1%) of days.",
    sortino: "The average daily return for each unit of downside swing (only days below zero count), scaled to a year.",
    calmar: "The compounded yearly return divided by the depth of the deepest fall in the same window.",
    beta: "How far the stock's daily return moved, on average, for each 1% move of the Nifty 50 on the same days.",
    corr: "How closely the stock's daily returns moved with the Nifty 50's on the same days, from -1 to +1.",
  },
  note: NOTE,
};
// the underwater chart above: the deepest fall of its 3-year window is not inside these six days, so its 1-year one is drawn from its own days
R.stock.drawdown3y = { ...R.stock.drawdown3y!, deepest: fall({ depthPct: -8.65, peak: { d: D[1], close: 104 }, trough: { d: D[3], close: 95 }, recovered: { d: D[5], close: 104.5 }, recoverySessions: 2 }) };

const SHORT: Risk = { ...R, symbol: "NEWCO", name: "New Co Ltd", stock: figs(1, { vol1y: { pct: 30, window: W("1 year", 120, 252, "2026-05-20") }, drawdown3y: null, sortino3y: null, calmar3y: null,
  threeYearNote: "Only 120 daily returns are stored, so the 3-year figures are not shown." }),
  notes: ["Only 120 daily returns are stored for the last year (fewer than 200): the 1-year figures are flagged as short."] };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const urls: string[] = [];
beforeEach(() => { urls.length = 0; vi.stubGlobal("fetch", vi.fn(async (url: string) => { const u = String(url); urls.push(u);
  if (u.includes("/api/lab/access")) return json({ access: true, reason: "granted", expiresAt: null, signals: false });
  if (u.includes("/underlyings")) return json({ indices: [], stocks: [{ key: "TATAMOTORS", name: "Tata Motors", securityId: 1, lotSize: 1 }], connected: true });
  if (u.endsWith("/NOSUCH")) return json({ detail: { status: "not_found", symbol: "NOSUCH", detail: "We could not find the stock NOSUCH." } }, 404);
  if (u.endsWith("/NEWCO")) return json(SHORT);
  return json({ ...R, symbol: u.split("/").pop() }); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = () => render(<QueryClientProvider client={qc()}><MemoryRouter><TipLayer><RiskReadout /></TipLayer></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const point = (el: Element) => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" }); fireEvent(el, e); };
const pop = () => screen.getByRole("tooltip");

describe("Risk read-out, the words", () => {
  it("says each window with its returns and dates", () => {
    expect(windowLine(W("1 year", 252, 252))).toBe("1 year · 252 daily returns · 9 Dec 2025 to 26 Nov 2026");
  });
  it("says the deepest fall with its recovery, or how long it has gone on", () => {
    expect(fallLine(fall())).toBe("−18.4% from 5 Jan 2026 to 20 Mar 2026; back at the high on 11 Aug 2026 (98 sessions after the low)");
    expect(fallLine(fall({ recovered: null, sessionsSincePeak: 40, daysSincePeak: 58 }))).toMatch(/not recovered yet: 40 sessions \(58 days\) since the high$/);
    expect(fallLine(null)).toBe("The price never closed below an earlier high in this window.");
  });
  it("counts returns into round bins and fits the line of a scaled copy", () => {
    const b = bins([-1.1, -0.2, 0.1, 0.3, 2.4], ["a", "b", "c", "d", "e"]);
    expect(b.width).toBe(0.25);
    expect(b.bins.reduce((s, x) => s + x.count, 0)).toBe(5);
    expect(b.bins[0]).toMatchObject({ lo: -1.25, hi: -1, count: 1, days: ["a"] });
    const x = [1, -2, 0.5, 3, -1];
    expect(fit(x, x.map((v) => 2 * v))!.b).toBeCloseTo(2);
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 113].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "113th"]);
    expect(fit(x, x.map((v) => 0.5 * v + 0.1))).toMatchObject({ b: expect.closeTo(0.5), a: expect.closeTo(0.1) });
  });
});

describe("Risk read-out, the tab", () => {
  it("reads the Lab's route for the chosen stock and shows each figure beside the Nifty 50's, with its window and meaning", async () => {
    wrap(); await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/risk/RELIANCE"))).toBe(true);
    const v20 = screen.getByRole("article", { name: "Volatility, 20 sessions" });
    expect(within(v20).getByText("19.1%")).toBeTruthy();
    expect(within(v20).getByText("Nifty 50: 9.6%")).toBeTruthy();
    expect(within(v20).getByText("20 sessions · 20 daily returns · 29 Oct 2026 to 26 Nov 2026")).toBeTruthy();
    expect(within(v20).getByText(R.explain.vol20)).toBeTruthy();
    const var95 = screen.getByRole("article", { name: "One-day VaR 95%" });
    expect(within(var95).getByText("−2.50%")).toBeTruthy(); expect(within(var95).getByText("₹2,500 per ₹1 lakh held")).toBeTruthy();
    expect(within(var95).getByText(/worst 5% of days in the last year/)).toBeTruthy();
    expect(within(screen.getByRole("article", { name: "Expected shortfall 99%" })).getByText(/worst 1% of days/)).toBeTruthy();
    expect(within(screen.getByRole("article", { name: "Deepest fall, 3 years" })).getByText(/back at the high on 26 Nov 2026/)).toBeTruthy();
    expect(within(screen.getByRole("article", { name: "Beta against the Nifty 50" })).getByText("251 days with a close for both")).toBeTruthy();
    for (const n of ["Sortino, 1 year", "Sortino, 3 years", "Calmar, 1 year", "Calmar, 3 years", "Correlation with the Nifty 50", "20 sessions against 1 year", "Deepest fall, 1 year"])
      expect(screen.getByRole("article", { name: n })).toBeTruthy();
    expect(screen.getByText(/Exchange daily candles \(Dhan\), NSE: 800 daily closes/)).toBeTruthy();
    expect(screen.getByText(R.notes[0])).toBeTruthy();
    expect(screen.getByRole("note").textContent).toBe(NOTE);
    expect(screen.getByText("How it is worked out")).toBeTruthy();
  });
  it("draws the four charts, each with the enlarge arrow", async () => {
    wrap(); await settle();
    for (const n of [/RELIANCE: fall below the running closing high on 6 days, deepest −8.7%/, /RELIANCE: 20-session volatility on 6 days against the 1-year level of 25.6%/,
      /RELIANCE: 6 one-day returns in \d+ bins/, /RELIANCE against the Nifty 50: 6 days with a close for both, fitted slope 1\.\d\d/]) expect(screen.getByRole("img", { name: n })).toBeTruthy();
    for (const n of ["RELIANCE deepest fall", "RELIANCE 20-session volatility", "RELIANCE one-day returns", "RELIANCE against the Nifty 50"])
      expect(screen.getByRole("button", { name: `Enlarge chart: ${n}` })).toBeTruthy();
    expect(document.querySelectorAll(".rsk-dot")).toHaveLength(6);
    expect(document.querySelectorAll(".rsk-tailline")).toHaveLength(4);
    expect(document.querySelector(".rsk-mk.low")).toBeTruthy(); expect(document.querySelector(".rsk-mk.back")).toBeTruthy();
  });
  it("pointing at a tile, the underwater line, the rolling line, a bar, a tail line, a dot or the fitted line shows its detail", async () => {
    wrap(); await settle();
    point(screen.getByRole("article", { name: "One-day VaR 99%" }));
    expect(within(pop()).getByText("the 3rd worst of 252 days")).toBeTruthy();
    point(document.querySelectorAll(".rsk-hit")[0]);
    expect(within(pop()).getByText("19 Nov 2026")).toBeTruthy(); expect(within(pop()).getByText("Closing high before it")).toBeTruthy();
    point(document.querySelectorAll(".rsk-hit")[1]);
    expect(within(pop()).getByText("1-year level (now)")).toBeTruthy();
    point(document.querySelector(".rsk-bin.tail") as Element);
    expect(within(pop()).getByText("Inside the worst 5% of days.")).toBeTruthy();
    point(document.querySelector(".rsk-tailline.es") as Element);
    expect(within(pop()).getByText("Per ₹1 lakh held")).toBeTruthy();
    point(document.querySelectorAll(".rsk-dot")[5]);
    expect(within(pop()).getByText("26 Nov 2026")).toBeTruthy(); expect(within(pop()).getByText("−3.50%")).toBeTruthy(); expect(within(pop()).getByText("−2.40%")).toBeTruthy();
    point(document.querySelector(".rsk-fit") as Element);
    expect(within(pop()).getByText(/Fitted line: slope 1\.\d\d/)).toBeTruthy();
  });
  it("flags a short history and leaves out the 3-year figures with the reason", async () => {
    wrap(); await settle();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a stock" }), { target: { value: "newco" } });
    fireEvent.submit(screen.getByRole("search"));
    await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/risk/NEWCO"))).toBe(true);
    expect(within(screen.getByRole("article", { name: "Volatility, 1 year" })).getByText("Short: 120 returns")).toBeTruthy();
    expect(within(screen.getByRole("article", { name: "Deepest fall, 3 years" })).getByText(SHORT.stock.threeYearNote!)).toBeTruthy();
    expect(screen.getByText(SHORT.notes[0])).toBeTruthy();
  });
  it("finds an F&O stock from the list and says why when a stock cannot be read", async () => {
    wrap(); await settle();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a stock" }), { target: { value: "tata" } });
    await settle();
    fireEvent.click(within(screen.getByRole("list", { name: "Matching stocks" })).getByRole("button"));
    await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/risk/TATAMOTORS"))).toBe(true);
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a stock" }), { target: { value: "nosuch" } });
    fireEvent.submit(screen.getByRole("search"));
    await settle();
    expect(screen.getByRole("alert").textContent).toBe("We could not find the stock NOSUCH.");
    expect(document.querySelector(".rsk-svg")).toBeNull();
  });
  it("never tells anyone what to do, on the page or in its source", async () => {
    wrap(); await settle();
    const banned = /\b(buy|buying|sell|selling|hold|holding|target|best|top pick|recommend\w*|forecast\w*|likely|will (rise|fall)|bullish|bearish|signal\w*)\b/i;
    const text = (document.body.textContent ?? "").replace(NOTE, "");
    expect(text.match(banned)).toBeNull();
    for (const f of ["src/components/lab/RiskReadout.tsx", "src/lib/risk.ts"]) {
      const strings = (readFileSync(f, "utf8").replace(NOTE, "").match(/"[^"\n]*"|`[^`\n]*`|>[^<>{}\n]+</g) ?? []).join(" ");
      expect(strings.match(banned)).toBeNull();
    }
  });
});

describe("Order Flow, the Risk read-out tab", () => {
  it("is listed with the other views and opens on ?view=risk", async () => {
    render(<QueryClientProvider client={qc()}><MemoryRouter initialEntries={["/lab/flow?view=risk"]}><OrderFlowPage /></MemoryRouter></QueryClientProvider>);
    await settle();
    const tabs = within(screen.getByRole("navigation", { name: "Order Flow views" })).getAllByRole("link").map((a) => a.textContent);
    expect(tabs).toEqual(["Market depth", "Flow board", "Money Flow", "Option Pulse", "Stock zones", "Risk read-out"]);
    expect(screen.getByRole("link", { name: "Risk read-out" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Risk read-out" }).getAttribute("href")).toBe("/lab/flow?view=risk");
    expect(screen.getByRole("heading", { name: "Risk read-out" })).toBeTruthy();
  });
});
