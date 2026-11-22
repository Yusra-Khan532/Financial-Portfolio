// Developer file 31 (founder, 22 Nov 2026: the "Add holdings" dialog he showed reads a Buy date column and a side column, Buy or Sell): a tradebook
// comes in as each buy and sale with its date, quantity and price, and a holdings file with a buy date as dated buys. Until now a tradebook gave the
// company names only, each as 1 share, and the ETF page read each sale as a holding. Sample symbols, ISINs and amounts only.
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { dayOf, leftAfter, sideOf, tradeColumns, type Trade } from "./tradeColumns";
import { entriesWithAmounts, gridFromText, gridsFromFile } from "./holdingsFile";
import { bookNotes, fileNotes, tradeRows, tradesMessage } from "./importAdd";
import { ledgerOf } from "./ledger";
import type { Holding } from "./portfolio";
import { etfRowsFromGrid, toSend } from "./etfPortfolio";
import { bookAfterImport, etfBuys, type EtfPlan } from "./importFunds";

const TODAY = new Date(2026, 10, 23);

describe("reading a side and a day", () => {
  it("BUY / SELL in a broker's own words", () => {
    expect(["BUY", "buy", "B", "Bought", "Purchase", "SELL", "s", "Sold", "Sale", "sell.", "EQ", "", "Executed", "Bonus"].map(sideOf))
      .toEqual(["buy", "buy", "buy", "buy", "buy", "sell", "sell", "sell", "sell", "sell", null, null, null, null]);
  });
  it("days written day first, with or without a time, as the MF server reads them", () => {
    expect(["15-03-2024", "15/03/2024", "15.03.24", "15 Mar 2024", "15-Mar-24", "Mar 15, 2024", "2024-03-15", "2024/03/15", "15-03-2024 10:15 AM", "2024-03-15T09:15:02", "2024-03-15 09:15:02"]
      .map((v) => dayOf(v, TODAY))).toEqual(Array(11).fill("2024-03-15"));
    expect(["31-02-2024", "2027-01-01", "01-01-1975", "13/13/2024", "yesterday", ""].map((v) => dayOf(v, TODAY))).toEqual([null, null, null, null, null, null]);
  });
});

// a tradebook in Zerodha Console's layout (snake_case headings), and one in Groww's (a Type column, a Value column, a date with a time)
const ZERODHA = [
  ["symbol", "isin", "trade_date", "exchange", "segment", "series", "trade_type", "auction", "quantity", "price", "trade_id", "order_id", "order_execution_time"],
  ["ZZALPHA", "INE000A01011", "2025-01-10", "NSE", "EQ", "EQ", "buy", "false", "10", "100.00", "1", "11", "2025-01-10T09:20:00"],
  ["ZZALPHA", "INE000A01011", "2025-03-05", "NSE", "EQ", "EQ", "buy", "false", "5", "130.00", "2", "12", "2025-03-05T10:00:00"],
  ["ZZBETA", "INE000B01011", "2025-02-01", "NSE", "EQ", "EQ", "buy", "false", "20", "50.00", "3", "13", "2025-02-01T11:00:00"],
  ["ZZALPHA", "INE000A01011", "2025-06-20", "NSE", "EQ", "EQ", "sell", "false", "12", "150.00", "4", "14", "2025-06-20T12:00:00"],
  ["ZZBETA", "INE000B01011", "2025-07-01", "NSE", "EQ", "EQ", "sell", "false", "20", "55.00", "5", "15", "2025-07-01T09:30:00"],
  ["ZZGAMMA", "INE000C01011", "2025-08-01", "NSE", "EQ", "EQ", "sell", "false", "4", "300.00", "6", "16", "2025-08-01T09:30:00"],
];
const GROWW = [
  ["Stock name", "Symbol", "ISIN", "Type", "Quantity", "Value", "Exchange", "Exchange Order Id", "Execution date and time", "Order status"],
  ["Zz Alpha Ltd", "ZZALPHA", "INE000A01011", "BUY", "10", "1000", "NSE", "x1", "10-01-2025 09:20 AM", "Executed"],
  ["Zz Alpha Ltd", "ZZALPHA", "INE000A01011", "SELL", "4", "560", "NSE", "x2", "20-06-2025 12:00 PM", "Executed"],
];

