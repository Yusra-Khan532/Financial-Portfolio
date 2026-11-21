// The stock report's old page-wide Consolidated / Standalone switch was removed: it said "publishes consolidated accounts only" while standalone figures
// were still loading, then showed them. The page still picks standalone by itself when a company's consolidated history is far shorter, and says so.
// Task #190 (founder, 16 Nov 2026) brought a switch back for section 06 only (Sections.tsx FinancialsSection); its behaviour is tested in
// financialsBasis190.test.tsx. The score card, hero and page frame stay without one, and none of them ever carries the old wrong wording.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("no page-wide standalone switch on the stock report", () => {
  it("the score card, hero and page have no switch", () => {
    for (const f of ["./Hero.tsx", "./StockPage.tsx"]) {   // task #283: the old score card is gone
      const t = src(f);
      expect(t, f).not.toContain("BasisToggle");
      expect(t, f).not.toMatch(/>\s*Standalone\s*</);
    }
  });
  it("nothing carries the old wrong message", () => {
    for (const f of ["./Sections.tsx", "./Hero.tsx", "./StockPage.tsx"]) {
      const t = src(f);
      expect(t, f).not.toContain("publishes");
      expect(t, f).not.toContain("Show consolidated instead");
    }
  });
  it("the automatic fallback to standalone is still explained in words", () => {
    expect(src("./Sections.tsx")).toContain("Showing standalone accounts");
  });
  it("section 06 has its own switch (task #190)", () => {
    expect(src("./Sections.tsx")).toContain('aria-label="Accounts: consolidated or standalone"');
  });
});
