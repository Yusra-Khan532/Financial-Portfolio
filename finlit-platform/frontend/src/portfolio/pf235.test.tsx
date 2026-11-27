// @vitest-environment jsdom
// Task #235 phase 1 (the 18 Nov portfolios pack): the portfolios bar and the Add dialog (B1), the holding columns in three groups with the buy and sale rows
// and the total row (B7, B9, B11), the money row and the missing note (B7, B11), the Sold list (B14), the Columns switch (B7), and the score box (B13).
// Figures: the pack's TIPSMUSIC (Dhan) and ITC (Upstox) examples.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../components/CoLogo", () => ({ CoLogo: () => null }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
import type { Holding } from "../lib/portfolio";
import { moneyOf } from "../lib/ledger";
import { AddPortfolioDialog, PortfoliosBar } from "./Portfolios";
import { MoneyRow, SoldList, soldOf } from "./MoneyRow";
import { SharesTable } from "./SharesTable";
import { ScoreBox } from "./pack/PageTop";
import type { LotsProps } from "./HoldingCells";
import type { Line, Ready } from "../lib/portfolioOverview";

afterEach(cleanup);
const L = (id: string, s: string, pf: string, d: string, q: number, p: number, side?: "sell"): Holding => ({ id, symbol: s, pf, date: d, qty: q, price: p, owned: true, ...(side ? { side } : {}) });
const H: Holding[] = [L("t1", "TIPSMUSIC", "dhan", "2025-04-15", 16, 498.4), L("t2", "TIPSMUSIC", "dhan", "2025-07-21", 26, 582.19), L("t3", "TIPSMUSIC", "dhan", "2025-08-15", 12, 552.53),
  L("t4", "TIPSMUSIC", "dhan", "2025-09-06", 8, 777.73), L("t5", "TIPSMUSIC", "dhan", "2026-02-10", 22, 640, "sell"),
  L("i1", "ITC", "upstox", "2025-06-12", 40, 412.3), L("i2", "ITC", "upstox", "2025-09-03", 20, 438.1), L("i3", "ITC", "upstox", "2026-01-20", 30, 455, "sell"), L("i4", "ITC", "upstox", "2026-07-08", 30, 402.5, "sell"),
  { id: "c1", symbol: "TCS", qty: 1, price: 0, pf: "dhan" }];
const PX: Record<string, number> = { TIPSMUSIC: 700, TCS: 3000, ITC: 400 };
const PFS = [{ id: "dhan", name: "Dhan" }, { id: "upstox", name: "Upstox" }];

