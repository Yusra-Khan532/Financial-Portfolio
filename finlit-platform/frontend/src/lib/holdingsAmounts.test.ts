import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { SearchRow } from "./api";
import { avgOf, combine, isAvgLabel, isoDay, isRateLabel, num, pickColumns, qtyRank } from "./holdingsColumns";
import { statementAmounts } from "./holdingsAmounts";
import { entriesWithAmounts } from "./holdingsFile";
import { isSure, readPdfHoldings, readPdfItems, rowsFromPdfItems, setPdfLoader, type PdfFinds } from "./holdingsPdf";
import { addedMessage, attachAmounts, fileNotes, newHolding, updateHeld } from "./importAdd";
import { etfBuys, etfCommit, etfMessage, etfPlan, etfPreviewRows, fundsFromMissing, type EtfPreview } from "./importFunds";

const dir = new URL("./fixtures/pdf/", import.meta.url);
const INDEX: SearchRow[] = Object.entries(JSON.parse(readFileSync(new URL("index.json", dir), "utf8")) as Record<string, { name: string; bse: string }>).map(([s, v]) => [s, v.name, v.bse, 1, s] as unknown as SearchRow);
const file = (name: string) => new File([readFileSync(new URL(name, dir))], name, { type: "application/pdf" });
const by = (f: PdfFinds) => Object.fromEntries(f.found.map((x) => [x.symbol, x]));

beforeAll(() => {
  const require = createRequire(import.meta.url);
  const worker = pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
  setPdfLoader(async () => { const m = await import("pdfjs-dist/legacy/build/pdf.mjs"); m.GlobalWorkerOptions.workerSrc = worker; return m as unknown as typeof import("pdfjs-dist"); });
});

describe("column headings", () => {
  it("knows each broker's quantity heading, the total before a part of it", () => {
    for (const h of ["Current Qty", "Current Bal", "Current Balance", "No. of Shares", "Quantity", "Qty.", "Qty", "Units", "Holdings", "Total Qty", "Net Qty", "Quantity Held"]) expect(qtyRank(h), h).toBeLessThan(3);
    for (const h of ["Free Qty", "Free Bal", "Quantity Available", "Available Qty"]) { expect(qtyRank(h), h).toBeGreaterThanOrEqual(3); expect(qtyRank(h), h).toBeLessThan(99); }
    for (const h of ["Pledge Qty", "Locked Qty", "Freeze Qty", "Remat Qty", "Quantity Pledged (Margin)", "Lent Bal", "Qty sold", "Buy Qty", "T+1 Qty"]) expect(qtyRank(h), h).toBe(99);
    expect(pickColumns(["ISIN", "Scrip Name", "Current Qty", "Free Qty", "Freeze Qty", "Locked Qty", "Pledge Qty", "Remat Qty", "Value Date", "Rate", "Valuation"]).qtyLabel).toBe("Current Qty");
    expect(pickColumns(["Trading Symbol", "Company Name", "Free Qty", "Avg. Price", "LTP"]).qtyLabel).toBe("Free Qty");   // the only one there
  });
  it("takes an average or buy price, never today's price", () => {
    for (const h of ["Avg. cost", "Avg buy price", "Average Cost Price", "Avg Cost price (Rs)", "Buy Avg", "Avg Rate", "Avg. Price (₹)", "Average Price", "Buy price", "Avg", "Cost Price", "Purchase Rate"]) expect(isAvgLabel(h), h).toBe(true);
    for (const h of ["Rate", "Price", "LTP", "CMP", "Closing price", "Market Rate", "Market Price", "Current price", "Previous Closing Price", "Valuation", "Value", "Avg value", "Cur. val", "Net chg.", "Sell price", "NAV"]) expect(isAvgLabel(h), h).toBe(false);
    expect(pickColumns(["Stock Name", "ISIN", "Quantity", "Average buy price", "Buy value", "Closing price", "Closing value"])).toMatchObject({ qtyLabel: "Quantity", avgLabel: "Average buy price", costLabel: "Buy value" });
    expect(pickColumns(["Company", "Qty", "Invested", "Current value"])).toMatchObject({ avg: -1, costLabel: "Invested" });
  });
  it("reads a line's own price (Rate, LTP, Closing price) and its date apart from the average", () => {
    for (const h of ["Rate", "LTP", "CMP", "Closing price", "Market Price", "Current price", "NAV"]) expect(isRateLabel(h), h).toBe(true);
    for (const h of ["Avg Rate", "Purchase Rate", "Avg. Price", "Valuation", "Closing value", "Market value", "Buy price"]) expect(isRateLabel(h), h).toBe(false);
    expect(pickColumns(["ISIN", "Scrip Name", "Current Qty", "Value Date", "Rate", "Valuation"])).toMatchObject({ avg: -1, rate: 4, rateLabel: "Rate", date: 3 });
    expect([isoDay("20-11-2026"), isoDay("20/11/2026"), isoDay("20 Nov 2026"), isoDay("2026-11-20"), isoDay("1544.2"), isoDay("32-11-2026")]).toEqual(["2026-11-20", "2026-11-20", "2026-11-20", "2026-11-20", null, null]);
  });
  it("reads numbers as brokers print them, and works the average out only from a cost column", () => {
    expect([num("15.0"), num("1,64,000.50"), num("₹ 1,450"), num("(3.5)"), num("-"), num(""), num("20-11-2026"), num("NA")]).toEqual([15, 164000.5, 1450, -3.5, null, null, null, null]);
    expect(avgOf(10, 1250.5, null)).toEqual({ avg: 1250.5, how: "column" });
    expect(avgOf(3, null, 1000)).toEqual({ avg: 333.33, how: "worked" });
    expect(avgOf(3, null, null)).toBeNull();
    expect(combine([{ qty: 10, avg: 100 }, { qty: 30, avg: 200 }])).toEqual({ qty: 40, avg: 175, parts: 2 });
    expect(combine([{ qty: 10, avg: 100 }, { qty: 30 }])).toEqual({ qty: 40, parts: 2 });   // one lot without a price: no average rather than a wrong one
  });
});

