// The Flow board's map (founder, 26 Nov 2026, from the reference video): boxes sized by the move, the smallest on the left and the three largest as
// big cards at the end; every stock one tick of the tower; every box linked to its tick.
import { describe, expect, it } from "vitest";
import { bars, flowMap, sizedBoxes } from "./flowmap";
import type { FlowStock } from "./flow";

const st = (symbol: string, changePct: number) => ({ symbol, changePct, agreement: { score: 3, of: 5, facts: {} }, oiChangePct: 1 } as unknown as FlowStock);

describe("boxes sized by the move", () => {
  const list = [0.3, 0.5, 0.8, 1.1, 1.4, 1.9, 2.2, 2.8, 3.5, 4.1, 5.0, 6.9].map((v, i) => st(`S${i}`, v));
  const boxes = sizedBoxes(list, 0, 1000, 0, 600, true);
  const by = new Map(boxes.map((b) => [b.symbol, b]));
  it("the three largest moves are the big cards, in the last column, largest first", () => {
    expect(boxes.filter((b) => b.big).map((b) => b.symbol)).toEqual(["S11", "S10", "S9"]);
    const bigX = by.get("S11")!.x;
    expect(boxes.every((b) => b.big || b.x + b.w <= bigX)).toBe(true);
    expect(by.get("S11")!.y).toBeLessThan(by.get("S9")!.y);
  });
  it("a larger move gets a larger box, and smaller moves sit further left", () => {
    const area = (s: string) => by.get(s)!.w * by.get(s)!.h;
    expect(area("S8")).toBeGreaterThan(area("S0"));
    expect(by.get("S0")!.x).toBeLessThan(by.get("S8")!.x);
  });
  it("every box stays inside its area and boxes never overlap", () => {
    for (const b of boxes) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(1000.5); expect(b.y).toBeGreaterThanOrEqual(0); expect(b.y + b.h).toBeLessThanOrEqual(600.5); }
    for (const a of boxes) for (const b of boxes) if (a !== b) {
      const apart = a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5;
      expect(apart, `${a.symbol} and ${b.symbol}`).toBe(true);
    }
  });
});

describe("the map", () => {
  const stocks = [st("A", 2), st("B", 1), st("C", -1), st("D", -3), st("E", 0)];
  const lines = { times: ["09:15", "09:18"], change: { A: [0, 2], B: [0, 1], C: [0, -1], D: [0, -3], E: [0, 0] } };
  const m = flowMap(stocks, lines);
  it("one line and one tick per stock that moved, rising above the split and falling below", () => {
    expect(m.lines.map((l) => l.symbol).sort()).toEqual(["A", "B", "C", "D"]);
    expect(m.ticks.filter((t) => t.up).map((t) => t.symbol)).toEqual(["A", "B"]);
    expect(Math.max(...m.ticks.filter((t) => t.up).map((t) => t.y))).toBeLessThan(Math.min(...m.ticks.filter((t) => !t.up).map((t) => t.y)));
  });
  it("every box is linked to its tick", () => {
    expect(m.links.map((l) => l.symbol).sort()).toEqual(m.tiles.map((t) => t.symbol).sort());
  });
});

describe("15-minute bars from 3-minute snapshots", () => {
  it("open, high, low and close of each group of five snapshots, in rupees", () => {
    const b = bars([0, 1, -1, 2, 0.5, 1, 1], ["09:15", "09:18", "09:21", "09:24", "09:27", "09:30", "09:33"], 100);
    const r = (x: { o: number; h: number; l: number; c: number; t: string }) => ({ o: +x.o.toFixed(2), h: +x.h.toFixed(2), l: +x.l.toFixed(2), c: +x.c.toFixed(2), t: x.t });
    expect(b.map(r)).toEqual([{ o: 100, h: 102, l: 99, c: 100.5, t: "09:15" }, { o: 101, h: 101, l: 101, c: 101, t: "09:30" }]);
    expect(bars(undefined, [], 100)).toEqual([]);
  });
});
