import { describe, expect, it } from "vitest";
import { filterThemes, NO_FILTERS, stageCounts, type ThemeRow } from "./themesFilter";

// sample companies only
const ROWS: ThemeRow[] = [
  { name: "Industrial Manufacturing & Capex", m3: -5.4, up: 143, rated: 436, mine: [
    { s: "BRIOTEX", r3m: 15, st: "Operating" }, { s: "CORVANT", r3m: -2.2, st: "Operating" }, { s: "DALMONT", r3m: -12.9, st: "Under execution" }, { s: "ELVORA", r3m: null, st: "Not stated" }] },
  { name: "AI & GenAI", m3: -4.3, up: 32, rated: 123, mine: [{ s: "FENRIX", r3m: -23.9, st: "Operating" }, { s: "GALDEN", r3m: 7.2, st: "Operating" }] },
  { name: "Cloud & Data Centres", m3: 7.4, up: 2, rated: 2, mine: [{ s: "KESTRA", r3m: 1.2, st: "Operating" }] },
  { name: "Defence & Aerospace", m3: null, up: 0, rated: 0, mine: [{ s: "LUMORA", r3m: 10.6, st: "Planned" }] },
];

describe("Your themes: filters, sort and find", () => {
  it("counts the shares by how far along, for the chips", () => {
    expect(stageCounts(ROWS)).toEqual([{ stage: "Operating", n: 5 }, { stage: "Under execution", n: 1 }, { stage: "Planned", n: 1 }, { stage: "Not stated", n: 1 }]);
  });
  it("with no filter, every theme and share in Discover's order", () => {
    const r = filterThemes(ROWS, NO_FILTERS);
    expect(r.rows.map((x) => x.name)).toEqual(ROWS.map((x) => x.name));
    expect(r.summary).toBe("All 4 themes · 8 shares");
  });
  it("a stage keeps only the themes that have a share at that stage, and only those shares", () => {
    const r = filterThemes(ROWS, { ...NO_FILTERS, stages: ["Operating"] });
    expect(r.rows.map((x) => [x.name, x.mine.map((m) => m.s)])).toEqual([["Industrial Manufacturing & Capex", ["BRIOTEX", "CORVANT"]], ["AI & GenAI", ["FENRIX", "GALDEN"]], ["Cloud & Data Centres", ["KESTRA"]]]);
    expect(r.summary).toBe("3 of 4 themes · 5 of 8 shares match");
  });
  it("ahead of its theme compares the share's 3-month move with the theme's median; no move or no median is never ahead", () => {
    const r = filterThemes(ROWS, { ...NO_FILTERS, move: "ahead" });
    expect(r.rows.flatMap((x) => x.mine.map((m) => m.s))).toEqual(["BRIOTEX", "CORVANT", "GALDEN"]);
    expect(filterThemes(ROWS, { ...NO_FILTERS, move: "behind" }).rows.flatMap((x) => x.mine.map((m) => m.s))).toEqual(["DALMONT", "FENRIX", "KESTRA"]);
    expect(filterThemes(ROWS, { ...NO_FILTERS, move: "down" }).shares).toBe(3);
  });
  it("finds a share by part of its symbol, and says when nothing matches", () => {
    expect(filterThemes(ROWS, { ...NO_FILTERS, q: "kes" }).rows.map((x) => x.name)).toEqual(["Cloud & Data Centres"]);
    expect(filterThemes(ROWS, { ...NO_FILTERS, q: "zzz" }).themes).toBe(0);
  });
  it("sorts by the median (blank last), by the share in an uptrend, or by name", () => {
    expect(filterThemes(ROWS, { ...NO_FILTERS, sort: "med-d" }).rows.map((x) => x.m3)).toEqual([7.4, -4.3, -5.4, null]);
    expect(filterThemes(ROWS, { ...NO_FILTERS, sort: "med-a" }).rows.map((x) => x.m3)).toEqual([-5.4, -4.3, 7.4, null]);
    expect(filterThemes(ROWS, { ...NO_FILTERS, sort: "ut" }).rows[0].name).toBe("Cloud & Data Centres");
    expect(filterThemes(ROWS, { ...NO_FILTERS, sort: "az" }).rows[0].name).toBe("AI & GenAI");
    expect(filterThemes(ROWS, NO_FILTERS, "companies").summary).toBe("All 4 themes · 8 companies");
  });
});
