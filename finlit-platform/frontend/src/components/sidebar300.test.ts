// Task #300 (the team, 21 Nov 2026: "why are the i hidden for sub feature of a feature … when we hover over the subfeature then i is seen but i shall
// be present all the time"): every page row's i in the side menu shows at all times, and a page name breaks only between words (the picture showed
// "Superinves / tor portfolios" beside its New tag).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "styles", "sidebar.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("task #300: the side menu's i and page names", () => {
  it("never hides a row's i until hover", () => {
    expect(css).not.toMatch(/\.side-info\s*\{[^}]*opacity:\s*0\s*[;}]/);                 // no rule sets an i to fully transparent
    expect(css).toMatch(/\.side-info\s*\{[^}]*opacity:\s*\.75/);                           // shown at all times, brighter on hover
  });
  it("breaks a page name only between words, and lets a tag go under it", () => {
    expect(css).toMatch(/\.side-lt\s*\{\s*min-width:\s*auto;\s*overflow-wrap:\s*break-word;\s*\}/);
    expect(css).toMatch(/\.side-l\s*\{\s*flex-wrap:\s*wrap;/);
  });
});
