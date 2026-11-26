// @vitest-environment jsdom
// Task #408 (the founder's 27 Nov Watchlists pack): the page as the pack draws it, on the pack's sample list (SBIN and RELIANCE; empty lists h and k).
// The API answers are the live site's fields on 26 Nov 2026 (reference/sample-data.json), served through a mocked apiGet, so the page's own reads and
// rules run. Checked: drop-downs closed on load and the Today line, Needs a look, the four column sets, sorting both ways, Group by and folding, Details,
// targets updating the distance and the cards, notes, Compare, the screens badge, Alerts for this list and its summary, the empty list, the removed parts
// and the wording rules.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Row } from "../lib/screener";

const st = vi.hoisted(() => ({ gold: true, toast: vi.fn(), create: vi.fn(), remove: vi.fn(), alerts: [] as unknown[], fail: new Set<string>() }));
const ROWS = [
  { symbol: "SBIN", name: "State Bank Of India", sector: "Banks", price: 1136.65, market_cap: 1049215, pe: 11.62, pb: 1.52, roe: 13.05, dividend_yield: 1.52, change_pct: -0.13 },
  { symbol: "RELIANCE", name: "Reliance Industries Ltd", sector: "Refineries", price: 1396.2, market_cap: 1889413, pe: 22.6, pb: 1.97, roe: 8.7, dividend_yield: 0.44, change_pct: 1.62 },
  { symbol: "TCS", name: "Tata Consultancy Services Ltd", sector: "IT", price: 3100, market_cap: 1100000, pe: 25, pb: 12, roe: 50, dividend_yield: 2, change_pct: 0.5 },
] as unknown as Row[];
const sum = (price: number, chg: number, h: number, l: number, ret: [number, number, number], name: string) => ({ profile: { name }, quote: { price, changePct: chg, high52: h, low52: l, asOf: "2026-11-26T15:28:00+05:30" },
  returns: [{ period: "1M", price: ret[0] }, { period: "3M", price: ret[1] }, { period: "1Y", price: ret[2] }] });
