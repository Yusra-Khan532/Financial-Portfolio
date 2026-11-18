// Task #191: a depository statement (NSDL or CDSL CAS) brings each share's quantity into the Equity portfolio, added up across demat accounts.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { SearchRow } from "./api";
import { readPdfHoldings, setPdfLoader, type PdfFinds, type PdfRow } from "./holdingsPdf";
import { casQuantities } from "./dematCas";

const dir = new URL("./fixtures/pdf/", import.meta.url);
const INDEX: SearchRow[] = Object.entries(JSON.parse(readFileSync(new URL("index.json", dir), "utf8")) as Record<string, { name: string; bse: string }>).map(([s, v]) => [s, v.name, v.bse, 1, s] as unknown as SearchRow);
const file = (name: string) => new File([readFileSync(new URL(name, dir))], name, { type: "application/pdf" });
const qty = (f: PdfFinds) => Object.fromEntries(f.found.map((x) => [x.symbol, x.qty ?? null]));

beforeAll(() => {
  const require = createRequire(import.meta.url);
  const worker = pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
  setPdfLoader(async () => { const m = await import("pdfjs-dist/legacy/build/pdf.mjs"); m.GlobalWorkerOptions.workerSrc = worker; return m as unknown as typeof import("pdfjs-dist"); });
});

describe("real depository statements, read by pdf.js", () => {
  it("NSDL CAS: every share with its Current Bal, also when a wrapped name puts the figures on the next line; bonds and fund units get none", async () => {
    const f = await readPdfHoldings(file("nsdl_cas.pdf"), INDEX);
    expect(qty(f)).toEqual({ RELIANCE: 75, TCS: 8, HDFCBANK: 120, LT: 3, "M&M": 75, ITC: 25, BAJFINANCE: 25, SBIN: 40, HDFCAMC: 25 });
    expect(f.cas).toEqual({ source: "NSDL", asOf: "31 Mar 2026", column: "Current Bal" });
  });
  it("CDSL statement of holdings: ISIN and security in separate columns, two-line names; the ETF and the G-Sec are not shares", async () => {
    const f = await readPdfHoldings(file("cdsl_holdings.pdf"), INDEX);
    expect(qty(f)).toEqual({ INFY: 1200, WIPRO: 12, TITAN: 10, HINDUNILVR: 120, ADANIPORTS: 8, POWERGRID: 12 });
    expect(f.cas).toMatchObject({ source: "CDSL", asOf: "31 Mar 2026", column: "Current Bal" });
  });
  it("a password-protected NSDL CAS opens with the PAN and brings its quantities", async () => {
    const f = await readPdfHoldings(file("protected_cas.pdf"), INDEX, "ABCPM1234F");
    expect(qty(f)).toEqual({ INFY: 250, TCS: 10, ICICIBANK: 250 });
    expect(f.cas?.source).toBe("NSDL");
  });
  it("an NSDL CAS with a Zerodha and a Groww account: Reliance in both is added up, the sold-out share and the ETF stay out, transactions are not read", async () => {
    const f = await readPdfHoldings(file("protected_cas_two_accounts.pdf"), INDEX, "ABCPM1234F");
    expect(qty(f)).toEqual({ RELIANCE: 65, TCS: 12, HDFCAMC: 8, ITC: 150, HDFCBANK: 60, INFY: 30 });
    expect(f.found.find((x) => x.symbol === "RELIANCE")?.accounts).toBe(2);
    expect(f.found.find((x) => x.symbol === "ITC")?.qty).toBe(150);              // 50 of them pledged: still owned
    expect(f.notes).toContain("SBIN has a balance of 0 in the statement, so it is left out.");
    expect(f.cas).toEqual({ source: "NSDL", asOf: "31 Oct 2026", column: "Current Bal" });
  });
  it("a consolidated account statement with a Units column: shares take their units, the funds stay out", async () => {
    const f = await readPdfHoldings(file("depository_statement.pdf"), INDEX);
    expect(qty(f)).toEqual({ RELIANCE: 10, TCS: 5, HDFCBANK: 20, INFY: 15, HINDUNILVR: 9, LT: 8 });
    expect(f.cas).toMatchObject({ source: "depository", asOf: "20 Oct 2026", column: "Units" });
  });
  it("a broker's own holdings report is not a depository statement: names only, as before", async () => {
    for (const name of ["zerodha_holdings.pdf", "groww_holdings.pdf", "upstox_series_suffix.pdf"]) {
      const f = await readPdfHoldings(file(name), INDEX);
      expect(f.cas, name).toBeUndefined();
      expect(f.found.every((x) => x.qty === undefined), name).toBe(true);
    }
  });
});

/** Rows as the PDF reading makes them: [text, x] cells, top to bottom. */
const rows = (lines: [string, number][][], page = 0): PdfRow[] => lines.map((cells, i) => ({ cells: cells.map(([t, x]) => ({ t, x0: x, x1: x + t.length * 5 })), y: 800 - i * 14, h: 9, page }));
const HEAD: [string, number][] = [["ISIN", 40], ["Security", 120], ["Current Bal", 330], ["Free Bal", 400], ["Market Price", 470], ["Value", 560]];