describe("a tradebook is read line by line", () => {
  it("finds the side, day and price columns by what is in them (Zerodha and Groww layouts)", () => {
    const z = tradeColumns(ZERODHA[0], ZERODHA.slice(1));
    expect([z.sideLabel, z.dayLabel, z.priceLabel]).toEqual(["trade_type", "trade_date", "price"]);
    const g = tradeColumns(GROWW[0], GROWW.slice(1));
    expect([g.sideLabel, g.dayLabel, g.priceLabel, g.valueLabel]).toEqual(["Type", "Execution date and time", "", "Value"]);
  });
  it("each company with its buys and sales, and what is left first in, first out", () => {
    const r = entriesWithAmounts(ZERODHA);
    const a = r.entries.find((e) => e.isin === "INE000A01011")!, b = r.entries.find((e) => e.isin === "INE000B01011")!;
    expect(a.trades!.map((t) => [t.side, t.qty, t.price, t.date, t.line])).toEqual([["buy", 10, 100, "2025-01-10", 2], ["buy", 5, 130, "2025-03-05", 3], ["sell", 12, 150, "2025-06-20", 5]]);
    expect([a.qty, a.avg]).toEqual([3, 130]);                             // 10 + 5 bought, 12 sold from the first buys: 3 left of the 130 buy
    expect([b.qty, b.avg]).toEqual([0, undefined]);                       // sold in full
    expect(r.amounts.book).toEqual({ kind: "trades", side: "trade_type", day: "trade_date", price: "price", buys: 3, sells: 3, undated: [], unpriced: [], over: [7] });
    expect(r.amounts.qty).toBe("quantity");
  });
  it("Groww: the price is the value ÷ quantity, the day drops its time", () => {
    const e = entriesWithAmounts(GROWW).entries[0];
    expect(e.trades!.map((t) => [t.side, t.qty, t.price, t.date])).toEqual([["buy", 10, 100, "2025-01-10"], ["sell", 4, 140, "2025-06-20"]]);
    expect([e.qty, e.avg]).toEqual([6, 100]);
  });
  it("from a CSV file, with its own line numbers and a missing date or price said", () => {
    const g = gridFromText("Symbol,Buy/Sell,Trade Date,Qty,Price\nZZALPHA,BUY,10-01-2025,10,100\n\nZZALPHA,BUY,,5,\nZZALPHA,SELL,20-06-2025,3,150\n");
    const r = entriesWithAmounts(g);
    expect(r.entries[0].trades!.map((t) => t.line)).toEqual([2, 4, 5]);
    expect(r.amounts.book).toMatchObject({ undated: [4], unpriced: [4], over: [] });
    expect(bookNotes(r.amounts.book!, r.amounts.price)).toEqual([
      "This file lists trades: 2 buys and 1 sale (its Buy/Sell column), each with its date, quantity and price. What is left of each share is worked out first in, first out, and each sale's gain or loss is booked.",
      "No date could be read on line 4; it is put after the dated ones. Add the date under Edit.",
      "No price on line 4 (the Price column); add it under Edit."]);
  });
  it("a tradebook with no Buy / Sell column still gives names only, and says why", () => {
    const r = entriesWithAmounts(gridFromText("Symbol,Trade Date,Qty,Price\nZZALPHA,10-01-2025,10,100\n"));
    expect(r.amounts.trades).toBe(true); expect(r.amounts.book).toBeUndefined(); expect(r.entries[0].qty).toBeUndefined();
    expect(fileNotes(r.amounts, r.entries)[0]).toMatch(/no Buy \/ Sell column that could be read, so only the company names are taken/);
  });
  it("a sale larger than the buys before it in the file is named", () => {
    const r = entriesWithAmounts(ZERODHA);
    expect(bookNotes(r.amounts.book!, r.amounts.price).at(-1)).toBe("A sale is larger than the buys before it in this file (line 7): the earlier buys are not in it. It is kept but left out of the figures until those buys are added.");
  });
});

describe("a holdings file with a buy date", () => {
  const H = [["Symbol", "Quantity", "Avg price", "Buy date"], ["ZZALPHA", "10", "100", "10-01-2025"], ["ZZALPHA", "5", "130", "05-03-2025"], ["ZZBETA", "20", "50", "01-02-2025"]];
  it("each line is a dated buy; the company's total and average are as before", () => {
    const r = entriesWithAmounts(H);
    const a = r.entries[0];
    expect(a.trades!.map((t) => [t.side, t.qty, t.price, t.date])).toEqual([["buy", 10, 100, "2025-01-10"], ["buy", 5, 130, "2025-03-05"]]);
    expect([a.qty, a.avg]).toEqual([15, 110]);
    expect(r.amounts.book).toMatchObject({ kind: "dated", day: "Buy date", buys: 3, sells: 0 });
    expect(fileNotes(r.amounts, r.entries)[0]).toBe("Each line comes in as its own buy, dated by the file's Buy date column, with its quantity and buy price.");
  });
  it("a price date column (Value date, As on) is not a buy date", () => {
    expect(entriesWithAmounts([["Symbol", "Quantity", "Avg price", "Value date"], ["ZZALPHA", "10", "100", "20-11-2026"]]).amounts.book).toBeUndefined();
  });
});

