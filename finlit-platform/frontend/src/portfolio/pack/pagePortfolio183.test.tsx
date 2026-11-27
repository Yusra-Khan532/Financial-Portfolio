// @vitest-environment jsdom
// Task #183 W6 (Equity portfolio, pack 01-equity-portfolio, C42–C49): the trend matrix with its axes and "+N more ▾", Business and price as rows with the
// Prism 65 / 50 rule and the count in between, Against their peers with 3 per column and "Show all N ▾", Group leaders as its own section, and the lock cards.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-query")>()), useQueries: ({ queries }: { queries: unknown[] }) => queries.map(() => ({ data: undefined, isLoading: true })) }));
import { GoldLock, LeadersSection, More, PeersSection, TrendSection } from "./EquityPack";
import { trendCards, type Share } from "../../lib/equityPack";
import type { TrendRead } from "../../lib/mfPortfolio";

afterEach(cleanup);
const cell = (name: string, symbols: string[], share = 0.1) => ({ name, n: symbols.length, share, symbols });
const t: TrendRead = {
  n: 39, rated: 35, coverage: 0.9, breadth: { up: 0.5, down: 0.3 }, direction: { improving: 0.2, weakening: 0.46, steady: 0.34 }, average: { stLabel: "Sideways", ltLabel: "Uptrend" },
  words: { longTerm: "Split", shortAgainstLong: "Fading", businessAndPrice: "Partly out of step" }, between: 18,
  grid: { "1,1": cell("Rising", ["SKYGOLD", "WHEELS", "MEDANTA", "RPEL", "BALUFORGE", "PERSISTENT", "APOLLO", "LUMAXTECH", "ICICIBANK"], 0.26), "1,0": cell("Rising but resting", ["AVALON"]), "1,-1": cell("Rising but dipping", []),
    "0,1": cell("Flat, turning up", []), "0,0": cell("Flat", ["SKIPPER"]), "0,-1": cell("Flat, turning down", ["NETWEB"]), "-1,1": cell("Falling but bouncing", ["BLS"]), "-1,0": cell("Falling but resting", ["SUZLON"]), "-1,-1": cell("Falling", ["KRN"]) },
  business: { strong_up: { n: 7, share: 0.2, symbols: ["SKYGOLD", "WHEELS", "MEDANTA", "BALUFORGE", "LUMAXTECH", "SOLARINDS", "ICICIBANK"] }, strong_down: { n: 9, share: 0.26, symbols: ["SANDUMA", "RRKABEL", "SUZLON"] },
    weak_up: { n: 1, share: 0.03, symbols: ["APOLLO"] }, weak_down: { n: 0, share: 0, symbols: [] } },
};
const share = (symbol: string, label: "leader" | "in_line" | "laggard" | null, rank = 1, of = 10, lt: number | null = 20): Share => ({ symbol, industry: null, size: "Large", chg: null, prism: 70, prismWord: null, valuation: null, risk: null,
  st: 10, lt, below52: null, m1: null, peer: label ? { label, raw: null, rank, of, group: "IT", vs: 5, bench: "peer average", direction: null } : null, notCompared: label ? null : "trades too thinly to rank fairly" });
