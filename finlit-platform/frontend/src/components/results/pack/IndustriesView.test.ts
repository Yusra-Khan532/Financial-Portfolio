// Latest results, Industries view (docs/design/finlit-final-pages/11): results against share prices, and the four cards, with the pack's own examples.
import { describe, expect, it } from "vitest";
import { PULSE_TONE, agreeOf, groupsTitle, industryCards, nameKey, type Ind } from "./IndustriesView";

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
    const names = (k: number) => (c[k].groups ?? []).flatMap((g) => g.chips.map((x) => x.label));
    // task #192: the list holds industries and sectors (Sector Pulse's groups), so it says "groups", and names are NSE's full names, never "Oil, Gas & Fuels"
    expect(c.map((x) => x.title)).toEqual(["3 groups are ahead of the market", "Results beat, prices lag: 2", "Prices ahead of results: 1", "2 groups are behind the market"]);
    // task #194: the card shows its headline; the dropdown holds one line of meaning and EVERY group, never "and 15 more"
    expect(c[1].text).toBe("Strong results that the share prices have not yet reflected.");
    expect(names(1)).toEqual(["Banks", "Oil, Gas & Consumable Fuels"]);
    expect(c[1].groups![0].label).toBe("All 2");
    expect(c[1].groups![0].chips[1].to).toBe("/results/quarter?industry=Oil%20Gas%20%26%20Consumable%20Fuels");   // a chip opens that group's results
    expect(c[3].text).toBe("Their typical company grew more slowly than the typical listed company.");
    expect(names(3)).toEqual(["IT - Software", "Realty"]);
  });
  it("lists every group in a card, however many", () => {
    const many = Array.from({ length: 19 }, (_, k) => ({ i: ind(`G${k}`, "Ahead"), agree: "Agree" as const }));
    const c = industryCards(many);
    expect(c[0].title).toBe("19 groups are ahead of the market");
    expect(c[0].groups![0].chips).toHaveLength(19);
    expect(JSON.stringify(c)).not.toMatch(/more/);
  });
  it("says so when no group lags or runs ahead", () => {
    const c = industryCards([{ i: ind("A", "In line"), agree: "Mixed" }]);
    expect(c.map((x) => x.kind)).toEqual(["insight", "watch"]);
    expect(c[0].text).toBe("No group has strong results with share prices that are behind."); expect(c[0].groups).toEqual([]);
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

describe("task #194: the share price columns", () => {
  it("colours Sector Pulse as the pack: Sold off red, both Bouncing back teal, Losing steam gold, Rising together green", () => {
    expect(PULSE_TONE).toMatchObject({ sold_off: "bad", bouncing: "teal", crash: "teal", losing: "gold", rising: "good" });
  });
  it("finds a group's Sector Pulse and Rotation readings whatever the commas", () => {
    expect(nameKey("Paper, Forest & Jute Products")).toBe(nameKey("Paper Forest & Jute Products"));
    expect(nameKey("Oil, Gas and Consumable Fuels")).toBe(nameKey("Oil Gas & Consumable Fuels"));
    expect(nameKey("IT - Software")).not.toBe(nameKey("IT - Services"));
  });
});
