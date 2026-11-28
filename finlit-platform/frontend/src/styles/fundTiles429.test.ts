// Task #429 (team, 27 Nov 2026: "give all the boxes same colour as the first box"): the six summary tiles above the Mutual funds table all take the
// first tile's (Schemes) surface and edge; no tile keeps its own colour, and the rule is tokens only so light and dark follow.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "mf341.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const tsx = readFileSync(join(__dirname, "..", "mf", "Summary.tsx"), "utf8");

describe("Mutual funds summary tiles (task #429)", () => {
  it("every tile has the first tile's raised surface and firmer edge", () => {
    expect(css).toMatch(/\.mf-list \.mf-sum > \.mf-sc \{ background: var\(--s2\); border-color: var\(--border-strong\); \}/);
  });
  it("no tile is set apart any more (the first-child rule is gone)", () => {
    expect(css).not.toMatch(/\.mf-sc:first-child/);
  });
  it("the tinted classes are overridden on the list page, so none shows its own colour", () => {
    for (const t of ["t-blue", "t-green", "t-amber", "t-teal", "t-grey"]) expect(css).toContain(`.mf-list .mf-sc.${t}`);
    // task #468: the six figures are now cells of one Fund Market Overview panel, all on the same surface (one class, no tint classes at all)
    expect(tsx).toContain('className="mf-ov468-cell"');
    expect(tsx).not.toMatch(/\bt-(blue|green|amber|teal|grey)\b/);
  });
});
