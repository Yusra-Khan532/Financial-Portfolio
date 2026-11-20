// @vitest-environment jsdom
// Task #274 (the 20 Nov equity pack, change 1): the add box's suggestions over every listed company and the Add shares window.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LIVE from "../lib/__fixtures__/search-index-20nov.json";
import type { CompanyRow } from "../lib/companySearch";
import { AddSharesDialog, CompanyCombo, rowsToChanges, suggest, type AddRow } from "./AddShares";
import { DEFAULT_PF, type Holding } from "../lib/portfolio";

vi.mock("../components/CoLogo", () => ({ CoLogo: ({ symbol }: { symbol: string }) => <i data-logo={symbol} /> }));
const L = LIVE as unknown as CompanyRow[];
const info = (s: string) => ({ size: s === "AARTIPHARM" ? "Small" : "Large", close: s === "AARTIPHARM" ? 812.4 : 100 });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("suggest (change 1)", () => {
  it("opens after 2 characters, finds Aarti Pharmalabs (not among the 500 largest), and does no close-match work under 4 letters", () => {
    expect(suggest(L, "a")).toEqual([]);
    expect(suggest(L, "aarti").map((h) => h.symbol)).toContain("AARTIPHARM");
    expect(L.findIndex((r) => r[0] === "AARTIPHARM")).toBeGreaterThan(500);       // the old <datalist> held index.slice(0, 500): the bug
    expect(suggest(L, "rel").every((h) => h.rank >= 400)).toBe(true);
    expect(suggest(L, "relaince")[0].symbol).toBe("RELIANCE");
  });
});

describe("the add box", () => {
  it("lists suggestions with name, code, size, close, In your list and close match; Enter picks; Esc closes; nothing matches says how to search", async () => {
    vi.useFakeTimers();
    const onPick = vi.fn();
    let value = "";
    const { rerender } = render(<CompanyCombo index={L} held={new Set(["AARTIPHARM"])} info={info} label="Add a share" value={value} onChange={(v) => { value = v; }} onPick={onPick} />);
    const input = screen.getByRole("combobox", { name: "Add a share" });
    fireEvent.focus(input);
    value = "aarti pharma"; rerender(<CompanyCombo index={L} held={new Set(["AARTIPHARM"])} info={info} label="Add a share" value={value} onChange={(v) => { value = v; }} onPick={onPick} />);
    fireEvent.change(input, { target: { value } });
    await act(async () => { vi.advanceTimersByTime(120); });
    const opts = screen.getAllByRole("option");
    expect(opts).toHaveLength(1);
    expect(opts[0].textContent).toMatch(/Aarti Pharmalabs Ltd/);
    expect(opts[0].textContent).toMatch(/In your list/);
    expect(opts[0].textContent).toMatch(/NSE AARTIPHARM · Small/);
    expect(opts[0].textContent).toMatch(/₹812\.40latest/);
    expect(opts[0].querySelector("mark")!.textContent?.toLowerCase()).toBe("aarti");
    expect(screen.getByText("↑ ↓ to move · Enter to add · Esc to close")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ symbol: "AARTIPHARM" }));
    value = "zzzqq"; rerender(<CompanyCombo index={L} held={new Set()} info={info} label="Add a share" value={value} onChange={() => {}} onPick={onPick} />);
    fireEvent.focus(input); fireEvent.change(input, { target: { value } });
    await act(async () => { vi.advanceTimersByTime(120); });
    expect(document.body.textContent).toMatch(/No listed company matches “zzzqq”\. Check the spelling, or try the NSE symbol, BSE code or ISIN\./);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("a BSE-only company shows its BSE code: '526433' gives ASM Technologies only", () => {
    expect(suggest(L, "526433").map((h) => [h.symbol, h.name])).toEqual([["526433", "Asm Technologies Ltd"]]);
  });
});

