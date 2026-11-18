// Task #222 (owner, 18 Nov: "in 09 swap 1st and 3rd tabs - bring ratio history to the front"): section 09 opens on Ratio history; the tabs read
// 1 Ratio history, 2 All ratios today, 3 Profitability ratios (TabGroup numbers them in this order and opens the first); the hint follows.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("src/stock/Sections3.tsx", "utf8");
const group = src.slice(src.indexOf('<TabGroup label="Ratios"'), src.indexOf("]} />", src.indexOf('<TabGroup label="Ratios"')));

describe("section 09 tab order (task #222)", () => {
  it("lists Ratio history first, All ratios today second, Profitability ratios third, and says so in the hint", () => {
    const keys = [...group.matchAll(/\{ key: "(\w+)", label: "([^"]+)"/g)].map((m) => [m[1], m[2]]);
    expect(keys).toEqual([["history", "Ratio history"], ["today", "All ratios today"], ["profit", "Profitability ratios"]]);
    expect(group).toContain('hint="Ratio history shown here"');
    expect(group).not.toContain("initial=");          // the first tab is the one shown on load
  });
});
