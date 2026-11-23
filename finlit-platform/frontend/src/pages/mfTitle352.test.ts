// Task #352 (team, 23 Nov 2026): the Mutual funds list page is named just "Mutual Funds" (it read "Equity mutual funds 2026", changing with the tab).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "Funds.tsx"), "utf8");
describe("task #352: the Mutual funds page heading", () => {
  it("is the fixed words Mutual Funds, not the chosen categories and the year", () => {
    expect(src).toContain('{HEAD("Mutual Funds", "Funds in your chosen categories');
    expect(src).not.toMatch(/\{HEAD\(title, "Funds in your chosen categories/);
  });
  it("the browser tab keeps the descriptive title (the chosen categories and the year) for search results", () => {
    expect(src).toMatch(/const title = `\$\{selectionTitle\(q\.tab, chosen, q\.cats === null\)\} mutual funds \$\{year\}`;\n\s+\/\/ task #352[^\n]*\n\s+useDocTitle\(title,/);
  });
});
