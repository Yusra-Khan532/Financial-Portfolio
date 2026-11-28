// Task #464 (28 Nov 2026): "we see alignment issues in etf screener". In a blank cell the dash sat at the right edge of its reason
// ("—" over "Price break, 18 Dec 2023") while the list's figure columns are centred. The dash is now centred over the reason there.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = (f: string) => readFileSync(join(__dirname, "..", "styles", f), "utf8");
const rule = (src: string, sel: string) => [...src.matchAll(/([^{}]+)\{([^}]*)\}/g)].find((m) => m[1].includes(sel))?.[2] ?? "";

describe("task #464: a blank's dash lines up with its centred column", () => {
  it("the list centres its figure and category columns", () => {
    expect(rule(css("etf351.css"), ".etf-list .etf-table .num")).toMatch(/text-align:\s*center/);
  });
  it("so a blank with a reason centres the dash over the reason in those columns", () => {
    const r = rule(css("etf351.css"), ".etf-list .etf-table td.num > .etf-blank:has(.etf-bwhy)");
    expect(r).toMatch(/align-items:\s*center/);
    expect([...css("etf351.css").matchAll(/td\.etf-c-category > \.etf-blank:has\(\.etf-bwhy\)/g)].length).toBe(1);
  });
  it("other pages keep their own alignment (the shared rule is unchanged)", () => {
    expect(rule(css("etf.css"), ".etf-blank:has(.etf-bwhy)")).toMatch(/align-items:\s*flex-end/);
  });
});
