// @vitest-environment jsdom
// Task #308 (developer file 18): All IPOs in its compact layout. One toolbar instead of the filter card, the dropdowns counting what each option would
// leave, chips for the filters that are on, a strip of seven figures instead of the long sentence, a count line naming the sort, and the table as part
// of the page (its header row sticking under the top nav) instead of a box with its own scroll bar. The table, the cards and the footnote stay.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IpoHistory, IpoRow } from "../lib/ipoHistory";

const row = (o: Partial<IpoRow>): IpoRow => ({
  id: 1, name: "A Ltd", symbol: "A", nse: "A", bse: null, board: "mainboard", sector: "Chemicals", exchanges: ["BSE", "NSE"], kind: "Book built", status: "listed",
  openDate: "2026-10-27", closeDate: "2026-10-29", listingDate: "2026-11-03", priceLow: 142, priceHigh: 150, issuePrice: 150, lotSize: 100, minAmount: 15000,
  issueSizeCr: 250, freshCr: 250, ofsCr: null, subscription: 20, subQib: 30, subNii: 10, subRetail: 5, gmp: 10, gmpPct: 6, listingPrice: 165, listingPct: 10,
  listingClose: null, listingClosePct: null, lastClose: 180, lastDay: "2026-11-20", sinceIpoPct: 20, adjustedBy: null, companyPage: true, verdict: "beat", ...o,
} as IpoRow);
const DATA: IpoHistory = {
  items: [
    row({}),
    row({ id: 2, name: "B Ltd", symbol: "BSME", board: "sme", listingPct: -10, subscription: 2, issueSizeCr: 50, openDate: "2025-03-01", listingDate: "2025-03-07", sinceIpoPct: null }),
    row({ id: 3, name: "C Ltd", board: "sme", listingPct: 30, subscription: 100, issueSizeCr: 100, openDate: "2025-06-01", listingDate: "2025-06-07", sinceIpoPct: 40 }),
    row({ id: 4, name: "D Ltd", status: "upcoming", listingPct: null, listingPrice: null, subscription: null, issueSizeCr: 600, openDate: "2026-11-25", closeDate: "2026-11-27", listingDate: null, sinceIpoPct: null, lastClose: null }),
  ],
  asOf: "2026-11-22", updatedAt: null, note: "",
  sources: { issue: { name: "FinEdge", url: "https://example.com", what: "" }, nse: { name: "NSE", url: null, what: "" }, prices: { name: "NSE", url: null, what: "" } },
};
vi.mock("../lib/ipoHistory", async (orig) => ({ ...(await orig<typeof import("../lib/ipoHistory")>()), useIpoHistory: () => ({ data: DATA, isLoading: false, isError: false }) }));
vi.mock("../components/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
import { IpoHistoryPage } from "./IpoHistory";

afterEach(cleanup);
const page = (url = "/ipo/all") => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[url]}><IpoHistoryPage /></MemoryRouter></QueryClientProvider>);
const strip = () => [...document.querySelectorAll(".p4-kpis > div")].map((d) => `${d.querySelector("dt")?.textContent} ${d.querySelector("dd")?.textContent}`.replace(/\s+/g, " ").trim());

