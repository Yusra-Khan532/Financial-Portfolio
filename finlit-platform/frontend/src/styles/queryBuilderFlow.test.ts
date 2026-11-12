import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #84: Rules for writing a query, then Start from an example, then Your query, with the same space between the three. The rules box carried a 16px bottom margin of its own
// (34px above the examples, 18px below them), and on a phone nine stacked example cards pushed the query box down a screen and a half.
const css = readFileSync(join(process.cwd(), "src/styles/qbuilder.css"), "utf8");
const page = readFileSync(join(process.cwd(), "src/pages/QueryBuilder.tsx"), "utf8");

describe("Query builder page flow", () => {
  it("is Rules, then examples, then Your query", () => {
    const r = page.indexOf("<QueryRules"), e = page.indexOf('className="qb-examples"'), q = page.indexOf('aria-label="Your query"');
    expect(r).toBeGreaterThan(-1);
    expect(e).toBeGreaterThan(r);
    expect(q).toBeGreaterThan(e);
  });
  it("the page gap is the only space between the sections (the rules box adds none)", () => {
    expect(css).toMatch(/\.qb > \.qr-box \{ margin-bottom: 0; \}/);
  });
  it("on a phone the example cards are one swipeable row, declared after the base card rule so it wins", () => {
    const base = css.indexOf(".qb-ex { display: grid;"), phone = css.lastIndexOf(".qb-ex { flex: 0 0 78%;");
    expect(base).toBeGreaterThan(-1);
    expect(phone).toBeGreaterThan(base);
    expect(css).toMatch(/\.qb-chips \{ flex-wrap: nowrap; overflow-x: auto;/);
  });
});
