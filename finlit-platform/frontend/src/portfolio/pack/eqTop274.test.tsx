// @vitest-environment jsdom
// Task #274 (the 20 Nov equity pack, changes 2 and 16): the compact top. The money box says what it covers (1 of 15 with a bar, or a green line once every
// share has buys), the day's best and worst share, Your portfolios (All accounts and the three largest, "N more ▾", the open one always shows), the score
// on a 0–100 scale, the three views drawn as tabs with "Not opened yet" kept per member, "Your list, seen 3 ways", and the Next view card.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EqTitle, MoneyBox, NextView, PfPicker, ScorePanel, ViewCards, YourPortfolios, useEqViewsSeen, type ViewCard } from "./EqTop";
import { prefs } from "../../lib/prefs";
import type { Money } from "../../lib/ledger";
import type { View } from "./EquityPack";

afterEach(cleanup);
beforeEach(() => prefs.set({ viewsSeen: [] }, true));
const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const money = (o: Partial<Money> = {}): Money => ({ n: 15, withQty: 1, full: 1, invested: 15600, now: 16319, gain: 719, today: 94, prev: 16225, booked: 0, bookedOk: true, nSales: 0, bad: 0,
  missing: Array.from({ length: 14 }, (_, i) => ({ symbol: "S" + i, what: "qty" as const })), ...o });

