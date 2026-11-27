// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { TrendCard } from "./Spread";
import type { MfSpread } from "../lib/mfPortfolio";

afterEach(cleanup);
const cell = (name: string, share = 0, n = 0) => ({ name, share, n, symbols: n ? ["AAA"] : [] });
const trend = {
  all: { n: 10, rated: 8, coverage: 0.9, breadth: { up: 0.4, down: 0.5 }, direction: { improving: 0.6, weakening: 0.2, steady: 0.2 }, average: { stLabel: "Sideways", ltLabel: "Downtrend" },
    words: { longTerm: "Split", shortAgainstLong: "Improving", businessAndPrice: "Partly out of step" },
    grid: Object.fromEntries(["1,1", "1,0", "1,-1", "0,1", "0,0", "0,-1", "-1,1", "-1,0", "-1,-1"].map((k) => [k, cell(k, k === "-1,1" ? 0.5 : 0, k === "-1,1" ? 4 : 0)])),
    business: { strong_up: { n: 1, share: 0.1, symbols: ["AAA"] }, strong_down: { n: 2, share: 0.2, symbols: ["BBB"] }, weak_up: { n: 0, share: 0, symbols: [] }, weak_down: { n: 0, share: 0, symbols: [] } } },
  perFund: {}, sharedWeakSpots: { n: 2, share: 0.3, symbols: ["BBB", "CCC"] },
} as unknown as NonNullable<MfSpread["trend"]>;

describe("TrendCard (the trend underneath, Gold)", () => {
  it("shows the counts, the rated share and the stocks in two or more funds, never advice", () => {
    render(<MemoryRouter><TrendCard t={trend} nm={(c) => `Fund ${c}`} /></MemoryRouter>);
    expect(screen.getByText("8 of 10 stocks rated")).toBeTruthy();
    expect(screen.getByText(/2 stocks are held through two or more funds/)).toBeTruthy();
    const text = (document.body.textContent || "").replace("not a call to buy or sell", "");      // its own disclaimer says what it is not
    expect(text.match(/\b(buy|sell|hold|reduce|avoid|accumulate)\b/gi)).toBeNull();
  });
});