describe("Excel date cells are read as days", () => {
  it("a date cell shown as 3/15/24 (a US format) reads 2024-03-15, not as a day-first 3 Mar or nothing", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Symbol", "Buy/Sell", "Trade date", "Qty", "Price"], ["ZZALPHA", "BUY", new Date(Date.UTC(2024, 2, 15)), 10, 100], ["ZZALPHA", "BUY", new Date(Date.UTC(2024, 3, 4)), 1, 101]], { cellDates: false }), "T");
    const [g] = await gridsFromFile(new File([XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer], "t.xlsx"));
    expect(g.slice(1).map((r) => r[2])).toEqual(["2024-03-15", "2024-04-04"]);
    expect(entriesWithAmounts(g).entries[0].trades!.map((t) => t.date)).toEqual(["2024-03-15", "2024-04-04"]);
  });
});

// ------------------------------------------------------------------------------------------------ adding them to a portfolio
const T = (side: "buy" | "sell", qty: number, price: number | null, date: string | null, line = 0): Trade => ({ side, qty, price, date, line });
const TR = [T("buy", 10, 100, "2025-01-10", 2), T("buy", 5, 130, "2025-03-05", 3), T("sell", 12, 150, "2025-06-20", 5)];
const H = (o: Partial<Holding>): Holding => ({ id: Math.random().toString(36).slice(2), symbol: "ZZALPHA", qty: 0, price: 0, ...o } as Holding);

describe("the trades in a portfolio: nothing is counted twice", () => {
  it("a share not there: every trade comes in, the sale as a sale; the ledger then holds 3 at 130 with a booked gain", () => {
    const r = tradeRows("ZZALPHA", TR, [], "main", { isin: "INE000A01011" });
    expect(r).toMatchObject({ buys: 2, sells: 1, already: 0, kept: false, first: null });
    expect(r.adds.map((a) => [a.side ?? "buy", a.qty, a.price, a.date, a.owned, a.isin])).toEqual([["buy", 10, 100, "2025-01-10", true, "INE000A01011"], ["buy", 5, 130, "2025-03-05", true, "INE000A01011"], ["sell", 12, 150, "2025-06-20", true, "INE000A01011"]]);
    const l = ledgerOf(r.adds.map((a, i) => ({ ...a, id: "r" + i })) as Holding[], "ZZALPHA", "main");
    expect([l.qty, l.avg, l.booked, l.bad]).toEqual([3, 130, 12 * 150 - (10 * 100 + 2 * 130), 0]);
    expect(leftAfter(TR)).toMatchObject({ qty: l.qty, avg: l.avg });
  });
  it("a share there by name only: the first buy takes the name's place", () => {
    const name = H({ id: "nm", qty: 1, owned: false });
    const r = tradeRows("ZZALPHA", TR, [name], "main");
    expect(r.first).toEqual({ id: "nm", patch: expect.objectContaining({ qty: 10, price: 100, date: "2025-01-10", owned: true }) });
    expect(r.adds).toHaveLength(2);
  });
  it("the same history going on (some trades already there): only the new ones come in", () => {
    const have = [H({ qty: 10, price: 100, date: "2025-01-10", owned: true }), H({ qty: 5, price: 130, date: "2025-03-05", owned: true })];
    const r = tradeRows("ZZALPHA", TR, have, "main");
    expect(r).toMatchObject({ buys: 0, sells: 1, already: 2, kept: false });
    expect(r.adds.map((a) => [a.side, a.qty])).toEqual([["sell", 12]]);
  });
  it("buys of its own and none of the file's: nothing comes in and the share is named (a second history would count it twice)", () => {
    const have = [H({ qty: 15, price: 110, owned: true })];
    expect(tradeRows("ZZALPHA", TR, have, "main")).toMatchObject({ adds: [], kept: true, already: 0 });
    expect(tradeRows("ZZALPHA", [T("buy", 15, 110, null)], have, "main", {}, true)).toMatchObject({ adds: [], kept: true });   // a dated holdings file never adds to a history
  });
  it("another portfolio's rows do not count; a portfolio other than the first is written on each row", () => {
    const r = tradeRows("ZZALPHA", TR, [H({ qty: 15, price: 110, owned: true })], "acc2");
    expect(r.kept).toBe(false); expect(r.adds.every((a) => a.pf === "acc2")).toBe(true);
  });
  it("says what came in", () => {
    expect(tradesMessage({ shares: 2, buys: 3, sells: 3, already: 2, kept: ["ZZDELTA"], dated: true, kind: "trades" }))
      .toBe("Added 3 buys and 3 sales for 2 shares, each with its date; 2 trades were already in the portfolio and were not added again; ZZDELTA already has buys of its own in this portfolio, so its lines from this file were not added (nothing is counted twice).");
    expect(tradesMessage({ shares: 1, buys: 2, sells: 0, already: 0, kept: [], dated: true, kind: "dated" })).toBe("Added 2 dated buys for 1 share, each with its date.");
  });
});