describe("All IPOs, compact layout (task #308)", () => {
  it("one toolbar: search, Status, Board, Year, At listing, More filters and Download CSV; no filter card of labelled selects", () => {
    const { container } = page();
    const bar = container.querySelector(".p4-tools") as HTMLElement;
    expect(within(bar).getByRole("searchbox", { name: "Search IPOs" })).toBeTruthy();
    expect([...bar.querySelectorAll(".dbx-ddl")].map((e) => e.textContent)).toEqual(["Status", "Board", "Year", "At listing", "More filters"]);
    expect(within(bar).getByRole("button", { name: "Download CSV" })).toBeTruthy();
    expect(container.querySelector(".ia-bar, .ia-f, .ia-sum")).toBeNull();
    expect(container.querySelectorAll("select").length).toBe(0);       // the four extra filters sit inside More filters
  });

  it("the summary is a strip of seven figures, worked out from the rows shown", () => {
    page();
    expect(strip()).toEqual(["Issues 4", "Raised ₹1,000 Cr", "Listed above issue price 2 of 3 · 67%", "Listed below 1", "Median at listing +10.0%",
      "Median since IPO (2) +30.0%", "Median subscription 20.00x"]);
  });

  it("the count line names the sort, and says what a row does", () => {
    page();
    expect(document.querySelector(".dbx-cnt")?.textContent).toBe("4 issues · sorted by Listed, newest first");
    expect(screen.getByText("Select a company for its full report")).toBeTruthy();
    fireEvent.click(document.querySelector("thead") ? within(document.querySelector("thead") as HTMLElement).getByRole("button", { name: "At listing" }) : document.body);
    expect(document.querySelector(".dbx-cnt")?.textContent).toBe("4 issues · sorted by At listing, highest first");
  });

  it("each option shows how many issues it would leave with the other filters applied; picking one adds a chip with ×, and Clear all removes every filter", () => {
    page("/ipo/all?board=sme");
    fireEvent.click(screen.getByRole("button", { name: /^Year/ }));
    const opts = screen.getAllByRole("option").map((o) => o.textContent);
    expect(opts).toEqual(["All years2", "20260", "20252"]);       // with Board = SME: 2 SME issues in all, none in 2026, both in 2025
    fireEvent.click(screen.getByRole("option", { name: /^2025/ }));
    expect(screen.getAllByRole("button", { name: /^Remove filter/ }).map((b) => b.textContent)).toEqual(["Board: SME", "Year: 2025"]);
    expect(strip()[0]).toBe("Issues 2");
    fireEvent.click(screen.getByRole("button", { name: "Remove filter Board: SME" }));
    expect(screen.getAllByRole("button", { name: /^Remove filter/ }).map((b) => b.textContent)).toEqual(["Year: 2025"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.queryAllByRole("button", { name: /^Remove filter/ })).toEqual([]);
    expect(strip()[0]).toBe("Issues 4");
  });

  it("More filters holds Subscription, Issue size, Exchange and Sector, with counts, a badge for the ones on, and Escape closes it", () => {
    page();
    const more = screen.getByRole("button", { name: /More filters/ });
    fireEvent.click(more);
    const dlg = screen.getByRole("dialog", { name: "More filters" });
    expect([...dlg.querySelectorAll(".dbx-f > span")].map((e) => e.textContent)).toEqual(["Subscription", "Issue size", "Exchange", "Sector"]);
    const sub = dlg.querySelector("select") as HTMLSelectElement;
    expect([...sub.options].map((o) => o.textContent)).toContain("Above 50x (1)");
    fireEvent.change(sub, { target: { value: "gt10" } });
    expect(screen.getByRole("button", { name: /More filters/ }).querySelector(".dbx-badge")?.textContent).toBe("1");
    expect(within(screen.getByRole("dialog", { name: "More filters" })).getByRole("button", { name: "Show 2 issues" })).toBeTruthy();
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(screen.queryByRole("dialog", { name: "More filters" })).toBeNull();
  });

  it("the table, its columns, the cards, Show more and the footnote stay", () => {
    const { container } = page();
    expect([...container.querySelectorAll(".ia-t thead th")].map((t) => t.textContent?.replace(/[▲▼ ]+$/, ""))).toEqual(["Company", "Listed", "Issue price", "Issue size", "Subscribed", "GMP said", "At listing", "Day-1 close", "Since IPO"]);
    expect(container.querySelectorAll(".ia-t tbody tr").length).toBe(4);
    expect(container.querySelectorAll(".ia-cards li").length).toBe(4);
    expect(container.querySelector(".ia-foot")?.textContent).toMatch(/Describes the past; not a forecast or advice\./);
  });

  it("the table is part of the page: no box of its own, the header row sticks under the top nav, the first column is not pinned or shaded, the grid never pushes the page sideways", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/ipo-all-compact.css"), "utf8");
    expect(css).toMatch(/\.p4 \.p4-iatw\{max-height:none;overflow:visible;padding:0\}/);
    expect(css).toMatch(/\.p4-iat thead th\{top:var\(--p4-top\)\}/);
    expect(css).toMatch(/\.p4-iat th:first-child,\.p4-iat td:first-child\{position:static;background:none;border-radius:0\}/);
    expect(css).toMatch(/\.p4\.ia\{grid-template-columns:minmax\(0,1fr\)\}/);
    expect(css).toMatch(/@media \(max-width:1240px\)\{\s*\.p4-kpis\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}\s*\.p4 \.p4-iatw\{overflow-x:auto\}\s*\.p4-iat thead th\{top:0\}/);
    expect(css).toMatch(/\.p4-kpis\{display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  });
});
