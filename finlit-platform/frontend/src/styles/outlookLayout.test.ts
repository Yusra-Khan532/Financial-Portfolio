import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/styles/outlook.css"), "utf8");

describe("outlook layout with Set your own model", () => {
  it("is a two-column grid on its own (the site's .side class, which is sticky and height-limited, must not be on it), charts left and sliders right", () => {
    expect(css).toMatch(/\.ol-top\.ol-split \{ display: grid; grid-template-columns: minmax\(0, 1\.6fr\) minmax\(300px, 1fr\)/);
    expect(css).toMatch(/\.ol-top\.ol-split > \.ol-assume \{ grid-column: 2; grid-row: 1; position: sticky/);
    expect(css).toMatch(/\.ol-top\.ol-split > \.ol-charts \{ grid-column: 1; grid-row: 1; \}/);
  });
  it("puts the two charts one above the other in that column, and keeps the sliders in view while the charts scroll", () => {
    expect(css).toMatch(/\.ol-top\.ol-split > \.ol-charts \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });
  it("never uses the site's sidebar class (.side): it made the whole top section sticky, height-limited and clipped, so the tables slid over the charts (task #99)", () => {
    expect(css).not.toMatch(/\.ol-top\.side/);
    expect(readFileSync(join(process.cwd(), "src/pages/Outlook.tsx"), "utf8")).not.toMatch(/ol-top[^\n]*" side"/);
  });
});
