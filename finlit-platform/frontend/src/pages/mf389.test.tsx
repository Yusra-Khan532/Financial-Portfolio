// @vitest-environment jsdom
// Task #389 PR A (developer file 32, MF portfolio): the top of the page, one section per step with the step in the address and remembered, Key figures in
// step 1, things to know as a pop-up, the score's one name, Record a sale and two-decimal NAVs, the funds table's sorting, pinned heading and cap, Where your
// gain or loss came from, the phone folds, the Today tile from the NAV feed, and the plan name from the plan list. Figures are made-up sample funds.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Holding, Line, MfPortfolio } from "../lib/mfPortfolio";

const st = vi.hoisted(() => ({ data: null as unknown, phone: false }));
vi.mock("../lib/mfPortfolio", async (orig) => ({
  ...(await orig<typeof import("../lib/mfPortfolio")>()),
  useMfSpread: () => ({ data: undefined, isPending: false, isError: false, error: null }),
  useMfPortfolio: () => ({ data: st.data, isPending: false, isError: false, error: null, refetch: () => {} }),
  useMfWrites: () => new Proxy({}, { get: () => ({ mutateAsync: vi.fn(), isPending: false }) }),
}));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiGet: vi.fn(async (p: string) => (p.endsWith("/book") ? { portfolios: [{ id: "groww", name: "Groww", broker: "Groww" }, { id: "coin", name: "Coin by Zerodha", broker: "Coin by Zerodha" }] } : Promise.reject(Object.assign(new Error("not stood in"), { status: 503 })))),
  apiSend: vi.fn(async () => ({ status: "saved", previous: null })) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "gold", upgrade: vi.fn(), has: () => true }), TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: { id: 1 } }) }));
import { MfPortfolioPage, readPlace } from "./MfPortfolio";
import { FundsTable, CAP_FUNDS } from "../mf/pack/MfFunds";
import { MfCards, MfParts, sinceLine } from "../mf/pack/MfTop";
import { mfTiles, partsAverage } from "../lib/mfTop";
import { foldSentence } from "../portfolio/pack/EqSteps385";
import { KnowPop } from "../portfolio/pack/Round388";
import { MF_PORTFOLIO_FAQ } from "../content/mfPortfolioFaqs";
import { planName } from "../lib/planNames";
import { PLAN_FOR_PORTFOLIO } from "../lib/planGates";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
const ln = (id: string, units: number, nav: number, boughtOn: string, pf: string): Line => ({ id, units, invested: Math.round(units * nav * 100) / 100, boughtOn, pf, side: "buy" });
const sc = (final: number | null, label: string | null, parts: [number, number, number, number] | null) => ({ locked: false, final, label, status: final == null ? "NOT SCORED" : "RATED", reason: null, runDate: null, inherited: null,
  parts: parts && { performance: parts[0], risk: parts[1], cost: parts[2], quality: parts[3] }, words: parts && { performance: parts[0] >= 60 ? "Strong" : parts[0] >= 40 ? "Fair" : "Weak", risk: "Fair", cost: "Fair", quality: "Strong" } });
const H = (id: string, name: string, nav: number, lines: Line[], extra: Partial<Holding> = {}): Holding => ({
  id, code: 100 + id.length, folio: "", units: 10, lots: [], lines, name, amc: "A", plan: "Direct", option: "Growth", category: "Equity Scheme - Flexi Cap Fund", categoryLabel: "Flexi Cap", active: true,
  nav, navDate: "2026-11-23", navStale: false, navNote: null, invested: null, investedWhy: null, current: 1000, currentWhy: null, gain: null, gainPct: null, gainWhy: null, xirr: null, xirrWhy: null,
  xirrKind: "cagr", returns: { r1y: 5, r3y: null, r5y: null, asOf: null, why: null }, ter: 0.5, terDate: null, terWhy: null, aum: 100, aumAsOf: null, aumWhy: null, weight: 50, weightWhy: null,
  score: sc(null, null, null) as unknown as Holding["score"], ...extra,
});
const PPFAS = H("aaa", "Parag Parikh Flexi Cap Fund", 94.93, [ln("p1", 3200, 78.2, "2024-08-12", "groww")], { navDate: "2026-11-20" });
const AXIS = H("bbb", "Axis Midcap Fund", 144.19, [ln("a1", 1800, 152.8, "2024-09-23", "coin")]);
const DATA = {
  plan: "gold", scoreLocked: false, limit: 500, count: 2, dataDate: "2026-11-23", holdings: [PPFAS, AXIS], sold: [],
  summary: { funds: 2, valued: 2, withCost: 2, gainFunds: 2, invested: null, current: null, gain: null, gainPct: null, navFrom: null, navTo: null, notes: [], xirr: null, xirrFunds: 0, xirrWhy: null, score: { locked: false, value: 59, label: "AVERAGE", why: null } },
  allocation: { byCategory: [], byAmc: [] }, concentration: { level: null, text: "", top1Pct: null, top3Pct: null }, disclaimer: "", scoreDisclaimer: "",
} as unknown as MfPortfolio;

