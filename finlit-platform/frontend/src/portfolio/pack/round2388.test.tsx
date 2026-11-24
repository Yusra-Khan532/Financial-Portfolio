// @vitest-environment jsdom
// Task #388 part B (developer file 36): the beta scale's label placement (change 10), the grid's ink (F3), one window for the moving-together figures
// (part B item 6), correlations with the 0 (item 5), the steps of Diversification and Risk (change 8), and Hide the grid kept with the account (change 9).
// Made-up figures only.
import { describe, expect, it } from "vitest";
import { GAP, LABEL_H, fitsOneRow, layoutProblems, placeLabels, type ScaleLabel } from "./betaLabels";
import { cellColour, cellInk, contrast, corr2, corrCellLabel, corrWord, independentNote, togetherSpan, togetherWindow } from "../shared";
import { short2 } from "../derive";
import { normalisePrefs } from "../../lib/prefs";
import { priceStamp } from "./EqTop";

const rnd = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const SCALE = (b: number, w: number) => (Math.max(0, Math.min(2.5, b)) / 2.5) * w;
/** Your list and the four sizes, the way the page labels them ("1.29× Your list" is about 110 px; "1.07× Mid" about 84 px). */
const labs = (betas: number[], w: number): ScaleLabel[] => ["Your list", "Large", "Mid", "Small", "Micro"].slice(0, betas.length).map((k, i) => ({ key: k, x: SCALE(betas[i], w), w: 44 + 8 * k.length }));

describe("labels on the beta scale (change 10)", () => {
  it("one row on a laptop: each label over its point, crowded labels joined into a group centred on its points, nothing touching, inside the scale", () => {
    const L = placeLabels(labs([1.29, 1.38, 1.07, 1.28, 1.22], 1200), 1200);
    expect(L.mode).toBe("row"); expect(L.height).toBe(24 + 34);
    expect(layoutProblems(L)).toEqual([]);
    const byX = [...L.labels].sort((a, b) => a.left - b.left);
    expect(byX.map((l) => l.key)).toEqual(["Mid", "Micro", "Small", "Your list", "Large"]);   // the labels keep the order of their points, so lines never cross
    byX.slice(1).forEach((l, i) => expect(l.left).toBeGreaterThanOrEqual(byX[i].left + byX[i].w + GAP - 0.01));
    L.labels.forEach((l) => { expect(l.left).toBeGreaterThanOrEqual(0); expect(l.left + l.w).toBeLessThanOrEqual(1200.01); });
    // the joined group sits, on average, centred over its points
    const mid = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
    expect(Math.abs(mid(byX.map((l) => l.left + l.w / 2)) - mid(byX.map((l) => l.x)))).toBeLessThan(0.5);
    // curved lines, vertical at both ends, from the bottom middle of each label to its point
    L.lines.forEach((ln) => { const l = L.labels.find((x) => x.key === ln.key)!; expect(ln.curve).toBe(true); expect(ln.x1).toBeCloseTo(l.left + l.w / 2); expect(ln.y1).toBe(LABEL_H); expect(ln.x2).toBeCloseTo(l.x); expect(ln.d).toMatch(/^M[\d.]+ 24 C[\d.]+ [\d.]+ [\d.]+ [\d.]+ [\d.]+ 58$/); });
  });
  it("a label alone sits centred over its point; one at the far end stays inside the scale", () => {
    const L = placeLabels([{ key: "Your list", x: 600, w: 110 }, { key: "Large", x: 1200, w: 90 }], 1200);
    expect(L.labels.find((l) => l.key === "Your list")!.left).toBe(545);
    expect(L.labels.find((l) => l.key === "Large")!.left).toBe(1110);
  });
  it("rows on a phone, by the rule when the points leave room: each label 8 px left of its point (or ending 8 px right of it), straight down", () => {
    const L = placeLabels(labs([1.29, 0.72, 2.05, 1.6, 0.95], 340), 340);
    expect(L.mode).toBe("rows"); expect(layoutProblems(L, 340)).toEqual([]);
    L.labels.forEach((l) => { const starts = Math.abs(l.left - (l.x - GAP)) < 0.01, ends = Math.abs(l.left + l.w - (l.x + GAP)) < 0.01, clamped = l.left === 0 || Math.abs(l.left + l.w - 340) < 0.01;
      expect(starts || ends || clamped).toBe(true); });
    L.lines.forEach((ln) => { expect(ln.curve).toBe(false); expect(ln.x1).toBe(ln.x2); });
    expect(L.height).toBe(14 + (Math.max(...L.labels.map((l) => l.row))) * 30 + 24 + 2);
  });
  it("points too close for vertical lines (1.28 and 1.29 are 1.4 px apart on a phone): the labels step up one a row, nothing touching or crossed", () => {
    const L = placeLabels(labs([1.29, 1.38, 1.07, 1.28, 1.22], 340), 340);
    expect(L.mode).toBe("rows"); expect(layoutProblems(L, 340)).toEqual([]);
    expect(new Set(L.labels.map((l) => l.row)).size).toBe(5);
    expect([...L.labels].sort((a, b) => b.row - a.row).map((l) => l.key)).toEqual(["Mid", "Micro", "Small", "Your list", "Large"]);   // leftmost point on top
  });
  it("a list and its four sizes: never a touching label, a crossed line or a label off the scale, for 3,000 made-up lists at laptop and phone widths", () => {
    const r = rnd(388);
    for (let k = 0; k < 3000; k++) {
      const w = k % 2 ? 300 + Math.round(r() * 80) : 900 + Math.round(r() * 400);
      const b = [0, 1, 2, 3].map(() => 0.6 + r() * 1.3), wt = [0, 1, 2, 3].map(() => r()), tw = wt.reduce((a, x) => a + x, 0);
      const L = placeLabels(labs([b.reduce((a, x, i) => a + (x * wt[i]) / tw, 0), ...b], w), w);
      expect(L.mode).toBe(fitsOneRow(labs([1, 1, 1, 1, 1], w), w) ? "row" : "rows");
      expect(layoutProblems(L, w)).toEqual([]);
    }
  });
  it("with a tapped share on the scale too (six labels), at most 1 in 100 phone layouts has a line touching a label; on a laptop none", () => {
    const r = rnd(7); let bad = 0;
    for (let k = 0; k < 1000; k++) {
      const w = k % 2 ? 300 + Math.round(r() * 80) : 1000 + Math.round(r() * 300);
      const b = [0, 1, 2, 3].map(() => 0.6 + r() * 1.3), xs = [...labs([(b[0] + b[1] + b[2] + b[3]) / 4, ...b], w), { key: "A tapped share", x: SCALE(0.4 + r() * 2, w), w: 140 }];
      const p = layoutProblems(placeLabels(xs, w), w);
      if (k % 2 === 0) expect(p).toEqual([]); else if (p.length) bad++;
    }
    expect(bad).toBeLessThanOrEqual(5);
  });
});

