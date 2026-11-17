import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #200: the landing page's tool-group chips (All groups, Discover 07, Company 360 05, ...) were allowed to shrink below their content, so each count was
// pressed into the chip's right edge (0-3px) at full width and spilled past it on smaller screens, and "Follow the market" was clipped.
const css = readFileSync(join(process.cwd(), "src/styles/explore-tools.css"), "utf8");
const tsx = readFileSync(join(process.cwd(), "src/components/ExploreTools.tsx"), "utf8");
const rule = (sel: string) => (new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " \\{([^}]*)\\}").exec(css) ?? [])[1] ?? "";

describe("tool-group chips (task #200)", () => {
  it("a chip never shrinks below its content and keeps its right padding clear of the count", () => {
    expect(rule(".fl-gchip")).toMatch(/flex: 1 0 auto;/);
    expect(rule(".fl-gchip")).toMatch(/min-width: max-content;/);
    expect(rule(".fl-gchip")).toMatch(/padding: 6px 12px 6px 6px;/);
    expect(rule(".fl-gchip")).not.toMatch(/min-width: 0;/);
  });
  it("when they do not fit, the strip scrolls sideways with a fade on the side that has more", () => {
    expect(rule(".fl-gchips")).toMatch(/overflow-x: auto;/);
    expect(css).toMatch(/\.fl-gchips\[data-more-r\] \{ mask-image/);
    expect(tsx).toMatch(/data-more-l=\{more\.l \|\| undefined\} data-more-r=\{more\.r \|\| undefined\}/);
  });
  it("All groups is short on screen and keeps its full name for screen readers", () => {
    expect(tsx).toMatch(/className="fl-gall" aria-label="All groups" onClick=\{\(\) => show\("dir"\)\}><Icon name="grid" \/><span>All<\/span>/);
  });
});
