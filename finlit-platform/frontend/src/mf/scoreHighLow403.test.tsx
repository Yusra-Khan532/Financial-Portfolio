// @vitest-environment jsdom
// Task #403: "where ever we are showing this card just give a small mention high indicates what and low indicates what".
// One note (mf/ScoreHighLow.tsx, wording in lib/mfScore.ts) under the part bars of the fund page's score card, the MF portfolio's four parts and the landing page's sample card.
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ScoreHighLow } from "./ScoreHighLow";
import { HIGH_LOW_ORDER, PART_HIGH, highLowText } from "../lib/mfScore";

const BANNED = /\b(buy|sell|hold|recommended|best|top pick|winner|avoid|target)\b/i;

describe("the High and low note", () => {
  it("names every part with what a high figure means, and says low means the opposite; Risk and Cost read the right way round", () => {
    const { container } = render(<ScoreHighLow />);
    const p = container.querySelector("p.mfs-hl")!;
    expect(p.textContent).toBe(highLowText());
    expect(p.textContent).toBe("High and low: every part is read against funds of the same category, and higher is better on all four; low means the opposite. "
      + "High Performance = did better than similar funds · High Risk = lower risk: a calmer ride, smaller falls · High Cost = lower costs · High Quality = proven, large enough and soundly built.");
    expect(HIGH_LOW_ORDER.map(([k]) => k)).toEqual(["performance", "risk", "cost", "quality"]);
    expect(PART_HIGH.risk).toMatch(/^lower risk/);
    expect(PART_HIGH.cost).toBe("lower costs");
    expect(p.textContent).not.toMatch(BANNED);
  });
  it("is plain visible text, not a tooltip, and takes an extra class", () => {
    const { container } = render(<ScoreHighLow className="px-hl" />);
    const p = container.querySelector("p")!;
    expect(p.getAttribute("title")).toBeNull();
    expect(p.className).toBe("mfs-hl px-hl");
  });
  it("sits under the part bars everywhere the card's bars show: fund page (rated and locked, ETF too: one Pillars), MF portfolio parts, landing sample card", () => {
    const src = (f: string) => readFileSync(join(__dirname, f), "utf8");
    expect(src("ScoreCard.tsx")).toMatch(/<\/ul>\s*<ScoreHighLow \/>/);
    expect(src("pack/MfTop.tsx")).toMatch(/className="px-pn"[^]*<ScoreHighLow className="px-hl" \/>/);
    expect(src("../components/MfScoreShowcase.tsx")).toMatch(/className="hpz-parts"[^]*<\/ul>\s*<ScoreHighLow className="hmf-hl" \/>/);
    expect(src("score-high-low.css")).toMatch(/\.mfs-hl \{[^}]*font-size: var\(--fs-13\)/);
  });
});
