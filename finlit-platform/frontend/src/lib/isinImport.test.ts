import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchIndex, SearchRow } from "./api";
import { entriesFromGrid, gridFromText } from "./holdingsFile";
import { entriesFrom, entryOf, matchEntries, matchNames } from "./holdingsMatch";
import { findHoldings, findHoldingsInRows, isSure, type PdfRow } from "./holdingsPdf";
import { isinIn, isinValid, localAnswers, resolveIsins, sourcesLine, type IsinAnswer } from "./isin";

// Task #128: "in equity portfolio not taking correct name, read by ISIN code, don't read by name of company as it can get differ".
// Real companies and ISINs from the live company list and NSDL's ISIN list of 12 Nov 2026.
// Rows and ISINs exactly as the live list sends them (14 Nov 2026): Triton Corp has since been renamed Homre, so its old name finds Triton Valves.
const ROWS: SearchRow[] = [
  ["RELIANCE", "Reliance Industries Ltd", "500325", 1],
  ["ATLANTAELE", "Atlanta Electricals Ltd", "544527", 1],
  ["ATLANTAA", "ATLANTAA Ltd", "532759", 1],
  ["LALPATHLAB", "Dr Lal Path Labs Ltd", "539524", 1],
  ["TRITONV", "Triton Valves Ltd", "505978", 1],
  ["523387", "Homre Ltd", "523387", 1],
  ["HDFCBANK", "HDFC Bank Ltd", "500180", 1],
];
const ISINS = ["INE002A01018", "INE0Z4F01028", "INE285H01022", "INE600L01024", "INE440G01017", "INE982C01033", "INE040A01034"];
const IDX: SearchIndex = { fields: ["symbol", "name", "bse", "ready", "nse"], rows: ROWS, isin: ISINS };
const answers = (extra: IsinAnswer[] = []) => new Map([...localAnswers(ISINS.filter(Boolean), IDX), ...extra.map((a) => [a.isin, a] as const)]);
const FUND: IsinAnswer = { isin: "INF204KB14I2", status: "not_share", symbol: null, name: null, how: null, note: "An exchange-traded fund (Nippon India ETF Nifty BeES), not a company's share. Its own page is under ETFs." };

describe("the ISIN itself", () => {
  it("checks the check digit, so a mistyped ISIN is never matched", () => {
    for (const real of ["INE002A01018", "INE285H01022", "INE600L01024", "INF204KB14I2", "IN0020230085"]) expect(isinValid(real)).toBe(true);
    expect(isinValid("INE002A01019")).toBe(false);
    expect(isinValid("RELIANCE")).toBe(false);
  });
  it("finds an ISIN written inside a cell", () => {
    expect(isinIn("INE002A01018 RELIANCE INDUSTRIES LTD")).toBe("INE002A01018");
    expect(isinIn("ISIN: ine002a01018")).toBe("INE002A01018");
    expect(isinIn("INFOSYS LTD")).toBeUndefined();
    expect(isinIn("INE009A01022")).toBe("INE009A01022");                       // a mistyped ISIN is still the line's ISIN (and is then said to be invalid)
  });
  it("a mistyped ISIN is reported as not valid, never matched by the line's name", () => {
    const a = localAnswers(["INE009A01022"], IDX).get("INE009A01022");
    expect(a?.status).toBe("invalid");
    const r = matchEntries([{ name: "INFOSYS LIMITED", isin: "INE009A01022" }], [...ROWS, ["INFY", "Infosys Ltd", "500209", 1]], localAnswers(["INE009A01022"], IDX));
    expect(r.found).toEqual([]); expect(r.skipped[0].note).toMatch(/Not a valid ISIN/);
    expect(entryOf("INE009A01022")).toEqual({ isin: "INE009A01022", name: "" });
  });
});