let loc = "";
function Where() { const l = useLocation(); loc = l.search; return null; }
beforeEach(() => {
  st.data = DATA; st.phone = false; loc = "";
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: st.phone && /max-width/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
const show = async (url = "/mf-portfolio") => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[url]}><MfPortfolioPage /><Where /></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(document.querySelector(".px-strip")).toBeTruthy());
};
const bar = () => screen.getByRole("navigation", { name: "Views and sections" });
const has = (re: RegExp) => !!screen.queryByRole("heading", { name: re });

describe("Top of the page (T1–T5, S1–S2)", () => {
  it("T1: Add to [select] sits in the add row after Import and ⋯; the full-width bar is gone", async () => {
    await show();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Funds you add go to" })).toBeTruthy());
    const sel = screen.getByRole("combobox", { name: "Funds you add go to" }) as HTMLSelectElement;
    expect(sel.closest("label")!.className).toBe("px-addto");
    expect(sel.closest(".ptk-add")).toBeTruthy();
    expect([...sel.options].map((o) => o.textContent)).toEqual(["Groww", "Coin by Zerodha"]);
    expect(sel.closest("label")!.previousElementSibling!.textContent).toMatch(/⋯/);
    expect(document.querySelector(".acc-to")).toBeNull();
  });
  it("T2/T4/S1/S2: the Mutual Fund Score card (59, weighted by value) and three calm view cards; You are here / Open →", async () => {
    await show();
    const scoreCard = document.querySelector(".px-sc")!;
    expect(scoreCard.querySelector(".px-k")!.firstChild!.textContent).toBe("Mutual Fund Score");
    expect(scoreCard.querySelector(".px-ring b")!.textContent).toBe("59");
    expect(scoreCard.querySelector(".px-pill")!.textContent).toBe("Average");
    expect(scoreCard.querySelector(".px-x")!.textContent).toBe("Each fund counts by the value of your units.");
    expect([...document.querySelectorAll(".px-vw em")].map((e) => e.textContent)).toEqual(["You are here", "Open →", "Open →"]);
    expect(document.querySelectorAll(".px-crown").length).toBe(4);
    expect(document.querySelectorAll(".ptk-vdot, .ptk-vnew, .ptk-vhead").length).toBe(0);                     // T4c: the badges and "seen three ways" go
  });
  it("T5: Since your last visit says why it is blank on a first visit, and See what changed opens that step", async () => {
    expect(sinceLine("23 Nov", 1)).toEqual({ lead: "Since your last visit on 23 Nov:", rest: "1 new filing at companies inside your funds." });
    expect(sinceLine("23 Nov", 0).rest).toBe("nothing new at the companies inside your funds.");
    expect(sinceLine(null, 0).rest).toMatch(/shows from your next visit/);
  });
  it("T3: the four Score parts are the plain averages of the funds, with the file's hints and line", () => {
    const hs = [H("a", "A", 1, [], { score: sc(60, "AVERAGE", [26, 62, 57, 53]) as unknown as Holding["score"] }), H("b", "B", 1, [], { score: sc(70, "HEALTHY", [70, 66, 67, 89]) as unknown as Holding["score"] })];
    expect(partsAverage(hs).map((p) => [p.label, p.v])).toEqual([["Performance", 48], ["Risk", 64], ["Cost", 62], ["Quality", 71]]);
    render(<MfParts parts={partsAverage(hs)} open />);
    const p = document.querySelector(".px-parts")!;
    expect(p.textContent).toMatch(/Riskhigher = lower risk64.*Costhigher = cheaper62/);
    expect(p.textContent).toMatch(/These are the plain averages of your funds; the score above weights them by value\.$/);
    cleanup();
    render(<MfCards score={{ value: 59, label: "AVERAGE", valued: true, n: 2 }} tiles={mfTiles(hs, undefined, undefined)} colors={{ funds: "x", mix: "y", risk: "z" }} view="funds" onView={() => {}} partsOpen={false} onParts={() => {}} hasParts />);
    expect(screen.getByRole("button", { name: /See the four parts/ }).getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".px-vw .px-v")!.textContent).toBe("Average · 65");
    expect(document.querySelector(".px-vw .px-x")!.textContent).toMatch(/· each fund counted equally$/);
  });
});

