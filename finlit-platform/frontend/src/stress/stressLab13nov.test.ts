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
    expect(css).toMatch(/@media \(max-width:760px\)\{\.sl-root input,\.sl-root select,\.sl-root textarea\{font-size:16px\}\}/);
  });
  it("c. on a phone Share feedback is a small round icon that steps aside while the page scrolls down", () => {
    expect(fb).toMatch(/\.pf-fab span \{ display: none; \} \.pf-fab \{ width: 44px; padding: 0; justify-content: center; \}/);
    expect(fb).toMatch(/\.pf-dock\[data-away\] \{ transform: translateY\(calc\(100% \+ 110px\)\); opacity: 0; pointer-events: none; \}/);
    expect(dock).toMatch(/data-away=\{away \|\| undefined\}/);
    expect(dock).toMatch(/aria-label="Share feedback"/);                  // the icon keeps its name for screen readers
  });
  it("d. Compare two: 'about the same' only under half a point, otherwise the bigger hit is named (the team's wording)", () => {
    expect(js).toContain("if (Math.abs(ea - eb) < 0.5) return 'Both are affected about the same: EPS '");
    expect(js).toContain("' takes the bigger hit: EPS ' + pct(lo[2]) + ', against ' + pct(hi[2]) + ' for ' + short(hi[1]) + '.'");
    expect(js).not.toContain("about equally: EPS");
  });
});
