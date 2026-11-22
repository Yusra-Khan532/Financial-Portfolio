// Developer file 29: a broker's mutual fund holdings report writes how many funds it lists after the first heading ("Fund (12)", "Scheme (12)",
// "Instrument (12)"), as its share report writes "Symbol (52)". The MF reader read "Fund (12)" as the words "fund 12", which no name rule takes, so a file
// with no ISIN column was refused: "no header found". The count is now dropped first, as the ETF and equity readers already do (developer file 26).
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { fieldOf, statementFromFile, statementFromGrids } from "./mfStatement";

describe("a heading with a count after it", () => {
  it.each([["Fund (12)", "name"], ["Scheme (12)", "name"], ["Instrument (12)", "name"], ["Fund (1)", "name"], ["Scheme Name (3)", "name"], ["Fund ( 12 )", "name"],
    ["Qty. (12)", "units"], ["Units (1,204)", "units"], ["Avg. NAV", "avgCost"], ["Invested", "invested"], ["Current", "current"]])("%s -> %s", (h, want) => expect(fieldOf(h)).toBe(want));
  it("keeps what is not a count: a unit or a period in brackets", () => {
    expect(fieldOf("Invested Amount (₹)")).toBe("invested");
    expect(fieldOf("Returns (1Y)")).toBeNull();
    expect(fieldOf("Fund House (AMC)")).toBeNull();
  });
});

// a broker report in the same layout as its share report: two summary lines, then the headings, one line per fund, no ISIN (sample funds and amounts)
const REPORT = [
  ["Invested", "Current", "Overall P&L", "", "", "", ""],
  ["1,50,000.00", "1,72,450.00", "+22,450.00", "", "", "", ""],
  [],
  ["Fund (3)", "Qty.", "Avg. NAV", "NAV", "Invested", "Current", "P&L"],
  ["Sample Flexi Cap Fund - Direct Plan - Growth", "1,204.551", "41.51", "47.20", "50,000.00", "56,854.81", "+6,854.81"],
  ["Sample Liquid Fund - Direct Plan - Growth", "18.204", "2,746.65", "2,801.10", "50,000.00", "50,991.24", "+991.24"],
  ["Sample Small Cap Fund - Regular Plan - Growth", "1,602.300", "31.21", "40.37", "50,000.00", "64,604.95", "+14,604.95"],
  ["Total", "", "", "", "1,50,000.00", "1,72,450.00", "+22,450.00"],
];

describe("a broker's MF holdings report named by fund, with a count after the heading", () => {
  it("is read: the heading row under the summary lines, each fund's units, average NAV and amounts, the total line skipped", () => {
    const st = statementFromGrids([REPORT]);
    expect(st.rows.map((r) => [r.name, r.units, r.avgCost, r.invested, r.current])).toEqual([
      ["Sample Flexi Cap Fund - Direct Plan - Growth", "1,204.551", "41.51", "50,000.00", "56,854.81"],
      ["Sample Liquid Fund - Direct Plan - Growth", "18.204", "2,746.65", "50,000.00", "50,991.24"],
      ["Sample Small Cap Fund - Regular Plan - Growth", "1,602.300", "31.21", "50,000.00", "64,604.95"]]);
    expect(st.headers).toMatchObject({ name: "Fund (3)", units: "Qty.", avgCost: "Avg. NAV", nav: "NAV", invested: "Invested", current: "Current" });
    expect(st.skippedTotal).toBe(1);
  });
  it("the same from an .xlsx file, and with Scheme (3) or Instrument (3) as the heading", async () => {
    for (const head of ["Fund (3)", "Scheme (3)", "Instrument (3)"]) {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...REPORT.slice(0, 3), [head, ...REPORT[3].slice(1)], ...REPORT.slice(4)]), "Holdings");
      const st = await statementFromFile(new File([XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer], "mf-holdings.xlsx"));
      expect(st.rows.map((r) => r.name)).toEqual(REPORT.slice(4, 7).map((r) => r[0]));
    }
  });
});
