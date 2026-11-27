// @vitest-environment jsdom
// Task #274 (the 20 Nov equity pack, change 3): Edit | Sell under each share.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditSellLinks, EditWindow, SellWindow, planSale } from "./EditSell";
import { DEFAULT_PF, type Holding } from "../lib/portfolio";
import { rowsOf } from "../lib/ledger";
import type { LotsProps } from "./HoldingCells";

vi.mock("../components/CoLogo", () => ({ CoLogo: () => <i /> }));
afterEach(cleanup);
const H: Holding[] = [
  { id: "b1", symbol: "TIPSMUSIC", qty: 12, price: 700, date: "2024-06-01", owned: true },
  { id: "b2", symbol: "TIPSMUSIC", qty: 8, price: 900, date: "2026-10-01", owned: true },
  { id: "n1", symbol: "INFY", qty: 1, price: 0 },
];
const lotsOf = (hs: Holding[], over: Partial<LotsProps> = {}): LotsProps => ({ holdings: hs, cur: "all", pfName: () => "My portfolio", nPortfolios: 1, priceOf: (s) => (s === "TIPSMUSIC" ? 815.95 : 1500),
  changeOf: () => 0, add: vi.fn(), edit: vi.fn(), remove: vi.fn(), goTo: DEFAULT_PF, open: new Set(), onOpen: vi.fn(), focus: null, ...over });

describe("planSale: first in, first out, the realised gain by holding period, what is left", () => {
  it("a sale of 15 uses the 12 from June 2024 (long term) then 3 from October 2026 (short term)", () => {
    const pl = planSale(H, "TIPSMUSIC", DEFAULT_PF, { date: "2026-11-20", qty: 15, price: 800 });
    expect(pl.from).toEqual([{ date: "2024-06-01", qty: 12, price: 700 }, { date: "2026-10-01", qty: 3, price: 900 }]);
    expect(pl.longGain).toBe(1200);
    expect(pl.shortGain).toBe(-300);
    expect(pl.gain).toBe(900);
    expect(pl.left).toBe(5);
    expect(pl.err).toBeNull();
  });
  it("the preview matches what is saved: the ledger reads the saved sale the same way", () => {
    const saved: Holding[] = [...H, { id: "s1", symbol: "TIPSMUSIC", qty: 15, price: 800, date: "2026-11-20", owned: true, side: "sell" }];
    const fig = rowsOf(saved, "TIPSMUSIC", DEFAULT_PF).find((r) => r.row.id === "s1")!.fig as { gain: number | null };
    expect(fig.gain).toBe(planSale(H, "TIPSMUSIC", DEFAULT_PF, { date: "2026-11-20", qty: 15, price: 800 }).gain);
  });
});

describe("the Sell window", () => {
  it("defaults to all you have at the latest close; more than held says so and Save turns off; Save records the sale", () => {
    const onSave = vi.fn();
    render(<SellWindow p={lotsOf(H)} symbol="TIPSMUSIC" title="TIPSMUSIC" name="Tips Music Ltd" onClose={() => {}} onSave={onSave} />);
    expect(screen.getByRole("heading", { name: /Record a sale of TIPSMUSIC/ })).toBeTruthy();
    expect(screen.getByText("You have 20")).toBeTruthy();
    const qty = screen.getByLabelText(/Quantity/) as HTMLInputElement, price = screen.getByLabelText(/Price/) as HTMLInputElement;
    expect(qty.value).toBe("20"); expect(price.value).toBe("815.95");
    fireEvent.change(qty, { target: { value: "25" } });
    expect(screen.getByRole("alert").textContent).toBe("More than you have: you can record up to 20.");
    expect((screen.getByRole("button", { name: "Save the sale" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(qty, { target: { value: "15" } });
    expect(document.body.textContent).toMatch(/12 from the buy of 1 Jun 2024 at ₹700\.00/);
    expect(document.body.textContent).toMatch(/Left5 shares/);
    fireEvent.click(screen.getByRole("button", { name: "Save the sale" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ symbol: "TIPSMUSIC", qty: 15, price: 815.95, side: "sell", owned: true }));
  });
});

describe("Edit | Sell links", () => {
  it("Sell is greyed out for a share with no quantity: 'Add a buy first'", () => {
    render(<EditSellLinks p={lotsOf(H)} symbol="INFY" onEdit={() => {}} onSell={() => {}} />);
    const sell = screen.getByRole("button", { name: /Record a sale of INFY/ }) as HTMLButtonElement;
    expect(sell.disabled).toBe(true); expect(sell.title).toBe("Add a buy first");
  });
});

describe("the Edit window", () => {
  it("lists the buys with cost, a summary line, and Remove asks to confirm", () => {
    const onRemove = vi.fn(), onClose = vi.fn();
    render(<EditWindow p={lotsOf(H)} symbol="TIPSMUSIC" title="TIPSMUSIC" name="Tips Music Ltd" onClose={onClose} onRemove={onRemove} />);
    expect(screen.getAllByLabelText(/Quantity in buy/)).toHaveLength(2);
    expect(document.body.textContent).toMatch(/₹8,400/);                                  // 12 × 700
    expect(document.body.textContent).toMatch(/20 shares · average ₹780\.00 · invested ₹15,600/);
    fireEvent.click(screen.getByRole("button", { name: "Remove from your list" }));
    expect(screen.getByRole("heading", { name: "Remove TIPSMUSIC?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith("all"); expect(onClose).toHaveBeenCalled();
  });
  it("a share with no buys opens with one empty row (the first Add a buy)", () => {
    const add = vi.fn();
    render(<EditWindow p={lotsOf(H, { add })} symbol="INFY" title="INFY" name="Infosys Ltd" onClose={() => {}} onRemove={() => {}} />);
    expect(add).toHaveBeenCalledWith("INFY", DEFAULT_PF, "buy");
  });
});
