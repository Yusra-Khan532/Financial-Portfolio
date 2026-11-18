// @vitest-environment jsdom
// Task #217: the buy history of each share in the Equity portfolio. The store keeps every buy (the old Qty box kept one line per share and deleted the rest),
// the dropdown lists them with the totals and the average price, buys can be added, changed and removed, and the table shows Avg price, Invested and P&L.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../components/CoLogo", () => ({ CoLogo: () => null }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
import { portfolio } from "../lib/portfolio";
import { buysOf, historyActions } from "../lib/buyHistory";
import { BuyHistory } from "./BuyHistory";
import { SharesTable } from "./SharesTable";
import type { Line, Ready } from "../lib/portfolioOverview";

afterEach(cleanup);
beforeEach(() => portfolio.replace({ holdings: [
  { id: "r1", symbol: "RELIANCE", qty: 15, price: 500, date: "2025-01-10", owned: true }, { id: "r2", symbol: "RELIANCE", qty: 20, price: 100, date: "2025-06-02", owned: true },
  { id: "t1", symbol: "TCS", qty: 1, price: 0, isin: "INE467B01029" }] }));
const acts = () => historyActions(() => portfolio.get().holdings, portfolio);
const hs = () => portfolio.get().holdings;

describe("the store keeps every buy (#217)", () => {
  it("a bare quantity no longer deletes the other buys of a share (the original bug), and is set only on a share without buys", () => {
    expect(acts().setQty("RELIANCE", 99)).toBe(false);
    expect(buysOf(hs(), "RELIANCE").map((b) => b.qty)).toEqual([15, 20]);
    expect(acts().setQty("TCS", 12)).toBe(true);
    expect(hs().find((h) => h.id === "t1")).toMatchObject({ qty: 12, owned: true });
  });
  it("the first buy fills the name-only line (keeping its ISIN); more buys are new lines; removing the last buy keeps the share as a name", () => {
    acts().add("TCS", { symbol: "TCS", qty: 3, price: 3000, date: "2026-11-01", owned: true });
    expect(hs().filter((h) => h.symbol === "TCS")).toEqual([{ id: "t1", symbol: "TCS", qty: 3, price: 3000, date: "2026-11-01", owned: true, isin: "INE467B01029" }]);
    acts().add("TCS", { symbol: "TCS", qty: 2, price: 3100, owned: true });
    expect(buysOf(hs(), "TCS").map((b) => `${b.qty}@${b.price}`)).toEqual(["3@3000", "2@3100"]);
    expect(hs().filter((h) => h.symbol === "TCS").every((h) => h.isin === "INE467B01029")).toBe(true);
    const second = buysOf(hs(), "TCS")[1].id;
    acts().edit(second, { symbol: "TCS", qty: 4, price: 2900, date: "2026-11-10", owned: true });
    expect(hs().find((h) => h.id === second)).toMatchObject({ qty: 4, price: 2900, date: "2026-11-10" });
    acts().remove(second); acts().remove("t1");
    expect(hs().filter((h) => h.symbol === "TCS")).toEqual([{ id: "t1", symbol: "TCS", qty: 1, price: 0, date: undefined, owned: false, isin: "INE467B01029" }]);
  });
});

