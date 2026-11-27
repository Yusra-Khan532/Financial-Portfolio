// @vitest-environment jsdom
// Task #215: the forecast card in section 06 (sample from the team, 17 Nov 2026): Revenue (Forecast) and Profit (Forecast), 1Y · 3Y · 5Y chips with the
// past growth rate; pressing 3 shows the 3rd year's projection, the same for 1 and 5; every blank says why; it describes, never advises.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Financials, Table } from "../lib/api";
import { firstSpan, project, SPANS } from "../lib/forecast";
import { ForecastCard } from "./ForecastCard";

afterEach(cleanup);
// Reliance-like yearly figures, FY19 to FY26 (₹ crore)
const PL: Table = { periods: ["FY19", "FY20", "FY21", "FY22", "FY23", "FY24", "FY25", "FY26"],
  rows: { revenue: [581000, 612000, 486000, 722000, 893000, 914000, 980000, 1076000], net_profit: [40000, 43000, 53000, 67000, 74000, 79000, 69600, 80775] } } as unknown as Table;
const fin = (pl: Table) => ({ meta: { statement: "consolidated" }, yearly: { pl, bs: { periods: [], rows: {} }, cf: { periods: [], rows: {} } }, quarterly: { pl: { periods: [], rows: {} } } }) as unknown as Financials;

describe("the projection (lib/forecast)", () => {
  it("N-year rate from the year N before the latest; value N years after the latest at that rate", () => {
    const p = project(PL, "revenue", 3);
    expect(p.ok && [p.from, p.to, p.year]).toEqual(["FY23", "FY26", "FY29"]);
    if (!p.ok) throw new Error();
    expect(p.rate).toBeCloseTo((Math.pow(1076000 / 893000, 1 / 3) - 1) * 100, 6);
    expect(p.value).toBeCloseTo(1076000 * Math.pow(1076000 / 893000, 1), 0);   // 3 years at the 3-year rate repeats the last 3 years' ratio
    const one = project(PL, "revenue", 1);
    expect(one.ok && one.year).toBe("FY27"); expect(one.ok && one.rate).toBeCloseTo(9.796, 2);
    const five = project(PL, "net_profit", 5);
    expect(five.ok && [five.from, five.year]).toEqual(["FY21", "FY31"]);
  });
  it("every blank says why: too few years, a missing figure, a loss or zero at either end", () => {
    const short = { periods: ["FY25", "FY26"], rows: { revenue: [10, 12] } } as unknown as Table;
    expect(project(short, "revenue", 3)).toEqual({ ok: false, span: 3, why: "Needs 4 years of figures (FY23 to FY26)" });
    const loss = { periods: ["FY23", "FY24", "FY25", "FY26"], rows: { net_profit: [-5, 2, 3, 4] } } as unknown as Table;
    expect(project(loss, "net_profit", 3)).toMatchObject({ ok: false, why: "Not worked out: FY23 was a loss, and a growth rate needs figures above zero at both ends" });
    const gap = { periods: ["FY24", "FY25", "FY26"], rows: { revenue: [null, 3, 4] } } as unknown as Table;
    expect(project(gap, "revenue", 2 as never)).toMatchObject({ ok: false, why: "No figure for FY24" });
    expect(project(undefined, "revenue", 1)).toMatchObject({ ok: false, why: "No yearly figures yet" });
  });
  it("opens on 3 years (the sample), or the longest span that can be worked out", () => {
    expect(firstSpan(SPANS.map((s) => project(PL, "revenue", s)))).toBe(3);
    const two = { periods: ["FY25", "FY26"], rows: { revenue: [10, 12] } } as unknown as Table;
    expect(firstSpan(SPANS.map((s) => project(two, "revenue", s)))).toBe(1);
  });
});

