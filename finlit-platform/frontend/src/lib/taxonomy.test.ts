import { describe, expect, it } from "vitest";
import { LEVELS, LEVEL_LABEL, levelPath } from "./taxonomy";
import { cls } from "./taxonomyTesting";

describe("NSE's four levels on the website (task #192)", () => {
  it("each level has one name, widest first", () => {
    expect(LEVELS.map((l) => LEVEL_LABEL[l])).toEqual(["Macro sector", "Sector", "Industry", "Basic industry"]);
  });
  it("a path writes a name shared by two levels once and skips blank levels", () => {
    expect(levelPath(cls("TCS", "Information Technology", "Information Technology", "IT - Software", "Computers - Software & Consulting")))
      .toEqual(["Information Technology", "IT - Software", "Computers - Software & Consulting"]);
    expect(levelPath(cls("HAPPY", "Industrials", "Capital Goods", "Industrial Manufacturing", null))).toEqual(["Industrials", "Capital Goods", "Industrial Manufacturing"]);
    expect(levelPath(null)).toEqual([]);
  });
});

describe("one spelling per name (task #192, rule T3)", () => {
  it("matches NSE's names whatever the commas, case or and/&", async () => {
    const { nameKey } = await import("./taxonomy");
    expect(nameKey("Oil Gas & Consumable Fuels")).toBe(nameKey("Oil, Gas & Consumable Fuels"));
    expect(nameKey("Automobile and Auto Components")).toBe(nameKey("automobile & auto components"));
    expect(nameKey("IT - Software")).not.toBe(nameKey("IT - Services"));
  });
});
