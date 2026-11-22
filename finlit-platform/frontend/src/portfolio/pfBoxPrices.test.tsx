// @vitest-environment jsdom
// Developer file 27 (founder, 23 Nov 2026: "why it showing different amount on the right box?"): Your portfolios, the picker and the sticky switch list every
// portfolio, but their figures were worked out with the prices of the selected portfolio's shares only. Another portfolio's shares that the open one did not
// hold had no price, so its value was short or read "no buys yet", All accounts changed with the selection, and the box re-ordered itself. Now each
// portfolio's value is its own shares at their own prices, whichever portfolio is open.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { moneyOf } from "../lib/ledger";
import type { Holding } from "../lib/portfolio";
import { pricesFrom, type OverviewHolding } from "../lib/portfolioOverview";
import { YourPortfolios } from "./pack/EqTop";

afterEach(cleanup);

// two broker accounts with sample shares: one share (ALPHA) is in both
const H: Holding[] = [
  { id: "1", symbol: "ALPHA", qty: 10, price: 100, owned: true, date: "2026-01-05", pf: "p1" },
  { id: "2", symbol: "BETA", qty: 5, price: 200, owned: true, date: "2026-01-05", pf: "p1" },
  { id: "3", symbol: "GAMMA", qty: 4, price: 500, owned: true, date: "2026-02-01", pf: "p2" },
  { id: "4", symbol: "ALPHA", qty: 2, price: 90, owned: true, date: "2026-02-01", pf: "p2" },
  { id: "5", symbol: "DELTA", qty: 3, price: 50, owned: true, date: "2026-02-01", pf: "p2" },
] as Holding[];
const PX: Record<string, number> = { ALPHA: 120, BETA: 210, GAMMA: 450, DELTA: 60 };
const ready = (symbol: string, price: number | null = PX[symbol], changePct = 1): OverviewHolding => ({ symbol, status: "ready", price, changePct } as unknown as OverviewHolding);
const answer = (syms: string[]) => new Map(syms.map((s) => [s, ready(s)]));
const ALL = answer(["ALPHA", "BETA", "GAMMA", "DELTA"]);
const OF = { p1: answer(["ALPHA", "BETA"]), p2: answer(["GAMMA", "ALPHA", "DELTA"]) };
const figs = (open: "p1" | "p2", id: string) => { const p = pricesFrom(OF[open], ALL); return moneyOf(H, id, p.priceOf, p.changeOf); };

describe("Your portfolios: each portfolio at its own prices (developer file 27)", () => {
  it("values a portfolio that is not open by its own shares, as it is valued when it is open", () => {
    expect(figs("p1", "p2").now).toBe(4 * 450 + 2 * 120 + 3 * 60);
    expect(figs("p1", "p2").now).toBe(figs("p2", "p2").now);
    expect(figs("p2", "p1").now).toBe(figs("p1", "p1").now);
    expect(figs("p1", "p2").withQty).toBe(3);
  });
  it("gives All accounts the same value and gain whichever portfolio is open", () => {
    const a = figs("p1", "all"), b = figs("p2", "all");
    expect(a.now).toBe(12 * 120 + 5 * 210 + 4 * 450 + 3 * 60);
    expect(b.now).toBe(a.now); expect(b.gain).toBe(a.gain); expect(b.today).toBeCloseTo(a.today, 6);
  });
  it("is what went wrong: with the open portfolio's prices alone the other portfolio came out short", () => {
    const only = pricesFrom(OF.p1), m = moneyOf(H, "p2", only.priceOf, only.changeOf);
    expect(m.now).toBe(2 * 120);                     // GAMMA and DELTA had no price
    expect(m.noPrice).toEqual(["GAMMA", "DELTA"]);
  });
  it("reads the open portfolio's answer first, then the all-accounts one, and never a share that is not ready", () => {
    const cur = new Map([["ALPHA", ready("ALPHA", 121)], ["BETA", { symbol: "BETA", status: "preparing", reason: "" } as OverviewHolding]]);
    const p = pricesFrom(cur, ALL);
    expect(p.priceOf("ALPHA")).toBe(121); expect(p.priceOf("BETA")).toBe(210); expect(p.priceOf("ZZNONE")).toBeNull();
    expect(pricesFrom(new Map([["BETA", ready("BETA", null)]]), ALL).priceOf("BETA")).toBe(210);
  });
});

describe("the box row says why a value is missing", () => {
  const list = [{ id: "p1", name: "First account" }, { id: "p2", name: "Second account" }];
  const row = (name: string) => screen.getAllByRole("radio").find((r) => r.querySelector("b")?.textContent === name)!;
  it("“no price yet” when the shares have buys but no price is in yet; “no buys yet” only when there are no buys", () => {
    const f = (id: string) => (id === "p1" ? { n: 2, now: 0, withQty: 0, gainPct: null, noPrice: 2 } : id === "p2" ? { n: 3, now: 0, withQty: 0, gainPct: null, noPrice: 0 } : { n: 5, now: 0, withQty: 0, gainPct: null, noPrice: 2 });
    render(<MemoryRouter><YourPortfolios list={list} cur="p1" figs={f} onPick={() => {}} onAdd={() => {}} onRename={() => null} onRemove={() => {}} max={10} /></MemoryRouter>);
    expect(row("First account").textContent).toMatch(/no price yet/);
    expect(row("Second account").textContent).toMatch(/no buys yet/);
  });
});

describe("the equity page passes every account's prices to the box", () => {
  const src = readFileSync(join(process.cwd(), "src/pages/Holdings.tsx"), "utf8");
  it("asks for every account's shares while one portfolio is open, and the box figures use them", () => {
    expect(src).toMatch(/const ovAll = useOverview\(allSymbols, !!model && !DEMO && cur !== "all"\)/);
    expect(src).toMatch(/const every = useMemo\(\(\) => pricesFrom\(byOv, byAll\)/);
    expect(src).toMatch(/const pfFigs = [^\n]*moneyOf\(st\.holdings, id, every\.priceOf, every\.changeOf\)/);
    for (const use of ["<PfPicker", "<YourPortfolios", "<StickySwitch"]) expect(src.split(use).slice(1).every((s) => /figs=\{pfFigs\}/.test(s.slice(0, 400)))).toBe(true);
  });
});
