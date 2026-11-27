// @vitest-environment jsdom
// Task #183 (Equity portfolio): the score and one tile per tab, each tab's Key figures, and the sections bar.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyFigures, ScoreLocked, SectionsBar, TopGrid, type Sec } from "./PageTop";
import { portfolioCards, topTiles, type TabKey } from "../../lib/equityTop";
import type { Share } from "../../lib/equityPack";

afterEach(() => { cleanup(); localStorage.clear(); });
const sh = (symbol: string, o: Partial<Share> = {}): Share => ({ symbol, industry: "Banks", size: "Large", chg: 0, prism: 60, prismWord: "Healthy", valuation: 50, risk: 50, st: 10, lt: 20, below52: 5, m1: 1,
  peer: null, notCompared: null, ...o });
const LIST = [sh("A", { prism: 80, peer: { label: "leader", raw: null, rank: 1, of: 9, group: "Banks", vs: 5, bench: "x", direction: null } }),
  sh("B", { prism: 40, st: -20, lt: -10, peer: { label: "laggard", raw: null, rank: 8, of: 9, group: "Banks", vs: -9, bench: "x", direction: null } }), sh("C")];
const PAGE = { score: { score: 74, band: "Fairly spread" }, market: { eq: { beta: 1.31, vol: 27.1, vol_nifty: 14.4 } } };

describe("the top of the page: the score and one tile per tab", () => {
  it("Gold reads Prism in Prism's words (Strong, Healthy, Average, Weak); a plan without Prism sees no score (task #283)", () => {
    const g = topTiles(LIST, PAGE, "prism", { industries: 22, sizes: 3, macro: 9, sectors: 13 });
    expect(g.map((t) => [t.k, t.v])).toEqual([["Portfolio", "Average · 60"], ["Diversification analytics", "74 · Fairly spread"], ["Risk analytics", "Above · β 1.31"]]);
    expect(g[0].sub).toBe("Average FinLit Prism of your shares: 1 strong · 0 healthy · 1 average · 1 weak");
    expect(JSON.stringify(g[0])).not.toMatch(/Mixed|Watch|Fair\b|\bIQ\b/);
    expect(g[1].sub).toBe("9 macro sectors · 13 sectors · 22 industries · three of the four sizes");
    expect(topTiles(LIST, PAGE, "prism", { industries: 22, sizes: 4, macro: 9, sectors: 13 })[1].sub).toBe("9 macro sectors · 13 sectors · 22 industries · all four sizes");
    expect(g[2].sub).toBe("Against the index: bigger swings, 27.1% a year vs 14.4%");
    const s = topTiles(LIST, PAGE, "finlit", { industries: 22, sizes: 3 });
    expect([s[0].v, s[0].sub]).toEqual(["FinLit Prism · see plans", "3 shares, listed without a score on this plan"]);
    expect(JSON.stringify(s)).not.toMatch(/\bIQ\b|Mixed|Watch/);
  });
  it("the whole tile opens its tab, by click and by Enter or Space; its ⓘ does not", () => {
    const onOpen = vi.fn();
    render(<MemoryRouter><TopGrid score={<ScoreLocked />} tiles={topTiles(LIST, PAGE, "prism", { industries: 3, sizes: 3 })} onOpen={onOpen} /></MemoryRouter>);
    const tiles = screen.getAllByRole("link").filter((l) => l.classList.contains("eqt-tile"));
    fireEvent.click(tiles[1]); fireEvent.keyDown(tiles[2], { key: "Enter" }); fireEvent.keyDown(tiles[0], { key: " " });
    expect(onOpen.mock.calls.map((c) => c[0])).toEqual(["diversification", "risk", "portfolio"]);
    fireEvent.click(within(tiles[0]).getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(3);
  });
  it("Silver's score box says the score is a Gold reading, with a link to plans", () => {
    render(<MemoryRouter><ScoreLocked /></MemoryRouter>);
    expect(screen.getByText(/Worked out from FinLit Prism, part of the Gold plan/)).toBeTruthy();
  });
});

describe("Key figures", () => {
  it("Gold cards: against peers, price trend, valuation; a plan without Prism: against peers only (task #283)", () => {
    expect(portfolioCards(LIST, "prism", "Weak").map((c) => c.k)).toEqual(["Against peers", "Price trend", "Valuation"]);
    expect(portfolioCards(LIST, "prism", "Weak")[0]).toMatchObject({ v: "1 lead · 1 lag", text: "0 in line, 1 not compared. B (8 of 9) trail their groups most." });
    const s = portfolioCards(LIST, "finlit", null);
    expect(s.map((c) => [c.k, c.v])).toEqual([["Against peers", "1 lead · 1 lag"]]);
  });
  it("folds, remembers its state per tab in this browser, and each button jumps to its section and flashes it", () => {
    const target = document.createElement("div"); target.id = "eq-peers"; target.scrollIntoView = vi.fn(); document.body.appendChild(target);
    const { rerender } = render(<KeyFigures tab="portfolio" sub="Your 3 shares at a glance" cards={portfolioCards(LIST, "prism", "Weak")} />);
    fireEvent.click(screen.getByRole("button", { name: "See peers →" }));
    expect(target.scrollIntoView).toHaveBeenCalled(); expect(target.classList.contains("eqt-flash")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Hide ▴" }));
    expect(screen.queryByText("Against peers")).toBeNull();
    rerender(<KeyFigures tab="risk" sub="x" cards={portfolioCards(LIST, "prism", "Weak")} />);
    expect(screen.getByText("Against peers")).toBeTruthy();                                      // another tab keeps its own state
    rerender(<KeyFigures tab="portfolio" sub="x" cards={portfolioCards(LIST, "prism", "Weak")} />);
    expect(screen.queryByText("Against peers")).toBeNull();                                      // remembered
    target.remove();
  });
});

describe("the sections bar", () => {
  const ALL: Record<TabKey, { label: string; secs: Sec[] }> = {
    portfolio: { label: "Portfolio", secs: [["s1", "Your shares"], ["s2", "Trends"], ["s3", "Peers"]] },
    diversification: { label: "Diversification analytics", secs: [["d1", "Where it sits"]] }, risk: { label: "Risk analytics", secs: [["r1", "At a glance"]] },
  };
  it("numbers the open tab's sections with arrows between them; All sections lists all three tabs and switches tab", () => {
    const onTab = vi.fn();
    render(<SectionsBar tab="portfolio" all={ALL} onTab={onTab} />);
    const nav = screen.getByRole("navigation", { name: "Sections on this tab" });
    expect([...nav.querySelectorAll(".eqt-chip")].map((b) => b.textContent)).toEqual(["1Your shares", "2Trends", "3Peers"]);
    expect(nav.querySelectorAll(".eqt-arrow")).toHaveLength(2);
    expect(nav.querySelector('.eqt-chip[aria-current="true"]')?.textContent).toBe("1Your shares");
    fireEvent.click(screen.getByRole("button", { name: "All sections" }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["1Your shares", "2Trends", "3Peers", "1Where it sits", "1At a glance"]);
    fireEvent.click(screen.getByRole("menuitem", { name: /At a glance/ }));
    expect(onTab).toHaveBeenCalledWith("risk", "r1");
  });
});
