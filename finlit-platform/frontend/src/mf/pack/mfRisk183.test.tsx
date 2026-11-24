// @vitest-environment jsdom
// Task #183 part 2 (MF portfolio), M7 Risk analytics: the glance against the Nifty 500, the beta build by fund type adding up to the list's beta (liquid counts
// 0), Reading a beta with the list and "without liquid" pins, the three beta figures, each fund against its own benchmark (Stand-in tag, down/up weeks), the
// risk split by fund or type with shaded rows (COMMON-RULES 8), the 10% fall with the rupee line, and each fund's risk. The pack's five funds, 15 Nov figures.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
import { BuildSection, EachFundSection, FallSection, GlanceSection, OwnBenchSection, RiskShareSection, byType, glanceTiles, riskLede, shaded, standsOut } from "./MfRisk";
import type { FundRisk, MfRisk } from "../../lib/mfPack";

afterEach(cleanup);
const band = (b: number) => (b < 0.65 ? { key: "less", word: "Less sensitive" } : b < 0.9 ? { key: "defensive", word: "Defensive" } : b < 1.1 ? { key: "similar", word: "Similar" } : { key: "more", word: "More sensitive" }) as FundRisk["band"];
const F = (code: number, short: string, type: string, betaOwn: number, riskShare: number, x: Partial<FundRisk> = {}): FundRisk => ({ code, name: short, short, category: type, swing: 12, worstFall: -15, beta: betaOwn, fallsTaken: 70,
  from: null, to: null, years: 3, why: null, benchmark: "Nifty MNC", compared: true, benchKind: "index", betaOwn, band: band(betaOwn), explained: 85, downPer100: 80, upPer100: 90, oneYear: 5, benchOneYear: 2,
  riskShare, listShare: 20, type, ...x });
const RK = { count: 5, basis: "equal", list: { swing: 9.6, worstFall: -8.2, level: null }, bench: { name: "NIFTY 500", swing: 14.3, worstFall: -18.8, from: "2023-11-13", to: "2026-11-13" },
  funds: [F(1, "Quant Small Cap", "Small cap", 0.83, 28.1, { benchmark: "Nifty Smallcap 250", worstFall: -24.7 }),
    F(2, "ICICI Pru Multi Asset", "Hybrid", 1.02, 17.8, { benchmark: "68% Nifty 500 + 21% debt + 11% gold", benchKind: "blend", standIn: true, benchWhy: "Debt is a steady 6.5% a year.", beta: 0.66, beta500: 0.66 }),
    F(3, "ICICI Pru MNC", "Thematic", 0.82, 24.6), F(4, "Kotak MNC", "Thematic", 0.9, 29.2, { years: 2, worstFall: -16.5 }),
    F(5, "JioBlackRock Liquid", "Liquid", 0, 0.3, { compared: false, benchmark: "Not compared", benchKind: "none", explained: null, downPer100: null, upPer100: null, band: band(0), beta: 0.01 })],
  own: { from: "2025-11-14", to: "2026-11-13", list: { betaOwn: 0.71, betaOwnBand: band(0.71), betaExLiquid: 0.89, betaExLiquidBand: band(0.89), beta500: 0.65, beta500Band: band(0.65), liquidShare: 20,
    worst10: { list: -1.8, nifty500: -2.5 }, fall10: { own: -7.1, nifty500: -6.5 } } } } as unknown as MfRisk;
const view = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("Risk at a glance (M7, step 1)", () => {
  it("leads with the own-benchmark beta and shows four figures against the Nifty 500, each with its window", () => {
    expect(riskLede(RK)).toEqual({ lead: "Your list moves less than its markets.", rest: "Each fund against its own benchmark, the list has moved 0.71% for every 1% move in them, and it swings 9.6% in a typical year against 14.3% for the Nifty 500 (3 yrs, daily)." });
    expect(glanceTiles(RK).map((t) => [t.k, t.v, t.vs, t.sub])).toEqual([
      ["Typical swing in a year · 3 yrs", "9.6%", "Nifty 500: 14.3% (3 yrs, daily)", "A calmer ride than the index."], ["Worst fall from a high · 3 yrs", "−8.2%", "Nifty 500: −18.8% (3 yrs, daily)", "Less than half as deep."],
      ["In the 10 worst weeks · past year", "−1.8%", "Nifty 500: −2.5% (past year, weekly)", "Falls less when the market falls."], ["Moves with its markets", "0.71×", "its markets: 1.00×", "Moves less than its markets."]]);
    view(<GlanceSection rk={RK} />);
    expect(screen.getByText(/beta and weekly figures from the past year, to 13 Nov 2026/)).toBeTruthy();
  });
});

