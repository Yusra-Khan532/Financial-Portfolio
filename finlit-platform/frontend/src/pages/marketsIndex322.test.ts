import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BAND, WATCHED, memberKey } from "./marketsIndex";

// Task #322 C (developer file 24): Indices, Index in detail and Commodity indices.
const src = readFileSync(join(__dirname, "marketsIndex.tsx"), "utf8");

describe("index tabs (task #322 C)", () => {
  it("the three positions in the pack's words; the P/E column and its filter", () => {
    expect(BAND).toEqual({ low: "Low for this index", usual: "In its usual range", high: "High for this index" });
    expect(src).toContain('const bandOf = (p: number) => (p < 25 ? "low" : p > 75 ? "high" : "usual");');
    expect(src).toContain("P/E against its own 5 years"); expect(src).toContain('k="P/E position"');
    expect(src).toContain('options={[{ v: "val", label: "Valuation" }, { v: "ret", label: "Returns" }, { v: "day", label: "Today" }]}');
  });
  it("every index's figures in one call; Open leads to Index in detail", () => {
    expect(src).toContain('apiGet<Board>("/api/indices/board")');
    expect(src).toContain('onClick={() => open(r.code)}>Open</button>');
  });
  it("Index in detail: searchable grouped dropdowns, compare with a second index, how it has moved, what is inside", () => {
    expect(src).toContain('<MkDd k="Index"'); expect(src).toContain('<MkDd k="Compare with"'); expect(src).toContain('search="Find an index"');
    expect(src).toContain('label: "No comparison"'); expect(src).toContain("times · {ratio.now > ratio.median * 1.03");
    expect(src).toContain("How it has moved"); expect(src).toContain("What is inside"); expect(src).toContain("not its weight in the index");
  });
  it("member lists are matched by name, with the few that differ named", () => {
    expect(memberKey({ code: "NIF50", name: "Nifty 50" })).toBe("NIFTY50");
    expect(memberKey({ code: "NIFFINSER", name: "Nifty Financial Services" })).toBe("NIFTYFINSERVICE");
    expect(memberKey({ code: "NIFPVTBAN", name: "Nifty Private Bank" })).toBe("NIFTYPVTBANK");
    expect(memberKey({ code: "NIFOILGAS", name: "Nifty Oil & Gas" })).toBe("NIFTYOILGAS");
    expect(memberKey({ code: "NIFMIDSMA400", name: "Nifty MidSmallcap 400" })).toBe("NIFTYMIDSMALL400");
    expect(memberKey({ code: "NIFHEAIND", name: "NIFTY HEALTHCARE INDEX" })).toBe("NIFTYHEALTHCARE");
  });
  it("Commodity indices: the pack's fifteen often-watched series, a Series dropdown, the latest month on file", () => {
    expect(WATCHED).toHaveLength(15);
    expect(WATCHED.map((w) => w[1])).toEqual(["All commodities", "Crude petroleum", "Diesel (HSD)", "Petrol", "Coal", "Steel, long products", "Aluminium ingot", "Copper bars, rods and strips",
      "Cotton yarn", "Sugar", "Palm oil", "Natural gas", "Urea", "Wheat", "Ordinary Portland cement"]);
    expect(src).toContain('<MkDd k="Series"'); expect(src).toContain("Latest month on file:");
  });
  it("never cheap, expensive, undervalued or buy", () => {
    expect(src.replace(/\/\/.*$/gm, "")).not.toMatch(/\b(cheap|expensive|undervalued|buy)\b/i);
  });
});
