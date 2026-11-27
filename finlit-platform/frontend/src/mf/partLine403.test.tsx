// @vitest-environment jsdom
// Task #403 (reworked 27 Nov 2026, team note: "i just want higher is better type of line. for each pillar we need such line"):
// one "Higher is better: …" line on each of the Mutual Fund Score's four parts (mf/PartLine.tsx, wording in lib/mfScore.ts), in every place the parts show:
// the fund and ETF page's score card, the MF portfolio's four parts and the sample card. The old combined "High and low" note is gone.
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PartLine } from "./PartLine";
import { PART_HIGH, PART_LEAD, partLine } from "../lib/mfScore";

const src = (f: string) => readFileSync(new URL("./" + f, import.meta.url), "utf8");
const BANNED = /\b(buy|sell|hold|reduce|avoid|accumulate|target|best|multibagger|top pick)\b/i;

describe("the 'Higher is better' line on each part", () => {
  it("has one short line per part, all in the same form", () => {
    expect(Object.keys(PART_HIGH)).toEqual(["performance", "risk", "cost", "quality"]);
    expect(PART_LEAD).toBe("Higher is better:");
    expect(["performance", "risk", "cost", "quality"].map(partLine)).toEqual([
      "Higher is better: did better than similar funds",
      "Higher is better: a calmer ride, smaller falls",
      "Higher is better: lower costs",
      "Higher is better: proven, large enough, soundly built",
    ]);
    for (const t of Object.values(PART_HIGH)) { expect(t.length).toBeLessThan(40); expect(t).not.toMatch(BANNED); }
  });
  it("renders as a small always-visible line, and nothing for an unknown part", () => {
    const { container, rerender } = render(<PartLine part="cost" className="x" />);
    const s = container.querySelector("small")!;
    expect(s.className).toBe("mfs-pl x");
    expect(s.textContent).toBe("Higher is better: lower costs");
    rerender(<PartLine part="other" />);
    expect(container.querySelector("small")).toBeNull();
  });
  it("sits on each part in all three places, and the old combined note is used nowhere", () => {
    expect(src("ScoreCard.tsx")).toMatch(/<\/b>\s*<PartLine part=\{p\.key\} \/>\s*<\/li>/);
    expect(src("pack/MfTop.tsx")).toMatch(/<p>\{p\.label\}<PartLine part=\{p\.k\} \/><\/p>/);
    expect(src("../components/MfScoreShowcase.tsx")).toMatch(/className="hpz-slide"[^\n]*\n\s*<PartLine part=\{p\.key\} className="hmf-pl" \/>/);
    for (const f of ["ScoreCard.tsx", "pack/MfTop.tsx", "../components/MfScoreShowcase.tsx"]) expect(src(f)).not.toMatch(/ScoreHighLow|higher = lower risk|higher = cheaper/);
  });
});
