// @vitest-environment jsdom
// The full Stock screener: groups start closed, a chosen chip puts its column in the table at once (for the period tab it is on),
// the table opens with P/E and 3Y average P/E, saved column choices win, and the address holds the filters.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cellTone, chipColumn, colourColumns, colourNote, decodeState, defaultColumns, emptyReason, encodeState, norm, tableColumns, type Catalog, type MetricInfo } from "../lib/proscreen";

vi.mock("../lib/ui", () => ({ useUI: () => ({ upgrade: vi.fn(), toast: vi.fn(), plan: "silver" }), TIER: { gold: { n: "Gold" }, silver: { n: "Silver" }, basic: { n: "Basic" } } }));
const admin = vi.hoisted(() => ({ on: true }));
vi.mock("../lib/auth", () => ({ limitsFor: () => ({ screens: 5 }), useAuth: () => ({ isAdmin: admin.on }) }));
vi.mock("../three/support", () => ({ supports3d: () => false, whenIdle: () => () => {} }));
import { ScreenerPro } from "./ScreenerPro";

const M = (key: string, label: string, o: Partial<MetricInfo> = {}): MetricInfo => ({ key, label, unit: "x", better: "lower", tier: "basic", say: label, digits: 1, locked: false, hidden: false, variants: null,
  stats: { min: 0, p10: 5, p50: 20, p90: 60, max: 100, n: 4000, hist: [1, 2, 3, 2, 1] }, ...o });
const VAR = (b: string) => ({ now: b, "3y": `${b}_avg_3y`, "5y": `${b}_avg_5y`, "7y": `${b}_avg_7y` });
const catalog = (lockSilver = false): Catalog => ({
  plan: lockSilver ? "basic" : "silver", total: 5813, withReport: 5000, updatedAt: "2026-10-30T00:00:00Z", sectors: [], industries: [], indices: [], caps: [], bands: [], limits: { rows: null, export: true },
  defaultColumns: ["market_cap", "price"],
  groups: [
    { id: "valuation", label: "Valuation", tier: "basic", metrics: [
      M("pe", "P/E Ratio", { variants: VAR("pe") }), M("pb", "P/B Ratio", { tier: "silver", locked: lockSilver, variants: VAR("pb") }), M("dividend_yield", "Dividend Yield", { unit: "%", better: "higher" }),
      ...["pe", "pb"].flatMap((b) => ["3y", "5y", "7y"].map((p) => M(`${b}_avg_${p}`, `${b === "pe" ? "P/E Ratio" : "P/B Ratio"}, ${p.toUpperCase()} average`, { hidden: true, tier: "silver", locked: lockSilver })))] },
    { id: "profitability", label: "Profitability", tier: "basic", metrics: [M("roe", "Return on equity", { unit: "%", better: "higher" })] },
    { id: "size", label: "Size", tier: "basic", metrics: [M("market_cap", "Market cap", { unit: "Cr", better: "higher" }), M("price", "Share price", { unit: "Rs", better: "none" })] },
  ],
});
const st = vi.hoisted(() => ({ funnel: undefined as unknown, many: 0, flat: false, cat: null as unknown, bodies: [] as { columns: string[]; filters: Record<string, unknown>; sort: { key: string; dir: string }; cats?: Record<string, string[]> }[] }));

const Where = () => { const l = useLocation(); return <output data-testid="loc">{l.pathname + l.search}</output>; };
const mount = (qs = "") => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={["/screener" + qs]}><Routes><Route path="/screener" element={<><ScreenerPro /><Where /></>} /></Routes></MemoryRouter></QueryClientProvider>);
};
const heads = () => Array.from(document.querySelectorAll(".scr-t thead th button")).map((b) => (b.getAttribute("aria-label") || b.textContent || "").replace(/^Sort by /, "").replace(/\s*[▲▼▾]$/, "").trim());
const colBtn = () => screen.getByRole("button", { name: /^Columns/ }).textContent;
const group = (label: RegExp) => screen.getByRole("button", { name: label });
const ready = () => waitFor(() => expect(document.querySelector(".scr-t")).toBeTruthy());

