import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Task #456 (28 Nov 2026): ticking a sub-category left a gold ring round the clicked row, and the scrolling
// list cut the ring off at its top edge. The ring is now for keyboard focus only and drawn inside the row.
const css = readFileSync(new URL("./fgx.css", import.meta.url), "utf8");

describe("filter list rows (#456)", () => {
  it("no longer rings a row just because a mouse click focused its checkbox", () => {
    expect(css).not.toMatch(/\.fgx-row:focus-within/);
  });
  it("rings a row on keyboard focus, inside the row so overflow never clips it", () => {
    const rule = css.match(/\.fgx-row:has\(input:focus-visible\)\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/outline:\s*2px solid var\(--gold\)/);
    expect(rule![1]).toMatch(/outline-offset:\s*-2px/);
  });
});
