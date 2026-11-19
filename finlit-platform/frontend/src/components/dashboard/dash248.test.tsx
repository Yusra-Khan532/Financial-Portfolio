// @vitest-environment jsdom
// Task #248 (dashboard update pack of 19 Nov 2026): the Showing bar (pick which portfolios Step 1 reads) and "Share" becomes "Equity" as a kind label.
// The pack's checks: open and close with the mouse, Enter, Space and Escape, focus back on the button; "Only" picks one; unticking the last goes back to All
// accounts; the button shows the choice and turns amber; the choice is kept in prefs; one portfolio shows its name; no "Share(s)" kind label left.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { accountsOf, choiceLabel, equityHeld, etfHeld, mfHeld, pfParam, resolve, toggle, type DashPick } from "../../lib/dashPick";
import { prefs } from "../../lib/prefs";
import { KIND_TAG } from "../../lib/dashInvest";
import { ShowingBar } from "./ShowingBar";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", "..", ...p), "utf8");
afterEach(() => { cleanup(); prefs.set({ dashPortfolios: { equity: "all", mf: "all", etf: "all" } }); });
const H = (id: string, symbol: string, pf: string, qty: number, side?: "sell", owned = true) => ({ id, symbol, qty, price: 100, date: "2025-01-0" + id.length, pf, owned, ...(side ? { side } : {}) });
const ACC = accountsOf("equity", [{ id: "dhan", name: "Dhan", broker: "Dhan" }, { id: "upstox", name: "Upstox", broker: "Upstox" }, { id: "kite", name: "Zerodha" }],
  new Map([["dhan", 3], ["upstox", 1]]));

describe("the choice (lib/dashPick)", () => {
  it("each portfolio says where it comes from and how many holdings it has; no portfolio named yet reads as the page's own default", () => {
    expect(ACC.map((a) => [a.name, `${a.n} ${a.noun} · ${a.from}`])).toEqual([["Dhan", "3 shares · Dhan account"], ["Upstox", "1 share · Upstox account"], ["Zerodha", "0 shares · Added by you"]]);
    expect(accountsOf("mf", [], new Map()).map((a) => a.name)).toEqual(["My funds"]);
    expect(accountsOf("equity", undefined, new Map()).map((a) => a.name)).toEqual(["My portfolio"]);
  });
  it("the button's words: All accounts, one name, two joined by +, or N of M; one portfolio shows its own name", () => {
    expect(choiceLabel("all", ACC)).toBe("All accounts");
    expect(choiceLabel(["dhan"], ACC)).toBe("Dhan");
    expect(choiceLabel(["dhan", "upstox"], ACC)).toBe("Dhan + Upstox");
    expect(choiceLabel(resolve(["dhan", "upstox"], [...ACC, { ...ACC[0], id: "x", name: "X" }]), [...ACC, { ...ACC[0], id: "x", name: "X" }])).toBe("Dhan + Upstox");
    expect(choiceLabel(["dhan", "upstox", "kite"], [...ACC, { ...ACC[0], id: "x", name: "X" }, { ...ACC[0], id: "y", name: "Y" }])).toBe("3 of 5 accounts");
    expect(choiceLabel("all", accountsOf("equity", [], new Map()))).toBe("My portfolio");
  });
  it("a choice that names every portfolio, or none that exists, is All accounts; unticking the last goes back to All accounts", () => {
    expect(resolve(["dhan", "upstox", "kite"], ACC)).toBe("all");
    expect(resolve(["gone"], ACC)).toBe("all");
    expect(resolve(["upstox", "gone"], ACC)).toEqual(["upstox"]);
    expect(toggle("all", "dhan", ACC)).toEqual(["upstox", "kite"]);
    expect(toggle(["dhan"], "dhan", ACC)).toBe("all");
    expect(toggle(["dhan"], "upstox", ACC)).toEqual(["dhan", "upstox"]);
    expect(pfParam(["dhan", "upstox"])).toBe("dhan,upstox");
  });
  it("what each portfolio holds: Equity first in, first out within it (a name counts, a share sold in full does not); funds and ETFs alike", () => {
    const eq = equityHeld([H("a", "INFY", "dhan", 10), H("bb", "INFY", "dhan", 10, "sell"), H("c", "TCS", "dhan", 5), H("d", "INFY", "upstox", 2), H("e", "ITC", "upstox", 1, undefined, false)]);
    expect([...eq.get("dhan")!]).toEqual(["TCS"]);
    expect([...eq.get("upstox")!].sort()).toEqual(["INFY", "ITC"]);
    const line = (pf: string, units: number, side: "buy" | "sell" = "buy") => ({ id: pf + units + side, units, invested: null, boughtOn: null, pf, side });
    const mf = mfHeld({ holdings: [{ code: 1, lines: [line("groww", 10), line("groww", 10, "sell"), line("coin", 4)] }, { code: 2, lines: [] }] } as never, "groww");
    expect([...mf.get("coin")!]).toEqual(["1"]); expect([...mf.get("groww")!]).toEqual(["2"]);   // a fund only followed sits in the first platform
    const lot = (id: string, symbol: string, pf: string, qty: number, side: "buy" | "sell" = "buy") => ({ id, symbol, pf, side, qty, price: 10, date: "2025-01-01" });
    const etf = etfHeld({ portfolios: [], names: ["GOLDBEES"], lots: [lot("n1", "NIFTYBEES", "dhan", 5), lot("n2", "NIFTYBEES", "dhan", 5, "sell"), lot("n3", "NIFTYBEES", "upstox", 1)] }, "dhan");
    expect([...etf.get("upstox")!]).toEqual(["NIFTYBEES"]); expect([...etf.get("dhan")!]).toEqual(["GOLDBEES"]);
  });
  it("the choice is kept in prefs (saved with the account), and a bad saved value reads as All accounts", () => {
    prefs.set({ dashPortfolios: { equity: ["dhan"], mf: "all", etf: ["main", "<bad>"] as never } });
    expect(prefs.get().dashPortfolios).toEqual({ equity: ["dhan"], mf: "all", etf: ["main"] });
    prefs.set({ dashPortfolios: { equity: [] as never, mf: "some" as never, etf: "all" } });
    expect(prefs.get().dashPortfolios).toEqual({ equity: "all", mf: "all", etf: "all" });
  });
});