describe("One section per step, in the address and remembered (T7, U1, RB7, RB8)", () => {
  it("a view opens on its first step; a step shows that section only; All sections shows them all; the step goes in the address", async () => {
    await show();
    expect(has(/^Your funds/)).toBe(true);
    expect(has(/^What changed at the companies inside your funds/)).toBe(false);
    fireEvent.click([...bar().querySelectorAll(".eqt-chip")].find((b) => b.textContent === "2What changed")!);
    await waitFor(() => expect(loc).toMatch(/step=wc/));
    expect(has(/^Your funds\b/)).toBe(false);
    fireEvent.click(within(bar()).getByRole("button", { name: "All sections" }));
    await waitFor(() => expect(loc).toMatch(/step=all/));
    expect(within(bar()).getByRole("button", { name: "All sections" }).getAttribute("aria-pressed")).toBe("true");
    expect(has(/^Your funds/) && has(/^What changed at the companies/)).toBe(true);
  });
  it("Key figures is not a step; an old Key figures step opens step 1; ?view and ?pf stay", async () => {
    await show("/mf-portfolio?pf=groww&step=kf-funds");
    expect(within(bar()).queryByRole("button", { name: /Key figures/ })).toBeNull();
    expect(has(/^Your funds/)).toBe(true);
    expect(loc).toMatch(/pf=groww/);
  });
  it("a change of view opens its first step (the step leaves the address) and the view is kept with the step for the next visit", async () => {
    await show("/mf-portfolio?step=wc");
    await waitFor(() => expect(readPlace(1)).toEqual({ view: "funds", step: "mfp-wc" }));
    fireEvent.click(document.querySelectorAll(".px-vw")[2]);
    await waitFor(() => expect(loc).toMatch(/view=risk/));
    expect(loc).not.toMatch(/step=/);
    await waitFor(() => expect(readPlace(1)?.view).toBe("risk"));
  });
  it("a bare address opens the member's remembered view and step", async () => {
    localStorage.setItem("finlit-mf-portfolio-place:1", JSON.stringify({ view: "funds", step: "mfp-wc" }));
    await show();
    await waitFor(() => expect(loc).toMatch(/step=wc/));
    expect(has(/^What changed at the companies/)).toBe(true);
  });
});

