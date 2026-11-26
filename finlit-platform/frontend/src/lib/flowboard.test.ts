// Flow board layout (lib/flowboard.ts): every column holds the same stocks, one unit of height each, so ribbon widths are exact stock counts.
import { describe, expect, it } from "vitest";
import type { FlowLines, FlowStock } from "./flow";
import { BUCKETS, layout, ribbonPath } from "./flowboard";

const st = (symbol: string, changePct: number | null, sector: string | null, buildup: FlowStock["buildup"]) => ({ symbol, changePct, sector, buildup } as FlowStock);
const STOCKS = [
  st("A", 2, "IT", "long_buildup"), st("B", 1, "IT", null), st("C", -3, "IT", "short_buildup"),
  st("D", -1, "Metal", "long_unwinding"), st("E", -2, "Metal", "short_buildup"), st("F", 4, "Metal", "short_covering"),
  st("G", null, "Metal", null), st("H", 0.5, null, "long_buildup"), st("Z", 0, "IT", null),
];
const LINES: FlowLines = { times: ["09:15", "12:00", "15:30"], change: { A: [0, 1, 2], C: [0, -1, -3], D: [null, -1, -1] } };

describe("flow board layout", () => {
  const b = layout(STOCKS, LINES, ["Metal", "IT"]);
  const u = b.unit;
  it("leaves out stocks with an unknown or zero change, and keeps the given sector order (others after it)", () => {
    expect(b.lines.map((l) => l.symbol).sort()).toEqual(["A", "B", "C", "D", "E", "F", "H"]);
    expect(b.sectors.map((s) => s.sector)).toEqual(["Metal", "IT", "Other"]);
    expect(b.rising.count).toBe(4);
    expect(b.falling.count).toBe(3);
  });
  it("every column adds up to the same stocks", () => {
    expect(b.rising.h + b.falling.h).toBeCloseTo(7 * u);
    expect(b.sectors.reduce((n, s) => n + s.h, 0)).toBeCloseTo(7 * u);
    expect(b.buckets.reduce((n, x) => n + x.h, 0)).toBeCloseTo(7 * u);
    expect(b.buckets.map((x) => x.count)).toEqual([2, 1, 1, 2, 1]);      // order: long build-up, short covering, none, short build-up, long unwinding
    expect(b.buckets.map((x) => x.bucket)).toEqual(BUCKETS);
  });
  it("each ribbon is as wide as its stocks, and the ribbons into each part carry all of them", () => {
    for (const r of b.ribbons) {
      expect(r.from.y1 - r.from.y0).toBeCloseTo(r.count * u);
      expect(r.to.y1 - r.to.y0).toBeCloseTo(r.count * u);
    }
    const into = (sector: string) => b.ribbons.filter((r) => !r.bucket && r.sector === sector).reduce((n, r) => n + r.count, 0);
    expect(into("Metal")).toBe(3);
    expect(into("IT")).toBe(3);
    const toBucket = (k: string) => b.ribbons.filter((r) => r.bucket === k).reduce((n, r) => n + r.count, 0);
    for (const x of b.buckets) expect(toBucket(x.bucket)).toBe(x.count);
  });
  it("ribbons into one part do not overlap: each starts where the one before it ended", () => {
    for (const box of b.buckets) {
      const rs = b.ribbons.filter((r) => r.bucket === box.bucket).sort((p, q) => p.to.y0 - q.to.y0);
      rs.forEach((r, i) => expect(r.to.y0).toBeCloseTo(i ? rs[i - 1].to.y1 : box.y));
    }
  });
  it("lines end in their own node slot; a stock without a stored path still gets a line", () => {
    const h = b.lines.find((l) => l.symbol === "H")!;
    expect(h.slot.x).toBe(b.rising.x);
    expect(h.d.startsWith("M")).toBe(true);
    const slots = b.lines.filter((l) => l.up).map((l) => l.slot.y);
    expect(new Set(slots).size).toBe(slots.length);
  });
  it("the ribbon path closes", () => {
    expect(ribbonPath(b.ribbons[0]).endsWith("Z")).toBe(true);
  });
  it("a smallest sector still gets room for its name", () => {
    const many = Array.from({ length: 200 }, (_, i) => st(`S${i}`, i % 2 ? 1 : -1, i < 199 ? "Big" : "Tiny", null));
    const big = layout(many, { times: [], change: {} }, ["Big", "Tiny"]);
    expect(big.sectors.find((s) => s.sector === "Tiny")!.h).toBeGreaterThanOrEqual(5);
    expect(big.H).toBeLessThanOrEqual(1100);
  });
});
