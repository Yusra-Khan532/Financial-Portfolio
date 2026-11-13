// @vitest-environment jsdom
// The Stock screener (task #64, file 04, with tasks #73, #74 and #75): the short head and ready-made screens, Your rules (rule cards, the picker, quick
// ranges, the funnel, Type rules, the one Sector filter), the nine standard columns with a "Your rules" band, the colour note, the side panel's figures,
// and the address that holds the whole screen.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cellTone, chipColumn, colourColumns, colourNote, decodeState, defaultColumns, emptyReason, encodeState, norm, standardColumns, tableColumns, toBody, type Catalog, type MetricInfo } from "../lib/proscreen";
import { quickRanges, scaleOf, startRange } from "../components/screener/RuleCard";

const ui = vi.hoisted(() => ({ upgrade: vi.fn(), toast: vi.fn() }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ upgrade: ui.upgrade, toast: ui.toast, plan: "silver" }), TIER: { gold: { n: "Gold" }, silver: { n: "Silver" }, basic: { n: "Basic" } } }));
const admin = vi.hoisted(() => ({ on: true, user: null as null | { id: string } }));
vi.mock("../lib/auth", () => ({ limitsFor: () => ({ screens: 5 }), useAuth: () => ({ isAdmin: admin.on, user: admin.user }) }));
vi.mock("../three/support", () => ({ supports3d: () => false, whenIdle: () => () => {} }));
// the chart itself is tested on its own (ChartPanel.test.tsx): here only what the page hands it
vi.mock("../components/screener/ChartPanel", () => ({ ChartPanel: ({ row, extra, onClose, onStep }: { row: { symbol: string }; extra?: React.ReactNode; onClose: () => void; onStep?: (d: 1 | -1) => void }) => (
  <aside aria-label="Chart panel"><h2>{row.symbol}</h2><button onClick={onClose}>Close panel</button><button onClick={() => onStep?.(1)}>Next company</button>{extra}</aside>) }));
import { ScreenerPro } from "./ScreenerPro";

const STATS = { min: 0, p10: 5, p25: 10, p50: 20, p75: 40, p90: 60, max: 100, n: 4000, hist: [1, 2, 3, 2, 1], p5: 2, p95: 80, scale: "linear" as const, hist30: Array.from({ length: 30 }, (_, i) => 30 - i) };
const M = (key: string, label: string, o: Partial<MetricInfo> = {}): MetricInfo => ({ key, label, unit: "x", better: "lower", tier: "basic", say: `${label} explained`, digits: 1, locked: false, hidden: false, variants: null, stats: STATS, ...o });
const VAR = (b: string) => ({ now: b, "3y": `${b}_avg_3y`, "5y": `${b}_avg_5y`, "7y": `${b}_avg_7y` });
const STD = ["price", "market_cap", "pe", "roe", "roce", "sales_cagr_3y", "debt_to_equity", "ret_1y"];
const catalog = (lockSilver = false, plan: "basic" | "silver" | "gold" = lockSilver ? "basic" : "silver"): Catalog => ({
  plan, total: 5813, withReport: 5000, updatedAt: "2026-10-30T00:00:00Z", sectors: [], industries: [], indices: [], caps: [{ name: "Large", n: 204 }, { name: "Mid", n: 386 }, { name: "Small", n: 5244 }],
  bands: ["strong", "healthy", "mixed", "watch"].map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), locked: plan !== "gold", n: 10 })), limits: { rows: null, export: true },
  defaultColumns: ["market_cap", "price"], standardColumns: lockSilver ? STD.filter((k) => k !== "sales_cagr_3y") : STD,
  groups: [
    { id: "valuation", label: "Valuation", tier: "basic", metrics: [
      M("pe", "P/E", { variants: VAR("pe") }), M("pb", "P/B", { tier: "silver", locked: lockSilver, variants: VAR("pb") }), M("dividend_yield", "Dividend yield", { unit: "%", better: "higher" }),
      ...["pe", "pb"].flatMap((b) => ["3y", "5y", "7y"].map((p) => M(`${b}_avg_${p}`, `${b === "pe" ? "P/E" : "P/B"}, ${p.toUpperCase()} average`, { hidden: true, tier: "silver", locked: lockSilver })))] },
    { id: "profitability", label: "Profitability", tier: "basic", metrics: [M("roe", "Return on equity", { unit: "%", better: "higher" }), M("roce", "Return on capital employed", { unit: "%", better: "higher" })] },
    { id: "growth", label: "Growth", tier: "basic", metrics: [M("sales_cagr_3y", "Sales growth, 3 years a year", { unit: "%", better: "higher", tier: "silver", locked: lockSilver })] },
    { id: "health", label: "Financial health", tier: "basic", metrics: [M("debt_to_equity", "Debt to equity", { better: "lower" })] },
    { id: "returns", label: "Returns", tier: "basic", metrics: [M("ret_1d", "1-day change", { unit: "%", better: "higher" }), M("ret_1y", "1-year return", { unit: "%", better: "higher" })] },
    { id: "size", label: "Size & price", tier: "basic", metrics: [M("market_cap", "Market cap", { unit: "Cr", better: "none" }), M("price", "Share price", { unit: "Rs", better: "none" })] },
    { id: "model", label: "FinLit model", tier: "gold", metrics: [M("overall", "FinLit IQ", { unit: "pts", better: "higher", tier: "gold", locked: plan !== "gold" })] },
  ],
});
const READY = { asOf: "2026-11-12T00:00:00Z", total: 5813, screens: [
  { id: "large", label: "Large, established companies", says: "Market cap above ₹1,00,000 Cr", tier: "basic", group: "everyday", count: 123, state: { ranges: { market_cap: { min: 100000 } } } },
  { id: "lowdebt", label: "Low debt", says: "Debt to equity below 0.5×", tier: "basic", group: "everyday", count: 3552, state: { ranges: { debt_to_equity: { max: 0.5 } } } },
  { id: "value", label: "Value picks", says: "P/E under 15× and P/B under 2×", tier: "silver", group: "silver", count: 1265, state: { ranges: { pe: { min: 0.1, max: 15 }, pb: { min: 0.1, max: 2 } } } },
  { id: "strong", label: "FinLit Strong", says: "Companies the FinLit model rates Strong", tier: "gold", group: "model", count: 211, state: { ranges: {}, bands: ["strong"] } },
  { id: "modelcompound", label: "Quality compounders (model)", says: "Companies the FinLit model rates high on both quality and growth", tier: "gold", group: "model", count: 300 },
] };
type Body = { columns: string[]; filters: Record<string, unknown>; sort: { key: string; dir: string }; cats?: Record<string, string[]>; model_screen?: string; q?: string; offset?: number };
const st = vi.hoisted(() => ({ funnel: undefined as unknown, many: 0, total: 0, cat: null as unknown, bodies: [] as Body[] }));

