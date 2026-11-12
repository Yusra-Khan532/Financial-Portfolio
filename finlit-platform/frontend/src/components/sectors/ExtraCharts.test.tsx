// @vitest-environment jsdom
// "Industry map" and "A year of <industry>": the dots, the bands, the numbered moments, the server's insights, the dropdowns and the older chart kept in a dropdown.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../ChartZoom", () => ({ ChartZoom: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { IndustryMapChart, IndustryYearChart } from "./ExtraCharts";
import type { IndustryMap, IndustryYear } from "../../lib/sectorExtra";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
afterEach(cleanup);
const words = { sold_off: "Sold off", bouncing: "Bouncing back", rising: "Rising together", losing: "Losing steam", no_signal: "No clear signal" };
const map: IndustryMap = { words, insights: [{ kind: "good", title: "Rising and near their highs", text: "Rising broadly and near their 1-year highs: Banks." }],
  rows: [{ name: "Banks", slug: "banks", state: "rising", state_word: "Rising together", rising: 80, below_high: -4, corner: "Leading" },
    { name: "Power", slug: "power", state: "sold_off", state_word: "Sold off", rising: 52.4, below_high: -19.9, corner: null }] };
const dates = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
const year: IndustryYear = { name: "Finance", slug: "finance", dates, rising: dates.map((_, i) => (i * 7) % 100), states: dates.map((_, i) => (i < 20 ? "sold_off" : i < 30 ? "bouncing" : "losing")), words,
  moments: [{ n: 1, i: 10, date: dates[10], text: "11 Jan 2026. Sold off: 70 in 100 stocks were rising, the lowest of that run." }, { n: 2, i: 59, date: dates[59], text: "1 Mar 2026. Latest close: 13 in 100 rising, losing steam." }],
  insights: [{ kind: "watch", title: "Days sold off", text: "Finance was Sold off on 20 of the last 60 trading days." }], bounces: [{ from: dates[20], to: dates[29], days: 10 }],
  days_in_state: { sold_off: 20, bouncing: 10, rising: 0, losing: 30, no_signal: 0 } };

describe("Industry map and A year of an industry", () => {
  it("draws one dot per industry with its words, the server's insight and the full list in a closed dropdown", () => {
    render(<MemoryRouter><IndustryMapChart m={map} /></MemoryRouter>);
    expect(document.querySelectorAll("[data-testid=map-chart] .pc-dot")).toHaveLength(2);
    expect(document.querySelector(".pc-dot.pc-rising title")?.textContent).toMatch(/Banks: 80 in 100 rising, −4.0% below its 1-year high, Rising together/);
    expect(screen.getByText("Rising broadly and near their 1-year highs: Banks.")).toBeTruthy();
    expect(screen.getByText("Every industry on the map (2)").closest("details")?.hasAttribute("open")).toBe(false);
    expect(screen.getByRole("button", { name: "Hide: Industry map" })).toBeTruthy();
  });
  it("a year: one line, both bands, the state strip, numbered moments told in order, the older chart and the numbers in dropdowns", () => {
    render(<MemoryRouter><IndustryYearChart y={year} older={<p>older chart</p>} /></MemoryRouter>);
    const svg = document.querySelector("[data-testid=year-chart]")!;
    expect(svg.querySelectorAll(".pc-line")).toHaveLength(1); expect(svg.querySelector(".pc-band-up")).toBeTruthy(); expect(svg.querySelector(".pc-band-dn")).toBeTruthy();
    expect(svg.querySelectorAll("rect.pc-f")).toHaveLength(60); expect(svg.querySelectorAll(".pc-mo")).toHaveLength(2);
    expect(Array.from(document.querySelectorAll(".pc-moments li")).map((l) => l.textContent)).toEqual([year.moments[0].text, year.moments[1].text]);
    expect(screen.getByText("Show the short and longer trends as well").closest("details")?.textContent).toContain("older chart");
    expect(screen.getByText("See the numbers: each bounce, and days in each state")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\b(buy|sell)\b/i);
  });
});
