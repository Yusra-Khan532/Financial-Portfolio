import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #80: the Compare page's range bars. A later `.strip { grid-column: 2 / -1 }` kept the bar in the last column only on a phone, squeezing the lowest, typical and highest labels
// together; and the sticky company strip was pinned 118px down, leaving a gap where rows scrolled visibly above it.
const css = readFileSync(join(process.cwd(), "src/styles/tools.css"), "utf8");

describe("Compare page range bars and company strip", () => {
  it("the range bar takes the whole row on a phone, after the rule that limits it to the last column", () => {
    const wide = css.lastIndexOf(".strip { height: 62px; margin: 8px 10px 0; grid-column: 2 / -1; }");
    const phone = css.search(/@media \(max-width: 900px\) \{ \.strip \{ grid-column: 1 \/ -1; \}/);
    expect(wide).toBeGreaterThan(-1);
    expect(phone).toBeGreaterThan(wide);
  });
  it("the sticky company strip sits just under the 62px site bar, not 118px down", () => {
    expect(css).toMatch(/\.cmpw \.mt-h, \.cmpw \.sp-h \{ top: 70px;/);
  });
});