const Where = () => { const l = useLocation(); return <output data-testid="loc">{l.pathname + l.search}</output>; };
const mount = (qs = "") => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={["/screener" + qs]}><Routes><Route path="/screener" element={<><ScreenerPro /><Where /></>} /><Route path="/login" element={<Where />} /></Routes></MemoryRouter></QueryClientProvider>);
};
const table = () => document.querySelector(".ssw-t") as HTMLElement;
const heads = () => Array.from(table().querySelectorAll("thead tr.ssw-hd th button")).map((b) => (b.getAttribute("aria-label") || b.textContent || "").replace(/^Sort by /, "").replace(/\s*[▲▼▾]$/, "").trim());
const ruleHeads = () => Array.from(table().querySelectorAll("thead tr.ssw-hd th.rb button")).map((b) => (b.getAttribute("aria-label") || "").replace(/^Sort by /, ""));
const colBtn = () => screen.getByRole("button", { name: /^Columns/ }).textContent;
const ready = () => waitFor(() => expect(table()).toBeTruthy());
const last = () => st.bodies.filter((b) => !b.q || b.q === "").at(-1)!;
const rulesPanel = () => screen.getByRole("complementary", { name: "Your rules" });
const addRule = async (label: string) => {
  fireEvent.click(screen.getByRole("button", { name: "+ Add a rule" }));
  const dlg = await screen.findByRole("dialog", { name: "Add a rule" });
  fireEvent.change(within(dlg).getByRole("searchbox", { name: "Find a filter" }), { target: { value: label } });
  fireEvent.click(within(dlg).getByRole("button", { name: `Add ${label}` }));
};

beforeEach(() => {
  admin.user = null;
  st.cat = catalog(); st.bodies = []; st.many = 0; st.total = 0; st.funnel = undefined; localStorage.clear(); ui.upgrade.mockClear(); ui.toast.mockClear();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/api/screener/catalog")) return new Response(JSON.stringify(st.cat), { status: 200 });
    if (String(url).includes("/api/screener/ready")) return new Response(JSON.stringify(READY), { status: 200 });
    if (!String(url).includes("/api/screener/query")) return new Response("{}", { status: 404 });
    const body = JSON.parse(String(init?.body || "{}")) as Body; st.bodies.push(body);
    if (st.many) return new Response(JSON.stringify({ total: st.total || st.many, offset: body.offset ?? 0, limit: 25, capped: false, columns: body.columns, took: 3, funnel: st.funnel, rows: Array.from({ length: st.many }, (_, i) => (
      { symbol: "S" + ((body.offset ?? 0) + i), name: "Company " + i, sector: null, cap: "Large", band: null, full: true, v: Object.fromEntries(body.columns.map((c: string) => [c, i + 1])) })) }), { status: 200 });
    const total = st.funnel && (st.funnel as { after: number }[]).some((s) => s.after === 0) ? 0 : 2;
    return new Response(JSON.stringify({ total, offset: 0, limit: 25, capped: false, columns: body.columns, took: 3, funnel: st.funnel, rows: total === 0 ? [] : [
      { symbol: "AAA", name: "Alpha", sector: null, cap: "Large", band: "strong", full: true, v: Object.fromEntries(body.columns.map((c: string) => [c, c === "ret_1d" ? 1.5 : 12])) },
      { symbol: "BBB", name: "Beta", sector: null, cap: "Mid", band: "watch", full: true, v: Object.fromEntries(body.columns.map((c: string) => [c, c === "pe" ? null : c === "ret_1d" ? -0.4 : 8])) }] }), { status: 200 });
  }));
});
afterEach(cleanup);

