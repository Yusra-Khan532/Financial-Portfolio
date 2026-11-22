// @vitest-environment jsdom
// Task #191: a depository statement (NSDL or CDSL CAS) brings each share's quantity. The review shows it, adds new shares with it, and offers to set it on a
// share already in the list (ticked only when the member has not typed a quantity of their own). A broker report keeps the names-only review.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PdfFinds } from "../lib/holdingsPdf";

const finds = vi.hoisted(() => ({ value: null as PdfFinds | null }));
vi.mock("../lib/holdingsPdf", async (orig) => ({ ...(await orig<typeof import("../lib/holdingsPdf")>()), readPdfHoldings: vi.fn(async () => finds.value) }));
// task #323: the ETF lines go to the ETF portfolio through its own import-preview / import-commit and book
const calls = vi.hoisted(() => ({ list: [] as { method: string; path: string; body?: unknown }[] }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiGet: vi.fn(async () => ({ portfolios: [], lots: [], names: [] })),
  apiSend: vi.fn(async (method: string, path: string, body?: unknown) => {
    calls.list.push({ method, path, body });
    if (path.endsWith("/import-preview")) return { rows: [{ i: 1, row: 1, status: "matched", existing: false, etf: { symbol: "NIFTYBEES", name: "Nippon India ETF Nifty BeES" }, qty: 120 },
      { i: 2, row: 2, status: "not_found", existing: false, etf: null, qty: 10 }], counts: {}, total: 2, capacity: { limit: 15, used: 0, room: 15 } };
    if (path.endsWith("/import-commit")) return { added: 1, replaced: 0, skipped: 0 };
    return {};
  }) }));
import { PdfImport } from "./PdfImport";

const CAS: PdfFinds = {
  mode: "table", rows: 20, missing: [], notes: [], cas: { source: "NSDL", asOf: "31 Oct 2026", column: "Current Bal", price: null, priceHow: null, rateLike: null },
  found: [
    { input: "RELIANCE INDUSTRIES LIMITED", symbol: "RELIANCE", name: "Reliance Industries Ltd", how: "isin", isin: "INE002A01018", qty: 25, accounts: 2 },
    { input: "TATA CONSULTANCY SERVICES LIMITED", symbol: "TCS", name: "Tata Consultancy Services Ltd", how: "isin", isin: "INE467B01029", qty: 5, accounts: 1 },
    { input: "INFOSYS LIMITED", symbol: "INFY", name: "Infosys Ltd", how: "isin", isin: "INE009A01021", qty: 15, accounts: 1 },
    { input: "ITC LIMITED", symbol: "ITC", name: "ITC Ltd", how: "isin", isin: "INE154A01025", qty: 40, accounts: 1 },
  ],
};
const pdf = new File(["%PDF-"], "cas.pdf", { type: "application/pdf" });
const open = async (f: PdfFinds, props: Partial<Parameters<typeof PdfImport>[0]> = {}) => {
  finds.value = f;
  const onAdd = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><PdfImport file={pdf} index={[]} held={[]} room={50} onAdd={onAdd} onClose={vi.fn()} {...props} /></QueryClientProvider>);
  await screen.findByRole("region", { name: "Review companies found in the PDF" });
  return onAdd;
};
afterEach(cleanup);

describe("PdfImport with a depository statement", () => {
  it("says where the quantities come from and shows each one, with the demat accounts when there are several", async () => {
    await open(CAS);
    expect(screen.getByText("NSDL statement of 31 Oct 2026: quantities from its Current Bal column · no buy prices in it")).toBeTruthy();
    expect(screen.getByText("25 shares in 2 demat accounts")).toBeTruthy();
    expect(screen.getByText("5 shares")).toBeTruthy();
    expect(screen.getByText(/Each share comes in with the number of shares the statement shows on 31 Oct 2026/)).toBeTruthy();
  });
  it("adds new shares with their quantities, and sets the quantity of a held share that has none typed", async () => {
    // RELIANCE is held with no quantity typed (ticked); TCS is held with 3 typed (offered, not ticked); INFY is held with 15 already (nothing to do)
    const onAdd = await open(CAS, { held: ["RELIANCE", "TCS", "INFY"], heldQty: new Map([["TCS", 3], ["INFY", 15]]) });
    expect(screen.getByText("In your portfolio: tick to set 25 shares")).toBeTruthy();
    expect(screen.getByText("In your portfolio with 3 shares: tick to set 5 shares")).toBeTruthy();
    expect(screen.getByText("In your portfolio, 15 shares")).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => [b.checked, b.disabled])).toEqual([[true, false], [false, false], [false, true], [true, false]]);
    fireEvent.click(screen.getByRole("button", { name: "Add 1 selected, set 1 quantity" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0]).toEqual([{ symbol: "ITC", isin: "INE154A01025", qty: 40, accounts: 1 }, { symbol: "RELIANCE", isin: "INE002A01018", qty: 25, accounts: 2 }]);
  });
  it("only sets quantities when every share is already held", async () => {
    const onAdd = await open(CAS, { held: ["RELIANCE", "TCS", "INFY", "ITC"] });
    fireEvent.click(screen.getByRole("button", { name: "Set 4 quantities" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0]).toHaveLength(4);
  });
});

