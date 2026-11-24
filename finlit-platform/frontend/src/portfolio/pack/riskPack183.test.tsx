// @vitest-environment jsdom
// Task #183 W8 (Equity portfolio, Risk analytics, E72–E85): the glance figures against the Nifty 50, the beta build and its sum, Reading a beta (filter, pins,
// ranges with at most 6 names), the three betas, the size table, the risk split that adds to 100%, the fall lines and the rupee line, each share's risk grouped
// by size with "Under a year" and Prism Risk on Gold only.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;   // task #385: the tables keep their first column (HScroll)
import { BetaBuild, EachShareRisk, Fall10, RiskGlancePack, RiskShareSection, SizeBench, riskSplit } from "./RiskPack";
import { riskKeyFigs } from "./risk385";
import { fallLines, glanceTiles, readingFigures, riskLede, type RiskAnswer, type RiskShare } from "../../lib/eqRisk";
import type { PageObject } from "../types";

afterEach(cleanup);
const band = (b: number) => (b < 0.65 ? { key: "less" as const, word: "Less sensitive" } : b < 0.9 ? { key: "defensive" as const, word: "Defensive" } : b < 1.1 ? { key: "similar" as const, word: "Similar" } : b < 1.35 ? { key: "more" as const, word: "More sensitive" } : b < 1.75 ? { key: "high" as const, word: "High" } : { key: "very_high" as const, word: "Very high" });
const sh = (symbol: string, size: "Large" | "Mid" | "Small", beta: number | null, extra: Partial<RiskShare> = {}): RiskShare => ({ symbol, size, sector: "Industrials", benchmark: size === "Large" ? "Nifty 50" : size === "Mid" ? "Nifty Midcap 150" : "Nifty Smallcap 250",
  beta, explained: beta == null ? null : 45, band: beta == null ? null : band(beta), why: beta == null ? "Under a year of prices" : null, swing: 30, worstFall: -40, years: 3, oneYear: 10, ...extra });
const smalls = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"].map((s, i) => sh(s, "Small", 1.8 + i * 0.05));
const shares = [sh("BIG", "Large", 0.95), sh("MIDCO", "Mid", 1.4), ...smalls, sh("FRACTAL", "Mid", null, { years: 0.6 })];
const R: RiskAnswer = { to: "2026-11-13", from: "2025-11-14", counted: 10, unknown: [], missingIndex: [], shares,
  sizes: [{ size: "Large", benchmark: "Nifty 50", n: 1, avgBeta: 0.95, band: band(0.95), listShare: 10, adds: 0.1, oneYear: 13.6, benchOneYear: -2.1, downPer100: 74, upPer100: 116 },
    { size: "Mid", benchmark: "Nifty Midcap 150", n: 1, avgBeta: 1.4, band: band(1.4), listShare: 10, adds: 0.14, oneYear: 47.8, benchOneYear: 1.9, downPer100: 98, upPer100: 191 },
    { size: "Small", benchmark: "Nifty Smallcap 250", n: 8, avgBeta: 1.98, band: band(1.98), listShare: 80, adds: 1.58, oneYear: 23.9, benchOneYear: 5, downPer100: 128, upPer100: 164 }],
  betas: { weighted: 1.82, blended: 1.86, nifty: 1.13, weightedBand: band(1.82), blendedBand: band(1.86), niftyBand: band(1.13) },
  glance: { list: { swing: 25.9, worstFall: -24.6 }, nifty: { swing: 13.1, worstFall: -14.9 }, worst10: { list: -3.9, nifty: -2.7 }, weighted: 1.82 },
  ranges: [{ key: "less", word: "Less sensitive", below: 0.65 }, { key: "defensive", word: "Defensive", below: 0.9 }, { key: "similar", word: "Similar", below: 1.1 }, { key: "more", word: "More sensitive", below: 1.35 }, { key: "high", word: "High", below: 1.75 }, { key: "very_high", word: "Very high", below: null }] };
