// @vitest-environment jsdom
// Bulk & Block Deals (/ipo?view=deals): the filters live in the address; the line says what is shown, counting a trade NSE lists in both files once;
// the table and the phone cards; sorting; the empty, "today not yet published" and short-history states; the CSV link carries the filters; /deals
// redirects. The helpers of lib/deals.ts (address <-> filters, request paths, the count line) are tested directly.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Deal, DealList, DealSummary } from "../lib/deals";
import { countLine, csvPath, filtersFromParams, listPath, NO_FILTERS, paramsFromFilters, summaryPath } from "../lib/deals";

const deal = (o: Partial<Deal>): Deal => ({
  id: 1, exchange: "NSE", kind: "block", day: "2026-11-27", symbol: "IGIL", name: "International Gemmological Inst (I) L", client: "BCP ASIA II TOPCO PTE. LTD.",
  clientKey: "BCP ASIA II TOPCO PTE LTD", side: "sell", qty: 21000000, price: 371.25, valueCr: 779.625, remarks: null, alsoBlock: false, alsoBulk: true, source: "nse-archive",
  pctEquity: 5.25, dayClose: 372, closeNow: 400, closeAt: "2026-11-28", sinceDealPct: 7.74, sinceNote: null, ...o,
});
const COV = { first_day: "2026-11-21", last_day: "2026-11-27", exchanges: ["NSE"], byKind: { bulk: ["2026-11-21", "2026-11-27"], block: ["2026-11-27", "2026-11-27"], short: ["2026-11-24", "2026-11-27"] },
  lastUpdated: "2026-11-27T13:00:00Z", historyDone: false, shorterThanPeriod: false } as DealList["coverage"];
const TOT = { deals: 10, trades: 8, alsoListedAsBulk: 2, buyCr: 595.33, sellCr: 874.98, days: 3,
  byKind: { bulk: { trades: 5, buyCr: 94.3, sellCr: 95.36 }, block: { trades: 3, buyCr: 501.19, sellCr: 779.63 }, short: { deals: 3, qty: 375000 } } };
const ROWS = [deal({}), deal({ id: 2, kind: "bulk", symbol: "ACMESOLAR", name: "ACME Solar Holdings Limited", client: "GRAVITON RESEARCH CAPITAL LLP", clientKey: "GRAVITON RESEARCH CAPITAL LLP",
  side: "buy", qty: 3512880, price: 268.43, valueCr: 94.2963, alsoBulk: false, pctEquity: null, closeNow: 270, sinceDealPct: null, sinceNote: "no stored close for the deal day to check for a split or bonus since" }),
  deal({ id: 3, kind: "bulk", symbol: "SMLT", name: "Sarthak Metals Limited", client: "NEO APEX VENTURE PRIVATE LIMITED", clientKey: "NEO APEX VENTURE PVT LTD", side: "buy", qty: 102000,
    price: 112.4, valueCr: 1.1465, alsoBulk: false, alsoBlock: true, sinceDealPct: null, sinceNote: "a split or bonus since the deal: the prices are not in the same terms" })];
let LIST: DealList = { rows: ROWS, total: 3, page: 1, size: 50, pages: 1, totals: TOT, period: { from: "2026-11-21", to: "2026-11-27", days: 7 }, coverage: COV,
  sources: { deals: { name: "NSE", url: "https://www.nseindia.com/report-detail/display-bulk-and-block-deals", what: "" } }, note: "Information only, not investment advice." };
const SUM: DealSummary = { largest: [ROWS[0]], totals: TOT, period: LIST.period, coverage: COV, sources: LIST.sources, note: LIST.note,
  activeShares: [{ symbol: "IGIL", name: "IGI", deals: 3, grossCr: 1280.8, netCr: -278.4 }], activeClients: [{ clientKey: "SBI MUTUAL FUND", client: "SBI MUTUAL FUND", deals: 1, shares: 1, grossCr: 222.75, buyCr: 222.75, sellCr: 0 }] };
const asked: string[] = [];
vi.mock("../lib/deals", async (orig) => ({
  ...(await orig<typeof import("../lib/deals")>()),
  useDealList: (f: import("../lib/deals").DealFilters) => { asked.push(listPath(f)); return { data: LIST, isLoading: false, isError: false }; },
  useDealSummary: () => ({ data: SUM, isLoading: false, isError: false }),
  useClientDeals: () => ({ data: { clientKey: "GRAVITON RESEARCH CAPITAL LLP", client: "GRAVITON RESEARCH CAPITAL LLP", spellings: ["GRAVITON RESEARCH CAPITAL LLP"], rows: [], buyCr: 94.3, sellCr: 94.28,
    bothSides: ["ACMESOLAR"], coverage: COV, note: "", shares: [{ symbol: "ACMESOLAR", name: "ACME", deals: 2, buyCr: 94.3, sellCr: 94.28, netCr: 0.02, bothSides: true, first: "2026-11-27", last: "2026-11-27" }] },
    isLoading: false, isError: false }),
}));
import { DealsRedirect, DealsView } from "./Deals";

