// 22 Nov 2026: a broker's holdings report, read whole on both portfolio pages. The member's file (an .xlsx export): two summary lines (Invested, Current,
// Overall P&L, Day P&L), then "Symbol (52) · Qty. · Pledged · Avg. price · LTP · Day P&L · Day % · Overall P&L · Overall % · Current · Invested", one line per
// share or ETF, symbols only (no ISIN), prices written "+1,310.50" and totals in Indian grouping ("1,04,351.00"). On the live site:
//   - Equity portfolio: 42 of the 43 shares waited under "Please check (not added yet)" (a line without an ISIN was always held back, even an exact NSE
//     symbol), only 20 of them were listed, and two BSE-only companies, named by their BSE scrip IDs (no NSE listing), were "not recognised".
//   - ETF portfolio: "No ISIN or symbol column was found in that file": the heading "Symbol (52)" was not read as Symbol. The buy price was never read.
// The layout below is the member's, with sample symbols and amounts (no real holdings).
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { rowsWithBseIds, type SearchIndex, type SearchRow } from "./api";
import { entriesWithAmounts, gridsFromFile, type Grid } from "./holdingsFile";
import { makeLookup, matchEntries } from "./holdingsMatch";
import { bookAfterImport, fundsFromMissing } from "./importFunds";
import { avgBySymbol, etfRowsFromGrid, toSend, type Preview } from "./etfPortfolio";

const HEAD = ["Symbol (7)", "Qty.", "Pledged", "Avg. price", "LTP", "Day P&L", "Day %", "Overall P&L", "Overall %", "Current", "Invested"];
const AOA: (string | number)[][] = [
  ["Invested", "Current", "Overall P&L", "Day P&L"],
  ["6,12,345.00", "6,48,210.40", "+35,865.40 (+5.86%)", "+1,204.10 (+0.19%)"],
  HEAD,
  ["RELIANCE", 40, "--", "+1,310.50", "+1,402.20", "+0.00", "+0.00%", "+3,668.00", "+7.00%", "+56,088.00", "52,420.00"],
  ["BSE", 12, "--", "+2,210.00", "+2,650.00", "+0.00", "+0.00%", "+5,280.00", "+19.91%", "+31,800.00", "26,520.00"],
  ["ZZPRIME", 30, "--", "+118.40", "+92.10", "+0.00", "+0.00%", "-789.00", "-22.21%", "+2,763.00", "3,552.00"],
  ["HDFCBANK", 75, "--", "+1,688.00", "+1,950.40", "+0.00", "+0.00%", "+19,680.00", "+15.55%", "+1,46,280.00", "1,26,600.00"],
  ["NIFTYBEES", 150, "--", "+262.40", "+288.10", "+0.00", "+0.00%", "+3,855.00", "+9.79%", "+43,215.00", "39,360.00"],
  ["GOLDBEES", 600, "--", "+61.25", "+98.40", "+0.00", "+0.00%", "+22,290.00", "+60.65%", "+59,040.00", "36,750.00"],
  ["HDFCMID150", 1000, "--", "+19.80", "+22.10", "+0.00", "+0.00%", "+2,300.00", "+11.62%", "+22,100.00", "19,800.00"],
];
const ROWS: SearchRow[] = [
  ["RELIANCE", "Reliance Industries Ltd", "500325", 1],
  ["HDFCBANK", "HDFC Bank Ltd", "500180", 1],
  ["BSE", "BSE Ltd", "", 1],
  ["999425", "Zz Prime Infra Ltd", "999425", 0],              // a BSE-only company: its symbol is its BSE code
];
const IDX: SearchIndex = { fields: ["symbol", "name", "bse", "ready", "nse"], rows: ROWS, bseId: ["", "", "", "ZZPRIME"] };

async function grid(): Promise<Grid> {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(AOA), "All (7)");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const [g] = await gridsFromFile(new File([buf], "Holdings_22-Nov-2026_22.54.20.xlsx"));
  return g;
}

