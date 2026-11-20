// @vitest-environment jsdom
// Task #183 part 2 (MF portfolio), M5 Your funds: the type strip, the band filter from the API's label, the Overview (score, divider, four parts in the
// server's words with the number under each, status with the category rank), Returns & costs, Risk (own benchmark, Stand-in tag, list and Nifty 500 rows),
// By fund type (groups fold), every heading sorting both ways.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
import { FundsTable, typeStrip, fundsInsights } from "./MfFunds";
import type { Holding, MfSpread } from "../../lib/mfPortfolio";
import type { MfRisk } from "../../lib/mfPack";

afterEach(cleanup);
const S = (final: number, label: string, p: number[], w: string[], rank: [number, number], status = "RATED") => ({ locked: false, final, label, status, reason: null, runDate: null, inherited: null,
  parts: { performance: p[0], risk: p[1], cost: p[2], quality: p[3] }, words: { performance: w[0], risk: w[1], cost: w[2], quality: w[3] }, rank: { rank: rank[0], of: rank[1], scope: "sub", categoryLabel: null } });
const H = (code: number, name: string, category: string, categoryLabel: string, s: ReturnType<typeof S>, extra: Partial<Holding> = {}) =>
  ({ id: String(code), code, name, amc: "X Mutual Fund", plan: "Direct", option: "Growth Option", folio: "", isin: `INF${code}`, category, categoryLabel, nav: 100, navDate: "2026-11-13", current: null,
    returns: { r1y: 10, r3y: 12, r5y: null, asOf: null, why: null }, ter: 0.5, aum: 1000, score: s, lots: [], ...extra }) as unknown as Holding;
const HS = [H(1, "Quant Small Cap Fund", "Equity Scheme - Small Cap Fund", "Small Cap", S(55.9, "Average", [60, 49, 62, 55], ["Fair", "Weak", "Fair", "Fair"], [13, 28])),
  H(2, "ICICI Prudential MNC Fund", "Equity Scheme - Sectoral/ Thematic", "Sectoral / Thematic", S(51.9, "Average", [28, 69, 37, 79], ["Weak", "Fair", "Weak", "Strong"], [103, 222]), { option: "IDCW Option", ter: 1.25 }),
  H(3, "JioBlackRock Liquid Fund", "Debt Scheme - Liquid Fund", "Liquid", S(67.6, "Healthy", [68, 85, 56, 62], ["Fair", "Strong", "Fair", "Fair"], [24, 40], "PROVISIONAL"), { ter: 0.13 })];
const SP = { readings: { theme: { theme: null, funds: [] } } } as unknown as MfSpread;
const RK = { list: { swing: 9.6, worstFall: -8.2 }, bench: { swing: 14.3, worstFall: -18.8 }, own: { list: { betaOwn: 0.71, betaOwnBand: { key: "defensive", word: "Defensive" } } },
  funds: [{ code: 1, swing: 17.6, worstFall: -24.7, betaOwn: 0.83, band: { key: "defensive", word: "Defensive" }, benchmark: "Nifty Smallcap 250", riskShare: 60.2, compared: true },
    { code: 2, swing: 11.6, worstFall: -19.5, betaOwn: 0.82, band: { key: "defensive", word: "Defensive" }, benchmark: "Nifty 500", standIn: true, benchWhy: "Stand-in: no theme index", riskShare: 39.5, compared: true },
    { code: 3, swing: 0.2, worstFall: 0, betaOwn: 0, compared: false, riskShare: 0.3 }] } as unknown as MfRisk;
const view = () => render(<MemoryRouter><FundsTable hs={HS} rk={RK} sp={SP} listLabel="Average" actions={(h) => <button type="button">Remove {h.code}</button>} /></MemoryRouter>);
const names = () => Array.from(document.querySelectorAll(".mff-t tbody th a")).map((a) => a.textContent);