describe("the head and the ready-made screens (file 04 §2, §8)", () => {
  it("opens with a short head, the four Find stocks tabs and today's ready-made screens", async () => {
    mount(); await ready();
    expect(screen.getByRole("heading", { level: 1, name: "Stock screener" })).toBeTruthy();
    const tabs = screen.getByRole("navigation", { name: "Find stocks" });
    expect(within(tabs).getAllByRole("link").map((a) => a.textContent)).toEqual(["Stock screener", "Basic stock screenerSILVER", "Advanced stock screenerGOLD", "Query builderFREE"]);
    const card = await screen.findByRole("button", { name: /^Large, established companies: Market cap above ₹1,00,000 Cr, 123 companies today/ });
    expect(card.textContent).toMatch(/123 companies/);
    expect(document.querySelector(".fgx-kpi, .kpi")).toBeNull();                 // the stat tiles and the tall hero are gone
  });

  it("the way into the Custom Ratio Screener is a real button (task #97), and pressing it opens the panel", async () => {
    mount(); await ready();
    const b = screen.getByRole("button", { name: "Open the Custom Ratio Screener" });
    expect(b.tagName).toBe("BUTTON");
    expect(b.className).toMatch(/btn primary/);
    expect(document.getElementById("scr-ratio")).toBeNull();
    fireEvent.click(b);
    expect(document.getElementById("scr-ratio")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Go to the Custom Ratio Screener" })).toBeTruthy();
  });
  it("a metric screen loads its rules into Your rules as editable cards, and the card folds to one line", async () => {
    mount(); await ready();
    fireEvent.click(screen.getByRole("tab", { name: /Silver screens/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Value picks:/ }));
    await waitFor(() => expect(last().filters).toEqual({ pe: { min: 0.1, max: 15 }, pb: { min: 0.1, max: 2 } }));
    const panel = rulesPanel();
    expect(within(panel).getByRole("group", { name: "P/E" })).toBeTruthy();
    expect((within(panel).getByLabelText("P/E to") as HTMLInputElement).value).toBe("15");
    expect(screen.getByText(/Started from/).textContent).toMatch(/Started from Value picks/);
    expect(screen.getByText(/match all 2 rules · of 5,813 listed · started from Value picks/)).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("P/E to"), { target: { value: "12" } });     // the visitor can change it
    await waitFor(() => expect(last().filters).toEqual({ pe: { min: 0.1, max: 12 }, pb: { min: 0.1, max: 2 } }));
  });

  it("a screen on the FinLit model sends only its id: no cut-off is on the page or in the request", async () => {
    st.cat = catalog(false, "gold"); mount(); await ready();
    fireEvent.click(screen.getByRole("tab", { name: /On the FinLit model/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Quality compounders \(model\):/ }));
    await waitFor(() => expect(last().model_screen).toBe("modelcompound"));
    expect(last().filters).toEqual({});
    expect(within(rulesPanel()).getByRole("group", { name: "Screen on the FinLit model" }).textContent).toMatch(/cut-offs stay on the server/);
    expect(document.body.textContent).not.toMatch(/70\+|Quality 70|78 or more/);
    await waitFor(() => expect(new URLSearchParams((screen.getByTestId("loc").textContent || "").split("?")[1]).get("s")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Remove the FinLit model screen" }));
    await waitFor(() => expect(within(rulesPanel()).queryByRole("group", { name: "Screen on the FinLit model" })).toBeNull());
    await waitFor(() => expect(new URLSearchParams((screen.getByTestId("loc").textContent || "").split("?")[1]).get("s")).toBeNull());   // nothing of it is left in the address
  });

  it("FinLit Strong is the rating word, and a screen above the plan asks for the upgrade instead of running", async () => {
    mount(); await ready();
    fireEvent.click(screen.getByRole("tab", { name: /On the FinLit model/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^FinLit Strong:.*part of Gold/ }));
    expect(ui.upgrade).toHaveBeenCalledWith("gold", expect.stringMatching(/FinLit Strong/));
    expect(st.bodies.some((b) => b.cats?.band?.length)).toBe(false);
  });

  it("My screens: Save screen lists it, Open brings back the same rules, Delete removes it", async () => {
    mount(); await ready();
    await addRule("Return on equity");
    fireEvent.click(screen.getByRole("button", { name: /Save screen/ }));
    fireEvent.change(screen.getByLabelText("Screen name"), { target: { value: "My ROE" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Show ready-made screens" }));
    fireEvent.click(screen.getByRole("tab", { name: /My screens/ }));
    expect(screen.getByText("My ROE")).toBeTruthy();
    fireEvent.click(within(rulesPanel()).getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(within(rulesPanel()).queryByRole("group", { name: "Return on equity" })).toBeNull());
    fireEvent.click(within(screen.getByText("My ROE").closest("li") as HTMLElement).getByRole("button", { name: "Open" }));   // the card is open again: no rules are left
    await waitFor(() => expect((within(rulesPanel()).getByLabelText("Return on equity from") as HTMLInputElement).value).toBe("40"));
    expect(screen.getByText(/started from My ROE/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete My ROE" }));                // still open: the visitor opened the card themselves
    expect(screen.queryByText("My ROE")).toBeNull();
  });
});

describe("Tell me when a company joins (file 04 §9)", () => {
  it("a visitor is asked to sign in first and comes back to the same screen", async () => {
    mount("?s=" + encodeState(norm({ ranges: { roe: { min: 40 } } }), "market_cap", "desc")); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Tell me when a company joins" }));
    expect(ui.toast).toHaveBeenCalledWith(expect.stringMatching(/Sign in/));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toMatch(/^\/login\?next=%2Fscreener%3Fs%3D/));
  });
  it("a member saves the screen with messages on; My screens shows it and turns them off; Save screen alone stays quiet", async () => {
    admin.user = { id: "u1" };
    mount(); await ready();
    await addRule("Return on equity");
    fireEvent.click(screen.getByRole("button", { name: "Tell me when a company joins" }));
    expect(screen.getByRole("group", { name: "Tell me when a company joins" }).textContent).toMatch(/joined or left/);
    fireEvent.change(screen.getByLabelText("Screen name"), { target: { value: "Told" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and tell me" }));
    fireEvent.click(screen.getByRole("button", { name: /Save screen/ }));
    fireEvent.change(screen.getByLabelText("Screen name"), { target: { value: "Quiet" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const kept = JSON.parse(localStorage.getItem("finlit-saved-screens") || "[]") as { name: string; notify?: boolean }[];
    expect(kept.find((x) => x.name === "Told")!.notify).toBe(true); expect(kept.find((x) => x.name === "Quiet")!.notify).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Show ready-made screens" }));
    fireEvent.click(screen.getByRole("tab", { name: /My screens/ }));
    const on = screen.getByRole("button", { name: "Messages for Told: on" });
    fireEvent.click(on);
    expect(screen.getByRole("button", { name: "Messages for Told: off" }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("the table (file 04 §5)", () => {
  it("opens with the nine standard columns the plan shows; LTP carries the day's change; IQ is Gold", async () => {
    mount(); await ready();
    expect(heads()).toEqual(["Company", "Share price", "Market cap", "P/E", "Return on equity", "Return on capital employed", "Sales growth, 3 years a year", "Debt to equity", "1-year return"]);
    expect(Array.from(table().querySelectorAll("thead tr.ssw-hd th button")).map((b) => b.childNodes[0].textContent?.trim())).toContain("LTP");
    expect(st.bodies[0].columns).toEqual([...STD, "ret_1d"]);                       // the day's change comes with the price, without a column of its own
    expect(colBtn()).toBe("Columns · 8 ▾");
    expect(table().querySelector("tbody tr td:nth-child(2)")!.textContent).toMatch(/\+1\.5%/);
  });

  it("Gold sees a Prism column, never the FinLit IQ, and is pointed to the Advanced screener for the rating filter (task #100)", async () => {
    st.cat = { ...catalog(false, "gold"), standardColumns: [...STD, "overall"] }; mount(); await ready();
    await waitFor(() => expect(table().querySelector("thead tr.ssw-hd th.ssw-iq")?.textContent).toMatch(/^Prism/));
    expect(heads()).not.toContain("FinLit IQ");
    expect(st.bodies[st.bodies.length - 1].columns).not.toContain("overall");
    expect(screen.getByRole("link", { name: "Advanced stock screener" })).toBeTruthy();
  });

  it("on the Basic plan only the columns the plan can see are asked for", async () => {
    st.cat = catalog(true); mount(); await ready();
    expect(st.bodies[0].columns).not.toContain("sales_cagr_3y"); expect(st.bodies[0].columns).not.toContain("overall");
  });

  it("the results table has the enlarge arrow, and enlarging opens the same table in a dialog", async () => {
    mount(); await ready();
    fireEvent.click(await screen.findByRole("button", { name: /Enlarge table: Stock screener results/ }));
    const dlg = await screen.findByRole("dialog", { name: "Stock screener results" });
    expect(within(dlg).getAllByRole("columnheader").length).toBeGreaterThan(9);
    fireEvent.click(within(dlg).getByRole("button", { name: /Close enlarged table/ }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Stock screener results" })).toBeNull());
  });

  it("a saved column choice wins over the standard set, and Back to the standard set brings it back", async () => {
    localStorage.setItem("finlit.screener.cols", JSON.stringify(["market_cap", "roe"]));
    mount(); await ready();
    expect(heads()).toEqual(["Company", "Market cap", "Return on equity"]);
    fireEvent.click(screen.getByRole("button", { name: /^Columns/ }));
    fireEvent.click(screen.getByRole("button", { name: "Back to the standard set" }));
    await waitFor(() => expect(heads()).toHaveLength(9));
    expect(localStorage.getItem("finlit.screener.cols")).toBeNull();
  });

  it("removing a standard column is remembered", async () => {
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: /^Columns/ }));
    fireEvent.click(within(document.querySelector(".pl-colmenu") as HTMLElement).getByRole("checkbox", { name: /^Share price$/ }));
    await waitFor(() => expect(heads()).not.toContain("Share price"));
    expect(JSON.parse(localStorage.getItem("finlit.screener.cols")!)).not.toContain("price");
  });

  it("an empty cell is a dash with the reason in its tooltip", async () => {
    mount(); await ready();
    const cell = Array.from(table().querySelectorAll("tbody tr")[1].querySelectorAll("td"))[3];
    expect(cell.textContent).toBe("–"); expect(cell.getAttribute("title")).toMatch(/Loss-making/);
  });

  it("25 rows a page, and the pager moves through them", async () => {
    st.many = 25; st.total = 60; mount(); await ready();
    expect(table().querySelectorAll("tbody tr")).toHaveLength(25);
    expect(screen.getByText("1–25 of 60")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Next 25/ }));
    await waitFor(() => expect(last().offset).toBe(25));
  });

  it("each row links to its report", async () => {
    mount(); await ready();
    expect(screen.getByRole("link", { name: "Open the report of Alpha" }).getAttribute("href")).toBe("/stocks/AAA");
  });
});

describe("Your rules (file 04 §3, §4; task #75)", () => {
  it("+ Add a rule: the picker opens with its search focused, adds the rule on its better quarter, and its column joins the Your rules band", async () => {
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "+ Add a rule" }));
    const dlg = await screen.findByRole("dialog", { name: "Add a rule" });
    expect(document.activeElement).toBe(within(dlg).getByRole("searchbox", { name: "Find a filter" }));
    expect(within(dlg).getAllByText(/Most companies: 5\.0% to 60\.0%/).length).toBeGreaterThan(0);
    fireEvent.click(within(dlg).getByRole("button", { name: "Add Dividend yield" }));
    await waitFor(() => expect(last().filters).toEqual({ dividend_yield: { min: 40 } }));   // higher is better: the top quarter
    expect(screen.queryByRole("dialog", { name: "Add a rule" })).toBeNull();
    await waitFor(() => expect(ruleHeads()).toEqual(["Dividend yield"]));
    expect(table().querySelector("thead tr.ssw-band th.rb")!.textContent).toBe("Your rules");
  });

  it("the picker: names first then meanings, Added for a rule already there, the plan line for a locked one, Esc closes and gives focus back", async () => {
    st.cat = catalog(true); mount(); await ready();
    const open = screen.getByRole("button", { name: "+ Add a rule" }); open.focus(); fireEvent.click(open);
    const dlg = await screen.findByRole("dialog", { name: "Add a rule" });
    fireEvent.change(within(dlg).getByRole("searchbox", { name: "Find a filter" }), { target: { value: "P/B" } });
    expect(within(dlg).getAllByRole("button", { name: "Part of Silver" }).length).toBeGreaterThan(0);
    fireEvent.change(within(dlg).getByRole("searchbox", { name: "Find a filter" }), { target: { value: "sector" } });
    expect(within(dlg).getByRole("note").textContent).toMatch(/Sector, index and company size/);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(open);
  });

  it("quick ranges: the better side first, a click sets the range, and the pressed one shows", async () => {
    mount("?s=" + encodeState(norm({ ranges: { roe: { min: 40 } } }), "market_cap", "desc")); await ready();
    const g = within(rulesPanel()).getByRole("group", { name: "Quick ranges for Return on equity" });
    expect(within(g).getAllByRole("button").map((b) => b.textContent)).toEqual(["Top 25%", "Above middle", "Below middle", "Lowest 25%"]);
    expect(within(g).getByRole("button", { name: "Top 25%" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(g).getByRole("button", { name: "Below middle" }));
    await waitFor(() => expect(last().filters).toEqual({ roe: { max: 20 } }));
  });

  it("each card says what it keeps, how many have no figure, and the middle of all companies; the funnel lists what is left after each rule", async () => {
    st.funnel = [{ key: "roe", before: 5813, after: 1612, missing: 1448 }];
    mount("?s=" + encodeState(norm({ ranges: { roe: { min: 40 } } }), "market_cap", "desc")); await ready();
    await waitFor(() => expect(within(rulesPanel()).getByText(/Keeps/).textContent).toMatch(/Keeps 1,612 of 5,813 · 1,448 have no figure · middle of all companies 20\.0%/));
    expect(within(rulesPanel()).getByRole("list", { name: "What is left after each rule" }).textContent).toMatch(/5,813.*1,612/);
  });

  it("several rules at once: adding one never drops another; × removes only its own (task #75)", async () => {
    localStorage.setItem("finlit.screener.cols", JSON.stringify(["market_cap"]));
    mount(); await ready();
    await addRule("P/B");
    await addRule("Return on equity");
    await waitFor(() => expect(last().filters).toEqual({ pb: { max: 10 }, roe: { min: 40 } }));
    fireEvent.click(screen.getByRole("button", { name: "Remove the rule on P/B" }));
    await waitFor(() => expect(last().filters).toEqual({ roe: { min: 40 } }));
    expect(within(rulesPanel()).getByRole("group", { name: "Return on equity" })).toBeTruthy();
  });

  it("three rules at once, each with its own boxes; changing one never touches another's range (task #75)", async () => {
    mount(); await ready();
    await addRule("P/B"); await addRule("Return on equity"); await addRule("Dividend yield");
    const panel = rulesPanel();
    fireEvent.change(within(panel).getByLabelText("P/B to"), { target: { value: "3" } });
    fireEvent.change(within(panel).getByLabelText("Return on equity from"), { target: { value: "20" } });
    expect((within(panel).getByLabelText("P/B to") as HTMLInputElement).value).toBe("3");
    await waitFor(() => expect(last().filters).toEqual({ pb: { max: 3 }, roe: { min: 20 }, dividend_yield: { min: 40 } }));
  });

  it("a rule with no range yet is counted, stays, and Clear all resets it (task #75)", async () => {
    const c = catalog(); c.groups[0].metrics[2] = { ...c.groups[0].metrics[2], better: "none" }; st.cat = c;      // a figure with no better side starts open
    mount(); await ready();
    await addRule("Dividend yield");
    expect(within(rulesPanel()).getByRole("status").textContent).toMatch(/1 rule has no range yet/);
    expect(screen.getByRole("button", { name: /^Your rules \(1\)/ })).toBeTruthy();
    expect(within(rulesPanel()).getByRole("group", { name: "Dividend yield" })).toBeTruthy();
    await waitFor(() => expect(heads()).toContain("Dividend yield"));                                    // its column is there already
    fireEvent.click(within(rulesPanel()).getByRole("button", { name: "Clear all" }));
    expect(within(rulesPanel()).queryByRole("group", { name: "Dividend yield" })).toBeNull();
    expect(within(rulesPanel()).queryByRole("status")).toBeNull();
  });

  it("Now / 3Y / 5Y / 7Y on a rule card switches the column and the rule to that figure", async () => {
    localStorage.setItem("finlit.screener.cols", JSON.stringify(["market_cap"]));
    mount(); await ready();
    await addRule("P/B");
    await waitFor(() => expect(heads()).toEqual(["Company", "Market cap", "P/B"]));
    fireEvent.click(within(rulesPanel()).getByRole("button", { name: "3Y avg" }));
    await waitFor(() => expect(heads()).toEqual(["Company", "Market cap", "P/B", "P/B, 3Y average"]));
    fireEvent.click(screen.getByRole("button", { name: "Remove the rule on P/B" }));
    await waitFor(() => expect(heads()).toEqual(["Company", "Market cap"]));
  });

  it("a chip above the table removes its rule; Clear all clears everything", async () => {
    mount("?s=" + encodeState({ ...norm({ ranges: { roe: { min: 40 }, pe: { max: 15 } } }), caps: ["Large"] }, "market_cap", "desc")); await ready();
    fireEvent.click(screen.getByRole("button", { name: /^Remove ROE above 40\.0%/ }));
    await waitFor(() => expect(last().filters).toEqual({ pe: { max: 15 } }));
    fireEvent.click(within(rulesPanel()).getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(last().filters).toEqual({})); expect(last().cats!.cap).toEqual([]);
  });

  it("when nothing passes, the page names the tightest rule and removes it on click", async () => {
    st.funnel = [{ key: "pe", before: 5813, after: 3000, missing: 0 }, { key: "roe", before: 3000, after: 0, missing: 0 }];
    mount("?s=" + encodeState(norm({ ranges: { pe: { max: 15 }, roe: { min: 90 } } }), "market_cap", "desc")); await ready();
    const box = (await screen.findByText(/is the tightest/)).closest(".ssw-zero") as HTMLElement;
    expect(box.textContent).toMatch(/Return on equity is the tightest/);
    st.funnel = undefined;
    fireEvent.click(within(box).getByRole("button", { name: "Remove Return on equity" }));
    await waitFor(() => expect(last().filters).toEqual({ pe: { max: 15 } }));
  });

  it("Type rules adds cards, and a line it cannot read gets a plain message", async () => {
    mount(); await ready();
    fireEvent.change(screen.getByLabelText("Type rules"), { target: { value: "pe < 20 and roe > 15" } });
    fireEvent.submit(screen.getByLabelText("Type rules").closest("form")!);
    await waitFor(() => expect(last().filters).toEqual({ pe: { max: 20 }, roe: { min: 15 } }));
    expect(within(rulesPanel()).getByRole("group", { name: "P/E" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Type rules"), { target: { value: "banana > 3" } });
    fireEvent.submit(screen.getByLabelText("Type rules").closest("form")!);
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
  });

  it("the size chips filter on the ₹ scale and say it", async () => {
    mount(); await ready();
    fireEvent.click(within(rulesPanel()).getByRole("button", { name: /^Large 204/ }));
    await waitFor(() => expect(last().cats!.cap).toEqual(["Large"]));
    expect(within(rulesPanel()).getByText(/Large above ₹50,000 Cr · Mid ₹10,000–50,000 Cr · Small below ₹10,000 Cr/)).toBeTruthy();
  });
});

describe("the side panel (file 04 §6)", () => {
  it("a row opens the panel with your rules first, ✓ or ✗ against each; Esc-style close gives focus back to the row", async () => {
    mount("?s=" + encodeState(norm({ ranges: { roe: { min: 10 } } }), "market_cap", "desc")); await ready();
    fireEvent.click(table().querySelector("tbody tr td.stick")!);
    const panel = await screen.findByRole("complementary", { name: "Chart panel" });
    await waitFor(() => expect(within(panel).getByRole("table").textContent).toMatch(/Your rules first/));
    const roeRow = within(panel).getByRole("rowheader", { name: /Return on equity/ });
    await waitFor(() => expect(roeRow.textContent).toMatch(/✓/));
    fireEvent.click(within(panel).getByRole("button", { name: "Close panel" }));
    await waitFor(() => expect(document.activeElement?.getAttribute("data-sym")).toBe("AAA"));
  });
});

describe("The green and red colour note (task 73)", () => {
  const note = () => document.querySelector(".plain");
  const pick = (name: RegExp) => { if (!document.querySelector(".pl-colmenu")) fireEvent.click(screen.getByRole("button", { name: /^Columns/ })); fireEvent.click(within(document.querySelector(".pl-colmenu") as HTMLElement).getByRole("checkbox", { name })); };

  it("is not there on the standard columns, though their cells are coloured", async () => {
    st.many = 10; mount(); await ready();
    expect(table().querySelector("td.tone-good, td.tone-bad")).toBeTruthy();
    expect(note()).toBeNull();
  });
  it("appears when a column beyond the standard set is added, names it and what is better, and goes when it is removed", async () => {
    st.many = 10; mount(); await ready();
    pick(/^Dividend yield$/);
    await waitFor(() => expect(note()).toBeTruthy());
    expect(note()!.textContent).toMatch(/best quarter of all listed companies on that column/); expect(note()!.textContent).toMatch(/Higher is better for Dividend yield/);
    pick(/^Dividend yield$/);
    await waitFor(() => expect(note()).toBeNull());
  });
  it("is not drawn for a column without quartiles", async () => {
    st.many = 10; const c = catalog(); c.groups[0].metrics[2] = { ...c.groups[0].metrics[2], stats: { ...STATS, p25: undefined, p75: undefined } }; st.cat = c;
    mount(); await ready(); pick(/^Dividend yield$/);
    await waitFor(() => expect(heads()).toContain("Dividend yield"));
    expect(note()).toBeNull();
  });
});

describe("One Sector filter (task 74)", () => {
  const withSectors = () => { st.cat = { ...catalog(), sectors: [{ name: "Auto Ancillaries", n: 1 }, { name: "Capital Goods", n: 5 }, { name: "Chemicals", n: 7 }],
    industries: [{ name: "Auto Components", sector: "X", n: 3 }, { name: "Chemicals", sector: "Y", n: 2 }, { name: "Software", sector: "Z", n: 9 }, { name: "Cement", sector: "W", n: 4 }] }; };
  const lastCats = () => st.bodies.filter((b) => b.cats).slice(-1)[0]?.cats;
  const sectorBtn = () => within(rulesPanel()).getByRole("button", { name: /^Sector: / });

  it("there is one Sector filter and no Industry one, listing the industry options with their counts", async () => {
    withSectors(); mount(); await ready();
    expect(within(rulesPanel()).queryByText(/^Industry/)).toBeNull();
    fireEvent.click(sectorBtn());
    const items = Array.from(rulesPanel().querySelectorAll(".fgx-list li")).map((li) => (li.textContent || "").trim());
    expect(items).toHaveLength(4); expect(items.join("|")).toMatch(/Software.*9/); expect(items.join("|")).not.toMatch(/Capital Goods/);
  });
  it("ticking an option filters by it, shows a chip, counts on its button and is in the address", async () => {
    withSectors(); mount(); await ready();
    fireEvent.click(sectorBtn());
    fireEvent.click(within(rulesPanel().querySelector(".fgx-list") as HTMLElement).getByRole("checkbox", { name: /^Software/ }));
    await waitFor(() => expect(lastCats()?.industry).toEqual(["Software"]));
    expect(sectorBtn().textContent).toMatch(/1 picked/);
    expect(screen.getByRole("button", { name: "Remove Software" })).toBeTruthy();
    await waitFor(() => expect(JSON.parse(atob((new URLSearchParams((screen.getByTestId("loc").textContent || "").split("?")[1]).get("s") || "").replace(/-/g, "+").replace(/_/g, "/"))).in).toEqual(["Software"]));
  });
  it("a sector from an older link stays part of the one filter: open, ticked, counted, and unticking removes it", async () => {
    withSectors(); mount("?s=" + encodeState({ ...norm({}), sectors: ["Auto Ancillaries", "Capital Goods"] }, "market_cap", "desc")); await ready();
    await waitFor(() => expect(lastCats()?.sector).toEqual(["Auto Ancillaries", "Capital Goods"]));
    expect(sectorBtn().getAttribute("aria-expanded")).toBe("true"); expect(sectorBtn().textContent).toMatch(/2 picked/);
    fireEvent.click(within(rulesPanel().querySelector(".fgx-list") as HTMLElement).getByRole("checkbox", { name: /^Auto Ancillaries/ }));
    await waitFor(() => expect(lastCats()?.sector).toEqual(["Capital Goods"]));
  });
  it("the funnel says sector, not industry", async () => {
    withSectors(); st.funnel = [{ key: "industry", before: 5813, after: 9, missing: 0 }];
    mount("?s=" + encodeState({ ...norm({}), industries: ["Software"] }, "market_cap", "desc")); await ready();
    const f = await within(rulesPanel()).findByRole("list", { name: "What is left after each rule" });
    expect(f.textContent).toMatch(/after Sector/); expect(f.textContent).not.toMatch(/industry/i);
  });
});

describe("helpers", () => {
  const cat = catalog(); const by = new Map(cat.groups.flatMap((g) => g.metrics.map((m) => [m.key, m] as const)));
  it("standard columns: the nine the plan shows, else the older default set", () => {
    expect(standardColumns(cat)).toEqual(STD); expect(standardColumns({ ...cat, standardColumns: undefined })).toEqual(defaultColumns(cat));
    expect(standardColumns(catalog(true))).not.toContain("sales_cagr_3y"); expect(standardColumns(undefined)).toEqual([]);
  });
  it("chip column follows the period and skips locked metrics", () => {
    const pb = by.get("pb")!;
    expect(chipColumn(pb, undefined, by)).toBe("pb"); expect(chipColumn(pb, "5y", by)).toBe("pb_avg_5y"); expect(chipColumn(pb, "nope", by)).toBe("pb");
    const locked = new Map(by); locked.set("pb_avg_5y", { ...by.get("pb_avg_5y")!, locked: true });
    expect(chipColumn(pb, "5y", locked)).toBeNull();
  });
  it("table columns: base first, then ranges and chips once each", () => {
    expect(tableColumns(["a", "b"], { c: { min: 1 }, a: { max: 2 } }, ["d", null, "c"], () => true)).toEqual(["a", "b", "c", "d"]);
    expect(tableColumns(["a"], { zz: { min: 1 } }, [], (k) => k !== "zz")).toEqual(["a"]);
  });
  it("empty-cell reasons", () => {
    expect(emptyReason("pe", true)).toMatch(/Loss-making/); expect(emptyReason("pe_avg_3y", true)).toMatch(/No 3-year history/); expect(emptyReason("pe", false)).toMatch(/No financial report/);
  });
  it("a new rule starts on its better quarter; a figure with no better side or a yes/no starts open", () => {
    expect(startRange(by.get("roe")!)).toEqual({ min: 40 }); expect(startRange(by.get("pe")!)).toEqual({ max: 10 });
    expect(startRange(by.get("price")!)).toEqual({}); expect(startRange(M("f", "Flag", { unit: "flag", better: "higher" }))).toEqual({});
  });
  it("quick ranges keep the plain order where no side is better", () => {
    expect(quickRanges(by.get("pe")!).map((q) => q.label)).toEqual(["Lowest 25%", "Below middle", "Above middle", "Top 25%"]);
    expect(quickRanges(by.get("price")!).map((q) => q.label)).toEqual(["Lowest 25%", "Below middle", "Above middle", "Top 25%"]);
    expect(quickRanges(M("x", "X", { stats: { ...STATS, p25: undefined } }))).toEqual([]);
  });
  it("a log scale puts the slider stops on the log of the figure", () => {
    const s = scaleOf({ ...STATS, p5: 10, p95: 100000, scale: "log" });
    expect(s.log).toBe(true); expect(Math.round(s.at(150))).toBe(1000); expect(s.toPos(1000)).toBe(150);
    expect(scaleOf({ ...STATS, scale: "linear" }).log).toBe(false);
  });
});

describe("colour rule helpers", () => {
  const roe = M("roe", "Return on equity", { unit: "%", better: "higher" }), pe = M("pe", "P/E", { better: "lower" }), price = M("price", "Share price", { unit: "Rs", better: "none" });
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
    expect(colourColumns(["roe", "pe", "price", "roe"], [], by, heat, rows).map((m) => m.key)).toEqual(["roe"]);
    expect(colourColumns(["roe"], ["roe"], by, heat, rows)).toEqual([]); expect(colourColumns(["roe"], [], by, {}, rows)).toEqual([]);
  });
  it("the note names only the columns it explains, says which direction is better, and which companies the quarters come from", () => {
    expect(colourNote([roe])).toBe("Green cells are in the best quarter of the results shown for that column and red cells in the weakest quarter. Higher is better for Return on equity. Hover a column name for what it means.");
    expect(colourNote([roe], "all")).toMatch(/^Green cells are in the best quarter of all listed companies on that column/);
    expect(colourNote([pe, roe, M("pb", "P/B", { better: "lower" })])).toContain("Lower is better for P/E and P/B; higher is better for Return on equity.");
  });
});

describe("the address holds the whole screen", () => {
  it("Sector, Index, size, rating, rules and a model screen come back from the address", () => {
    const state = { ...norm({ ranges: { roe: { min: 15 } } }), sectors: ["Capital Goods"], industries: ["Software", "Auto Components"], indices: ["NIFTY 50"], caps: ["Large"], bands: ["Strong"], model: "safe" };
    expect(decodeState(encodeState(state, "market_cap", "desc")).state).toEqual(state);
    expect(toBody(state, { key: "market_cap", dir: "desc" }, [], "", 0, 25).model_screen).toBe("safe");
    expect("model_screen" in toBody(norm({}), { key: "market_cap", dir: "desc" }, [], "", 0, 25)).toBe(false);
  });
  it("a link made by an older reader (sn and sx keys) still opens with its picks; a bad model id is dropped", () => {
    const raw = btoa(JSON.stringify({ sn: ["Software"], sx: ["NIFTY 50"], m: "<script>" })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const s = decodeState(raw).state;
    expect(s.industries).toEqual(["Software"]); expect(s.indices).toEqual(["NIFTY 50"]); expect(s.model).toBeUndefined();
  });
});
