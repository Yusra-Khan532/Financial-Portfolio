// Task #364 PR B: the Stock screener table: figures centred, a line between columns, wrapped headers, hover and selected rows.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "task364b.css"), "utf8");
describe("task #364 PR B: the results table", () => {
  it("centres every figure, keeps the company left, draws column lines", () => {
    expect(css).toContain(".wrap.ssw .ssw-t.scr-t th:not(.stick), .wrap.ssw .ssw-t.scr-t td:not(.stick) { text-align: center; }");
    expect(css).toContain(".wrap.ssw .ssw-t.scr-t th + th, .wrap.ssw .ssw-t.scr-t td + td { border-left: 1px solid var(--border); }");
  });
  it("wraps long headers with a floor on width, and marks the selected row", () => {
    expect(css).toMatch(/th:not\(\.stick\):not\(\.ssw-rep\) \{ min-width: 92px; \}/);
    expect(css).toMatch(/tr\.cp-row td\.stick \{ box-shadow: inset 3px 0 0 var\(--gain\); \}/);
  });
  it("is loaded by the screener", () => {
    expect(readFileSync(join(__dirname, "../pages/ScreenerPro.tsx"), "utf8")).toContain('import "../styles/task364b.css";');
  });
});
