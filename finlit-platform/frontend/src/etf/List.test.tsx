// @vitest-environment jsdom
// Task #133: the ETF list as the 14 Nov design. Each name once, a short word under every "—", three new columns (expense ratio, price vs NAV,
// traded a day) filled and sortable, filters open with the 12 most used categories, and no price provider named anywhere.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EtfItem, EtfList as ListOut } from "../lib/etf";

vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/Info", () => ({ Info: () => null }));
vi.mock("../components/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
const listed: { data: ListOut | undefined } = { data: undefined };
vi.mock("../lib/etf", async (orig) => ({ ...(await orig<typeof import("../lib/etf")>()), useEtfList: () => ({ data: listed.data, isLoading: false, isError: false, isFetching: false, refetch: () => undefined }) }));
import { EtfListPage } from "./List";

afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* jsdom */ } });

const base = {
  isin: "INF000000000", fundHouse: "Test AMC", category: "nifty50", categoryLabel: "Nifty 50", assetClass: "equity", previousClose: 100, priceDate: "2026-11-13", volume: 1000,
  ret1m: 1, ret6m: 2, ret3y: 3, cagr3y: 1, cagr5y: 2, vol1y: 10, mdd1y: -5, mdd3y: -9, mdd5y: -12, high52: 120, low52: 90, from52: -5, rangeFrom: "2025-11-13", firstDate: "2010-01-01",
  points: 2000, breakDate: null, nav: 100, navDate: "2026-11-13", premiumWide: false, rank: 1, hot: true,
};
const item = (o: Partial<EtfItem>): EtfItem => ({ ...base, symbol: "X", name: "X", price: 100, changePct: 0.5, ret1y: 5, ret5y: 40, avgTurnover: 5e9, premium: 0.1, why: {}, ter: 0.2, terDate: "2026-11-13", ...o } as EtfItem);
const ITEMS = [
  item({ symbol: "LIQUIDBEES", name: "Nippon India ETF Nifty 1D Rate Liquid BeES", ret1y: null, ret5y: null, ter: 0.69, premium: 0,
    why: { ret_1y: "The price barely moves for this ETF: it pays out its earnings instead of growing the price, so a price change of about 0% says nothing about what it earned.", ret_5y: "The price barely moves for this ETF: it pays out its earnings instead of growing the price, so a price change of about 0% says nothing about what it earned." } }),
  item({ symbol: "LIQUIDCASE", name: "Zerodha CASE Nifty 1D Rate Liquid ETF", ret5y: null, why: { ret_5y: "Listed less than 5 years" } }),
  item({ symbol: "GOLDIETF", name: "ICICI Prudential Gold ETF", ret5y: null, why: { ret_5y: "Price history has a break on 18 Dec 2023 (suspected split or bad price), so this is withheld" } }),
  item({ symbol: "NEWETF", name: "New Test ETF", ter: null, terDate: null, premium: null, nav: null, avgTurnover: null, why: { ter: "This ETF is not in AMFI's latest expense ratio (TER) file." } }),
];
const CATS = Array.from({ length: 15 }, (_, n) => ({ key: "c" + n, label: "Cat " + n, group: "equity", count: 30 - n }));
const LIST: ListOut = { items: ITEMS, total: 359, universe: 359, hotCount: 100, offset: 0, limit: 40, excluded: 0, categories: CATS, groups: [{ key: "equity", label: "Equity", count: 261 }, { key: "gold", label: "Gold", count: 26 }],
  asOf: "2026-11-13", updatedAt: "2026-11-13T17:49:00Z", source: "NAV, scheme names and fund houses: AMFI.", disclaimer: "Information only. Not investment advice. Past returns do not guarantee future returns." };

function Where() { const l = useLocation(); return <output data-testid="where">{l.search}</output>; }
const open = () => { listed.data = LIST; return render(<MemoryRouter initialEntries={["/etfs"]}><EtfListPage /><Where /></MemoryRouter>); };
const row = (sym: string) => screen.getByText(sym, { selector: ".etf-sub .mono" }).closest("tr") as HTMLElement;
const visible = (el: HTMLElement) => { const c = el.cloneNode(true) as HTMLElement; c.querySelectorAll(".sr-only").forEach((x) => x.remove()); return c.textContent ?? ""; };