describe("grid figures read on their cell (F3)", () => {
  it("each cell takes the ink with the better contrast, dark #10201c or white, in light and dark", () => {
    for (const theme of ["light", "dark"] as const) for (let v = 0; v <= 1.0001; v += 0.01) {
      const bg = cellColour(v, theme), ink = cellInk(v, theme), other = ink === "#fff" ? [16, 32, 28] : [255, 255, 255];
      expect(contrast(bg, ink === "#fff" ? [255, 255, 255] : [16, 32, 28])).toBeGreaterThanOrEqual(contrast(bg, other));
    }
    expect(cellInk(0.1, "light")).toBe("#10201c"); expect(cellInk(0.9, "light")).toBe("#fff");
    expect(cellInk(0.1, "dark")).toBe("#fff");
  });
  it("dark mode's heat colour #2f7a82: every figure at 4.5:1 or better", () => {
    for (let v = 0; v <= 1.0001; v += 0.01) { const bg = cellColour(v, "dark"); expect(contrast(bg, cellInk(v, "dark") === "#fff" ? [255, 255, 255] : [16, 32, 28])).toBeGreaterThanOrEqual(4.5); }
  });
});

describe("correlations (part B item 5) and one window (item 6)", () => {
  it("two decimals with the 0 in front everywhere; the word follows file 36's cut-offs", () => {
    expect([corr2(0.56), corr2(0.05), corr2(-0.03), short2(0.37)]).toEqual(["0.56", "0.05", "−0.03", "0.37"]);
    expect([0.19, 0.2, 0.39, 0.4, 0.59, 0.6, 0.95].map(corrWord)).toEqual(["barely", "loosely", "loosely", "partly", "partly", "closely", "closely"]);
    expect(corrCellLabel("ALPHA", "BETA", 0.56)).toBe("ALPHA and BETA: 0.56, partly linked");
  });
  it("the window every moving-together i and Data as of say comes from page.weeks", () => {
    expect([togetherSpan(104), togetherSpan(100), togetherSpan(52), togetherSpan(78), togetherSpan(undefined)]).toEqual(["two years", "two years", "year", "78 weeks", "two years"]);
    expect(togetherWindow(104)).toBe("the past two years of weekly closes");
    expect(independentNote({ score: 60, band: "Fairly spread", comovement: 60, sector_spread: 60, effective_stocks: 4, effective_sectors: 3 }, 10, 104)).toMatch(/^From the past two years of weekly closes: /);
  });
});

describe("Hide the grid is kept with the account (change 9)", () => {
  it("prefs carry hiddenBlocks, cleaned like the other remembered choices", () => {
    expect(normalisePrefs({}).hiddenBlocks).toEqual([]);
    expect(normalisePrefs({ hiddenBlocks: ["eq:grid", "eq:grid", "BAD", 3 as never] }).hiddenBlocks).toEqual(["eq:grid"]);
  });
});

describe("the header names the prices actually used (part B item 8)", () => {
  it("a close after 15:30 IST or a date reads 'at close'; a price inside the session says its time; India dates whatever the viewer's clock", () => {
    expect(priceStamp("2026-11-23")).toBe("Prices at close · 23 Nov");
    expect(priceStamp("2026-11-23T15:58:11+05:30")).toBe("Prices at close · 23 Nov");      // the stored quote the live site held on the evening of 24 Nov
    expect(priceStamp("2026-11-23T15:29:58+05:30")).toBe("Prices at close · 23 Nov");      // the last trades of a day are stamped 15:29:5x
    expect(priceStamp("2026-11-23T15:12:40+05:30")).toBe("Prices at 15:12 · 23 Nov");
    expect(priceStamp("2026-11-25T11:05:00+05:30")).toBe("Prices at 11:05 · 25 Nov");
    expect(priceStamp("2026-11-23T20:00:00Z")).toBe("Prices at close · 24 Nov");          // 01:30 IST next day: an India date
    expect(priceStamp(null)).toBeNull();
  });
});