describe("the Showing bar", () => {
  const mk = (eq: "all" | string[]) => {
    const set = vi.fn();
    const pick = { accounts: { equity: ACC, mf: accountsOf("mf", [], new Map([["main", 2]])), etf: accountsOf("etf", [], new Map()) },
      choice: { equity: resolve(eq, ACC), mf: "all", etf: "all" }, set } as unknown as DashPick;
    render(<MemoryRouter><ShowingBar pick={pick} kinds={["equity", "mf", "etf"]} /></MemoryRouter>);
    return set;
  };
  it("three drop-downs; the Equity one opens with All accounts, each portfolio with its count and source, Only, + Add a portfolio and Done", () => {
    mk("all");
    const btns = screen.getAllByRole("button", { expanded: false });
    expect(btns.slice(0, 3).map((b) => b.textContent)).toEqual(["EquityAll accounts", "Mutual fundsMy funds", "ETFsMy ETFs"]);
    fireEvent.click(btns[0]);
    const pop = screen.getByRole("group", { name: "Equity portfolios the dashboard reads" });
    expect(pop.textContent).toContain("Dhan3 shares · Dhan account");
    expect(screen.getAllByRole("button", { name: /^Only / })).toHaveLength(3);
    expect(screen.getByRole("link", { name: "+ Add a portfolio" }).getAttribute("href")).toBe("/holdings");
    expect(screen.queryByRole("button", { name: "Show all accounts" })).toBeNull();
  });
  it("Escape closes and gives focus back; Done too; a click outside closes", () => {
    mk("all");
    const b = screen.getAllByRole("button")[0];
    fireEvent.click(b); fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: /Equity portfolios/ })).toBeNull(); expect(document.activeElement).toBe(b);
    fireEvent.click(b); fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("group", { name: /Equity portfolios/ })).toBeNull(); expect(document.activeElement).toBe(b);
    fireEvent.click(b); fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("group", { name: /Equity portfolios/ })).toBeNull();
  });
  it("Only picks one; unticking the last goes back to All accounts; ticking another adds it", () => {
    const set = mk(["dhan"]);
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Only Upstox" }));
    expect(set).toHaveBeenLastCalledWith("equity", ["upstox"]);
    fireEvent.click(screen.getByRole("checkbox", { name: /^Dhan/ }));
    expect(set).toHaveBeenLastCalledWith("equity", "all");
    fireEvent.click(screen.getByRole("checkbox", { name: /^Zerodha/ }));
    expect(set).toHaveBeenLastCalledWith("equity", ["dhan", "kite"]);
  });
  it("a filtered choice shows on the button, turns it amber and brings Show all accounts", () => {
    const set = mk(["dhan", "upstox"]);
    const b = screen.getAllByRole("button")[0];
    expect(b.textContent).toBe("EquityDhan + Upstox"); expect(b.className).toContain("on");
    fireEvent.click(screen.getByRole("button", { name: "Show all accounts" }));
    expect(set.mock.calls).toEqual([["equity", "all"], ["mf", "all"], ["etf", "all"]]);
  });
});

describe("Share becomes Equity as a kind label (pack table)", () => {
  it("the chip, the type badge and the card title (with its i button) say Equity; the card's sentence and the news are not touched", () => {
    expect(KIND_TAG.share).toBe("Equity");
    const my = read("components", "dashboard", "MyStocks.tsx"), pg = read("components", "dashboard", "Portfolio.tsx");
    expect(my).toContain('["portfolio", "Equity", counts.shares]'); expect(my).not.toContain('"Shares", counts.shares');
    expect(pg).toContain('title="Your equity at a glance"'); expect(pg).toContain('label="About “Your equity at a glance”"');
    expect(pg).not.toMatch(/title=\{?<?>?"?Your shares at a glance/);
  });
  it("the Showing bar is a cell of its own just before Step 1's blocks, and Steps 2 to 5 still read every holding", () => {
    const d = read("pages", "Dashboard.tsx");
    expect(d).toContain('<div key="dsh-show" className="dsh-cell full" data-block="show"><ShowingBar');
    expect(d).toMatch(/case "movers": return legacy\(<Movers items=\{items\} \/>\)/);   // items come from `followed`, not the picked list
    expect(d).toMatch(/case "stress": return <Stress followed=\{followed\}/);
  });
});
