// Task #347 (23 Nov 2026): the categories and filters as one filter panel on the left of the table, with a search box at the top; "Hide filters" folds
// it to a "Show filters" handle in the same place (never on the table); the fund types as sections; the choice remembered in this browser.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(__dirname, "..", "pages", "Funds.tsx"), "utf8");
const dash = readFileSync(join(__dirname, "..", "mf", "Dashboard.tsx"), "utf8");
const css = readFileSync(join(__dirname, "mf341.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("Mutual funds filter panel (task #347)", () => {
  it("the panel comes before the list in one split; search, the categories as sections, then the other filters", () => {
    const side = page.indexOf('<aside className="mf-side"'), main = page.indexOf('<div className="mf-main">');
    expect(side).toBeGreaterThan(0); expect(main).toBeGreaterThan(side);
    const panel = page.slice(side, main);
    const a = panel.indexOf('<Controls part="search"'), b = panel.indexOf("<CategoryPicker side"), c = panel.indexOf('<Controls part="rest"');
    expect(a).toBeGreaterThan(0); expect(b).toBeGreaterThan(a); expect(c).toBeGreaterThan(b);
    expect(page.slice(main)).not.toMatch(/Show filters|<CategoryPicker|<Controls /);   // nothing of the panel inside the list or on the table
  });
  it("Hide filters folds it to a Show filters handle in the same place; remembered in this browser", () => {
    expect(page).toContain('onClick={() => setF(false)}>Hide filters</button>');
    expect(page).toMatch(/className="mf-showf"[^>]*onClick=\{\(\) => setF\(true\)\}><Icon name="panel" \/><span>Show filters<\/span>/);
    expect(page).toContain('v = localStorage.getItem("finlit-mf-filters")');
    expect(page).toContain('return v ? v !== "closed" : !(typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px)").matches);');   // nothing saved: open on a desktop, folded on a phone
    expect(css).toMatch(/\.mf-list \.mf-layout\.closed \{ grid-template-columns: 44px minmax\(0, 1fr\); \}/);
  });
  it("the fund types as sections; the open one is the type shown", () => {
    expect(dash).toContain('<section className="mf-catpick mf-catside" aria-label="Choose categories">');
    expect(dash).toMatch(/aria-expanded=\{open\}[^>]*onClick=\{\(\) => \{ if \(!open\) onTab\(t\.key\); \}\}/);
  });
});