describe("How the beta is built and Reading a beta (M7, step 2)", () => {
  it("adds each type's part to the list's beta; the liquid fund adds 0", () => {
    const g = byType(RK);
    expect(g.map((x) => [x.type, x.n, x.avg, x.share, x.adds])).toEqual([["Thematic", 2, 0.86, 40, 0.34], ["Hybrid", 1, 1.02, 20, 0.2], ["Small cap", 1, 0.83, 20, 0.17], ["Liquid", 1, 0, 20, 0]]);
    expect(g.reduce((a, x) => a + (x.adds ?? 0), 0)).toBeCloseTo(0.71, 2);
    view(<BuildSection rk={RK} />);
    expect(document.querySelector(".eqr-sum")!.textContent).toMatch(/0\.71.*0\.34 \+ 0\.20 \+ 0\.17 \+ 0\.00 = 0\.71/);
    expect(Array.from(document.querySelectorAll(".eqb-lab")).map((p) => [p.textContent, p.getAttribute("title")])).toEqual([["0.71Your list", "Your list 0.71 · Less sensitive"], ["0.89Without liquid", "Without liquid 0.89 · Less sensitive"]]);   // task #389: labels on the scale
    expect(Array.from(document.querySelectorAll(".eqr-b3 .eqr-v b")).map((b) => b.textContent)).toEqual(["0.71", "0.89", "0.65"]);
    fireEvent.click(screen.getByRole("button", { name: "Kotak MNC" }));
    expect(screen.getByText(/Kotak MNC: 0\.90 against Nifty MNC, similar; 85% of its moves explained/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "JioBlackRock Liquid" })).toBeNull();          // the liquid fund follows no share index: not on the ranges
  });
});

describe("Own benchmark, risk share, a 10% fall, each fund (M7, steps 3 to 6)", () => {
  it("shows each fund against its own benchmark, with the Stand-in tag and down / up weeks per 100", () => {
    view(<OwnBenchSection rk={RK} />);
    const hy = screen.getByText("ICICI Pru Multi Asset").closest("tr")!;
    expect(hy.textContent).toMatch(/68% Nifty 500 \+ 21% debt \+ 11% goldStand-in/);
    expect(screen.getByText("JioBlackRock Liquid").closest("tr")!.textContent).toMatch(/No share index/);
  });
  it("splits the list and the risk by fund or by type; the risk adds to 100% and rows carrying clearly more are shaded", () => {
    expect([shaded(20, 29.2), shaded(20, 21), shaded(20, 24.9)]).toEqual([true, false, false]);
    view(<RiskShareSection rk={RK} />);
    const risk = () => Array.from(document.querySelectorAll(".eqr-rs tbody td:last-child")).map((t) => parseFloat(t.textContent!));
    expect(Math.round(risk().reduce((a, b) => a + b, 0))).toBe(100);
    expect(Array.from(document.querySelectorAll(".eqr-rs tr.more th")).map((t) => t.textContent)).toEqual(["Kotak MNC", "Quant Small Cap"]);
    fireEvent.click(screen.getByRole("button", { name: "By fund type" }));
    expect(Array.from(document.querySelectorAll(".eqr-rs tbody th")).map((t) => t.textContent)).toEqual(["Thematic", "Small cap", "Hybrid", "Liquid"]);
  });
  it("sizes a 10% fall both ways and puts it on ₹10 lakh", () => {
    view(<FallSection rk={RK} />);   // task #235 (pack C4, C5): the Equity page's picture
    expect(document.querySelector(".fx-big b")!.textContent).toBe("−7.1%");
    expect(document.querySelector(".fx-rs")!.textContent).toBe("In rupees−₹71,000on ₹10 lakh");
    fireEvent.click(screen.getByRole("button", { name: "Only the Nifty 500 falls" }));
    expect(document.querySelector(".fx-big b")!.textContent).toBe("−6.5%");
    expect(screen.getByRole("heading", { name: /If the Nifty 500 fell 10%/ })).toBeTruthy();
    expect([...document.querySelectorAll(".fx-size button")].map((b) => b.textContent)[2]).toMatch(/the Nifty 500’s worst in 3 years$/);
  });
  it("lists each fund's risk, highest beta first, with what stands out", () => {
    view(<EachFundSection rk={RK} />);
    expect(Array.from(document.querySelectorAll(".eqr-each tbody th")).map((t) => t.firstChild!.textContent)).toEqual(["ICICI Pru Multi Asset", "Kotak MNC", "Quant Small Cap", "ICICI Pru MNC", "JioBlackRock Liquid"]);
    expect(standsOut(RK.funds[3])).toBe("Under 3 years of NAVs (2 years) · More risk than its share");
    expect(standsOut(RK.funds[1])).toBe("Moves more on its own benchmark than on the Nifty 500 (past year, weekly) · Benchmark is a stand-in");
  });
});