afterEach(() => { cleanup(); asked.length = 0; });
function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; }
const page = (url = "/ipo?view=deals") => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[url]}>
  <Routes><Route path="/deals" element={<DealsRedirect />} /><Route path="/ipo" element={<><DealsView /><Where /></>} /></Routes></MemoryRouter></QueryClientProvider>);
const where = () => screen.getByTestId("where").textContent!;

describe("lib/deals: the address and the requests", () => {
  it("defaults are left out of the address; every filter round-trips", () => {
    expect(paramsFromFilters(NO_FILTERS)).toEqual({ view: "deals" });
    const f = { ...NO_FILTERS, side: "sell" as const, kind: "block" as const, period: "custom" as const, from: "2026-11-01", to: "2026-11-27", q: "igil", min: "25", sort: "day" as const, dir: "asc" as const, page: 2, client: "SBI MUTUAL FUND" };
    expect(filtersFromParams(new URLSearchParams(paramsFromFilters(f)))).toEqual(f);
    expect(filtersFromParams(new URLSearchParams("period=custom&sort=bogus&page=-3"))).toEqual(NO_FILTERS);   // nonsense falls back to the defaults
  });
  it("the list, summary and CSV requests carry the filters", () => {
    const f = { ...NO_FILTERS, side: "buy" as const, period: "30d" as const, q: "graviton", min: "10" };
    expect(listPath(f)).toBe("/api/deals?days=30&kind=all&side=buy&q=graviton&min_cr=10&sort=value&dir=desc&page=1");
    expect(summaryPath(f)).toBe("/api/deals/summary?days=30&side=buy&q=graviton");
    expect(csvPath({ ...f, page: 4 })).toBe("/api/deals?days=30&kind=all&side=buy&q=graviton&min_cr=10&sort=value&dir=desc&page=1&format=csv");
    expect(listPath({ ...NO_FILTERS, period: "custom", from: "2026-11-01", to: "2026-11-05" })).toContain("from=2026-11-01&to=2026-11-05");
  });
  it("the count line says how many trades remain once the twins are removed", () => {
    expect(countLine(TOT)).toBe("10 deals (8 trades after removing block deals also listed as bulk)");
    expect(countLine({ ...TOT, deals: 1, trades: 1, alsoListedAsBulk: 0 })).toBe("1 deal");
  });
});

