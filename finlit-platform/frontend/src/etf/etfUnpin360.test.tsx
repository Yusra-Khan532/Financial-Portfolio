// Task #360 (team, 23 Nov 2026): the ETF toolbar (search, Columns) no longer slides over the table while scrolling; with the filters hidden, a slim
// vertical Show filters sits in its own 44px column, in view while scrolling and covering nothing (as on the Mutual funds page and the screener).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "../styles/task360.css"), "utf8");
const page = readFileSync(join(__dirname, "List.tsx"), "utf8");
describe("task #360: the ETF toolbar stays put; Show filters in its own column", () => {
  it("the toolbar is not pinned", () => { expect(css).toMatch(/\.etf-list \.etf-tools \{ position: static; \}/); });
  it("Show filters is a sticky vertical button in a 44px column, and only the phone keeps the toolbar's Filters button", () => {
    expect(css).toMatch(/\.etf-list \.etf-layout\.is-shut \{ grid-template-columns: 44px minmax\(0, 1fr\); \}/);
    expect(css).toMatch(/\.etf-list \.etf-side\.is-shut \{ position: sticky; top: 76px;/);
    expect(css).toMatch(/\.etf-list \.etf-showf span \{ writing-mode: vertical-rl;/);
    expect(page).toContain('{small && <button type="button" className={"btn etf-ftog"');
    expect(page).toContain('<aside className="etf-side is-shut" aria-label="Filters">');
  });
});
