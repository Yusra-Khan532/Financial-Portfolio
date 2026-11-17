// @vitest-environment jsdom
// Task #183 (Equity portfolio): Your shares by plan, the views, sorting, band filters and group rows.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../components/CoLogo", () => ({ CoLogo: () => null }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
import { SharesTable } from "./SharesTable";
import type { Line, Model, Ready, Tab } from "../lib/portfolioOverview";

afterEach(cleanup);
const fig = (v: number | null) => ({ value: v });
const st = { available: true, period: "FY26", periodEnd: "2026-03-31", revenue: fig(1), other_income: fig(1), operating_profit: fig(1), finance_costs: fig(1), net_profit: fig(1), eps: fig(1), tax_ratio: fig(1) };
const ready = (symbol: string, industry: string, cap: number, prism: number, iq: number, words: Record<string, string | null>, pillars: Record<string, number | null>): Ready => ({
  symbol, status: "ready", name: symbol + " Ltd", sector: industry, industry, isBank: false, basis: "consolidated", reportAt: "2026-10-30", price: 100, changePct: 1, priceAsOf: "2026-11-13", marketCapCr: cap,
  ratios: { pe: fig(1), pb: fig(1), roe: fig(1), dividend_yield: fig(1), debt_to_equity: fig(1) }, financials: { year: st, quarter: st },
  prism: { state: "rated", final: prism, label: prism >= 70 ? "STRONG" : prism >= 55 ? "HEALTHY" : prism >= 45 ? "AVERAGE" : "WEAK", status: "RATED", parts: { fundamental: 60, valuation: 40, quality: 75, risk: 55 },
    shortTerm: { score: 30, word: "Uptrend" }, longTerm: { score: -40, word: "Downtrend" }, at: null, reason: null },
  finlit: { overall: iq, band: "healthy", word: iq >= 80 ? "Strong" : iq >= 65 ? "Healthy" : iq >= 50 ? "Mixed" : "Watch", pillars: pillars as never, pillarWords: words as never },
} as unknown as Ready);
const P = { quality: 70, growth: 55, profitability: 60, balance: 52, technical: 35 }, W = { quality: "Strong", growth: "Mixed", profitability: "Healthy", balance: "Mixed", technical: "Watch" };
const LINES: Line[] = [
  { symbol: "ICICIBANK", name: "ICICI Bank", ov: ready("ICICIBANK", "Banks", 1100000, 84, 84, { ...W, balance: null }, { ...P, balance: null }) },
  { symbol: "BHEL", name: "BHEL", ov: ready("BHEL", "Electrical Equipment", 90000, 42, 48, W, P) },
  { symbol: "SUZLON", name: "Suzlon", ov: ready("SUZLON", "Electrical Equipment", 80000, 60, 66, W, P) },
  { symbol: "KRN", name: "KRN", ov: ready("KRN", "Industrial Products", 5000, 50, 57, W, P) },
];
const PAGE = { order: ["ICICIBANK", "BHEL", "SUZLON", "KRN"], corr: [[1, .2, .1, .1], [.2, 1, .8, .3], [.1, .8, 1, .2], [.1, .3, .2, 1]], avg_with_rest: {}, groups: [], short_history: [] } as never;
const open = (model: Model, tab: Tab = "overview") => render(<MemoryRouter><SharesTable lines={LINES} meta={{}} page={PAGE} mode="eq" colors={{}} model={model} tab={tab} period="year" limit={30} state="ready" onTab={() => {}} onPeriod={() => {}}
  actions={() => null} qtyOf={(s) => ({ ICICIBANK: 10, BHEL: 100, SUZLON: 1000, KRN: 1 } as Record<string, number>)[s] ?? null} onQty={() => {}} /></MemoryRouter>);
const heads = () => [...document.querySelectorAll("thead tr:last-child th")].map((t) => (t.querySelector("button")?.childNodes[0]?.textContent ?? t.textContent ?? "").trim()).filter((x) => x && x !== "Actions");
const order = () => [...document.querySelectorAll("tbody tr td.pfx-name b")].map((b) => b.textContent);

