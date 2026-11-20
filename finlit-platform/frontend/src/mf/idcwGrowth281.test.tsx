// @vitest-environment jsdom
// Task #281 (owner, 20 Nov 2026): IDCW option rows showed "—" for the Mutual Fund Score and every return (Parag Parikh Flexi Cap Direct Monthly IDCW 153964).
// They now show the Growth option of the same fund and plan, always labelled as that option's: the score as "Growth option's score", the returns as
// "Growth option's returns (before payouts)", never as the IDCW NAV's own change. Lists of scores say each plan is compared with its own plan.
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GROWTH_RETURNS_LABEL, GROWTH_SCORE_LABEL, PLAN_SCORE_NOTE, growthFigure } from "../lib/mf";
import { ScoreCell } from "./ScoreCell";

afterEach(cleanup);
const src = (f: string) => readFileSync(resolve(process.cwd(), "src", f), "utf8");
const G = { code: 122639, name: "Parag Parikh Flexi Cap Fund", r1y: 9.4, r3y: 21.1, r5y: 22.3, retDate: "2026-11-19", label: GROWTH_RETURNS_LABEL };

describe("IDCW rows show the same plan's Growth option, labelled", () => {
  it("the Growth option's returns stand in only for a non-Growth row with a Growth sibling", () => {
    expect(growthFigure({ optionClass: "IDCW", growthReturns: G }, "r3y")).toBe(21.1);
    expect(growthFigure({ optionClass: "Growth", growthReturns: G }, "r3y")).toBeNull();
    expect(growthFigure({ optionClass: "IDCW", growthReturns: null }, "r1y")).toBeNull();
  });
  it("the score cell says the score is the Growth option's, and the tooltip names the plan rule", () => {
    const item = { code: 153964, symbol: null, plan: "Direct", group: "EQ-BROAD", final: 58.3, label: "Healthy", status: "RATED", reason: null, pillars: null, rank: null, rankOf: null,
      flags: [], confidence: 0.9, inherited: { code: 122639, name: "Parag Parikh Flexi Cap Fund", label: GROWTH_SCORE_LABEL, why: "This option pays out." } };
    const { container } = render(<ScoreCell item={item} locked={false} why="" />);
    expect(screen.getByText(GROWTH_SCORE_LABEL)).toBeTruthy();
    expect(container.querySelector(".mfs-cell")!.getAttribute("title")).toContain(PLAN_SCORE_NOTE);
  });
  it("a Growth row's own score carries no Growth-option label", () => {
    render(<ScoreCell item={{ code: 122639, symbol: null, plan: "Direct", group: "EQ-BROAD", final: 58.3, label: "Healthy", status: "RATED", reason: null, pillars: null, rank: null, rankOf: null, flags: [], confidence: 0.9 }} locked={false} why="" />);
    expect(screen.queryByText(GROWTH_SCORE_LABEL)).toBeNull();
  });
  it("the list, screener, compare table and fund page all use the label and never the bare figure", () => {
    for (const f of ["mf/FundTable.tsx", "mf/screen/Results.tsx", "pages/Funds.tsx", "mf/Returns.tsx", "mf/FundGlance.tsx"]) {
      const s = src(f);
      expect(s, f).toMatch(/GROWTH_RETURNS_LABEL/);
      expect(s, f).toMatch(/growthReturns|growthFigure/);
    }
    for (const f of ["mf/FundTable.tsx", "mf/screen/Results.tsx"]) expect(src(f), f).toMatch(/PLAN_SCORE_NOTE/);
    expect(src("mf/ScoreCard.tsx")).toMatch(/\["Plans", PLAN_SCORE_NOTE\]/);
  });
});