beforeEach(() => {
  st.cat = catalog(); st.bodies = []; st.many = 0; st.flat = false; st.funnel = undefined; localStorage.clear();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/api/screener/catalog")) return new Response(JSON.stringify(st.cat), { status: 200 });
    const body = JSON.parse(String(init?.body || "{}")); st.bodies.push(body);
    if (st.many) return new Response(JSON.stringify({ total: st.many, offset: 0, limit: 50, capped: false, columns: body.columns, took: 3, rows: Array.from({ length: st.many }, (_, i) => (
      { symbol: "S" + i, name: "Company " + i, sector: null, cap: "Large", band: null, full: true, v: Object.fromEntries(body.columns.map((c: string) => [c, st.flat ? 10 : i + 1])) })) }), { status: 200 });   // ten varied rows: green and red quarters exist
    return new Response(JSON.stringify({ total: 2, offset: 0, limit: 50, capped: false, columns: body.columns, took: 3, funnel: st.funnel, rows: [
      { symbol: "AAA", name: "Alpha", sector: null, cap: "Large", band: null, full: true, v: Object.fromEntries(body.columns.map((c: string) => [c, 12])) },
      { symbol: "BBB", name: "Beta", sector: null, cap: "Mid", band: null, full: true, v: Object.fromEntries(body.columns.map((c: string) => [c, c === "pe" ? null : 8])) }] }), { status: 200 });
  }));
});
afterEach(cleanup);