describe("PdfImport with a broker report", () => {
  it("keeps the names-only review: no quantities shown or passed on", async () => {
    const plain: PdfFinds = { ...CAS, cas: undefined, found: CAS.found.map(({ qty: _q, accounts: _a, ...f }) => f) };
    const onAdd = await open(plain, { held: ["TCS"] });
    expect(screen.getByText("Read from the statement's table")).toBeTruthy();
    expect(screen.queryByText(/shares$/)).toBeNull();
    expect(screen.getByText("Already in your portfolio")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add 3 selected" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0]).toEqual([{ symbol: "RELIANCE", isin: "INE002A01018" }, { symbol: "INFY", isin: "INE009A01021" }, { symbol: "ITC", isin: "INE154A01025" }]);
  });
});

// task #323 (developer file 21, parts 2, 7 and 8)
const UPSTOX: PdfFinds = {
  mode: "table", rows: 60, missing: [], notes: ["This statement has no buy price column. Its Rate column is each share's price on 20 Nov 2026, not what you paid: tick ..."],
  cas: { source: "Upstox", asOf: "21 Nov 2026", column: "Current Qty", price: null, priceHow: null, rateLike: "Rate", rate: "Rate", rateOn: "2026-11-20" },
  found: [
    { input: "RELIANCE INDUSTRIES LTD", symbol: "RELIANCE", name: "Reliance Industries Ltd", how: "isin", isin: "INE002A01018", qty: 20, lines: 2, rate: 1450.5, rateOn: "2026-11-20" },
    { input: "ITC LTD", symbol: "ITC", name: "ITC Ltd", how: "isin", isin: "INE154A01025", qty: 40, lines: 1, rate: 405.1, rateOn: "2026-11-20" },
  ],
  funds: [{ isin: "INF204KB14I2", input: "NIPPON INDIA ETF NIFTY BEES", qty: 120, rate: 289.4, rateOn: "2026-11-20" }, { isin: "INF179K01BB8", input: "HDFC SOME FUND", qty: 10 }],
};

describe("PdfImport: the statement's Rate as the buy price, and the ETFs", () => {
  it("offers the Rate option ticked, names the Rate on each row, says the lines were added up, and passes the choice on", async () => {
    const onAdd = await open(UPSTOX);
    expect(screen.getByText("Upstox statement of 21 Nov 2026: quantities from its Current Qty column · no buy prices in it")).toBeTruthy();
    const opt = screen.getByRole("checkbox", { name: "Use the statement's Rate as the buy price" }) as HTMLInputElement;
    expect(opt.checked).toBe(true);
    expect(screen.getByText(/Its Rate is each share's price on 20 Nov 2026, not what you paid/)).toBeTruthy();
    expect(screen.queryByText(/tick \.\.\./)).toBeNull();                               // the reader's own note is not repeated under the option
    expect(screen.getByText("added up from 2 lines")).toBeTruthy();
    expect(screen.getByText("Rate ₹1,450.50")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add 2 selected" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][1]).toMatchObject({ rateAsBuy: true, rateCol: "Rate", rateOn: "2026-11-20", price: null, etf: "" });
  });
  it("unticked: the rows hide the Rate and Add passes rateAsBuy false", async () => {
    const onAdd = await open(UPSTOX);
    fireEvent.click(screen.getByRole("checkbox", { name: "Use the statement's Rate as the buy price" }));
    expect(screen.getByRole("region").className).toContain("no-rate");
    fireEvent.click(screen.getByRole("button", { name: "Add 2 selected" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][1]).toMatchObject({ rateAsBuy: false });
  });
  it("lists the ETF lines for the ETF portfolio, sends the ticked ones there, and says so", async () => {
    calls.list = [];
    const onAdd = await open(UPSTOX, { etf: true });
    expect(await screen.findByText("New in your ETF portfolio")).toBeTruthy();
    expect(screen.getByText(/HDFC SOME FUND \(not an ETF FinLit lists/)).toBeTruthy();
    expect(calls.list[0]).toMatchObject({ method: "POST", path: "/api/me/etf-portfolio/import-preview" });
    fireEvent.click(screen.getByRole("button", { name: "Add 2 shares and 1 ETF" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(calls.list.find((c) => c.path.endsWith("/import-commit"))?.body).toEqual({ items: [{ symbol: "NIFTYBEES", qty: 120 }], existing: "replace" });
    expect(onAdd.mock.calls[0][1].etf).toMatch(/^1 ETF went to your ETF portfolio: 1 added\. Each has the statement's Rate of 20 Nov 2026 as its buy price\./);
    // with the Rate ticked, the ETF gets one buy in the ETF book at the Rate, dated by the Rate's day
    const put = calls.list.find((c) => c.method === "PUT" && c.path.endsWith("/book"))?.body as { lots: { symbol: string; qty: number; price: number; date: string }[] };
    expect(put.lots).toMatchObject([{ symbol: "NIFTYBEES", qty: 120, price: 289.4, date: "2026-11-20", side: "buy", pf: "main" }]);
  });
  it("without the ETF portfolio on the plan, the ETF lines are not offered and nothing is sent", async () => {
    calls.list = [];
    await open(UPSTOX);
    expect(screen.queryByText(/your ETF portfolio/)).toBeNull();
    expect(calls.list).toEqual([]);
  });
});
