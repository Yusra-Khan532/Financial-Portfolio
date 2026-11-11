import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./stock2.css", import.meta.url), "utf8");

describe("period tabs (Quarterly / Yearly)", () => {
  it("selected tab uses the gold fill with the same specificity as the generic .seg rule", () => {
    expect(css).toMatch(/\.seg\.seg-period button\[aria-pressed="true"\]\s*\{[^}]*background:\s*var\(--gold\)/);
  });
  it("tabs are large enough to tap", () => {
    expect(css).toMatch(/\.seg\.seg-period button\s*\{[^}]*min-height:\s*40px/);
  });
});
