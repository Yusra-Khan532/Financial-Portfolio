// Task #357 (team, 23 Nov 2026): on the Mutual Fund Screener, hiding the filters lets the table take the width (no reserved column, which #350 had)
// and leaves a slim vertical "Show filters" button on the left, the same as on the Mutual funds page (#355).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "../../styles/task357.css"), "utf8");
const page = readFileSync(join(__dirname, "../../pages/MfScreener.tsx"), "utf8");
describe("task #357: hidden filters on the screener", () => {
  it("the table takes the width: a 44px column for the button, no placeholder for the divider", () => {
    expect(css).toMatch(/\.mfs-page \.mfs-layout\.is-shut \{ grid-template-columns: 44px minmax\(0, 1fr\); gap: 16px; \}/);
    expect(page).toContain("{!small && !shut && <SplitDivider");
    expect(page).not.toContain("mfs-split-ph");
  });
  it("Show filters is vertical, 44px, centred, with the Hide filters outline", () => {
    expect(css).toMatch(/\.mfs-page \.mfs-showf \{ flex-direction: column; justify-content: center; gap: 12px; width: 44px; min-height: 196px; padding: 14px 0; border: 2px solid color-mix\(in srgb, var\(--text\) 70%, transparent\);/);
    expect(css).toMatch(/\.mfs-page \.mfs-showf span \{ writing-mode: vertical-rl; transform: rotate\(180deg\);/);
  });
});
