// @vitest-environment jsdom
// Task #132 (the new fund page): the at-a-glance row and the section links, the missing facts in one box, the 10 largest holdings as bars with every holding one
// click away, and the change table opened by four counts.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FundDetail, FundFacts } from "../lib/mf";
import type { Holding, Portfolio } from "../holdings/types";

const score = vi.hoisted(() => ({ data: null as unknown, isLoading: false }));
vi.mock("../lib/mfScore", async (orig) => ({ ...(await orig<typeof import("../lib/mfScore")>()), useFundScore: () => score }));
vi.mock("../components/ChartZoom", () => ({ ChartZoom: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../components/CoLogo", () => ({ CoLogo: () => null }));
import { FundGlance, FundSectionNav, croreOf } from "./FundGlance";
import { FactsCard } from "./Facts";
import { HoldingsSection } from "../holdings/HoldingsSection";

afterEach(cleanup);
const ret = (value: number | null, why: string | null = null) => ({ value, kind: "cagr" as const, from: null, why });
const D = {
  code: 122639, plan: "Direct", option: "Growth",
  returns: { "1m": ret(1), "6m": ret(2), "1y": ret(0.27), "3y": ret(17.9), "5y": ret(11.54) },
  risk: { vol1y: { value: 9.6, why: null }, vol3y: { value: 9.93, why: null }, maxDrawdown: { value: -17.75, why: null, peak: "2021-11-15", trough: "2022-06-17", since: "2021-10-21" } },
} as unknown as FundDetail;
const FACTS: FundFacts = { code: 122639, order: ["aum", "terRegular", "terDirect", "exitLoad", "benchmark", "managers", "riskometer", "launchDate", "minInvestment"], facts: {
  aum: { value: "₹1,47,064 crore", asOf: "2026-09-30", source: "AMFI" }, terRegular: { value: "1.29% a year", asOf: "2026-11-08" }, terDirect: { value: "0.68% a year", asOf: "2026-11-08" },
  exitLoad: { unavailable: "Exit load is stated in each scheme's own documents." }, benchmark: { unavailable: "AMFI publishes the benchmark on a page our server cannot read yet." },
  managers: { unavailable: "Named in each factsheet." }, riskometer: { unavailable: "On AMFI's fund performance page." }, launchDate: { value: "2013-05-13" },
  minInvestment: { unavailable: "AMFI's list is out of date for some schemes." } } };
const SCORE = { locked: false, final: 60.3, label: "Average", status: "RATED", pillars: [], rank: { rank: 14, of: 36, scope: "sub", percentile: 63, categoryLabel: "Flexi Cap", plan: "Direct" }, family: null };

describe("at a glance and the section links", () => {
  it("shows the six cells from what the page already has: score, 5 years, 1 year, expense ratio, fund size, largest fall", () => {
    score.data = SCORE;
    render(<MemoryRouter><FundGlance d={D} facts={FACTS} factsLoading={false} /></MemoryRouter>);
    const cells = [...document.querySelectorAll(".fd-cell")].map((c) => c.textContent);
    expect(cells).toEqual([
      "Health Score60.3Average · 14 of 36 in Flexi Cap (Direct plan)", "5 years a year+11.54%NAV, Direct · Growth", "1 year+0.27%NAV change",
      "Expense ratio0.68%a year, Direct · Regular 1.29%", "Fund size₹1,47,064 CrVery large · 30 Sept 2026", "Largest fall−17.75%Nov 2021 to Jun 2022",
    ]);
  });
  it("a blank cell says why: a locked score, a fact not loaded, a return without history", () => {
    score.data = { locked: true, pillars: [] };
    const d = { ...D, returns: { ...D.returns, "5y": ret(null, "Less than 5 years of NAV history") } } as FundDetail;
    render(<MemoryRouter><FundGlance d={d} facts={undefined} factsLoading /></MemoryRouter>);
    const t = (i: number) => document.querySelectorAll(".fd-cell")[i].textContent;
    expect(t(0)).toBe("Health ScoreLockedPart of a paid plan · See plans");
    expect(t(1)).toBe("5 years a year—Less than 5 years of NAV history");
    expect(t(3)).toBe("Expense ratio—Loading…");
  });
  it("reads AMFI's AUM text", () => { expect(croreOf("₹1,47,064 crore")).toBe(147064); expect(croreOf("n/a")).toBeNull(); });
  it("links every section that is on the page, in the page's order", () => {
    render(<FundSectionNav present={["fd-returns", "fd-score", "fd-chart", "fd-facts", "fd-risk", "fd-holdings", "fd-about"]} />);
    expect(screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Returns", "#fd-returns"], ["Health Score", "#fd-score"], ["NAV chart", "#fd-chart"], ["Fund facts", "#fd-facts"], ["Risk", "#fd-risk"], ["What it invests in", "#fd-holdings"], ["About the data", "#fd-about"],
    ]);
  });
});

describe("fund facts: what we do not have sits in one box", () => {
  it("lists the five missing facts in one line, says where to find them, and keeps each reason one click away", () => {
    render(<FactsCard facts={FACTS} loading={false} failed={false} />);
    expect(screen.queryAllByText("—")).toHaveLength(0);                                       // no rows of dashes
    const box = screen.getByRole("note", { name: "Facts not in our data yet" });
    expect(within(box).getByText(/^Exit load, benchmark index, fund managers, risk-o-meter and minimum investment\. Each is in the scheme's own documents/)).toBeTruthy();
    expect(box.textContent).toContain("Benchmark index: AMFI publishes the benchmark");
    expect(document.querySelectorAll(".mf-factlist > div").length).toBe(4);                   // the facts we have stay as rows
  });
});

describe("what it invests in: bars, the full list, and the four counts", () => {
  const h = (name: string, pct: number, extra: Partial<Holding> = {}): Holding => ({ name, isin: null, sector: "Banks", assetClass: "equity", pct, qty: null, valueLakh: null, stockSymbol: null, prevPct: null, change: null, ...extra });
  const holdings = [...Array.from({ length: 12 }, (_, i) => h(`Big ${i + 1}`, 12 - i * 0.5, i === 0 ? { prevPct: null } : i < 4 ? { prevPct: 1 } : { prevPct: 20 })), ...Array.from({ length: 5 }, (_, i) => h(`Small ${i + 1}`, 0.4, { prevPct: 0.4 }))];
  const P: Portfolio = { asOf: "2026-10-31", previousAsOf: "2026-09-30", source: "PPFAS", sourceUrl: null, holdings, exited: [{ name: "Gone Ltd", pct: null, prevPct: 2 }],
    summary: { count: holdings.length, top10Pct: 90, assetSplit: { equity: 90, debt: 5, cash: 5, other: null }, sectors: [{ sector: "Banks", pct: 100 }] } };
  it("draws the 10 largest as bars, no donut, and opens every holding with one click", () => {
    render(<MemoryRouter><HoldingsSection portfolio={P} layout="bars" fundPage /></MemoryRouter>);
    expect(document.querySelector(".hd-donut")).toBeNull();
    const top = screen.getByRole("list", { name: "The 10 largest holdings" });
    expect(within(top).getAllByRole("listitem").map((li) => li.textContent)).toHaveLength(10);
    expect(within(top).getAllByRole("listitem")[0].textContent).toBe("Big 1Banks12.00%");
    fireEvent.click(screen.getByRole("button", { name: /All 17 holdings, and those below 1%/ }));
    expect(screen.getByRole("region", { name: "All 17 holdings, largest first" }).querySelectorAll("tbody tr")).toHaveLength(17);
  });
  it("opens the change with four counts that filter the table under them", () => {
    render(<MemoryRouter><HoldingsSection portfolio={P} layout="bars" fundPage /></MemoryRouter>);
    const counts = screen.getByRole("group", { name: "Show one kind of change" });
    const label = (b: HTMLElement) => b.textContent;
    expect(within(counts).getAllByRole("button").map(label)).toEqual(["New 1", "Exited 1", "Increased 3", "Decreased 8"]);
    fireEvent.click(within(counts).getByRole("button", { name: "Exited 1" }));
    const kinds = () => [...document.querySelectorAll(".hd-table .hd-chip")].map((c) => c.textContent);
    expect(kinds()).toEqual(["Exited"]);
    fireEvent.click(screen.getByRole("button", { name: "Show every move" }));
    expect(new Set(kinds())).toEqual(new Set(["New", "Exited", "Increased", "Decreased"]));
  });
});