describe("Your funds (F1, F2, T6, X8)", () => {
  it("F1/F2: Record a sale under each fund (no Sell), the average buy NAV to 2 decimals", async () => {
    await show();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Record a sale of / }).length).toBe(2));
    expect(screen.queryByRole("button", { name: /^Sell\b/ })).toBeNull();
    const axis = screen.getByText("Axis Midcap Fund").closest("tr")!;
    expect(axis.querySelector("td.x-avg b")!.textContent).toBe("₹152.80");
  });
  it("T6: Data as of names the NAV dates and the filings window on Your funds", async () => {
    await show();
    expect(document.querySelector(".px-asof")!.textContent).toBe("Data as ofNAVs close of 23 Nov and 20 Nov·Filings the last 90 days");
  });
  it("X8: Today reads the day's NAV change once every valued fund has it; otherwise it says it is not loaded", async () => {
    await show();
    expect(document.querySelectorAll(".ptk-sub3 > div")[1].textContent).toMatch(/not loaded/);
    cleanup();
    st.data = { ...DATA, holdings: [{ ...PPFAS, change: { abs: -0.53, pct: -0.56, since: "2026-11-19" } }, { ...AXIS, change: { abs: 1.2, pct: 0.84, since: "2026-11-21" } }] };
    await show();
    await waitFor(() => expect(document.querySelectorAll(".ptk-sub3 > div")[1].textContent).toMatch(/since the previous close/));
    expect(document.querySelectorAll(".ptk-sub3 > div")[1].textContent).not.toMatch(/not loaded/);
  });
  it("I1/S2: every i has its own label and the page never calls the score anything but the Mutual Fund Score", async () => {
    await show("/mf-portfolio?step=all");
    const labels = [...document.querySelectorAll(".sp-i")].map((b) => b.getAttribute("aria-label"));
    expect(labels.length).toBeGreaterThan(3);
    expect(labels.filter((l) => l === "What does this mean?")).toEqual([]);
    expect(document.body.textContent).not.toMatch(/Health Score|Health parts|Your funds' health|Average health/);
  });
  it("S2/X14: no MF page source names the score Fund Health Score, Health Score or Health parts", () => {
    const dir = resolve(__dirname, "../mf/pack"), files = [...readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/test/.test(f)).map((f) => resolve(dir, f)),
      resolve(__dirname, "./MfPortfolio.tsx"), resolve(__dirname, "../lib/mfTop.ts"), resolve(__dirname, "../lib/mfKeyFigs.ts"), resolve(__dirname, "../content/mfPortfolioFaqs.ts")];
    for (const f of files) { const s = readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join("\n"); expect([f, /Fund Health Score|\bHealth Score\b|Health parts/.test(s)]).toEqual([f, false]); }
  });
  it("X1: the questions box reads the plan name from the plan list", () => {
    expect(MF_PORTFOLIO_FAQ.plan).toBe(planName(PLAN_FOR_PORTFOLIO));
    expect(readFileSync(resolve(__dirname, "../content/mfPortfolioFaqs.ts"), "utf8")).not.toMatch(/plan: "Silver"/);
  });
});