describe("ETF list (task #133)", () => {
  it("shows each ETF name once per row, with its symbol under it and a compare tick box before it", () => {
    open();
    for (const i of ITEMS) {
      const th = within(row(i.symbol)).getByRole("rowheader");
      expect(visible(th).split(i.name).length - 1).toBe(1);
      expect(within(th).getByRole("checkbox", { name: `Compare ${i.name}` })).toBeTruthy();
      expect(within(th).queryByRole("button", { name: /Compare/ })).toBeNull();      // the old "+ Compare" button with the name hidden inside is gone
    }
  });

  it("puts a short reason under every dash and keeps the full reason in the tooltip", () => {
    open();
    const words = (sym: string) => [...row(sym).querySelectorAll(".etf-bwhy")].map((e) => e.textContent);
    expect(words("LIQUIDBEES")).toEqual(["Pays out", "Pays out"]);
    expect(words("LIQUIDCASE")).toEqual(["Under 5 years"]);
    expect(words("GOLDIETF")).toEqual(["Price break, 18 Dec 2023"]);
    expect(words("NEWETF")).toEqual(["Not in AMFI file", "No NAV", "Few trading days"]);
    const dashes = document.querySelectorAll("tbody .etf-blank");
    expect(dashes.length).toBe(7);
    dashes.forEach((d) => { expect(d.querySelector(".etf-bwhy")).toBeTruthy(); expect(d.getAttribute("title")!.length).toBeGreaterThan(10); });
  });

  it("fills the three new columns and sorts by each", () => {
    open();
    const heads = [...document.querySelectorAll("thead th")].map((e) => e.textContent);
    for (const h of ["Expense ratio", "Price vs NAV", "Traded a day"]) expect(heads.some((x) => x?.startsWith(h))).toBe(true);
    const lb = row("LIQUIDBEES");
    expect(lb.querySelector(".etf-c-ter")!.textContent).toBe("0.69%");
    expect(lb.querySelector(".etf-c-premium")!.textContent).toBe("0.00%");
    expect(lb.querySelector(".etf-c-turnover")!.textContent).toBe("₹500 Cr");
    for (const [h, key] of [["Expense ratio", "ter"], ["Price vs NAV", "premium"]] as const) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp("^" + h) }));
      expect(screen.getByTestId("where").textContent).toContain(`sort=${key}`);
    }
    fireEvent.click(screen.getByRole("button", { name: /^Traded a day/ }));         // the default order: most traded first (nothing in the address)
    expect(screen.getByTestId("where").textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /^Traded a day/ }));         // and turned the other way
    expect(screen.getByTestId("where").textContent).toContain("sort=turnover&order=asc");
  });

  it("shows the filters without a click: Type in one row, the 12 most used categories with Show all, and both ranges", () => {
    open();
    const f = document.getElementById("etf-filters")!;
    expect(f).toBeTruthy();
    expect(within(f).getByRole("button", { name: /Equity/ })).toBeTruthy();
    expect(within(f).queryByRole("button", { name: /Cat 12/ })).toBeNull();
    expect(within(f).getByRole("button", { name: /Cat 11/ })).toBeTruthy();
    fireEvent.click(within(f).getByRole("button", { name: "Show all 15" }));
    expect(within(f).getByRole("button", { name: /Cat 14/ })).toBeTruthy();
    expect(f.querySelectorAll("fieldset.etf-range")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));                  // Filters folds them
    expect(document.getElementById("etf-filters")).toBeNull();
    expect(screen.getByText("The 100 most traded open at once; the other 259 take a moment longer.")).toBeTruthy();
  });

  it("names no price provider anywhere, and keeps the disclaimer", () => {
    const { container } = open();
    expect(container.textContent).not.toMatch(/Dhan|Upstox|market-data provider/);
    expect(container.textContent).toContain("Prices are NSE closing prices");
    expect(container.textContent).toContain("Information only. Not investment advice.");
  });

  it("ticking two ETFs shows the compare bar under the table, up to four", () => {
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Compare ICICI Prudential Gold ETF" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Compare New Test ETF" }));
    const bar = screen.getByRole("complementary", { name: "ETFs chosen to compare" });
    expect(bar.textContent).toContain("Compare 2/4");
    expect(within(bar).getByRole("link", { name: /Compare 2 ETFs/ }).getAttribute("href")).toBe("/etfs/compare?symbols=GOLDIETF,NEWETF");
    expect(bar.compareDocumentPosition(document.querySelector(".etf-tw")!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });
});