describe("Equity portfolio: the report's shares are added with their quantity and buy price", () => {
  it("every share is found and none waits under Please check; the ETFs go on to the ETF portfolio with theirs", async () => {
    const g = await grid();
    const r = entriesWithAmounts(g);
    expect(r.amounts).toMatchObject({ qty: "Qty.", price: "Avg. price", priceHow: "column", trades: false });
    expect(r.entries).toHaveLength(7);
    const m = matchEntries(r.entries, rowsWithBseIds(IDX), null, true);
    expect(m.found.map((f) => [f.input, f.symbol])).toEqual([["RELIANCE", "RELIANCE"], ["BSE", "BSE"], ["ZZPRIME", "999425"], ["HDFCBANK", "HDFCBANK"]]);
    expect(m.check).toEqual([]);
    const amounts = Object.fromEntries(r.entries.map((e) => [e.name, [e.qty, e.avg]]));
    expect(amounts).toMatchObject({ RELIANCE: [40, 1310.5], ZZPRIME: [30, 118.4], HDFCBANK: [75, 1688] });
    expect(m.missing).toEqual(["NIFTYBEES", "GOLDBEES", "HDFCMID150"]);
    expect(fundsFromMissing(m.missing, r.entries)).toEqual([
      { input: "NIFTYBEES", symbol: "NIFTYBEES", qty: 150, avg: 262.4, rate: 288.1 },
      { input: "GOLDBEES", symbol: "GOLDBEES", qty: 600, avg: 61.25, rate: 98.4 },
      { input: "HDFCMID150", symbol: "HDFCMID150", qty: 1000, avg: 19.8, rate: 22.1 },
    ]);
  });
  it("a company named only by its BSE scrip ID is not recognised on an older list (no bseId): it is never guessed", async () => {
    const r = entriesWithAmounts(await grid());
    const m = matchEntries(r.entries, rowsWithBseIds({ ...IDX, bseId: undefined }), null, true);
    expect(m.missing).toContain("ZZPRIME");
    expect(m.found.map((f) => f.symbol)).not.toContain("999425");
  });
  it("a name still waits for the member; an exact symbol or code does not", () => {
    const m = matchEntries([{ name: "Reliance Industries Ltd" }, { name: "500180" }, { name: "zzprime" }], rowsWithBseIds(IDX), null, true);
    expect(m.found.map((f) => [f.symbol, f.code])).toEqual([["HDFCBANK", true], ["999425", true]]);
    expect(m.check.map((c) => [c.symbol, c.note])).toEqual([["RELIANCE", "No ISIN on this line, so it is matched by its name: please check"]]);
  });
});

describe("the BSE scrip ID in the company list", () => {
  it("is taken only after every NSE symbol and code, so it never hides another company's NSE symbol", () => {
    const rows: SearchRow[] = [["999001", "Zz Bse Only Ltd", "999001", 0, undefined, "MARINE"], ["MARINE", "Marine Electricals (India) Ltd", "", 1]];
    const { find } = makeLookup(rows);
    expect(find("MARINE")?.row[0]).toBe("MARINE");          // the NSE symbol wins over a BSE-only company's scrip ID of the same letters
    expect(find("999001")?.row[0]).toBe("999001");
  });
  it("comes in place 6 of a row; an older server's list (no bseId) is returned as it is", () => {
    expect(rowsWithBseIds(IDX)[3]).toEqual(["999425", "Zz Prime Infra Ltd", "999425", 0, undefined, "ZZPRIME"]);
    expect(rowsWithBseIds(IDX)[0]).toBe(ROWS[0]);
    expect(rowsWithBseIds({ ...IDX, bseId: undefined })).toBe(ROWS);
    expect(rowsWithBseIds(undefined)).toEqual([]);
  });
});

