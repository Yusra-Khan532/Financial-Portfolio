import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Task #313 (Chinmay, 22 Nov 2026): Correlation charts, "Which companies": "Orient the boxes properly". The grid stretched every field to the tallest one
// (lists, market-cap boxes and the lenders menu pushed down and made tall) and ".adv-field label { display: grid }" with "width: 100%" put each checkbox
// on its own row, stretched across the column. These rules keep each field at its own height and each checkbox beside its words, in this grid only.
const css = readFileSync(new URL("./advcharts.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (sel: string) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const all = [...css.matchAll(new RegExp(`(?:^|\\}|,)\\s*${esc}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "gm"))];   // every rule for this selector
  return all.map((m) => m[1]).join(";").replace(/\s+/g, " ");
};

describe("Correlation charts, Which companies (task #313)", () => {
  it("fields keep their own height, at the top of the row", () => {
    expect(rule(".adv-fgrid")).toContain("align-items: start");
    expect(rule(".adv-fgrid .adv-field")).toContain("align-content: start");
  });
  it("a checkbox sits beside its words, at its own size", () => {
    expect(rule(".adv-fgrid .adv-check")).toContain("display: flex");
    expect(rule(".adv-fgrid .adv-check input")).toContain("width: auto");
  });
  it("the rules are scoped to this grid: the page's other fields are not touched", () => {
    expect(rule(".adv-field")).toContain("display: grid");            // as before
    expect(rule(".adv-field label")).toContain("display: grid");      // as before (the company search and index pickers use it)
  });
});
