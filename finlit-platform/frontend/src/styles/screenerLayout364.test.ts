// Task #364 PR C: the Stock screener page: wider on big screens, the 3D section keeps its explanation readable, Score and Filters is a full-height drawer on a phone.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "task364c.css"), "utf8"), page = readFileSync(join(__dirname, "../pages/ScreenerPro.tsx"), "utf8");
describe("task #364 PR C: page layout and phone drawer", () => {
  it("uses up to 1600px on a wide screen", () => { expect(css).toContain("@media (min-width: 1281px) { .wrap.ssw { max-width: 1600px; } }"); });
  it("keeps the 3D explanation at least 300px wide, under the picture below 1100px", () => {
    expect(css).toContain(".wrap.ssw .scr-3d { grid-template-columns: minmax(0, 1fr) minmax(300px, 380px);");
    expect(css).toContain("@media (max-width: 1100px) { .wrap.ssw .scr-3d { grid-template-columns: minmax(0, 1fr); } }");
  });
  it("opens Score and Filters as a full-height drawer on a phone, with its header and Show button in view, and the page behind not scrolling", () => {
    expect(css).toMatch(/@media \(max-width: 720px\) \{\s*\.wrap\.ssw \.ssw-rules\.open \{ position: fixed; inset: 0; z-index: 70;/);
    expect(css).toContain(".wrap.ssw .ssw-rules.open .ssw-rdone { position: sticky; bottom: 0; z-index: 3; }");
    expect(page).toContain('window.matchMedia?.("(max-width: 720px)").matches');
    expect(page).toContain('import "../styles/task364c.css";');
  });
});
