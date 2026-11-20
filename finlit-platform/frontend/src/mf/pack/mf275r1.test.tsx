// @vitest-environment jsdom
// Task #275, round 1: number fix 4 (one Nifty 500 beta, weekly past year, its window printed), fix 5 (a window beside every index figure)
// and change 5 (the sector grid's company chips open the company report).
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
import { BuildSection, BETA_WIN, glanceTiles, standsOut } from "./MfRisk";
import { Cell } from "./MfMix";
import type { FundRisk, MfRisk } from "../../lib/mfPack";

afterEach(cleanup);
const band = (b: number) => ({ word: b < 0.8 ? "Calmer" : "Moves with", tone: b < 0.8 ? "g" : "m" });
const fund = (x: Partial<FundRisk>): FundRisk => ({ code: 1, name: "ICICI Pru FMCG", short: "ICICI Pru FMCG", category: "Sectoral", swing: 12, worstFall: -15, beta: 0.68, fallsTaken: 70,
  years: 3, betaOwn: 0.95, compared: true, benchmark: "Nifty FMCG", benchKind: "index", band: band(0.95), riskShare: 100, listShare: 100, ...x } as unknown as FundRisk);
const rk = (f: FundRisk) => ({ asOf: "2026-11-20", funds: [f], list: { swing: 13.1, worstFall: -14.2, years: 3 }, bench: { name: "Nifty 500", swing: 14.3, worstFall: -18.8 },
  byType: [], own: { from: "2025-11-21", to: "2026-11-20", list: { betaOwn: 0.95, betaOwnBand: band(0.95), beta500: 0.5, beta500Band: band(0.5), liquidShare: 0,
    worst10: { list: -2, nifty500: -2.5 }, fall10: { own: -9.5, nifty500: -5 } } } } as unknown as MfRisk);
const view = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("number fix 4: one Nifty 500 beta, weekly over the past year", () => {
  it("compares the own-benchmark beta with the weekly past-year Nifty 500 beta, not the 3-year daily one", () => {
    // 20 Nov: 0.68 was the 3-year daily figure, 0.50 the weekly past-year one (All my investments); the page now says 0.50 and its window
    const f = fund({ beta: 0.68, beta500: 0.5 });
    expect(standsOut(f)).toMatch(/^Moves more on its own benchmark than on the Nifty 500 \(past year, weekly\)/);
    view(<BuildSection rk={rk(f)} />);
    const t = document.body.textContent!;
    expect(t).toContain("reads 0.95 against its own benchmark and 0.50 against the Nifty 500 (past year, weekly)");
    expect(t).not.toContain("0.68");
    expect(t).toContain(BETA_WIN);
  });
  it("says nothing about a gap when the weekly figure is close, even if the 3-year daily one was far", () => {
    const f = fund({ beta: 0.5, beta500: 0.9 });
    expect(standsOut(f)).not.toMatch(/Nifty 500/);
  });
});

describe("fix 5: a window beside every index figure", () => {
  it("prints the window on the swing and worst-fall Nifty 500 figures", () => {
    expect(glanceTiles(rk(fund({ beta500: 0.5 }))).slice(0, 3).map((t) => t.vs)).toEqual(["Nifty 500: 14.3% (3 yrs, daily)", "Nifty 500: −18.8% (3 yrs, daily)", "Nifty 500: −2.5% (past year, weekly)"]);
  });
});

describe("change 5: company chips open the company report", () => {
  const readingOf = () => null;
  it("links a chip with a symbol to /stocks/<symbol> and leaves an unmatched one as text with its reason", () => {
    view(<Cell c={{ w: 0.4, n: 2, stocks: [{ name: "ITC", symbol: "ITC", w: 0.192 }, { name: "Unlisted Co", symbol: null, w: 0.01 }] }} max={0.4} readingOf={readingOf} />);
    const a = screen.getByRole("link", { name: /^ITC, 19\.2% of your list: open the company report$/ });
    expect(a.getAttribute("href")).toBe("/stocks/ITC");
    expect(screen.queryByRole("link", { name: /Unlisted/ })).toBeNull();
    expect(document.querySelector('[title*="no company report"]')!.textContent).toContain("Unlisted");
  });
  it("encodes symbols with special characters", () => {
    view(<Cell c={{ w: 0.1, n: 1, stocks: [{ name: "M&M", symbol: "M&M", w: 0.05 }] }} max={0.1} readingOf={readingOf} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/stocks/M%26M");
  });
});
