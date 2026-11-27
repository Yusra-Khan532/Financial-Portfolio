import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #184 rework: the "Your assumptions" card on Reverse valuation stuck at 90px (under the 64px header + section bar, so it slid behind the bar),
// and as a sticky grid item it was held by the whole grid, so it rode over the full-width cards below its three rows and could be taller than the screen.
const page = readFileSync(join(process.cwd(), "src/pages/ReverseValuation.tsx"), "utf8");
const rv = readFileSync(join(process.cwd(), "src/styles/reverse.css"), "utf8");
const ol = readFileSync(join(process.cwd(), "src/styles/outlook.css"), "utf8");

describe("Reverse valuation: Your assumptions card (task #184)", () => {
  it("sits inside its own column, so it stops where its three rows end", () => {
    expect(page).toMatch(/<div className="rv-as-col">[\s\S]*?<section className="card rv-as"/);
    expect(rv).toMatch(/\.rv-as-col \{ grid-row: span 3; align-self: stretch;/);
    expect(rv).not.toMatch(/\.rv-as \{[^}]*grid-row: span 3/);
  });
  it("sticks below the header and the section bar, never behind them, and scrolls inside when taller than the screen", () => {
    expect(rv).toMatch(/--rv-stick: calc\(64px \+ var\(--rv-sn-h, 56px\) \+ 12px\)/);
    expect(rv).toMatch(/\.rv-as \{ position: sticky; top: var\(--rv-stick\); max-height: calc\(100vh - var\(--rv-stick\) - 16px\); overflow-y: auto;/);
  });
  it("is a plain card on narrow screens", () => {
    expect(rv).toMatch(/\.rv-as-col \{ grid-row: auto; \} \.rv-as \{ position: static; max-height: none; overflow: visible; \}/);
  });
});

describe("Outlook: assumptions panel never taller than the screen (task #184)", () => {
  it("scrolls inside on wide screens and is plain on narrow ones", () => {
    expect(ol).toMatch(/\.ol-top\.ol-split > \.ol-assume \{[^}]*max-height: calc\(100vh - 106px\); overflow-y: auto;/);
    expect(ol).toMatch(/max-height: none; overflow: visible;/);
  });
});
