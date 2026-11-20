// @vitest-environment jsdom
// The Basic stock screener (FinLit IQ only, Silver) in a DOM: draft vs applied filters, chips, selection, bulk actions, address (URL) state, CSV and plan gating.
import { act, cleanup, fireEvent, render, screen, waitFor, within, configure } from "@testing-library/react";
configure({ asyncUtilTimeout: 8000 });
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Row } from "../lib/screener";

const st = vi.hoisted(() => ({ plan: "gold" as "basic" | "silver" | "gold", rows: [] as unknown[], cover: null as unknown, upgrade: vi.fn(), toast: vi.fn() }));
vi.mock("../lib/screener", async (orig) => ({ ...(await orig<typeof import("../lib/screener")>()), useUniverse: () => ({ data: { rows: st.rows, sample: true, asOf: "2026-10-26", prism: st.cover }, isLoading: false, isError: false }) }));
const api = vi.hoisted(() => ({ list: { tab: "basic", asOf: "2026-10-30", groups: [] as unknown[] } as unknown }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: vi.fn(async (path: string) => { if (path.startsWith("/api/screener/presets")) return api.list; throw new Error("unexpected " + path); }) }));
const admin = vi.hoisted(() => ({ on: true }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ isAdmin: admin.on }) }));
vi.mock("../lib/ui", () => ({
  useUI: () => ({ has: (t: string) => ({ basic: 0, silver: 1, gold: 2 })[st.plan] >= ({ basic: 0, silver: 1, gold: 2 } as Record<string, number>)[t], upgrade: st.upgrade, toast: st.toast }),
  TIER: { gold: { n: "Gold" }, silver: { n: "Silver" } },
}));
import { ScoreScreener } from "./ScoreScreener";
import { watch } from "../lib/watchlist";

/** Each fixture sector's NSE industry (task #257: the three linked lists read NSE's names). */
const IND: Record<string, string> = { Banks: "Banks", IT: "IT - Software", Auto: "Automobiles", Pharma: "Pharmaceuticals & Biotechnology", Metals: "Ferrous Metals" };
const mk = (symbol: string, sector: string | null, f: number | null, t: number | null, cap: number | null, o: Partial<Row> = {}): Row => ({
  symbol, name: symbol + " Limited", sector, nse_sector: sector, nse_industry: sector == null ? null : IND[sector] ?? sector, overall: f == null ? null : f, band: null,   /* one industry per sector, named alike, in the fixture */ pillar_quality: f, pillar_growth: f, pillar_profitability: f, pillar_balance: f, pillar_technical: t,
  price: cap == null ? null : 100, market_cap: cap == null ? null : cap * 100,   /* x100: the fixture companies are all Large on the rupee scale */ pe: null, pb: null, roe: null, roce: null, dividend_yield: null, debt_to_equity: null, sales_cagr: null, profit_cagr: null,
  operating_margin: null, change_pct: null, return_1m: null, return_1y: null, scored: true, ...o,
});
const CARD = { id: "basic-top-large", name: "Top 10 large caps", group: "top-rated", cardText: "The 10 large caps with the strongest mix of business scores and price strength.", count: 40, asOf: "2026-10-30", status: "live", blockedReason: null,
  listText: "Top 10 of 40 that pass", chips: [], howItWorks: [], locked: false, tab: "basic" };
