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
  it("task #344: the six category cards are gone from the page (now Frequently visited funds in the category box)", () => {
    expect(css).not.toMatch(/\.mf-cards \{/);
    expect(css).toMatch(/\.mf-list \.mf-freq-row \{ display: flex; flex-wrap: wrap;/);
  });
  it("the site's type scale on the cards and the tool cards", () => {
    expect(css).toMatch(/\.mf-list \.evi-promo \{ padding: 14px 18px; min-height: 70px;/);
  });
});
