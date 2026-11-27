// Task #192 round 4a (sector pack P7, T5, T9, P16): Sector Pulse and Rotation count groups, not "industries", say how many are industries and how many sectors,
// account for all 59 NSE industries, and a sector group's page calls itself a sector.
import { describe, expect, it } from "vitest";
import { accountFor, groupsN, groupsParen, groupsSplit } from "./pulsePack";
import { rankOf, unitOf } from "./industryPack";
import type { Board } from "./sectors";

const row = (name: string, kind: "industry" | "sector", industries: string[] = []) => ({ name, slug: name.toLowerCase().replace(/[^a-z]+/g, "-"), kind, industries } as unknown as Board["rows"][number]);

describe("group counts (P7, T9)", () => {
  it("names both levels of a mixed count", () => {
    const rows = [...Array.from({ length: 33 }, () => ({ kind: "industry" })), ...Array.from({ length: 5 }, () => ({ kind: "sector" }))];
    expect(groupsSplit(rows)).toBe("38 groups: 33 industries and 5 sectors");
    expect(groupsParen(rows)).toBe("38 groups (33 industries and 5 sectors)");
    expect(groupsN(1)).toBe("1 group");
    expect(groupsSplit([{ kind: "industry" }, { kind: "industry" }])).toBe("2 groups");
  });
});

describe("all 59 industries accounted for (T5)", () => {
  it("names the industries inside a too-small sector group and counts every industry once", () => {
    const b = {
      rows: [row("Banks", "industry"), row("Telecommunication", "sector", ["Telecom - Services", "Telecom - Equipment & Accessories"])],
      too_few_stocks: [{ name: "IT - Hardware", slug: "it-hardware", kind: "industry", stocks_counted: 7 }, { name: "Services", slug: "services", kind: "sector", stocks_counted: 7 }],
    } as unknown as Board;
    const nse = [{ industry: "Banks", sector: "Financial Services" }, { industry: "Telecom - Services", sector: "Telecommunication" }, { industry: "Telecom - Equipment & Accessories", sector: "Telecommunication" },
      { industry: "IT - Hardware", sector: "Information Technology" }, { industry: "Engineering Services", sector: "Services", companies: 2 }, { industry: "Transport Infrastructure", sector: "Services", companies: 18 },
      { industry: "Public Services", sector: "Services", companies: 0 }];
    const a = accountFor(b, nse);
    expect(a.inside.services.map((x) => x.industry)).toEqual(["Engineering Services", "Transport Infrastructure", "Public Services"]);
    expect(a.placed).toBe(nse.length);
    expect(a.line).toBe("All 7 NSE industries: 1 with a reading of their own, 2 read together inside 1 sector group, 1 too small on their own and 3 inside 1 too-small sector group.");
  });
});

describe("task #333: the Sectors view footnote counts sectors, then the industries they hold", () => {
  it("says 22 sectors: 19 with a reading and 3 too small, holding all 59 industries", () => {
    const b = { rows: [row("Power", "sector", ["Power"]), row("Realty", "sector", ["Realty"])], too_few_stocks: [{ name: "Utilities", slug: "utilities", kind: "sector", stocks_counted: 6 }] } as unknown as Board;
    const nse = [{ industry: "Power", sector: "Power" }, { industry: "Realty", sector: "Realty" }, { industry: "Other Utilities", sector: "Utilities" }, { industry: "Gas", sector: "Utilities" }];
    expect(accountFor(b, nse).line).toBe("All 3 NSE sectors: 2 with a reading and 1 too small for one. Between them they hold all 4 NSE industries.");
  });
});

describe("a sector group's page (P16)", () => {
  it("calls itself a sector and names what the rank is out of", () => {
    expect(unitOf({ kind: "sector" } as never)).toBe("sector");
    expect(unitOf({ kind: "industry" } as never)).toBe("industry");
    expect(rankOf(33, 37)).toBe("33 of 37 ranked groups");
  });
});
