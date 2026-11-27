// Task #336 (23 Nov 2026): "the annotation pencil overcomes the filter box and hides the done button". The chart's draw layer (pencil z 6, its menu up to z 8)
// comes later on the page than the company picker, so at equal z-index it painted over the picker's open Filters panel. While the panel or the suggestion list
// is open the picker is lifted above every draw-layer piece, and stays under the site header.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(__dirname, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const z = (css: string, sel: string) => { const i = css.indexOf(sel + " {"); expect(i, sel).toBeGreaterThan(-1); return +(/z-index:\s*(\d+)/.exec(css.slice(i, css.indexOf("}", i)))?.[1] ?? NaN); };

describe("company picker above the chart's pencil (task #336)", () => {
  const adv = read("advcharts.css"), dl = read("drawlayer.css"), site = read("finlit.css");
  it("lifts the picker while its Filters panel or list is open", () => {
    expect(adv).toMatch(/\.adv-combo:has\(\.sf-panel, ul\)\s*\{[^}]*z-index:\s*20/);
    expect(adv).toMatch(/\.adv-combo\s*\{[^}]*position:\s*relative/);
  });
  it("sits above every draw-layer piece and below the header", () => {
    const lifted = 20;
    for (const s of [".dl-svg", ".dl-bar", ".dl-text", ".dlm"]) expect(z(dl, s), s).toBeLessThan(lifted);
    expect(z(site, ".top")).toBeGreaterThan(lifted);
  });
});
