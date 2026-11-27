// @vitest-environment jsdom
// Task #274 (the 20 Nov equity pack, changes 4, 5, 6, 7 and 13): the trend matrix with Up first, the new cell names, a big count and its share in each cell,
// hidden text per cell, names as links to the report; Business and price with a fifth box, In between, so every rated share is in exactly one box; and the
// words under the trend scores. The reading is the server's portfolio_trend on the pack's 15 shares (src/lib/__fixtures__/trend-20nov-pack.json).
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
import { LinkNames, TrendSection, prismShown } from "./EquityPack";
import { trendScoreWord } from "../ShareFilters";
import type { Share } from "../../lib/equityPack";
import type { TrendRead } from "../../lib/mfPortfolio";
import FX from "../../lib/__fixtures__/trend-20nov-pack.json";

afterEach(cleanup);
const t = FX.trend as unknown as TrendRead;
const shares = FX.shares.map((s) => ({ symbol: s.symbol, name: s.name, industry: null, size: null, chg: null, prism: s.prism, prismWord: null, valuation: null, risk: null, st: s.st, lt: s.lt,
  below52: null, m1: null, peer: null, notCompared: null })) as unknown as Share[];
const view = () => render(<MemoryRouter><TrendSection t={t} shares={shares} /></MemoryRouter>);

describe("the trend matrix (changes 4, 6)", () => {
  it("starts with Up / Up in rows and columns, with the new names and hidden text per cell", () => {
    view();
    const table = screen.getByRole("table", { name: /Trend matrix/ });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Long-term trend", "↑ Up", "→ Sideways", "↓ Down"]);
    expect(within(table).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["↑ Up", "→ Sideways", "↓ Down"]);
    const names = Array.from(table.querySelectorAll("tbody td .eq-tg-w")).map((w) => w.firstChild!.textContent);
    expect(names).toEqual(["Rising", "Rising but resting", "Rising but dipping", "Flat, turning up", "Flat", "Flat, turning down", "Falling but bouncing", "Falling but resting", "Falling"]);
    const cells = Array.from(table.querySelectorAll("tbody td")) as HTMLElement[];
    expect(cells[1].querySelector(".sr-only")!.textContent).toBe(" (Long term Rising, Short term Flat): 6 stocks");
    expect(cells[0].querySelector(".eq-tg-n")!.textContent).toBe("320%");   // 3 of 15
    expect(cells[3].classList.contains("e")).toBe(true);                   // Flat, turning up: empty, muted
    expect(cells[1].classList.contains("e")).toBe(false);
  });
  it("puts every rated share in exactly one cell, and darker cells hold more", () => {
    view();
    const cells = Array.from(document.querySelectorAll(".eq-tg tbody td")) as HTMLElement[];
    const syms = cells.flatMap((c) => Array.from(c.querySelectorAll("a.eq-co")).map((a) => a.getAttribute("href")!.replace("/stocks/", "")));
    expect(syms.sort()).toEqual(FX.shares.map((s) => s.symbol).sort());
    const k = (c: HTMLElement) => parseInt(c.style.getPropertyValue("--k"));
    expect(k(cells[1])).toBeGreaterThan(k(cells[0]));   // 6 shares against 3
    expect(k(cells[0])).toBeGreaterThan(k(cells[4]));   // 3 against 1
  });
});

describe("names link to the report (change 5)", () => {
  it("shows a BSE-only company by its name, linked by its code", () => {
    view();
    const a = Array.from(document.querySelectorAll<HTMLAnchorElement>("a.eq-co")).find((x) => x.getAttribute("href") === "/stocks/526433")!;
    expect(a.textContent).not.toMatch(/526433/);
    expect(a.textContent).toMatch(/ASM Technologies/i);
  });
  it("turns the companies in a sentence into links", () => {
    render(<MemoryRouter><p><LinkNames text="TECHM leads; INFY trails, and TECHMX is not a holding." shares={shares} /></p></MemoryRouter>);
    expect(screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([["TECHM", "/stocks/TECHM"], ["INFY", "/stocks/INFY"]]);
  });
});

describe("Business and price: In between (change 7)", () => {
  it("adds a fifth box with each share's reason, and the five boxes hold all 15", () => {
    view();
    const boxes = Array.from(document.querySelectorAll(".eq-bpr")) as HTMLElement[];
    expect(boxes.map((b) => b.querySelector(".eq-bpr-t b")!.textContent)).toEqual(["Business and price agree (strong)", "Price behind the business", "Price ahead of the business", "Business and price agree (weak)", "In between"]);
    const mid = boxes[4];
    expect(mid.querySelector(".eq-bpr-t")!.textContent).toBe("In between47%");
    expect(mid.textContent).toMatch(/7 stocks · Average Prism, or a flat long-term trend/);
    const chips = Array.from(mid.querySelectorAll("a.eq-co")).map((a) => a.textContent);
    expect(chips.some((c) => /· Prism 56$/.test(c ?? ""))).toBe(true); expect(chips.some((c) => /· Prism 64 · flat trend$/.test(c ?? ""))).toBe(true);   // task #385: short names on the Equity portfolio
    const all = boxes.flatMap((b) => Array.from(b.querySelectorAll("a.eq-co")).map((a) => a.getAttribute("href")));
    expect(all).toHaveLength(15); expect(new Set(all).size).toBe(15);
    expect(screen.queryByText(/rated shares sit in between/)).toBeNull();   // the old line goes
  });
  it("never rounds a Prism score across a line", () => {
    expect(prismShown(56)).toBe("56"); expect(prismShown(64.9)).toBe("64.9"); expect(prismShown(49.6)).toBe("49.6"); expect(prismShown(57.68)).toBe("58");
  });
});

describe("the words under the trend scores (change 13)", () => {
  it("uses the pack's five words on the ±20 and ±50 lines", () => {
    expect([75, 50, 49, 20, 19, 0, -19, -20, -49, -50, -80].map(trendScoreWord)).toEqual(
      ["Rising strongly", "Rising strongly", "Rising", "Rising", "Flat", "Flat", "Flat", "Falling", "Falling", "Falling sharply", "Falling sharply"]);
    expect(trendScoreWord(19.6)).toBe("Rising");   // shows as +20
  });
});
