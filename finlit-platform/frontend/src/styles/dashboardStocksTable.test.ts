import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #107: the dashboard's "Your stocks today" table. Today (right-aligned) and FinLit IQ (left-aligned) ran into each other while Price sat far from the name: no column width or divider was set.
const css = readFileSync(join(process.cwd(), "src/styles/dashboard.css"), "utf8");
const block = css.slice(css.lastIndexOf("Your stocks today (task #107)"));

describe("dashboard stocks table", () => {
  it("gives the seven columns their own widths on a tablet and wider, with no gap that makes two columns run together", () => {
    expect(block).toMatch(/@media \(min-width: 760px\)/);
    const cols = /grid-template-columns: ([^;]+); gap: 0;/.exec(block)?.[1].match(/minmax\(/g) ?? [];
    expect(cols.length).toBe(7);
  });
  it("draws a line between columns and aligns numbers right and the score chip in the middle", () => {
    expect(block).toMatch(/border-left: 1px solid var\(--d-line3\)/);
    expect(block).toMatch(/\.dsh-st \.r \{ justify-content: flex-end;/);
    expect(block).toMatch(/\.dsh-st-x > \.sc \{ justify-content: center; \}/);
  });
  it("leaves the phone card layout alone", () => {
    expect(block).not.toMatch(/max-width/);
  });
});
