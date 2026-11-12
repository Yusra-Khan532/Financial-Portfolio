import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adv = readFileSync(new URL("./AdvancedScoreScreener.tsx", import.meta.url), "utf8");

describe("Prism Fundamental score name in the Advanced screener (task #93)", () => {
  it("the total column and its group heading both use the full name", () => {
    expect(adv).toContain('label="Prism Fundamental score"');
    expect(adv).toContain('label: "Prism Fundamental score", sub: "0–100, higher is better"');
    expect(adv).not.toContain('label: "FinLit Prism", sub:');
  });
});