describe("the dropdown (#217, screenshot 2)", () => {
  const draw = () => { const on = { add: vi.fn(), edit: vi.fn(), remove: vi.fn() };
    render(<BuyHistory symbol="RELIANCE" buys={buysOf(hs(), "RELIANCE")} price={1420} onAdd={on.add} onEdit={on.edit} onRemove={on.remove} />); return on; };
  it("lists each buy (# · date · qty · price · total value), then total qty 35 and the average price 271.43", () => {
    draw();
    const rows = [...document.querySelectorAll(".bh-t tbody tr")].map((r) => [...r.querySelectorAll("td")].slice(0, 5).map((c) => c.textContent));
    expect(rows).toEqual([["1", "10-Jan-2025", "15", "500.00", "7,500.00"], ["2", "02-Jun-2025", "20", "100.00", "2,000.00"]]);
    const foot = document.querySelector(".bh-t tfoot tr")!;
    expect(foot.querySelector("th")!.textContent).toBe("Total qty 35 · Avg price");
    expect([...foot.querySelectorAll("td")].slice(0, 4).map((c) => c.textContent)).toEqual(["35", "271.43", "9,500.00", "49,700.00"]);
    expect(foot.textContent).toMatch(/\+40,200\.00\+423\.16%/);                   // the screenshot's 40,200.00 and 423.16%
    expect(screen.getByText(/Average price = total invested ÷ total quantity across all buys\./)).toBeTruthy();
  });
  it("adds a buy, refuses a wrong one in words, changes one and removes one", () => {
    const on = draw();
    const add = document.querySelector(".bh-add form") as HTMLFormElement;
    fireEvent.change(within(add).getByLabelText("Quantity"), { target: { value: "0" } });
    fireEvent.submit(add);
    expect(screen.getByRole("alert").textContent).toMatch(/more than 0/); expect(on.add).not.toHaveBeenCalled();
    fireEvent.change(within(add).getByLabelText("Date"), { target: { value: "2026-11-17" } });
    fireEvent.change(within(add).getByLabelText("Quantity"), { target: { value: "5" } });
    fireEvent.change(within(add).getByLabelText("Price"), { target: { value: "1,400" } });
    fireEvent.submit(add);
    expect(on.add).toHaveBeenCalledWith({ symbol: "RELIANCE", qty: 5, price: 1400, date: "2026-11-17", owned: true });
    fireEvent.click(screen.getByRole("button", { name: "Change buy 2 of RELIANCE" }));
    const ed = document.querySelector(".bh-editrow form") as HTMLFormElement;
    fireEvent.change(within(ed).getByLabelText("Price"), { target: { value: "110" } });
    fireEvent.submit(ed);
    expect(on.edit).toHaveBeenCalledWith("r2", { symbol: "RELIANCE", qty: 20, price: 110, date: "2025-06-02", owned: true });
    fireEvent.click(screen.getByRole("button", { name: "Remove buy 1 of RELIANCE" }));
    expect(on.remove).toHaveBeenCalledWith("r1");
  });
  it("says why a buy without a price or date is blank, and a share with no buys says how to start", () => {
    render(<BuyHistory symbol="INFY" buys={[{ id: "x", symbol: "INFY", qty: 4, price: 0, owned: true }]} price={null} onAdd={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("Date not given")).toBeTruthy(); expect(screen.getByText("Not given")).toBeTruthy();
    expect(screen.getByText(/One buy has no price, so it is counted in the quantity but left out of the average\. No price today yet/)).toBeTruthy();
    cleanup();
    render(<BuyHistory symbol="TCS" buys={[]} price={3000} onAdd={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText(/No buys yet for TCS\. Add each buy with its date, quantity and price/)).toBeTruthy();
  });
});

describe("Your shares with the buy history (#217)", () => {
  const ready = (symbol: string, price: number) => ({ symbol, status: "ready", name: symbol + " Ltd", sector: "Energy", industry: "Refineries & Marketing", isBank: false, basis: "consolidated", reportAt: "2026-10-30",
    price, changePct: 1, priceAsOf: "2026-11-13", marketCapCr: 1800000, ratios: {}, financials: { year: { available: false }, quarter: { available: false } } } as unknown as Ready);
  const LINES: Line[] = [{ symbol: "RELIANCE", name: "Reliance", ov: ready("RELIANCE", 1420) }, { symbol: "TCS", name: "TCS", ov: ready("TCS", 3000) }];
  it("shows Qty with its buys, Avg price, Invested, Current value and P&L; the summary; and opens the history under the share", () => {
    const h = acts();
    render(<MemoryRouter><SharesTable lines={LINES} meta={{}} page={null} mode="eq" colors={{}} model="prism" tab="overview" period="year" limit={30} state="ready" onTab={() => {}} onPeriod={() => {}}
      actions={() => null} qtyOf={(s) => buysOf(hs(), s).reduce((a, b) => a + b.qty, 0) || null} onQty={() => {}}
      history={{ buysOf: (s) => buysOf(hs(), s), add: h.add, edit: h.edit, remove: h.remove }} /></MemoryRouter>);
    const heads = [...document.querySelectorAll("thead tr:last-child th")].map((t) => (t.querySelector("button")?.childNodes[0]?.textContent ?? "").trim()).filter(Boolean);
    expect(heads.slice(0, 7)).toEqual(["Share", "Size", "Qty", "Avg price", "Invested", "Current value", "P&L"]);
    const rel = screen.getByRole("button", { name: "Open the buy history of RELIANCE" }).closest("tr")!;
    expect([...rel.querySelectorAll("td")].slice(2, 7).map((c) => c.textContent)).toEqual(["352 buys ▾", "271.43", "₹9,500", "₹49,700", "+₹40,200+423.16%"]);
    expect(screen.getByRole("button", { name: "Open the buy history of TCS" }).textContent).toBe("Add buys ▾");
    expect(document.querySelector(".bh-sum")!.textContent).toMatch(/Invested₹9,500Current value₹49,700Total P&L\+₹40,200 \(\+423\.16%\)/);
    fireEvent.click(screen.getByRole("button", { name: "Open the buy history of RELIANCE" }));
    expect(screen.getByRole("region", { name: "Buy history of RELIANCE" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close the buy history of RELIANCE" }).getAttribute("aria-expanded")).toBe("true");
  });
});
