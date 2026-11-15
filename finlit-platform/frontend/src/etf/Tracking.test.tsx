// @vitest-environment jsdom
// Task #134 (the team's 14 Nov ETF page): the 10 largest holdings as bars with no donut, the six biggest changes first, and "How closely it follows
// the index" with its dates, every ETF and fund on the same index and a reason for every blank. Mutual fund pages keep the donut.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HoldingsSection } from "../holdings";
import type { Portfolio, Holding } from "../holdings/types";
import { Glance, SectionLinks, TrackingSection } from "./Tracking";
import type { EtfDetail, EtfTracking } from "../lib/etf";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
afterEach(cleanup);
const H = (i: number, pct: number, prev: number | null): Holding => ({ name: `Company ${i}`, isin: `INE${i}`, sector: i % 2 ? "Banks" : "IT", assetClass: "Equity", pct, qty: 1000 * i, valueLakh: 10 * i, stockSymbol: null, prevPct: prev, change: prev == null ? null : +(pct - prev).toFixed(2) });
const holdings = Array.from({ length: 14 }, (_, i) => H(i + 1, +(12 - i * 0.8).toFixed(2), +(12 - i * 0.8 - (i % 3 === 0 ? 0.6 : i % 3 === 1 ? -0.2 : 0)).toFixed(2)));
const P: Portfolio = { asOf: "2026-10-31", previousAsOf: "2026-09-30", source: "Sample Mutual Fund, monthly portfolio", sourceUrl: null, holdings, exited: [],
  summary: { count: 14, top10Pct: 90, assetSplit: { equity: 99.9, debt: 0, cash: 0.1, other: 0 }, sectors: [{ sector: "Banks", pct: 50 }, { sector: "IT", pct: 50 }] } };
const view = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>);

describe("What it invests in, ETF page (task #134 C-4, C-5)", () => {
  it("shows the 10 largest holdings as bars, no donut, and the full list behind one button", () => {
    view(<HoldingsSection portfolio={P} unit="ETF" layout="bars" firstChanges={6} />);
    expect(document.querySelector(".hd-donut, svg[aria-label*='Share of each major holding']")).toBeNull();
    const bars = screen.getByRole("list", { name: "The 10 largest holdings" });
    expect(within(bars).getAllByRole("listitem")).toHaveLength(10);
    expect(within(bars).getAllByRole("listitem")[0].textContent).toContain("Company 1");     // largest first
    fireEvent.click(screen.getByRole("button", { name: "All 14 holdings, with quantity and value →" }));
    expect(screen.getByRole("region", { name: "All 14 holdings" })).toBeTruthy();
  });
  it("opens the change table on the six biggest moves, biggest first; the rest behind 'All N changes'", () => {
    view(<HoldingsSection portfolio={P} unit="ETF" layout="bars" firstChanges={6} />);
    const table = () => screen.getByRole("region", { name: "Change in holdings since the previous month" });
    const rows = () => within(table()).getAllByRole("row").slice(1);
    expect(rows()).toHaveLength(6);
    const sizes = rows().map((r) => Math.abs(parseFloat((r.lastElementChild!.textContent || "0").replace("−", "-"))));
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    const moved = holdings.filter((h) => h.change !== 0).length;
    fireEvent.click(screen.getByRole("button", { name: `All ${moved} changes` }));
    expect(rows()).toHaveLength(moved);
  });
  it("leaves mutual fund pages as they were: the donut, every moved holding", () => {
    view(<HoldingsSection portfolio={P} />);
    expect(document.querySelector(".hd-donut")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "The 10 largest holdings" })).toBeNull();
    expect(screen.queryByRole("button", { name: /changes$/ })).toBeNull();
  });
});

const D = { symbol: "NIFTYBEES", name: "Nippon India ETF Nifty 50 BeES", avgTurnover: 2.74e9, nav: { value: 286.98, date: "2026-11-13", premium: -0.12, premiumWhy: null, source: "AMFI" },
  headline: [{ key: "1d", label: "1 day", value: -0.55, annualised: null, why: null, basis: "", from: null, to: null }, { key: "1y", label: "1 year", value: -1.97, annualised: null, why: null, basis: "", from: null, to: null },
    { key: "5y", label: "5 years", value: 46.65, annualised: 7.95, why: null, basis: "", from: null, to: null }] } as unknown as EtfDetail;
