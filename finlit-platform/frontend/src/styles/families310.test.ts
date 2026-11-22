import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkText } from "../../scripts/check-ui.mjs";

// Task #310 part F (UI consistency pack, pages/01 to 08): each page family's corners, font sizes and weights come from the design
// tokens (01-design-rules.md): corners --ui-r-mark (4px, marks under 32px tall), --r-ctl (12px), --r-card (18px), --ui-r-pill;
// sizes var(--fs-12 ... 40) and --ui-fs-64; weights 400/500/600/700 only. One describe block per family locks its key rules.
const SRC = new URL("../", import.meta.url).pathname;
const read = (f: string) => readFileSync(join(SRC, f), "utf8");
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
/** hand-typed corners, sizes and off-rule weights left in a file (raw colours are counted by the baseline, not here) */
const shapeFindings = (f: string) =>
  (checkText(read(f), { css: f.endsWith(".css") }) as { line: number; rule: string; value: string }[])
    .filter((x) => x.rule !== "raw colour" && x.rule !== "chart colour on a control").map((x) => `${f}:${x.line} ${x.rule} ${x.value}`);
/** the declarations of every rule whose selector matches `sel` */
function rulesFor(css: string, sel: RegExp): string[] {
  const out: string[] = [];
  for (const m of noComments(css).matchAll(/([^{}]*)\{([^{}]*)\}/g)) if (sel.test(m[1])) out.push(m[1].trim() + " { " + m[2].trim() + " }");
  return out;
}
const NUMERIC_SHAPE = /(border(-[a-z]+)*-radius|font-size)\s*:\s*[\d.]+px|font-weight\s*:\s*(800|900|650|300)|font\s*:\s*(800|900|650|300)\s/;
export { shapeFindings, rulesFor, NUMERIC_SHAPE };

describe("shared sheets (task #310 F)", () => {
  it("the shared navigation and table pieces have no hand-typed corners, sizes or weights", () => {
    const files = ["styles/tabgroup.css", "styles/section-nav.css", "styles/tablesort.css", "styles/table-grid.css", "styles/theme.css", "styles/type227.css",
      "styles/update-banner.css", "styles/logo-loader.css", "styles/frozen.css", "styles/headerlinks.css"];
    expect(files.flatMap(shapeFindings)).toEqual([]);
  });

  it("the report's tab groups (ct-list) use the control corner and the shared card corner", () => {
    const tg = rulesFor(read("styles/tabgroup.css"), /\.ct-list button\b/);
    expect(tg.join("\n")).toMatch(/border-radius: var\(--r-ctl\)/);
    for (const r of tg) expect(r).not.toMatch(NUMERIC_SHAPE);
  });

  it("the site-wide card, table and chip rules in finlit.css carry no 800/900 weights or hand-typed font sizes", () => {
    const css = read("styles/finlit.css");
    for (const r of rulesFor(css, /(^|[\s,])\.(card|chip|tbl|seg|btn)\b/)) expect(r).not.toMatch(/font-weight\s*:\s*(800|900|650)|font-size\s*:\s*[\d.]+px/);
  });
});
