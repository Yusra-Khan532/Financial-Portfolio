import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// "Your stocks today" as the final pages pack draws it (04), keeping task #107's point: every column has its own width and a gap, so no two columns run together.
const css = readFileSync(join(process.cwd(), "src/styles/dashboard.css"), "utf8");
const block = css.slice(css.lastIndexOf("Your stocks today as the final pages pack draws it"));
const wide = block.slice(0, block.indexOf("\n}\n"));

describe("dashboard stocks table", () => {
  it("gives the nine columns their own widths on a tablet and wider, with a gap between them", () => {
    expect(wide).toMatch(/@media \(min-width: 760px\)/);
    const m = /grid-template-columns: ([^;]+); gap: 0 10px;/.exec(wide);
    expect(m?.[1].match(/minmax\(/g)?.length).toBe(9);
  });
  it("has the pack's tinted header row and right-aligned numbers, with no lines between columns", () => {
    expect(wide).toMatch(/\.dsh-st-h \{[^}]*background: var\(--d-tile\)/);
    expect(wide).toMatch(/\.dsh-st \.r \{ text-align: right; \}/);
    expect(wide).not.toMatch(/border-left/);
  });
});