describe("Your funds (M5)", () => {
  it("strips the funds by type with their share, and words three things to know", () => {
    expect(typeStrip(HS)).toEqual([{ type: "Equity", n: 2, share: 67, cats: ["Sectoral / Thematic", "Small Cap"] }, { type: "Debt", n: 1, share: 33, cats: ["Liquid"] }]);
    expect(fundsInsights(HS, SP).map((c) => c.title)).toEqual(["Two funds read Average", "Low cost where it matters least"]);
  });
  it("shows the score, a divider, the four parts in the server's words with the number under each, and the status with the category rank", () => {
    view();
    const row = screen.getByText("ICICI Prudential MNC Fund").closest("tr")!;
    expect(Array.from(row.querySelectorAll(".mff-pw")).map((c) => c.textContent)).toEqual(["Weak28", "Fair69", "Weak37", "Strong79"]);
    expect(row.querySelector(".mff-div")).toBeTruthy();
    expect(row.querySelector(".mff-st")!.textContent).toBe("Rated103 of 222 in category");
    expect(within(row).getByText("INF2")).toBeTruthy();
    expect(screen.getByText("JioBlackRock Liquid Fund").closest("tr")!.querySelector(".mff-status")!.textContent).toBe("Provisional");
    expect(document.querySelector(".mff-t tfoot")!.textContent).toMatch(/^List average58 Average/);   // the word for the average is the server's
  });
  it("filters by the API's band word and sorts every heading both ways", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Healthy 1" }));
    expect(names()).toEqual(["JioBlackRock Liquid Fund"]);
    fireEvent.click(screen.getByRole("button", { name: "All 3" }));
    expect(names()).toEqual(["ICICI Prudential MNC Fund", "JioBlackRock Liquid Fund", "Quant Small Cap Fund"]);
    fireEvent.click(screen.getByRole("button", { name: "Score" }));
    expect(names()).toEqual(["ICICI Prudential MNC Fund", "Quant Small Cap Fund", "JioBlackRock Liquid Fund"]);
    fireEvent.click(screen.getByRole("button", { name: "Score ▲" }));
    expect(names()).toEqual(["JioBlackRock Liquid Fund", "Quant Small Cap Fund", "ICICI Prudential MNC Fund"]);
    expect(screen.getByRole("button", { name: "Score ▼" }).closest("th")!.getAttribute("aria-sort")).toBe("descending");
  });
  it("task #275 (change 8): the fund cell gives house · plan · option and the ISIN; Category · type names the type under the category", () => {
    view();
    const row = Array.from(document.querySelectorAll(".mff-t tbody tr")).find((r) => r.textContent!.includes("ICICI Prudential MNC Fund"))!;
    expect(row.querySelector("th .mfp-isin")!.textContent).toBe("INF2");
    const cat = row.querySelectorAll("td")[0];
    expect(cat.firstChild!.textContent).toBe("Sectoral / Thematic");
    expect(cat.querySelector(".mff-type")!.textContent).toBe("Equity");
    const liquid = Array.from(document.querySelectorAll(".mff-t tbody tr")).find((r) => r.textContent!.includes("JioBlackRock"))!;
    expect(liquid.querySelector("td .mff-type")!.textContent).toBe("Debt");
    expect(document.querySelector(".mff-t thead")!.textContent).toContain("Category · type");
  });
  it("Returns & costs, Risk against each fund's own benchmark, and By fund type", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Returns & costs" }));
    expect(Array.from(document.querySelectorAll(".mff-t thead th")).map((t) => t.textContent)).toEqual(["Fund ▲", "Category · type", "1 year", "3 years, a year", "5 years, a year", "Expense ratioi", "Fund size"]);
    expect(screen.getByRole("note").textContent).toMatch(/IDCW options show no 1, 3 or 5 year return/);
    fireEvent.click(screen.getByRole("button", { name: "Risk" }));
    const mnc = screen.getByText("ICICI Prudential MNC Fund").closest("tr")!;
    expect(mnc.textContent).toMatch(/0\.82 Defensive.*Nifty 500Stand-in.*39\.5%/);
    expect(screen.getByText("JioBlackRock Liquid Fund").closest("tr")!.textContent).toMatch(/Not compared/);
    expect(Array.from(document.querySelectorAll(".mff-t tfoot th")).map((t) => t.textContent)).toEqual(["Your list", "Nifty 500"]);
    fireEvent.click(screen.getByRole("button", { name: "By fund type" }));
    const g = screen.getByRole("button", { name: /Equity · 2 funds · 67% of the list · average health 54 · average swing 14\.6%/ });
    expect(names()).toHaveLength(3);
    fireEvent.click(g);
    expect(g.getAttribute("aria-expanded")).toBe("false");
    expect(names()).toEqual(["JioBlackRock Liquid Fund"]);
  });
});
