// Task #348 (23 Nov 2026): the Mutual funds scheme table's figures and words centred (headings, figures, the band words under them), the Scheme
// column left; a clear line on the left of every column (the strong border colour). Only the list page (.mf-list).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "mf341.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("Mutual funds table centred, with column lines (task #348)", () => {
  it("headings (but the Scheme corner) and cells centred, including the stacked return and fund-size cells", () => {
    expect(css).toMatch(/\.mf-list \.mf-table thead th:not\(:first-child\), \.mf-list \.mf-table td, [^{]*\{ text-align: center; \}/);
    expect(css).toMatch(/\.mf-list \.mf-table td \.mf-rf, \.mf-list \.mf-table td \.mf-grf, \.mf-list \.mf-table td \.mf-aum \{ justify-items: center; \}/);
  });
  it("every column has a line on its left", () => {
    expect(css).toMatch(/\.mf-list \.mf-table thead th:not\(:first-child\), \.mf-list \.mf-table tbody td \{ border-left: 1px solid var\(--border-strong\); \}/);
  });
});