describe("Stock screener groups", () => {
  it("a fresh visit has every group closed", async () => {
    mount(); await ready();
    for (const t of document.querySelectorAll("button.fgx-hb")) expect(t.getAttribute("aria-expanded")).toBe("false");
  });

  it("a group opens only when the visitor opens it", async () => {
    mount(); await ready();
    fireEvent.click(group(/^Valuation/));
    expect(group(/^Valuation/).getAttribute("aria-expanded")).toBe("true");
    expect(group(/^Profitability/).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(group(/^Valuation/));
    expect(group(/^Valuation/).getAttribute("aria-expanded")).toBe("false");
  });

  it("a group holding an active filter from the address starts open, the others closed", async () => {
    mount("?s=" + encodeState(norm({ ranges: { roe: { min: 15 } } }), "market_cap", "desc")); await ready();
    expect(group(/^Profitability/).getAttribute("aria-expanded")).toBe("true");
    expect(group(/^Valuation/).getAttribute("aria-expanded")).toBe("false");
    expect(heads()).toContain("Return on equity");
  });
});

describe("Stock screener columns", () => {
  it("opens with only the company, market cap and share price (task #41), and the button counts them truthfully", async () => {
    mount(); await ready();
    expect(heads()).toEqual(["Company", "Market cap", "Share price"]);
    expect(colBtn()).toBe("Columns · 2");
    expect(st.bodies[0].columns).toEqual(["market_cap", "price"]);   // asked of the server straight away, no slider needed
  });

  it("the results table has the enlarge arrow, and enlarging opens the same table in a dialog", async () => {
    mount(); await ready();
    const arrow = await screen.findByRole("button", { name: /Enlarge table: Stock screener results/ });
    fireEvent.click(arrow);
    const dlg = await screen.findByRole("dialog", { name: "Stock screener results" });
    expect(within(dlg).getAllByRole("columnheader").length).toBe(3);
    fireEvent.click(within(dlg).getByRole("button", { name: /Close enlarged table/ }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Stock screener results" })).toBeNull());
  });

  it("choosing a chip adds its column at once and unchoosing takes it away", async () => {
    mount(); await ready();
    fireEvent.click(group(/^Valuation/));
    fireEvent.click(screen.getByRole("button", { name: "Dividend Yield" }));
    await waitFor(() => expect(heads()).toContain("Dividend Yield"));
    expect(colBtn()).toBe("Columns · 3");
    expect(st.bodies.at(-1)!.filters).toEqual({});                                          // no range was set
    fireEvent.click(screen.getByRole("button", { name: "Dividend Yield" }));
    await waitFor(() => expect(heads()).not.toContain("Dividend Yield"));
    expect(colBtn()).toBe("Columns · 2");
  });

  it("choosing a chip on the Now / 3Y / 5Y / 7Y card shows the column of the tab it is on, and switching tab switches the column", async () => {
    // P/B and its averages are not in the default set here: drop them with a saved choice so the effect is visible
    localStorage.setItem("finlit.screener.cols", JSON.stringify(["market_cap"]));
    mount(); await ready();
    fireEvent.click(group(/^Valuation/));
    fireEvent.click(screen.getByRole("button", { name: "P/B Ratio" }));
    await waitFor(() => expect(heads()).toEqual(["Company", "Market cap", "P/B Ratio"]));
    fireEvent.click(screen.getByRole("tab", { name: /3Y avg/ }));
    await waitFor(() => expect(heads()).toEqual(["Company", "Market cap", "P/B Ratio, 3Y average"]));
    expect(st.bodies.at(-1)!.columns).toEqual(["market_cap", "pb_avg_3y"]);
    fireEvent.click(screen.getByRole("tab", { name: /7Y avg/ }));
    await waitFor(() => expect(heads()).toEqual(["Company", "Market cap", "P/B Ratio, 7Y average"]));
    fireEvent.click(screen.getByRole("tab", { name: /Now/ }));
    await waitFor(() => expect(heads()).toEqual(["Company", "Market cap", "P/B Ratio"]));
  });

  it("several filters stay chosen at once; a filter is removed only by clicking it again (task #75)", async () => {
    localStorage.setItem("finlit.screener.cols", JSON.stringify(["market_cap"]));
    mount(); await ready();
    fireEvent.click(group(/^Valuation/));
    fireEvent.click(screen.getByRole("button", { name: "P/B Ratio" }));
    fireEvent.change(screen.getByLabelText("P/B Ratio maximum", { exact: true }), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "P/E Ratio" }));            // choosing another filter must not drop the first one
    expect(screen.getByLabelText("P/B Ratio maximum", { exact: true })).toBeTruthy();   // its range box is still there
    expect(screen.getByRole("button", { name: "P/B Ratio" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(heads()).toContain("P/B Ratio"));
    await waitFor(() => expect(st.bodies.at(-1)!.filters).toEqual({ pb: { max: 3 } }));
    fireEvent.click(screen.getByRole("button", { name: "P/B Ratio" }));            // only an explicit click on the chosen filter removes it
    await waitFor(() => expect(st.bodies.at(-1)!.filters).toEqual({}));
  });

  it("a saved column choice wins over the defaults, and Reset brings the defaults back", async () => {
    localStorage.setItem("finlit.screener.cols", JSON.stringify(["market_cap", "roe"]));
    mount(); await ready();
    expect(heads()).toEqual(["Company", "Market cap", "Return on equity"]);
    expect(colBtn()).toBe("Columns · 2");
    fireEvent.click(screen.getByRole("button", { name: /^Columns/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reset columns" }));
    await waitFor(() => expect(heads()).toEqual(["Company", "Market cap", "Share price"]));
    expect(localStorage.getItem("finlit.screener.cols")).toBeNull();
  });

  it("removing a default column from the panel is remembered", async () => {
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: /^Columns/ }));
    fireEvent.click(within(document.querySelector(".pl-colmenu") as HTMLElement).getByRole("checkbox", { name: /^Share price$/ }));
    await waitFor(() => expect(heads()).not.toContain("Share price"));
    expect(JSON.parse(localStorage.getItem("finlit.screener.cols")!)).toEqual(["market_cap"]);
  });

  it("an empty cell is a dash with the reason in its tooltip", async () => {
    localStorage.setItem("finlit.screener.cols", JSON.stringify(["market_cap", "price", "pe"]));
    mount(); await ready();
    const cell = Array.from(document.querySelectorAll(".scr-t tbody tr")[1].querySelectorAll("td"))[3];
    expect(cell.textContent).toBe("–");
    expect(cell.getAttribute("title")).toMatch(/Loss-making/);
  });

  it("on the Basic plan only the columns the plan can see are asked for", async () => {
    st.cat = { ...catalog(true), defaultColumns: ["market_cap", "price", "pe_avg_3y"] }; mount(); await ready();   // a locked default is left out
    expect(st.bodies[0].columns).toEqual(["market_cap", "price"]);
    expect(st.bodies[0].columns).not.toContain("pb");
    expect(st.bodies[0].columns).not.toContain("pe_avg_3y");
  });
});

describe("column helpers", () => {
  const cat = catalog(); const by = new Map(cat.groups.flatMap((g) => g.metrics.map((m) => [m.key, m] as const)));
  it("the table starts with only market cap and share price beside the company name", () => {
    expect(defaultColumns(cat)).toEqual(["market_cap", "price"]);
    expect(defaultColumns(undefined)).toEqual([]);
  });
  it("chip column follows the period and skips locked metrics", () => {
    const pb = by.get("pb")!;
    expect(chipColumn(pb, undefined, by)).toBe("pb");
    expect(chipColumn(pb, "5y", by)).toBe("pb_avg_5y");
    expect(chipColumn(pb, "nope", by)).toBe("pb");
    const locked = new Map(by); locked.set("pb_avg_5y", { ...by.get("pb_avg_5y")!, locked: true });
    expect(chipColumn(pb, "5y", locked)).toBeNull();
  });
  it("table columns: base first, then ranges and chips once each", () => {
    expect(tableColumns(["a", "b"], { c: { min: 1 }, a: { max: 2 } }, ["d", null, "c"], () => true)).toEqual(["a", "b", "c", "d"]);
    expect(tableColumns(["a"], { zz: { min: 1 } }, [], (k) => k !== "zz")).toEqual(["a"]);
  });
  it("empty-cell reasons", () => {
    expect(emptyReason("pe", true)).toMatch(/Loss-making/);
    expect(emptyReason("pe_avg_3y", true)).toMatch(/No 3-year history/);
    expect(emptyReason("pe", false)).toMatch(/No financial report/);
  });
});

describe("The green and red colour note (task 73)", () => {
  const note = () => document.querySelector(".plain");
  const pick = (name: RegExp) => { if (!document.querySelector(".pl-colmenu")) fireEvent.click(screen.getByRole("button", { name: /^Columns/ })); fireEvent.click(within(document.querySelector(".pl-colmenu") as HTMLElement).getByRole("checkbox", { name })); };

  it("is not there on the default columns, even with plenty of rows and a coloured default column", async () => {
    st.many = 10; mount(); await ready();
    expect(heads()).toEqual(["Company", "Market cap", "Share price"]);
    expect(document.querySelector(".scr-t td.tone-good")).toBeTruthy();        // market cap is coloured here (the test catalog says higher is better) but it is a default column
    expect(note()).toBeNull();
  });
  it("appears when a column beyond the defaults is added, names it and what is better, and goes when it is removed", async () => {
    st.many = 10; mount(); await ready();
    pick(/^Return on equity$/);
    await waitFor(() => expect(note()).toBeTruthy());
    const text = note()!.textContent!;
    expect(text).toMatch(/Higher is better for Return on equity/); expect(text).not.toMatch(/Lower is better/); expect(text).not.toMatch(/P\/E/);
    expect(text).toMatch(/best quarter/); expect(text).toMatch(/weakest quarter/);
    pick(/^Return on equity$/);
    await waitFor(() => expect(note()).toBeNull());
    expect(heads()).toEqual(["Company", "Market cap", "Share price"]);
  });
  it("explains both directions when columns of both kinds are on the table, and shrinks as they are removed", async () => {
    st.many = 10; localStorage.setItem("finlit.screener.cols", JSON.stringify(["market_cap", "pe", "roe"]));
    mount(); await ready();
    await waitFor(() => expect(note()).toBeTruthy());
    expect(note()!.textContent).toMatch(/Lower is better for P\/E Ratio; higher is better for Return on equity\./);
    pick(/^P\/E Ratio$/);
    await waitFor(() => expect(note()!.textContent).not.toMatch(/P\/E/));
    expect(note()!.textContent).toMatch(/Higher is better for Return on equity/);
  });
  it("is not drawn when no cell is coloured: few rows, or every value the same", async () => {
    localStorage.setItem("finlit.screener.cols", JSON.stringify(["market_cap", "roe"]));
    mount(); await ready();                                                     // two rows only: no quarters, no colours
    expect(document.querySelector(".scr-t td.tone-good, .scr-t td.tone-bad")).toBeNull(); expect(note()).toBeNull();
    cleanup(); st.many = 10; st.flat = true; mount(); await ready();           // ten rows, all the same value: the quarter lines are equal, so nothing is coloured
    expect(document.querySelector(".scr-t td.tone-good, .scr-t td.tone-bad")).toBeNull(); expect(note()).toBeNull();
  });
});

describe("colour rule helpers", () => {
  const roe = M("roe", "Return on equity", { unit: "%", better: "higher" }), pe = M("pe", "P/E Ratio", { better: "lower" }), price = M("price", "Share price", { unit: "Rs", better: "none" });
  const flag = M("f", "A flag", { unit: "flag", better: "higher" });
  it("a cell is green in the best quarter and red in the weakest, never for a flag, no direction, a gap or equal quarter lines", () => {
    expect(cellTone(roe, [10, 30], 35)).toBe("tone-good"); expect(cellTone(roe, [10, 30], 5)).toBe("tone-bad"); expect(cellTone(roe, [10, 30], 20)).toBe("");
    expect(cellTone(pe, [10, 30], 5)).toBe("tone-good"); expect(cellTone(pe, [10, 30], 40)).toBe("tone-bad");
    expect(cellTone(price, [10, 30], 40)).toBe(""); expect(cellTone(flag, [10, 30], 40)).toBe(""); expect(cellTone(roe, [10, 30], null)).toBe("");
    expect(cellTone(roe, [10, 10], 40)).toBe(""); expect(cellTone(roe, undefined, 40)).toBe(""); expect(cellTone(undefined, [10, 30], 40)).toBe("");
  });
  it("only a non-default column with a coloured cell is explained, each once", () => {
    const by = new Map([roe, pe, price].map((m) => [m.key, m] as const)), heat = { roe: [10, 30], pe: [10, 30], price: [10, 30] } as Record<string, [number, number]>;
    const rows = [{ v: { roe: 40, pe: 20, price: 1 } }, { v: { roe: 5, pe: 20, price: 2 } }];
    expect(colourColumns(["roe", "pe", "price", "roe"], [], by, heat, rows).map((m) => m.key)).toEqual(["roe"]);   // pe has no coloured cell, price has no direction, roe once
    expect(colourColumns(["roe"], ["roe"], by, heat, rows)).toEqual([]);                                            // a default column is never explained
    expect(colourColumns(["roe"], [], by, {}, rows)).toEqual([]);                                                   // no quarters yet
  });
  it("the note names only the columns it explains and says which direction is better for each", () => {
    expect(colourNote([roe])).toBe("Green cells are in the best quarter of the results shown for that column and red cells in the weakest quarter. Higher is better for Return on equity. Hover a column name for what it means.");
    expect(colourNote([pe, roe, M("pb", "P/B Ratio", { better: "lower" })])).toContain("Lower is better for P/E Ratio and P/B Ratio; higher is better for Return on equity.");
  });
});

describe("One Sector filter (task 74)", () => {
  // the former Sector list (broad, 3 here) and the Industry list (finer, 4 here): the unified Sector filter is the second one
  const withSectors = () => { st.cat = { ...catalog(), sectors: [{ name: "Auto Ancillaries", n: 1 }, { name: "Capital Goods", n: 5 }, { name: "Chemicals", n: 7 }],
    industries: [{ name: "Auto Components", sector: "X", n: 3 }, { name: "Chemicals", sector: "Y", n: 2 }, { name: "Software", sector: "Z", n: 9 }, { name: "Cement", sector: "W", n: 4 }] }; };
  const titles = () => Array.from(document.querySelectorAll("button.fgx-hb")).map((b) => (b.textContent || "").replace(/\d+.*$/, "").trim());
  const tool = () => Array.from(document.querySelectorAll(".fgx-tool button")).map((b) => (b.textContent || "").trim());
  const lastCats = () => st.bodies.filter((b) => b.cats).slice(-1)[0]?.cats;
  const sectorHead = () => Array.from(document.querySelectorAll("button.fgx-hb")).find((b) => /^Sector/.test(b.textContent || "")) as HTMLElement;

  it("the panel has one Sector section and no Industry section, listing the former industry options with their counts", async () => {
    withSectors(); mount(); await ready();
    const t = titles();
    expect(t.filter((x) => x === "Sector")).toHaveLength(1); expect(t.some((x) => /industry/i.test(x))).toBe(false);
    fireEvent.click(sectorHead());
    const items = Array.from(document.querySelectorAll(".fgx-list li")).map((li) => (li.textContent || "").trim());
    expect(items).toHaveLength(4); expect(items.join("|")).toMatch(/Auto Components.*3/); expect(items.join("|")).toMatch(/Software.*9/);
    expect(items.join("|")).not.toMatch(/Capital Goods/);                      // the old broad list is gone
  });
  it("ticking a Sector option filters by it, shows a chip, counts on the toolbar Sector button and is in the address", async () => {
    withSectors(); mount(); await ready();
    fireEvent.click(sectorHead());
    fireEvent.click(within(document.querySelector(".fgx-list") as HTMLElement).getByRole("checkbox", { name: /^Software/ }));
    await waitFor(() => expect(lastCats()?.industry).toEqual(["Software"]));
    expect(lastCats()?.sector).toEqual([]);
    expect(tool().some((x) => /^Sector\s*1$/.test(x))).toBe(true);
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toContain("?s="));
    const packed = new URLSearchParams((screen.getByTestId("loc").textContent || "").split("?")[1]).get("s");
    expect(JSON.parse(atob((packed || "").replace(/-/g, "+").replace(/_/g, "/"))).in).toEqual(["Software"]);          // saved as the industries it holds
  });
  it("the stat strip counts the same list the filter offers", async () => {
    withSectors(); mount(); await ready();
    const kpi = Array.from(document.querySelectorAll(".fgx-kpi, [class*=kpi]")).map((e) => e.textContent || "").join(" ");
    expect(kpi).toMatch(/\b4\s*Sectors/); expect(kpi).not.toMatch(/\b3\s*Sectors/);
  });
  it("a sector from an older link stays part of the one filter: listed ticked, counted, and unticking it removes it", async () => {
    withSectors();
    const legacy = encodeState({ ...norm({}), sectors: ["Auto Ancillaries", "Capital Goods"] }, "market_cap", "desc");
    mount("?s=" + legacy); await ready();
    await waitFor(() => expect(lastCats()?.sector).toEqual(["Auto Ancillaries", "Capital Goods"]));    // the filter still applies
    expect(tool().some((x) => /^Sector\s*2$/.test(x))).toBe(true);
    expect(sectorHead().getAttribute("aria-expanded")).toBe("true");                          // opens by itself: something is picked
    const boxes = within(document.querySelector(".fgx-list") as HTMLElement).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.filter((b) => b.checked).map((b) => b.getAttribute("aria-label") || b.closest("label")?.textContent || "").join("|")).toMatch(/Auto Ancillaries.*Capital Goods|Capital Goods.*Auto Ancillaries/);
    fireEvent.click(within(document.querySelector(".fgx-list") as HTMLElement).getByRole("checkbox", { name: /^Auto Ancillaries/ }));
    await waitFor(() => expect(lastCats()?.sector).toEqual(["Capital Goods"]));
    expect(tool().some((x) => /^Sector\s*1$/.test(x))).toBe(true);
  });
  it("the line of what is left after each rule says sector, not industry", async () => {
    withSectors(); st.funnel = [{ key: "industry", before: 5813, after: 9, missing: 0 }];
    localStorage.clear(); mount("?s=" + encodeState({ ...norm({}), industries: ["Software"] }, "market_cap", "desc")); await ready();
    await waitFor(() => expect(document.querySelector(".pl-funnel")).toBeTruthy());
    expect(document.querySelector(".pl-funnel")!.textContent).toMatch(/after sector/); expect(document.querySelector(".pl-funnel")!.textContent).not.toMatch(/industry/i);
  });
  it("typing industry or sector in the filter search finds the Sector section", async () => {
    withSectors(); mount(); await ready();
    const box = screen.getByRole("searchbox", { name: /Search for a filter/i });
    fireEvent.change(box, { target: { value: "industry" } });
    await waitFor(() => expect(titles()).toContain("Sector"));
    fireEvent.change(box, { target: { value: "sector" } });
    await waitFor(() => expect(titles()).toContain("Sector"));
  });
});

describe("the address holds every filter (task 74)", () => {
  it("what is picked in Sector, Index, Market cap and Rating comes back from the address, so a reload or a shared link keeps it", () => {
    const state = { ...norm({ ranges: { roe: { min: 15 } } }), sectors: ["Capital Goods"], industries: ["Software", "Auto Components"], indices: ["NIFTY 50"], caps: ["Large"], bands: ["Strong"] };
    const back = decodeState(encodeState(state, "market_cap", "desc")).state;
    expect(back).toEqual(state);
  });
  it("a link made by an older reader (sn and sx keys) still opens with its picks", () => {
    const raw = btoa(JSON.stringify({ sn: ["Software"], sx: ["NIFTY 50"] })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const st = decodeState(raw).state;
    expect(st.industries).toEqual(["Software"]); expect(st.indices).toEqual(["NIFTY 50"]);
  });
});
