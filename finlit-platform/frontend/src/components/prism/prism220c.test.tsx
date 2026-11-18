// @vitest-environment jsdom
// Task #220 round C (FinLit Prism report handover, 18 Nov 2026): tab groups in 01, 02 and 03 with chips in the labels (README 1.3), the frozen tab
// bars, 01's filters across every part with "N of M" and the no-match line (3.1), 02's own trend cards, tabs and verdict line (3.2), 03's four tabs and
// the enlarge window keeping each chart's colour (3.3). The browser checks (stuck under the bar, panel from its start, no sideways scroll) are in the PR.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TabGroup } from "../TabGroup";
import { FactorExplorer } from "./pzr/Factors";
import { prismReview, type PrismReport } from "../../lib/prism";
import rel from "../../lib/__fixtures__/prismReliance.json";

afterEach(cleanup);
const src = (f: string) => readFileSync(join(__dirname, "../..", f), "utf8");
const R = rel as unknown as PrismReport;

describe("the shared tab group, extended (README 1.3)", () => {
  it("a tab can carry a chip and a note; controls can sit in the bar; a frozen bar is marked", () => {
    const { container } = render(<TabGroup label="x" sticky tools={<button type="button">Filter</button>}
      views={[{ key: "a", label: "Every signal", chip: 27, content: <p>A</p> }, { key: "b", label: "Trend map", note: "3 of 4", content: <p>B</p> }]} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].textContent).toBe("1Every signal27"); expect(tabs[0].querySelector(".ct-sc")!.textContent).toBe("27");
    expect(tabs[1].querySelector(".ct-cnt")!.textContent).toBe("3 of 4");
    const bar = container.querySelector(".ctabs")!;
    expect(bar.classList.contains("ct-sticky")).toBe(true); expect(bar.classList.contains("has-tools")).toBe(true);
    expect(within(bar as HTMLElement).getByRole("button", { name: "Filter" })).toBeTruthy();
  });
  it("frozen bars stick under the sections bar with a shadow and a page-colour band; one row on phones", () => {
    const css = src("styles/prism220.css");
    expect(css).toContain(".pzr-rep .ctabs.ct-sticky { position: sticky; top: var(--pzn-stick, 112px);");
    expect(css).toMatch(/\.ctabs\.ct-sticky\.stuck \{[^}]*box-shadow: 0 -12px 0 0 var\(--bg\)/);
    expect(css).toMatch(/@media \(max-width: 700px\) \{[^@]*\.ct-sticky\.stuck \.ct-list \{ flex-wrap: nowrap;[^@]*\.ct-sticky\.stuck \.ct-tools \{ display: none; \}/);
    expect(src("components/TabGroup.tsx")).toContain("stickTop() + b.offsetHeight + 10");   // a switch while stuck shows the new panel from its start
  });
});

describe("01 Every factor (README 3.1)", () => {
  it("four part tabs with their scores; the filters and sort in the bar; while filtering each tab says N of M; a part with none says so", () => {
    const { container } = render(<FactorExplorer report={R} review={prismReview(R)} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent?.replace(/^\d/, "").replace(/[\d.]+$/, ""))).toEqual(["Growth & Profitability", "Valuation", "Quality", "Risk"]);
    for (const t of tabs) expect(t.querySelector(".ct-sc")!.textContent).toMatch(/^\d{1,3}\.\d$/);      // each part's score, one decimal
    expect(container.querySelector(".ctabs .ct-tools .pzr-tools select")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Estimated or missing/ }));
    for (const t of screen.getAllByRole("tab")) expect(t.querySelector(".ct-cnt")!.textContent).toMatch(/^\d+ of \d+$/);
    expect(container.textContent).toContain("No factor in this part matches the filter.");
  });
});

describe("02 Technical view and 03 Financial history (README 3.2, 3.3)", () => {
  it("02: the score card's own trend cards (the same component, bare), the verdict line under the alignment card, three tabs", () => {
    const s = src("components/prism/pzr/Technical.tsx");
    expect(s).toContain("<TechnicalSection bare a={a}");
    expect(s).toContain("It is separate from the 0 to 100 financial-health score.</p>");
    expect(s).toMatch(/label: "Every signal", chip: a\.shortTerm\.factors\.length \+ a\.longTerm\.factors\.length[\s\S]*label: "Trend map"[\s\S]*label: "What the market shows"/);
    expect(s).toContain('<PzProp lead="These are some of the signals the technical view is based on.">How the signals are weighted and combined is proprietary to FinLit Ventures.</PzProp>');
    expect(src("styles/prism220.css")).toMatch(/@media \(max-width: 759px\) \{ \.pzr-rep \.pzt-clone \.pcx-tp \{ grid-template-columns: minmax\(0, 1fr\); \} \}/);
  });
  it("03: Charts · Quarterly results · Annual results · Key financial ratios; each chart's colour travels into the enlarge window", () => {
    const v = src("components/prism/ReportView.tsx");
    expect(v).toMatch(/label: "Charts"[\s\S]*label: "Quarterly results"[\s\S]*label: "Annual results"[\s\S]*label: "Key financial ratios"/);
    const h = src("components/prism/pzr/History.tsx");
    expect(h.indexOf('<ChartZoom label={title} className="cz-r">')).toBeLessThan(h.indexOf('<div className="pzr-ch-in" style={{ "--c": color }'));
    expect(src("styles/prism220.css")).toContain(".pzr-ch-in figcaption { display: flex;");
  });
});