const T: EtfTracking = { symbol: "NIFTYBEES", disclaimer: "Information only.", index: { key: "nifty50", label: "Nifty 50", code: "NIF50" }, terPct: 0.04, ter: { value: "0.04%", source: "AMFI, TER of mutual fund schemes" },
  tracking: { difference: { value: -0.06, etfReturn: -1.97, indexReturn: -1.91 }, error: { value: 0.03, days: 248 }, from: "2025-11-13", to: "2026-11-13", basis: "NSE closing price", index: "price index: dividends are not included, so they sit in the difference" },
  counts: { etfs: 2, funds: 1 }, source: "Expense ratios: AMFI's TER file.",
  peers: [{ kind: "etf", id: "NIFTYBEES", name: "Nippon India ETF Nifty 50 BeES", house: "Nippon", self: true, ter: { value: "0.04%" }, terPct: 0.04, traded: 2.74e9, tradedWhy: null, premium: -0.12, premiumWhy: null },
    { kind: "etf", id: "SETFNIF50", name: "SBI Nifty 50 ETF", house: "SBI", self: false, ter: { value: null, why: "Not published in the sources loaded for this scheme." }, terPct: null, traded: 3.8e8, tradedWhy: null, premium: 0.03, premiumWhy: null },
    { kind: "fund", id: "120716", name: "UTI Nifty 50 Index Fund - Direct", house: "UTI", self: false, ter: { value: "0.18%" }, terPct: 0.18, traded: null, tradedWhy: "An index fund is not traded on the exchange.", premium: null, premiumWhy: "An index fund is bought at its NAV: no price against NAV." }] };

describe("How closely it follows the index (task #134 C-1 to C-3)", () => {
  it("shows the tracking difference and error with their dates, and every ETF and fund on the index, this ETF first and marked", () => {
    view(<TrackingSection d={D} t={T} loading={false} />);
    expect(screen.getByRole("heading", { name: /How closely it follows the Nifty 50/ })).toBeTruthy();
    expect(screen.getByText("−0.06 pp")).toBeTruthy(); expect(screen.getByText("0.03%")).toBeTruthy();
    expect(document.body.textContent).toContain("13 Nov 2025 to 13 Nov 2026");
    expect(document.body.textContent).toContain("reads higher than one worked out from the NAV");          // measured on closing prices: said plainly
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.querySelector("th")!.textContent)).toEqual([expect.stringContaining("this ETF"), expect.stringContaining("SBI Nifty 50 ETF"), expect.stringContaining("Direct plan, index fund")]);
    expect(rows[0].getAttribute("aria-current")).toBe("true");
    expect(rows[1].innerHTML).toContain("Not published in the sources loaded for this scheme.");          // a blank says why
    expect(rows[2].innerHTML).toContain("not traded on the exchange");
    expect(screen.getByRole("link", { name: "Compare all 3 Nifty 50 ETFs and index funds →" }).getAttribute("href")).toBe("/etfs/compare-index-funds?index=nifty50&etf=NIFTYBEES");
  });
  it("says why when the index cannot be told, and leaves its link out", () => {
    view(<><SectionLinks hasTracking={false} /><TrackingSection d={D} t={{ symbol: "X", index: null, why: "The index this ETF follows could not be told.", disclaimer: "" }} loading={false} /></>);
    expect(screen.getByText("The index this ETF follows could not be told.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "How closely it tracks" })).toBeNull();
  });
  it("the At a glance row has the six cells, from the API", () => {
    view(<Glance d={D} t={T} />);
    const cells = screen.getAllByRole("listitem").map((c) => c.textContent);
    expect(cells.map((c) => c!.match(/^[A-Za-z0-9 ]+?(?=[^A-Za-z0-9 ]|Nifty|0|−|\+|₹|$)/)?.[0]).length).toBe(6);
    expect(cells[0]).toContain("Nifty 50"); expect(cells[1]).toContain("0.04%"); expect(cells[2]).toContain("−0.12%"); expect(cells[2]).toContain("below NAV");
    expect(cells[4]).toContain("−1.97%"); expect(cells[5]).toContain("+46.65%".replace("+", "")); expect(cells[5]).toContain("7.95%");
  });
});