const syms = shares.filter((s) => s.beta != null).map((s) => s.symbol);
const page = { share_weight: { eq: Object.fromEntries(syms.map((s) => [s, 10])) }, share_risk: { eq: Object.fromEntries(syms.map((s) => [s, s === "BIG" ? 4 : s === "MIDCO" ? 6 : 11.25])) } } as unknown as PageObject;
const split = riskSplit(page, R, () => "Industrials");
const view = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("risk at a glance (E72)", () => {
  it("leads with the size-weighted reading and shows four figures, each against the Nifty 50, with its period", () => {
    expect(riskLede(R)).toEqual({ lead: "Part of your list moves more than its own market.", rest: "Weighted by size, the list has moved 1.82% for every 1% move in its benchmarks, and over 3 years it has swung 25.9% in a typical year against 13.1% for the Nifty 50." });
    // task #274 (number fixes 1 and 5): each figure says its window, and the swing line gives the ratio, never "about twice" for 1.7
    const g = glanceTiles({ ...R, glance: { ...R.glance, list: { ...R.glance.list!, swing: 22.6, grain: "weekly", years: 3 }, nifty: { ...R.glance.nifty, swing: 13.6, grain: "daily", years: 3 } } });
    expect(g[0].sub).toBe("About 1.7 times as bumpy as the index.");
    expect(g[0].win).toBe("List: 3 yrs, weekly · Nifty 50: 3 yrs, daily");
    expect(g[0].help).toMatch(/weekly returns/);
    expect(g[3].win).toMatch(/^vs each share's size index · weekly · past year, to /);
    expect(glanceTiles(R).map((t) => [t.k, t.v, t.nifty, t.sub])).toEqual([
      ["Typical swing in a year · 3 yrs", "25.9%", "13.1%", "About 2.0 times as bumpy as the index."], ["Worst fall from a high · 3 yrs", "−24.6%", "−14.9%", "Deeper than the index."],
      ["In the 10 worst weeks · past year", "−3.9%", "−2.7%", "Falls more when the market falls."], ["Beta, size-weighted", "1.82", "1.13", "More sensitive than its market (its own benchmarks)."]]);   // task #274: under it, the whole list's beta against the index compared with (Nifty 50 here)
    view(<RiskGlancePack r={R} split={split} />);
    // task #385 (open item 3): the shares left out of the beta and the swing are named, with why; the measuring notes are one small line
    expect(document.querySelector(".eqr-cover")!.textContent).toBe("FRACTAL has under a year of prices: left out of the beta and the list's swing; its own swing shows in Each share's risk.");
    expect(document.querySelector(".eqr-meas")!.textContent).toMatch(/all to 13 Nov 2026 · 10 shares counted$/);
  });
  it("names the key figures: how the list moves, which size carries the risk, the highest beta", () => {
    // task #385: the shared Key figures, beta in plain words
    expect(riskKeyFigs(R, split.bySize, (x) => x, "equal").map((c) => [c.q, c.big, c.ans])).toEqual([["How much does your list move with the market?", "1.82×", "as much as its markets move"],
      ["Where do the ups and downs come from?", "90%", "from small companies"], ["Which share moves most with the market?", "2.15×", "S8"]]);
  });
});

describe("how the beta is built, and reading a beta (E73–E78)", () => {
  it("adds each size's part to the size-weighted beta, and shows the three beta figures", () => {
    view(<BetaBuild r={R} />);
    expect(document.querySelector(".eqr-sum")!.textContent).toMatch(/1\.82×.*0\.10 \+ 0\.14 \+ 1\.58/);
    // task #235 (pack B4): two cards always shown, then four tabs with By size open
    expect(document.querySelector(".eqb-sum")!.textContent).toMatch(/Moves with its markets1\.82×.*has moved about 18\.2% when they moved 10%.*What adds up to 1\.82×.*Small moves 1\.98×, on 80% of the list: adds 1\.58/);
    expect(document.querySelector(".eqb-sum")!.textContent).not.toMatch(/β/);
    expect(screen.getAllByRole("tab").map((t) => `${t.querySelector("b")!.textContent}${t.getAttribute("aria-selected") === "true" ? "*" : ""}`)).toEqual(["By size*", "Where your shares sit", "Three ways to measure", "How it is worked out"]);
    expect(document.querySelector(".eqr-steps")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /How it is worked out/ }));
    expect(document.querySelector(".eqr-sum")).toBeNull();
    expect(Array.from(document.querySelectorAll(".eqr-steps b")).map((b) => b.textContent)).toEqual(["Sort by size", "Match a benchmark", "Measure each share", "Average by size", "Weight by the list"]);
    fireEvent.click(screen.getByRole("tab", { name: /Three ways to measure/ }));
    expect(Array.from(document.querySelectorAll(".eqr-b3 .eqr-v b")).map((b) => b.textContent)).toEqual(["1.82×", "1.86×", "1.13×"]);
    expect(Array.from(document.querySelectorAll(".eqr-b3 .eqr-tag")).map((b) => b.textContent)).toEqual(["Headline figure", "Alternate", "Alternate"]);   // open item 13
  });
  it("filters by size, lists at most 6 names per range with Show all, and places a tapped share on the scale", () => {
    view(<BetaBuild r={R} />);
    fireEvent.click(screen.getByRole("tab", { name: /Where your shares sit/ }));
    const vh = document.querySelector(".eqr-range.r-very_high")!;
    expect(vh.querySelectorAll("li")).toHaveLength(5);   // task #385: a range with more than 7 shares shows 5
    fireEvent.click(within(vh as HTMLElement).getByRole("button", { name: "Show all 8 shares" }));
    expect(vh.querySelectorAll("li")).toHaveLength(8);
    fireEvent.click(within(vh as HTMLElement).getByRole("button", { name: /S8/ }));
    expect(screen.getByText(/S8: 2\.15× as much as the Nifty Smallcap 250, very high/)).toBeTruthy();
    expect(Array.from(document.querySelectorAll(".eqr-pin")).map((p) => p.textContent)).toContain("2.15× S8 Very high");
    fireEvent.click(screen.getByRole("button", { name: "Large" }));
    expect(Array.from(document.querySelectorAll(".eqr-f4 b")).map((b) => b.textContent)).toEqual(["0.95×", "about 9.5%", "0 of 1", "0 of 1"]);
    expect(readingFigures(shares, 1.82)[2].v).toBe("9 of 10");   // High or Very high: MIDCO (1.40) and the eight smalls (1.80 to 2.15)
  });
});

