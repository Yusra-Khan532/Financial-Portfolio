import { describe, expect, it } from "vitest";
import { applyFilters, filtersFromParams, median, NO_FILTERS, optionCounts, paramsFromFilters, passes, sortRows, summarise, toCsv, yearOf, type IpoRow } from "./ipoHistory";

const row = (o: Partial<IpoRow>): IpoRow => ({
  id: 1, name: "A Ltd", symbol: "A", nse: "A", bse: null, board: "mainboard", sector: "Chemicals", exchanges: ["BSE", "NSE"], kind: "Book built", status: "listed",
  openDate: "2026-10-27", closeDate: "2026-10-29", listingDate: "2026-11-03", priceLow: 142, priceHigh: 150, issuePrice: 150, lotSize: 100, minAmount: 15000,
  issueSizeCr: 255, freshCr: 255, ofsCr: null, subscription: 241.22, subQib: 200.25, subNii: 559.2, subRetail: 128.36, gmp: 69, gmpPct: 46, listingPrice: 248, listingPct: 65.33,
  listingClose: null, listingClosePct: null, lastClose: 231, lastDay: "2026-11-20", sinceIpoPct: 54, adjustedBy: null, companyPage: true, verdict: "beat", ...o,
});
const rows = [
  row({}),
  row({ id: 2, name: "B Ltd", symbol: "BSME", board: "sme", exchanges: ["NSE SME"], listingPct: -10, subscription: 0.8, issueSizeCr: 20, openDate: "2024-03-01", listingDate: "2024-03-07", sinceIpoPct: null, sector: "Textiles" }),
  row({ id: 3, name: "C Ltd", status: "upcoming", listingPct: null, listingPrice: null, subscription: null, issueSizeCr: 1500, openDate: "2026-11-25", listingDate: null, sinceIpoPct: null }),
];

describe("the all-IPOs table", () => {
  it("filters by every control", () => {
    const ids = (f: Partial<typeof NO_FILTERS>) => applyFilters(rows, { ...NO_FILTERS, ...f }).map((r) => r.id);
    expect(ids({})).toEqual([1, 2, 3]);
    expect(ids({ q: "bsme" })).toEqual([2]);
    expect(ids({ status: "upcoming" })).toEqual([3]);
    expect(ids({ board: "sme" })).toEqual([2]);
    expect(ids({ year: "2024" })).toEqual([2]);
    expect(ids({ gain: "up" })).toEqual([1]);
    expect(ids({ gain: "down" })).toEqual([2]);
    expect(ids({ gain: "gt50" })).toEqual([1]);
    expect(ids({ sub: "lt1" })).toEqual([2]);
    expect(ids({ sub: "gt100" })).toEqual([1]);
    expect(ids({ size: "gt1000" })).toEqual([3]);
    expect(ids({ size: "lt100" })).toEqual([2]);
    expect(ids({ exchange: "BSE" })).toEqual([1, 3]);
    expect(ids({ sector: "Textiles" })).toEqual([2]);
  });

  it("task #308: each option counts what it would leave with every other filter applied (Board = SME, then Year shows the SME issues of each year)", () => {
    const more = [...rows, row({ id: 4, name: "D Ltd", board: "sme", openDate: "2026-02-01", listingDate: "2026-02-06" }), row({ id: 5, name: "E Ltd", board: "sme", openDate: "2024-05-01", listingDate: "2024-05-07" })];
    const f = { ...NO_FILTERS, board: "sme" as const };
    expect(optionCounts(more, f, "year", ["all", "2026", "2024"])).toEqual({ all: 3, "2026": 1, "2024": 2 });
    // the filter's own value is left out when counting its options: Board counts every board, the other filters still apply
    expect(optionCounts(more, { ...f, year: "2024" }, "board", ["all", "mainboard", "sme"])).toEqual({ all: 2, mainboard: 0, sme: 2 });
    // the search applies to every count
    expect(optionCounts(more, { ...NO_FILTERS, q: "d ltd" }, "board", ["all", "sme"])).toEqual({ all: 1, sme: 1 });
    // an option's count is exactly what choosing it shows
    for (const y of ["2026", "2024"]) expect(optionCounts(more, f, "year", [y])[y]).toBe(applyFilters(more, { ...f, year: y }).length);
    expect(passes(more[1], { ...f, year: "2026" }, "year")).toBe(true);
    expect(passes(more[1], { ...f, year: "2026" })).toBe(false);
  });

  it("sorts with missing figures last either way", () => {
    expect(sortRows(rows, "listingPct", "desc").map((r) => r.id)).toEqual([1, 2, 3]);
    expect(sortRows(rows, "listingPct", "asc").map((r) => r.id)).toEqual([2, 1, 3]);
    expect(sortRows(rows, "name", "asc").map((r) => r.id)).toEqual([1, 2, 3]);
    expect(sortRows(rows, "date", "desc").map((r) => r.id)).toEqual([3, 1, 2]);
  });

  it("summarises what is shown", () => {
    const s = summarise(rows);
    expect([s.count, s.listed, s.above, s.below, s.medianGain, s.medianSince, s.raisedCr]).toEqual([3, 2, 1, 1, 27.665, 54, 1775]);
    expect(median([])).toBeNull();
    expect(yearOf(rows[1])).toBe("2024");
  });

  it("keeps filters and sort in the address", () => {
    const p = paramsFromFilters({ ...NO_FILTERS, board: "sme", year: "2024" }, "listingPct", "asc");
    expect(p).toEqual({ board: "sme", year: "2024", sort: "listingPct", dir: "asc" });
    expect(filtersFromParams(new URLSearchParams(p))).toEqual({ ...NO_FILTERS, board: "sme", year: "2024" });
  });

  it("writes a CSV a spreadsheet will not run", () => {
    const csv = toCsv([row({ name: "=HYPERLINK(1)", listingPct: -10 })]).split("\n");
    expect(csv[0].startsWith("Company,Symbol,Board")).toBe(true);
    expect(csv[1].startsWith("\"'=HYPERLINK(1)\",A,Mainboard,Listed")).toBe(true);
    expect(csv[1]).toContain(",-10,");                       // numbers stay numbers
  });
});