describe("reading a broker file keeps each line's ISIN beside its name", () => {
  it("a file with an ISIN column and a name column (the bug: the ISIN was thrown away)", () => {
    const grid = gridFromText("Company Name,ISIN,Qty,Avg price\nATLANTA LIMITED,INE285H01022,100,12.5\nDR. LAL PATHLABS LIMITED,INE600L01024,5,2400\nTotal,,105,\n");
    // task #323: each line also brings its quantity and average buy price from the file's Qty and Avg price columns
    expect(entriesFromGrid(grid)).toEqual([{ name: "ATLANTA LIMITED", isin: "INE285H01022", qty: 100, avg: 12.5, avgHow: "column", lines: 1 }, { name: "DR. LAL PATHLABS LIMITED", isin: "INE600L01024", qty: 5, avg: 2400, avgHow: "column", lines: 1 }]);
  });
  it("an ISIN-only column, a pasted list of ISINs and ISINs on one line", () => {
    expect(entriesFrom("ISIN\nINE002A01018\nINE040A01034\n")).toEqual([{ name: "", isin: "INE002A01018" }, { name: "", isin: "INE040A01034" }]);
    expect(entriesFrom("INE002A01018\nINE040A01034")).toEqual([{ name: "", isin: "INE002A01018" }, { name: "", isin: "INE040A01034" }]);
    expect(entriesFrom("INE002A01018, INE040A01034").map((e) => e.isin)).toEqual(["INE002A01018", "INE040A01034"]);
  });
  it("an ISIN inside the name cell, and lines with and without an ISIN in one file", () => {
    expect(entriesFrom("Security\nINE002A01018 RELIANCE INDUSTRIES LTD\nHDFC Bank\n", (n) => matchNames([n], ROWS).found.length > 0))
      .toEqual([{ isin: "INE002A01018", name: "RELIANCE INDUSTRIES LTD" }, { name: "HDFC Bank" }]);
    const grid = gridFromText("Symbol,ISIN\nRELIANCE,INE002A01018\nHDFCBANK,\n");
    expect(entriesFromGrid(grid, (n) => matchNames([n], ROWS).found.length > 0)).toEqual([{ name: "RELIANCE", isin: "INE002A01018" }, { name: "HDFCBANK" }]);
  });
  it("a file without ISINs reads its names exactly as before", () => {
    expect(entriesFrom("RELIANCE\nHDFC Bank\n")).toEqual([{ name: "RELIANCE" }, { name: "HDFC Bank" }]);
  });
  it("a typed ISIN is an ISIN, a typed name is a name", () => {
    expect(entryOf(" ine002a01018 ")).toEqual({ isin: "INE002A01018", name: "" });
    expect(entryOf("Reliance")).toEqual({ name: "Reliance" });
  });
});

