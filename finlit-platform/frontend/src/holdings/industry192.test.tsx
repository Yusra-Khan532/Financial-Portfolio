// @vitest-environment jsdom
// Task #192 round 3 (sector pack rules T7, P12, P13): a fund's or ETF's holdings are named by NSE's industry, under the word "Industry", in NSE's
// spelling; a share listed outside India says "Listed abroad"; a line NSE's lists cannot place says "Not classified" and why, on hover.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HoldingsSection } from "./HoldingsSection";
import type { Holding, Portfolio } from "./types";

vi.mock("../components/ChartZoom", () => ({ ChartZoom: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
afterEach(cleanup);

const h = (name: string, pct: number, industry: string | null, extra: Partial<Holding> = {}): Holding =>
  ({ name, isin: null, industry, assetClass: "equity", pct, qty: null, valueLakh: null, stockSymbol: null, prevPct: null, change: null, ...extra });
const holdings = [
  h("Infosys Ltd", 30, "IT - Software", { amfiIndustry: "It - Software" }),
  h("HDFC Bank Ltd", 25, "Banks", { amfiIndustry: "Banks" }),
  h("Broadcom Inc", 20, "Listed abroad", { amfiIndustry: "Semiconductors", industryNote: "Listed outside India: NSE's industry classification covers companies listed in India only." }),
  h("Old Name Ltd", 15, "Not classified", { amfiIndustry: "Industrial Capital Goods", industryNote: "Not classified: the fund house names its industry \"Industrial Capital Goods\", which is not one of NSE's 59 industries." }),
  h("Gilt 2033", 10, null, { assetClass: "debt" }),
];
const P: Portfolio = { asOf: "2026-10-31", previousAsOf: null, source: "Sample", sourceUrl: null, holdings, exited: [],
  summary: { count: 5, top10Pct: 100, assetSplit: { equity: 90, debt: 10, cash: null, other: null },
    industries: [{ industry: "IT - Software", pct: 30 }, { industry: "Banks", pct: 25 }, { industry: "Listed abroad", pct: 20 }, { industry: "Not classified", pct: 15 }] } };

describe("fund page (P13)", () => {
  it("heads the split \"By industry\" and lists NSE's names, never \"sector\"", () => {
    render(<MemoryRouter><HoldingsSection portfolio={P} layout="bars" fundPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "By industry" })).toBeTruthy();
    expect(screen.queryByText(/by sector/i)).toBeNull();
    const bars = screen.getByRole("heading", { name: "By industry" }).nextElementSibling as HTMLElement;
    expect(within(bars).getAllByRole("listitem").map((li) => li.querySelector(".hd-bl")!.textContent)).toEqual(["IT - Software", "Banks", "Listed abroad", "Not classified"]);
    fireEvent.click(screen.getByRole("button", { name: /All 5 holdings/ }));
    const table = screen.getByRole("region", { name: /All 5 holdings/ });
    expect(within(table).getByRole("button", { name: /Industry/ })).toBeTruthy();
    expect(within(table).queryByText(/^Sector$/)).toBeNull();
  });
  it("says why a line is not classified or listed abroad, and keeps the fund house's own name on hover", () => {
    render(<MemoryRouter><HoldingsSection portfolio={P} layout="bars" fundPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /All 5 holdings/ }));
    const table = screen.getByRole("region", { name: /All 5 holdings/ });
    const cell = (name: string) => within(table).getByText(name, { selector: ".hd-why" });
    expect(cell("Not classified").getAttribute("title")).toMatch(/not one of NSE's 59 industries/);
    expect(cell("Listed abroad").getAttribute("title")).toMatch(/Listed outside India.*The fund house calls it "Semiconductors"/);
    for (const same of ["IT - Software", "Banks"])   // the fund house's name differs only in case ("It - Software"): nothing to explain
      expect(within(table).getAllByText(same).every((e) => !e.classList.contains("hd-why"))).toBe(true);
  });
});

describe("ETF page (P12)", () => {
  it("names the column and the split by industry", () => {
    render(<MemoryRouter><HoldingsSection portfolio={P} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "By industry" })).toBeTruthy();
    expect(screen.getByText(/share and industry/)).toBeTruthy();
  });
});
