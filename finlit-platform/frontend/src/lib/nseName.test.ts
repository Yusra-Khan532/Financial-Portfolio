// Task #192 (T3, T12): every NSE group name in NSE's spelling, and no home-made short names, from one shared list checked against NSE's own file.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NSE_COMMA_NAMES, nseName } from "./groupNames";
import { brief, short } from "./pulsePack";
import { shortName } from "./rotation";

describe("NSE spelling", () => {
  it("lists exactly the names with commas in NSE's classification file", () => {
    const data = JSON.parse(readFileSync(resolve(__dirname, "../../../backend/finlit/data/nse_classification.json"), "utf8"));
    const names = new Set<string>();
    for (const r of data.basic_industries) for (const l of ["macro_sector", "sector", "industry", "basic_industry"]) names.add(r[l]);
    expect([...NSE_COMMA_NAMES].sort()).toEqual([...names].filter((n) => n.includes(",")).sort());
  });
  it("puts NSE's commas back and leaves other names alone", () => {
    expect(nseName("Oil Gas & Consumable Fuels")).toBe("Oil, Gas & Consumable Fuels");
    expect(nseName("Media Entertainment & Publication")).toBe("Media, Entertainment & Publication");
    expect(nseName("Agricultural Commercial & Construction Vehicles")).toBe("Agricultural, Commercial & Construction Vehicles");
    expect(nseName("Paper Forest & Jute Products")).toBe("Paper, Forest & Jute Products");
    expect(nseName("Banks")).toBe("Banks");
  });
  it("has no home-made short names on any sector page (T12)", () => {
    for (const f of [short, brief, shortName]) {
      expect(f("Pharmaceuticals & Biotechnology")).toBe("Pharmaceuticals & Biotechnology");
      expect(f("Industrial Manufacturing")).toBe("Industrial Manufacturing");
      expect(f("Cement & Cement Products")).toBe("Cement & Cement Products");
      expect(f("Fast Moving Consumer Goods")).toBe("Fast Moving Consumer Goods");
      expect(f("IT - Software")).toBe("IT - Software");
      expect(f("Oil Gas & Consumable Fuels")).toBe("Oil, Gas & Consumable Fuels");
    }
  });
});