const lead = (label: string, raw: string, rank: number, ranked: number, since: string, pending: string | null, bench: string, w52: number, w13: number, top: string, top52: number, group: string) => ({
  available: true, asOf: "2026-11-20", stale: false, held: false, peerGroup: { id: "g", name: group, short: group, kind: "industry", ranked }, benchmarks: { sector: { code: "X", name: bench, kind: "index", ret52: 0.1 }, market: null },
  rel: { w13, w26: 0, w52, w52Market: 0 }, rank, label, rawLabel: raw, direction: null, fundamentalNote: null, fundamentalRank: null, fundamentalOf: null, labelSince: since,
  sectorReliability: { tier: "mixed", hitRate6m: 0.6, checks: 1, from: null, to: null, periods: [] }, display: { chip: null, line: "", note: null, tooltip: null, pending }, peers: [{ symbol: "TOP", name: top, rank: 1, label: "leader", direction: null, rel13: 0, rel52: top52, rel52Market: 0, marketCap: 1 }] });
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(from) + i * 86_400_000).toISOString().slice(0, 10));
const API: Record<string, unknown> = {
  "/api/stocks/SBIN": sum(1136.65, -0.13, 1234.8, 933.85, [18.7, 8.6, 20.1], "State Bank Of India"),
  "/api/stocks/RELIANCE": sum(1396.2, 1.62, 1611.2, 1152.3, [15.3, 4.2, -10.8], "Reliance Industries Ltd"),
  "/api/stocks/SBIN/leadership": lead("in_line", "in_line", 4, 9, "2026-09-25", null, "Nifty PSU Bank", 0.019, -0.035, "Bank Of Maharashtra", 0.515, "PSU bank"),
  "/api/stocks/RELIANCE/leadership": lead("laggard", "in_line", 4, 6, "2026-03-13", "This week’s reading says In line.", "Nifty Oil & Gas", -0.061, 0.013, "Chennai Petroleum", 0.441, "Petroleum Products"),
  "/api/leadership/list": { available: true, asOf: "2026-11-20", rows: {
    SBIN: { available: true, label: "in_line", rank: 4, ranked: 9, group: "PSU bank", groupName: "PSU bank", sector: "Nifty PSU Bank", rel52: 0.019, fundamentalRank: null, fundamentalOf: null, fundamentalNote: null, rawLabel: "in_line" },
    RELIANCE: { available: true, label: "laggard", rank: 4, ranked: 6, group: "Petroleum Products", groupName: "Petroleum Products", sector: "Nifty Oil & Gas", rel52: -0.061, fundamentalRank: null, fundamentalOf: null, fundamentalNote: null, rawLabel: "in_line" } } },
  "/api/stocks/SBIN/financials": { quarterly: { pl: { periods: ["Sep 2025", "Sep 2026"], rows: { revenue: [128000, 141073], net_profit: [21134, 25361] } } } },
  "/api/stocks/RELIANCE/financials": { quarterly: { pl: { periods: ["Sep 2025", "Jun 2026", "Sep 2026"], rows: { revenue: [258898, 311850, 332861], net_profit: [18165, 20946, 25548] } } } },
  "/api/stocks/SBIN/events": { announcements: [{ date: "2026-11-23", category: "Updates", description: "Investor meet notice", link: "https://example.org/a.pdf" },
    { date: "2026-11-03", category: "Outcome of Board Meeting", description: "State Bank Of India has submitted the financial results for the period ended September 30, 2026", link: "https://example.org/b.pdf" }] },
  "/api/stocks/RELIANCE/events": { announcements: [{ date: "2026-10-30", category: "Press Release", description: "Unaudited Financial Results for the quarter ended September 30, 2026", link: "https://example.org/c.pdf" }] },
  "/api/stocks/SBIN/price-6M": { series: { t: days("2026-08-26", 92), c: days("2026-08-26", 92).map((_, i) => 1000 + i) } },
  "/api/stocks/RELIANCE/price-6M": { series: { t: days("2026-08-26", 92), c: days("2026-08-26", 92).map((_, i) => 1300 + i) } },
  "/api/sectors/membership": { date: "2026-11-20", groups: { SBIN: { slug: "banks", name: "Banks" }, RELIANCE: { slug: "petroleum-products", name: "Petroleum Products" } } },
  "/api/sectors": { date: "2026-11-20", date_label: "20 Nov 2026", rows: [
    { name: "Banks", slug: "banks", sector: "Financial Services", state_code: "confirmed", meaning: "", breadth: { above_9: 80, above_20: 91, above_50: 86.1 }, stocks_counted: 36, index_vs_52w_high: 0 },
    { name: "Petroleum Products", slug: "petroleum-products", sector: "Oil Gas & Consumable Fuels", state_code: "thrust_c", meaning: "", breadth: { above_9: 41, above_20: 41, above_50: 50 }, stocks_counted: 12, index_vs_52w_high: -3.4 }] },
  "/api/rotation": { date: "2026-11-20", corner_meanings: { ahead_gaining: "Ahead of the average industry and gaining.", ahead_slowing: "Ahead of the average industry, but slowing." },
    moved_this_week: [{ name: "Petroleum Products", slug: "petroleum-products", from: "Ahead and gaining", to: "Ahead but slowing" }], rows: [
    { slug: "banks", corner: "ahead_gaining", corner_name: "Ahead and gaining", corner_since: "2026-11-13", rank: 1, ranked: 37, rank_change_1w: 2, rank_change_4w: 10, strength_pts: 12.6, change_pts: 6.6, rank_history: [19, 23, 15, 3, 1].map((rank, i) => ({ date: `2026-10-0${i + 1}`, rank })) },
    { slug: "petroleum-products", corner: "ahead_slowing", corner_name: "Ahead but slowing", corner_since: "2026-11-20", rank: 2, ranked: 37, rank_change_1w: 4, rank_change_4w: -1, strength_pts: 16.3, change_pts: -2.5, rank_history: [6, 5, 4, 6, 2].map((rank, i) => ({ date: `2026-10-0${i + 1}`, rank })) }] },
  "/api/discovery/board": { rows: [{ s: "RELIANCE", th: "Industrial Manufacturing & Capex", st: "Operating" }] },
  "/api/screener/membership": { asOf: "2026-11-23", screens: 53, symbols: { SBIN: [
    { id: "a", name: "Fresh close above a base", group: "Chart patterns", added_on: "2026-11-20", baseline: true, position: 6, count: 15 },
    { id: "b", name: "Setups with the sector behind them", group: "Sectors", added_on: "2026-11-20", baseline: false, position: 8, count: 125 },
    { id: "c", name: "Growth with a stretched valuation", group: "Prism views", added_on: "2026-11-19", baseline: false, position: 133, count: 327 },
    { id: "d", name: "Low-volatility names", group: "Safety", added_on: "2026-11-11", baseline: true, position: 14, count: 27 }], RELIANCE: [] } },
  "/api/results/calendar": { today: "2026-11-26", days: [] },
  "/api/taxonomy/companies": { companies: { SBIN: { symbol: "SBIN", industry: "Banks", sector: "Financial Services" }, RELIANCE: { symbol: "RELIANCE", industry: "Petroleum Products", sector: "Oil Gas & Consumable Fuels" } } },
};
const OVERVIEW = (gold: boolean) => ({ model: gold ? "prism" : "finlit", plan: gold ? "gold" : "silver", count: 2, disclaimer: "", holdings: [
  { symbol: "SBIN", status: "ready", prism: gold ? { state: "rated", final: 60.62, label: "Average", status: "RATED", parts: { fundamental: 75.12, valuation: 49.74, quality: 33.89, risk: 88.75 }, shortTerm: { score: 27.6, word: "Uptrend" }, longTerm: { score: 18.5, word: "Sideways" }, at: null, reason: null } : undefined },
  { symbol: "RELIANCE", status: "ready", prism: gold ? { state: "rated", final: 57.1, label: "Average", status: "RATED", parts: { fundamental: 55, valuation: 40, quality: 72, risk: 80 }, shortTerm: { score: 39, word: "Uptrend" }, longTerm: { score: -21, word: "Downtrend" }, at: null, reason: null } : undefined }] });
