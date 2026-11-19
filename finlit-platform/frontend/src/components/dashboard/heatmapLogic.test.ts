// Task #261 (team pack "05 Dashboard · Index heatmap", 20 Nov 2026): the Index heatmap card's logic.
import { describe, expect, it } from "vitest";
import { contrast } from "../../lib/dashboard";
import type { Row } from "../../lib/screener";
import {
  ALL, DEFAULTS, GROUPS, MAP_MAX, MOVE_COLOURS, NO_MOVE, PINNED, breadth, byId, mapItems, mapLabel, moveColour, priceDay, readPrefs, resolve, sortCells, type Cell,
} from "./heatmapLogic";

const row = (symbol: string, change_pct: number | null, market_cap: number, price: number | null = 100): Row => ({ symbol, name: symbol + " Ltd", change_pct, market_cap, price } as unknown as Row);
const cell = (symbol: string, move: number | null, cap: number): Cell => ({ symbol, name: symbol, move, cap, price: 100 });

describe("indices (pack §2)", () => {
  it("chips in the pack's order, Midcap 50/100/150 marked New, the rest under More indices", () => {
    expect(PINNED.map((id) => byId(id).label)).toEqual(["Nifty 50", "Nifty Midcap 50", "Nifty Midcap 100", "Nifty Midcap 150", "Nifty Bank", "Nifty IT", "Nifty Auto", "Nifty Pharma", "Nifty FMCG", "Nifty Metal"]);
    expect(ALL.filter((x) => x.isNew).map((x) => x.id)).toEqual(["mid50", "mid100", "mid150"]);
  });
  it("the More indices panel holds the pack's three groups", () => {
    expect(GROUPS.map((g) => [g.title, g.items.map((x) => x.label.replace("Nifty ", ""))])).toEqual([
      ["Broad market", ["50", "Next 50", "100", "200", "500"]],
      ["Mid and small", ["Midcap 50", "Midcap 100", "Midcap 150", "Midcap Select", "Smallcap 50", "Smallcap 100", "Smallcap 250", "Microcap 250", "LargeMidcap 250", "MidSmallcap 400"]],
      ["Sectors", ["Bank", "Financial Services", "IT", "Auto", "Pharma", "FMCG", "Metal", "Energy", "Realty", "PSU Bank"]],
    ]);
    expect(new Set(ALL.map((x) => x.code)).size).toBe(ALL.length);
  });
  it("shows every member of NSE's list, a member with no move kept (not readable); without the list says why", () => {
    const rows = [row("AAA", 1.2, 500), row("BBB", -0.4, 300), row("CCC", null, 200), row("DDD", 0.1, 100), row("EEE", 2, 50)];
    const got = resolve(byId("mid50"), rows, { NIFTYMIDCAP50: ["AAA", "BBB", "CCC", "DDD", "EEE", "ZZZ"] });
    expect(got.basis).toBe("list");
    expect(got.cells.map((c) => [c.symbol, c.move])).toEqual([["AAA", 1.2], ["BBB", -0.4], ["CCC", null], ["DDD", 0.1], ["EEE", 2], ["ZZZ", null]]);
    expect(resolve(byId("mid50"), rows, {}).basis).toBe("none");                               // the new lists load with the nightly index refresh
    expect(resolve(byId("n50"), rows, {}).basis).toBe("cap");
  });
});

