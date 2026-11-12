// @vitest-environment jsdom
// Compare companies, Spider tab (task #81): the chart, its legend and the table use the same company colours and marker shapes; every axis is said to be a percentile score;
// a missing figure is a gap, a cross and a grey dash, never a zero; the green, amber, red and grey indicators explain themselves in tooltips that open on focus and tap.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("../lib/screener", async (orig) => ({ ...(await orig<typeof import("../lib/screener")>()), useUniverse: () => ({ data: { rows: st.rows, sample: false, as_of: null, prism: null }, isLoading: false, isError: false }) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: (p: string) => p !== "gold", upgrade: vi.fn(), toast: vi.fn(), plan: "silver" }), TIER: { basic: { n: "Basic" }, silver: { n: "Silver" }, gold: { n: "Gold" } } }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/diversification/DiversificationCard", () => ({ DiversificationCard: () => null }));
vi.mock("../components/CompareCustom", () => ({ CompareCustom: () => null }));
vi.mock("../components/CompareBar", () => ({ CompareBar: () => null }));
import { Compare } from "./Compare";

const base = (i: number) => ({ symbol: "S" + i, name: "Company " + i, sector: "X", sample: false, scored: true, overall: null, band: null, pillar_quality: null, pillar_growth: null, pillar_profitability: null, pillar_balance: null, pillar_technical: null,
  price: 100, market_cap: 1000 + i, pe: 10 + i, pb: 2, roe: 5 + i, roce: 6 + i, dividend_yield: i / 10, debt_to_equity: 0.1 + i / 20, sales_cagr: i, profit_cagr: i * 2, operating_margin: 3 + i, change_pct: 0, return_1m: 0, return_1y: 0, prism_state: null });
const rows = () => {
  const all: Record<string, unknown>[] = Array.from({ length: 30 }, (_, i) => base(i));
  all.push({ ...base(40), symbol: "FULL", name: "Full Data Ltd", roe: 40, roce: 41, operating_margin: 33, sales_cagr: 22, profit_cagr: 40, debt_to_equity: 0.05, pe: 6, dividend_yield: 2.5 });
  all.push({ ...base(41), symbol: "GAPPY", name: "Gappy Ltd", roe: 12, roce: null, operating_margin: 9, sales_cagr: 7, profit_cagr: null, debt_to_equity: null, pe: 25, dividend_yield: 0.5 });
  return all;
};

