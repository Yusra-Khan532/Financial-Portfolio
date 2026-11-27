// Developer file 34: an Equity import whose file names its ETFs by ISIN (Zerodha's holdings and tradebook exports have an ISIN column). A line with an ISIN
// is matched by its ISIN alone; the ISIN check answers an ETF's ISIN as "not a company's share", so the ETF was listed under "Not added" and never reached
// the ETF portfolio. Now the lines left out with a fund unit's ISIN (INF…) are tried as ETFs by that ISIN. Sample lines and amounts.
import { describe, expect, it } from "vitest";
import { matchEntries } from "./holdingsMatch";
import type { IsinAnswer } from "./isin";
import { etfPlan, etfPreviewRows, fundsFromSkipped, stillSkipped, type EtfPreview } from "./importFunds";

const entries = [
  { name: "RELIANCE", isin: "INE002A01018", qty: 10, avg: 1200 },
  { name: "NIFTYBEES", isin: "INF204KB14I2", qty: 100, avg: 250 },
  { name: "GOLDBEES", isin: "inf204kb17i5", qty: 50, avg: 60, rate: 64.1, rateOn: "2026-11-20" },
  { name: "SAMPLE FLEXI CAP FUND - DIRECT GROWTH", isin: "INF879O01027", qty: 20, avg: 70 },
  { name: "SAMPLE 8% BOND 2030", isin: "INE000A08AB1", qty: 5 },
];
const etfNote = (n: string) => `An exchange-traded fund (${n}), not a company's share. Its own page is under ETFs.`;
const answers = new Map<string, IsinAnswer>([
  ["INE002A01018", { isin: "INE002A01018", status: "matched", symbol: "RELIANCE", name: "Reliance Industries Ltd", how: "isin", note: null }],
  ["INF204KB14I2", { isin: "INF204KB14I2", status: "not_share", symbol: null, name: null, how: null, note: etfNote("Nippon India ETF Nifty BeES"), kind: "fund" }],
  ["inf204kb17i5", { isin: "inf204kb17i5", status: "not_share", symbol: null, name: null, how: null, note: etfNote("Nippon India ETF Gold BeES"), kind: "fund" }],
  ["INF879O01027", { isin: "INF879O01027", status: "not_share", symbol: null, name: null, how: null, note: "A mutual fund unit (Sample Flexi Cap Fund), not a share: add it on the MF portfolio page.", kind: "fund" }],
  ["INE000A08AB1", { isin: "INE000A08AB1", status: "not_share", symbol: null, name: null, how: null, note: "Not an ordinary share (a bond, debenture, rights entitlement or another security).", kind: "other" }],
]);

describe("ETFs named by ISIN in an Equity file go to the ETF portfolio", () => {
  it("the lines left out with a fund unit's ISIN are tried as ETFs by that ISIN, with their quantity, buy price and Rate", () => {
    const m = matchEntries(entries, [], answers);
    expect(m.found.map((f) => f.symbol)).toEqual(["RELIANCE"]);
    expect(m.skipped.map((s) => s.input)).toEqual(["NIFTYBEES", "GOLDBEES", "SAMPLE FLEXI CAP FUND - DIRECT GROWTH", "SAMPLE 8% BOND 2030"]);
    const funds = fundsFromSkipped(m.skipped, entries);
    expect(funds).toEqual([
      { input: "NIFTYBEES", isin: "INF204KB14I2", qty: 100, avg: 250 },
      { input: "GOLDBEES", isin: "INF204KB17I5", qty: 50, avg: 60, rate: 64.1, rateOn: "2026-11-20" },
      { input: "SAMPLE FLEXI CAP FUND - DIRECT GROWTH", isin: "INF879O01027", qty: 20, avg: 70 },
    ]);                                                                                    // the bond (INE…) is not a fund unit: it stays left out
    // the ETF portfolio is asked by ISIN, so the line's name does not have to be the ETF's symbol
    expect(etfPreviewRows(funds)).toEqual([{ row: 1, isin: "INF204KB14I2", name: "NIFTYBEES", qty: "100" }, { row: 2, isin: "INF204KB17I5", name: "GOLDBEES", qty: "50" },
      { row: 3, isin: "INF879O01027", name: "SAMPLE FLEXI CAP FUND - DIRECT GROWTH", qty: "20" }]);
  });
  it("what the ETF portfolio takes leaves \"Not added\"; a mutual fund unit stays there with the ISIN check's reason", () => {
    const m = matchEntries(entries, [], answers), funds = fundsFromSkipped(m.skipped, entries);
    const pv: EtfPreview = { rows: [{ i: 0, row: 1, status: "matched", etf: { symbol: "NIFTYBEES", name: "Nippon India ETF Nifty BeES" }, qty: 100, existing: false },
      { i: 1, row: 2, status: "matched", etf: { symbol: "GOLDBEES", name: "Nippon India ETF Gold BeES" }, qty: 50, existing: false }, { i: 2, row: 3, status: "not_found" }], capacity: { limit: 15, used: 0, room: 15 } };
    const plan = etfPlan(funds, pv);
    expect(plan.add.map((a) => [a.symbol, a.qty, a.avg])).toEqual([["NIFTYBEES", 100, 250], ["GOLDBEES", 50, 60]]);
    const left = stillSkipped(m.skipped, funds, plan.notAdded.map((n) => n.line.input));
    expect(left.map((s) => [s.input, s.note])).toEqual([
      ["SAMPLE FLEXI CAP FUND - DIRECT GROWTH", "A mutual fund unit (Sample Flexi Cap Fund), not a share: add it on the MF portfolio page."],
      ["SAMPLE 8% BOND 2030", "Not an ordinary share (a bond, debenture, rights entitlement or another security)."]]);
  });
  it("a fund unit's ISIN twice is tried once; a line with no answer from the ISIN check is tried too; a malformed ISIN is not", () => {
    const twice = [{ input: "NIFTYBEES", isin: "INF204KB14I2", note: "x" }, { input: "NIFTY BEES (2)", isin: "INF204KB14I2", note: "x" }, { input: "BAD", isin: "INF12", note: "x" }];
    expect(fundsFromSkipped(twice, entries).map((f) => f.isin)).toEqual(["INF204KB14I2"]);
    const m = matchEntries([entries[1]], [], new Map());                                   // the ISIN check could not be asked
    expect(m.skipped[0].note).toMatch(/could not be checked/);
    expect(fundsFromSkipped(m.skipped, entries)).toEqual([{ input: "NIFTYBEES", isin: "INF204KB14I2", qty: 100, avg: 250 }]);
  });
  it("a tradebook line with an ETF's ISIN brings its trades", () => {
    const trades = [{ side: "buy" as const, qty: 100, price: 250, date: "2025-04-10", line: 4 }, { side: "sell" as const, qty: 40, price: 275, date: "2025-10-01", line: 7 }];
    expect(fundsFromSkipped([{ input: "NIFTYBEES", isin: "INF204KB14I2" }], [{ name: "NIFTYBEES", isin: "INF204KB14I2", qty: 60, avg: 250, trades }]))
      .toEqual([{ input: "NIFTYBEES", isin: "INF204KB14I2", qty: 60, avg: 250, trades }]);
  });
});
