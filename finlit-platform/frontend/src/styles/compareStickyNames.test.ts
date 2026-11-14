import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Task #81: the company-name row of every Compare tab sticks flush under the site bar, is ringed in the card's colour (no table row shows above or behind it),
// and is shown on phones too (it was hidden below 900 px, so the columns had no names).
const css = readFileSync(new URL("./tools.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const tsx = readFileSync(new URL("../pages/Compare.tsx", import.meta.url), "utf8");
describe("Compare: the sticky company-name row", () => {
  it("sticks at the measured bar height with a solid ring", () => {
    expect(css).toMatch(/\.cmpw \.mt-h, \.cmpw \.sp-h \{ top: var\(--cmp-top, 62px\); box-shadow: 0 0 0 8px var\(--s1\)/);
    expect(tsx).toContain('w.style.setProperty("--cmp-top"');
  });
  it("is shown on a phone (no empty first column)", () => {
    const phone = css.slice(css.lastIndexOf("@media (max-width: 900px) {"));
    expect(phone).toMatch(/\.cmpw \.mt-h \{ display: grid;/);
    expect(phone).toMatch(/\.cmpw \.mt-h > span:first-child \{ display: none; \}/);
  });
});