beforeEach(() => { st.rows = rows(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(cleanup);
const open = () => {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/compare?c=FULL,GAPPY"]}><Compare /></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole("tab", { name: /Spider/ }));
  return document.querySelector(".cmp-pil") as HTMLElement;
};
const tip = () => document.querySelector(".hv-tip")?.textContent ?? null;

describe("Compare, Spider tab", () => {
  it("says that every axis is a percentile score, in the header, under the chart and for screen readers", () => {
    const card = open();
    expect(card.querySelector(".card-h .s")?.textContent).toBe("Each axis: % of all companies beaten");
    expect(card.querySelector(".sp-axis")?.textContent).toMatch(/Every axis is a percentile score from 0 to 100, not the ratio itself\. .*100 means it beats every company\. Hover or tap a marker for the actual figure\./);
    expect(card.querySelector("svg.radar")?.getAttribute("aria-label")).toMatch(/Each axis is a percentile score from 0 to 100: the share of companies beaten/);
    expect([...card.querySelectorAll(".radar .rr")].map((t) => t.textContent)).toEqual(["50%", "100%"]);
  });

  it("puts the legend straight under the chart, before the notes", () => {
    const card = open();
    const kids = [...(card.querySelector(".sp-chart") as HTMLElement).children].map((e) => e.getAttribute("class") || e.tagName.toLowerCase());
    expect(kids.indexOf("pil-key sp-legend")).toBe(kids.findIndex((k) => k.includes("radar") || k === "svg" || k.includes("cz")) + 1 || 1);
    expect(kids.indexOf("pil-key sp-legend")).toBeLessThan(kids.indexOf("sp-axis"));
    expect(kids.indexOf("sp-axis")).toBeLessThan(kids.indexOf("sp-axis sp-gap"));
  });

  it("uses one colour and one marker shape per company in the chart, the legend and the table", () => {
    const card = open();
    const legend = [...card.querySelectorAll(".sp-legend .mk")].map((m) => m.className);
    expect(legend).toEqual(["mk k0", "mk k1"]);
    expect([...card.querySelectorAll(".sp-h .mk")].map((m) => m.className)).toEqual(legend);          // the table's company headings carry the same markers
    expect([...card.querySelectorAll("svg.radar > g.rs")].map((g) => (g.getAttribute("class") || "").replace("rs ", ""))).toEqual(["k0", "k1"]);   // the chart's marker layer: the same classes in the same order
    expect([...card.querySelectorAll(".sp-r")].every((r) => r.querySelectorAll(".sp-v.k0, .sp-v.k1").length === 2)).toBe(true);
    expect(readCss()).toMatch(/\.mk\.k0 \{ border-radius: 50%/); expect(readCss()).toMatch(/\.mk\.k1 \{ border-radius: 2px/);   // circle and square, as in the chart
  });

  it("shows no figure as a gap, a cross and a grey dash, never as zero", () => {
    const card = open();
    const gappy = [...card.querySelectorAll("svg.radar > g.rs.k1 > *")];
    expect(gappy.filter((g) => g.classList.contains("rs-x"))).toHaveLength(3);                          // ROCE, Profit growth, Low debt
    expect(card.querySelector(".sp-gap")?.textContent).toMatch(/cross just outside the chart marks the gap\) instead of dropping to zero: Gappy Ltd: ROCE, Profit growth, Low debt\./);
    const dashes = [...card.querySelectorAll(".sp-na")];
    expect(dashes).toHaveLength(3);
    expect(dashes.every((d) => d.textContent === "—" && d.querySelector(".dt.none"))).toBe(true);
    expect(card.textContent).not.toMatch(/beats 0%\b/);
  });

  it("explains the green, amber, red and grey indicators in tooltips that open on focus, so a tap or a keyboard reaches them", () => {
    const card = open();
    const dot = card.querySelector(".sp-v .dt.good") as HTMLElement;
    expect(dot.getAttribute("tabindex")).toBe("0"); expect(dot.hasAttribute("title")).toBe(false);          // not a title attribute: those do not open on a phone
    fireEvent.focus(dot);
    expect(tip()).toMatch(/^Green: better than \d+% of companies, so among the stronger third\.$/);
    fireEvent.blur(dot);
    const grey = card.querySelector(".sp-na") as HTMLElement;
    fireEvent.focus(grey);
    expect(tip()).toBe("No figure (grey): this company has not reported this measure, so it is left out of the chart and not counted as zero.");
    fireEvent.blur(grey);
    const key = [...card.querySelectorAll(".sp-key span")];
    expect(key.map((k) => k.textContent)).toEqual(["Beats 67% or more", "Beats 34 to 66%", "Beats 33% or fewer", "— No figure"]);
    const why = key.map((k) => { fireEvent.focus(k); const t = tip(); fireEvent.blur(k); return t; });
    expect(why[0]).toMatch(/^Green: the company beats 67% or more of companies .* Better means lower for debt and P\/E, higher for everything else\.$/);
    expect(why[1]).toMatch(/^Amber: .*34 to 66%/); expect(why[2]).toMatch(/^Red: .*33% or fewer/); expect(why[3]).toMatch(/^No figure \(grey\)/);
    expect(key.every((k) => !k.hasAttribute("title") && k.getAttribute("tabindex") === "0")).toBe(true);
  });

  it("shows the actual figure and the percentile of a marker, with the company and the measure", () => {
    const card = open();
    const roe = card.querySelector("svg.radar > g.rs.k0 > .rs-m") as unknown as SVGElement;               // Full Data Ltd, ROE
    fireEvent.focus(roe);
    expect(tip()).toBe("Full Data Ltd\nROE: 40.0%\nPercentile score: 97 (beats 97% of companies)");
    expect(within(card).getAllByText("beats 97%").length).toBeGreaterThan(0);                               // the table says the same: 31 of the 32 companies, never itself
  });

  it("keeps the chart beside the table only where there is room, so a phone gets the chart above the table", () => {
    const css = readCss();
    expect(css).toMatch(/@media \(min-width: 901px\) \{ \.pil-grid\.sp-grid \{ grid-template-columns: minmax\(300px, 460px\) minmax\(0, 1fr\); \} \}/);
    expect(css.replace(/@media \(min-width: 901px\) \{[^}]*\{[^}]*\} \}/, "")).not.toMatch(/\.pil-grid\.sp-grid \{ grid-template-columns/);   // never as a plain rule, which would win over the phone rule
    expect(css).toMatch(/@media \(max-width: 900px\) \{ \.pil-grid \{ grid-template-columns: 1fr; \}/);
    expect(css).toMatch(/\.sp-t \.sp-h > span:not\(:first-child\) \{ display: flex; flex-direction: column;/);   // company headings stack their marker over the name, so a name is never cut off
  });
});

const readCss = () => readFileSync(join(__dirname, "..", "styles", "tools.css"), "utf8");