describe("matching: the ISIN decides, the name never overrides it", () => {
  it("the original bug: names alone go to the wrong company or to none", () => {
    const byName = matchNames(["ATLANTA LIMITED", "DR. LAL PATHLABS LIMITED", "TRITON CORP LIMITED"], ROWS);
    expect(byName.found.map((f) => [f.input, f.symbol])).toEqual([["ATLANTA LIMITED", "ATLANTAELE"], ["TRITON CORP LIMITED", "TRITONV"]]);   // both the wrong company
    expect(byName.missing).toEqual(["DR. LAL PATHLABS LIMITED"]);                                                                         // and one not found at all
  });
  it("by ISIN each line is its own company, whatever the file calls it", () => {
    const entries = [{ name: "ATLANTA LIMITED", isin: "INE285H01022" }, { name: "DR. LAL PATHLABS LIMITED", isin: "INE600L01024" }, { name: "TRITON CORP LIMITED", isin: "INE982C01033" },
      { name: "Some Other Name Entirely", isin: "INE002A01018" }];
    const r = matchEntries(entries, ROWS, answers());
    expect(r.found.map((f) => [f.symbol, f.name, f.how])).toEqual([["ATLANTAA", "ATLANTAA Ltd", "isin"], ["LALPATHLAB", "Dr Lal Path Labs Ltd", "isin"], ["523387", "Homre Ltd", "isin"], ["RELIANCE", "Reliance Industries Ltd", "isin"]]);
    expect(r.byIsin).toBe(4);
    expect(r.check).toEqual([]); expect(r.skipped).toEqual([]); expect(r.missing).toEqual([]);
  });
  it("a fund unit, a bond, an unknown or a mistyped ISIN is not added, and says why; it is never matched by its name", () => {
    const bond: IsinAnswer = { isin: "INE002A07023", status: "not_share", symbol: null, name: null, how: null, note: "Not an ordinary share: RIL NCD (a bond, debenture, rights entitlement or another security)." };
    const r = matchEntries([{ name: "NIPPON INDIA ETF NIFTY BEES", isin: FUND.isin }, { name: "Reliance Industries", isin: bond.isin }], ROWS, answers([FUND, bond]));
    expect(r.found).toEqual([]);
    expect(r.skipped.map((s) => s.note)).toEqual([FUND.note, bond.note]);                // "Reliance Industries" with a bond's ISIN is not the share
  });
  it("a match the server is not sure of is offered to check, not added", () => {
    const old: IsinAnswer = { isin: "INE285H01014", status: "check", symbol: "ATLANTAA", name: "Atlanta Ltd", how: "issuer", note: "The exchanges do not list this ISIN; another share ISIN of the same issuer belongs to this company. Please check" };
    const r = matchEntries([{ name: "ATLANTA LTD", isin: old.isin }], ROWS, answers([old]));
    expect(r.found).toEqual([]);
    expect(r.check[0]).toMatchObject({ symbol: "ATLANTAA", how: "issuer" });
  });
  it("when the ISIN cannot be checked (offline), the name is only offered to check", () => {
    const r = matchEntries([{ name: "HDFC Bank", isin: "INE040A01026" }, { name: "", isin: "INE040A01018" }], ROWS, new Map());
    expect(r.found).toEqual([]);
    expect(r.check[0]).toMatchObject({ symbol: "HDFCBANK" }); expect(r.check[0].note).toMatch(/could not be checked/);
    expect(r.skipped[0].note).toMatch(/could not be checked/);
  });
  it("lines without an ISIN are matched by name, as before", () => {
    const r = matchEntries([{ name: "HDFC Bank" }, { name: "No Such Co" }], ROWS, null);
    expect(r.found.map((f) => [f.symbol, f.how])).toEqual([["HDFCBANK", "exact"]]);
    expect(r.missing).toEqual(["No Such Co"]);
  });
});

describe("asking the server only for what the company list does not know", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("listed ISINs are answered locally; the rest in one request, with its sources", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ items: { [FUND.isin]: FUND }, sources: { exchanges: { source: "NSE and BSE instrument lists (Dhan)", loadedAt: "2026-11-14T01:10:00+05:30" }, depository: { source: "NSDL ISIN list", date: "2026-11-12" } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const r = await resolveIsins(["INE002A01018", FUND.isin], IDX);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ isins: [FUND.isin] });   // RELIANCE was not sent
    expect(r.answers.get("INE002A01018")?.symbol).toBe("RELIANCE");
    expect(r.answers.get(FUND.isin)?.status).toBe("not_share");
    expect(sourcesLine(r.sources)).toBe("the NSE and BSE lists (loaded 14 Nov 2026) and NSDL's ISIN list of 12 Nov 2026");
  });
  it("no request when every ISIN is listed; offline is reported", async () => {
    const fetch = vi.fn(async () => { throw new TypeError("network"); });
    vi.stubGlobal("fetch", fetch);
    expect((await resolveIsins(["INE002A01018"], IDX)).offline).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect((await resolveIsins(["INE040A01018"], IDX)).offline).toBe(true);
  });
});