describe("Bulk & Block Deals view", () => {
  it("the header: last updated, exchanges, history from, and the one line of what is shown", () => {
    const { container } = page();
    expect(container.querySelector(".bbd-meta")?.textContent).toMatch(/Last updated 27 Nov 2026.*Exchanges: NSE.*History from 21 Nov 2026/);
    expect(container.querySelector(".bbd-line")?.textContent).toBe("Last 7 days · NSE · 10 deals (8 trades after removing block deals also listed as bulk)");
    expect(screen.getByText("What bulk and block deals are")).toBeTruthy();
  });

  it("the chips change the address", () => {
    page();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Side" })).getByRole("radio", { name: "Sell" }));
    expect(where()).toBe("/ipo?view=deals&side=sell");
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Kind" })).getByRole("radio", { name: "Block" }));
    expect(where()).toBe("/ipo?view=deals&side=sell&kind=block");
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Period" })).getByRole("radio", { name: "90 days" }));
    expect(where()).toBe("/ipo?view=deals&side=sell&kind=block&period=90d");
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Period" })).getByRole("radio", { name: "Custom" }));
    expect(where()).toBe("/ipo?view=deals&side=sell&kind=block&period=custom&from=2026-11-21&to=2026-11-27");
  });

  it("search reaches the address after a pause", () => {
    vi.useFakeTimers();
    try {
      page();
      fireEvent.change(screen.getByRole("searchbox", { name: "Search a stock or a client" }), { target: { value: "graviton" } });
      expect(where()).toBe("/ipo?view=deals");
      act(() => { vi.advanceTimersByTime(350); });
      expect(where()).toBe("/ipo?view=deals&q=graviton");
    } finally { vi.useRealTimers(); }
  });

  it("the table: stock link, client button, action, Indian grouping, value, % of equity, close now; tags and blanks explained", () => {
    const { container } = page();
    const t = container.querySelector(".bbd-t") as HTMLElement;
    expect([...t.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["Stock", "Date", "Client", "Action", "Qty", "Avg price", "Value ₹ Cr ▼", "% of equity", "Close now, since deal"]);
    const first = t.querySelector("tbody tr") as HTMLElement;
    expect(within(first).getByRole("link", { name: "IGIL" }).getAttribute("href")).toBe("/stocks/IGIL");
    expect(first.textContent).toContain("2,10,00,000");
    expect(first.textContent).toContain("779.63");
    expect(first.textContent).toContain("5.25%");
    expect(first.textContent).toContain("₹400.00, +7.7%");
    expect(first.textContent).toContain("also in bulk list");
    const smlt = [...t.querySelectorAll("tbody tr")][2] as HTMLElement;
    expect(smlt.textContent).toContain("also block");
    expect(smlt.textContent).toContain("split or bonus since: not compared");
    expect(container.querySelector(".ia-foot")?.textContent).toContain("a dash means the share count is not held");
    expect(container.querySelector(".ia-foot")?.textContent).toContain("not investment advice");
  });

  it("phone cards hold the same rows", () => {
    const { container } = page();
    const cards = container.querySelectorAll(".bbd-cards > li");
    expect(cards.length).toBe(3);
    expect(cards[0].textContent).toContain("IGIL");
    expect(cards[0].textContent).toContain("₹780 Cr");
  });

  it("sorting: a header press sorts by it and says so; pressing again turns it round", () => {
    const { container } = page();
    fireEvent.click(within(container.querySelector(".bbd-t thead") as HTMLElement).getByRole("button", { name: "Date" }));
    expect(where()).toBe("/ipo?view=deals&sort=day");
    expect(container.querySelector(".dbx-cnt")?.textContent).toContain("sorted by Date, newest first");
    fireEvent.click(within(container.querySelector(".bbd-t thead") as HTMLElement).getByRole("button", { name: /Date/ }));
    expect(where()).toBe("/ipo?view=deals&sort=day&dir=asc");
  });

  it("largest deals and the summary strip; a client opens its own view", () => {
    const { container } = page();
    const lc = container.querySelector(".bbd-lc") as HTMLElement;
    expect(lc.textContent).toContain("₹780 Cr");
    expect(lc.textContent).toContain("Close now ₹400.00, +7.7% since deal");
    expect(container.querySelector(".bbd-strip")?.textContent).toContain("Most active clients");
    fireEvent.click(screen.getByRole("button", { name: "SBI MUTUAL FUND" }));
    expect(where()).toBe("/ipo?view=deals&client=SBI+MUTUAL+FUND");
  });

  it("the client view: net per share and the shares both bought and sold", () => {
    const { container } = page("/ipo?view=deals&client=GRAVITON+RESEARCH+CAPITAL+LLP");
    expect(container.querySelector(".bbd-cp")?.textContent).toContain("Both bought and sold: ACMESOLAR");
    expect(container.querySelector(".bbd-lc")).toBeNull();
    expect(asked[0]).toContain("client=GRAVITON+RESEARCH+CAPITAL+LLP");
  });

  it("the CSV link carries the filters", () => {
    page("/ipo?view=deals&side=buy&period=30d");
    expect(screen.getByRole("link", { name: "Download CSV" }).getAttribute("href")).toContain("/api/deals?days=30&kind=all&side=buy");
    expect(screen.getByRole("link", { name: "Download CSV" }).getAttribute("href")).toContain("format=csv");
  });

  it("empty, today-not-yet-published and short-history states say why", () => {
    const keep = LIST;
    try {
      LIST = { ...keep, rows: [], total: 0, coverage: { ...COV, shorterThanPeriod: true } };
      const a = page("/ipo?view=deals&period=1y&side=sell");
      expect(a.container.querySelector(".bbd-note")?.textContent).toContain("History from 21 Nov 2026");
      expect(a.container.querySelector(".bbd-empty")?.textContent).toContain("No deals match these filters.");
      a.unmount();
      LIST = { ...keep, rows: [], total: 0 };
      const b = page("/ipo?view=deals&period=1d");
      expect(b.container.querySelector(".bbd-note")?.textContent).toContain("none are held for today yet");
      fireEvent.click(screen.getByRole("button", { name: /latest day held/ }));
      expect(where()).toBe("/ipo?view=deals&period=custom&from=2026-11-27&to=2026-11-27");
    } finally { LIST = keep; }
  });

  it("/deals redirects to the deals view with its parameters", () => {
    page("/deals?side=buy");
    expect(where()).toBe("/ipo?view=deals&side=buy");
  });

  it("describes, never advises", () => {
    const { container } = page();
    expect(container.textContent).not.toMatch(/\b(should|recommend|smart money|follow this investor|target price|top pick)\b/i);
  });
});
