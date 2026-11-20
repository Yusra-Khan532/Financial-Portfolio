// @vitest-environment jsdom
// Task #277 (All my investments pack of 20 Nov 2026, changes 1, 2, 16): the compact top, the four views as tabs and the Next view card.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AllInvestments, Kind, KindMoney } from "../lib/myInvest";
import { prefs } from "../lib/prefs";
import QTY from "./sample-qty.json";
import { NextView, TopCard, ViewTiles, VIEW_ORDER, type AccRow } from "./Top";

afterEach(cleanup);
beforeEach(() => prefs.set({ viewsSeen: [] }));
const D = () => structuredClone(QTY) as unknown as AllInvestments;
const M = (n: number, missing: string[], now: number, invested: number): Record<Kind | "all", KindMoney> => {
  const k = { n, full: n - missing.length, invested, now, gain: now - invested, missing };
  return { all: k, shares: k, funds: { ...k, n: 0, missing: [] }, etfs: { ...k, n: 0, missing: [] } };
};
const ACC = (id: string, name: string, value: number | null): AccRow => ({ id, name, sub: "1 share", value, gainPct: value ? 4.6 : null, color: "#0e6471", initial: name[0] });
const top = (money: Record<Kind | "all", KindMoney>, accs: AccRow[] = [], onPick = vi.fn(), d = D()) =>
  render(<MemoryRouter><TopCard d={d} money={money} accs={accs} cur="all" onPick={onPick} openQty={() => {}} loading={false} /></MemoryRouter>);

describe("the compact top (changes 1, 2)", () => {
  it("title row: plan, Prices at close, Add/Edit quantities, Import ▾ and ⋯ with the three pages; no add box", () => {
    top(M(12, [], 1000, 900));
    const h = screen.getByRole("banner", { name: "All my investments" });
    expect(within(h).getByRole("heading", { level: 1 }).textContent).toBe("All my investments");
    expect(h.textContent).toContain("Gold"); expect(h.textContent).toMatch(/Prices at close · \d+ \w{3}/);
    expect(within(h).queryByRole("textbox")).toBeNull();                                 // change 1: no add box
    fireEvent.click(within(h).getByRole("button", { name: "Import ▾" }));
    expect(screen.getAllByRole("menuitem").map((a) => a.textContent)).toEqual(["Shares: broker file on the Equity portfolio", "Mutual funds: CAS or statement on the MF portfolio", "ETFs: broker file on the ETF portfolio"]);
  });
  it("the money box says what it covers: 1 of 20, the one with buys named, each kind ⅓; a bar for 1 of 20", () => {
    const missing = Array.from({ length: 19 }, (_, i) => "X" + i);
    const d = D(); d.byValue = false; d.shares[0].symbol = "TIPSMUSIC";
    top(M(20, missing, 16311, 15600), [], vi.fn(), { ...d, shares: [d.shares[0]], funds: [], etfs: [] });
    const box = screen.getByRole("region", { name: "All your investments" });
    expect(box.textContent).toContain("₹16,311"); expect(box.textContent).toContain("₹15,600");
    expect(box.textContent).toContain("Money figures cover 1 of 20 holdings. Only TIPSMUSIC has a quantity and buy price; the other 19 count in every reading but not in the money, and each kind counts as ⅓.");
    expect(screen.getByRole("img", { name: "1 of 20 holdings have a quantity and buy price" })).toBeTruthy();
  });
  it("once every holding has buys: a green line, no bar", () => {
    top(M(12, [], 1000, 900));
    expect(screen.getByRole("note").textContent).toBe("All 12 holdings have a quantity and buy price, so the money figures cover the whole list.");
    expect(screen.queryByRole("img", { name: /holdings have a quantity/ })).toBeNull();
  });
  it("Your portfolios: All accounts and every account; tap to switch; past four, the three largest and N more ▾", () => {
    const pick = vi.fn();
    top(M(12, [], 1000, 900), [ACC("a", "My portfolio", 500), ACC("b", "port-2", null), ACC("c", "My funds", 300), ACC("d", "My ETFs", 200)], pick);
    const g = screen.getByRole("radiogroup", { name: "Portfolio" });
    expect(within(g).getAllByRole("radio").map((r) => r.querySelector("b")!.textContent)).toEqual(["All accounts", "My portfolio", "port-2", "My funds", "My ETFs"]);
    expect(within(g).getAllByRole("radio")[2].textContent).toContain("no buys yet");
    fireEvent.click(within(g).getAllByRole("radio")[1]); expect(pick).toHaveBeenCalledWith("a");
    cleanup();
    top(M(12, [], 1000, 900), [ACC("a", "A", 500), ACC("b", "B", 100), ACC("c", "C", 300), ACC("d", "D", 200), ACC("e", "E", 50)]);
    expect(screen.getAllByRole("radio").map((r) => r.querySelector("b")!.textContent)).toEqual(["All accounts", "A", "C", "D"]);
    fireEvent.click(screen.getByRole("button", { name: "2 more ▾" }));
    expect(screen.getAllByRole("radio")).toHaveLength(6);
  });
});

describe("the four views as tabs (change 16) and Next view", () => {
  it("the open one has a check; the others an arrow, Not opened yet, and open from anywhere on the card; 1 of 4 opened", () => {
    const go = vi.fn();
    render(<ViewTiles d={D()} view="all" onView={go} seen={new Set(["all"])} />);
    expect(screen.getByText(/1 of 4 opened · Equity, Mutual funds and ETFs still to see/)).toBeTruthy();
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("you are on this view");
    expect(screen.getAllByText("Not opened yet")).toHaveLength(3);
    fireEvent.click(screen.getByRole("tab", { name: /^Go to ETFs/ })); expect(go).toHaveBeenLastCalledWith("etf");
    fireEvent.click(screen.getByText("Mutual funds", { selector: ".mi7-tk" })); expect(go).toHaveBeenLastCalledWith("mf");
    expect(document.body.textContent).not.toContain("β");
  });
  it("opening a view is kept in the member's settings, so its mark goes for good", async () => {
    const { useViewsSeen } = await import("./Top");
    function Probe({ v }: { v: "equity" }) { const s = useViewsSeen(v); return <span>{[...s].join(",")}</span>; }
    render(<Probe v="equity" />);
    expect(prefs.get().viewsSeen).toContain("mi:equity");
  });
  it("Next view leads on: All together → Equity → Mutual funds → ETFs → All together", () => {
    const go = vi.fn();
    for (const v of VIEW_ORDER) { render(<NextView d={D()} view={v} onView={go} />); fireEvent.click(screen.getByRole("button", { name: /Next view/ })); cleanup(); }
    expect(go.mock.calls.map((c) => c[0])).toEqual(["equity", "mf", "etf", "all"]);
  });
});