describe("columns by plan", () => {
  it("Gold: Prism, then four parts, then two technical views; a band names the groups and a thick divider follows the score", () => {
    open("prism");
    expect(heads()).toEqual(["Share", "Size", "Qty", "Value", "Latest price", "Today", "Prism", "G&P", "Val.", "Qual.", "Risk", "Short term", "Long term", "Moves with rest"]);
    expect([...document.querySelectorAll(".eq-band th")].map((t) => t.textContent).filter(Boolean)).toEqual(["FinLit Prism", "Fundamental pillars", "Technical pillars", "Against peers"]);
    expect(document.querySelector("thead tr:last-child th.eq-div")?.textContent).toMatch(/^G&P/);
    expect(document.body.textContent).not.toMatch(/FinLit IQ/);
  });
  it("Silver: the FinLit IQ, four fundamental pillars and one technical pillar, each with the report's word; a bank's balance sheet is '–'", () => {
    open("finlit");
    expect(heads()).toEqual(["Share", "Size", "Qty", "Value", "Latest price", "Today", "FinLit IQ", "Quality", "Growth", "Profitability", "Balance sheet", "Technical", "Moves with rest"]);
    const icici = screen.getByText("ICICIBANK").closest("tr")!;
    expect([...icici.querySelectorAll("td.c .pfx-sc")].map((c) => c.childNodes[0]?.textContent?.trim())).toEqual(["84", "Strong", "Mixed", "Healthy", "−", "Watch"]);
    expect(icici.querySelectorAll("td.c .pfx-sc")[4].getAttribute("title")).toMatch(/^No balance-sheet pillar: banks and lenders/);   // the blank says why
    expect(document.body.textContent).not.toMatch(/Prism/);
  });
});

describe("sorting, filters and weak rows", () => {
  it("every heading sorts both ways, including Share, Size, Qty and Value", () => {
    open("prism");
    const click = (n: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${n}`) }));
    click("Share"); expect(order()).toEqual(["BHEL", "ICICIBANK", "KRN", "SUZLON"]); click("Share"); expect(order()).toEqual(["SUZLON", "KRN", "ICICIBANK", "BHEL"]);
    click("Value"); expect(order()).toEqual(["KRN", "ICICIBANK", "BHEL", "SUZLON"]); click("Value"); expect(order()[0]).toBe("SUZLON");
    click("Qty"); expect(order()).toEqual(["KRN", "ICICIBANK", "BHEL", "SUZLON"]);
    click("Size"); expect(order()[3]).toBe("KRN");                                                       // large, large, large, small
    expect(document.querySelector('th[aria-sort="ascending"]')?.textContent).toMatch(/^Size▲/);
  });
  it("band filters follow the plan: Gold Strong / Healthy / Average / Weak, Silver Strong / Healthy / Mixed / Watch", () => {
    open("prism");
    expect(within(screen.getByRole("group", { name: /Prism band/ })).getAllByRole("button").map((b) => b.textContent)).toEqual(["All 4", "Strong 1", "Healthy 1", "Average 1", "Weak 1"]);
    fireEvent.click(screen.getByRole("button", { name: "Weak 1" })); expect(order()).toEqual(["BHEL"]);
    cleanup(); open("finlit");
    expect(within(screen.getByRole("group", { name: /FinLit IQ band/ })).getAllByRole("button").map((b) => b.textContent)).toEqual(["All 4", "Strong 1", "Healthy 1", "Mixed 1", "Watch 1"]);
  });
  it("weak rows get a light red tint", () => {
    open("prism");
    expect([...document.querySelectorAll("tr.eq-weakrow td.pfx-name b")].map((b) => b.textContent)).toEqual(["BHEL"]);
  });
});

describe("views", () => {
  it("Overview is one flat list", () => { open("prism"); expect(document.querySelectorAll(".pfx-secrow")).toHaveLength(0); expect(order()).toHaveLength(4); });
  it("By sector groups by NSE's macro sector, sector or industry; group rows fold, with Open all and Close all, and show count, share of the list, how they move together and the average", () => {
    open("prism", "sector");
    const sw = screen.getByRole("group", { name: "Group by" });
    expect(within(sw).getAllByRole("button").map((b) => b.textContent)).toEqual(["Macro sector · 2", "Sector · 2", "Industry · 3"]);
    const rows = () => [...document.querySelectorAll(".pfx-secrow button")].map((b) => b.textContent?.replace(/\s+/g, " ").trim());
    expect(rows()).toEqual([expect.stringMatching(/^▸Capital Goods 3 shares75% of the list · moves together \.43/), expect.stringMatching(/^▸Financial Services 1 share25% of the list/)]);
    expect(order()).toEqual([]);                                                                         // folded at first
    fireEvent.click(screen.getByRole("button", { name: "Open all" })); expect(order()).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Close all" })); expect(order()).toHaveLength(0);
    fireEvent.click(within(sw).getByRole("button", { name: /^Macro sector/ }));
    expect(rows().map((r) => r?.replace(/^▸/, "").split(" ")[0])).toEqual(["Industrials", "Financial"]);
    fireEvent.click(within(sw).getByRole("button", { name: /^Industry/ }));
    expect(rows().some((r) => r?.includes("Electrical Equipment") && r.includes("moves together .80"))).toBe(true);
  });
  it("By company size: group rows plus three size cards", () => {
    open("prism", "size");
    expect([...document.querySelectorAll(".eq-sizecard")].map((c) => c.textContent)).toEqual(["Large cap3 shares75% of the list · average Prism 62", "Mid cap0 shares0% of the list", "Small cap1 share25% of the list · average Prism 50"]);
    expect([...document.querySelectorAll(".pfx-secrow b")].map((b) => b.textContent)).toEqual(["Large", "Small"]);
  });
});
