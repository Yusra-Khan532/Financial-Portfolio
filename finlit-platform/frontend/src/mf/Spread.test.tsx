// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
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

describe("SpreadSection", () => {
  it("shows words and plain figures, and names the funds whose holdings are missing", () => {
    render(<MemoryRouter><SpreadSection d={d} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Partly spread" })).toBeTruthy();
    expect(screen.getAllByText(/Gamma Liquid/).length).toBeGreaterThan(0);
    expect(screen.getByText(/share the "MNC" theme/)).toBeTruthy();
    expect(screen.getByText(/21% of their money in the same 55 stocks/)).toBeTruthy();
    const text = document.body.textContent || "";
    expect(text.match(/.{25}\b(buy|sell|hold|reduce|avoid|accumulate)\b.{15}/gi)).toBeNull();
  });
});
