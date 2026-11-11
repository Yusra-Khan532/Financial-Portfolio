import { describe, expect, it } from "vitest";
import { axisIndexes, bandWord, dotRadius, inForce, inPeriod, moveSentence, movesOf, reRated, trendBand } from "./scoreMoves";
import type { HistPoint } from "./prismHistory";

const day = (n: number) => new Date(Date.UTC(2026, 7, 1) + n * 86_400_000).toISOString().slice(0, 10);
const P = (n: number, f: number, v: number, q: number, r: number, st: number, lt: number): HistPoint => ({ day: day(n), modelVersion: "1", final: 60, label: "AVERAGE", status: "RATED", parts: { fundamental: f, valuation: v, quality: q, risk: r }, shortTerm: st, longTerm: lt });
const pts = [P(0, 58, 47, 80, 88, -10, -80), P(40, 58, 47, 80, 88, -20, -80), P(80, 58, 50, 79, 88, -34, -80)];

describe("score moves", () => {
  it("the period counts back from the newest recorded day", () => {
    expect(inPeriod(pts, "1M").map((p) => p.day)).toEqual([day(80)]);
    expect(inPeriod(pts, "3M")).toHaveLength(3);
    expect(inPeriod([], "1Y")).toEqual([]);
  });
  it("the sentence names the biggest mover with its band, and the steadiest score", () => {
    expect(moveSentence(pts, ["fundamental", "valuation", "quality", "risk"], "3M")).toBe("Over the last 3 months, the Valuation score rose 3 points, from 47 to 50 (average). The Growth & Profitability score was the steadiest, unchanged at 58.");
  });
  it("technical views use the descriptive words, not a model verdict", () => {
    expect(moveSentence(pts, ["shortTerm", "longTerm"], "3M")).toBe("Over the last 3 months, the Short-term view fell 24 points, from −10 to −34 (downtrend). The Long-term view was the steadiest, unchanged at −80.");
  });
  it("nothing moving is said plainly; too few days is said too", () => {
    expect(moveSentence([pts[0], { ...pts[0], day: day(5) }], ["valuation", "risk"], "1M")).toContain("none of the 2 scores changed");
    expect(moveSentence([pts[0]], ["valuation"], "1M")).toContain("not enough recorded days");
  });
  it("re-rating days are the days a business score changed; technical moves are not re-ratings", () => {
    expect(reRated(pts)).toEqual([day(80)]);
  });
  it("band and trend words, and moves", () => {
    expect([85, 70, 55, 40, 20].map(bandWord)).toEqual(["Strong", "Healthy", "Average", "Weak", "Poor"]);
    expect([50, 25, 0, -30, -60].map(trendBand)).toEqual(["Strong uptrend", "Uptrend", "Sideways", "Downtrend", "Strong downtrend"]);
    expect(movesOf(pts, ["valuation"])[0]).toMatchObject({ from: 47, to: 50, delta: 3 });
  });
  it("no recommendation word in any sentence", () => {
    expect(moveSentence(pts, ["fundamental", "valuation", "quality", "risk", "shortTerm", "longTerm"], "3M")).not.toMatch(/\b(buy|sell|hold|accumulate|reduce|avoid|target|best|good|bad)\b/i);
  });
});

describe("every recorded day is readable on the chart", () => {
  // Valuation is recorded on days 0 and 40 only (Prism re-rated then), the short-term view on every day.
  const sparse: HistPoint[] = [P(0, 58, 47, 80, 88, -10, -80), { ...P(20, 58, 47, 80, 88, -15, -80), parts: { fundamental: null, valuation: null, quality: null, risk: null } }, P(40, 58, 50, 79, 88, -20, -80)];
  it("a day with its own figure shows it", () => {
    expect(inForce(sparse, "valuation", 0)).toEqual({ value: 47, day: day(0), exact: true });
    expect(inForce(sparse, "shortTerm", 1)).toEqual({ value: -15, day: day(20), exact: true });
  });
  it("a day between two ratings shows the rating in force and the day it was made, not a blank", () => {
    expect(inForce(sparse, "valuation", 1)).toEqual({ value: 47, day: day(0), exact: false });
    expect(inForce(sparse, "valuation", 2)).toEqual({ value: 50, day: day(40), exact: true });
  });
  it("before the first figure there is none, and an index outside the list is none", () => {
    const late = [{ ...sparse[1] }, sparse[2]];
    expect(inForce(late, "valuation", 0)).toBeNull();
    expect(inForce(sparse, "valuation", -1)).toBeNull(); expect(inForce(sparse, "valuation", 9)).toBeNull();
  });
  it("few days: every day is labelled; many days: about six evenly spread, always the first and the last", () => {
    expect(axisIndexes(0)).toEqual([]); expect(axisIndexes(1)).toEqual([0]); expect(axisIndexes(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const many = axisIndexes(250);
    expect(many[0]).toBe(0); expect(many[many.length - 1]).toBe(249); expect(many).toHaveLength(6);
    expect(many).toEqual([...many].sort((a, b) => a - b));
    expect(axisIndexes(8)).toHaveLength(6);
  });
  it("the dot is large for a month of days and smaller for a year, but always visible", () => {
    expect([6, 31, 45].map(dotRadius)).toEqual([3.6, 3.6, 3.6]);
    expect(dotRadius(90)).toBe(2.6); expect(dotRadius(250)).toBe(1.8); expect(dotRadius(250)).toBeGreaterThanOrEqual(1.5);
  });
});