describe("portfolios bar and the Add dialog (B1)", () => {
  it("lists All accounts first, then each portfolio with its shares, value and gain; arrow keys move; Rename and Remove confirm in the page", () => {
    const pick = vi.fn(), rename = vi.fn(() => null), remove = vi.fn();
    const figs = (id: string) => { const m = moneyOf(H, id, (s) => PX[s], () => 0); return { n: m.n, now: m.now, withQty: m.withQty, gainPct: m.full && m.invested ? (m.gain / m.invested) * 100 : null }; };
    const { rerender } = render(<PortfoliosBar list={PFS} cur="all" onPick={pick} figs={figs} onAdd={() => {}} onRename={rename} onRemove={remove} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.querySelector("b")!.textContent)).toEqual(["All accounts", "Dhan", "Upstox"]);
    expect(tabs[1].querySelector("small")!.textContent).toBe("2 shares · ₹28,000 · +14.3%");        // 40 TIPSMUSIC left × ₹700; TCS has no buys yet
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" }); expect(pick).toHaveBeenCalledWith("dhan");
    rerender(<PortfoliosBar list={PFS} cur="upstox" onPick={pick} figs={figs} onAdd={() => {}} onRename={rename} onRemove={remove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove portfolio" }));
    expect(screen.getByRole("alertdialog").textContent).toMatch(/^Remove Upstox and its 0 shares from FinLit\? Nothing changes at your broker\. This cannot be undone\./);
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" })); expect(remove).toHaveBeenCalledWith("upstox");
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("New name"), { target: { value: "Upstox (joint)" } }); fireEvent.submit(screen.getByLabelText("New name").closest("form")!);
    expect(rename).toHaveBeenCalledWith("upstox", "Upstox (joint)");
  });
  it("the broker fills the name until it is typed; a taken name is refused with a suggestion; three ways to start; Esc closes", () => {
    const save = vi.fn(), close = vi.fn();
    render(<AddPortfolioDialog taken={["Dhan", "Upstox"]} onClose={close} onSave={save} />);
    const dlg = screen.getByRole("dialog");
    expect((within(dlg).getByLabelText("Name") as HTMLInputElement).value).toBe("Dhan");
    fireEvent.click(within(dlg).getByRole("button", { name: "Add portfolio" }));
    expect(within(dlg).getByRole("alert").textContent).toBe('You already have a portfolio called Dhan. Try another name, such as "Dhan (joint)".');
    fireEvent.change(within(dlg).getByLabelText("Broker"), { target: { value: "Groww" } });
    expect((within(dlg).getByLabelText("Name") as HTMLInputElement).value).toBe("Groww");
    expect(within(dlg).getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(within(dlg).getByRole("radio", { name: /The broker's holdings file/ }));
    fireEvent.click(within(dlg).getByRole("button", { name: "Add portfolio" }));
    expect(save).toHaveBeenCalledWith({ name: "Groww", broker: "Groww", start: "file" });
    fireEvent.keyDown(document, { key: "Escape" }); expect(close).toHaveBeenCalled();
  });
});

const ready = (symbol: string) => ({ symbol, status: "ready", name: symbol + " Ltd", sector: "Media", industry: "Media", isBank: false, basis: "consolidated", reportAt: "2026-10-30",
  price: PX[symbol], changePct: 1, priceAsOf: "2026-11-13", marketCapCr: 5000, ratios: {}, financials: { year: { available: false }, quarter: { available: false } } } as unknown as Ready);
const lots = (over: Partial<LotsProps> = {}): LotsProps => ({ holdings: H, cur: "all", pfName: (id) => ({ dhan: "Dhan", upstox: "Upstox" } as Record<string, string>)[id] ?? id, nPortfolios: 2,
  priceOf: (s) => PX[s], changeOf: () => 1, add: vi.fn(), edit: vi.fn(), remove: vi.fn(), goTo: "dhan", open: new Set(["TIPSMUSIC"]), onOpen: vi.fn(), focus: null, ...over });
const table = (p: LotsProps, lines: string[] = ["TIPSMUSIC", "TCS"]) => render(<MemoryRouter><SharesTable lots={p} lines={lines.map((s): Line => ({ symbol: s, name: s, ov: ready(s) }))} meta={{}} page={null} mode="eq" colors={{}}
  model="prism" tab="overview" period="year" limit={500} state="ready" onTab={() => {}} onPeriod={() => {}} actions={() => null} qtyOf={() => null} onQty={() => {}} /></MemoryRouter>);

describe("holding columns, buys and sales (B7, B9, B11)", () => {
  it("groups the columns, and the holding reads 40 left at ₹612.40 with +₹2,612 booked", () => {
    table(lots());
    expect([...document.querySelectorAll("th.x-g")].map((t) => t.textContent)).toEqual(["What you paid", "What it is worth now", "Gain or loss"]);
    const heads = [...document.querySelectorAll("thead tr:last-child th")].map((t) => (t.querySelector("button")?.childNodes[0]?.textContent ?? "").trim()).filter(Boolean);
    expect(heads.slice(0, 10)).toEqual(["Share", "Size", "Qty", "Avg buy price", "Invested", "Latest price", "Today", "Value now", "₹", "%"]);
    const btn = screen.getByRole("button", { name: "Hide the 4 buys · 1 sale of TIPSMUSIC" });
    const row = btn.closest("tr")!;
    expect(btn.closest("td")!.className).toBe("pfx-name");                                  // task #249: the drop-down sits next to the name
    expect(row.querySelector("td.x-qty")!.textContent).toBe("404 buys · 1 sale");           // the quantity cell is plain text
    expect(row.querySelector("td.x-qty button")).toBeNull();
    expect(row.querySelector("td.x-avg")!.textContent).toBe("₹612.40average of what is left");
    expect(row.querySelector("td.x-gl")!.textContent).toMatch(/\+₹3,504\+₹2,612 booked/);          // 40 × 700 − 24,496 open; 2,612 booked
  });
  it("buy rows show what is left; the sale row shows FIFO, cost, sold for and the booked gain", () => {
    table(lots());
    const rows = [...document.querySelectorAll("tr.x-lot")];
    expect(rows.map((r) => r.querySelector(".x-lot-k")!.textContent)).toEqual(["Bought", "Bought", "Bought", "Bought", "Sold"]);
    expect(rows.map((r) => r.querySelector(".x-lot-n")?.textContent ?? "")).toEqual(["all sold", "20 left · 6 sold", "", "", "FIFO: 2 buys"]);
    expect(rows[0].className).toMatch(/x-done/);
    const sale = rows[4];
    expect(sale.querySelector(".x-lot-n")!.getAttribute("title")).toBe("First in, first out: 16 from the buy of 15 Apr 2025; 6 from the buy of 21 Jul 2025");
    expect(sale.querySelector("td.l-inv")!.textContent).toBe("₹11,468cost, first in first out");
    expect(sale.querySelector("td.l-now")!.textContent).toBe("₹14,080sold for");
    expect(sale.querySelector("td.l-gl")!.textContent).toBe("+₹2,612booked"); expect(sale.querySelector("td.l-glp")!.textContent).toBe("+22.8%");
    expect(rows[1].querySelector(".acc-tag")!.textContent).toBe("Dhan");
  });
  it("adds a buy or a sale to the right portfolio, changes a buy and removes one", () => {
    const p = lots();
    table(p);
    fireEvent.click(screen.getByRole("button", { name: "+ Add a buy" })); expect(p.add).toHaveBeenCalledWith("TIPSMUSIC", "dhan", "buy");
    fireEvent.click(screen.getByRole("button", { name: "− Add a sale" })); expect(p.add).toHaveBeenCalledWith("TIPSMUSIC", "dhan", "sell");
    fireEvent.change(screen.getAllByLabelText("Buy price in this buy of TIPSMUSIC")[0], { target: { value: "500" } });
    expect(p.edit).toHaveBeenCalledWith("t1", { price: 500 });
    fireEvent.click(screen.getAllByRole("button", { name: "Remove this buy of TIPSMUSIC" })[1]); expect(p.remove).toHaveBeenCalledWith("t2");
  });
  it("a sale larger than what was held is flagged red and left out", () => {
    table(lots({ holdings: [L("x1", "TIPSMUSIC", "dhan", "2026-01-01", 62, 10), L("x2", "TIPSMUSIC", "dhan", "2026-02-01", 70, 12, "sell")] }));
    const bad = document.querySelector("tr.x-lot.x-sell")!;
    expect(bad.className).toMatch(/x-err/); expect(bad.querySelector(".x-lot-n")!.textContent).toBe("only 62 held then");
    expect(screen.getByRole("button", { name: /^(Show|Hide) the .* of TIPSMUSIC$/ }).className).toMatch(/bad/);
  });
  it("the total row adds up the list: 2 shares in 2 portfolios; Columns: Your holding hides the scores, Scores hides the holding", () => {
    table(lots());
    expect(document.querySelector("tr.x-tot th")!.textContent).toBe("Total · 2 shares in 2 portfolios");
    fireEvent.click(screen.getByRole("button", { name: "Your holding" }));
    expect(document.querySelector("table")!.className).toMatch(/only-h/);
    fireEvent.click(screen.getByRole("button", { name: "Scores" }));
    expect(document.querySelector("table")!.className).toMatch(/only-s/);
  });
});

describe("money row, Sold and the score box (B7, B11, B13, B14)", () => {
  it("shows Invested, Value now, Gain, Today and Booked gain +₹3,083 from 3 sales; the missing note opens the holding", () => {
    const t = moneyOf(H, "all", (s) => PX[s], () => 1), add = vi.fn();
    render(<MoneyRow t={t} onAdd={add} />);
    expect([...document.querySelectorAll(".xm-k")].map((k) => k.textContent)).toEqual(["Invested", "Value now", "Gain or loss", "Today", "Booked gain"]);
    expect(document.querySelectorAll(".xm-v")[4].textContent).toBe("+₹3,083");
    expect(document.querySelectorAll(".xm-x")[4].textContent).toBe("From 3 sales, first in, first out");
    expect(screen.getByRole("status").textContent).toMatch(/^1 of 2 shares have quantities and buy prices\. Add the buys of TCS to count it in Invested and Gain\./);
    fireEvent.click(screen.getByRole("button", { name: "Add it now" })); expect(add).toHaveBeenCalledWith("TCS", "qty");
  });
  it("lists ITC sold in full in Upstox: bought ₹25,254, sold for ₹25,725, booked +₹471 (+1.9%), with each buy and sale", () => {
    const rm = vi.fn();
    render(<SoldList items={soldOf(H, "all")} all pfName={(id) => (id === "upstox" ? "Upstox" : "Dhan")} onRemoveSale={rm} />);
    const bar = screen.getByRole("button", { name: /1 share sold in full/ });
    expect(bar.textContent).toBe("Sold1 share sold in full+₹471 booked · first in, first out▾"); expect(bar.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(bar);
    const row = screen.getByText("ITC").closest("tr")!;
    expect([...row.querySelectorAll("td")].slice(1, 6).map((c) => c.textContent)).toEqual(["Upstox", "₹25,25460 bought", "₹25,72560 sold", "+₹471", "+1.9%"]);
    fireEvent.click(within(row).getByRole("button", { name: /Buys and sales/ }));
    expect(screen.getByText(/first in, first out: 10 from 12 Jun 25, 20 from 3 Sep 25/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Remove this sale of ITC" })[1]); expect(rm).toHaveBeenCalledWith("i4", "ITC");
    expect(soldOf(H, "dhan")).toEqual([]);                                                        // ITC was sold in Upstox only
  });
  it("the score box: one line, and Add buys when shares have no quantity", () => {
    const go = vi.fn();
    render(<ScoreBox total={62} band="Healthy" shares={14} missing={1} onAddQty={go} />);
    expect(document.querySelector(".eqt-score-x")!.textContent).toBe("Add buys for 1 share to weight the score by value now.");
    fireEvent.click(screen.getByRole("button", { name: "Add buys" })); expect(go).toHaveBeenCalled();
    cleanup(); render(<ScoreBox total={62} band="Healthy" shares={14} missing={0} onAddQty={go} />);
    expect(document.querySelector(".eqt-score-x")!.textContent).toBe("Weighted by value now across 14 shares.");
  });
});
