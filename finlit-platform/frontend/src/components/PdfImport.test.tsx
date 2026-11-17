// @vitest-environment jsdom
// Task #191: a depository statement (NSDL or CDSL CAS) brings each share's quantity. The review shows it, adds new shares with it, and offers to set it on a
// share already in the list (ticked only when the member has not typed a quantity of their own). A broker report keeps the names-only review.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PdfFinds } from "../lib/holdingsPdf";

const finds = vi.hoisted(() => ({ value: null as PdfFinds | null }));
vi.mock("../lib/holdingsPdf", async (orig) => ({ ...(await orig<typeof import("../lib/holdingsPdf")>()), readPdfHoldings: vi.fn(async () => finds.value) }));
import { PdfImport } from "./PdfImport";

const CAS: PdfFinds = {
  mode: "table", rows: 20, missing: [], notes: [], cas: { source: "NSDL", asOf: "31 Oct 2026", column: "Current Bal" },
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
  render(<PdfImport file={pdf} index={[]} held={[]} room={50} onAdd={onAdd} onClose={vi.fn()} {...props} />);
  await screen.findByRole("region", { name: "Review companies found in the PDF" });
  return onAdd;
};
afterEach(cleanup);

describe("PdfImport with a depository statement", () => {
  it("says where the quantities come from and shows each one, with the demat accounts when there are several", async () => {
    await open(CAS);
    expect(screen.getByText("NSDL statement of 31 Oct 2026: quantities from its Current Bal column")).toBeTruthy();
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
    expect(onAdd).toHaveBeenCalledWith([{ symbol: "ITC", qty: 40 }, { symbol: "RELIANCE", qty: 25 }]);
  });
  it("only sets quantities when every share is already held", async () => {
    const onAdd = await open(CAS, { held: ["RELIANCE", "TCS", "INFY", "ITC"] });
    fireEvent.click(screen.getByRole("button", { name: "Set 4 quantities" }));
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
    expect(onAdd).toHaveBeenCalledWith([{ symbol: "RELIANCE" }, { symbol: "INFY" }, { symbol: "ITC" }]);
  });
});
