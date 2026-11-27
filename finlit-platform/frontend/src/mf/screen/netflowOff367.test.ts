// Task #367: "Net flow of the categories in this result" is not in the Mutual Fund Screener's filter list any more; the bars stay in the result's own
// category market view ("Where the money is moving").
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("task #367", () => {
  it("the filter panel has no net flow bars; the result's market view keeps them", () => {
    const panel = readFileSync(join(__dirname, "Panel.tsx"), "utf8"), page = readFileSync(join(__dirname, "../../pages/MfScreener.tsx"), "utf8");
    expect(panel).not.toMatch(/<FlowBars/);
    expect(panel).not.toContain("<Sub>Net flow of the categories in this result</Sub>");
    expect(page).toContain("<FlowBars flows={fac?.flows} />");
  });
});