describe("The funds table (F3–F6)", () => {
  const fund = (i: number, final: number | null, label: string | null) => H(`f${String(i).padStart(2, "0")}`, `Fund ${String(i).padStart(2, "0")}`, 10, [], { code: 1000 + i, score: sc(final, label, final == null ? null : [final, 50, 50, 50]) as unknown as Holding["score"] });
  const table = (hs: Holding[]) => render(<MemoryRouter><FundsTable hs={hs} rk={undefined} sp={undefined} listLabel={null} actions={() => null} /></MemoryRouter>);
  const names = () => [...document.querySelectorAll(".mff-t tbody th a")].map((a) => a.textContent);
  it("W19: Balanced Advantage / Dynamic Asset Allocation reads Balanced Advantage in the category cells", () => {
    table([fund(1, 60, "AVERAGE"), { ...fund(2, 60, "AVERAGE"), categoryLabel: "Balanced Advantage / Dynamic Asset Allocation", category: "Hybrid Scheme - Dynamic Asset Allocation or Balanced Advantage" }]);
    expect(document.body.textContent).not.toMatch(/Dynamic Asset Allocation/);
    expect(document.body.textContent).toMatch(/Balanced Advantage/);
  });
  it("F3: a line under Risk and Cost", () => {
    table([fund(1, 60, "AVERAGE")]);
    const heads = [...document.querySelectorAll(".mff-t thead tr:last-child th")].map((t) => t.textContent);
    expect(heads.find((h) => /^Risk/.test(h!))).toMatch(/Strong = lower risk$/);
    expect(heads.find((h) => /^Cost/.test(h!))).toMatch(/Strong = cheaper$/);
    expect(document.querySelector(".mff-t .px-hint")).toBeTruthy();
  });
  it("F4: words sort by rank, not alphabet, and a dash sorts last both ways", () => {
    table([fund(1, 70, "HEALTHY"), fund(2, null, null), fund(3, 30, "POOR"), fund(4, 45, "WEAK"), fund(5, 55, "AVERAGE")]);
    const score = () => screen.getByRole("button", { name: /^Score/ });
    fireEvent.click(score());
    expect(names()).toEqual(["Fund 03", "Fund 04", "Fund 05", "Fund 01", "Fund 02"]);
    fireEvent.click(score());
    expect(names()).toEqual(["Fund 01", "Fund 05", "Fund 04", "Fund 03", "Fund 02"]);
  });
  it("F5: the heading row is pinned under the section bar (the table frame follows the page)", () => {
    table([fund(1, 60, "AVERAGE")]);
    expect(document.querySelector(".mff-t")!.closest(".eqs-frz")).toBeTruthy();
  });
  it("F6: above 27 funds, 25 rows then Show all N funds ▾; 27 or fewer show every row", () => {
    expect(CAP_FUNDS).toEqual({ over: 27, keep: 25 });
    table(Array.from({ length: 27 }, (_, i) => fund(i + 1, 50, "AVERAGE")));
    expect(names()).toHaveLength(27);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
    cleanup();
    table(Array.from({ length: 30 }, (_, i) => fund(i + 1, 50, "AVERAGE")));
    expect(names()).toHaveLength(25);
    fireEvent.click(screen.getByRole("button", { name: /^Show all 30 funds/ }));
    expect(names()).toHaveLength(30);
  });
  it("F9/U2: things to know leave the page: a pill by the heading opens them in a pop-up", async () => {
    render(<MemoryRouter><KnowPop.Provider value={true}><FundsTable hs={[fund(1, 60, "AVERAGE"), fund(2, 62, "AVERAGE")]} rk={undefined} sp={undefined} listLabel={null} actions={() => null} /></KnowPop.Provider></MemoryRouter>);
    const pill = await screen.findByRole("button", { name: /things? to know/ });
    expect(pill.closest(".sp-sec-h")).toBeTruthy();
    expect(document.querySelector(".eq-ins-h")).toBeNull();
    await act(async () => { fireEvent.click(pill); });
    expect(screen.getByRole("dialog", { name: /to know/i })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /to know/i })).toBeNull());
  });
});

// "Where your gain or loss came from" (F7, L1–L8) left the page in task #389 reopened (developer file 40 v4, A1): see mf40v4.test.tsx. The shared
// gainLoss() stays tested in portfolio/shared/shared385.test.ts and pages/etf390.test.tsx (the ETF page still shows it).

describe("Phone (P2–P4)", () => {
  it("P2c: a section's sentence is its first line, cut at the first full stop after 30 characters, at most 140", () => {
    expect(foldSentence("Each fund's gain or loss in rupees, on what you paid for it. Biggest gain at the top.")).toBe("Each fund's gain or loss in rupees, on what you paid for it.");
    expect(foldSentence("Short. Then more words follow here for a while.")).toBe("Short. Then more words follow here for a while.");
    expect(foldSentence("x ".repeat(100)).length).toBeLessThanOrEqual(140);
  });
  it("P2/P4: with All sections on a phone, every section after the first folds to its heading, one line and Open ▾; with one step chosen, nothing folds", async () => {
    st.phone = true;
    await show("/mf-portfolio?step=all");
    const fold = document.querySelector('[data-fold="mfp-wc"]')!;
    expect(fold.querySelector(".eqf-h")!.textContent).toBe("What changed at the companies inside your funds");
    expect(fold.querySelector(".eqf-sum")!.textContent).toMatch(/Open ▾$/);
    expect(document.querySelector('[data-fold="mfp-funds"]')).toBeNull();
    fireEvent.click(fold.querySelector(".eqf-sum")!);
    expect(screen.getByRole("button", { name: /Close/ })).toBeTruthy();
    cleanup();
    await show("/mf-portfolio?step=wc");
    expect(document.querySelector(".eqf-sum")).toBeNull();
  });
});
