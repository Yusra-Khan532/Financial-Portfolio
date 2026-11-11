import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./stock2.css", import.meta.url), "utf8");

describe("latest quarter highlight (task #57)", () => {
  it("Net profit row (which is also a .sub row) wins over the generic .qtt tr.sub td rule", () => {
    expect(css).toMatch(/\.qtt tr\.sub\.hl td\b[^{]*\{[^}]*background:/);
    expect(css).toMatch(/\.qtt tr\.sub\.hl td:first-child[^{]*\{[^}]*border-left:\s*4px/);
  });
});
