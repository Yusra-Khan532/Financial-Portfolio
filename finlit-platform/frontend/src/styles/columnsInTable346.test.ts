// Task #346 (23 Nov 2026): "give column button inside the table": the Columns button sits in the scheme table's own top strip, beside the enlarge
// button, in every list (chosen categories, the ready list and, since task #375, the wishlist); no longer above the summary tiles.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(__dirname, "..", "pages", "Funds.tsx"), "utf8");
const css = readFileSync(join(__dirname, "mf341.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("Columns inside the table (task #346)", () => {
  it("once in each table card, nowhere else", () => {
    expect((page.match(/<ColumnPicker /g) || []).length).toBe(3);   // task #375: the Wishlist tab's table card has its own
    for (const m of page.matchAll(/<div className="card mf-tablecard">\s*<div className="mf-tbar">/g)) expect(m).toBeTruthy();
    expect((page.match(/<div className="card mf-tablecard">\s*<div className="mf-tbar">/g) || []).length).toBe(3);
    const bar = page.slice(page.indexOf('<div className="mf-bar" id="mf-list">'), page.indexOf("{wishing ? ("));   // task #375: the Wishlist branch now comes first
    expect(bar).not.toContain("ColumnPicker");
  });
  it("in the table's top strip, left of the enlarge button, above the table", () => {
    expect(css).toMatch(/\.mf-list \.mf-tbar \{ position: absolute; top: 8px; right: 58px; z-index: 10; \}/);
  });
});
