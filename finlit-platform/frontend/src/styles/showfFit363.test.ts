// Task #363 (Chinmay, 24 Nov 2026): the folded "Show filters" buttons fit their icon and words, with no empty space above or below.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "task363.css"), "utf8");
const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("task #363: Show filters fits its words", () => {
  it("drops the fixed 196px height on Mutual funds (desktop), the screener and ETFs", () => {
    expect(css).toMatch(/@media \(min-width: 1101px\) \{\s*\.mf-list \.mf-layout \.mf-showf \{ min-height: 0; padding: 12px 0; gap: 8px; \}/);
    expect(css).toContain(".mfs-page .mfs-side .mfs-showf { min-height: 0; padding: 12px 0; gap: 8px; }");
    expect(css).toContain(".etf-list .etf-side .etf-showf { min-height: 0; padding: 12px 0; gap: 8px; }");
  });
  it("each page loads it", () => {
    for (const f of ["pages/Funds.tsx", "pages/MfScreener.tsx", "etf/List.tsx"]) expect(src(f)).toContain('import "../styles/task363.css";');
  });
});