describe("each size, the risk split, a 10% fall (E79–E81)", () => {
  it("shows each size against its own index: 1 year, per 100 in down and up weeks", () => {
    view(<SizeBench r={R} />);
    const rows = Array.from(document.querySelectorAll(".eqr-sb tbody tr")).map((r) => r.textContent);
    expect(rows[0]).toBe("Large· 1 shareNifty 50Yours +13.6%Index −2.1%74per 100116per 100Rises more, falls less");
  });
  it("splits the list and the risk by size, sector or share; the risk adds to 100% and the share view adds Beta and Reading", () => {
    view(<RiskShareSection r={R} split={split} />);
    const risk = () => Array.from(document.querySelectorAll(".eqr-rs tbody td:last-child")).map((t) => parseFloat(t.textContent!));
    expect(Math.round(risk().reduce((a, b) => a + b, 0))).toBe(100);
    fireEvent.click(screen.getByRole("button", { name: "By share" }));
    expect(Array.from(document.querySelectorAll(".eqr-rs thead th")).map((t) => t.querySelector("button")?.textContent ?? t.textContent)).toEqual(["Share", "Bars", "Moves with its index", "Range", "List", "Ups and downs▼"]);
    expect(document.querySelector(".eqr-rs tbody tr.more")).toBeTruthy();   // shaded: more of the risk than of the list
  });
  it("sizes a 10% fall from the betas and puts it on ₹10 lakh", () => {
    expect(fallLines(R)).toMatchObject({ weighted: -18.2, nifty: -11.3, rupee: "On ₹10 lakh, a 10% fall in every size index has meant roughly ₹1.82 lakh; a 10% fall in the Nifty 50 alone, roughly ₹1.13 lakh." });
    view(<Fall10 r={R} />);   // task #235 (pack B8): the two-card picture
    const big = () => document.querySelector(".fx-big b")!.textContent;
    expect(big()).toBe("−18.2%"); expect(screen.getByText("8.2 points more than the market’s 10%")).toBeTruthy();
    expect(document.querySelector(".fx-rs")!.textContent).toBe("In rupees−₹1.82 Lon ₹10 lakh");
    fireEvent.click(screen.getByRole("button", { name: "Only the Nifty 50 falls" }));
    expect(big()).toBe("−11.3%"); expect(document.querySelector(".fx")!.className).toContain("fx-noparts");
  });
  it("picks the size of the fall: 5%, 10% on load, the Nifty 50's worst in 3 years (the Risk tab's own figure), 20% (pack B8 v3)", () => {
    view(<Fall10 r={R} value={{ now: 274_000, name: "Dhan" }} />);
    const sizes = () => Array.from(document.querySelectorAll(".fx-size button")).map((b) => `${b.textContent}${b.getAttribute("aria-pressed") === "true" ? "*" : ""}`);
    expect(sizes()).toEqual(["5%", "10%*", "14.9%the Nifty 50’s worst in 3 years", "20%"]);
    expect(screen.getByRole("heading", { name: /If the market fell 10%/ })).toBeTruthy();
    expect(document.querySelector(".fx-rs small")!.textContent).toBe("on your ₹2.74 L value now in Dhan");
    fireEvent.click(document.querySelectorAll(".fx-size button")[2]);
    expect(screen.getByRole("heading", { name: /If the market fell 14.9%/ })).toBeTruthy();
    expect(document.querySelector(".fx-big b")!.textContent).toBe("−27.1%");   // 1.82 × 14.9
    expect(document.querySelector(".fx-rs b")!.textContent).toBe("−₹74,254");   // 2,74,000 × 27.1%
    expect(document.querySelector(".fx-note")!.textContent).toMatch(/^The market’s 14.9% fall\./);
    const bars = document.querySelector(".fx-ch")!.getAttribute("aria-label")!;
    expect(bars).toMatch(/^If the market fell 14.9%: Market −14.9%; Your list −27.1%; Large −14.2%/);
    expect(document.querySelector(".fx-c.part")!.className).toContain("soft");   // Large 0.95: shallower than the market, amber
  });
});

describe("each share's risk (E82–E84)", () => {
  it("groups by size, folds, says Under a year, and shows Prism Risk on Gold only", () => {
    const { rerender } = view(<EachShareRisk r={R} split={split} shares={[]} gold />);
    const groups = () => Array.from(document.querySelectorAll(".eqr-g button")).map((b) => b.textContent);
    expect(groups()[0]).toBe("▸Large companies1 shareagainst Nifty 50on average 0.95× its index, similar4% of the riskShow");
    fireEvent.click(screen.getByRole("button", { name: "Open all" }));
    expect(screen.getByText("Under a year")).toBeTruthy();
    const heads = () => Array.from(document.querySelectorAll(".eqr-each thead tr:last-child th button.eqs-sort")).map((t) => t.textContent);
    expect(heads()).toEqual(["Share▲", "Moves with its index", "Explained by its index", "Swing a year", "Worst fall", "1 year", "Below 1-yr high", "1 month", "Share of risk", "Prism Risk", "What stands out"]);
    rerender(<MemoryRouter><EachShareRisk r={R} split={split} shares={[]} gold={false} /></MemoryRouter>);
    expect(heads()).not.toContain("Prism Risk");
  });
});