const view = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("the short- and long-term trend (C43–C46)", () => {
  it("reads as a matrix with both axes, each with an (i), and arrows on the heads", () => {
    view(<TrendSection t={t} shares={[share("FRACTAL", "leader", 1, 10, null)]} />);
    expect(screen.getByText(/^Short-term trend →/)).toBeTruthy(); expect(document.querySelector(".eq-tm-y")!.textContent).toMatch(/^Long-term trend ↓/);   // task #388: the label and its arrow in two spans (down the side)
    expect(screen.getByRole("button", { name: "About the short-term trend" })).toBeTruthy(); expect(screen.getByRole("button", { name: "About the long-term trend" })).toBeTruthy();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Long-term trend", "↑ Up", "→ Sideways", "↓ Down"]);   // task #274: Up first
    expect(within(table).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["↑ Up", "→ Sideways", "↓ Down"]);
    expect(screen.getByText(/35 of 39 stocks rated/).textContent).toMatch(/FRACTAL has no long-term reading yet/);
  });
  it("shows 4 names in a cell, then +N more ▾ that opens the full list", () => {
    view(<TrendSection t={t} shares={[]} />);
    const c = document.querySelector("tbody tr td")! as HTMLElement;   // top-left: Rising on both (task #274)
    expect(c.querySelector(".eq-tg-w")!.textContent).toBe("Rising (Long term Rising, Short term Rising): 9 stocks");
    expect(c.querySelector(".eq-tg-n")!.textContent).toBe("926%");
    expect(within(c).getAllByRole("link").slice(0, 4).map((a) => a.getAttribute("href"))).toEqual(["/stocks/SKYGOLD", "/stocks/WHEELS", "/stocks/MEDANTA", "/stocks/RPEL"]);
    const more = within(c).getByRole("button", { name: "+5 more ▾" });
    expect(c.querySelector("[hidden]")!.textContent).toBe("BALUFORGEPERSISTENTAPOLLOLUMAXTECHICICIBANK");
    fireEvent.click(more);
    expect(c.querySelector("[hidden]")).toBeNull(); expect(more.textContent).toBe("Show fewer ▴");
  });
  it("lists Business and price as four rows in Prism words (task #385: no cut-offs on the page), full lists, and the count in between", () => {
    view(<TrendSection t={t} shares={[]} />);
    const rows = Array.from(document.querySelectorAll(".eq-bpr"));
    expect(rows.map((r) => r.querySelector(".eq-bpr-t b")!.textContent)).toEqual(["Business and price agree (strong)", "Price behind the business", "Price ahead of the business", "Business and price agree (weak)"]);
    expect(rows[0].textContent).toMatch(/7 stocks · Strong or Healthy Prism, long-term uptrend/);
    expect(within(rows[0] as HTMLElement).getByRole("button", { name: "+3 more ▾" })).toBeTruthy();
    expect(rows[2].textContent).toMatch(/Weak Prism, long-term uptrend/);
    expect(screen.getByText("18 of 35 rated shares sit in between (an Average Prism, or a flat long-term trend).")).toBeTruthy();   // an older reading without the list
    expect(screen.getByRole("button", { name: "About Business and price" })).toBeTruthy();
  });
  it("writes its three things to know, closed until opened", () => {
    expect(trendCards(t).map((c) => c.title)).toEqual(["Nine shares are Rising on both trends", "The short term trails the long term for 46%", "Price behind the business for nine shares"]);
    view(<TrendSection t={t} shares={[]} />);
    expect(screen.getAllByRole("button", { expanded: false }).filter((b) => b.className === "dsh-ic-row")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Open all" })).toBeTruthy();
  });
});

describe("against their peers (C47, C49)", () => {
  const xs = [...Array.from({ length: 5 }, (_, i) => share(`L${i}`, "leader", i + 1, 20)), share("M0", "in_line"), share("G0", "laggard", 9, 10), share("NC", null)];
  it("shows 3 shares per column, then Show all N ▾ (the Watchlists page; the Equity portfolio reads one chart since task #388)", () => {
    view(<PeersSection shares={xs} voice="list" />);
    const lead = document.getElementById("eq-pc-leader")!;
    expect(lead.querySelectorAll("li")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Show all 5 ▾" }));
    expect(lead.querySelectorAll("li")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Show fewer ▴" })).toBeTruthy();
    expect(screen.queryByText(/What if you had owned/)).toBeNull();   // the group leaders are their own section now
  });
});

describe("group leaders, its own section (C48)", () => {
  it("has its own heading and section id, and starts from the 3 weakest laggards with Show all", () => {
    const lags = Array.from({ length: 5 }, (_, i) => share(`G${i}`, "laggard", 5 + i, 15));
    view(<LeadersSection shares={lags} />);
    expect(screen.getByRole("heading", { name: /What if you had owned the group leader instead\?/ }).closest("section")!.getAttribute("aria-labelledby")).toBe("eq-leaders");
    expect(screen.getByText(/Your three weakest laggards against the #1 share of their own peer group/)).toBeTruthy();
  });
  it("is left out when no share lags its peers", () => {
    const { container } = view(<LeadersSection shares={[share("A", "leader")]} />);
    expect(container.textContent).toBe("");
  });
});

describe("Silver sees a dashed lock card for each Gold-only section (C42)", () => {
  it("names the section, says Gold and up, and links to the plans", () => {
    view(<GoldLock id="eq-peers" title="Against their peers" text="Whether each share leads or lags similar companies over 12 months." />);
    const s = screen.getByRole("region", { name: /Against their peers/ });
    expect(s.className).toContain("eq-lock"); expect(s.textContent).toMatch(/Gold and up/); expect(within(s).getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/plans");
  });
});

describe("+N more (C49)", () => {
  it("shows every name when there are four or fewer, and a dash for none", () => {
    const { container, rerender } = render(<More names={["A", "B", "C", "D"]} />);
    expect(container.textContent).toBe("A, B, C, D"); expect(screen.queryByRole("button")).toBeNull();
    rerender(<More names={[]} />); expect(container.textContent).toBe("–");
  });
});