describe("reading the quantities", () => {
  it("adds up an ISIN held in two demat accounts (Zerodha and Groww), and says how many accounts", () => {
    const r = casQuantities(rows([
      [["NSDL e-CAS Consolidated Account Statement as on 31-Oct-2026", 40]],
      [["DP Name: Zerodha Broking Ltd  Client ID: 12345678", 40]],
      HEAD,
      [["INE002A01018", 40], ["RELIANCE INDUSTRIES LTD", 120], ["10", 345], ["10", 410], ["2,900.10", 470], ["29,001.00", 560]],
      [["INE467B01029", 40], ["TATA CONSULTANCY SERVICES LTD", 120], ["5", 350], ["5", 415], ["3,550.25", 470], ["17,751.25", 560]],
      [["DP Name: Groww Invest Tech  Client ID: 87654321", 40]],
      HEAD,
      [["INE002A01018", 40], ["RELIANCE INDUSTRIES LTD", 120], ["15", 345], ["15", 410], ["2,900.10", 470], ["43,501.50", 560]],
    ]));
    expect(r?.byIsin.get("INE002A01018")).toEqual({ qty: 25, accounts: 2 });
    expect(r?.byIsin.get("INE467B01029")).toEqual({ qty: 5, accounts: 1 });
    expect(r).toMatchObject({ source: "NSDL", asOf: "31 Oct 2026", column: "Current Bal" });
  });
  it("the same line listed twice in one account is counted once", () => {
    const r = casQuantities(rows([
      [["CDSL Consolidated Account Statement", 40]], [["BO ID: 1203320012345678", 40]],
      HEAD, [["INE002A01018", 40], ["RELIANCE INDUSTRIES LTD", 120], ["10", 345], ["10", 410], ["2,900.10", 470], ["29,001.00", 560]],
      HEAD, [["INE002A01018", 40], ["RELIANCE INDUSTRIES LTD", 120], ["10", 345], ["10", 410], ["2,900.10", 470], ["29,001.00", 560]],
    ]));
    expect(r?.byIsin.get("INE002A01018")).toEqual({ qty: 10, accounts: 1 });
  });
  it("prefers the current balance (pledged shares are still owned) over the free balance", () => {
    const r = casQuantities(rows([[["CDSL statement of holdings", 40]], HEAD,
      [["INE002A01018", 40], ["RELIANCE INDUSTRIES LTD", 120], ["100", 340], ["60", 405], ["2,900.10", 470], ["2,90,010.00", 560]]]));
    expect(r?.byIsin.get("INE002A01018")?.qty).toBe(100);
  });
  it("reads a heading that wrapped onto two lines (Current / Bal.)", () => {
    const r = casQuantities(rows([[["NSDL e-CAS", 40]],
      [["ISIN", 40], ["Security", 120], ["Current", 330], ["Market", 470], ["Value", 560]],
      [["Bal.", 335], ["Price", 475]],
      [["INE002A01018", 40], ["RELIANCE INDUSTRIES LTD", 120], ["42", 345], ["2,900.10", 470], ["1,21,804.20", 560]]]));
    expect(r?.byIsin.get("INE002A01018")?.qty).toBe(42);
    expect(r?.column).toBe("Current Bal.");
  });
  it("never reads a transactions table (credits, debits, closing balance) as holdings", () => {
    const r = casQuantities(rows([[["NSDL e-CAS", 40]], [["Statement of Transactions", 40]],
      [["ISIN", 40], ["Security", 120], ["Credit", 330], ["Debit", 400], ["Closing Bal", 470]],
      [["INE002A01018", 40], ["RELIANCE INDUSTRIES LTD", 120], ["5", 340], ["0", 405], ["15", 475]]]));
    expect(r?.byIsin.size).toBe(0);
  });
  it("a zero balance is left out, and a line whose figure is not under the balance heading gets no quantity instead of a guess", () => {
    const r = casQuantities(rows([[["CDSL statement of holdings", 40]], HEAD,
      [["INE002A01018", 40], ["RELIANCE INDUSTRIES LTD", 120], ["0", 345], ["0", 410], ["2,900.10", 470], ["0.00", 560]],
      [["INE467B01029", 40], ["TATA CONSULTANCY SERVICES LTD", 120], ["3,550.25", 470], ["17,751.25", 560]]]));
    expect(r?.byIsin.size).toBe(0);
    expect(r?.zero).toEqual(["INE002A01018"]);
    expect(r?.noQty).toEqual(["INE467B01029"]);
  });
  it("a broker's report (no depository, no CAS title) is not read for quantities", () => {
    expect(casQuantities(rows([[["Zerodha Console: Holdings", 40]], [["Instrument", 40], ["Qty.", 330]], [["RELIANCE", 40], ["10", 340]]]))).toBeNull();
  });
});