// ------------------------------------------------------------------------------------------------ ETFs
describe("ETFs from a tradebook", () => {
  const ETF = [["Symbol", "Trade type", "Trade date", "Quantity", "Price"], ["NIFTYBEES", "BUY", "10-01-2025", "100", "250"], ["GOLDBEES", "BUY", "11-01-2025", "50", "60"],
    ["NIFTYBEES", "BUY", "10-02-2025", "50", "260"], ["NIFTYBEES", "SELL", "10-03-2025", "120", "270"], ["GOLDBEES", "SELL", "10-04-2025", "50", "65"]];
  it("the ETF page reads one row per ETF with what is left; one sold in full is marked, not sent as a holding", () => {
    const rows = etfRowsFromGrid(ETF);
    expect(rows.map((r) => [r.row, r.symbol, r.qty, r.avg, r.trades!.length, !!r.soldOut])).toEqual([[2, "NIFTYBEES", "30", 260, 3, false], [3, "GOLDBEES", "0", undefined, 2, true]]);
    expect(toSend(rows)).toEqual([{ row: 2, symbol: "NIFTYBEES", qty: "30" }, { row: 3, symbol: "GOLDBEES" }]);   // trades stay in the browser; a sold-out ETF goes with no units
  });
  it("a holdings report (no Buy / Sell column) is read line by line, as before", () => {
    expect(etfRowsFromGrid([["Symbol", "Quantity", "Avg. price"], ["NIFTYBEES", "10", "250"], ["GOLDBEES", "5", "60"]]).map((r) => [r.row, r.symbol, r.qty, r.avg, r.trades])).toEqual([[2, "NIFTYBEES", "10", 250, undefined], [3, "GOLDBEES", "5", 60, undefined]]);
  });
  it("from the Equity page: an ETF with trades goes to the book as its dated buys and sales; the book's single-buy correction is not applied to it", () => {
    const line = { input: "NIFTYBEES", symbol: "NIFTYBEES", qty: 30, avg: 260, trades: etfRowsFromGrid(ETF)[0].trades };
    const plan: EtfPlan = { add: [{ symbol: "NIFTYBEES", name: "N", qty: 30, avg: 260, line }], have: [], notAdded: [], room: 5, limit: 15, used: 0, over: 0 };
    const buys = etfBuys(plan, new Set(["NIFTYBEES"]), false, () => false);
    expect(buys.map((b) => [b.side ?? "buy", b.qty, b.price, b.date])).toEqual([["buy", 100, 250, "2025-01-10"], ["buy", 50, 260, "2025-02-10"], ["sell", 120, 270, "2025-03-10"]]);
    let n = 0; const r = bookAfterImport([], buys, "main", () => "imp" + n++);
    expect(r.lots.map((l) => [l.side, l.qty, l.price, l.date])).toEqual([["buy", 100, 250, "2025-01-10"], ["buy", 50, 260, "2025-02-10"], ["sell", 120, 270, "2025-03-10"]]);
    expect(r.added).toEqual(["NIFTYBEES"]);
    const one = [{ id: "imp1", symbol: "NIFTYBEES", pf: "main", side: "buy" as const, qty: 100, price: 240, date: null }];
    expect(bookAfterImport(one, buys, "main", () => "x").fixed).toEqual([]);
  });
});
