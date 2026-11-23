// @vitest-environment jsdom
// Task #330 (developer file 28, "The companies table"): the filter bar, the applied filters with tick boxes, the verdict chips, the column sets with grouped
// headers, the row's detailed view and the words for a row with no figures.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QParams, QResp, QRow } from "../lib/qresults";

const st = vi.hoisted(() => ({ plan: "silver" as "basic" | "silver", params: [] as unknown[], resp: null as unknown, upgrade: vi.fn() }));
vi.mock("../lib/qresults", async (orig) => ({ ...(await orig<typeof import("../lib/qresults")>()),
  useQuarterResults: (p: unknown) => { st.params.push(p); return { data: st.resp, error: null, isError: false, isLoading: false, isFetching: false }; } }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ plan: st.plan, upgrade: st.upgrade, toast: vi.fn() }) }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../components/ChartHelp", () => ({ ChartHelp: () => null }));
vi.mock("../components/CoLogo", () => ({ CoLogo: () => null }));
import { CompaniesView } from "./QuarterResults";

const summary = { companies: 3, declared: 3, due: 0, awaiting: 0, withNumbers: 2, flagged: 1, medianRevenueYoY: 1, medianProfitYoY: 1, profitUpShare: 50, marginUpShare: 50, nRevenue: 2, nProfit: 2, nMargin: 2 };
const row = (o: Partial<QRow> & Record<string, unknown>): QRow => ({ date: "2026-11-14", symbol: "ASHOKLEY", name: "Ashok Leyland Ltd", sector: "Automobiles", industry: "Agricultural Commercial & Construction Vehicles", marketCap: 96038, cap: "Large", indices: [], confirmed: true, periodEnd: "2026-09-30", loadedPeriodEnd: null,
  status: "declared", awaiting: false, hasNumbers: true, locked: false, revenue: 17030, revenueYoY: 35.4, revenueQoQ: 30.3, operatingProfit: 2776, opYoY: 13.7, opQoQ: 15.2, opYoYWhy: null, opQoQWhy: null, opm: 16.3,
  netProfit: 843, profitYoY: 11.5, profitQoQ: 36.9, npm: 4.9, npmChange: -1.1, eps: 1.44, gap: 24, flagged: true, loss: false, price: 164, high52: 215, below52: 24.1, belowAth: null, verdict: "Strong",
  checks: { rev: "up", profit: "up", margin: "flat" }, ...o } as unknown as QRow);
const rows = [row({}), row({ symbol: "PATANJALI", name: "Patanjali Foods Ltd", cap: "Mid", hasNumbers: false, status: "awaiting", awaiting: true, awaitingWhy: "provider", revenue: null, flagged: false, verdict: null } as Partial<QRow>),
  row({ symbol: "543895", name: "Exhicon Events Media Solutions Ltd", cap: "Micro", flagged: false, verdict: "Weak", date: "2026-11-13" })];
const resp = (over: Partial<QResp> = {}): QResp => ({ plan: "silver", locked: false, today: "2026-11-23", quarter: { key: "2026-09", label: "Jul to Sep 2026", fiscal: "Q2 FY27", periodEnd: "2026-09-30", from: "2026-10-01", to: "2026-12-31" },
  quarters: [], total: 3, offset: 0, limit: 50, summary, totals: summary, rows, days: [{ date: "2026-11-14", n: 2 }, { date: "2026-11-13", n: 1 }], facets: { sectors: [{ name: "Automobiles", n: 2 }], indices: [] },
  verdictCounts: { Strong: 152, Good: 46, "In line": 46, Weak: 39, Poor: 76, Loss: 13 }, distribution: { total: 3, sectors: [], caps: [] }, ...over } as QResp);
