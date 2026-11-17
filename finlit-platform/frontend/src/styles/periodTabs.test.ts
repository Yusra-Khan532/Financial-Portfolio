import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./stock2.css", import.meta.url), "utf8");

// Task #216 (company report handover, 17 Nov 2026, README 1.5; owner: "no navy, no gold"): the period toggle has the report's one toggle look.
describe("period tabs (Quarterly / Yearly)", () => {
  it("the selected tab is the --s3 fill with the text colour, not dark gold with dark text", () => {
    expect(css).toMatch(/\.seg\.seg-period button\[aria-pressed="true"\]\s*\{[^}]*background:\s*var\(--s3\)/);
    expect(css).not.toMatch(/\.seg\.seg-period button\[aria-pressed="true"\]\s*\{[^}]*var\(--gold\)/);
  });
  it("buttons are 33 px tall, 13 px semi-bold, 6 x 12 px padding, in a 1 px frame; 40 px on touch screens so they stay easy to tap", () => {
    expect(css).toMatch(/\.seg\.seg-period button\s*\{[^}]*min-height:\s*33px[^}]*padding:\s*6px 12px[^}]*font-weight:\s*600/);
    expect(css).toMatch(/\.seg\.seg-period\s*\{[^}]*border:\s*1px solid var\(--border-strong\)/);
    expect(css).toMatch(/@media \(pointer: coarse\)\s*\{\s*\.seg\.seg-period button\s*\{\s*min-height:\s*40px/);
  });
});
