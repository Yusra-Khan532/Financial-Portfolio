// @vitest-environment jsdom
// Task #275 (changes 4, 6, 7, 13): the MF trend matrix, Up first on both axes, the plain names, company links, and a fifth box "In between".
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { MATRIX, TrendCard, betweenShare } from "./Spread";
import type { MfTrend, TrendRead } from "../lib/mfPortfolio";

afterEach(cleanup);
const cell = (n: number, share: number, symbols: string[]) => ({ name: "old", n, share, symbols });
// the mockup's figures (20 Nov, the equity preview list): 23 in between, 65%
const A = { n: 45, rated: 45, coverage: 1, breadth: { up: 0.26, down: 0.74 }, direction: { improving: 0.6, weakening: 0.2, steady: 0.2 },
  grid: { "1,1": cell(6, 0.09, ["MARICO", "RADICO", "BHARTIARTL", "A", "B", "C"]), "1,0": cell(1, 0.01, ["GALAXYSURF"]), "1,-1": cell(0, 0, []), "0,1": cell(7, 0.16, ["TATACONSUM"]),
    "0,0": cell(1, 0, ["SAPPHIRE"]), "0,-1": cell(0, 0, []), "-1,1": cell(9, 0.49, ["ITC", "HINDUNILVR"]), "-1,0": cell(6, 0.23, ["VBL", "NESTLEIND"]), "-1,-1": cell(3, 0.02, ["SWIGGY", "CCL", "BERGEPAINT"]) },
  business: { strong_up: { n: 2, share: 0.01, symbols: ["GALAXYSURF", "IGIL"] }, strong_down: { n: 2, share: 0.26, symbols: ["HINDUNILVR", "VBL"] }, weak_up: { n: 1, share: 0, symbols: ["ETERNAL"] },
    weak_down: { n: 5, share: 0.08, symbols: ["GODREJCP", "UBL", "ARVINDFASN", "SWIGGY", "X"] } },
  between: 23, average: { stLabel: "Uptrend", ltLabel: "Downtrend" }, words: { longTerm: "Mostly falling", shortAgainstLong: "Improving", businessAndPrice: "Partly out of step" } } as unknown as TrendRead;
const T = { all: A } as MfTrend;
const view = (matrix: boolean) => render(<MemoryRouter><TrendCard t={T} nm={() => ""} matrix={matrix} /></MemoryRouter>);

describe("MF trend matrix (changes 4, 6, 7, 13)", () => {
  it("puts Up first on both axes, with the plain names and the line under each", () => {
    view(true);
    const t = document.querySelector(".mft-t")!;
    expect(Array.from(t.querySelectorAll("thead th")).map((x) => x.textContent)).toEqual(["Long ↓ · short →", "↑ Up", "→ Sideways", "↓ Down"]);
    expect(Array.from(t.querySelectorAll("tbody th")).map((x) => x.textContent)).toEqual(["↑ Up", "→ Sideways", "↓ Down"]);
    expect(Array.from(t.querySelectorAll(".mft-n")).map((x) => x.textContent)).toEqual(["Rising", "Rising but resting", "Rising but dipping", "Flat, turning up", "Flat", "Flat, turning down", "Falling but bouncing", "Falling but resting", "Falling"]);
    expect(Object.keys(MATRIX)).toHaveLength(9);
    expect(t.querySelectorAll("tbody td")[0].querySelector(".mft-v")!.textContent).toBe("6 stocks · 9% of the shares");
    expect(t.querySelectorAll("tbody td")[1].querySelector(".mft-v")!.textContent).toBe("1 stock · 1% of the shares");
    expect(screen.getByText("Short-term trend →")).toBeTruthy(); expect(screen.getByText("Long-term trend ↓")).toBeTruthy();
  });
  it("links each company to its report, with +N more", () => {
    view(true);
    expect(screen.getByRole("link", { name: "MARICO: open the company report" }).getAttribute("href")).toBe("/stocks/MARICO");
    fireEvent.click(screen.getByRole("button", { name: "3 more in Rising" }));
    expect(screen.getByRole("link", { name: "C: open the company report" })).toBeTruthy();
  });
  it("adds the fifth box In between, with its share and count", () => {
    view(true);
    expect(betweenShare(A)).toBeCloseTo(0.65);
    const box = document.querySelector(".mft-between")!;
    expect(box.textContent).toBe("In between65%23 stocksPrism 50 to 64, or a flat long-term trend");
  });
  it("leaves the equity page's older grid as it was until it opts in", () => {
    view(false);
    expect(document.querySelector(".mft-t")).toBeNull();
    expect(document.querySelector(".x-tg")).toBeTruthy();
    expect(document.querySelector(".mft-between")).toBeNull();
  });
});
