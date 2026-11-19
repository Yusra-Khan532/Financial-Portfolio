// The fund page read "Not scored: Not scored: IDCW and other options inherit the Growth plan's score." (19 Nov 2026, HSBC Small Cap Fund): the page prints
// its own "Not scored:" label and the server's reason already starts with it. The label is printed once, everywhere the reason is shown.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { noReturnsText, scoreReason } from "../lib/mf";

describe("a score reason reads its label once", () => {
  it("drops a leading Not scored / Not scored yet / Not rated label, and nothing else", () => {
    expect(scoreReason("Not scored: IDCW and other options inherit the Growth plan's score.")).toBe("IDCW and other options inherit the Growth plan's score.");
    expect(scoreReason("Not scored yet: the daily score run has not reached this scheme.")).toBe("the daily score run has not reached this scheme.");
    expect(scoreReason("Not rated: under 12 months of NAVs.")).toBe("under 12 months of NAVs.");
    expect(scoreReason("Under 12 months of NAVs; not scored yet.")).toBe("Under 12 months of NAVs; not scored yet.");
    expect(scoreReason(null)).toBe("");
  });
  it("the score card and the fund's glance row both pass the reason through it", () => {
    for (const f of ["mf/ScoreCard.tsx", "mf/FundGlance.tsx"]) {
      const src = readFileSync(resolve(process.cwd(), "src", f), "utf8");
      expect(src, f).toMatch(/scoreReason\(s\.reason\)/);
      expect(src, f).not.toMatch(/\}:<\/b> \{s\.reason\}|`: \$\{s\.reason\}`/);
    }
  });
  it("a fund with no stated option says where FinLit looked", () => {
    expect(noReturnsText("unstated")).toBe("Neither AMFI's NAV file nor its scheme master states a Growth option for this scheme, so NAV-to-NAV returns could miss payouts.");
  });
  it("About the data names where the plan and option come from", () => {
    const src = readFileSync(resolve(process.cwd(), "src/pages/Funds.tsx"), "utf8");
    expect(src).toMatch(/<span>Plan and option source<\/span><b>\{d\.planSource\}<\/b>/);
  });
});
