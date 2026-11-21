// Task #263 (20 Nov 2026, the team: "ui issue in this box", the Advanced screener's filter bar): the search box was cut to "Search company name or sy",
// floated between two lines of filters and was taller than them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/styles/hf.css"), "utf8");
const fgx = readFileSync(join(process.cwd(), "src/styles/fgx.css"), "utf8");
const frame = readFileSync(join(process.cwd(), "src/components/screener/ScreenerFrame.tsx"), "utf8");

describe("the screeners' filter bar (task #263)", () => {
  it("the search box stays level with the first line of filters and is their height", () => {
    expect(css).toMatch(/\.hf-tool \{ flex-wrap: nowrap; align-items: flex-start; \}/);
    expect(fgx).toMatch(/\.hf-tool > \.fgx-find \{ height: 40px; \}/);
  });
  it("the search box never narrows below its placeholder, and the placeholder is short enough to show whole", () => {
    expect(css).toMatch(/\.hf-tool > :first-child \{ flex: 0 1 280px; min-width: 220px; \}/);
    expect(frame).toContain('placeholder="Company name or symbol" label="Search company name or symbol"');
  });
});