const DATA = [
  mk("AAA", "Banks", 90, 90, 9000), mk("BBB", "Banks", 80, 30, 8000), mk("CCC", "IT", 50, 85, 7000), mk("DDD", "IT", 44, 45, 6000), mk("EEE", "Auto", 77, 78, 5000),
  mk("FFF", null, 60, null, 4000), mk("GGG", "Auto", null, 60, null, { scored: false }), mk("HHH", "Pharma", 78, 77, 3000),
  ...Array.from({ length: 14 }, (_, i) => mk("ZZ" + String(i).padStart(2, "0"), "Metals", 55, 55, 2000 - i * 10)),
];
/** More than one page of 25 (task #64, B-6: 25 rows a page): DATA plus 30 small Metals companies. */
const MANY = [...DATA, ...Array.from({ length: 30 }, (_, i) => mk("YY" + String(i).padStart(2, "0"), "Metals", 50, 50, 100 - i))];
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
const Where = () => { const l = useLocation(); return <output data-testid="loc">{l.pathname + l.search}</output>; };
const open = (qs = "") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/score-screener" + qs]}><Routes><Route path="/score-screener" element={<ScoreScreener />} /><Route path="/advanced-score-screener" element={<div data-testid="adv">advanced page</div>} /><Route path="*" element={<div>elsewhere</div>} /></Routes><Where /></MemoryRouter></QueryClientProvider>);
const loc = () => screen.getByTestId("loc").textContent || "";
const symbols = () => within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => within(r).queryAllByRole("cell")[2]?.querySelector("b")?.textContent).filter(Boolean);
/** A sector's tick box in the Sector and industry filter (14 Nov N-28): ticking it picks all its industries. */
/** Task #257: a header-row filter's panel (the left panel is gone); its options are tick boxes named by the option and its count. */
const panel = (name: string) => {
  const b = screen.getByRole("button", { name: new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s?\\d|$| ·)") });
  if (b.getAttribute("aria-expanded") !== "true") fireEvent.click(b);    // open it unless it is already open
  return within(screen.getByRole("dialog", { name: new RegExp("^" + name) }));
};
const opt = (p: ReturnType<typeof panel>, name: string) => p.getByRole("checkbox", { name: new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }) as HTMLInputElement;
const countOf = (p: ReturnType<typeof panel>, name: string) => opt(p, name).closest("label")!.querySelector("small")!.textContent;
const closePanel = () => fireEvent.keyDown(document, { key: "Escape" });
const count = () => document.querySelector(".hf-count")!.textContent;

beforeEach(() => { admin.on = true; st.plan = "silver"; st.rows = DATA; st.cover = null; localStorage.clear(); watch.reset(); st.upgrade.mockReset(); st.toast.mockReset(); });
afterEach(cleanup);

describe("Basic stock screener page", () => {
  it("lists the universe sorted by market cap, with 25 rows a page (task #64, B-6), the count over the whole set and no summary boxes; no left panel (task #257)", () => {
    open();
    expect(symbols().slice(0, 10)).toEqual(["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "HHH", "ZZ00", "ZZ01", "ZZ02"]);
    expect(symbols()).toHaveLength(22);
    expect(screen.queryByLabelText("Summary")).toBeNull();                       // the design has no Companies found, Sectors, Median Technical or Active filters boxes
    expect(count()).toBe("22 companies");
    expect(document.querySelector(".scr-side, aside, .sx-fbtn")).toBeNull();    // task #257 SPEC §1: no left panel and no Filters button
    expect([...document.querySelectorAll(".hf-b")].map((b) => b.textContent)).toEqual(["Market cap", "Macro sector", "Sector", "Industry", "FinLit IQ", "52-week high"]);
    expect(screen.getByText("No filters yet: every company is listed.")).toBeTruthy();
    expect(screen.getByText("1–22 of 22")).toBeTruthy();
    expect((screen.getByLabelText("Rows per page") as HTMLSelectElement).value).toBe("25");
  });
  it("no Compare row until the first tick; then the bottom bar (task #64, B-6); Technical sits inside the FinLit IQ group (B-2)", () => {
    st.plan = "silver"; open();
    expect(document.querySelector(".sx-cbar")).toBeNull();
    expect(screen.queryByText(/Tick the box/)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select AAA" }));
    const bar = screen.getByRole("region", { name: "Selected companies" });
    expect(bar.textContent).toMatch(/1 selected/); expect(bar.textContent).toMatch(/Tick one more company to compare\./);
    const labs = [...document.querySelectorAll(".gh.tg-row th[data-g] .gh-lab")].map((e) => e.textContent);
    expect(labs).toEqual(["Price & size", "FinLit IQ0–100, higher is better"]);
    expect(document.querySelector('.gh.tg-row th[data-g="iq"]')!.getAttribute("colspan")).toBe("6");
    // 14 Nov N-25: Price & size spans its two columns (LTP, Market cap), so FinLit IQ's band sits over FinLit IQ to Technical, not one column to the right
    expect(document.querySelector('.gh.tg-row th[data-g="price"]')!.getAttribute("colspan")).toBe("2");
    const band = [...document.querySelectorAll(".gh.tg-row th")].reduce((n, th) => n + Number(th.getAttribute("colspan") || 1), 0);
    const cols = document.querySelectorAll("thead tr:not(.gh) th").length;
    expect(band).toBe(cols);
    const heads = [...document.querySelectorAll("thead tr:not(.gh) th")].map((h) => h.textContent?.replace(/[▲▼▾]/g, "").trim());
    expect(heads.slice(5, 11).map((h) => h?.replace(/ \?$/, ""))).toEqual(["FinLit IQ", "Quality", "Growth", "Profitability", "Balance sheet", "Technical"]);   // the six columns under the FinLit IQ band
  });
  it("a Gold member never gets the Basic stock screener: its address opens the Advanced one (task #100)", () => {
    st.plan = "gold"; open();
    expect(document.querySelector(".sx-bulkhint")).toBeNull();
    expect(screen.queryByText(/22 companies in this result/)).toBeNull();
  });
  it("filters apply live: ticking changes rows, the count, chips and address with no button pressed", async () => {
    open();
    const p = panel("Industry");
    fireEvent.click(opt(p, "IT - Software")); fireEvent.click(opt(p, "Automobiles"));
    await waitFor(() => expect(loc()).toBe("/score-screener?ind=IT+-+Software&ind=Automobiles"));
    expect(symbols()).toEqual(["CCC", "DDD", "EEE", "GGG"]);
    expect(count()).toBe("4 companies match these filters");
    expect(screen.getByText("1–4 of 4")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove filter Industry: IT - Software" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Industry\s?2/ })).toBeTruthy();         // the button shows how many are picked
  });
  it("no not-scored ring and no sector box above the list, for members and administrators alike (14 Nov N-24)", () => {
    for (const on of [false, true]) {
      cleanup(); admin.on = on; open();
      expect(screen.queryByText(/are not scored yet/)).toBeNull();
      expect(screen.queryByText("Results by sector (Top 5)")).toBeNull();
      expect(screen.getByRole("table")).toBeTruthy();                     // the results themselves are untouched
    }
  });

  it("a typed number applies after a short pause, and an invalid range waits (task #257: values are kept within 0 to 100)", async () => {
    vi.useFakeTimers();
    try {
      open();
      const p = panel("FinLit IQ");
      fireEvent.change(p.getByLabelText("Quality from"), { target: { value: "7" } });
      fireEvent.change(p.getByLabelText("Quality from"), { target: { value: "78" } });
      act(() => { vi.advanceTimersByTime(300); });
      expect(loc()).toBe("/score-screener");                                   // still typing: nothing applied yet
      act(() => { vi.advanceTimersByTime(150); });
      expect(loc()).toBe("/score-screener?qmin=78");
      expect(symbols()).toEqual(["AAA", "BBB", "HHH"]);
      fireEvent.change(p.getByLabelText("Quality to"), { target: { value: "50" } });   // below the minimum
      act(() => { vi.advanceTimersByTime(1000); });
      expect(loc()).toBe("/score-screener?qmin=78");
      expect(screen.getByRole("alert").textContent).toMatch(/minimum is above the maximum/);
      fireEvent.change(p.getByLabelText("Quality to"), { target: { value: "250" } });  // clamped to 100
      act(() => { vi.advanceTimersByTime(450); });
      expect(loc()).toBe("/score-screener?qmin=78&qmax=100");
    } finally { vi.useRealTimers(); }
  });
  it("the counts beside each option follow the other filters, and Clear all restores every total", async () => {
    open();
    expect(countOf(panel("Industry"), "Banks")).toBe("2"); expect(countOf(panel("Industry"), "Ferrous Metals")).toBe("14"); closePanel();
    fireEvent.click(opt(panel("Market cap"), "Large cap")); closePanel();      // all 22 fixture companies are Large on the rupee scale
    await waitFor(() => expect(loc()).toContain("cap=Large"));
    fireEvent.change(panel("FinLit IQ").getByLabelText("Quality from"), { target: { value: "78" } }); closePanel();
    await waitFor(() => expect(loc()).toContain("qmin=78"));
    await waitFor(() => { expect(symbols()).toEqual(["AAA", "BBB", "HHH"]); expect(countOf(panel("Industry"), "Banks")).toBe("2"); });
    expect(countOf(panel("Industry"), "Ferrous Metals")).toBe("0"); expect(countOf(panel("Industry"), "IT - Software")).toBe("0"); expect(countOf(panel("Industry"), "Pharmaceuticals & Biotechnology")).toBe("1"); closePanel();
    fireEvent.click(within(screen.getByLabelText("Active filters")).getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(loc()).toBe("/score-screener"), { timeout: 10000 });
    await waitFor(() => { expect(countOf(panel("Industry"), "Ferrous Metals")).toBe("14"); expect(count()).toBe("22 companies"); });
  });
  it("filters that match nothing show zeros above, and an empty state with removable chips", async () => {
    open("?sector=Banks&qual=low");
    expect(symbols()).toEqual([]);
    expect(count()).toBe("0 companies match these filters");
    expect(document.querySelector(".fgx-empty")!.textContent).toMatch(/No companies match all of these filters/);
    fireEvent.click(within(document.querySelector(".fgx-empty") as HTMLElement).getByRole("button", { name: /^Banks/ }));
    await waitFor(() => expect(symbols().length).toBeGreaterThan(0));
  });
  it("score ranges are exact, and missing scores never pass", async () => {
    open();
    const p = panel("FinLit IQ");
    fireEvent.change(p.getByLabelText("Quality from"), { target: { value: "78" } });
    await waitFor(() => expect(symbols()).toEqual(["AAA", "BBB", "HHH"]));     // 78 is in, 77 (EEE) is out, GGG has no score
    fireEvent.change(p.getByLabelText("Growth to"), { target: { value: "44" } });
    await waitFor(() => expect(symbols()).toEqual([]));                         // both must pass
    fireEvent.change(p.getByLabelText("Growth to"), { target: { value: "" } });
    fireEvent.change(p.getByLabelText("Growth from"), { target: { value: "78" } });
    await waitFor(() => expect(symbols()).toEqual(["AAA", "BBB", "HHH"]));
    expect(loc()).toBe("/score-screener?qmin=78&gmin=78");
  });
  it("FinLit IQ opens one panel: the rating in three groups with counts, then a from-to range for the FinLit IQ and each of its five scores (task #257 SPEC §3)", () => {
    open();
    const p = panel("FinLit IQ");
    expect(within(p.getByRole("group", { name: "FinLit IQ fundamental rating" })).getAllByRole("checkbox").map((c) => c.closest("label")!.querySelector("span")!.textContent)).toEqual(["Strong or Healthy", "Below Healthy", "Not rated"]);
    expect(countOf(p, "Strong or Healthy")).toBe("4"); expect(countOf(p, "Below Healthy")).toBe("17"); expect(countOf(p, "Not rated")).toBe("1");   // 90 80 77 78 / 50 44 60 and the 14 Metals at 55 / GGG
    expect(p.getAllByRole("group", { name: / range$/ }).map((g) => g.getAttribute("aria-label"))).toEqual(["FinLit IQ range", "Quality range", "Growth range", "Profitability range", "Balance sheet range", "Technical range"]);
    expect(p.getByText("0 to 100, higher is better")).toBeTruthy();
    expect(p.getByRole("button", { name: "Clear score filters" }).hasAttribute("disabled")).toBe(true);
    expect(p.getByText("Counts follow the other filters")).toBeTruthy();
  });
  it("the rating groups, Technical and FinLit IQ ranges filter the table, the count, the chips, the button and the address", { timeout: 30000 }, async () => {
    open();
    let p = panel("FinLit IQ");
    fireEvent.click(opt(p, "Strong or Healthy"));
    await waitFor(() => expect(symbols()).toEqual(["AAA", "BBB", "EEE", "HHH"]), { timeout: 10000 });
    expect(decodeURIComponent(loc())).toBe("/score-screener?iql=strong,healthy");
    fireEvent.click(opt(p, "Not rated"));
    await waitFor(() => expect(symbols()).toEqual(["AAA", "BBB", "EEE", "HHH", "GGG"]));
    expect(screen.getByRole("button", { name: /^FinLit IQ · 2/ })).toBeTruthy();    // the button says how many score filters are on
    closePanel();
    fireEvent.click(screen.getByRole("button", { name: "Remove filter FinLit IQ rating: Strong, Healthy, Not rated" }));
    await waitFor(() => expect(loc()).toBe("/score-screener"), { timeout: 10000 });
    p = panel("FinLit IQ");
    fireEvent.change(p.getByLabelText("Technical from"), { target: { value: "78" } });
    await waitFor(() => expect(symbols()).toEqual(["AAA", "CCC", "EEE"]), { timeout: 10000 });
    fireEvent.change(p.getByLabelText("FinLit IQ from"), { target: { value: "80" } });
    await waitFor(() => { expect(symbols()).toEqual(["AAA"]); expect(loc()).toBe("/score-screener?tmin=78&omin=80"); });
    fireEvent.click(p.getByRole("button", { name: "Clear score filters" }));
    await waitFor(() => expect(loc()).toBe("/score-screener"));
  });
  it("a shared link with the rating and range keys opens with the panel set", () => {
    open("?iql=mixed,watch&ovr=low&tmin=40");
    const p = panel("FinLit IQ");
    expect(opt(p, "Below Healthy").checked).toBe(true);
    expect((p.getByLabelText("Technical from") as HTMLInputElement).value).toBe("40");
    expect(symbols()).toEqual(["DDD"]);
  });
  it("the Quality band is written as ?qual= so it never collides with the toolbar search ?q=, and an old ?q=high link still reads", () => {
    open("?q=high");
    expect(symbols()).toEqual(["AAA", "BBB", "HHH"]);
    expect((screen.getByLabelText("Search company name or symbol") as HTMLInputElement).value).toBe("");
    cleanup();
    open("?qual=mid&q=AAA");   // an older link's "mid" reads as Mixed and Healthy
    expect(symbols()).toEqual([]);                                           // AAA is 90, not 45 to 77: the search and the band are separate
  });

  it("a removed chip, and Clear all, update the table and address at once", () => {
    open("?sector=IT&sector=Auto&qual=mid");
    expect(symbols()).toEqual(["CCC", "EEE"]);                                // IT or Auto, Fundamental 45 to 77: 50 and 77 (DDD is 44)
    fireEvent.click(screen.getByRole("button", { name: "Remove filter Quality: Mixed, Healthy" }));
    expect(symbols()).toEqual(["CCC", "DDD", "EEE", "GGG"]);
    expect(loc()).toBe("/score-screener?sector=IT&sector=Auto");
    fireEvent.click(screen.getByRole("button", { name: "Remove filter IT" }));
    expect(symbols()).toEqual(["EEE", "GGG"]);                                // Auto only
    fireEvent.click(within(screen.getByLabelText("Active filters")).getByRole("button", { name: "Clear all" }));
    expect(loc()).toBe("/score-screener");
    expect(symbols()).toHaveLength(22);
  });

  it("opens a shared link with its filters, sort and page", () => {
    st.rows = MANY; open("?ind=Ferrous+Metals&sort=name&dir=asc&size=25&page=2");
    expect(opt(panel("Industry"), "Ferrous Metals").checked).toBe(true); closePanel();
    expect(screen.getByRole("button", { name: "Sort by Stock" }).closest("th")!.getAttribute("aria-sort")).toBe("ascending");
    expect(screen.getByRole("button", { name: "Sort by FinLit IQ" }).closest("th")!.getAttribute("aria-sort")).toBe("none");
    expect((screen.getByLabelText("Rows per page") as HTMLSelectElement).value).toBe("25");
    expect(screen.getByRole("button", { name: "Page 2" }).getAttribute("aria-current")).toBe("page");
    cleanup(); open("?sector=Metals");                                    // a link from before still narrows the list on the old label, and its chip says so
    expect(symbols().every((s) => /^(ZZ|YY)/.test(s!))).toBe(true);
    expect(screen.getByRole("button", { name: "Remove filter Metals" })).toBeTruthy();
    cleanup(); open("?sector=Financial+Services");                         // task #257: ?sector= with one of NSE's 22 sectors is the Sector filter
    expect(opt(panel("Sector"), "Financial Services").checked).toBe(true);
    expect(symbols()).toEqual(["AAA", "BBB"]);
  });
  it("sorting by a heading flips the direction, keeps missing scores last and writes the address", () => {
    open("?size=50");
    fireEvent.click(screen.getByRole("button", { name: "Sort by FinLit IQ" }));
    expect(loc()).toBe("/score-screener?sort=overall&dir=desc&size=50");
    expect(symbols().slice(0, 3)).toEqual(["AAA", "BBB", "HHH"]);
    expect(symbols().at(-1)).toBe("GGG");
    fireEvent.click(screen.getByRole("button", { name: "Sort by FinLit IQ" }));
    expect(symbols().at(-1)).toBe("GGG");                                     // still last when ascending
    expect(symbols()[0]).toBe("DDD");
  });

  it("selects rows, compares 2 and keeps the selection across pages", () => {
    st.rows = MANY; open();
    const box = (s: string) => screen.getByRole("checkbox", { name: `Select ${s}` });
    fireEvent.click(box("AAA"));
    expect((screen.getByRole("button", { name: "Compare" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(box("BBB"));
    expect(screen.getAllByText("2 selected").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getAllByText("2 selected").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Compare 2" }));
    expect(loc()).toBe("/compare?c=AAA,BBB");
  });

  it("the header box selects the page and shows a partial state", () => {
    st.rows = MANY; open();
    const head = screen.getByRole("checkbox", { name: "Select all companies on this page" }) as HTMLInputElement;
    fireEvent.click(head);
    expect(screen.getAllByText("25 selected").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select AAA" }));
    expect(head.indeterminate).toBe(true);
    fireEvent.click(head);
    expect(screen.getAllByText("25 selected").length).toBeGreaterThan(0);
    fireEvent.click(head);
    expect(screen.queryByText(/^\d+ selected$/)).toBeNull();
  });

  it("adds the selected companies to the watchlist; Basic and Silver follow the plan rules", () => {
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select AAA" })); fireEvent.click(screen.getByRole("checkbox", { name: "Select CCC" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to watchlist" }));
    expect(watch.has("AAA") && watch.has("CCC") && !watch.has("BBB")).toBe(true);
    cleanup(); st.plan = "basic"; watch.reset(); open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select AAA" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to watchlist" }));
    expect(st.upgrade).toHaveBeenCalledWith("silver", expect.any(String));
    expect(watch.has("AAA")).toBe(false);
  });

  it("Silver compares 2 at most; Gold up to 4", () => {
    st.plan = "silver"; open();
    ["AAA", "BBB", "CCC"].forEach((s) => fireEvent.click(screen.getByRole("checkbox", { name: `Select ${s}` })));
    expect((screen.getByRole("button", { name: "Compare" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/compares up to 2/)).toBeTruthy();
  });

  it("has no export buttons, only Compare and Add to watchlist", () => {
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select AAA" }));
    expect(screen.queryByRole("button", { name: /Export/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Add to watchlist" })).toBeTruthy();
  });

  it("shows a dash with its reason, never a zero, for missing data", () => {
    open("?sector=Auto");
    const row = screen.getByRole("checkbox", { name: "Select GGG" }).closest("tr")!;
    expect(row.textContent).toMatch(/Not available: Not scored yet/);
    expect(row.textContent).not.toMatch(/\b0\b/);
    expect(within(row).getAllByTitle(/Not scored yet/).length).toBeGreaterThan(0);
  });

  it("Basic members see locks and the upgrade card instead of score filters; the prebuilt screens ask for Silver", async () => {
    st.plan = "basic"; st.rows = DATA.map((r) => ({ ...r, overall: null, pillar_quality: null, pillar_growth: null, pillar_profitability: null, pillar_balance: null, pillar_technical: null }));
    api.list = { tab: "basic", asOf: null, groups: [{ id: "top-rated", name: "Top rated", presets: [{ ...CARD, locked: true, count: null, listText: null }] }] };
    open();
    const p = panel("FinLit IQ");
    expect(p.getByText(/Score filters are part of Silver/)).toBeTruthy();
    expect(p.queryByLabelText("Quality from")).toBeNull();
    closePanel();
    fireEvent.click(await screen.findByRole("button", { name: /Top 10 large caps/ }));
    expect(st.upgrade).toHaveBeenCalledWith("silver", expect.stringMatching(/Silver/));
    expect(loc()).toBe("/score-screener");
  });
  it("the Quick views are the server's prebuilt screens: each card says how many of those that pass it lists, and opening one writes the address", async () => {
    api.list = { tab: "basic", asOf: "2026-10-30", groups: [{ id: "top-rated", name: "Top rated", presets: [CARD, { ...CARD, id: "basic-strong-both", name: "Strong on both", cardText: "Growth & Profitability score and Technical both 78 or more.", listText: null, count: 19 }] }] };
    open();
    const card = await screen.findByRole("button", { name: /Top 10 large caps/ });
    expect(card.textContent).toMatch(/Top 10 of 40 that pass/);
    expect(screen.getByRole("button", { name: /Strong on both/ }).textContent).toMatch(/19 match/);
    expect(screen.queryByText("Prism basics")).toBeNull();                                   // the Prism quick views belong to the Advanced page
    fireEvent.click(card);
    await waitFor(() => expect(loc()).toBe("/score-screener?preset=basic-top-large"));
  });

  it("the 52-week and return columns are off until asked for, then show blanks as dashes, never zero, and sort", () => {
    st.rows = DATA.map((r, i) => (i === 0 ? { ...r, ret_3m: 12.34, ret_6m: -3.2, return_1y: 40, pct_from_high: 4.56 } : r));
    open();
    const heads = () => within(screen.getByRole("table")).getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads().join("|")).not.toMatch(/52-week/);
    fireEvent.click(screen.getByRole("button", { name: /^Columns/ }));             // a Columns option, not a row of its own (task #64, B-4)
    fireEvent.click(screen.getByRole("checkbox", { name: /52-week high and returns/ }));
    expect(heads().join("|")).toMatch(/3M return.*6M return.*1Y return.*Down from 52-week high/);
    const first = within(screen.getByRole("table")).getAllByRole("row")[2].textContent!;
    expect(first).toMatch(/\+12\.3%/); expect(first).toMatch(/−3\.2%/); expect(first).toMatch(/−4\.6%/);   // down from the high reads as a minus (task #62)
    const second = within(screen.getByRole("table")).getAllByRole("row")[3].textContent!;
    expect(second).not.toMatch(/0\.0%/);                                               // a company with no figure shows a dash
    fireEvent.click(screen.getByRole("button", { name: "Sort by Down from 52-week high" }));
    expect(loc()).toMatch(/sort=pct_from_high/);
  });

  it("opens and closes the How FinLit IQ works dialog with the exact definitions", () => {
    open();
    fireEvent.click(screen.getAllByRole("button", { name: /How FinLit IQ works/ })[0]);
    const d = screen.getByRole("dialog", { name: "How FinLit IQ works" });
    expect(d.textContent).toMatch(/Strong, Healthy, Mixed and Watch/);
    expect(d.textContent).not.toMatch(/78|62 to 77|45 to 61|under 45|average of/);              // the model's cut-offs and formula never show (task #64)
    expect(d.textContent).toMatch(/Large cap above ₹75,000 Cr, Mid cap ₹25,000 to 75,000 Cr, Small cap ₹10,000 to 25,000 Cr, Micro cap below ₹10,000 Cr/);
    expect(d.textContent).toMatch(/26 Oct 2026/);
    expect(d.textContent?.toLowerCase()).not.toMatch(/\b(buy|sell|hold|reduce|avoid|accumulate|target)\b/);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Macro sector, Sector and Industry are three linked lists of all of NSE's names with counts and a search box; a choice that no longer fits is taken off (task #257, SHARED §1)", async () => {
    open();
    expect(screen.queryByLabelText("Sector mix of the result")).toBeNull();                        // N-24: no sector box above the list
    let p = panel("Macro sector");
    expect(p.getByText("Macro sector · all 12")).toBeTruthy();
    expect(p.getAllByRole("checkbox")).toHaveLength(12);
    expect(countOf(p, "Commodities")).toBe("14"); expect(countOf(p, "Financial Services")).toBe("2");
    expect(opt(p, "Energy").disabled).toBe(true);                                                 // no company: greyed
    closePanel();
    p = panel("Sector"); expect(p.getByText("Sector · all 22")).toBeTruthy(); expect(p.getAllByRole("checkbox")).toHaveLength(22); closePanel();
    p = panel("Industry"); expect(p.getByText("Industry · all 59")).toBeTruthy(); expect(p.getAllByRole("checkbox")).toHaveLength(59);
    fireEvent.change(p.getByLabelText("Find a industry"), { target: { value: "pharm" } });
    expect(p.getAllByRole("checkbox").map((c) => c.closest("label")!.querySelector("span")!.textContent)).toEqual(["Pharmaceuticals & Biotechnology"]);
    fireEvent.change(p.getByLabelText("Find a industry"), { target: { value: "" } });
    fireEvent.click(opt(p, "Banks")); closePanel();
    await waitFor(() => expect(loc()).toBe("/score-screener?ind=Banks"));
    p = panel("Macro sector"); fireEvent.click(opt(p, "Commodities"));                             // Banks is not inside Commodities: taken off, with a message
    expect(p.getByRole("status").textContent).toBe("Banks was taken off: not inside your other choice.");
    await waitFor(() => expect(loc()).toBe("/score-screener?macro=Commodities"));
    closePanel();
    p = panel("Industry");
    expect(p.getAllByRole("checkbox").map((c) => c.closest("label")!.querySelector("span")!.textContent)).toContain("Ferrous Metals");
    expect(p.queryByRole("checkbox", { name: /^Banks/ })).toBeNull();                              // narrowed by the macro sector picked
  });
});


// ---- two pages: the basic one has no trace of Prism, and old links with Prism filters move to the advanced page
describe("Basic stock screener: no Prism", () => {
  const PR = (o: Partial<Row> = {}) => ({ prism_state: "stored", prism_final: 85, prism_label: "STRONG", prism_status: "RATED", prism_fundamental: 80, prism_valuation: 55, prism_quality: 70, prism_risk: 60, prism_st: "Positive", prism_lt: "Neutral", prism_st_score: 22, prism_lt_score: -4, ...o });
  it("is titled Basic stock screener and has no Prism column, filter, view, tile or coverage line even when the rows carry Prism values", () => {
    st.rows = DATA.map((r) => ({ ...r, ...PR() })); st.cover = { rated: 3, provisional: 1, not_rated: 1, stored: 5, total: 6, as_of: "2026-10-27", per_night: 30 };
    open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Basic stock screener");
    const page = document.body.textContent || "";
    expect(page).not.toMatch(/Rated by Prism|Median Prism|Prism filters|Prism has rated|Short term|Long term|Valuation|Only companies rated/);
    expect(within(screen.getByRole("table")).queryByRole("columnheader", { name: /Prism|Risk|Valuation/ })).toBeNull();
    expect(document.querySelector(".pzs-cover")).toBeNull();
    // the only mention is the link to the advanced page
    expect([...(page.match(/Prism/g) || [])].length).toBeLessThanOrEqual(4);
    expect(screen.queryByLabelText("Summary")).toBeNull();
  });
  it("has the FinLit columns only, in order", () => {
    open();
    const heads = within(screen.getByRole("table")).getAllByRole("columnheader").map((h) => h.textContent?.replace(/[▲▼▾]/g, "").trim());
    expect(heads.map((h) => h?.replace(/ \?$/, ""))).toEqual(expect.arrayContaining(["FinLit IQ", "Quality", "Growth", "Profitability", "Balance sheet", "Technical"]));   // headings in full (task #64, B-3)
    expect(heads).not.toContain("Sector");                                                // the sector sits under the company name
    expect(document.querySelector(".sx-secn")!.textContent).toBe("Banks");
  });
  it("the site's page header: eyebrow, the name with its plan, the description, the four screener boxes, the score date, How FinLit IQ works (task #243, pack H)", () => {
    open();
    const head = document.querySelector("header.sp-head.xsh")!;
    expect(head.querySelector(".sp-eyebrow")!.textContent).toBe("Research · Find stocks");
    expect(head.querySelector("h1")!.textContent).toBe("Basic stock screener"); expect(head.querySelector(".tier")!.textContent).toMatch(/Silver/i);
    expect(head.querySelector(".sp-desc")!.textContent).toMatch(/^Every listed company with its FinLit IQ/);   // was screen-reader only
    expect(head.querySelector(".xsh-date")!.textContent).toMatch(/^Scores: /);
    expect(within(head as HTMLElement).getByRole("button", { name: "How FinLit IQ works →" })).toBeTruthy();
    const boxes = within(head as HTMLElement).getByRole("navigation", { name: "Screeners" });
    expect(within(boxes).getByRole("link", { name: "Basic stock screener" }).getAttribute("aria-current")).toBe("page");
    expect(within(boxes).getByRole("link", { name: "Advanced stock screener" }).getAttribute("href")).toBe("/advanced-score-screener");
    expect(document.querySelector(".sx-here, .pzs-explain, .sx-colopt, nav.fst, section.sx-head")).toBeNull();   // no old tab strip or head card
  });
  it("Silver sees the scores, Basic sees the locked state as before", () => {
    st.plan = "silver"; open();
    const p = panel("FinLit IQ");
    expect(p.queryByText(/Score filters are part of Silver/)).toBeNull();
    expect(p.getByRole("group", { name: "Quality range" })).toBeTruthy();
  });
  it("moves an old link that carries Prism filters to the advanced page with the same parameters", () => {
    open("?zmin=60&pl=strong&rated=1&sector=IT");
    expect(screen.getByTestId("adv")).toBeTruthy();
    expect(loc()).toBe("/advanced-score-screener?zmin=60&pl=strong&rated=1&sector=IT");
    cleanup(); open("?sort=prism_final&dir=desc");
    expect(loc()).toBe("/advanced-score-screener?sort=prism_final&dir=desc");
    cleanup(); open("?f=high&t=mid&sector=IT");
    expect(screen.queryByTestId("adv")).toBeNull();                       // a FinLit-only link stays
    expect(loc()).toBe("/score-screener?f=high&t=mid&sector=IT");
  });
  it("the page text uses no advice wording", () => {
    open();
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/\b(buy|sell|hold|reduce|avoid|accumulate)\b/);
  });

  it("each header-row filter opens and closes with the mouse and Escape, with aria-expanded and aria-controls, and focus returns to its button", () => {
    open();
    const b = screen.getByRole("button", { name: /^Market cap/ });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(b.getAttribute("aria-controls")!)).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(b);
    fireEvent.click(b); fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("task #262: an old link's ?cap=Small reads Micro, with the one-time note under the header filters", () => {
    open("?cap=Small");
    expect(screen.getByText(/Company sizes changed on 20 Nov 2026: your Small filter now reads Micro\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Market cap\s?1/ })).toBeTruthy();
    expect(opt(panel("Market cap"), "Micro cap").checked).toBe(true);
    closePanel();
  });
  it("a button shows how many of its filters are on, and the counts beside options are real", () => {
    open("?ind=IT+-+Software&ind=Automobiles&cap=Large");
    expect(screen.getByRole("button", { name: /^Industry\s?2/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Market cap\s?1/ })).toBeTruthy();
    const p = panel("Market cap");
    expect(countOf(p, "Large cap")).toMatch(/^\d+$/);
    expect(p.getByText("Above ₹75,000 Cr")).toBeTruthy(); expect(countOf(p, "Micro cap")).toMatch(/^\d+$/);   // task #262: four sizes                                       // each size with its range
    closePanel();
    expect(countOf(panel("Industry"), "Banks")).toBe("2");                                         // its own list is left out of its counts
    expect(opt(panel("Industry"), "IT - Software").checked).toBe(true);
  });
  it("an empty box means no limit, and values are kept within 0 to 100 (task #257 SPEC §3)", async () => {
    open();
    const p = panel("FinLit IQ");
    fireEvent.change(p.getByLabelText("Quality from"), { target: { value: "-20" } });
    expect((p.getByLabelText("Quality from") as HTMLInputElement).value).toBe("0");
    fireEvent.change(p.getByLabelText("Quality from"), { target: { value: "70" } });
    await waitFor(() => expect(loc()).toBe("/score-screener?qmin=70"));
    fireEvent.change(p.getByLabelText("Quality from"), { target: { value: "" } });
    await waitFor(() => expect(loc()).toBe("/score-screener"));
  });
  it("the toolbar search narrows the table by name or sector without touching the address", () => {
    open("?size=50");
    fireEvent.change(screen.getByLabelText("Search company name or symbol"), { target: { value: "pharma" } });
    expect(symbols()).toEqual(["HHH"]);
    expect(loc()).toBe("/score-screener?size=50");
  });
  it("the Sort button's menu writes the same address as a column heading (task #64, B-5)", () => {
    open();
    expect(document.querySelector(".fgx-tool select")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Sort: / }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "FinLit IQ, high to low" }));
    expect(loc()).toContain("sort=overall&dir=desc");
    expect(symbols().slice(0, 3)).toEqual(["AAA", "BBB", "HHH"]);
  });

  it("a company not scored yet says so on its own row, with its reason, and no ring sums it up above the list (14 Nov N-24)", () => {
    open();
    expect(screen.queryByText(/companies in this result are not scored yet/)).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Select GGG" }).closest("tr")!.textContent).toMatch(/Not scored yet/);
  });
});
