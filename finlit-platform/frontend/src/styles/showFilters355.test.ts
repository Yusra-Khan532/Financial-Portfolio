// Task #355 (team, 23 Nov 2026): "align the show filters, feels pretty bad". The folded handle on the Mutual funds page: button corners (not a 18px
// bubble), the icon and the words centred together (they sat 25px above centre), the 2px outline of Hide filters (#354), level with the tabs, in view
// while the table is scrolled; a full-width row under 1100px as before.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "mf341.css"), "utf8");
describe("task #355: the folded Show filters handle", () => {
  it("is a centred slim button with the Hide filters outline", () => {
    expect(css).toMatch(/\.mf-list \.mf-showf \{ justify-content: center; gap: 12px; min-height: 196px; padding: 14px 0; border: 2px solid color-mix\(in srgb, var\(--text\) 70%, transparent\); border-radius: var\(--r-ctl\);/);
  });
  it("stays in view while scrolling on a wide screen, and is a normal row under 1100px", () => {
    expect(css).toMatch(/\.mf-list \.mf-layout\.closed \.mf-side \{ position: sticky; top: 76px; \}/);
    expect(css).toMatch(/@media \(max-width: 1100px\) \{ \.mf-list \.mf-layout\.closed \.mf-side \{ position: static; \} \.mf-list \.mf-showf \{ min-height: 44px; padding: 0 14px; \} \}/);
  });
});