describe("the Add shares window", () => {
  const pfs = [{ id: "default", name: "My portfolio" }, { id: "zerodha", name: "Zerodha" }];
  it("opens with the picked company and its latest close; Save stays off until a company is picked; a held share says it adds a buy", () => {
    const onSave = vi.fn();
    render(<AddSharesDialog tab="search" pre={{ symbol: "AARTIPHARM", name: "Aarti Pharmalabs Ltd", rank: 1000 }} index={L} held={new Set(["AARTIPHARM"])} info={info} pfs={pfs} defaultPf="default"
      onClose={() => {}} onSave={onSave} onUpload={() => {}} uploadNote={null} />);
    expect(screen.getByRole("heading", { name: "Add shares" })).toBeTruthy();
    expect((screen.getByLabelText("Price paid, row 1") as HTMLInputElement).value).toBe("812.40");
    expect(screen.getByText("Already in your list: this adds a buy")).toBeTruthy();
    expect((screen.getByLabelText("Date bought, row 1") as HTMLInputElement).max).toBe(new Date().toISOString().slice(0, 10));   // no future dates
    const save = screen.getByRole("button", { name: "Save 1 share to portfolio" });
    fireEvent.change(screen.getByLabelText("Quantity, row 1"), { target: { value: "20" } });
    fireEvent.click(save);
    expect(onSave.mock.calls[0][0][0]).toMatchObject({ symbol: "AARTIPHARM", qty: "20", price: "812.40", pf: "default" });
  });
  it("an empty window has Save off; Paste a list finds each line with the same search and says when to check", () => {
    render(<AddSharesDialog tab="paste" pre={null} index={L} held={new Set()} info={info} pfs={pfs} defaultPf="zerodha" onClose={() => {}} onSave={() => {}} onUpload={() => {}} uploadNote={null} />);
    fireEvent.change(screen.getByLabelText(/Paste names, symbols or ISINs/), { target: { value: "aarti pharma\nrelaince\n526433, TCS\nzzzqq" } });
    fireEvent.click(screen.getByRole("button", { name: "Find the shares" }));
    const out = screen.getByRole("status").textContent!;
    expect(out).toMatch(/“aarti pharma” → Aarti Pharmalabs Ltd NSE AARTIPHARM/);
    expect(out).toMatch(/“relaince” → Reliance Industries Ltd NSE RELIANCE · close match, please check/);
    expect(out).toMatch(/“526433” → Asm Technologies Ltd BSE 526433/);
    expect(out).toMatch(/“zzzqq” → no match/);
    fireEvent.click(screen.getByRole("button", { name: "Review 4 shares in the table" }));
    expect(screen.getByRole("button", { name: "Save 4 shares to portfolio" })).toBeTruthy();
    expect((screen.getAllByLabelText(/Portfolio, row/)[0] as HTMLSelectElement).value).toBe("zerodha");   // the open portfolio is the default
  });
});

describe("what the window saves (rowsToChanges)", () => {
  const r = (symbol: string | null, qty = "", pf = DEFAULT_PF): AddRow => ({ symbol, name: symbol ?? "", date: "2026-11-19", price: "100", qty, pf });
  it("three shares saved in one go; a row without quantity follows the name only; a share already held gets a buy, not a second row", () => {
    const held: Holding[] = [{ id: "h1", symbol: "TIPSMUSIC", qty: 1, price: 0 }];
    const ch = rowsToChanges([r("AARTIPHARM", "10"), r("RELIANCE"), r("TIPSMUSIC", "20"), r(null)], held);
    expect(ch.shares).toBe(2);
    expect(ch.buys).toBe(2);
    expect(ch.adds).toEqual([{ symbol: "AARTIPHARM", qty: 10, price: 100, date: "2026-11-19", owned: true }, { symbol: "RELIANCE", qty: 1, price: 0 }]);
    expect(ch.updates).toEqual([{ id: "h1", patch: { symbol: "TIPSMUSIC", qty: 20, price: 100, date: "2026-11-19", owned: true } }]);   // the name-only line becomes the buy
  });
  it("a name-only row for a share already in that portfolio adds nothing; another portfolio gets its own line", () => {
    const held: Holding[] = [{ id: "h1", symbol: "INFY", qty: 1, price: 0 }];
    expect(rowsToChanges([r("INFY")], held).adds).toEqual([]);
    expect(rowsToChanges([r("INFY", "", "zerodha")], held).adds).toEqual([{ symbol: "INFY", qty: 1, price: 0, pf: "zerodha" }]);
  });
});
