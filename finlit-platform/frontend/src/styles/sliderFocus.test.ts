import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #110: a box appeared round a slider while it was dragged. The first fix removed only the page-wide outline; the dark theme's gold ring on
// input:focus and the :focus-visible halos still drew a box. A slider is now excluded from every focus box at once and shows focus as a glow on its thumb.
const dir = join(process.cwd(), "src/styles");
const site = readFileSync(join(dir, "site.css"), "utf8");
const theme = readFileSync(join(dir, "theme.css"), "utf8");

describe("range sliders", () => {
  it("never get a focus box (outline or ring), with the mouse or the keyboard", () => {
    expect(site).toMatch(/input\[type="range"\]:focus, input\[type="range"\]:focus-visible \{ outline: none !important; box-shadow: none !important; \}/);
  });
  it("still show focus: a glow on the thumb in both engines", () => {
    expect(site).toMatch(/input\[type="range"\]:focus-visible::-webkit-slider-thumb \{ filter: drop-shadow/);
    expect(site).toMatch(/input\[type="range"\]:focus-visible::-moz-range-thumb \{ filter: drop-shadow/);
  });
  it("are left out of the dark theme's input focus ring and the form/modal focus ring", () => {
    expect(theme).toMatch(/input:not\(\[type="range"\]\):focus/);
    expect(theme).not.toMatch(/\) input:focus[ ,{]/);
    expect(site).toMatch(/\.form input:not\(\[type="range"\]\):focus/);
    expect(site).toMatch(/\.modal input:not\(\[type="range"\]\):focus/);
  });
});
