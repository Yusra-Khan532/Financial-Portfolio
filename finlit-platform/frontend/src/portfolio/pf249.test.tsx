// @vitest-environment jsdom
// Task #249 (portfolio buys update, 19 Nov 2026): "a drop down near the stock name to see this, not when we click on buys. Make this the same on all portfolio
// pages." The buys open from a small ▾ next to the name (Equity and ETF: after the name link; MF: at the end of the ISIN line); the quantity cell is plain text.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../components/CoLogo", () => ({ CoLogo: () => null }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
import type { Holding } from "../lib/portfolio";
import { SharesTable } from "./SharesTable";
import type { LotsProps } from "./HoldingCells";
import type { Line, Ready } from "../lib/portfolioOverview";

afterEach(cleanup);
const H: Holding[] = [
  { id: "t1", symbol: "TIPSMUSIC", pf: "dhan", date: "2025-04-15", qty: 12, price: 760, owned: true },
  { id: "t2", symbol: "TIPSMUSIC", pf: "dhan", date: "2025-07-21", qty: 8, price: 810, owned: true },
  { id: "k1", symbol: "KINGFA", pf: "dhan", qty: 0, price: 0, owned: true },            // added to the list, no buy yet
];
const PX: Record<string, number> = { TIPSMUSIC: 819.4, KINGFA: 6187.5 };
const ready = (symbol: string) => ({ symbol, status: "ready", name: symbol + " Ltd", sector: "Media", industry: "Media", isBank: false, basis: "consolidated", reportAt: "2026-10-30",
  price: PX[symbol], changePct: 1, priceAsOf: "2026-11-18", marketCapCr: 5000, ratios: {}, financials: { year: { available: false }, quarter: { available: false } } } as unknown as Ready);
const lots = (open: string[] = [], onOpen = vi.fn()): LotsProps => ({ holdings: H, cur: "all", pfName: () => "Dhan", nPortfolios: 1, priceOf: (s) => PX[s], changeOf: () => 1,
  add: vi.fn(), edit: vi.fn(), remove: vi.fn(), goTo: "dhan", open: new Set(open), onOpen, focus: null });
const table = (p: LotsProps) => render(<MemoryRouter><SharesTable lots={p} lines={["TIPSMUSIC", "KINGFA"].map((s): Line => ({ symbol: s, name: s, ov: ready(s) }))} meta={{}} page={null} mode="eq"
  colors={{}} model="prism" tab="overview" period="year" limit={500} state="ready" onTab={() => {}} onPeriod={() => {}} actions={() => null} qtyOf={() => null} onQty={() => {}} /></MemoryRouter>);
const rowOf = (sym: string) => document.querySelector(`tr[data-sym="${sym}"]`)!;

describe("#249: the buys drop-down sits next to the name", () => {
  it("Equity: the ▾ follows the name link on the name's own line, and reads 'Show the 2 buys of TIPSMUSIC'", () => {
    table(lots());
    const btn = screen.getByRole("button", { name: "Show the 2 buys of TIPSMUSIC" });
    expect(btn.className).toBe("x-namecv");
    expect(btn.closest("span")!.className).toBe("x-nl");
    expect(btn.previousElementSibling!.matches("a.pfx-co")).toBe(true);                     // right after the name link
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.getAttribute("aria-controls")).toBe("lots-TIPSMUSIC");
    expect(btn.querySelector("svg path")!.getAttribute("d")).toBe("M6 9l6 6 6-6");
  });
  it("a share with no buys reads 'Add a buy of KINGFA' and is drawn muted; the quantity cell reads '− no buys'; 'add a buy' stays in the average cell", () => {
    table(lots());
    const btn = screen.getByRole("button", { name: "Add a buy of KINGFA" });
    expect(btn.className).toBe("x-namecv x-none");
    expect(rowOf("KINGFA").querySelector("td.x-qty")!.textContent).toBe("−no buys");
    expect(rowOf("KINGFA").querySelector("td.x-avg button.x-need-b")!.textContent).toBe("add a buy");
  });
  it("the quantity cell is plain text ('20 / 2 buys') in the old button's box: no button left in it", () => {
    table(lots());
    const q = rowOf("TIPSMUSIC").querySelector("td.x-qty")!;
    expect(q.querySelector("button")).toBeNull();
    expect(q.firstElementChild!.className).toBe("x-ro x-qtyt");
    expect(q.textContent).toBe("202 buys");
  });
  it("the ▾ opens and closes the same buy rows: open, it reads 'Hide the 2 buys of TIPSMUSIC' and the rows show with their id", () => {
    const onOpen = vi.fn();
    const { unmount } = table(lots([], onOpen));
    fireEvent.click(screen.getByRole("button", { name: "Show the 2 buys of TIPSMUSIC" }));
    expect(onOpen).toHaveBeenCalledWith("TIPSMUSIC", true);
    unmount();
    table(lots(["TIPSMUSIC"]));
    const btn = screen.getByRole("button", { name: "Hide the 2 buys of TIPSMUSIC" });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("lots-TIPSMUSIC")!.className).toMatch(/x-lot/);
    expect(document.querySelectorAll('tr.x-lot[data-lsym="TIPSMUSIC"]')).toHaveLength(2);
    expect(document.querySelector("tr.x-lotadd")).toBeTruthy();                                 // "+ Add a buy · − Add a sale"
  });
  it("the CSS: an 18 px button that never makes the name line taller, a 32 px tap area, and the quantity text in the old button's 87.28 px box", () => {
    const css = readFileSync(resolve(process.cwd(), "src/portfolio/holdings-kit.css"), "utf8");
    expect(css).toMatch(/\.x-namecv \{[^}]*width: 18px; height: 18px; margin: -3px 0 -3px 3px;/);
    expect(css).toMatch(/\.x-namecv::after \{ content: ""; position: absolute; inset: -7px; \}/);
    expect(css).toMatch(/\.x-qtyt \{[^}]*min-width: 87\.28px; padding: 4px 10px; border: 1px solid transparent;/);
  });
  it("the old quantity button is gone from every page (no x-lotbtn left in the code)", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) && !/\.test\./.test(f) ? [p] : []; });
    const left = walk(resolve(process.cwd(), "src")).filter((f) => readFileSync(f, "utf8").includes("x-lotbtn"));
    expect(left).toEqual([]);
  });
});