describe("the card (task #215)", () => {
  it("shows Revenue (Forecast) and Profit (Forecast) with 1Y · 3Y · 5Y chips; 3Y is selected on load and shows FY29", () => {
    render(<ForecastCard f={fin(PL)} />);
    expect(screen.getByText("Revenue (Forecast)")).toBeTruthy(); expect(screen.getByText("Profit (Forecast)")).toBeTruthy();
    const groups = screen.getAllByRole("group");
    expect(groups).toHaveLength(2);
    for (const g of groups) expect(within(g).getAllByRole("button").map((b) => b.textContent?.slice(0, 2))).toEqual(["1Y", "3Y", "5Y"]);
    expect(within(groups[0]).getByRole("button", { pressed: true }).textContent).toMatch(/^3Y \+6\.4%$/);
    expect(screen.getAllByText(/^FY29 · at the 3-year rate \(FY23 to FY26\)$/)).toHaveLength(2);
    expect(screen.getAllByText(/₹12\.97 L Cr/)).toHaveLength(1);   // 10.76 L Cr × 1.0640³ (10.76 × 10.76 ÷ 8.93)
  });
  it("pressing 1 shows the 1st year's projection and pressing 5 the 5th; both halves follow one press", () => {
    render(<ForecastCard f={fin(PL)} />);
    fireEvent.click(within(screen.getAllByRole("group")[1]).getByRole("button", { name: /^1Y/ }));
    expect(screen.getAllByText(/^FY27 · at the 1-year rate \(FY25 to FY26\)$/)).toHaveLength(2);
    expect(screen.getByText(/₹11\.81 L Cr/)).toBeTruthy();   // 10.76 L Cr × 1.098
    fireEvent.click(within(screen.getAllByRole("group")[0]).getByRole("button", { name: /^5Y/ }));
    expect(screen.getAllByText(/^FY31 · at the 5-year rate \(FY21 to FY26\)$/)).toHaveLength(2);
    for (const g of screen.getAllByRole("group")) expect(within(g).getByRole("button", { pressed: true }).textContent).toMatch(/^5Y/);
  });
  it("a span that cannot be worked out shows a dash and its reason", () => {
    const pl = { periods: ["FY24", "FY25", "FY26"], rows: { revenue: [80, 90, 100], net_profit: [-3, 4, 5] } } as unknown as Table;
    render(<ForecastCard f={fin(pl)} />);
    const g = screen.getAllByRole("group")[0];
    expect(g.querySelector("button[aria-pressed=true]")!.textContent).toMatch(/^1Y/);   // opens on 1Y: 3Y and 5Y are not possible
    const three = within(g).getByRole("button", { name: /^3Y/ });
    expect(three.textContent).toBe("3Y —"); expect(three.getAttribute("title")).toBe("Needs 4 years of figures (FY23 to FY26)");
    fireEvent.click(three);
    expect(screen.getAllByText("Needs 4 years of figures (FY23 to FY26)")).toHaveLength(2);
    expect(screen.getAllByText("—", { selector: "b" })).toHaveLength(2);
    fireEvent.click(within(screen.getAllByRole("group")[1]).getByRole("button", { name: /^1Y/ }));
    expect(screen.getByText(/^Profit \(Forecast\)$/).parentElement!.textContent).toContain("FY27 · at the 1-year rate (FY25 to FY26)");
  });
  it("says what it is and never advises; opens section 05, above the key figures (developer file 47: it sat in the heading's right side)", () => {
    const { container } = render(<ForecastCard f={fin(PL)} />);
    expect(container.textContent).toContain("If past growth carried on · not a prediction");
    expect((container.textContent ?? "").toLowerCase()).not.toMatch(/\b(buy|sell|hold|target|avoid|accumulate|best)\b/);
    const src = readFileSync(join(__dirname, "Sections.tsx"), "utf8");
    expect(src).toContain('<div className="fin-top"><ForecastCard f={f} />');
    expect(src).not.toContain('aside={<ForecastCard f={f} />}');
  });
});
