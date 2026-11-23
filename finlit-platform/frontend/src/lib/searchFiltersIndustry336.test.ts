// Task #336 (23 Nov 2026): "in the filter section add industry as well as one of the filter". The search index carries each company's NSE industry
// (`industries`, `ind`); the shared filter narrows by it, names it, and says when it hides a company.
import { describe, expect, it } from "vitest";
import type { SearchIndex } from "./api";
import { NO_FILTER, failedKeys, filterOn, filterParts, filteredRows, hiddenMatches, indexFacets, industryAt, passes, relaxed, whyHidden } from "./searchFilters";

const idx: SearchIndex = {
  fields: ["symbol", "name"], rows: [["HDFCBANK", "HDFC Bank", null, 1], ["ICICIBANK", "ICICI Bank", null, 1], ["BAJFINANCE", "Bajaj Finance", null, 1], ["NOIND", "No Industry Ltd", null, 1]],
  sectors: ["Financial Services"], sec: [0, 0, 0, 0], mc: [1_200_000, 900_000, 500_000, 500],
  industries: ["Banks", "Finance"], ind: [0, 0, 1, -1],
};

describe("Industry filter (task #336)", () => {
  it("reads each company's industry, and facets list the industries with counts, most first", () => {
    expect(industryAt(idx, 0)).toBe("Banks"); expect(industryAt(idx, 3)).toBeNull();
    const f = indexFacets(idx);
    expect(f.industries).toEqual([{ name: "Banks", n: 2 }, { name: "Finance", n: 1 }]);
    expect(f.unknown.industry).toBe(1);
  });
  it("narrows the list, is named in the active filters, and an older index without industries has none to offer", () => {
    const f = { ...NO_FILTER, industry: "Banks" };
    expect(filterOn(f)).toBe(true);
    expect(filteredRows(idx, f).map((r) => r[0])).toEqual(["HDFCBANK", "ICICIBANK"]);
    expect(passes(idx, 3, f)).toBe(false);
    expect(filterParts({ ...f, sector: "Financial Services" })).toEqual(["Sector: Financial Services", "Industry: Banks"]);
    expect(indexFacets({ ...idx, industries: undefined, ind: undefined }).industries).toEqual([]);
  });
  it("says why a match is hidden, and Show it removes only the industry", () => {
    const f = { ...NO_FILTER, industry: "Banks" };
    const h = hiddenMatches(idx, "bajaj", f);
    expect(h[0].keys).toEqual(["industry"]);
    expect(h[0].why).toBe("Hidden by your filter: Industry Banks (this one is in Finance)");
    expect(relaxed({ ...f, cap: "large" }, h[0].keys)).toEqual({ sector: null, cap: "large", industry: null });
    expect(failedKeys(null, 1, f, null)).toEqual(["industry"]);
    expect(whyHidden(["industry"], f, null, 1, null)).toContain("(this one has no industry on file)");
  });
});