vi.mock("../lib/api", async (orig) => {
  const real = await orig<typeof import("../lib/api")>();
  const get = async (path: string) => {
    const p = path.split("?")[0];
    if (st.fail.has(p)) throw new real.ApiError(500, {});
    if (p === "/api/screener/membership" && !st.gold) throw new real.ApiError(403, {});
    if (p in API) return API[p];
    throw new real.ApiError(404, {});
  };
  return { ...real, apiGet: vi.fn(get), apiSend: vi.fn(async (_m: string, p: string) => (p === "/api/portfolio/overview" ? OVERVIEW(st.gold) : {})), useQuotesFor: () => ({ data: { rows: [] }, isLoading: false }), shouldRetry: () => false };
});
vi.mock("../lib/screener", async (orig) => ({ ...(await orig<typeof import("../lib/screener")>()), useUniverse: () => ({ data: { rows: ROWS, sample: false, asOf: "2026-11-26" }, isLoading: false, isError: false, refetch: () => undefined }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ has: (t: string) => t !== "gold" || st.gold, toast: st.toast, upgrade: vi.fn(), plan: st.gold ? "gold" : "silver" }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: { id: "u" }, plan: st.gold ? "gold" : "silver" }) }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/PageFaqs", () => ({ PageFaqs: () => <section aria-label="Questions about this page" /> }));
vi.mock("../components/AlertComposer", () => ({ AlertButton: ({ symbol, className }: { symbol: string; className?: string }) => <button className={className} aria-label={`Create an alert for ${symbol}`} /> }));
vi.mock("../lib/whatChanged", async (orig) => ({ ...(await orig<typeof import("../lib/whatChanged")>()),
  useChanges: (s: string[]) => ({ data: s.length ? { days: 90, events: [], companies: [{ s: "RELIANCE", n: "Reliance Industries Ltd", ev: { rating: { n: 4, d: "2026-11-04", t: "Credit Rating", l: "https://example.org/r.pdf", dates: ["2026-11-04"] }, fundraise: { n: 2, d: "2026-10-01", t: "Allotment of Securities", l: null, dates: ["2026-10-01"] } } }], notPlaced: [{ s: "SBIN", n: "State Bank Of India" }] } : undefined, isLoading: false, isError: false, refetch: () => undefined }),
  useLastVisit: () => "2026-11-25T10:00:00Z" }));
