import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("Down from 52-week high filter placement (task #60; task #64 of 13 Nov, V-3)", () => {
  it("the Advanced page has it in the filter panel as on Basic, not as an open card above the table (V-3)", () => {
    const src = read("../../pages/AdvancedScoreScreener.tsx");
    expect(src).not.toContain("<HighBar");
    expect(src).toContain('FilterGroup id="high"');
    expect(src).toContain("<HighFilter s={s} />");
  });
  it("the Basic page keeps it in the filters, not open on the page (as in the 11 Nov design)", () => {
    const src = read("../../pages/ScoreScreener.tsx");
    expect(src).not.toContain("<HighBar");
    expect(src).toContain('FilterGroup id="high"');
    expect(src).toContain("<HighFilter s={s} />");
  });
});