describe("PDF statements: the ISIN on the line decides", () => {
  const row = (i: number, ...t: string[]): PdfRow => ({ cells: t.map((x, c) => ({ t: x, x0: c * 100, x1: c * 100 + 80 })), y: -i * 10, h: 8, page: 0 });
  it("a depository line with its ISIN goes to that company, not to the company its name looks like", () => {
    const rows = [row(0, "ISIN", "Security", "Quantity", "Value"), row(1, "INE285H01022", "ATLANTA LIMITED", "100", "1,250"), row(2, "INE600L01024", "DR. LAL PATHLABS LIMITED", "5", "12,000"),
      row(3, FUND.isin, "NIPPON INDIA ETF NIFTY BEES", "10", "2,700")];
    const before = findHoldings(rows.map((r) => r.cells.map((c) => c.t)), ROWS);
    expect(before.found.map((f) => f.symbol)).not.toContain("ATLANTAA");                     // the bug: by name the PDF never finds Atlanta Ltd or Dr Lal Path Labs
    expect(before.found.map((f) => f.symbol)).not.toContain("LALPATHLAB");
    const f = findHoldingsInRows(rows, ROWS, answers([FUND]));
    expect(f.found.map((x) => [x.symbol, x.how])).toEqual([["ATLANTAA", "isin"], ["LALPATHLAB", "isin"]]);
    expect(f.found.every(isSure)).toBe(true);
    // task #323 (file 21, part 8): an ETF line is kept, with its units, for the ETF portfolio, instead of being listed as not added
    expect(f.missing.join(" ")).not.toMatch(/NIPPON INDIA ETF NIFTY BEES/);
    expect(f.funds).toEqual([{ isin: FUND.isin, input: "NIPPON INDIA ETF NIFTY BEES", qty: 10 }]);
  });
});

describe("task #183: a file's lines without an ISIN are offered to confirm, never added on their own", () => {
  it("from a file, the ISIN lines are added and the name-only lines wait for the member", () => {
    const r = matchEntries([{ name: "x", isin: "INE002A01018" }, { name: "HDFC Bank Ltd" }], ROWS, answers(), true);
    expect(r.found.map((f) => f.symbol)).toEqual(["RELIANCE"]);
    expect(r.check).toHaveLength(1);
    expect(r.check[0]).toMatchObject({ symbol: "HDFCBANK" });
    expect(r.check[0].note).toMatch(/^No ISIN on this line, so it is matched by its name: please check/);
  });
  it("a line that is exactly a listed company's symbol or code is added at once (a broker's holdings report: 42 shares waited under Please check, 22 Nov 2026)", () => {
    const r = matchEntries([{ name: "HDFCBANK" }, { name: "500325" }, { name: "HDFC Bank Ltd" }], ROWS, answers(), true);
    expect(r.found.map((f) => [f.input, f.symbol, f.code])).toEqual([["HDFCBANK", "HDFCBANK", true], ["500325", "RELIANCE", true]]);
    expect(r.check.map((c) => c.input)).toEqual(["HDFC Bank Ltd"]);     // a name still waits for the member
  });
  it("a share typed by name in the add box is the member's own choice and is added at once", () => {
    expect(matchEntries([{ name: "HDFC Bank Ltd" }], ROWS, answers()).found.map((f) => f.symbol)).toEqual(["HDFCBANK"]);
  });
  it("a renamed share is found by its ISIN whatever the file calls it (ZOMATO is ETERNAL, Tata Motors' old share is TMPV)", () => {
    const rows: SearchRow[] = [["ETERNAL", "ETERNAL Ltd", "543320", 1], ["TMPV", "Tata Motors Passenger Vehicles Ltd", "500570", 1], ["TMCV", "Tata Motors Ltd", null, 1]];
    const idx: SearchIndex = { fields: ["symbol", "name", "bse", "ready", "nse"], rows, isin: ["INE758T01015", "INE155A01022", "INE1TAE01010"] };
    const r = matchEntries([{ name: "ZOMATO LIMITED", isin: "INE758T01015" }, { name: "TATA MOTORS LIMITED", isin: "INE155A01022" }], rows, localAnswers(["INE758T01015", "INE155A01022"], idx), true);
    expect(r.found.map((f) => [f.symbol, f.isin])).toEqual([["ETERNAL", "INE758T01015"], ["TMPV", "INE155A01022"]]);
    expect(r.check).toEqual([]);
  });
});
