import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("Down from 52-week high filter placement (task #60, moved by task #64 of 12 Nov)", () => {
  it("the Advanced page shows the filter as a bar above the table", () => {
    const src = read("../../pages/AdvancedScoreScreener.tsx");
    expect(src).toContain("<HighBar s={s} />");
    expect(src.indexOf("<HighBar")).toBeLessThan(src.indexOf("<PriceColumnsToggle"));
  });
  it("the Basic page keeps it in the filters, not open on the page (as in the 11 Nov design)", () => {
    const src = read("../../pages/ScoreScreener.tsx");
    expect(src).not.toContain("<HighBar");
    expect(src).toContain('FilterGroup id="high"');
    expect(src).toContain("<HighFilter s={s} />");
  });
});
