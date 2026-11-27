import { describe, expect, it } from "vitest";
import { companyRank, rankCompanies, type CompanyRow } from "./companySearch";

const ROWS: CompanyRow[] = [
  ["RPOWER", "Reliance Power Ltd", null, 1],
  ["RELINFRA", "Reliance Infrastructure Ltd", null, 1],
  ["RELIANCE", "Reliance Industries Ltd", null, 1],
  ["TCS", "Tata Consultancy Services Ltd", null, 1],
  ["TATAMOTORS", "Tata Motors Ltd", null, 1],
  ["TATASTEEL", "Tata Steel Ltd", null, 1],
  ["HDFCBANK", "HDFC Bank Ltd", null, 1],
  ["INFY", "Infosys Ltd", null, 1],
  ["^NIFTY50", "NIFTY 50", null, 1],
  ["M&M", "Mahindra & Mahindra Ltd", null, 1],
];
const syms = (q: string, ex: string[] = []) => rankCompanies(ROWS, q, 8, ex).map((h) => h.symbol);

describe("company search", () => {
  it("finds RELIANCE from the typo 'relaince', ahead of other Reliance companies", () => {
    expect(syms("relaince")[0]).toBe("RELIANCE");
    expect(syms("relaince")).toContain("RPOWER");
  });
  it("puts an exact symbol first, then symbol prefixes", () => {
    expect(syms("tcs")[0]).toBe("TCS");
    expect(syms("TATA").slice(0, 2)).toEqual(["TATASTEEL", "TATAMOTORS"]); // shorter symbol first among prefixes
    expect(companyRank("TCS", "TCS", "Tata Consultancy Services Ltd")).toBeGreaterThan(companyRank("TCS", "TCSX", "x"));
  });
  it("matches name words: 'tata motors' and 'consultancy'", () => {
    expect(syms("tata motors")[0]).toBe("TATAMOTORS");
    expect(syms("consultancy")).toEqual(["TCS"]);
    expect(syms("infosys")[0]).toBe("INFY");
  });
  it("ranks symbol over name: 'infy' is the symbol INFY", () => {
    expect(syms("infy")[0]).toBe("INFY");
  });
  it("tolerates a typo in a name word: 'infosis', 'mahindra'", () => {
    expect(syms("infosis")).toContain("INFY");
    expect(syms("mahindra")[0]).toBe("M&M");
  });
  it("leaves out indices, excluded symbols and empty queries", () => {
    expect(syms("nifty")).toEqual([]);
    expect(syms("reliance", ["RELIANCE"])).not.toContain("RELIANCE");
    expect(syms("   ")).toEqual([]);
    expect(rankCompanies(undefined, "tcs")).toEqual([]);
  });
  it("does not match unrelated text", () => {
    expect(syms("zzzz")).toEqual([]);
  });
});

// Task #274 (equity pack, change 1, reference/companySearch.patch.md): over the live search index of 20 Nov 2026 (5,844 companies, index order = size).
import LIVE from "./__fixtures__/search-index-20nov.json";
const L = LIVE as unknown as CompanyRow[];
const live = (q: string, n = 8) => rankCompanies(L, q, n).map((h) => h.name);
describe("company search over the full live index (task #274)", () => {
  it("'aarti' gives the four Aartis and nothing else", () => {
    expect(new Set(live("aarti"))).toEqual(new Set(["Aarti Industries Ltd", "Aarti Surfactants Ltd", "Aarti Drugs Ltd", "Aarti Pharmalabs Ltd"]));
  });
  it("'aarti pharma' gives Aarti Pharmalabs only", () => { expect(live("aarti pharma")).toEqual(["Aarti Pharmalabs Ltd"]); });
  it("'relaince' and 'relai' put Reliance Industries first", () => {
    expect(live("relaince")[0]).toBe("Reliance Industries Ltd");
    expect(live("relai")[0]).toBe("Reliance Industries Ltd");
  });
  it("a BSE code matches exactly or by its start, never as a close match: '526433' gives ASM Technologies only", () => {
    expect(live("526433")).toEqual(["Asm Technologies Ltd"]);
    expect(companyRank("526433", "526434", "Other Ltd")).toBe(0);
  });
  it("'tata mot' gives Tata Motors companies first", () => {
    expect(live("tata mot").slice(0, 2).every((n) => /^Tata Motors/.test(n))).toBe(true);
  });
  it("nonsense finds nothing", () => { expect(live("zzzqq")).toEqual([]); });
});
