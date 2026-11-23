// Task #341 PR A (23 Nov 2026, the team: "at start make it 3x2 columns" + the Mutual Funds refinement prompt, sections 7-9): the six category cards in three
// columns and two rows on a desktop, equal heights; the heading card and the two tool cards on the prompt's type scale. Scoped to the Mutual funds page.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "mf341.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const page = readFileSync(join(__dirname, "..", "pages", "Funds.tsx"), "utf8");

describe("Mutual funds page, top (task #341 PR A)", () => {
  it("loads only on the Mutual funds page, after mf.css", () => {
    expect(page.indexOf('import "../styles/mf341.css"')).toBeGreaterThan(page.indexOf('import "../styles/mf.css"'));
  });
  it("six category cards: 3 x 2 on a desktop, 2 columns on a tablet, equal heights; phone unchanged", () => {
    expect(css).toMatch(/@media \(min-width: 1001px\) \{\s*\.mf \.mf-cards \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); grid-auto-rows: 1fr;/);
    expect(css).toMatch(/@media \(min-width: 761px\) and \(max-width: 1000px\) \{\s*\.mf \.mf-cards \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    expect(css).not.toMatch(/max-width: 760px/);
  });
  it("the site's type scale on the cards and the tool cards", () => {
    expect(css).toMatch(/\.mf \.mf-qcard b \{ font-size: var\(--fs-16\);/);   // the site's scale: the nearest step to the prompt's 15px
    expect(css).toMatch(/\.mf \.mf-qscore \.mf-qs-n \{ font-size: var\(--fs-24\); \}/);
    expect(css).toMatch(/\.mf \.mf-qdist \{ height: 6px; \}/);
    expect(css).toMatch(/\.mf \.evi-promo \{ padding: 14px 18px; min-height: 70px;/);
  });
});