const Where = () => { const l = useLocation(); return <output data-testid="loc">{l.pathname + l.search}</output>; };
const open = (qs = "") => render(<MemoryRouter initialEntries={["/results" + qs]}><Routes><Route path="/results" element={<CompaniesView />} /></Routes><Where /></MemoryRouter>);
const last = () => st.params.filter((p) => "offset" in (p as object)).at(-1) as QParams;
const heads = () => [...document.querySelectorAll(".cx-t thead th")].map((t) => t.textContent?.replace(/[↕▲▼]/g, "").trim()).filter(Boolean);
beforeEach(() => { st.plan = "silver"; st.params = []; st.resp = resp(); localStorage.clear(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(cleanup);

describe("the filter bar and the applied filters (tick boxes)", () => {
  it("has every live filter in one bar; no side panel and no 'Hide filters'", () => {
    open();
    const bar = screen.getByRole("search", { name: "Filter the companies" });
    for (const n of ["Find a company or symbol", "Declared", "Companies", "Sector", "Size", "Status", "Sort by"]) expect(within(bar).getByLabelText(n)).toBeTruthy();
    expect([...(within(bar).getByLabelText("Declared") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Any date", "Today", "Yesterday", "This week", "Last 7 days", "This quarter", "Pick a day…", "Pick a range…"]);
    expect([...(within(bar).getByLabelText("Companies") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["All", "My watchlist", "Equity portfolio", "NIFTY 50", "NIFTY 100", "NIFTY 500"]);
    expect(within(bar).getByRole("button", { name: /Growth and price filters/ })).toBeTruthy();
    expect((within(bar).getByRole("button", { name: "Reset filters" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector("aside.qr-side")).toBeNull();
    expect(screen.queryByRole("button", { name: /Hide filters/ })).toBeNull();
  });
  it("an unticked filter keeps its value, leaves the request and is struck through; ticking brings it back; × removes it; Reset removes all", () => {
    open();
    fireEvent.change(screen.getByLabelText("Sector"), { target: { value: "Automobiles" } });
    fireEvent.change(screen.getByLabelText("Size"), { target: { value: "Large" } });
    expect(last()).toMatchObject({ sector: "Automobiles", cap: "Large" });
    const ap = screen.getByRole("group", { name: "Filters applied" });
    expect(ap.querySelector(".cx-ap-k")!.textContent).toBe("Filters applied2 of 2 on");
    fireEvent.click(within(ap).getByLabelText("Switch off: Sector: Automobiles"));
    expect(last().sector).toBeUndefined(); expect(last().cap).toBe("Large");
    expect(screen.getByTestId("loc").textContent).toContain("off=sector");
    expect((screen.getByLabelText("Sector") as HTMLSelectElement).value).toBe("Automobiles");          // the value stays in its control
    expect(within(ap).getByText("Sector: Automobiles").closest(".cx-ap")!.className).toContain("off");
    expect(ap.querySelector(".cx-ap-k")!.textContent).toBe("Filters applied1 of 2 on");
    fireEvent.click(within(ap).getByRole("button", { name: "Tick all" }));
    expect(last()).toMatchObject({ sector: "Automobiles", cap: "Large" });
    fireEvent.click(within(ap).getByRole("button", { name: "Untick all" }));
    expect(last().sector).toBeUndefined(); expect(last().cap).toBeUndefined();
    fireEvent.click(within(ap).getByRole("button", { name: "Remove: Size: Large cap" }));
    expect((screen.getByLabelText("Size") as HTMLSelectElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.queryByRole("group", { name: "Filters applied" })).toBeNull();
    expect(screen.getByTestId("loc").textContent).not.toContain("off=");
  });
  it("a growth threshold set in the panel shows as a chip, and an unticked one does not count in the panel's badge", () => {
    open("?npYoYValue=10");
    expect(screen.getByRole("button", { name: /Growth and price filters/ }).textContent).toContain("1");
    const ap = screen.getByRole("group", { name: "Filters applied" });
    expect(within(ap).getByText("Net profit YoY at least 10%")).toBeTruthy();
    fireEvent.click(within(ap).getByLabelText("Switch off: Net profit YoY at least 10%"));
    expect(screen.getByRole("button", { name: /Growth and price filters/ }).querySelector(".cx-n")).toBeNull();
    expect(last().npYoYValue).toBeUndefined();
  });
});

describe("verdict chips, column sets and the table", () => {
  it("the verdict chips carry counts and ask the server for one verdict", () => {
    open();
    const g = screen.getByRole("group", { name: "Against its industry" });
    expect(within(g).getAllByRole("button").map((b) => b.textContent)).toEqual(["All 372", "Strong · 152", "Good · 46", "In line · 46", "Weak · 39", "Poor · 76", "Loss · 13"]);
    fireEvent.click(within(g).getByRole("button", { name: "Weak · 39" }));
    expect(last().verdict).toBe("Weak");
  });
  it("Key figures is the default; Margins, Price position and All columns switch the columns under band headings, and the choice is remembered", () => {
    open();
    expect(heads()).toEqual(["Company", "Revenue", "Net profit", "Against its industry", "Detailed view", "₹ Cr", "Growth, YoY", "₹ Cr", "Growth, YoY", "Margin"]);
    fireEvent.click(screen.getByRole("button", { name: "Margins" }));
    expect(heads()).toEqual(["Company", "Revenue", "Operating profit", "Net profit", "EPS, ₹", "Against its industry", "Detailed view", "₹ Cr", "₹ Cr", "Growth, YoY", "Margin", "₹ Cr", "Margin"]);
    fireEvent.click(screen.getByRole("button", { name: "Price position" }));
    expect(heads()).toEqual(["Company", "Market value, ₹ Cr", "Revenue growth, YoY", "Profit growth, YoY", "Price position", "Against its industry", "Detailed view", "Price, ₹", "Below 52-week high", "Below all-time high"]);
    expect(localStorage.getItem("finlit-results-cols")).toBe("price");
    fireEvent.click(screen.getByRole("button", { name: "All columns" }));
    expect(document.querySelectorAll(".cx-t tbody tr.cx-r")[0].querySelectorAll("td").length).toBe(17);
  });
  it("rows: symbol and size on line one, name and industry on line two (BSE-only: name first); growth with QoQ; margin with its change; day headings", () => {
    open();
    const r = document.querySelectorAll(".cx-t tbody tr.cx-r");
    expect(r[0].querySelector(".cx-co")!.textContent).toBe("ASHOKLEYLargeAshok Leyland Ltd · Agricultural Commercial & Construction Vehicles");
    expect(r[2].querySelector(".cx-co")!.textContent).toBe("Exhicon Events Media Solutions LtdMicroBSE 543895 · Agricultural Commercial & Construction Vehicles");
    expect(r[0].querySelectorAll("td")[2].textContent).toBe("+35.4%QoQ +30.3%");
    expect(r[0].querySelectorAll("td")[5].textContent).toBe("4.9%▼ 1.1 pts YoY");
    expect([...document.querySelectorAll(".cx-day")].map((d) => d.textContent)).toEqual(["Sat, 14 Nov2 companies", "Fri, 13 Nov1 company"]);
    expect(r[1].textContent).toContain("Figures not published yet");
    expect(r[0].querySelector(".cx-flag")!.getAttribute("title")).toContain("24 points apart");
  });
  it("▾ opens the row's detailed view: the flag's sentence and Set the alert, four groups, Open the report", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Open the detailed view of Ashok Leyland Ltd" }));
    const x = document.querySelector(".cx-xr")!;
    expect(x.textContent).toContain("Revenue +35%, profit +12%: 24 points apart.");
    expect(within(x as HTMLElement).getByRole("link", { name: "Set the alert" })).toBeTruthy();
    expect([...x.querySelectorAll(".qr-group h4")].map((h) => h.textContent)).toEqual(["Revenue", "Operating profit", "Net profit", "Price position"]);
    expect(within(x as HTMLElement).getByRole("link", { name: "Open the report →" }).getAttribute("href")).toBe("/stocks/ASHOKLEY#quarter");
    fireEvent.click(screen.getByRole("button", { name: "Open the detailed view of Patanjali Foods Ltd" }));
    expect(document.querySelectorAll(".cx-xr")[1].textContent).toContain("the data provider has not published the figures yet");
  });
  it("Basic: the verdict chips ask for Silver and nothing is sent", () => {
    st.plan = "basic"; st.resp = resp({ locked: true, verdictCounts: null });
    open();
    fireEvent.click(within(screen.getByRole("group", { name: "Against its industry" })).getByRole("button", { name: "Strong" }));
    expect(st.upgrade).toHaveBeenCalled(); expect(last().verdict).toBeUndefined();
  });
});