vi.mock("../lib/alerts", async (orig) => ({ ...(await orig<typeof import("../lib/alerts")>()), useAlerts: () => ({ alerts: st.alerts, limit: 300, create: { mutateAsync: st.create, isPending: false }, remove: { mutateAsync: st.remove, isPending: false } }) }));
import { WatchlistPage } from "./Watchlist";
import { watch } from "../lib/watchlist";

beforeEach(() => {
  localStorage.clear(); watch.reset(); st.gold = true; st.toast.mockClear(); st.create.mockReset(); st.remove.mockReset(); st.alerts = []; st.fail = new Set();
  watch.replace({ lists: [{ id: "main", name: "My watchlist", symbols: ["SBIN", "RELIANCE"] }, { id: "h", name: "h", symbols: [] }, { id: "k", name: "k", symbols: [] }],
    meta: { SBIN: { added: Date.parse("2026-11-23T06:00:00Z"), addedPrice: 1132.65 }, RELIANCE: { added: Date.parse("2026-11-25T06:00:00Z"), addedPrice: 1373.9 } } });
});
afterEach(cleanup);
const open = async () => {
  const r = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/watchlist"]}><WatchlistPage /></MemoryRouter></QueryClientProvider>);
  await screen.findByText("₹1,136.65");
  await act(async () => { await new Promise((x) => setTimeout(x, 30)); });
  return r;
};
const $ = (q: string) => document.querySelector(q) as HTMLElement;
const $$ = (q: string) => [...document.querySelectorAll(q)] as HTMLElement[];
const syms = () => $$("#wl-t tr.wl-r").map((r) => r.dataset.s);
const heads = () => [...$$("#wl-t thead tr:last-child th"), ...$$("#wl-t thead tr:first-child th[rowspan]")].map((t) => t.textContent!.trim().replace(/i$/, ""));
const click = (el: Element) => fireEvent.click(el);
const typeTarget = (sym: string, v: string) => fireEvent.change($(`input.wp-tg[data-tgt="${sym}"]`), { target: { value: v } });