describe("colour, sort and breadth (pack §1, §3)", () => {
  it("the pack's seven steps", () => {
    const at = [-3, -1.5, -1.49, -0.75, -0.74, -0.16, -0.15, 0, 0.15, 0.16, 0.74, 0.75, 1.49, 1.5, 4].map(moveColour);
    expect(at).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6].map((i) => MOVE_COLOURS[i]));
    expect(moveColour(null)).toBe(NO_MOVE);
    expect(MOVE_COLOURS).toEqual(["#8E2620", "#A12E26", "#B5473D", "#6B6455", "#2E7D57", "#1F6B49", "#17583B"]);     // rgb(142,38,32) … rgb(23,88,59)
  });
  it("white text at 4.5:1 or better on every move colour, dark text on the not-readable tile", () => {
    for (const c of MOVE_COLOURS) expect(contrast("#FFFFFF", c)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#2B2620", NO_MOVE)).toBeGreaterThanOrEqual(4.5);
  });
  it("sorts biggest gain first by default, biggest fall, market value, A-Z; a missing move goes last", () => {
    const cs = [cell("B", 1, 10), cell("A", -2, 30), cell("C", null, 20), cell("D", 3, 5)];
    expect(sortCells(cs, "up").map((c) => c.symbol)).toEqual(["D", "B", "A", "C"]);
    expect(sortCells(cs, "dn").map((c) => c.symbol)).toEqual(["A", "B", "D", "C"]);
    expect(sortCells(cs, "mc").map((c) => c.symbol)).toEqual(["A", "C", "B", "D"]);
    expect(sortCells(cs, "az").map((c) => c.symbol)).toEqual(["A", "B", "C", "D"]);
    expect(DEFAULTS).toEqual({ view: "grid", idx: "n50", sort: "up" });
  });
  it("counts up, down and not readable, and weights the move by market value", () => {
    const b = breadth([cell("A", 2, 300), cell("B", -1, 100), cell("C", null, 50), cell("D", 0, 50)]);
    expect([b.up, b.down, b.flat, b.none]).toEqual([1, 1, 1, 1]);
    expect(b.weighted).toBeCloseTo((2 * 300 - 1 * 100 + 0) / 450, 9);
  });
  it("dates the prices: the close after 15:30 IST, during the session before", () => {
    expect(priceDay("2026-11-19", new Date("2026-11-19T12:00:00Z"))).toBe("19 Nov close");            // 17:30 IST
    expect(priceDay("2026-11-19", new Date("2026-11-19T06:00:00Z"))).toBe("19 Nov, during the session");
    expect(priceDay("2026-11-18", new Date("2026-11-19T06:00:00Z"))).toBe("18 Nov close");
    expect(priceDay(null)).toBeNull();
  });
});

describe("map (pack §1)", () => {
  it("every tile carries its symbol: the font shrinks with the tile, 7px to 15px, and the move shows where it fits", () => {
    expect(mapLabel("RELIANCE", 300, 200)).toEqual({ pad: 7, size: 15, move: 12.5 });
    const tiny = mapLabel("MAXHEALTH", 30, 18);
    expect(tiny.size).toBe(7) ; expect(tiny.move).toBeNull();
    const mid = mapLabel("CIPLA", 60, 40);
    expect(mid.size).toBeGreaterThanOrEqual(7); expect(mid.size).toBeLessThanOrEqual(15);
  });
  it("above 100 stocks draws the 100 largest and one 'Other N stocks' tile", () => {
    const many = Array.from({ length: 150 }, (_, i) => cell("S" + i, i % 2 ? 1 : -1, 1000 - i));
    const items = mapItems(many);
    expect(items).toHaveLength(MAP_MAX + 1);
    const other = items[MAP_MAX];
    expect(other.kind).toBe("other");
    if (other.kind === "other") { expect(other.n).toBe(50); expect(other.cap).toBe(many.slice(100).reduce((a, c) => a + c.cap, 0)); }
    expect(mapItems(many.slice(0, 50))).toHaveLength(50);
  });
});

describe("memory (pack §4)", () => {
  it("reads back the last view, index and sort, and falls back on anything unknown", () => {
    expect(readPrefs(JSON.stringify({ view: "list", idx: "mid150", sort: "mc" }))).toEqual({ view: "list", idx: "mid150", sort: "mc" });
    expect(readPrefs(JSON.stringify({ view: "pie", idx: "nope", sort: "x" }))).toEqual(DEFAULTS);
    expect(readPrefs("{bad json")).toEqual(DEFAULTS);
    expect(readPrefs(null)).toEqual(DEFAULTS);
  });
});
