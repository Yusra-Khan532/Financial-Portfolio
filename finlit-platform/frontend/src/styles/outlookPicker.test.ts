import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #109: on the company picker (Outlook, Stress Lab) the Quick picks and Last searched headings are bolder, and each heading sits above its chips, not beside them.
const css = readFileSync(join(process.cwd(), "src/styles/outlook.css"), "utf8");

describe("company picker rows", () => {
  it("stacks the heading above its chips", () => {
    expect(css).toMatch(/\.olp-row \{ display: grid; gap: 8px;/);
    expect(css).not.toMatch(/\.olp-row \{ display: flex;/);
  });
  it("sets the headings in bold, in the main text colour", () => {
    expect(css).toMatch(/\.olp-l \{ font: 700 13px var\(--sans\);[^}]*color: var\(--text\);/);
  });
});
