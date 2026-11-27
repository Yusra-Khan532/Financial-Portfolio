// @vitest-environment jsdom
// Task #183 part 2 (MF portfolio), M6 Mix & overlap: the look-through grid (macro sector · 12 | sector · 22 × size, chips with the plan's reading, "+N more ▾",
// totals that add up to the list's share in shares), the six readings, the three sub-tabs (opened by the sections bar), the pair reader, shared stocks,
// company sizes with the ₹ note, the biggest stocks (5, then Show all) and the trend (Gold; a lock card below Gold).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
import { BiggestSection, MixSubTabs, OwnSection, TrendUnder, gridRows, pairText, readingTiles, type Big } from "./MfMix";
import type { MfSpread } from "../../lib/mfPortfolio";

afterEach(() => { cleanup(); localStorage.clear(); });
const st = (sym: string, w: number) => ({ name: `${sym} Ltd`, symbol: sym, w });
const SP = {
  count: 3, basis: "equal", knownShares: 0.5,
  readings: { together: { word: "Move as one", independent: 1.3, of: 2, range: [0.74, 0.9] }, underneath: { word: "Widely spread", stocks: 235, inTwoOrMore: 36 },
    overlap: { word: "Low", top: { a: 1, b: 2, pct: 10.2, n: 30 } }, theme: { word: "Repeated", theme: "MNC", funds: [1, 2] }, houses: { word: "Leans on one", top: "ICICI Prudential Mutual Fund", count: 2 },
    assets: { word: "Mostly equity", equityShare: 0.7 } },
  mix: { shares: 0.5, sharesUnknown: 0.333, debt: 0.15, other: 0.017 }, size: { Large: 0.3, Mid: 0.15, Small: 0.05, Other: 0 },
  lookThrough: {
    macro: { "Financial Services|Large": { w: 0.2, n: 6, stocks: ["HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "KOTAKBANK", "LICI"].map((s, i) => st(s, 0.05 - i * 0.005)) },
      "Financial Services|Small": { w: 0.05, n: 1, stocks: [st("CGCL", 0.05)] }, "Healthcare|Mid": { w: 0.15, n: 1, stocks: [st("PFIZER", 0.15)] }, "Information Technology|Large": { w: 0.1, n: 1, stocks: [st("TCS", 0.1)] } },
    sector: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Sector ${i}|Large`, { w: 0.05, n: 1, stocks: [st(`S${i}`, 0.05)] }])),
  },
  sectorMacro: { "Sector 0": "Financial Services" },
  perFund: { "1": { macro: { "Financial Services": 0.6 }, sector: {}, size: { Large: 0.5, Mid: 0.3, Small: 0.1 } }, "2": { macro: { Healthcare: 0.4, "Financial Services": 0.3 }, sector: {}, size: { Large: 0.7 } } },
  together: { codes: [1, 2], C: [[1, 0.85], [0.85, 1]], weeks: 52, from: null, to: null },
  overlap: [{ a: 1, b: 2, pct: 10.2, n: 30 }], coverage: { funds: 3, disclosed: 2, missing: [3], notMatched: 1 },
  funds: [{ code: 1, name: "ICICI Prudential MNC Fund", amc: "ICICI", category: "Sectoral / Thematic", weight: 33.3, assetSplit: { equity: 96, cash: 4 } },
    { code: 2, name: "Kotak MNC Fund", amc: "Kotak", category: "Sectoral / Thematic", weight: 33.3, assetSplit: { equity: 90, debt: 10 } },
    { code: 3, name: "JioBlackRock Liquid Fund", amc: "Jio", category: "Liquid", weight: 33.3, assetSplit: null }],
  topStocks: [], industries: [], overall: "Spread", disclaimer: "",
} as unknown as MfSpread;
const read = (s: string | null) => (s === "HDFCBANK" ? { word: "Healthy", score: 63 } : s === "ICICIBANK" ? { word: "Weak", score: 37 } : null);
const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("What they own (M6, step 1)", () => {
  it("groups the cells by sector, biggest first, and adds up to the list's share in shares", () => {
    const rows = gridRows(SP, "macro");
    expect(rows.map((r) => [r.name, +r.total.toFixed(3), r.n])).toEqual([["Financial Services", 0.25, 7], ["Healthcare", 0.15, 1], ["Information Technology", 0.1, 1]]);
    expect(rows.reduce((a, r) => a + r.total, 0)).toBeCloseTo(SP.knownShares);
  });
  it("draws chips with the plan's reading, opens the rest of a cell, and switches level (kept in this browser)", () => {
    let level: "macro" | "sector" = "macro";
    const { rerender } = wrap(<OwnSection sp={SP} level={level} onLevel={(l) => { level = l; }} readingOf={read} gold />);
    const cell = screen.getByText("HDFCBANK").closest("td")!;
    expect(cell.querySelectorAll(".mfm-chip")).toHaveLength(4);
    expect(cell.querySelector(".mfm-chip .mfm-dot.g")).toBeTruthy();
    expect(screen.getByText("ICICIBANK").parentElement!.querySelector(".mfm-dot.b")).toBeTruthy();   // task #389: the name sits in its own span beside the dot
    fireEvent.click(screen.getByRole("button", { name: "+2 more ▾" }));
    expect(cell.querySelectorAll(".mfm-chip")).toHaveLength(6);
    expect(document.querySelector(".mfm-g tfoot")!.textContent).toMatch(/50\.0% in shares/);
    expect(screen.getByText(/The rest of the list: debt, cash and gold \(17%\), and JioBlackRock Liquid, not loaded \(33%\)\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Sector · 22/ }));
    expect(level).toBe("sector");
    rerender(<MemoryRouter><OwnSection sp={SP} level="sector" onLevel={() => undefined} readingOf={read} gold /></MemoryRouter>);
    expect(document.querySelectorAll(".mfm-g tbody tr")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Show all 10 sectors ▾" }));
    expect(document.querySelectorAll(".mfm-g tbody tr")).toHaveLength(10);
    expect(screen.getByText("Sector 0").parentElement!.textContent).toBe("Sector 0Financial Services");      // the macro sector named under a sector
  });
});

describe("Spread, the sub-tabs and the pair reader (M6, steps 2 to 7)", () => {
  it("words the six readings as figure and line", () => {
    expect(readingTiles(SP).map((t) => `${t.label}: ${t.word} ${t.fig}`)).toEqual(["Funds that move together: Move as one 1.3 of 2", "Stocks underneath: Widely spread 235", "Overlap between funds: Low 10%",
      "Same theme: Repeated MNC", "Fund houses: Leans on one 2 of 3", "Asset mix: Mostly equity 70%"]);
  });
  it("reads a pair: its correlation, the stocks they share, and category and fund house", () => {
    expect(pairText(SP, 1, 2)).toBe("ICICI Prudential MNC and Kotak MNC: 0.85. Closely linked: about 72% of their weekly moves in common. They keep 10% of their money in the same 30 stocks. The same category, different fund houses.");
  });
  it("opens the sub-tab of a section the sections bar jumps to", () => {
    wrap(<MixSubTabs sp={SP} level="macro" onLevel={() => undefined} />);
    expect(screen.getByRole("tab", { name: /What they hold/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("What your money is in")).toBeTruthy();
    act(() => { dispatchEvent(new CustomEvent("eq-jump", { detail: "mfp-shared" })); });
    expect(screen.getByRole("tab", { name: /How funds move together/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Stocks they share")).toBeTruthy();
    expect(document.querySelector(".mfm-card.dashed")!.textContent).toMatch(/JioBlackRock Liquid.*not loaded yet/);
    fireEvent.click(screen.getByRole("button", { name: "ICICI Prudential MNC and Kotak MNC: 0.85, closely linked" }));
    act(() => { dispatchEvent(new CustomEvent("eq-jump", { detail: "mfp-sizes" })); });
    expect(screen.getByText(/SEBI's fund categories rank companies instead/)).toBeTruthy();
  });
});

describe("Biggest stocks and the trend (M6, steps 8 and 9)", () => {
  const big: Big[] = Array.from({ length: 10 }, (_, i) => ({ name: `Co ${i}`, symbol: `C${i}`, macro: "Healthcare", size: "Large", w: 0.02 - i * 0.001, funds: [1, 2] }));
  it("shows 5, then all 10, with the reading by plan", () => {
    wrap(<BiggestSection rows={big} sp={SP} readingOf={() => ({ word: "Healthy", score: 70 })} gold={false} />);
    expect(document.querySelectorAll(".mfm-big tbody tr")).toHaveLength(5);
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toContain("FinLit Prism");
    expect(screen.getAllByText("🔒 FinLit Prism · see plans").length).toBe(5);   // task #283: names only below Gold, never another score
    fireEvent.click(screen.getByRole("button", { name: "Show all 10 ▾" }));
    expect(document.querySelectorAll(".mfm-big tbody tr")).toHaveLength(10);
  });
  it("locks the trend below Gold", () => {
    wrap(<TrendUnder sp={SP} gold={false} />);
    expect(screen.getByText(/Available on Gold/)).toBeTruthy();
  });
});
