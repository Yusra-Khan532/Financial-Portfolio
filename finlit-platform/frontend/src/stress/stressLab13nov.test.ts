// Task #79, the team's 13 Nov fix list, SL-12: the four small fixes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "stresslab.css"), "utf8");
const js = readFileSync(join(__dirname, "stressLab.js"), "utf8");
const fb = readFileSync(join(__dirname, "..", "styles", "pagefeedback.css"), "utf8");
const dock = readFileSync(join(__dirname, "..", "components", "PageFeedback.tsx"), "utf8");

describe("Stress Lab SL-12 (13 Nov)", () => {
  it("a. the i button is never turned into a capital I by an upper-case label", () => {
    expect(css).toMatch(/\.ib\{text-transform:none;/);
    expect(css).toMatch(/\.ibi\{text-transform:none;/);
  });
  it("b. text boxes are 16 px on phones", () => {
    expect(css).toMatch(/@media \(max-width:760px\)\{\.sl-root input,\.sl-root select,\.sl-root textarea\{font-size:var\(--fs-16\)\}\}/);
  });
  it("c. Share feedback never sits over what is being read (task #310 part D: the floating dock is gone; it is a menu action)", () => {
    expect(fb).not.toMatch(/\.pf-dock|\.pf-fab/);
    expect(dock).not.toMatch(/pf-dock/);
    expect(dock).toMatch(/export function HelpActions/);
    expect(dock).toContain("Share feedback");
  });
  it("d. Compare two: 'about the same' only under half a point, otherwise the bigger hit is named (the team's wording)", () => {
    expect(js).toContain("if (Math.abs(ea - eb) < 0.5) return 'Both are affected about the same: EPS '");
    expect(js).toContain("' takes the bigger hit: EPS ' + pct(lo[2]) + ', against ' + pct(hi[2]) + ' for ' + short(hi[1]) + '.'");
    expect(js).not.toContain("about equally: EPS");
  });
});
