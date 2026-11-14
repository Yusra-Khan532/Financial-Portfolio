// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { SpreadSection } from "./Spread";
import type { MfSpread } from "../lib/mfPortfolio";

const d: MfSpread = {
  count: 3, basis: "equal", overall: "Partly spread", knownShares: 0.5, disclaimer: "x",
  readings: {
    together: { word: "Move as one", independent: 1.3, of: 2, range: [0.91, 0.91] }, underneath: { word: "Concentrated", stocks: 40, inTwoOrMore: 5, inTwoOrMoreShare: 0.1 },
    overlap: { word: "Moderate", top: { a: 1, b: 2, pct: 21, n: 55 } }, theme: { word: "Repeated", theme: "MNC", funds: [1, 2] }, houses: { word: "Leans on one", top: "Alpha Mutual Fund", count: 2 },
    assets: { word: "Mostly equity", equityShare: 0.79 },
  },
  mix: { shares: 0.6, sharesUnknown: 0.19, debt: 0.2, other: 0.01 }, size: { Large: 0.5, Mid: 0.3, Small: 0.2, Other: 0 },
  sectors: [{ name: "Banks", share: 0.3 }], topStocks: [{ name: "HDFC Bank", symbol: "HDFCBANK", sector: "Banks", w: 0.05, funds: [1, 2] }],
  overlap: [{ a: 1, b: 2, pct: 21, n: 55 }], together: { codes: [1, 2], C: [[1, 0.91], [0.91, 1]], weeks: 51, from: "2025-11-03", to: "2026-10-26" },
  coverage: { funds: 3, disclosed: 2, missing: [3] },
  funds: [
    { code: 1, name: "Alpha MNC Fund - Direct Plan - Growth", amc: "Alpha Mutual Fund", category: "Sectoral / Thematic", weight: 33, holdingsAsOf: "2026-09-30", why: null },
    { code: 2, name: "Beta MNC Fund - Direct Plan - Growth", amc: "Beta Mutual Fund", category: "Sectoral / Thematic", weight: 33, holdingsAsOf: "2026-09-30", why: null },
    { code: 3, name: "Gamma Liquid Fund - Direct Plan - Growth", amc: "Alpha Mutual Fund", category: "Liquid", weight: 33, holdingsAsOf: null, why: "not loaded" },
  ],
};

afterEach(cleanup);
const cell = (name: string, share = 0, n = 0) => ({ name, share, n, symbols: n ? ["AAA"] : [] });
const trend = {
  all: { n: 10, rated: 8, coverage: 0.9, breadth: { up: 0.4, down: 0.5 }, direction: { improving: 0.6, weakening: 0.2, steady: 0.2 }, average: { stLabel: "Sideways", ltLabel: "Downtrend" },
    words: { longTerm: "Split", shortAgainstLong: "Improving", businessAndPrice: "Partly out of step" },
    grid: Object.fromEntries(["1,1", "1,0", "1,-1", "0,1", "0,0", "0,-1", "-1,1", "-1,0", "-1,-1"].map((k) => [k, cell(k, k === "-1,1" ? 0.5 : 0, k === "-1,1" ? 4 : 0)])),
    business: { strong_up: { n: 1, share: 0.1, symbols: ["AAA"] }, strong_down: { n: 2, share: 0.2, symbols: ["BBB"] }, weak_up: { n: 0, share: 0, symbols: [] }, weak_down: { n: 0, share: 0, symbols: [] } } },
  perFund: {}, sharedWeakSpots: { n: 2, share: 0.3, symbols: ["BBB", "CCC"] },
} as unknown as NonNullable<MfSpread["trend"]>;

describe("SpreadSection trend", () => {
  it("Gold sees the trend card and a Silver member sees the lock note, never the numbers", () => {
    const { unmount } = render(<MemoryRouter><SpreadSection d={{ ...d, trend }} part="mix" /></MemoryRouter>);
    expect(screen.getByText("8 of 10 stocks rated")).toBeTruthy();
    expect(screen.getByText(/2 stocks are held through two or more funds/)).toBeTruthy();
    unmount();
    render(<MemoryRouter><SpreadSection d={{ ...d, trendLocked: true }} part="mix" /></MemoryRouter>);
    expect(screen.getByText(/part of the Gold plan/)).toBeTruthy();
  });
});

describe("SpreadSection", () => {
  it("shows words and plain figures, and names the funds whose holdings are missing", () => {
    render(<MemoryRouter><SpreadSection d={d} part="mix" /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Partly spread" })).toBeTruthy();
    expect(screen.getAllByText(/Gamma Liquid/).length).toBeGreaterThan(0);
    expect(screen.getByText(/share the "MNC" theme/)).toBeTruthy();
    expect(screen.getByText(/21% of their money in the same 55 stocks/)).toBeTruthy();
    const text = document.body.textContent || "";
    expect(text.match(/\b(buy|sell|hold|reduce|avoid|accumulate)\b/gi)).toBeNull();
  });
});
