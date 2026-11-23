// Task #340 (23 Nov 2026, the team, Mutual funds page): "there is no way to deselect these once selected so on click it shall be deselected and also we
// have wording overlap issue in the box selected". Pressing the chosen card clears the choice; the chosen card's count no longer slides onto its title.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CARDS } from "../lib/mfCategories";
import { cardOn } from "./Dashboard";

const css = readFileSync(join(__dirname, "..", "styles", "mf.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const funds = readFileSync(join(__dirname, "..", "pages", "Funds.tsx"), "utf8");

describe("Six category cards (task #340)", () => {
  const c = CARDS[2];
  it("a card is on only while its category is shown on its own", () => {
    expect(cardOn({ tab: c.tab, cats: [c.key] } as never, c)).toBe(true);
    expect(cardOn({ tab: c.tab, cats: null } as never, c)).toBe(false);
    expect(cardOn({ tab: c.tab, cats: [c.key, "x"] } as never, c)).toBe(false);
  });
  it("pressing the chosen card again clears it (every category of its tab); another card picks that one", () => {
    expect(funds).toContain('set(cardOn(q, c) ? { cats: null, view: "" } : { tab: c.tab, cats: [c.key], view: "" })');
  });
  it("the chosen card keeps its count in place (no slide onto the title) and shows its tick in the lower right corner", () => {
    expect(css).toMatch(/\.mf-qcard\[aria-pressed="true"\]::after \{ top: auto; bottom: 10px; right: 12px; \}/);
    expect(css).toMatch(/\.mf-qcard \.mf-qcount, \.mf-qcard\[aria-pressed="true"\] \.mf-qcount \{ position: static; grid-column: 3; grid-row: 1;/);   // its own column beside the title
    expect(css).toMatch(/\.mf-qcard:has\(\.mf-qcount\) b \{ grid-column: 2; grid-row: 1; padding-right: 0; \}/);
    expect(css).not.toMatch(/\.mf-qcard\[aria-pressed="true"\] \.mf-qcount \{ right: 40px; \}/);
  });
});