describe("ETF portfolio: the same report is read, with each line's quantity and average buy price", () => {
  it("finds the heading row under the summary lines ('Symbol (7)', 'Qty.', 'Avg. price') and reads every line", async () => {
    const rows = etfRowsFromGrid(await grid());
    expect(rows.map((r) => [r.row, r.symbol, r.qty, r.avg])).toEqual([
      [4, "RELIANCE", "40", 1310.5], [5, "BSE", "12", 2210], [6, "ZZPRIME", "30", 118.4], [7, "HDFCBANK", "75", 1688],
      [8, "NIFTYBEES", "150", 262.4], [9, "GOLDBEES", "600", 61.25], [10, "HDFCMID150", "1000", 19.8],
    ]);
    expect(toSend(rows)[4]).toEqual({ row: 8, symbol: "NIFTYBEES", qty: "150" });     // the buy price stays in the browser
  });
  it("works the buy price out from Invested ÷ quantity when there is no average column, and stops at a Total line", () => {
    const g: Grid = [["Instrument", "Qty", "Invested"], ["NIFTYBEES", "100", "26,500.00"], ["Total", "", "26,500.00"], ["GOLDBEES", "5", "500"]];
    expect(etfRowsFromGrid(g)).toEqual([{ row: 2, symbol: "NIFTYBEES", qty: "100", avg: 265 }]);
  });
  it("still reads a plain ISIN list and a file with ISIN and quantity headings", () => {
    expect(etfRowsFromGrid([["INF204KB14I2"], ["note"]])).toEqual([{ row: 1, isin: "INF204KB14I2" }]);
    expect(etfRowsFromGrid([["ISIN", "Quantity"], ["INF204KB14I2", "1,200"]])).toEqual([{ row: 2, isin: "INF204KB14I2", qty: "1200" }]);
  });
  it("gives each imported ETF its buy price; an ETF on two lines gets the quantity-weighted price", () => {
    const raws = [{ row: 2, symbol: "NIFTYBEES", qty: "100", avg: 250 }, { row: 3, symbol: "NIFTYBEES", qty: "300", avg: 290 }, { row: 4, symbol: "GOLDBEES", qty: "10" }];
    const etf = (symbol: string) => ({ symbol, name: symbol, fundHouse: null });
    const pv: Pick<Preview, "rows"> = { rows: [
      { i: 0, row: 2, name: null, isin: null, symbol: "NIFTYBEES", qty: 400, status: "matched", reason: "", existing: false, etf: etf("NIFTYBEES") },
      { i: 1, row: 3, name: null, isin: null, symbol: "NIFTYBEES", qty: 300, status: "duplicate", reason: "", existing: false, etf: etf("NIFTYBEES") },
      { i: 2, row: 4, name: null, isin: null, symbol: "GOLDBEES", qty: 10, status: "matched", reason: "", existing: false, etf: etf("GOLDBEES") },
    ] };
    expect([...avgBySymbol(pv, raws)]).toEqual([["NIFTYBEES", 280]]);           // (100 × 250 + 300 × 290) ÷ 400; GOLDBEES had no price in the file
  });
});

describe("the ETF book after an import from the equity page", () => {
  const lot = (id: string, symbol: string, qty: number, price: number | null, extra: object = {}) => ({ id, symbol, pf: "main", side: "buy" as const, qty, price, date: null, ...extra });
  it("adds a buy for an ETF with none, keeps an ETF's own buys, and corrects a single earlier import buy made at the line before's price", () => {
    let n = 0;
    const lots = [lot("impA", "SMPLFANG", 120, 88.2), lot("own1", "SMPLGOLD", 10, 60), lot("own2", "SMPLGOLD", 5, 70), lot("impB", "SMPLHK", 2000, 18.4),
      lot("legacy:SMPLNEW", "SMPLNEW", 9, null, { legacy: true })];
    const r = bookAfterImport(lots, [{ symbol: "SMPLFANG", qty: 120, price: 150.75 }, { symbol: "SMPLGOLD", qty: 15, price: 61 }, { symbol: "SMPLHK", qty: 2000, price: 18.4 },
      { symbol: "SMPLNEW", qty: 9, price: 100 }], "main", () => "imp" + ++n);
    expect(r.fixed).toEqual(["SMPLFANG"]);                    // the shifted price is put right
    expect(r.added).toEqual(["SMPLNEW"]);                     // a quantity-only line takes the file's buy
    expect(r.lots.map((l) => [l.id, l.symbol, l.qty, l.price])).toEqual([
      ["impA", "SMPLFANG", 120, 150.75], ["own1", "SMPLGOLD", 10, 60], ["own2", "SMPLGOLD", 5, 70], ["impB", "SMPLHK", 2000, 18.4], ["imp1", "SMPLNEW", 9, 100]]);
  });
  it("never touches a buy the member made, or an import buy whose quantity has changed since", () => {
    const r = bookAfterImport([lot("a1b2", "SMPLFANG", 120, 88.2), lot("impC", "SMPLHK", 1000, 30)], [{ symbol: "SMPLFANG", qty: 120, price: 150.75 }, { symbol: "SMPLHK", qty: 2000, price: 18.4 }], "main", () => "x");
    expect(r.fixed).toEqual([]); expect(r.added).toEqual([]);
  });
});
