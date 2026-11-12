import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #110: the page-wide `:focus-visible` outline drew a rectangle round a slider whenever it was used. A slider shows its focus as a glow on the round thumb instead (still visible to a keyboard user).
const css = readFileSync(join(process.cwd(), "src/styles/site.css"), "utf8");

describe("range sliders", () => {
  it("have no box outline when focused", () => {
    expect(css).toMatch(/input\[type="range"\]:focus-visible \{ outline: none; \}/);
  });
  it("still show focus: a glow on the thumb in both engines", () => {
    expect(css).toMatch(/input\[type="range"\]:focus-visible::-webkit-slider-thumb \{ filter: drop-shadow/);
    expect(css).toMatch(/input\[type="range"\]:focus-visible::-moz-range-thumb \{ filter: drop-shadow/);
  });
});
