// @vitest-environment jsdom
// The Advanced stock screener (FinLit Prism only, Gold) in a DOM: columns, filters, quick views, sorting, CSV, and the upgrade page for every other plan.
import { cleanup, fireEvent, render, screen, waitFor, within, configure } from "@testing-library/react";
configure({ asyncUtilTimeout: 8000 });
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Row } from "../lib/screener";

const st = vi.hoisted(() => ({ plan: "gold" as "basic" | "silver" | "gold", rows: [] as unknown[], cover: null as unknown, upgrade: vi.fn(), toast: vi.fn(), loads: 0 }));
vi.mock("../lib/screener", async (orig) => ({ ...(await orig<typeof import("../lib/screener")>()), useUniverse: () => { st.loads++; return { data: { rows: st.rows, sample: true, asOf: "2026-10-26", prism: st.cover }, isLoading: false, isError: false }; } }));
const admin = vi.hoisted(() => ({ on: true }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ isAdmin: admin.on }) }));
vi.mock("../lib/ui", () => ({
  useUI: () => ({ has: (t: string) => ({ basic: 0, silver: 1, gold: 2 })[st.plan] >= ({ basic: 0, silver: 1, gold: 2 } as Record<string, number>)[t], upgrade: st.upgrade, toast: st.toast }),
  TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" } },
}));
import { AdvancedScoreScreener } from "./AdvancedScoreScreener";
import { watch } from "../lib/watchlist";

const NSE: Record<string, [string, string]> = { Banks: ["Financial Services", "Banks"], IT: ["Information Technology", "IT - Software"], Auto: ["Automobile and Auto Components", "Automobiles"] };
const mk = (symbol: string, sector: string | null, cap: number | null, o: Partial<Row> = {}): Row => ({
  symbol, name: symbol + " Limited", sector, nse_sector: sector ? NSE[sector]?.[0] ?? null : null, nse_industry: sector ? NSE[sector]?.[1] ?? null : null, overall: 80, band: null, pillar_quality: 80, pillar_growth: 80, pillar_profitability: 80, pillar_balance: 80, pillar_technical: 80,
  price: cap == null ? null : 100, market_cap: cap, pe: null, pb: null, roe: null, roce: null, dividend_yield: null, debt_to_equity: null, sales_cagr: null, profit_cagr: null,
  operating_margin: null, change_pct: null, return_1m: null, return_1y: null, scored: true, ...o,
});
/** A rated company. The server's own technical words are deliberately the model's ("Buy", "Hold"): the page must not show them. */
const pz = (final: number | null, label: string, o: Partial<Row> = {}): Partial<Row> => ({
  prism_state: "stored", prism_final: final, prism_label: label, prism_status: final == null ? "NOT RATED" : "RATED", prism_at: "2026-10-27",
  prism_fundamental: final, prism_valuation: final == null ? null : 50, prism_quality: final == null ? null : 70, prism_risk: final == null ? null : 60,
  prism_st: final == null ? null : "Buy", prism_lt: final == null ? null : "Hold", prism_st_score: final == null ? null : 22, prism_lt_score: final == null ? null : -4, ...o,
});
const DATA: Row[] = [
  mk("AAA", "Banks", 9000, pz(85, "STRONG", { prism_valuation: 55, prism_risk: 70, prism_st_score: 55, prism_lt_score: 30 })),
  mk("BBB", "Banks", 8000, pz(66, "HEALTHY", { prism_valuation: 40, prism_st_score: 5, prism_lt_score: -35 })),
  mk("CCC", "IT", 7000, pz(55, "AVERAGE")),
  mk("DDD", "IT", 6000, { prism_state: "stored", prism_final: null, prism_label: "NOT RATED", prism_status: "NOT RATED" }),
  mk("EEE", "Auto", 5000, { prism_state: "none" }),
  mk("FFF", "Auto", 4000, pz(30, "POOR", { prism_status: "PROVISIONAL" })),
];
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
const Where = () => { const l = useLocation(); return <output data-testid="loc">{l.pathname + l.search}</output>; };
const open = (qs = "") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/advanced-score-screener" + qs]}><Routes><Route path="/advanced-score-screener" element={<AdvancedScoreScreener />} /><Route path="*" element={<div>elsewhere</div>} /></Routes><Where /></MemoryRouter></QueryClientProvider>);
const loc = () => screen.getByTestId("loc").textContent || "";
const symbols = () => within(screen.getByRole("table")).getAllByRole("row").slice(2).map((r) => within(r).queryAllByRole("cell")[2]?.querySelector("b")?.textContent).filter(Boolean);
const rowOf = (s: string) => screen.getByRole("checkbox", { name: `Select ${s}` }).closest("tr")!;
const heads = () => within(screen.getByRole("table")).getAllByRole("columnheader").map((h) => h.textContent?.replace(/[▲▼▾]/g, "").trim());
const forbidden = /\b(buy|sell|hold|reduce|avoid|accumulate)\b/;

