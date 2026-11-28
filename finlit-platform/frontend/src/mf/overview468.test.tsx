// @vitest-environment jsdom
// Task #468 (28 Nov 2026, the team): "convert this image to the 2nd image given" on /funds: the six separate tiles above the table become one
// "Fund Market Overview" panel: title with an (i), the count and NAV date on the right, six equal cells each with an icon tile, number, label and grey line.
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FundRow } from "../lib/mf";
import { SummaryCards } from "./Summary";

afterEach(cleanup);
const row = (o: Partial<FundRow>) => ({ name: "Fund", r1y: null, r3y: null, r5y: null, sip3y: null, ter: null, aum: null, ...o }) as unknown as FundRow;
const items = [
  row({ name: "SBI Nifty 50 ETF", r1y: 0.05, r3y: 0.12, r5y: 0.13, sip3y: 0.07, ter: 0.0007, aum: 212777e7 }),
  row({ name: "Small fund", r1y: -0.01, r3y: 0.1, r5y: 0.11, sip3y: 0.08, ter: 0.009, aum: 1e9 }),
  row({ name: "Third", r1y: 0.02, r3y: 0.13, r5y: 0.12, sip3y: 0.06, ter: 0.008, aum: 2e9 }),
];

describe("Fund Market Overview (task #468)", () => {
  it("is one panel titled Fund Market Overview with an (i) and the count and NAV date on the right", () => {
    render(<SummaryCards items={items} total={14010} plan="" scope="across all categories" meta={<>14,010 schemes • NAVs up to 29 Nov 2026</>}
      about="Of the 14,010 schemes, 8,346 are still publishing a NAV and 5,664 have stopped." />);
    const panel = screen.getByRole("region", { name: /Fund Market Overview/ });
    expect(within(panel).getByRole("heading", { level: 2 }).textContent).toMatch(/^Fund Market Overview/);
    expect(within(panel).getByRole("button", { name: "What is Fund Market Overview?" })).toBeTruthy();
    expect(panel.querySelector(".mf-ov468-meta")!.textContent).toBe("14,010 schemes • NAVs up to 29 Nov 2026");
  });

  it("has six cells in the picture's order, each with an icon tile, number, label and grey line; no figure is dropped", () => {
    render(<SummaryCards items={items} total={14010} plan="" scope="across all categories" />);
    const cells = [...document.querySelectorAll(".mf-ov468-row > .mf-ov468-cell")];
    expect(cells).toHaveLength(6);
    expect(cells.map((c) => c.querySelector(".mf-ov468-l")!.textContent)).toEqual(
      ["Schemes", "Rose over 1 year", "Median return", "Median 3-year SIP", "Median expense", "Largest fund"]);
    for (const c of cells) {
      expect(c.querySelector(".mf-ov468-ic svg.ico")).toBeTruthy();
      expect(c.querySelector(".mf-ov468-v")!.textContent).not.toBe("");
      expect(c.querySelector(".mf-ov468-s")!.textContent).not.toBe("");
    }
    expect(cells[0].querySelector(".mf-ov468-v")!.textContent).toBe("14,010");
    expect(cells[1].querySelector(".mf-ov468-v .pos")!.textContent).toBe("2 of 3");   // the "17 of 21" figure keeps its green
    expect(cells[2].querySelector(".mf-ov468-s")!.textContent).toMatch(/a year · 3Y .* · 5Y /);
    expect(cells[5].querySelector(".mf-ov468-s")!.textContent).toBe("SBI Nifty 50 ETF");
  });

  it("the (i) keeps what the old count line said (publishing / stopped)", () => {
    // the explanation text travels in the Info button's glossary entry; it is read from the component's props here
    const html = render(<SummaryCards items={items} total={14010} about="Of the 14,010 schemes, 8,346 are still publishing a NAV and 5,664 have stopped." />);
    expect(html.container.querySelector("button.info")).toBeTruthy();
  });

  it("CSS: one row of six with dividers on desktop, three then two across on narrower screens; the old count line kept only for screen readers", () => {
    const css = readFileSync(resolve(__dirname, "../styles/task468.css"), "utf8");
    expect(css).toMatch(/\.mf-ov468-row \{ display: grid; grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.mf-ov468-cell \{[^}]*border-left: 1px solid var\(--border\)/);
    expect(css).toMatch(/container-type: inline-size/);
    expect(css).toMatch(/@container \(max-width: 779px\)[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/@container \(max-width: 520px\)[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).not.toMatch(/\.mf-ov468-v \{[^}]*text-overflow: ellipsis/);   // a figure is never cut short
    expect(css).toMatch(/\.mf-count\.mf-count468 \{ position: absolute; width: 1px; height: 1px;/);
    const page = readFileSync(resolve(__dirname, "../pages/Funds.tsx"), "utf8");
    expect(page).toContain('import "../styles/task468.css"');
    expect(page).toMatch(/still publishing a NAV and .* have stopped/);
  });
});
