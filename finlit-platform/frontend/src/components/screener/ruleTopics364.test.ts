// Task #364: every rule group of the catalogue sits under a topic; a group the map does not know goes under "Other rules", so none is ever lost.
import { describe, expect, it } from "vitest";
import { TOPICS, topicsOf } from "./RuleTopics";

const LIVE = ["size", "returns", "valuation", "profitability", "growth", "quarterly", "health", "liquidity", "solvency", "efficiency", "ownership", "events", "flags", "banks", "trading"];
describe("task #364: topic groups of the Score and Filters panel", () => {
  it("places every one of the 15 live groups exactly once, in the task's order", () => {
    const t = topicsOf(LIVE.map((id) => ({ id })));
    expect(t.map((x) => x.label)).toEqual(["Valuation & financial performance", "Returns & business performance", "Ownership & corporate activity", "Risk & quality"]);
    expect(t.flatMap((x) => x.groups.map((g) => g.id)).sort()).toEqual([...LIVE].sort());
    expect(t[0].groups.map((g) => g.id)).toEqual(["valuation", "profitability", "growth", "health", "liquidity", "solvency", "efficiency"]);
  });
  it("a new group is never dropped", () => {
    const t = topicsOf([{ id: "valuation" }, { id: "newthing" }]);
    expect(t.at(-1)).toMatchObject({ label: "Other rules", groups: [{ id: "newthing" }] });
    expect(TOPICS.flatMap((x) => x.groups)).not.toContain("newthing");
  });
});
