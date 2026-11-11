import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("Down from 52-week high filter placement (task #60)", () => {
  for (const page of ["ScoreScreener", "AdvancedScoreScreener"]) {
    it(`${page} shows the filter as a bar above the table, not as a buried side-panel group`, () => {
      const src = read(`../../pages/${page}.tsx`);
      expect(src).toContain("<HighBar s={s} />");
      expect(src).not.toContain('FilterGroup id="high"');
      expect(src.indexOf("<HighBar")).toBeLessThan(src.indexOf("<PriceColumnsToggle"));
    });
  }
});
