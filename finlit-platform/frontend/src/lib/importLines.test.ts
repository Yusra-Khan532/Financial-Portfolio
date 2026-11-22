// Developer file 30: "Line" in the MF and ETF import reviews is the line in the file. The file reader leaves blank lines out of its grid, and the reviews
// numbered the grid, so a report with a blank line under its summary showed each holding one line early ("Line 4" for a fund on line 5), and a sheet that
// starts lower than row 1 was short by the rows above it. Sample funds, ETFs and amounts only.
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { gridFromText, gridsFromFile } from "./holdingsFile";
import { lineOf } from "./gridLines";
import { statementFromFile, statementFromGrids } from "./mfStatement";
import { etfRowsFromFile, etfRowsFromGrid } from "./etfPortfolio";

/** origin: the sheet's first used cell; its range then starts there, as in a broker file whose table starts lower down */
const sheet = (aoa: unknown[][], origin?: string) => {
  if (!origin) return XLSX.utils.aoa_to_sheet(aoa);
  const ws = XLSX.utils.sheet_add_aoa({} as XLSX.WorkSheet, aoa, { origin });
  ws["!ref"] = XLSX.utils.encode_range({ s: XLSX.utils.decode_cell(origin), e: XLSX.utils.decode_range(ws["!ref"] as string).e });
  return ws;
};
const xlsx = (aoa: unknown[][], name: string, origin?: string) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(aoa, origin), "Holdings");
  return new File([XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer], name);
};
const lines = (g: string[][]) => g.map((_, i) => lineOf(g, i));

describe("each row keeps its line in the file", () => {
  it("text: blank lines are counted, a quoted cell over two lines is one line, CRLF and CR alike", () => {
    expect(lines(gridFromText("Invested,Current\n1,2\n\nFund (2),Qty.\nA,1\n\n\nB,2\n"))).toEqual([1, 2, 4, 5, 8]);
    expect(lines(gridFromText("Name,Note\r\nA,\"two\r\nlines\"\r\n\r\nB,x"))).toEqual([1, 2, 4]);
    expect(lines(gridFromText("Name;Qty\r\r\nA;1"))).toEqual([1, 3]);
  });
  it("Excel: the sheet's own row numbers, also when the sheet starts lower than row 1", async () => {
    const [g] = await gridsFromFile(xlsx([["Title"], [], ["Fund", "Qty"], ["A", "1"], [], ["B", "2"]], "a.xlsx"));
    expect(g).toEqual([["Title", ""], ["Fund", "Qty"], ["A", "1"], ["B", "2"]]);              // the grid itself is as before: blank lines left out
    expect(lines(g)).toEqual([1, 3, 4, 6]);
    const [low] = await gridsFromFile(xlsx([["Fund", "Qty"], [], ["A", "1"]], "b.xlsx", "C4"));
    expect(lines(low)).toEqual([4, 6]);
  });
  it("a CSV file read from disk numbers its lines the same way", async () => {
    const [g] = await gridsFromFile(new File(["Report\n\nFund,Qty\nA,1\n"], "c.csv"));
    expect(lines(g)).toEqual([1, 3, 4]);
  });
  it("a grid that was not read from a file is numbered by place, as before", () => {
    expect(lines([["a"], ["b"]])).toEqual([1, 2]);
  });
});

// a broker's report: two summary lines, a blank line, the headings, then one line per holding, a blank line inside the table, and the Total line
const MF = [["Invested", "Current", "", "", ""], ["1,00,000.00", "1,10,000.00", "", "", ""], [],
  ["Fund (2)", "Qty.", "Avg. NAV", "Invested", "Current"],
  ["Sample Flexi Cap Fund - Direct Plan - Growth", "1,204.551", "41.51", "50,000.00", "56,854.81"], [],
  ["Sample Liquid Fund - Direct Plan - Growth", "18.204", "2,746.65", "50,000.00", "53,145.19"],
  ["Total", "", "", "1,00,000.00", "1,10,000.00"]];

describe("the MF review shows each fund's line in the file", () => {
  it("from an .xlsx: lines 5 and 7, not 4 and 5", async () => {
    const st = await statementFromFile(xlsx(MF, "mf-report.xlsx"));
    expect(st.rows.map((r) => [r.row, r.name])).toEqual([[5, "Sample Flexi Cap Fund - Direct Plan - Growth"], [7, "Sample Liquid Fund - Direct Plan - Growth"]]);
  });
  it("from a .csv: the same lines", async () => {
    const csv = MF.map((r) => r.map((c) => (String(c).includes(",") ? `"${c}"` : c)).join(",")).join("\n");
    const st = await statementFromFile(new File([csv], "mf-report.csv"));
    expect(st.rows.map((r) => r.row)).toEqual([5, 7]);
  });
  it("what is read is unchanged: the same funds, units and amounts as from the same grid with no blank lines", async () => {
    const st = await statementFromFile(xlsx(MF, "mf-report.xlsx"));
    const same = statementFromGrids([MF.filter((r) => r.length) as string[][]]);
    expect(st.rows.map(({ row: _r, ...x }) => x)).toEqual(same.rows.map(({ row: _r, ...x }) => x));
    expect(st.skippedTotal).toBe(same.skippedTotal);
  });
});

const ETF = [["Invested", "Current", "", ""], ["2,00,000.00", "2,10,000.00", "", ""], [],
  ["Symbol (3)", "Qty.", "Avg. price", "Invested"], ["NIFTYBEES", "100", "250.00", "25,000.00"], [], ["GOLDBEES", "200", "60.00", "12,000.00"], ["ZZSAMPLECO", "10", "100.00", "1,000.00"]];

describe("the ETF review shows each line's place in the file", () => {
  it("from an .xlsx: lines 5, 7 and 8", async () => {
    const rows = await etfRowsFromFile(xlsx(ETF, "etf-report.xlsx"));
    expect(rows.map((r) => [r.row, r.symbol, r.qty, r.avg])).toEqual([[5, "NIFTYBEES", "100", 250], [7, "GOLDBEES", "200", 60], [8, "ZZSAMPLECO", "10", 100]]);
  });
  it("a list of ISINs with no heading keeps the lines too; a grid built in the page is numbered by place", async () => {
    const rows = await etfRowsFromFile(new File(["My ETFs\n\nINF204KB14I2\n\nINF204KC1402\n"], "isins.csv"));
    expect(rows.map((r) => r.row)).toEqual([3, 5]);
    expect(etfRowsFromGrid([["Symbol", "Qty"], ["NIFTYBEES", "1"]]).map((r) => r.row)).toEqual([2]);
  });
});
