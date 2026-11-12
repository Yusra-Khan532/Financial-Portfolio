import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #86: in the Sector Pulse table the Cycle state badge ("Bouncing back after a crash") and the Last bounce text were wider than their fixed columns (108px, 120px) and ran over the
// bars and the flags column. The columns are wider and both wrap inside their own column.
const css = readFileSync(join(process.cwd(), "src/styles/sectors.css"), "utf8");
const width = (col: string) => Number(new RegExp(`\\.sx-pulse col\\.${col} \\{ width: (\\d+)px; \\}`).exec(css)?.[1]);

describe("Sector Pulse table columns", () => {
  it("gives the state badge and the last-bounce text room, and the table's minimum width covers every column", () => {
    expect(width("c-state")).toBeGreaterThanOrEqual(150);
    expect(width("c-thr")).toBeGreaterThanOrEqual(140);
    const sum = ["c-name", "c-state", "c-bars", "c-idx", "c-thr", "c-flag", "c-cor", "c-rk"].reduce((a, c) => a + width(c), 0);
    const min = Number(/\.sx-t\.sx-pulse \{ table-layout: fixed; width: 100%; min-width: (\d+)px; \}/.exec(css)?.[1]);
    expect(min).toBeGreaterThanOrEqual(sum);
  });
  it("lets the badge and the bounce text wrap instead of overflowing", () => {
    expect(css).toMatch(/\.sx-pulse td \.sx-chip \{[^}]*white-space: normal;/);
    expect(css).toMatch(/\.sx-pulse td \.sx-thr b, \.sx-pulse td \.sx-thr small \{ white-space: normal;/);
  });
});