describe("Watchlists (task #408): the page as the pack draws it", () => {
  it("has the header without the plan badge, the list pills, + New list, Add a stock, and Rename and Delete beside them", async () => {
    await open();
    expect(screen.getByRole("heading", { level: 1, name: "Watchlists" })).toBeTruthy();
    expect(screen.getByText("The companies you follow: what moved, what is near your target, and what is new.")).toBeTruthy();
    expect(screen.queryByText("SILVER")).toBeNull();
    expect(screen.getByRole("button", { name: "My watchlist · 2", pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "h · 0" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ New list" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Add a stock to this list")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rename “My watchlist”" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete this list" })).toBeTruthy();
  });
  it("opens with both drop-downs closed; Today's line counts the stocks, the day's moves and the cards", async () => {
    await open();
    expect(($("#wl-today") as HTMLDetailsElement).open).toBe(false);
    expect(($("#wl-al") as HTMLDetailsElement).open).toBe(false);
    expect($("#wl-td-now").textContent!.replace(/\s+/g, " ")).toBe("2 stocks · 1 up, 1 down on Thursday · 3 to look at");
    expect($("#wl-n").textContent).toBe("3");
    expect($$("#wl-look li").map((l) => l.textContent)).toEqual([
      "SBINNew in 2 screensSetups with the sector behind them (20 Nov) and Growth with a stretched valuation (19 Nov), in the Advanced screener.",
      "RELIANCEIndustry slowingPetroleum Products moved from Ahead and gaining to Ahead but slowing in the 20 Nov Sector Rotation.",
      "RELIANCEPeer label may changeA Laggard now; this week’s reading says In line. It changes if next week’s reading agrees."]);
    expect($(".wl-lkh .wl-sum").textContent).toBe("Prices at 3:28 pm, 26 Nov");
    expect($("#wl-quiet").textContent).toBe("Nothing else today. Set a target on a stock and it shows here when the price comes within 5% of it.");
  });
  it("a Needs a look card switches to the Price columns, opens that stock's Details", async () => {
    await open();
    click($('[data-view="sec"]'));
    click($('#wl-look [data-go="RELIANCE"]'));
    expect($('[data-view="price"]').getAttribute("aria-pressed")).toBe("true");
    expect(($("#wlx-RELIANCE") as HTMLTableRowElement).hidden).toBe(false);
  });
  it("shows the four column sets with the pack's columns; Price is pressed first", async () => {
    await open();
    expect($('[data-view="price"]').getAttribute("aria-pressed")).toBe("true");
    expect(heads()).toEqual(["Company", "Price · today", "Since added", "Your target", "1 month", "52-week range", "Trend", "Actions"]);
    const r = $('tr.wl-r[data-s="SBIN"]').textContent!;
    for (const t of ["₹1,136.65", "−0.13%", "+0.35%", "from 23 Nov", "+18.7%", "3 months +8.6%", "7.9% below high", "Flat, turning up", "Short ↗ · Long →", "4 screens"]) expect(r).toContain(t);
    expect($('tr.wl-r[data-s="RELIANCE"]').textContent).toContain("Falling but bouncing");
    click($('[data-view="prism"]'));
    expect(heads().sort()).toEqual(["Actions", "Company", "G&P", "Long term", "Prism", "Qual.", "RiskStrong = safer", "Short term", "Val.Strong = cheaper", "Vs its peers"].sort());
    expect($$("#wl-t thead th.wl-gh").map((t) => t.textContent)).toEqual(["FinLit Prism · Fundamental scorei", "Technical viewi", "Against peers"]);
    expect($('tr.wl-r[data-s="SBIN"]').textContent).toContain("61Average");
    expect($('tr.wl-r[data-s="RELIANCE"]').textContent).toContain("Laggard*4 of 6 peers");
    expect(($("#wl-foot") as HTMLElement).hidden).toBe(false);
    expect($("#wl-foot").textContent).toBe("* This week’s reading differs from the label; the label changes if next week’s reading agrees.");
    click($('[data-view="biz"]'));
    await act(async () => { await new Promise((x) => setTimeout(x, 30)); });
    expect(heads()).toContain("Div. yield");
    const rel = $('tr.wl-r[data-s="RELIANCE"]').textContent!;
    for (const t of ["Large", "₹18,89,413 Cr", "22.6×", "1.97×", "0.44%", "8.7%", "+28.6%", "₹3,32,861 Cr", "+40.6%", "30 Oct", "Sep quarter", "Industrial Manufacturing & Capex", "Operating"]) expect(rel).toContain(t);
    expect($('tr.wl-r[data-s="SBIN"]').textContent).toContain("Not placed yet");
    click($('[data-view="sec"]'));
    expect(heads().sort()).toEqual(["Company", "Industry", "Reading", "Where it stands", "Rank", "Stock vs index12 months", "Actions"].sort());
    const sb = $('tr.wl-r[data-s="SBIN"]').textContent!;
    for (const t of ["Banks", "Financial Services", "Rising together", "At its 1-year high", "Ahead and gaining", "Since 13 Nov", "1 of 37", "Up 2 this week", "+1.9 pts", "3 months −3.5"]) expect(sb).toContain(t);
    expect($("#wl-sfoot").textContent).toBe("Industry readings for the week to 20 Nov 2026, from NSE daily data with equal-weighted industry groups.Open Sector Pulse ↗Open Sector Rotation ↗");
  });
  it("sorts every arrowed column on a tap and reverses it on the second", async () => {
    await open();
    const two = (k: string) => { click($(`[data-sort="${k}"]`)); const a = [syms(), $(`[data-sort="${k}"]`).closest("th")!.getAttribute("aria-sort")]; click($(`[data-sort="${k}"]`)); return [a, [syms(), $(`[data-sort="${k}"]`).closest("th")!.getAttribute("aria-sort")]]; };
    expect(two("chgp")).toEqual([[["RELIANCE", "SBIN"], "descending"], [["SBIN", "RELIANCE"], "ascending"]]);
    expect(two("s")).toEqual([[["RELIANCE", "SBIN"], "ascending"], [["SBIN", "RELIANCE"], "descending"]]);
    expect(two("m1")[0][0]).toEqual(["SBIN", "RELIANCE"]);
    click($('[data-view="prism"]'));
    expect(two("prism")[0][0]).toEqual(["SBIN", "RELIANCE"]);
    expect(two("peerRank")[0][0]).toEqual(["SBIN", "RELIANCE"]);
  });
  it("groups Against peers, by Industry and by Size; a band folds its stocks; pressing the pill again ungroups", async () => {
    await open();
    click($('[data-grp="peers"]'));
    expect($$("#wl-t .wl-gb b").map((b) => b.textContent)).toEqual(["In line", "Laggards"]);
    expect($$("#wl-t .wl-gb span").map((b) => b.textContent)).toEqual(["1 stock", "1 stock"]);
    click($('[data-grp="industry"]'));
    expect($$("#wl-t .wl-gb b").map((b) => b.textContent)).toEqual(["Banks", "Petroleum Products"]);
    click($('[data-grp="size"]'));
    expect($$("#wl-t .wl-gb b").map((b) => b.textContent)).toEqual(["Large companies"]);
    click($(".wl-gb"));
    expect(syms()).toEqual([]);
    expect($(".wl-gb").getAttribute("aria-expanded")).toBe("false");
    click($(".wl-gb"));
    click($('[data-grp="size"]'));
    expect($(".wl-gb")).toBeNull();
  });
  it("Details holds the six blocks; a target updates the distance, the cards, both boxes and stays per stock", async () => {
    await open();
    click($('[data-x="SBIN"]'));
    await act(async () => { await new Promise((x) => setTimeout(x, 30)); });
    expect($('[data-x="SBIN"]').getAttribute("aria-expanded")).toBe("true");
    expect($$("#wlx-SBIN .wl-xc h3").map((h) => h.textContent)).toEqual(["Price · last 3 months", "Yours", "Latest filings", "Prism and peers", "Industry and theme", "Advanced screener · 4 screens"]);
    const x = $("#wlx-SBIN").textContent!;
    for (const t of ["Since added+0.35%", "1 month+18.7%", "Why you are watching", "Tell me when the price is within 5% of my target", "Keep on My watchlist", "Open the report ↗", "Remove",
      "23 NovInvestor meet notice ↗", "Last results: 3 Nov (Sep quarter)", "In line 4 of 9 PSU bank", "In line since 25 Sep", "Vs Nifty PSU Bank+1.9 pts over 12 months", "Bank Of Maharashtra, +51.5 pts vs Nifty PSU Bank",
      "Banks · Financial Services", "86% of its 36 stocks rising", "1 of 37 · up 2 this week", "+12.6 pts over 6 months", "+6.6 pts last month", "Not placed yet",
      "Fresh close above a base ↗Chart patterns · on it since 20 Nov · 6 of 15", "Setups with the sector behind them ↗Sectors · joined 20 Nov · 8 of 125", "Screens as of 23 Nov. A screen narrows a list; it is not a recommendation."]) expect(x).toContain(t);
    expect(($("#wlx-SBIN input[data-al]") as HTMLInputElement).checked).toBe(true);
    typeTarget("SBIN", "1180");
    expect($('[data-dist="SBIN"]').textContent).toBe("3.8% below target");
    expect($('[data-dist="SBIN"]').className).toContain("near");
    expect($("#wl-n").textContent).toBe("4");
    expect($("#wl-n2").textContent).toBe("4");
    expect(($("#tg-SBIN") as HTMLInputElement).value).toBe("1180");
    expect(watch.get().meta.SBIN.target).toBe(1180);
    expect($$("#wl-look li")[0].textContent).toBe("SBINNear your target₹1,136.65 is 3.8% below your target of ₹1,180.00");
    expect($("#wl-quiet").textContent).toBe("Nothing else today: no results due this week, no move of 5% or more, and no new filing of Discover’s eight kinds.");
    typeTarget("SBIN", "");
    expect($("#wl-n").textContent).toBe("3");
    fireEvent.click($("#wlx-SBIN input[data-al]"));
    expect(watch.get().meta.SBIN.nearAlert).toBe(false);
    fireEvent.change($("#nt-SBIN"), { target: { value: "Waiting for Q3" } });
    expect($('[data-note="SBIN"]').getAttribute("title")).toBe("Waiting for Q3");
    expect($('#wlx-RELIANCE').hidden).toBe(true);
    expect($('[data-x="RELIANCE"]').getAttribute("aria-label")).toBe("Details for RELIANCE");
    expect($('tr.wl-r[data-s="SBIN"] [aria-label="Create an alert for SBIN"]')).toBeTruthy();
  });
  it("the pending note shows in Details, and a stock in no screen says so", async () => {
    await open();
    click($('[data-x="RELIANCE"]'));
    await act(async () => { await new Promise((x) => setTimeout(x, 30)); });
    expect($("#wlx-RELIANCE .wl-pend").textContent).toBe("This week’s reading says In line. The label changes if next week’s reading agrees.");
    expect($("#wls-RELIANCE").textContent).toContain("Advanced screener · no screens");
    expect($("#wls-RELIANCE").textContent).toContain("Not in any of the screener’s 53 screens today.");
    expect($('[data-scr="RELIANCE"]')).toBeNull();
  });
  it("ticking two stocks shows Compare 2; the screens badge opens Details at the screens", async () => {
    await open();
    expect($("#wl-cmp").classList.contains("on")).toBe(false);
    click($('[data-cmp="SBIN"]')); click($('[data-cmp="RELIANCE"]'));
    expect($("#wl-cmp").classList.contains("on")).toBe(true);
    expect($("#wl-cmp").textContent).toBe("Compare 2");
    expect($('[data-cmp="SBIN"]').getAttribute("aria-label")).toBe("Select SBIN to compare");
    click($('[data-scr="SBIN"]'));
    expect($("#wlx-SBIN").hidden).toBe(false);
    expect($("#wls-SBIN")).toBeTruthy();
  });
  it("Alerts for this list: three groups, the summary follows the pills, Save stores the list's choice and its filing alert", async () => {
    await open();
    expect($("#wl-al-now").textContent).toBe("Target: on · Peer labels: any change · Filings: order win, capacity");
    const g = $$("#wl-al .wp-alert");
    expect(g.map((x) => x.dataset.one || "multi")).toEqual(["1", "1", "multi"]);
    click(g[1].querySelectorAll(".wp-pill")[1]);
    click(g[2].querySelectorAll(".wp-pill")[5]);
    expect($("#wl-al-now").textContent).toBe("Target: on · Peer labels: only to laggard · Filings: order win, capacity, credit rating");
    expect(g[1].querySelectorAll('[aria-pressed="true"]').length).toBe(1);
    st.create.mockResolvedValue({});
    await act(async () => { click($("#wl-save")); await new Promise((x) => setTimeout(x, 10)); });
    expect($("#wl-msg").textContent).toBe("Saved.");
    expect(watch.get().lists[0].alerts).toEqual({ target: true, peer: "laggard", filings: ["order", "capacity", "rating"] });
    expect(watch.get().lists[0].labelAlert).toBe("laggard");
    expect(st.create).toHaveBeenCalledWith(expect.objectContaining({ metric: "discover_filing", list: "watch:main", kinds: ["order", "capacity", "rating"] }));
  });
  it("a list's existing filing alert and older label choice are what the card shows", async () => {
    st.alerts = [{ id: "a1", metric: "discover_filing", list: "watch:main", kinds: ["mna", "legal"], status: "active" }];
    watch.setLabelAlert("main", "leader");
    await open();
    expect($("#wl-al-now").textContent).toBe("Target: on · Peer labels: only to leader · Filings: acquisition / merger, legal / regulatory");
  });
  it("an empty list shows the dashed box, hides the table, and What changed says what to do", async () => {
    await open();
    click(screen.getByRole("button", { name: "h · 0" }));
    expect($("#wl-today-h").textContent).toBe("Today on h");
    expect($("#wl-td-now").textContent).toBe("No stocks yet");
    expect($("#wl-quiet").textContent).toBe("Add a stock to this list and its moves, targets and news show here.");
    expect($("#wp-list").textContent).toBe("h");
    expect(($("#wl-empty") as HTMLElement).hidden).toBe(false);
    expect($("#wl-empty").textContent).toBe("This list is empty. Type a stock in “Add a stock to this list”, or use Watchlist on any company report.");
    expect(($(".wl-list .wp-tw") as HTMLElement).hidden).toBe(true);
    expect(($(".wl-list .wl-ctl") as HTMLElement).hidden).toBe(true);
    expect(($("#wl-wce") as HTMLElement).hidden).toBe(false);
    expect($("#what-changed .wp-sub").textContent).toBe("From Discover: the companies on h and what they filed in the last 90 days.");
    expect(screen.getByRole("button", { name: "Rename “h”" })).toBeTruthy();
    expect($("#wl-al .wl-al-b .wp-sub").textContent).toBe("For every stock on h, now and as you add more.");
  });
  it("What changed shows only kinds with a filing, then the others in one line, without the list pills or Alert me", async () => {
    await open();
    expect($$("#what-changed .wc-tile").map((t) => t.textContent)).toEqual(["Fund raising1", "Credit ratings1"]);
    expect($("#what-changed .wl-none").textContent).toBe("None of the other 6 kinds in 90 days");
    expect($("#what-changed .wp-sub").textContent).toBe("From Discover: 1 of the 2 companies on My watchlist filed one of these in the last 90 days.");
    expect(screen.queryByRole("button", { name: /Alert me/ })).toBeNull();
    expect($("#what-changed .wc-lists")).toBeNull();
  });
  it("one source failing shows 'Could not load. Try again.' only where it is used", async () => {
    st.fail = new Set(["/api/rotation", "/api/sectors"]);
    await open();
    click($('[data-view="sec"]'));
    await screen.findAllByText(/Could not load/, {}, { timeout: 5000 });
    expect($('tr.wl-r[data-s="SBIN"]').textContent).toContain("Could not load. Try again.");
    expect($('tr.wl-r[data-s="SBIN"]').textContent).toContain("Banks");
    click($('[data-view="price"]'));
    expect($('tr.wl-r[data-s="SBIN"]').textContent).not.toContain("Could not load");
  });
  it("on Silver the Prism scores and the screens say they come with Gold, and nothing else is hidden", async () => {
    st.gold = false;
    await open();
    expect($('tr.wl-r[data-s="SBIN"] .wl-tr').textContent).toBe("—");
    click($('[data-view="prism"]'));
    expect($('tr.wl-r[data-s="SBIN"] .wl-sc').getAttribute("title")).toBe("FinLit Prism comes with Gold.");
    expect($('tr.wl-r[data-s="SBIN"]').textContent).toContain("In line4 of 9 peers");
    expect($('[data-scr="SBIN"]')).toBeNull();
  });
  it("removes what the pack removes and keeps the words the pack sets", async () => {
    await open();
    const text = document.body.textContent!;
    for (const gone of ["Concentration", "Key figures", "Price and business disagree", "Themes on this list", "Download", "Tell me when a label changes", "Tell me when a company on this list files", "Saved in this browser", "saved in this browser", "SILVER"]) expect(text).not.toContain(gone);
    expect(text).toContain("In simple words: lists, notes and targets are saved to your FinLit account. Targets are your own reminders, not predictions; FinLit does not tell you when to buy or sell.");
    const scan = text.replace("FinLit does not tell you when to buy or sell", "").replace(/not a recommendation/g, "");
    expect(scan).not.toMatch(/\b(buy|sell|recommend\w*|undervalued|overvalued|bullish|bearish|thrust)\b/i);
    expect(scan).not.toMatch(/\btags?\b/i);
    expect(scan).not.toMatch(/(?<![\w-])-\d/);
  });
  it("adding a stock keeps its price when the add box knows it, and the list-is-full line uses the plan's numbers", async () => {
    watch.add("TCS", "main", 3100);
    expect(watch.get().meta.TCS.addedPrice).toBe(3100);
    await open();
    expect(within(screen.getByRole("group", { name: "Your lists" })).getByRole("button", { name: "My watchlist · 3" })).toBeTruthy();
  });
});