beforeEach(() => { st.plan = "gold"; st.rows = DATA; st.cover = { rated: 3, provisional: 1, not_rated: 1, stored: 5, total: 6, as_of: "2026-10-27", per_night: 30 }; st.loads = 0; localStorage.clear(); watch.reset(); st.upgrade.mockReset(); st.toast.mockReset(); });
afterEach(cleanup);

describe("Advanced stock screener (Gold)", () => {
  it("ticking a filter updates the rows and the count beside Columns and Sort by itself, and Clear all restores them", async () => {
    open();
    expect(screen.queryByLabelText("Summary")).toBeNull();                         // the five stat boxes are gone (task #64, V-2)
    const count = () => document.querySelector(".hf-count")!.textContent;   // the shared header-row layout (#257): the count sits on the results card with Columns and Sort
    expect(count()).toBe("6 companies");
    fireEvent.click(screen.getByRole("button", { name: "Macro sector" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: /^Macro sector/ })).getByRole("checkbox", { name: /^Financial Services/ }));
    await waitFor(() => expect(symbols()).toEqual(["AAA", "BBB"]));
    expect(screen.getByRole("button", { name: "Macro sector, 1 on" })).toBeTruthy();
    expect(count()).toBe("2 companies match these filters");
    expect(screen.queryByText(/not rated yet\./)).toBeNull(); expect(screen.queryByLabelText("Sector mix of the result")).toBeNull();     // N-33: no ring, no sector box
    expect(loc()).toContain("macro=Financial+Services");
    expect(screen.getByRole("button", { name: "Remove filter Macro sector: Financial Services" })).toBeTruthy();
    fireEvent.click(within(screen.getByLabelText("Active filters")).getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(count()).toBe("6 companies"));
    expect(document.querySelector(".hf-empty")!.textContent).toBe("No filters yet: every company is listed.");
  });

  it("task #258 SPEC §1: no left panel; the filters sit in one header row in the pack's order, and the table takes the full width", () => {
    open();
    expect(document.querySelector("aside.scr-side, .sx-fbtn, .scr-split")).toBeNull();
    expect(document.querySelector(".scr.hf-full")).toBeTruthy();
    const row = screen.getByRole("toolbar", { name: "Filters" });
    expect([...row.querySelectorAll(".fx-btn")].map((b) => b.querySelector(".fx-l")!.firstChild!.textContent)).toEqual(["Market cap", "Macro sector", "Sector", "Industry", "Prism score", "Technical view", "52-week high"]);
    expect(screen.queryByRole("button", { name: /Macro sector & industr/ })).toBeNull();
  });

  it("task #258 SPEC §1: Market cap lists each size with its ₹ range and count; the address keeps ?size=", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Market cap" }));
    const d = within(screen.getByRole("dialog", { name: "Market cap" }));
    expect(d.getByRole("checkbox", { name: /^Small cap\s*Below ₹10,000 Cr\s*6$/ })).toBeTruthy();
    fireEvent.click(d.getByRole("checkbox", { name: /^Small cap/ }));
    await waitFor(() => expect(loc()).toContain("size=small"));
    expect(symbols()).toHaveLength(6);
  });

  it("task #258 SPEC §1: the three lists are linked; a pick that no longer fits is taken off and the page says so", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Industry" }));
    let d = within(screen.getByRole("dialog", { name: /^Industry · all 59/ }));
    expect(d.getAllByRole("checkbox")).toHaveLength(59);
    fireEvent.change(d.getByRole("searchbox", { name: "Find an industry" }), { target: { value: "bank" } });
    fireEvent.click(d.getByRole("checkbox", { name: /^Banks\s*2$/ }));
    await waitFor(() => expect(symbols()).toEqual(["AAA", "BBB"]));
    fireEvent.click(screen.getByRole("button", { name: "Macro sector" }));
    d = within(screen.getByRole("dialog", { name: /^Macro sector · all 12/ }));
    fireEvent.click(d.getByRole("checkbox", { name: /^Information Technology/ }));
    await waitFor(() => expect(symbols()).toEqual(["CCC", "DDD"]));
    expect(d.getByRole("status").textContent).toMatch("Banks was taken off: not inside your other choice.");
    fireEvent.click(screen.getByRole("button", { name: "Sector" }));
    expect(within(screen.getByRole("dialog", { name: /^Sector · 1 of 22/ })).getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(["Information Technology2"]);
  });

  it("task #258 SPEC §4: the line under the name is the NSE industry and the size, with macro sector › sector › industry on hover", () => {
    open();
    const line = rowOf("AAA").querySelector(".sx-nse")!;
    expect(line.firstChild!.textContent).toBe("Banks · Small cap");
    expect(line.getAttribute("title")).toBe("Financial Services › Financial Services › Banks");
    expect(rowOf("AAA").querySelector(".pzs-bw.pzs-bw-strong")!.textContent).toBe("Strong");      // the rating word under the Prism number, in its colour
    expect(rowOf("BBB").querySelector(".pzs-bw.pzs-bw-healthy")!.textContent).toBe("Healthy");
  });

  it("the results table has the enlarge arrow (task #44), and the enlarged dialog holds the same table", async () => {
    open();
    const arrow = await screen.findByRole("button", { name: /Enlarge table: Score screener results/ });
    fireEvent.click(arrow);
    const dlg = await screen.findByRole("dialog", { name: "Score screener results" });
    expect(within(dlg).getAllByRole("columnheader").length).toBeGreaterThan(5);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Score screener results" })).toBeNull());
  });

  it("shows the Prism score with its word, the four parts and the two technical views in the site's words, and nothing of the FinLit IQ", () => {
    open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Advanced stock screener");
    const h = heads();
    expect(h).toEqual(expect.arrayContaining(["Prism score", "Growth & Profitability", "Valuation", "Quality", "Risk", "Short term", "Long term"]));   // task #64, V-7
    expect(h.join("|").replace("Growth & Profitability", "")).not.toMatch(/Overall|Growth|Profit|Balance|Fundamental|^Technical$|Sector/);
    const r = rowOf("AAA").textContent!;
    expect(r).toMatch(/85\s*Strong/); expect(r).toMatch(/\+55\s*Strong uptrend/); expect(r).toMatch(/\+30\s*Uptrend/);       // signed number first, then the word (V-6)
    expect(rowOf("BBB").textContent).toMatch(/\+5\s*Sideways/); expect(rowOf("BBB").textContent).toMatch(/−35\s*Downtrend/);
    expect(rowOf("FFF").textContent).toMatch(/30\s*PoorProvisional/);
    expect(document.body.textContent?.toLowerCase()).not.toMatch(forbidden);   // the model's own "Buy" / "Hold" never reach the screen
    expect(screen.queryByRole("group", { name: "Growth & Profitability score" })).toBeNull();
    // 14 Nov N-37: Short term and Long term sit under their own "Technical views" band, after the Prism parts (the bands no longer start one column late)
    const cols = [...document.querySelectorAll("thead tr:not(.gh) th")];
    const under = (label: string) => { let at = 0; for (const th of document.querySelectorAll(".gh.tg-row th")) { const n = Number(th.getAttribute("colspan") || 1); if (th.textContent?.startsWith(label)) return cols.slice(at, at + n).map((c) => c.textContent?.replace(/[▲▼▾]/g, "").trim()); at += n; } return []; };
    expect(under("FinLit Prism")).toEqual(["Prism score", "Growth & Profitability", "Valuation", "Quality", "Risk"]);
    expect(under("Technical views")).toEqual(["Short term", "Long term"]);
  });

  it("no coverage note or bar above the table (V-2): How FinLit Prism works says how many are rated; a company without a rating says why, with a Rate now link", () => {
    open();
    expect(document.querySelector(".pzs-cover, .pzs-bar")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /How FinLit Prism works/ })[0]);
    expect(screen.getByRole("dialog", { name: "How FinLit Prism works" }).textContent).toMatch(/Prism has rated 4 of 6 companies \(67%\)/);
    fireEvent.keyDown(document, { key: "Escape" });
    const e = rowOf("EEE");
    expect(e.textContent).toMatch(/Not rated yet/);
    expect(within(e).getByRole("link", { name: "Rate EEE with Prism now" }).getAttribute("href")).toBe("/prism/EEE");
    const d = rowOf("DDD");
    expect(d.textContent).toMatch(/Not rated/); expect(d.textContent).not.toMatch(/Rate now/);
  });

  const prismPanel = () => { fireEvent.click(screen.getByRole("button", { name: /^Prism score/ })); return within(screen.getByRole("dialog", { name: "Prism score" })); };

  it("SPEC §3: the Prism score panel filters by the rating words (with counts, zero greyed) and writes them to the address", async () => {
    open();
    const p = prismPanel(), rating = within(p.getByRole("group", { name: "Prism rating" }));
    expect(rating.getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(["Strong1", "Healthy1", "Average1", "Weak0", "Poor1", "Not rated2"]);
    expect((rating.getByRole("checkbox", { name: /^Weak/ }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(rating.getByRole("checkbox", { name: /^Strong/ })); fireEvent.click(rating.getByRole("checkbox", { name: /^Healthy/ }));
    await waitFor(() => expect(symbols()).toEqual(["AAA", "BBB"]));
    expect(loc()).toBe("/advanced-score-screener?pl=strong%2Chealthy");
    expect(screen.getByRole("button", { name: "Prism score, 2 on" })).toBeTruthy();
    expect(p.getByText("2 on")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove filter Prism rating: Strong, Healthy" }));
    await waitFor(() => expect(symbols()).toHaveLength(6));
  });

  it("SPEC §3: a from-to range for Prism and each part; a missing value never passes; an empty box is no limit and a typed value is held to 0-100", async () => {
    open();
    const p = prismPanel();
    expect(p.getAllByRole("group").map((g) => g.getAttribute("aria-label")).filter((n) => n?.endsWith("score range"))).toEqual(["Prism score range", "Growth & Profitability score range", "Valuation score range", "Quality score range", "Risk score range"]);
    expect(p.getByRole("group", { name: "Risk score range" }).textContent).toMatch(/high = low risk/);
    fireEvent.change(p.getByLabelText("Valuation from"), { target: { value: "50" } });
    fireEvent.change(p.getByLabelText("Risk from"), { target: { value: "65" } });
    await waitFor(() => expect(symbols()).toEqual(["AAA"]));
    expect(loc()).toBe("/advanced-score-screener?zvmin=50&zrmin=65");
    expect(screen.getByRole("button", { name: "Remove filter Prism Valuation: Average, Healthy, Strong" })).toBeTruthy();   // band names, never the cut-off (14 Nov N-31)
    fireEvent.change(p.getByLabelText("Quality to"), { target: { value: "150" } });
    expect((p.getByLabelText("Quality to") as HTMLInputElement).value).toBe("100");
    fireEvent.change(p.getByLabelText("Prism from"), { target: { value: "70" } });
    await waitFor(() => expect(loc()).toContain("zmin=70"));
    expect(symbols()).not.toContain("EEE");   // EEE is not rated: a blank never counts as a pass
    fireEvent.click(p.getByRole("button", { name: "Clear score filters" }));
    await waitFor(() => expect(symbols()).toHaveLength(6));
    expect(p.getByText("Counts are for this list")).toBeTruthy();
  });

  it("SPEC §3: the technical views in five words, each with its count", async () => {
    open();
    const p = prismPanel(), st = within(p.getByRole("group", { name: "Short term technical view" }));
    expect(st.getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(["Strong uptrend1", "Uptrend2", "Sideways1", "Downtrend0", "Strong downtrend0"]);
    fireEvent.click(st.getByRole("checkbox", { name: /^Uptrend/ }));
    await waitFor(() => expect(symbols()).toEqual(["CCC", "FFF"]));
    expect(loc()).toBe("/advanced-score-screener?st5=u");
    expect(screen.getByRole("button", { name: "Remove filter Short term: Uptrend" })).toBeTruthy();
  });

  it("the header row's Technical view keeps the old panel's bands (Uptrend, Sideways, Downtrend) for each view", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Technical view" }));
    const d = within(screen.getByRole("dialog", { name: "Technical view" }));
    const st = within(d.getByRole("group", { name: "Short-term technical view" })), lt = within(d.getByRole("group", { name: "Long-term technical view" }));
    expect(st.getAllByRole("button").map((b) => b.textContent)).toEqual(["Uptrend", "Sideways", "Downtrend"]);   // the band name only (14 Nov N-31)
    fireEvent.click(st.getByRole("button", { name: "Uptrend" }));
    await waitFor(() => expect(symbols()).toEqual(["AAA", "CCC", "FFF"]));    // +55, +22, +22 are Positive; BBB +5 is Neutral; unrated have no score
    expect(loc()).toBe("/advanced-score-screener?st=pos");
    fireEvent.click(lt.getByRole("button", { name: "Downtrend" }));
    await waitFor(() => expect(symbols()).toEqual([]));                       // Positive short term and Negative long term: nobody here
    expect(screen.getByRole("button", { name: "Remove filter Long-term technical: Downtrend" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove filter Short-term technical: Uptrend" }));
    await waitFor(() => expect(symbols()).toEqual(["BBB"]));
  });

  it("the four Prism views are server screens in the strip (14 Nov N-35): no second list of them in the filter panel, and an old quick-view link still filters", () => {
    open();
    expect(screen.queryByRole("group", { name: "Quick views built from the Prism parts" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Prism strong and lower risk" })).toBeNull();
    cleanup(); open("?zmin=80&zrmin=65&rated=1");                              // an address saved from the old quick view
    expect(symbols()).toEqual(["AAA"]);
    expect(document.body.textContent?.toLowerCase()).not.toMatch(forbidden);
  });

  it("sorts on the Prism score, each part and each technical view, companies without a value last", () => {
    open("?size=50");
    fireEvent.click(screen.getByRole("button", { name: "Sort by Prism score" }));
    expect(symbols()).toEqual(["AAA", "BBB", "CCC", "FFF", "DDD", "EEE"]);
    fireEvent.click(screen.getByRole("button", { name: "Sort by Prism score" }));
    expect(symbols()).toEqual(["FFF", "CCC", "BBB", "AAA", "DDD", "EEE"]);
    fireEvent.click(screen.getByRole("button", { name: "Sort by Long term" }));
    expect(loc()).toContain("sort=prism_lt_score"); expect(symbols().slice(-2)).toEqual(["DDD", "EEE"]);
    fireEvent.click(screen.getByRole("button", { name: "Sort by Risk" }));
    expect(loc()).toContain("sort=prism_risk");
  });

  it("ignores FinLit-score parameters in the address", () => {
    open("?f=high&omin=90&sort=overall");
    expect(symbols()).toHaveLength(6);
    expect(document.querySelector(".hf-empty")).toBeTruthy();   // no filter read from the FinLit-score parameters
  });

  it("selects, compares up to 4 and adds to the watchlist", () => {
    open();
    ["AAA", "BBB", "CCC"].forEach((s) => fireEvent.click(screen.getByRole("checkbox", { name: `Select ${s}` })));
    fireEvent.click(screen.getByRole("button", { name: "Compare 3" }));
    expect(loc()).toBe("/compare?c=AAA,BBB,CCC");
  });

  it("adds the selection to the watchlist", () => {
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select AAA" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to watchlist" }));
    expect(watch.has("AAA")).toBe(true);
  });

  it("has no export buttons", () => {
    open();
    expect(screen.queryByRole("button", { name: /Export/ })).toBeNull();
  });

  it("opens the How FinLit Prism works dialog with the Prism definitions and the technical bands", () => {
    open();
    fireEvent.click(screen.getAllByRole("button", { name: /How FinLit Prism works/ })[0]);
    const d = screen.getByRole("dialog", { name: "How FinLit Prism works" });
    expect(d.textContent).toMatch(/Strong, Healthy, Average, Weak or Poor/); expect(d.textContent).not.toMatch(/80 and above|65 to 79|5 to 20 sessions|6 to 18 months|\+20 and above/);   // N-31
    expect(d.textContent).toMatch(/Uptrend, Sideways and Downtrend/);
    expect(d.textContent?.toLowerCase()).not.toMatch(forbidden);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Advanced stock screener: every plan below Gold gets the upgrade page", () => {
  const nothing = () => {
    expect(st.loads).toBe(0);                                                  // the universe is never requested
    const page = document.body.textContent || "";
    expect(page).not.toMatch(/AAA|BBB|CCC|FFF|Rate now|Prism has rated/);          // no company of the data, no coverage line
    expect(screen.queryByRole("table", { name: /matching the filters/ })).toBeNull();
  };
  for (const plan of ["basic", "silver"] as const) {
    it(`${plan}: explanation, a labelled static example, the benefits and an Unlock with Gold button; no request, no real value`, () => {
      st.plan = plan; open();
      nothing();
      expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/FinLit Prism/);
      expect(screen.getByText("Example")).toBeTruthy();
      expect(screen.getByText(/Sample companies and figures, only to show the layout/)).toBeTruthy();
      expect(screen.getByRole("table", { hidden: true, name: /Example of the advanced stock screener/ }).textContent).toMatch(/Example Company A/);
      expect(screen.getAllByText(/Four financial-health parts, each 0 to 100/).length).toBeGreaterThan(0);
      fireEvent.click(screen.getAllByRole("button", { name: /Unlock with Gold/ })[0]);
      expect(st.upgrade).toHaveBeenCalledWith("gold", expect.any(String));
      expect(document.body.textContent?.toLowerCase()).not.toMatch(forbidden);
      expect(screen.getByRole("link", { name: "Basic stock screener" }).getAttribute("href")).toBe("/score-screener");
    });
  }
  it("a Silver response (rows with no Prism values) still renders nothing of Prism", () => {
    st.plan = "silver"; st.rows = DATA.map((r) => ({ ...r, ...Object.fromEntries(Object.keys(r).filter((k) => k.startsWith("prism_")).map((k) => [k, null])) }));
    open(); nothing();
  });

  it("V-3: the 52-week high is a filter in the header row (task #258), not an open card above the table", () => {
    open();
    expect(document.querySelector(".sx-hibar")).toBeNull();
    fireEvent.click(within(screen.getByRole("toolbar", { name: "Filters" })).getByRole("button", { name: "52-week high" }));
    expect(within(screen.getByRole("dialog", { name: "Down from 52-week high" })).getByRole("group", { name: "Quick picks" })).toBeTruthy();
  });

  it("V-5: Leader / In line / Laggard after the company name, only where the list carries one", () => {
    st.rows = DATA.map((r, i) => (i === 0 ? { ...r, lead: "leader", lead_line: "1 of 9 Banks peers" } : i === 1 ? { ...r, lead: "laggard" } : r));
    open();
    const tag = rowOf("AAA").querySelector(".sxl-tag")!;
    expect(tag.textContent).toBe("Leader"); expect(tag.getAttribute("title")).toMatch(/1 of 9 Banks peers.*past price performance only/);
    expect(rowOf("BBB").querySelector(".sxl-tag")!.textContent).toBe("Laggard");
    expect(rowOf("CCC").querySelector(".sxl-tag")).toBeNull();
  });

  it("V-6: a technical cell leads with the signed number in a pill and a bar from the centre", () => {
    open();
    const cell = rowOf("BBB").querySelectorAll(".pzs-tv")[1]!;
    expect(cell.querySelector(".pzs-tp")!.textContent).toBe("−35");
    const bar = cell.querySelector<HTMLElement>(".pzs-tb i")!;
    expect(bar.style.left).toBe("32.5%"); expect(bar.style.width).toBe("17.5%");     // −35: from 32.5% up to the centre
  });
});