describe("the money box (change 2)", () => {
  it("shows value now, Invested, Today and Gain with arrows and % pills, and the day's best and worst share", () => {
    wrap(<MoneyBox t={money()} picker={<span>picker</span>} up={9} down={6} best={{ symbol: "526433", label: "ASM Technologies", chg: 3.47 }} worst={{ symbol: "ZENSARTECH", label: "ZENSARTECH", chg: -2.36 }}
      have={[{ symbol: "TIPSMUSIC", label: "TIPSMUSIC" }]} onAdd={() => {}} />);
    const box = screen.getByRole("region", { name: /Your stocks/ });
    expect(box.textContent).toMatch(/₹16,319value now/);
    expect(box.textContent).toMatch(/Invested₹15,600what you paid/);
    expect(box.textContent).toMatch(/Today▲ ₹94 \+0\.58%prices: 9 up · 6 down/);
    expect(box.textContent).toMatch(/Gain or loss▲ ₹719 \+4\.6%on what you invested/);
    expect(box.textContent).toMatch(/best ASM Technologies ▲3\.47% · worst ZENSARTECH ▼2\.36%/);
    expect(within(box).getByRole("link", { name: "ASM Technologies" }).getAttribute("href")).toBe("/stocks/526433");
  });
  it("says what the money covers: 1 of 15 with a bar, the one share named, and Add buys", () => {
    const add = vi.fn();
    wrap(<MoneyBox t={money()} picker={null} up={0} down={0} best={null} worst={null} have={[{ symbol: "TIPSMUSIC", label: "TIPSMUSIC" }]} onAdd={add} />);
    expect(screen.getByText(/Money figures cover 1 of 15 shares\./).parentElement!.textContent).toBe("Money figures cover 1 of 15 shares. Only TIPSMUSIC has a quantity and buy price; the other 14 count in every score but not in the money. Add buys");
    expect(screen.getByRole("img", { name: "1 of 15 shares have a quantity and buy price" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add buys" })); expect(add).toHaveBeenCalled();
  });
  it("becomes a green line once every share has a quantity and buy price", () => {
    wrap(<MoneyBox t={money({ withQty: 15, full: 15, missing: [] })} picker={null} up={0} down={0} best={null} worst={null} have={[]} onAdd={() => {}} />);
    expect(screen.getByRole("note").textContent).toBe("All 15 shares have a quantity and buy price, so the money figures cover the whole list.");
  });
});

describe("Your portfolios and the picker (change 2)", () => {
  const list = [{ id: "a", name: "Zerodha" }, { id: "b", name: "Dhan" }, { id: "c", name: "Upstox" }, { id: "d", name: "Groww" }, { id: "e", name: "Kite 2" }];
  const val: Record<string, number> = { all: 500, a: 100, b: 300, c: 50, d: 200, e: 10 };
  const figs = (id: string) => ({ n: 3, now: val[id], withQty: id === "e" ? 0 : 3, gainPct: 2 });
  it("shows All accounts and the three largest; more fold behind “2 more ▾”, the open one always shows", () => {
    wrap(<YourPortfolios list={list} cur="c" figs={figs} onPick={() => {}} onAdd={() => {}} onRename={() => null} onRemove={() => {}} max={10} />);
    const names = () => screen.getAllByRole("radio").map((r) => r.querySelector("b")!.textContent);
    expect(names()).toEqual(["All accounts", "Zerodha", "Dhan", "Upstox", "Groww"]);   // Dhan, Groww, Zerodha are the three largest; Upstox is open
    fireEvent.click(screen.getByRole("button", { name: "1 more ▾" }));
    expect(names()).toContain("Kite 2");
    expect(screen.getAllByRole("radio").find((r) => r.textContent?.includes("Kite 2"))!.textContent).toMatch(/no buys yet/);
  });
  it("switches on a tap, and Add portfolio opens the dialog", () => {
    const pick = vi.fn(), add = vi.fn();
    wrap(<YourPortfolios list={list.slice(0, 2)} cur="all" figs={figs} onPick={pick} onAdd={add} onRename={() => null} onRemove={() => {}} max={10} />);
    fireEvent.click(screen.getByRole("radio", { name: /Dhan/ })); expect(pick).toHaveBeenCalledWith("b");
    fireEvent.click(screen.getByRole("button", { name: "+ Add portfolio" })); expect(add).toHaveBeenCalled();
  });
  it("the picker reads “All accounts · 15 shares ▾” and lists every portfolio", () => {
    const pick = vi.fn();
    wrap(<PfPicker list={list.slice(0, 2)} cur="all" figs={() => ({ n: 15, now: 0, withQty: 0, gainPct: null })} onPick={pick} />);
    const b = screen.getByRole("button", { name: /Portfolio: All accounts, 15 shares/ }); expect(b.textContent).toMatch(/All accounts · 15 shares/);
    fireEvent.click(b); fireEvent.click(screen.getByRole("menuitemradio", { name: /Dhan/ })); expect(pick).toHaveBeenCalledWith("b");
  });
});

describe("the title row (change 2)", () => {
  it("has the plan, the (i), Prices at close, the add row and ⋯ with the related pages and Clear portfolio", () => {
    wrap(<EqTitle plan="Gold" asOf="2026-11-19" add={<button>Add</button>} clear={<button className="cpf-open">Clear portfolio</button>} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Equity portfolio");
    expect(screen.getByText("Gold")).toBeTruthy(); expect(screen.getByRole("button", { name: "About the Equity portfolio" })).toBeTruthy();
    expect(screen.getByText("Prices at close · 19 Nov")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /More: related pages/ }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((a) => a.textContent)).toEqual(["MF portfolio", "Watchlists", "Alerts", "Learn more"]);
    expect(within(menu).getByRole("button", { name: "Clear portfolio" })).toBeTruthy();
  });
});

describe("the score and the three views (change 16)", () => {
  it("reads “Your portfolio score is Fair” on a 0–100 scale with a marker, and the live line about buys", () => {
    wrap(<ScorePanel total={67} band="Fair" missing={14} shares={15} onAdd={() => {}} />);
    expect(screen.getByText(/Your portfolio score is/).textContent).toBe("Your portfolio score is Fair");
    expect(screen.getByRole("img", { name: "67 on a scale of 0 to 100" })).toBeTruthy();
    expect((document.querySelector(".eqx-mark") as HTMLElement).style.left).toBe("67%");
    expect(screen.getByText(/Add buys for 14 shares to weight the score by value now\./)).toBeTruthy();
  });
  const cards: ViewCard[] = [{ id: "portfolio", v: "Fair · 62", x: "Average Prism", help: "h", how: "w" }, { id: "diversification", v: "73 · Fairly spread", x: "6 macro sectors", help: "h", how: "w" },
    { id: "risk", v: "In line · β 1.03", x: "Swings", help: "h", how: "w" }];
  function Page({ start = "portfolio" as View }) {
    const [v, setV] = useState<View>(start); const seen = useEqViewsSeen(v);
    return <><ViewCards cards={cards} view={v} onView={setV} seen={seen} /><div id="eq-panel" /><NextView view={v} onView={setV} /></>;
  }
  it("draws the views as tabs: the open one checked; the others open from anywhere on the card; Not opened yet clears once opened and stays cleared", () => {
    const { unmount } = wrap(<Page />);
    expect(screen.getByRole("tab", { selected: true }).id).toBe("eq-tab-portfolio");
    expect(screen.getByText(/1 of 3 opened · Diversification and Risk still to see/)).toBeTruthy();
    expect(screen.getAllByText("Not opened yet")).toHaveLength(2);
    fireEvent.click(screen.getByText("73 · Fairly spread"));   // anywhere on the card
    expect(screen.getByRole("tab", { selected: true }).id).toBe("eq-tab-diversification");
    expect(screen.getByText(/2 of 3 opened · Risk still to see/)).toBeTruthy();
    expect(prefs.get().viewsSeen).toEqual(expect.arrayContaining(["eq:portfolio", "eq:diversification"]));
    unmount(); wrap(<Page />);   // kept per member: opening the page again keeps the count
    expect(screen.getAllByText("Not opened yet")).toHaveLength(1);
  });
  it("ends each view with a Next view card that leads on (Portfolio → Diversification → Risk → Portfolio)", () => {
    wrap(<Page start="risk" />);
    const next = screen.getByRole("button", { name: /Next view/ });
    expect(next.textContent).toMatch(/Next viewPortfolioInside: shares, trends, peers, leaders/);
    act(() => { fireEvent.click(next); });
    expect(screen.getByRole("tab", { selected: true }).id).toBe("eq-tab-portfolio");
    expect(screen.getByRole("button", { name: /Next view/ }).textContent).toMatch(/Diversification/);
  });
  it("moves between the tabs with the arrow keys", () => {
    wrap(<Page />);
    fireEvent.keyDown(screen.getByRole("tab", { selected: true }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { selected: true }).id).toBe("eq-tab-diversification");
  });
});
import { useState } from "react";
