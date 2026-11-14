// Latest results, Industries view (docs/design/finlit-final-pages/11): results against share prices, and the four cards, with the pack's own examples.
import { describe, expect, it } from "vitest";
import { agreeOf, industryCards, type Ind } from "./IndustriesView";

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
    const c = industryCards(rows);
    expect(c.map((x) => x.title)).toEqual(["3 industries are ahead of the market", "Results beat, prices lag: 2", "Prices ahead of results: 1", "2 industries are behind the market"]);
    expect(c[1].text).toBe("Banks and Oil, Gas & Fuels. Strong results that the share prices have not yet reflected.");
    expect(c[3].text).toBe("IT - Software, Realty.");
  });
});
