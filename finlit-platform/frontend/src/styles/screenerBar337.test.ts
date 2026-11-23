// Task #337 (23 Nov 2026, the team's screenshot of the Advanced screener: "we see the issue of the box"): the sticky filter bar was a flat page-coloured
// band with square corners, and when the filters wrapped an empty dark block sat under the search box. The bar is a card, and the filter group moves
// whole to the line below the search box when it does not fit beside it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "hf.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (sel: string) => { const i = css.indexOf(sel + " {"); expect(i, sel).toBeGreaterThan(-1); return css.slice(i, css.indexOf("}", i)); };

describe("Advanced screener filter bar (task #337)", () => {
  it("is a card: card surface, hairline edge, rounded corners, inner padding", () => {
    const r = rule(".sx-root .sx-stick.hf-bar");
    expect(r).toMatch(/background:\s*var\(--s1\)/); expect(r).toMatch(/border:\s*1px solid var\(--border\)/);
    expect(r).toMatch(/border-radius:\s*var\(--r-card\)/); expect(r).toMatch(/padding:\s*8px 10px/);
  });
  it("wraps the whole filter group under a full-width search box, never leaving space under the search", () => {
    expect(rule(".sx-root .hf-bar .hf-tool")).toMatch(/flex-wrap:\s*wrap/);
    expect(rule(".sx-root .hf-bar .hf-tool > :first-child")).toMatch(/flex:\s*1 1 220px;\s*min-width:\s*220px/);
    expect(rule(".sx-root .hf-bar .hf-tool > .afx")).toMatch(/flex:\s*0 1 auto/);
  });
});