describe("PDF statements: quantity and buy price on every company", () => {
  it("an Upstox DP holding statement (no NSDL/CDSL wording, heading Current Qty): every quantity, no buy price, and it says why", async () => {
    const rows = rowsFromPdfItems(await readPdfItems(file("upstox_dp_statement.pdf")));
    const s = statementAmounts(rows)!;
    expect(s).toMatchObject({ source: "Upstox", asOf: "21 Nov 2026", column: "Current Qty", price: null, rate: "Rate", rateOn: "2026-11-20" });
    expect(s.byIsin.get("INE009A01021")).toMatchObject({ qty: 40, rate: 1561.3, rateOn: "2026-11-20" });   // the Rate and its Value Date, never the average
    expect(s.byIsin.get("INE009A01021")?.avg).toBeUndefined();
    expect(s.byIsin.get("INE002A01018")).toMatchObject({ qty: 20, lines: 2, accounts: 1 });   // two lines of one account are added up
    expect(s.byIsin.get("INE467B01029")?.qty).toBe(8);                                          // read by ISIN even though the name is cut short
    expect(s.zero).toEqual(["INE075A01022"]);
    const f = await readPdfHoldings(file("upstox_dp_statement.pdf"), INDEX);
    const m = by(f);
    expect(Object.keys(m).sort()).toEqual(["HDFCBANK", "INFY", "ITC", "LT", "NTPC", "RELIANCE", "TITAN"]);
    expect([m.RELIANCE.qty, m.INFY.qty, m.HDFCBANK.qty, m.ITC.qty, m.TITAN.qty, m.NTPC.qty, m.LT.qty]).toEqual([20, 40, 25, 120, 10, 55, 12]);
    expect(f.found.every((x) => x.avg == null)).toBe(true);                                     // "Rate" is the closing price: never the buy price
    expect(f.cas).toMatchObject({ source: "Upstox", column: "Current Qty", price: null, rateLike: "Rate", rate: "Rate", rateOn: "2026-11-20" });
    expect(m.INFY).toMatchObject({ qty: 40, rate: 1561.3, rateOn: "2026-11-20" });
    expect(f.notes.join(" ")).toMatch(/WIPRO has a balance of 0/);
    expect(f.notes.join(" ")).toMatch(/no buy price column\. Its Rate column is each share's price on 20 Nov 2026, not what you paid: tick "Use the statement's Rate as the buy price"/);
    expect(f.notes.join(" ")).toMatch(/quantities are added up/);
    // the ETF line is not a share and not "unrecognised": it is kept for the ETF portfolio with its units and Rate
    expect(f.funds).toEqual([{ isin: "INF204KB14I2", input: "NIPPON INDIA ETF NIFTY BEES", qty: 50, rate: 291.4, rateOn: "2026-11-20" }]);
    expect(f.missing.join(" ")).not.toMatch(/NIFTY BEES/);
    expect(f.notes.join(" ")).toMatch(/One line is an ETF or fund \(ISIN INF…\), not company shares: it goes to your ETF portfolio/);
  });
  it("Zerodha (Instrument / Qty. / Avg. cost, no ISIN column): quantity and average from the table", async () => {
    const m = by(await readPdfHoldings(file("zerodha_holdings.pdf"), INDEX));
    expect(m.RELIANCE).toMatchObject({ qty: 10, avg: 2450.5, avgHow: "column" });
    expect(m.TCS).toMatchObject({ qty: 5, avg: 3200 });
    expect(m.HDFCBANK).toMatchObject({ qty: 20, avg: 1500 });
  });
  it("every broker layout in the fixtures with a quantity and an average column gives both on every company", async () => {
    for (const name of ["angelone_holdings.pdf", "blank_cells.pdf", "fivepaisa_dhan.pdf", "groww_holdings.pdf", "groww_large_66.pdf", "groww_wrapped_middle.pdf", "hdfcsec_holdings.pdf", "header_wrapped.pdf", "icicidirect_portfolio.pdf", "kotak_holdings.pdf", "large_150_rows.pdf", "page_subtotals.pdf", "rupee_symbol.pdf", "upstox_series_suffix.pdf", "zerodha_console.pdf", "two_tables_holdings_first.pdf", "two_tables_sold_first.pdf", "wrap_hazard_top.pdf"]) {
      const f = await readPdfHoldings(file(name), INDEX);
      const sure = f.found.filter(isSure);
      expect(sure.length, name).toBeGreaterThan(0);
      for (const x of sure) { expect(x.qty, `${name} ${x.symbol} qty`).toBeGreaterThan(0); expect(x.avg, `${name} ${x.symbol} avg`).toBeGreaterThan(0); }
      expect(f.cas?.price, name).toBeTruthy();
    }
  });
  it("a heading that wrapped onto two lines is put back, and a table's title is not part of its first column", async () => {
    const f = await readPdfHoldings(file("header_wrapped.pdf"), INDEX);
    expect(f.cas).toMatchObject({ column: "Quantity", price: "Average buy price (Rs.)" });
    expect(by(f).INFY).toMatchObject({ qty: 55, avg: 1406.97 });
    const t = await readPdfHoldings(file("two_tables_holdings_first.pdf"), INDEX);   // "Current Holdings" above "Stock Name" is a title, not a quantity heading
    expect(by(t).RELIANCE).toMatchObject({ qty: 40, avg: 435.58 });
  });
  it("only the holdings table counts: a sold table's quantities are not added", async () => {
    const m = by(await readPdfHoldings(file("two_tables_sold_first.pdf"), INDEX));
    expect(m.RELIANCE).toMatchObject({ qty: 20, avg: 1789.02 });
    expect(m.RELIANCE.lines ?? 1).toBe(1);
  });
  it("a guessed line never adds to a sure one (Tata Motors Finance Ltd is not Tata Motors Passenger Vehicles)", async () => {
    const m = by(await readPdfHoldings(file("wrap_hazard_top.pdf"), INDEX));
    expect(m.TMPV.qty).toBe(12);
    expect(m.HDFCBANK.qty).toBe(16);   // "HDFC Bank Ltd Flexi Cap Fund" (25) is not added
  });
  it("the same company on several lines of one statement is added up, and the page says so", async () => {
    const f = await readPdfHoldings(file("bank_footer_noise.pdf"), INDEX);
    expect(by(f).INFY).toMatchObject({ qty: 13, lines: 2 });   // 5 + 8
    expect(f.notes.join(" ")).toMatch(/on more than one line/);
  });
  it("depository statements: quantity from Current Bal, no buy price (they have none)", async () => {
    const c = await readPdfHoldings(file("cdsl_holdings.pdf"), INDEX);
    expect(c.cas).toMatchObject({ source: "CDSL", column: "Current Bal", price: null });
    expect(by(c).INFY.qty).toBe(1200);
    const n = await readPdfHoldings(file("nsdl_cas.pdf"), INDEX);
    expect(n.cas?.source).toBe("NSDL");
    expect(n.found.filter(isSure).every((x) => (x.qty ?? 0) > 0)).toBe(true);
  });
  it("a broker statement that names its depository is still named after the broker", async () => {
    expect((await readPdfHoldings(file("zerodha_console.pdf"), INDEX)).cas?.source).not.toBe("CDSL");
    expect((await readPdfHoldings(file("hdfcsec_holdings.pdf"), INDEX)).cas?.source).toBe("HDFC Securities");
  });
  it("no table quantity: nothing is made up", async () => {
    const f = await readPdfHoldings(file("text_lines.pdf"), INDEX);
    expect(f.found.every((x) => x.qty == null && x.avg == null)).toBe(true);
  });
});

describe("spreadsheets: quantity and buy price on every line", () => {
  const ZERODHA = [
    ["Client ID", "SAMPLE"], ["Holdings statement as on 2026-11-21"], [],
    ["Symbol", "ISIN", "Sector", "Quantity Available", "Quantity Discrepant", "Quantity Long Term", "Quantity Pledged (Margin)", "Quantity Pledged (Loan)", "Average Price", "Previous Closing Price", "Unrealized P&L", "Unrealized P&L Pct."],
    ["RELIANCE", "INE002A01018", "Energy", "10", "0", "10", "0", "0", "2450.5", "1544.2", "-9063", "-36.98"],
    ["TCS", "INE467B01029", "IT", "5", "0", "5", "2", "0", "3200", "3105.5", "-472.5", "-2.95"],
  ];
  it("Zerodha console export: Quantity Available and Average Price; pledged shares are named, not added", () => {
    const r = entriesWithAmounts(ZERODHA);
    expect(r.entries).toEqual([
      { isin: "INE002A01018", name: "RELIANCE", qty: 10, lines: 1, avg: 2450.5, avgHow: "column" },
      { isin: "INE467B01029", name: "TCS", qty: 5, lines: 1, avg: 3200, avgHow: "column" },
    ]);
    expect(r.amounts).toMatchObject({ qty: "Quantity Available", price: "Average Price", otherParts: 1 });
    expect(fileNotes(r.amounts, r.entries).join(" ")).toMatch(/1 companies|One company also has pledged or locked shares/);
  });
  it("Groww export: Quantity, Average buy price (Buy value not needed)", () => {
    const r = entriesWithAmounts([["Stock Name", "ISIN", "Quantity", "Average buy price", "Buy value", "Closing price", "Closing value", "Unrealised P&L"], ["Infosys Ltd", "INE009A01021", "12", "1,450.25", "17,403.00", "1561.3", "18735.6", "1332.6"]]);
    expect(r.entries[0]).toMatchObject({ isin: "INE009A01021", qty: 12, avg: 1450.25, avgHow: "column" });
  });
  it("only an Invested column: the average is worked out and marked so", () => {
    const r = entriesWithAmounts([["Company", "Qty", "Invested", "Current value"], ["ITC Ltd", "30", "12,000", "12,123"]]);
    expect(r.entries[0]).toMatchObject({ name: "ITC Ltd", qty: 30, avg: 400, avgHow: "worked" });
    expect(fileNotes(r.amounts, r.entries).join(" ")).toMatch(/worked out from the file's Invested column/);
  });
  it("ICICI Direct: Average Cost Price beats Current Market Price; Value At Cost is a cost column", () => {
    const r = entriesWithAmounts([["Stock Symbol", "Company Name", "ISIN Code", "Qty", "Average Cost Price", "Current Market Price", "Value At Cost", "Value At Market Price"], ["RELIND", "Reliance Industries Ltd", "INE002A01018", "4", "1,210.00", "1,544.20", "4,840.00", "6,176.80"]]);
    expect(r.entries[0]).toMatchObject({ qty: 4, avg: 1210 });
  });
  it("the Upstox DP statement saved as a sheet: quantities, and no buy price because its Rate is today's price", () => {
    const r = entriesWithAmounts([["ISIN", "Scrip Name", "Current Qty", "Free Qty", "Freeze Qty", "Locked Qty", "Pledge Qty", "Remat Qty", "Value Date", "Rate", "Valuation"], ["INE002A01018", "RELIANCE INDUSTRIES LTD", "15.0", "15.0", "0.0", "0.0", "0.0", "0.0", "20-11-2026", "1544.2", "23163.0"]]);
    expect(r.entries[0]).toMatchObject({ isin: "INE002A01018", qty: 15 });
    expect(r.entries[0].avg).toBeUndefined();
    expect(fileNotes(r.amounts, r.entries).join(" ")).toMatch(/no buy price column \(its Rate column is today's price/);
    expect(r.entries[0]).toMatchObject({ rate: 1544.2, rateOn: "2026-11-20" });
    expect(r.amounts).toMatchObject({ rate: "Rate", rateOn: "2026-11-20" });
  });
  it("Upstox's holdings report (Symbol / Qty. / Pledged / Avg. price / LTP … / Invested, under two summary lines): every line, BSE Ltd included", () => {
    const r = entriesWithAmounts([
      ["Invested", "Current", "Overall P&L", "Day P&L"], ["1,23,456.00", "1,10,000.00", "-13,456.00 (-10.9%)", "-1,200.00 (-1.1%)"], [],
      ["Symbol (3)", "Qty.", "Pledged", "Avg. price", "LTP", "Day P&L", "Day %", "Overall P&L", "Overall %", "Current", "Invested"],
      ["INFY", "60", "--", "+1,462.01", "+1,098.00", "+366.00", "+0.56%", "-21,840.60", "-24.90%", "+65,880.00", "87,720.40"],
      ["BSE", "12", "--", "+2,950.00", "+2,710.00", "+10.00", "+0.03%", "-2,880.00", "-8.14%", "+32,520.00", "35,400.00"],
      ["NIFTYBEES", "270", "--", "+292.29", "+294.22", "+20.00", "+0.03%", "+521.10", "+0.66%", "+79,439.40", "78,917.89"],
    ]);
    expect(r.entries.map((e) => [e.name, e.qty, e.avg])).toEqual([["INFY", 60, 1462.01], ["BSE", 12, 2950], ["NIFTYBEES", 270, 292.29]]);
    expect(r.amounts).toMatchObject({ qty: "Qty.", price: "Avg. price", priceHow: "column", rate: "LTP" });
    expect(fileNotes(r.amounts, r.entries)).toEqual([]);
  });
  it("two accounts in one file: quantities added, average weighted", () => {
    const r = entriesWithAmounts([["Symbol", "ISIN", "Qty", "Avg price"], ["INFY", "INE009A01021", "10", "1000"], ["INFY", "INE009A01021", "30", "2000"]]);
    expect(r.entries).toEqual([{ isin: "INE009A01021", name: "INFY", qty: 40, avg: 1750, avgHow: "column", lines: 2 }]);
  });
  it("a tradebook gives names only: its buys are not holdings", () => {
    const r = entriesWithAmounts([["symbol", "isin", "trade_date", "exchange", "trade_type", "quantity", "price", "trade_id"], ["INFY", "INE009A01021", "2026-11-03", "NSE", "buy", "10", "1500", "1"]]);
    expect(r.amounts.trades).toBe(true);
    expect(r.entries[0].qty).toBeUndefined();
    expect(fileNotes(r.amounts, r.entries)[0]).toMatch(/lists trades/);
  });
});

describe("adding the shares", () => {
  it("a new holding carries the statement's quantity and buy price; without them, 1 share and no price as before", () => {
    expect(newHolding({ symbol: "INFY", qty: 40, avg: 1750 }, "INE009A01021")).toEqual({ symbol: "INFY", qty: 40, price: 1750, owned: true, isin: "INE009A01021" });
    expect(newHolding({ symbol: "INFY", qty: 40 })).toEqual({ symbol: "INFY", qty: 40, price: 0, owned: true });
    expect(newHolding({ symbol: "INFY" })).toEqual({ symbol: "INFY", qty: 1, price: 0 });
  });
  it("a share already there: the quantity is set, a buy price the member typed is kept", () => {
    expect(updateHeld({ qty: 1, price: 0 }, { qty: 40, avg: 1750 })).toEqual({ qty: 40, owned: true, price: 1750 });
    expect(updateHeld({ qty: 40, price: 1600 }, { qty: 40, avg: 1750 })).toBeNull();
  });
  it("the spreadsheet path's finds get their line's amounts back, by ISIN or by name", () => {
    const found = attachAmounts([{ symbol: "INFY", isin: "INE009A01021", input: "Infosys" }, { symbol: "ITC", input: "ITC Ltd" }], [{ isin: "INE009A01021", name: "Infosys", qty: 12, avg: 1450 }, { name: "ITC Ltd", qty: 30, avg: 400, avgHow: "worked" }]);
    expect(found).toEqual([{ symbol: "INFY", isin: "INE009A01021", input: "Infosys", qty: 12, avg: 1450 }, { symbol: "ITC", input: "ITC Ltd", qty: 30, avg: 400, avgHow: "worked" }]);
  });
  it("the statement's Rate becomes the buy price only when the member ticks it, never over an average or a typed price", () => {
    const line = { symbol: "INFY", qty: 40, rate: 1561.3, rateOn: "2026-11-20" };
    expect(newHolding(line, "INE009A01021")).toEqual({ symbol: "INFY", qty: 40, price: 0, owned: true, isin: "INE009A01021" });
    expect(newHolding(line, "INE009A01021", { rateAsBuy: true })).toEqual({ symbol: "INFY", qty: 40, price: 1561.3, owned: true, isin: "INE009A01021", priceFrom: "rate", priceOn: "2026-11-20" });
    expect(newHolding({ ...line, avg: 1450 }, undefined, { rateAsBuy: true })).toEqual({ symbol: "INFY", qty: 40, price: 1450, owned: true });   // the average wins
    expect(newHolding({ symbol: "INFY", rate: 1561.3 }, undefined, { rateAsBuy: true }).price).toBe(0);   // no quantity: no price from the Rate either
    expect(updateHeld({ qty: 1, price: 0 }, line, { rateAsBuy: true })).toEqual({ qty: 40, owned: true, price: 1561.3, priceFrom: "rate", priceOn: "2026-11-20" });
    expect(updateHeld({ qty: 40, price: 1400 }, line, { rateAsBuy: true })).toBeNull();
    expect(addedMessage("PDF", [{ qty: 20, rate: 10 }, { qty: 40, rate: 12 }], 0, null, { rateAsBuy: true, rateCol: "Rate", rateOn: "2026-11-20" }))
      .toBe("Added 2 shares from the PDF, each with its quantity and the statement's Rate (the price of 20 Nov 2026) as its buy price.");
  });
  it("ETF lines go to the ETF portfolio: new ones added, ones already there get their units, mutual fund units are named", () => {
    const funds = [
      { isin: "INF000000101", input: "SAMPLE GOLD ETF", qty: 1800, rate: 101.89, rateOn: "2026-11-20" },
      { isin: "INF000000202", input: "SAMPLE NASDAQ ETF", qty: 415, rate: 299.18, rateOn: "2026-11-20" },
      { isin: "INF000000001", input: "SOME FLEXI CAP FUND", qty: 120 },
    ];
    expect(etfPreviewRows(funds)[0]).toEqual({ row: 1, isin: "INF000000101", name: "SAMPLE GOLD ETF", qty: "1800" });
    const pv: EtfPreview = { rows: [
      { i: 1, status: "matched", etf: { symbol: "SMPLGOLD", name: "Sample Gold ETF" }, qty: 1800, existing: true },
      { i: 2, status: "matched", etf: { symbol: "SMPLNDQ", name: "Sample Nasdaq 100 ETF" }, qty: 415, existing: false },
      { i: 3, status: "not_found" },
    ], capacity: { limit: 15, used: 4, room: 11 } };
    const plan = etfPlan(funds, pv);
    expect(plan.add.map((x) => x.symbol)).toEqual(["SMPLNDQ"]);
    expect(plan.have.map((x) => x.symbol)).toEqual(["SMPLGOLD"]);
    expect(plan.notAdded[0].why).toMatch(/not an ETF FinLit lists/);
    expect(plan.over).toBe(0);
    const ticked = new Set(["SMPLGOLD", "SMPLNDQ"]);
    expect(etfCommit(plan, ticked)).toEqual({ items: [{ symbol: "SMPLNDQ", qty: 415 }, { symbol: "SMPLGOLD", qty: 1800 }], existing: "replace" });
    expect(etfBuys(plan, ticked, false, () => false)).toEqual([]);
    expect(etfBuys(plan, ticked, true, (s) => s === "SMPLGOLD")).toEqual([{ symbol: "SMPLNDQ", qty: 415, price: 299.18, owned: true, pf: "main", date: "2026-11-20" }]);
    expect(etfMessage({ added: 6, replaced: 2 }, ["SMPLGOLD", "SMPLSILV"])).toBe("8 ETFs went to your ETF portfolio: 6 added, units set for SMPLGOLD and SMPLSILV.");
    expect(etfPlan(funds.slice(0, 2), { rows: pv.rows.slice(0, 2).map((r) => ({ ...r, existing: false })), capacity: { limit: 15, used: 14, room: 1 } }).over).toBe(1);
  });
  it("a holdings report with symbols only: the lines that name no company are tried as ETFs by symbol, with the file's average buy price", () => {
    const entries = [{ name: "INFY", qty: 60, avg: 1462.01 }, { name: "SMPLNIFTY", qty: 270, avg: 292.29, rate: 294.22 }, { name: "SOMETHING ELSE LTD", qty: 3 }];
    const funds = fundsFromMissing(["SMPLNIFTY", "SOMETHING ELSE LTD"], entries);
    expect(funds).toEqual([{ input: "SMPLNIFTY", symbol: "SMPLNIFTY", qty: 270, avg: 292.29, rate: 294.22 }]);
    expect(etfPreviewRows(funds)).toEqual([{ row: 1, symbol: "SMPLNIFTY", name: "SMPLNIFTY", qty: "270" }]);
    const plan = etfPlan(funds, { rows: [{ i: 1, status: "matched", etf: { symbol: "SMPLNIFTY", name: "Sample Nifty 50 ETF" }, qty: 270 }], capacity: { limit: 15, used: 4, room: 11 } });
    expect(etfBuys(plan, new Set(["SMPLNIFTY"]), false, () => false)).toEqual([{ symbol: "SMPLNIFTY", qty: 270, price: 292.29, owned: true, pf: "main" }]);
  });
  it("says what came in", () => {
    expect(addedMessage("PDF", [{ qty: 20 }, { qty: 40 }], 0, null)).toBe("Added 2 shares from the PDF, each with its quantity; this statement has no buy prices; add them under Edit.");
    expect(addedMessage("file", [{ qty: 20, avg: 10 }, { qty: 40, avg: 12 }], 1, "Avg. cost")).toBe("Added 2 shares from the file, each with its quantity and buy price; quantity set for 1 already in the portfolio.");
  });
});
