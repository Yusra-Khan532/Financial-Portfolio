import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("Down from 52-week high filter placement (task #60; task #64 of 13 Nov, V-3)", () => {
  it("the Advanced page has it as a filter of the header row (task #258, SPEC §1), not as an open card above the table (V-3)", () => {
    const src = read("../../pages/AdvancedScoreScreener.tsx"), bar = read("./AdvFilterBar.tsx");
    expect(src).not.toContain("<HighBar");
    expect(src).toContain("<AdvFilterBar s={s} />");
    expect(bar).toContain('label="52-week high"');
    expect(bar).toContain("<HighFilter s={s} />");
  });
  it("the Basic page is retired with its score (task #283): only the Advanced page has the filter", () => {
    expect(() => read("../../pages/ScoreScreener.tsx")).toThrow();
  });
});
