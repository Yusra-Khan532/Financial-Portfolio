// Task #341 PR D (the Mutual Funds refinement prompt, section 14): the scheme table keeps its header in view while it scrolls down (desktop), names at
// most two lines with the full name on hover, figures at 13px, a raised header; the pager's current page clearly marked (aria-current, not .on).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const tsx = readFileSync(join(__dirname, "..", "mf", "FundTable.tsx"), "utf8");
const css = readFileSync(join(__dirname, "mf341.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("Mutual funds scheme table (task #341 PR D)", () => {
  it("the table box is the tall one, so the header sticks; a phone keeps one page scroll", () => {
    expect(tsx).toMatch(/<HScroll label="schemes table" controls=\{false\} tall>/);
    expect(css).toMatch(/@media \(max-width: 760px\) \{ \.mf \.tw\.tw-tall \{ max-height: none; \} \}/);
    expect(css).toMatch(/\.mf \.tw-tall thead th:first-child \{ z-index: 5; \}/);
  });
  it("scheme names at most two lines with the full name on hover; figures at 13px", () => {
    expect(tsx).toContain("<Link to={`/funds/${r.code}`} title={r.name}>{r.name}</Link>");
    expect(css).toMatch(/\.mf \.mf-table \.mf-nm > a \{ display: -webkit-box; -webkit-line-clamp: 2;/);
    expect(css).toMatch(/\.mf \.mf-table td\.num \{ font-size: var\(--fs-13\); \}/);
  });
  it("pager: 36px buttons, the current page marked by aria-current", () => {
    expect(css).toMatch(/\.mf \.mf-pages \.btn\[aria-current="page"\] \{/);
    expect(css).toMatch(/\.mf \.mf-pages \.btn \{ min-width: 36px; min-height: 36px;/);
  });
});
