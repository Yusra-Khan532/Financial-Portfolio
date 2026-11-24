// @vitest-environment jsdom
// Developer file 28 (founder, 23 Nov 2026: "check the score we are giving is weighted average when we have proper quantity and price? - does it make
// sense", then "each individual score too"): once every share has a quantity, the three cards read by value (the score's own figures), each card's (i)
// says which way it counts, the Portfolio card and the score use FinLit Prism's five words, and the score panel never says "Weighted by value" when the
// server counted every share the same.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { prismWord5, topTiles, type ByValue } from "../../lib/equityTop";
import type { Share } from "../../lib/equityPack";
import { ScorePanel } from "./EqTop";

afterEach(cleanup);
const sh = (symbol: string, prism: number | null): Share => ({ symbol, industry: "Banks", size: "Large", chg: 0, prism, prismWord: null, valuation: 50, risk: 50, st: 10, lt: 20, below52: 5, m1: 1,
  peer: null, notCompared: null } as Share);
const LIST = [sh("A", 82), sh("B", 30), sh("C", 58)];                      // simple mean 57
const PAGE = { score: { score: 74, band: "Fairly spread" }, market: { eq: { beta: 1.02, vol: 15.1, vol_nifty: 14.4 } } };
const SPREAD = { industries: 3, sizes: 2, macro: 2, sectors: 3 };
const BV: ByValue = { prism: 77.6, spread: { score: 41, band: "Somewhat concentrated" }, market: { beta: 1.24, vol: 21.3, vol_nifty: 14.4 } };

describe("the three cards by value (developer file 28)", () => {
  it("read the score's figures by value once every share has a quantity, and say so", () => {
    const [p, d, r] = topTiles(LIST, PAGE, "prism", SPREAD, BV);
    expect(p.v).toBe("Healthy · 78");                                           // by value, not the simple mean 57
    expect(p.sub).toBe("Average FinLit Prism of your shares, by value: 1 strong · 0 healthy · 1 average · 0 weak · 1 poor");
    expect(d.v).toBe("41 · Somewhat concentrated");
    expect(d.sub).toBe("By value now (74 by count) · 2 macro sectors · 3 sectors · 3 industries · two of the four sizes");
    expect(r.v).toBe("Above · β 1.24");
    expect(r.sub).toBe("By value now, against the index: bigger swings, 21.3% a year vs 14.4%");
    for (const t of [p, d, r]) expect(t.help).toMatch(/Each share counts by its value now\.$/);
    expect(d.how).toMatch(/The view below counts each share once\./); expect(r.how).toMatch(/every share counts the same there\./);
  });
  it("count every share the same until each has a quantity (Gold), and always on a plan without the score (Silver)", () => {
    const [p, d, r] = topTiles(LIST, PAGE, "prism", SPREAD, null);
    expect([p.v, d.v, r.v]).toEqual(["Average · 57", "74 · Fairly spread", "In line · β 1.02"]);
    expect(p.sub).toBe("Average FinLit Prism of your shares: 1 strong · 0 healthy · 1 average · 0 weak · 1 poor");
    expect(d.sub).toBe("2 macro sectors · 3 sectors · 3 industries · two of the four sizes"); expect(r.sub).toMatch(/^Against the index: /);
    for (const t of [p, d, r]) expect(t.help).toMatch(/Every share counts the same until each share has a quantity; then each counts by its value now\.$/);
    const s = topTiles(LIST, PAGE, "finlit", SPREAD, null);
    for (const t of s.slice(1)) expect(t.help).toMatch(/Every share counts the same\.$/);
  });
  it("a card with no figure by value (fewer than 3 shares with a year of prices) keeps the count and says so", () => {
    const [, d] = topTiles(LIST, PAGE, "prism", SPREAD, { ...BV, spread: null });
    expect(d.v).toBe("74 · Fairly spread"); expect(d.help).toMatch(/Every share counts the same\.$/);
  });
  it("uses FinLit Prism's five words, as each share's label and the MF portfolio score", () => {
    expect([80, 79.9, 65, 64.9, 50, 49.9, 35, 34.9, 0].map(prismWord5)).toEqual(["Strong", "Healthy", "Healthy", "Average", "Average", "Weak", "Weak", "Poor", "Poor"]);
    expect(topTiles([sh("A", 30), sh("B", 34)], PAGE, "prism", SPREAD)[0].v).toBe("Poor · 32");
    expect(topTiles(LIST, PAGE, "prism", SPREAD)[0].how).toBe("Strong is 80 and above, Healthy 65 to 79, Average 50 to 64, Weak 35 to 49, Poor below 35. Open the tab for each share.");
  });
});

describe("the score panel's line (developer file 28)", () => {
  const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
  it("says every share counts the same when a share has a quantity but no stored price, never “Weighted by value”", () => {
    wrap(<ScorePanel total={71} band="Healthy" missing={0} shares={5} onAdd={() => {}} basis="equal" noPrice={["ZZNEWCO"]} />);
    expect(screen.getByText(/counts the same/).textContent).toBe("Every share counts the same for now: no stored price yet for ZZNEWCO.");
    expect(screen.queryByText(/Weighted by value/)).toBeNull();
    expect(screen.getByText(/Your portfolio score is/).textContent).toBe("Your portfolio score is Healthy");
  });
  it("says weighted by value when the server counted by value, and asks for buys while some are missing", () => {
    wrap(<ScorePanel total={71} band="Healthy" missing={0} shares={5} onAdd={() => {}} basis="value" />);
    expect(screen.getByText("Weighted by value now across 5 shares.")).toBeTruthy();
    cleanup();
    wrap(<ScorePanel total={64} band="Average" missing={2} shares={5} onAdd={() => {}} basis="equal" noPrice={[]} />);
    expect(screen.getByText(/Add buys for 2 shares to weight the score by value now\./)).toBeTruthy();
  });
});

describe("the equity page passes the score's figures to the cards", () => {
  const src = readFileSync(join(process.cwd(), "src/pages/Holdings.tsx"), "utf8");
  it("by value only when the server counted by value; the panel gets the basis and the shares with no stored price", () => {
    expect(src).toMatch(/byValue = scA\?\.basis === "value" && scA\.byValue \? scA\.byValue : null/);
    // task #385: the four calm cards read the same figures: the average Prism, the spread score and the NIFTY 50 measures by value when sent
    expect(src).toMatch(/const avg = byValue\?\.prism \?\? mean/);
    expect(src).toMatch(/const sp = ids\.length < 2 \? null : byValue\?\.spread \?\? page\?\.score \?\? null,/); expect(src).toMatch(/m = byValue\?\.market \?\? page\?\.market\.eq \?\? null;/);
    expect(src).toMatch(/<SixParts s=\{scA\}/);
  });
});
