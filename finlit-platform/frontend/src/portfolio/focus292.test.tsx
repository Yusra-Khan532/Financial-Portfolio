// @vitest-environment jsdom
// Task #292 (portfolio focus pack, 21 Nov 2026): the cursor jumped to "Date bought" of buy 1 after the first key typed into a Quantity or Price box of the
// Edit dialog, and the next keys were saved into that date. The page passes an inline onClose (a new function on every render) and the dialog's focus
// effect re-ran on each change. These tests render the dialogs inside a parent that re-renders on every key (as the page does, "saved as you type").
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditWindow, SellWindow } from "./EditSell";
import { AddPortfolioDialog } from "./Portfolios";
import { DEFAULT_PF, type Holding } from "../lib/portfolio";
import type { LotsProps } from "./HoldingCells";

vi.mock("../components/CoLogo", () => ({ CoLogo: () => <i /> }));
afterEach(cleanup);
const H: Holding[] = [
  { id: "a", symbol: "TIPSMUSIC", qty: 10, price: 700, date: "2025-01-10", owned: true },
  { id: "b", symbol: "TIPSMUSIC", qty: 5, price: 900, date: "2025-06-02", owned: true },
];

/** The page: holdings in state, edit() saves as you type and re-renders, onClose is a new arrow on every render. */
function Page({ kind, closed }: { kind: "edit" | "sell"; closed: () => void }) {
  const [hs, setHs] = useState(H), [, bump] = useState(0);
  const p: LotsProps = { holdings: hs, cur: "all", pfName: () => "My portfolio", nPortfolios: 1, priceOf: () => 815.95, changeOf: () => 0,
    add: vi.fn(), remove: vi.fn(), goTo: DEFAULT_PF, open: new Set(), onOpen: vi.fn(), focus: null,
    edit: (id, patch) => setHs((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x))) };
  return <>
    <button type="button" onClick={() => bump((n) => n + 1)}>refresh prices</button>
    {kind === "edit" ? <EditWindow p={p} symbol="TIPSMUSIC" title="TIPSMUSIC" name="Tips Music Ltd" onClose={() => closed()} onRemove={vi.fn()} />
      : <SellWindow p={p} symbol="TIPSMUSIC" title="TIPSMUSIC" name="Tips Music Ltd" onClose={() => closed()} onSave={vi.fn()} />}
    <pre data-testid="saved">{hs.map((h) => `${h.id}:${h.qty}@${h.date ?? ""}`).join(" ")}</pre>
  </>;
}

/** Type a value one key at a time into the focused box, as a member does: each key is a change the page saves and re-renders on. */
function typeInto(_el: HTMLInputElement, text: string) {
  let v = "";
  for (const ch of text) { v += ch; fireEvent.change(document.activeElement as HTMLInputElement, { target: { value: v } }); }
}

describe("Edit: typing stays in the box and nothing else is saved", () => {
  it("the dialog opens in Quantity of buy 1 (most members open it to change a quantity)", () => {
    render(<Page kind="edit" closed={vi.fn()} />);
    expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toBe("Quantity in buy 1 of TIPSMUSIC");
  });
  it("typing 250 into buy 2's quantity: the cursor stays, buy 2 is 250 and buy 1's date is unchanged (it was saved as 2 and buy 1's date cleared)", () => {
    render(<Page kind="edit" closed={vi.fn()} />);
    const q2 = screen.getByLabelText("Quantity in buy 2 of TIPSMUSIC") as HTMLInputElement;
    q2.focus();
    typeInto(q2, "250");
    expect(document.activeElement).toBe(q2);
    expect(screen.getByTestId("saved").textContent).toBe("a:10@2025-01-10 b:250@2025-06-02");
  });
  it("the same in a Price box, and a refresh of the page while typing does not move the cursor", () => {
    render(<Page kind="edit" closed={vi.fn()} />);
    const p2 = screen.getByLabelText("Buy price in buy 2 of TIPSMUSIC") as HTMLInputElement;
    p2.focus();
    typeInto(p2, "95");
    act(() => { fireEvent.click(screen.getByRole("button", { name: "refresh prices" })); });
    p2.focus(); typeInto(p2, "950");
    expect(document.activeElement).toBe(p2);
    expect(screen.getByTestId("saved").textContent).toBe("a:10@2025-01-10 b:5@2025-06-02");   // price is not in the saved text; dates and quantities untouched
  });
  it("Escape closes with the newest onClose, even after re-renders", () => {
    const closed = vi.fn();
    render(<Page kind="edit" closed={closed} />);
    const q2 = screen.getByLabelText("Quantity in buy 2 of TIPSMUSIC") as HTMLInputElement;
    q2.focus(); typeInto(q2, "7");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

describe("the other dialogs keep the cursor where the member is typing", () => {
  it("Record a sale: a page refresh while typing does not move the cursor", () => {
    render(<Page kind="sell" closed={vi.fn()} />);
    const price = screen.getByLabelText(/Price/) as HTMLInputElement;
    price.focus();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "refresh prices" })); });
    expect(document.activeElement).toBe(price);
  });
  it("Add portfolio: typing a name re-renders the parent; the cursor stays in Name", () => {
    function P() { const [n, setN] = useState(0); return <><span>{n}</span><AddPortfolioDialog taken={[]} onClose={() => setN((x) => x + 1)} onSave={() => setN((x) => x + 1)} /></>; }
    render(<P />);
    const name = screen.getByLabelText(/Name/) as HTMLInputElement;
    name.focus();
    typeInto(name, "Joint account");
    expect(document.activeElement).toBe(name);
  });
});
