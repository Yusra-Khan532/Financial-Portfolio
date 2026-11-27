// Task #343 (23 Nov 2026): on the Mutual funds page the chosen part of a switch (Chosen categories / Ready list, Plan, Option) fills its box edge to
// edge, with no gap of track around it. Only this page (.mf-list); other pages keep the shared switch.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "mf341.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("Mutual funds switches fill edge to edge (task #343)", () => {
  it("no track padding, square inner buttons clipped by the box's rounded corners", () => {
    expect(css).toMatch(/\.mf-list \.seg \{ padding: 0; gap: 0; overflow: hidden; align-items: stretch; \}/);
    expect(css).toMatch(/\.mf-list \.seg button \{ border-radius: 0; min-height: 36px;/);
  });
});
