// Task #194 (pack finlit-latest-results-15nov): the six quarter tiles of Latest results, with the pack's own figures (Q2 FY27 against Q1 FY27, 15 Nov).
import { describe, expect, it } from "vitest";
import { guideNote, medianNote, months, pillOf, quarterTiles, shareTone, growthTone, type BySize, type Prev } from "./quarterTiles";
import type { VSummary } from "./resultsPack";

const base = { awaiting: 0, flagged: 0, nMargin: 3000, withNumbers: 4156 };
const sum = (o: Partial<VSummary>): VSummary => ({ ...base, companies: 0, declared: 0, due: 0, medianRevenueYoY: null, medianProfitYoY: null, profitUpShare: null, marginUpShare: null, nRevenue: null, nProfit: null, ...o } as VSummary);
const now = sum({ companies: 5175, declared: 5166, due: 9, medianRevenueYoY: 16.8, medianProfitYoY: 11.1, profitUpShare: 58.1, marginUpShare: 45.4, beatShare: 34.1, nRevenue: 3659, nProfit: 2890,
  verdicts: { Strong: 798, Good: 404, "In line": 279, Weak: 357, Poor: 737, Loss: 933 } });
const by: BySize = {
  Large: sum({ companies: 207, declared: 207, medianRevenueYoY: 20.7, medianProfitYoY: 22.5, profitUpShare: 77, marginUpShare: 55, beatShare: 48 }),
  Mid: sum({ companies: 382, declared: 382, medianRevenueYoY: 21.2, medianProfitYoY: 20.4, profitUpShare: 74, marginUpShare: 49, beatShare: 44 }),
  Small: sum({ companies: 900, declared: 900, medianRevenueYoY: 17.1, medianProfitYoY: 12.0, profitUpShare: 60, marginUpShare: 46, beatShare: 36 }),
  Micro: sum({ companies: 3628, declared: 3620, medianRevenueYoY: 15.7, medianProfitYoY: 7.2, profitUpShare: 54, marginUpShare: 44, beatShare: 32 }),   // task #262: the fourth size
};
const prev: Prev = { fiscal: "Q1 FY27", declared: 1643, totals: sum({ medianRevenueYoY: 16.2, medianProfitYoY: 17.8, profitUpShare: 64.2, marginUpShare: 51.0, beatShare: 39.0 }) };

describe("the six tiles", () => {
  const t = quarterTiles(now, prev, by);
  const tile = (k: string) => t.find((x) => x.key === k)!;
  it("keeps all six, in the pack's order", () => {
    expect(t.map((x) => x.label)).toEqual(["Declared", "Typical revenue growth", "Typical profit growth", "Profit up", "Net margin up", "Beat their industry"]);
  });
  it("colours each number by what it says: green for growth, gold where under half improved", () => {
    expect(t.map((x) => x.tone)).toEqual(["info", "good", "good", "good", "mid", "mid"]);
    expect(growthTone(-3)).toBe("bad"); expect(shareTone(50)).toBe("good"); expect(shareTone(49.9)).toBe("mid"); expect(growthTone(null)).toBe("plain");
  });
  it("shows the change from the quarter before as a pill", () => {
    expect(tile("medianProfitYoY").pill).toMatchObject({ text: "▼ 6.7 pt vs Q1 FY27", dir: "down" });
    expect(tile("medianRevenueYoY").pill).toMatchObject({ text: "▲ 0.6 pt vs Q1 FY27", dir: "up" });
    expect(tile("profitUp").pill?.text).toBe("▼ 6.1 pt vs Q1 FY27");
    expect(tile("declared").pill).toBeUndefined();
    expect(pillOf(10, 10, "Q1 FY27")).toMatchObject({ dir: "flat" }); expect(pillOf(null, 10, "Q1 FY27")).toBeNull();
  });
  it("writes the Declared tile: count, of, bar, still due, and its sizes", () => {
    const d = tile("declared");
    expect([d.value, d.of, d.sub]).toEqual(["5,166", "of 5,175", "9 still due"]);
    expect(Math.round(d.bar!)).toBe(100);
    expect(d.detail!.rows).toEqual([["Large", "207", "207"], ["Mid", "382", "382"], ["Small", "900", "900"], ["Micro", "3,620", "3,628"]]);
    expect(d.detail!.note).toBe("58 companies have no size band yet.");
  });
  it("splits each figure Large / Mid / Small / Micro, with the quarter before for comparison", () => {
    expect(tile("medianProfitYoY").detail!.rows).toEqual([["Large", "+22.5%"], ["Mid", "+20.4%"], ["Small", "+12.0%"], ["Micro", "+7.2%"], ["Q1 FY27 (all)", "+17.8%"]]);
    expect(tile("beat").detail!.rows).toEqual([["Large", "48%"], ["Mid", "44%"], ["Small", "36%"], ["Micro", "32%"], ["Q1 FY27 (all)", "39%"]]);
    expect(t.slice(1).every((x) => x.detailLabel === "By size")).toBe(true);
  });
  it("adds the notes: micro companies (the smallest end) pulling the figure, the Q1 guide, the verdict counts", () => {
    expect(tile("medianProfitYoY").detail!.note).toBe("Micro companies pull the typical figure down: +7.2% against +22.5% for large ones. Q1 FY27 had only 1,643 companies loaded, so the change against it is a guide, not exact.");
    expect(tile("medianRevenueYoY").detail!.note).toMatch(/^The middle company in each group/);
    expect(tile("beat").detail!.note).toBe("Strong 798 · Good 404 · In line 279 · Weak 357 · Poor 737 · Loss 933. Q1 FY27 had only 1,643 companies loaded, so the change against it is a guide, not exact.");
    expect(tile("margin").sub).toBe("of companies: fewer than half"); expect(tile("profitUp").sub).toBe("of companies, vs a year ago");
  });
  it("leaves out the guide when the quarter before is as full, and the comparison when there is none", () => {
    expect(guideNote({ fiscal: "Q1 FY27", declared: 5000, totals: null }, 5166)).toBe("");
    const first = quarterTiles(now, null, by);
    expect(first.every((x) => !x.pill)).toBe(true);
    expect(first[2].detail!.rows).toHaveLength(4);
    expect(medianNote(20, 15)).toMatch(/middle company/);
  });
  it("shows a dots placeholder while a size is still loading, never a wrong figure", () => {
    const t2 = quarterTiles(now, prev, { Large: undefined, Mid: undefined, Small: undefined });
    expect(t2[1].detail!.rows[0]).toEqual(["Large", "…"]);
    expect(t2[0].detail!.note).toBeUndefined();
  });
  it("on Basic keeps the counts and names the plan for every figure", () => {
    const b = quarterTiles(now, prev, by, true);
    expect(b[0].value).toBe("5,166");
    expect(b.slice(1).map((x) => x.value)).toEqual(Array(5).fill("Silver plan"));
    expect(b.slice(1).every((x) => !x.pill && !x.detail)).toBe(true);
  });
  it("words the quarter's months as the pack", () => {
    expect(months("Jul to Sep 2026")).toBe("Jul–Sep 2026");
  });
  it("never advises", () => {
    expect(JSON.stringify(t).replace(/from best to worst/g, "")).not.toMatch(/\b(buy|sell|hold|target|best|recommend)\b/i);
  });
});
