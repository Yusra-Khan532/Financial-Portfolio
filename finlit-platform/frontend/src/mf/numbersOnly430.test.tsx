// @vitest-environment jsdom
// Task #430 (team, 27 Nov 2026): "there is no need of write up in this we just need the numbers to show nothing else and this is applicable for all
// the columns". The Mutual funds table's cells show their figure only: no band words ("0–8%", "Negative"), no "Growth option's returns (before
// payouts)", no "Insufficient history" / "IDCW option", no size or cost words, no bars or check marks, no score word. Each word moves to the cell's
// hover text (and screen readers), and "How to read this table" says so.
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_QUERY, GROWTH_RETURNS_LABEL, GROWTH_SCORE_LABEL, type ColId, type FundRow } from "../lib/mf";
import { UIProvider } from "../lib/ui";
import { FundTable } from "./FundTable";
import { ScoreCell } from "./ScoreCell";

vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()),
  useAuth: () => ({ ready: true, user: null, plan: "basic", limits: {}, isAdmin: false, seesAll: false, showcase: [], prismReportsPerDay: null, refresh: async () => {}, signOut: async () => {} }) }));

const src = (f: string) => readFileSync(resolve(process.cwd(), "src", f), "utf8");
const G = { code: 122639, name: "Parag Parikh Flexi Cap Fund", r1y: 1.45, r3y: 12.98, r5y: 12.12, retDate: "2026-11-26", label: GROWTH_RETURNS_LABEL };
const growth = { code: 122639, name: "Parag Parikh Flexi Cap Fund", amc: "PPFAS Mutual Fund", category: "Equity Scheme - Flexi Cap Fund", plan: "Direct", option: "Growth", optionClass: "Growth",
  nav: 95.76, navDate: "2026-11-26", change: 0.2, active: true, r1y: 1.45, r3y: 12.98, r5y: 12.12, sip3y: 7.48, sip5y: 13.04, aum: 147000, aumKind: "q", aumAsOf: "2026-09-30",
  ter: 0.63, noReturns: null } as unknown as FundRow;
const idcw = { ...growth, code: 153964, option: "Monthly IDCW Payout", optionClass: "IDCW", r1y: null, r3y: null, r5y: null, sip3y: null, sip5y: null, noReturns: "idcw", growthReturns: G } as unknown as FundRow;
const young = { ...growth, code: 150001, name: "Young Fund", r3y: null, r5y: null, sip5y: null, noReturns: "young" } as unknown as FundRow;
const COLS: ColId[] = ["nav", "change", "r1y", "r3y", "r5y", "sip3y", "sip5y", "aum", "ter"];

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const draw = () => render(
  <MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><UIProvider>
    <FundTable rows={[growth, idcw, young]} cols={COLS} q={EMPTY_QUERY} onSort={() => {}} picked={[]} onPick={() => {}} />
  </UIProvider></QueryClientProvider></MemoryRouter>);

describe("task #430: numbers only in the Mutual funds table", () => {
  it("no cell carries words or bars under its figure, in any column", () => {
    const { container } = draw();
    const cells = [...container.querySelectorAll("tbody td")];
    expect(cells.length).toBe(3 * COLS.length);
    for (const td of cells) {
      expect(td.querySelector("small"), td.innerHTML).toBeNull();
      expect(td.querySelector(".mf-rbar, .mf-meter, .mf-band, .mf-size, .mf-gr"), td.innerHTML).toBeNull();
    }
    const seen = cells.map((td) => [...td.querySelectorAll("*")].filter((e) => !e.closest(".sr-only") && !e.children.length).map((e) => e.textContent).join("")).join(" | ");
    for (const w of ["Negative", "0–8%", "8–12%", "Insufficient history", "IDCW option", "Growth option", "for category", "Large", "stopped"]) expect(seen).not.toContain(w);
  });
  it("the words are still there on hover: a return's band, a size band, a cost level, the reason for a dash", () => {
    const { container } = draw();
    const titles = [...container.querySelectorAll("tbody td [title]")].map((e) => e.getAttribute("title")).join(" | ");
    expect(titles).toMatch(/Band: 12–15%/);                          // 3 years at 12.98% a year
    expect(titles).toMatch(/Size: Very large/);
    expect(titles).toMatch(/Insufficient history/);                   // the young fund's dashes
    expect(titles).toContain(GROWTH_RETURNS_LABEL);                    // the IDCW row's figures are its Growth option's, named on hover
  });
  it("an IDCW row still shows its Growth option's return, never as its own: marked with a small G (task #444) and named for screen readers", () => {
    const { container } = draw();
    const row = container.querySelectorAll("tbody tr")[1];
    const g = row.querySelector("td.mf-c-r3y .mf-grf")!;
    expect(g.textContent).toContain("+12.98%");
    expect(g.querySelector(".mf-gmark")!.textContent).toBe("G");
    expect(g.querySelector(".sr-only")!.textContent).toContain(GROWTH_RETURNS_LABEL);
  });
  it("the score cell on the list shows the figure and the four part letters, the word only for screen readers", () => {
    const item = { code: 153964, symbol: null, plan: "Direct", group: "EQ-BROAD", final: 58.7, label: "Average", status: "RATED", reason: null, rank: null, rankOf: null, flags: [], confidence: 0.9,
      pillars: { performance: "Fair", risk: "Strong", cost: "Fair", quality: "Weak" }, inherited: { code: 122639, name: "Parag Parikh Flexi Cap Fund", label: GROWTH_SCORE_LABEL, why: "This option pays out." } };
    const { container } = render(<ScoreCell item={item} locked={false} why="" bare />);
    expect(container.querySelector("small")).toBeNull();
    expect(container.querySelector(".mfs-pv")!.textContent).toBe("58.7");
    expect(container.querySelectorAll(".mfs-part")).toHaveLength(4);
    expect(container.querySelector(".sr-only")!.textContent).toContain(GROWTH_SCORE_LABEL);
    expect(container.querySelector(".mfs-cell")!.getAttribute("title")).toContain("Average");
    expect(src("mf/FundTable.tsx")).toMatch(/etf=\{isEtfCategory\(r\.category\)\} bare why=/);
  });
  it("elsewhere (ETF list, screener) the score cell keeps its word", () => {
    const { container } = render(<ScoreCell item={{ code: 1, symbol: null, plan: "Direct", group: "EQ-BROAD", final: 70, label: "Healthy", status: "RATED", reason: null, pillars: null, rank: null, rankOf: null, flags: [], confidence: 1 }} locked={false} why="" />);
    expect(container.querySelector("small")!.textContent).toBe("Healthy");
  });
  it("How to read this table says the bands and the Growth option's figure are on hover, not under the figures", () => {
    const page = src("pages/Funds.tsx");
    expect(page).not.toContain("The small word under");
    expect(page).not.toContain("The word under the fund size");
    expect(page).toContain("The table shows figures only; hover or tap a return to see its band");
    expect(page).toContain("with a small <b>G</b> after it");
  });
});
