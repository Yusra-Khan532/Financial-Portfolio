// Task #316 rework (Pranjal, 22 Nov screenshot of the Commodities tile): on the dashboard's Global markets card the Commodities and Currency tiles showed their name
// only, top-left in an empty box, and the last tile's "two places" (meant for the expanded view) pushed it onto a row of its own. The figures show, no tile is
// left on a row of its own, and in a half-width cell the five tiles sit in two full rows.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "dash316.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
/** Every declaration block written for exactly this selector, joined. */
const rule = (sel: string) => { let out = "", i = css.indexOf(sel + " {"); expect(i, sel).toBeGreaterThan(-1); while (i > -1) { out += css.slice(i, css.indexOf("}", i)); i = css.indexOf(sel + " {", i + 1); } return out; };

describe("Global markets tiles on the dashboard (task #316 rework)", () => {
  it("the Commodities and Currency tiles show their figures", () => {
    expect(css).not.toMatch(/\.dx-card-gm \.gm-rg \.gm-ri \{ display: none/);
    expect(rule(".dsh .dx-card-gm .gm-rg .gm-ri")).toMatch(/display: grid/);
  });
  it("no tile takes two places on the page, so none sits on a row of its own; content is centred", () => {
    expect(rule(".dsh .dx-card-gm .gm-rg:last-child")).toMatch(/grid-column: auto/);
    expect(rule(".dsh .dx-card-gm .gm-rg")).toMatch(/align-content: center/);
  });
  it("in a half-width cell: three index tiles, then the two wider tiles (6 columns: 2+2+2, 3+3)", () => {
    expect(rule(".dsh .dsh-cell.half .dx-card-gm .gm-regions")).toMatch(/repeat\(6, minmax\(0, 1fr\)\)/);
    expect(rule(".dsh .dsh-cell.half .dx-card-gm .gm-rg")).toMatch(/span 2/);
    expect(css).toMatch(/\[data-group="Commodities"\], \.dsh \.dsh-cell\.half \.dx-card-gm \.gm-rg\[data-group="Currency and yields"\] \{ grid-column: span 3; \}/);
  });
});
