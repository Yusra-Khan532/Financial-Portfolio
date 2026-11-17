// Latest results, Industries view (docs/design/finlit-final-pages/11): results against share prices, and the four cards, with the pack's own examples.
import { describe, expect, it } from "vitest";
import { agreeOf, groupsTitle, industryCards, type Ind } from "./IndustriesView";

const ind = (name: string, vsMarket: Ind["vsMarket"]): Ind => ({ name, companies: 50, declared: 40, vsMarket });

describe("results against share prices", () => {
  it("agrees, lags, runs ahead or is mixed, as the pack's rows", () => {
    expect(agreeOf("Ahead", "ahead_slowing")).toBe("Agree");            // Industrial Products
    expect(agreeOf("Ahead", "behind_slipping")).toBe("Prices lag");     // Banks
    expect(agreeOf("Behind", "ahead_gaining")).toBe("Prices run ahead"); // IT - Software
    expect(agreeOf("Behind", "behind_slipping")).toBe("Agree");         // Realty
    expect(agreeOf("In line", "behind_slipping")).toBe("Mixed");        // Finance
    expect(agreeOf("Ahead", "middle")).toBeNull();
    expect(agreeOf(null, "ahead_gaining")).toBeNull();
  });
  it("writes the four cards", () => {
    const rows = [
      { i: ind("Industrial Products", "Ahead"), agree: "Agree" as const }, { i: ind("Banks", "Ahead"), agree: "Prices lag" as const },
      { i: ind("Oil Gas & Consumable Fuels", "Ahead"), agree: "Prices lag" as const }, { i: ind("IT - Software", "Behind"), agree: "Prices run ahead" as const },
      { i: ind("Realty", "Behind"), agree: "Agree" as const }, { i: ind("Finance", "In line"), agree: "Mixed" as const },
    ];
    const nse = (n: string) => (n === "Oil Gas & Consumable Fuels" ? "Oil, Gas & Consumable Fuels" : n);   // useNseName's job, NSE's spelling
    const c = industryCards(rows, nse);
    // task #192: the list holds industries and sectors (Sector Pulse's groups), so it says "groups", and names are NSE's full names, never "Oil, Gas & Fuels"
    expect(c.map((x) => x.title)).toEqual(["3 groups are ahead of the market", "Results beat, prices lag: 2", "Prices ahead of results: 1", "2 groups are behind the market"]);
    expect(c[1].text).toBe("Banks and Oil, Gas & Consumable Fuels. Strong results that the share prices have not yet reflected.");
    expect(c[3].text).toBe("IT - Software, Realty.");
  });
});

describe("task #192: the heading counts each level", () => {
  it("says how many industries and sectors the groups are", () => {
    expect(groupsTitle(["industry", "sector", "industry", undefined])).toBe("4 groups with enough results to compare: 3 industries and 1 sector");
    expect(groupsTitle(["industry"])).toBe("1 group with enough results to compare: 1 industry");
    expect(groupsTitle([])).toBe("0 groups with enough results to compare");
    expect(groupsTitle(["sector", undefined], false)).toBe("2 groups with enough results to compare");   // the board still loading: no split rather than a wrong one
  });
});
