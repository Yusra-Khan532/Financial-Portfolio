import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #100: `dn` is both the "down" colour class used on text across the site (a negative change) and the name of the donut layout in account.css. A bare `.dn { display: grid; ... }` turned every
// negative figure into a grid with a 170px column, so "6M -1.82%" broke onto a second line in the chart panel. The donut layout must name its element.
const css = readFileSync(join(process.cwd(), "src/styles/account.css"), "utf8");

describe("account.css and the dn class", () => {
  it("styles the donut layout only on div.dn, never on every .dn", () => {
    const selectors = css.split("}").flatMap((r) => (r.split("{")[0] ?? "").split(",")).map((x) => x.trim()).filter((x) => /(^|\s)\.dn(\s|$|:)/.test(x) && !/div\.dn/.test(x));
    expect(selectors.filter((x) => !/^@media/.test(x))).toEqual([]);
    expect(css).toMatch(/div\.dn \{ display: grid;/);
  });
});
