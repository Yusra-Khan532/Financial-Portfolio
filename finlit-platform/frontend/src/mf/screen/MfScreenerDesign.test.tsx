// @vitest-environment jsdom
// Task #131 (14 Nov 2026, the team's design pack "finlit-02-fund-screener"): one test per change C-1 to C-12 and the pack's "Done when" list.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ calls: [] as string[], gold: true }));
const hist = (edges: number[]) => ({ edges, bins: edges.slice(1).map((_, i) => i + 1), n: 10, m: 14 });
const ROW = (code: number, name: string, category: string) => ({ code, name, amc: "Alpha Mutual Fund", category, plan: "Direct", option: "Growth", optionClass: "Growth", nav: 10, navDate: "2026-10-20", change: 0.2, active: true,
  r1y: 5, r3y: 12, r5y: null, noReturns: null, ter: 0.6, aum: 1200, fall3y: -14, x: { risk: { vol3: 15 }, rank: { "3y": { rank: 2, of: 9 } }, ex: {}, category: {} } });
vi.mock("../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../lib/api")>()),
  apiGet: vi.fn(async (path: string) => {
    st.calls.push(path);
    if (path.startsWith("/api/mf/scores")) return { locked: false, total: 2, items: [{ code: 1, final: 72.1, label: "Healthy", status: "RATED", reason: null }, { code: 2, final: null, label: null, status: "NOT RATED", reason: "Not scored: too young." }] };
    if (path.startsWith("/api/mf/filters")) {
      const numeric: Record<string, unknown> = {};
      for (const k of ["aum", "age", "r1y", "r3y", "r5y", "ter", "ter_rel", "vol3", "fall", "sharpe", "eq_pct"]) numeric[k] = hist([0, 1, 2, 5, 10]);
      return { totals: { schemes: 20, active: 18, withHistory: 10 }, amcs: [], categories: [], dataDate: "2026-10-20", screen: {
        total: 14, numeric, type: { equity: 9, debt: 5 }, subs: [{ key: "mid-cap", label: "Mid Cap", tab: "equity", n: 4 }, { key: "liquid", label: "Liquid", tab: "debt", n: 5 }], cap: { mid: 4 }, style: { active: 14, passive: 0 },
        mat: {}, struct: { open: 14 }, amcs: [{ name: "Axis Mutual Fund", n: 3 }], house: {}, plans: { Direct: 14 }, options: { Growth: 14 }, inst: { fund: 14, etf: 0 }, status: { active: 14, stopped: 0 }, fresh: {},
        aumbasis: {}, aumrank: {}, exit: {}, chk: {}, chk_each: {}, tick: {}, rk: {}, tags: [], sectors: [], portfolio: {}, cflow: {}, cstreak: {}, csize: {},
        built: { rows: 20, run: "2026-10-20", portfolioDate: "2026-09-30", flowMonth: "2026-09-01", tagged: 2, indexTagged: 0 },
        scatter: { points: [[1, "Alpha Mid Cap Fund", 10, 12, "equity"], [2, "Beta Liquid Fund", 6.8, 0.2, "debt"], [3, "Gamma Balanced", -12, 9, "hybrid"]], eligible: 1137, shown: 400 },
        flows: [{ key: "liquid", label: "Liquid", months: ["2026-09", "2026-10"], net: [-95743, 70534] }, { key: "flexi", label: "Flexi Cap", months: ["2026-09", "2026-10"], net: [6702, 4980] },
          { key: "fof-overseas", label: "FoF Overseas", months: ["2026-09", "2026-10"], net: [-159, -370] }] } };
    }
    return { total: 2, page: 1, size: 50, pages: 1, dataDate: "2026-10-20", items: [ROW(1, "Alpha Mid Cap Fund", "Equity Scheme - Mid Cap Fund"), ROW(2, "Beta Liquid Fund", "Debt Scheme - Liquid Fund")] };
  }),
}));
vi.mock("../../lib/ui", () => ({ useUI: () => ({ has: (p: string) => (p === "gold" ? st.gold : true), upgrade: vi.fn(), toast: vi.fn() }), TIER: {} }));
import { MfScreenerPage, defaultChips } from "../../pages/MfScreener";
import { flowRows, axisPct } from "./Graphics";
import { GROUPS, findGroup, planOn } from "./Panel";
import { DEFAULTS } from "../../lib/mfScreen";
import { SORTS } from "../../lib/mfScreenDefs";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
const Where = () => <output data-testid="loc">{useLocation().search}</output>;
const mount = (at = "/funds/screener") => { const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[at]}><Routes><Route path="*" element={<><MfScreenerPage /><Where /></>} /></Routes></MemoryRouter></QueryClientProvider>); };
const panel = () => screen.getByRole("complementary", { name: "Filters" });
const setNarrow = (on: boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("max-width: 900px"), media: q, addEventListener() {}, removeEventListener() {} }));
const css = readFileSync(join(__dirname, "..", "..", "styles", "mfscreen.css"), "utf8");
beforeEach(() => { st.calls = []; st.gold = true; setNarrow(false); try { localStorage.clear(); } catch { /* none */ } });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("task #131: the Mutual Fund Screener as the team's design", () => {
  it("C-1 the 11 presets (task #356: in five labelled rows); the one that is on is dark and its filters show as chips; clicking again turns it off", async () => {
    mount(); await screen.findAllByText("Alpha Mid Cap Fund");
    expect(document.querySelectorAll(".mfs-presets .mfs-preset")).toHaveLength(11);
    expect([...document.querySelectorAll(".mfs-pgrp .mfs-pg")].map((x) => x.textContent)).toEqual(["Equity", "Debt", "Index and themes", "Hybrid", "Mutual Fund Score"]);
    fireEvent.click(screen.getByRole("button", { name: /Defence and aerospace funds/ }));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toContain("tags=defence"));
    expect(screen.getByRole("button", { name: /Defence and aerospace funds/ }).className).toContain("is-on");
    expect(screen.getByRole("button", { name: /Remove filter:.*efence/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Defence and aerospace funds/ }));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).not.toContain("tags=defence"));
    expect(css).toMatch(/\.mfs-preset\.is-on \{ background: var\(--text\)/);
    expect(css).not.toMatch(/\.mfs-prow \{ flex-wrap: nowrap/);
  });
  it("C-2 'Find a filter' at the top of the panel jumps to the matching group and opens it", async () => {
    mount(); await screen.findAllByText("Alpha Mid Cap Fund");
    const find = within(panel()).getByPlaceholderText("Find a filter, e.g. expense, ELSS, worst fall…");
    expect(panel().querySelector(".mfs-find")!.compareDocumentPosition(panel().querySelector('[data-fgx="type"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const costBtn = () => within(panel()).getByRole("button", { name: /^Cost/ });
    expect(costBtn().getAttribute("aria-expanded")).toBe("false");
    fireEvent.change(find, { target: { value: "expense" } });
    await waitFor(() => expect(costBtn().getAttribute("aria-expanded")).toBe("true"), { timeout: 2000 });
    expect(within(panel()).getByRole("status").textContent).toMatch(/Opened Cost/);
    fireEvent.change(find, { target: { value: "zzzz" } });
    expect(within(panel()).getByRole("status").textContent).toMatch(/No filter matches “zzzz”/);
    expect([findGroup("ELSS")?.id, findGroup("worst fall")?.id, findGroup("expense")?.id, findGroup("x")]).toEqual(["subcat", "risk", "cost", null]);
  });
  it("C-3 18 groups (task #358: under four headings, all folded until opened), each showing how many choices are on ('4 on')", async () => {
    mount(); await screen.findAllByText("Alpha Mid Cap Fund");
    const heads = [...panel().querySelectorAll(".fgx-g .fgx-t")].map((x) => x.textContent);
    expect(heads).toEqual(GROUPS.map((g) => g.title)); expect(heads).toHaveLength(17);
    expect([...panel().querySelectorAll(".mfs-sec")].map((x) => x.textContent)).toEqual(["Start here · what and how", "Quick shortlist", "Risk, returns and cost", "Narrow down"]);
    expect(heads.slice(0, 4)).toEqual(["Type and category", "Sub-category", "Plan, option and status", "FinLit Mutual Fund Score"]);
    expect(heads.slice(4, 7)).toEqual(["Risk", "Returns", "Cost"]);
    const open = [...panel().querySelectorAll(".fgx-g")].map((g) => g.classList.contains("is-open"));
    expect(open.every((o) => !o)).toBe(true);
    expect(within(panel()).getByRole("button", { name: /^Plan, option and status/ }).textContent).toMatch(/4 on/);
    expect(planOn(DEFAULTS)).toBe(4);
    expect(within(panel()).queryByRole("button", { name: /^Data quality and lists/ })).toBeNull();   // task #368: off the list
    fireEvent.click(within(panel()).getByRole("button", { name: /^Debt maturity band/ }));
    expect(panel().textContent).toMatch(/The band SEBI sets for the category/);
  });
  it("C-4 a Sort button with a short menu replaces the native select; same choices; Mutual Fund Score sort has no Gold tag", async () => {
    mount(); await screen.findAllByText("Alpha Mid Cap Fund");
    expect(document.querySelector(".fgx-sort select")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Sort: fund size, largest first/i }));
    const items = within(screen.getByRole("menu", { name: "Sort by" })).getAllByRole("menuitemradio").map((b) => b.textContent!.replace("✓", ""));
    expect(items).toHaveLength(SORTS.length); expect(items).toContain("Mutual Fund Score, high to low"); expect(items).toContain("SIP return (3 years), high to low");
    expect(document.body.textContent).not.toMatch(/\(Gold\)/);
    fireEvent.click(screen.getByRole("menuitemradio", { name: /expense ratio, low to high/i }));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toContain("sort=ter"));
  });
  it("C-5 the default view shows as removable chips, not a sentence", async () => {
    mount(); await screen.findAllByText("Alpha Mid Cap Fund");
    const bar = screen.getByLabelText("Active filters");
    expect(within(bar).getByText("Default view")).toBeTruthy();
    expect([...bar.querySelectorAll(".mfs-dchip")].map((c) => c.textContent!.replace(/\s*×$/, ""))).toEqual(["Direct plan", "Growth option", "Still publishing", "Mutual funds and ETFs"]);
    expect(bar.textContent).not.toMatch(/Choose a filter on the left/);
    fireEvent.click(within(bar).getByRole("button", { name: /Remove Direct plan/ }));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toMatch(/plans=(&|$)|plans=$/));
    expect(defaultChips({ ...DEFAULTS, status: "both", inst: ["fund"] }).map((c) => c.id)).toEqual(["plan", "option"]);
  });
  it("C-6 Result at a glance is open on arrival with both parts, and Hide hides it", async () => {
    try { localStorage.setItem("finlit.ui.mfscreen.glance", JSON.stringify({ v: 1, d: false })); } catch { /* none */ }
    mount(); await screen.findAllByText("Alpha Mid Cap Fund");
    expect(screen.getByRole("heading", { name: "Result at a glance" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Return against risk" })).toBeTruthy(); expect(screen.getByRole("heading", { name: "Where the money is moving" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("heading", { name: "Return against risk" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByRole("heading", { name: "Return against risk" })).toBeTruthy();
  });
  it("C-7 dots coloured by type with a legend, a dashed 0% line, signed axis labels and a label on hover or focus; the 'does not rank it' note stays", async () => {
    mount(); await screen.findAllByText("Alpha Mid Cap Fund");
    const fig = document.querySelector(".mfs-fig")!;
    expect([...fig.querySelectorAll(".dot")].map((d) => d.getAttribute("class"))).toEqual(["dot t-equity", "dot t-debt", "dot t-hybrid"]);
    expect([...fig.querySelectorAll(".mfs-sc-key li")].map((l) => l.textContent)).toEqual(["Equity", "Hybrid", "Debt"]);
    expect([...fig.querySelectorAll("svg text")].map((t) => t.textContent)).toContain("−10%");   // the axis label carries its sign
    expect(axisPct(-10)).toBe("−10%"); expect(axisPct(0)).toBe("0%");
    expect(css).toMatch(/\.mfs-sc \.ax0 \{[^}]*stroke-dasharray/);
    fireEvent.focus(fig.querySelectorAll("a")[0]);
    expect(within(fig as HTMLElement).getByRole("status").textContent).toMatch(/Alpha Mid Cap Fund.*Return, 3 years a year: \+10\.0%.*Volatility, 3 years: 12\.0%/);
    expect(fig.textContent).toMatch(/the 400 largest of the 1,137 that have both figures/);
    expect(fig.textContent).toMatch(/does not rank it/);
  });
  it("C-8 flow bars diverge from a centre line on one scale, largest first; a category far above the rest is drawn to the edge and marked 'bar cut'", async () => {
    mount(); await screen.findAllByText("Alpha Mid Cap Fund");
    const list = screen.getByRole("list", { name: /Net flow by category/ });
    expect([...list.querySelectorAll(".mfs-fl-n")].map((x) => x.textContent)).toEqual(["Liquid", "Flexi Cap", "FoF Overseas"]);
    expect([...list.querySelectorAll(".mfs-fl-v")].map((x) => x.textContent)).toEqual(["+₹70,534 Cr", "+₹4,980 Cr", "−₹370 Cr"]);
    expect(list.querySelectorAll("em")).toHaveLength(1); expect(list.querySelector("em")!.textContent).toBe("bar cut");
    expect(document.body.textContent).toMatch(/Money in on the right, money out on the left\. Each bar is the category's latest month \(Oct 2026\)\. Liquid funds take in far more than any other category, so its bar is cut\./);
    const rows = flowRows([{ key: "a", label: "A", months: ["2026-10"], net: [100] }, { key: "b", label: "B", months: ["2026-09", "2026-10"], net: [50, null] }, { key: "c", label: "C", months: ["2026-10"], net: [null] }]);
    expect(rows.map((r) => [r.key, r.month, r.cut, r.width])).toEqual([["a", "2026-10", false, 1], ["b", "2026-09", false, 0.5]]);   // the latest month with a figure; none at all: dropped
  });
  it("C-9 a Mutual Fund Score column after the fund name: the score with its band word for Gold; a lock below Gold, never a value", async () => {
    mount(); await screen.findAllByText("Alpha Mid Cap Fund");
    const heads = [...document.querySelectorAll(".mfs-table thead th")].map((th) => th.textContent!.trim());
    expect(heads[0]).toMatch(/Fund/); expect(heads[1]).toMatch(/^Mutual Fund Score/);
    await waitFor(() => expect(document.querySelector(".mfs-table tbody tr td.mfs-hs")!.textContent).toMatch(/72\.1.*Healthy/));
    cleanup(); st.gold = false; st.calls = [];
    mount(); await screen.findAllByText("Alpha Mid Cap Fund");
    expect(document.querySelector(".mfs-table tbody tr td.mfs-hs .ico, .mfs-table tbody tr td.mfs-hs svg")).toBeTruthy();
    expect(document.querySelector(".mfs-table tbody")!.textContent).not.toMatch(/72\.1/);
    expect(st.calls.some((c) => c.startsWith("/api/mf/scores"))).toBe(false);
  });
  it("C-10 a tick box before each fund name; the compare bar appears under the table (up to 4)", async () => {
    mount(); await screen.findAllByText("Alpha Mid Cap Fund");
    fireEvent.click(screen.getByRole("checkbox", { name: "Compare Alpha Mid Cap Fund" }));
    const bar = screen.getByRole("region", { name: "Funds chosen to compare" });
    expect(bar.textContent).toMatch(/Alpha Mid Cap Fund/); expect((within(bar).getByRole("button", { name: /Compare 1 fund/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Compare Beta Liquid Fund" }));
    expect((within(bar).getByRole("button", { name: /Compare 2 funds/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector(".mfs-tw")!.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("C-11 the Fund column stays frozen while the table scrolls sideways", () => {
    expect(css).toMatch(/\.mfs-table th\.mfs-n \{[^}]*position: sticky; left: 0;/);
  });
  it("C-12 on a phone the panel shows the search and one button, 'Show the 17 filter groups', which opens the groups in place", async () => {
    setNarrow(true);
    mount(); await screen.findAllByText("Alpha Mid Cap Fund");
    const p = panel();
    expect(within(p).getByPlaceholderText(/Find a filter/)).toBeTruthy();
    const btn = within(p).getByRole("button", { name: "Show the 17 filter groups" });
    expect((p.querySelector("#mfs-groups") as HTMLElement).hidden).toBe(true);
    fireEvent.click(btn);
    expect((p.querySelector("#mfs-groups") as HTMLElement).hidden).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();                     // in place, not a sheet
  });
  it("the table's columns carry the pack's names, and each fund reads 'house · plan · option' then 'category · NAV ₹… on <date>'", async () => {
    mount(); await screen.findAllByText("Alpha Mid Cap Fund");
    const heads = [...document.querySelectorAll(".mfs-table thead th")].map((th) => th.textContent!.replace(/[▲▼]/g, "").trim());
    expect(heads.slice(2)).toEqual(["1 year", "3 yrs a year", "5 yrs a year", "Expense", "Size", "Volatility 3 yrs", "Biggest fall", "Rank 3 yrs"]);
    const cell = document.querySelector(".mfs-table tbody th.mfs-n")!;
    expect(cell.querySelectorAll("small")[0].textContent).toMatch(/^Alpha Mutual Fund/);
    expect(cell.querySelector(".mfs-nav")!.textContent).toMatch(/^Mid Cap.* · NAV ₹?10(\.0+)? on 20 Oct$/);
  });
  it("carries the AMFI risk line with the disclaimer (the pack's common rules)", async () => {
    mount(); await screen.findAllByText("Alpha Mid Cap Fund");
    expect(document.querySelector(".mfs-fine")!.textContent).toMatch(/Mutual fund investments are subject to market risks; read all scheme-related documents carefully\./);
  });
  it("keeps the disclaimer and uses no advice wording", async () => {
    mount(); await screen.findAllByText("Alpha Mid Cap Fund");
    const text = document.body.textContent || "";
    expect(text).toMatch(/Not investment advice/i);
    expect(text).not.toMatch(/\b(buy|sell|accumulate|avoid|recommended|best)\b/i);
  });
});
void act;
