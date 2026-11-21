// The Advanced stock screener's pure logic (lib/scoreScreen.ts). Task #283: FinLit Prism is FinLit's only company score; the retired score's bands, pillar
// filters, rating chips and Top 10 lists left with the Basic screener, so these tests cover the Prism filters, the shared size / sector / 52-week filters, sorting,
// paging, the address and the summary, and prove that an older link's retired parameters are ignored.
import { describe, expect, it } from "vitest";
import { PRISM_PRESETS, SORT_KEYS, activePrismPreset, pBandsToRange, rangeToPBands, techBandOf, togglePRangeBand, trendWord, withPrismPreset, withoutPrismPreset } from "./scoreScreen";
import { applyFilters, chipsFor, concentration, emptyFilters, facetCounts, filtersKey, inRange, median, pageList, pageOf, parseState, removeChip, serializeState, sortRows,
  summarize, validate, withScores, nextSort, DEFAULT_SORT, type Item } from "./scoreScreen";
import type { Row } from "./screener";

const row = (symbol: string, o: Partial<Row> = {}): Row => ({
  symbol, name: symbol + " Ltd", sector: "Banks", overall: 60, band: "healthy", pillar_quality: 60, pillar_growth: 60, pillar_profitability: 60, pillar_balance: 60, pillar_technical: 60,
  price: 100, market_cap: 1000, pe: null, pb: null, roe: null, roce: null, dividend_yield: null, debt_to_equity: null, sales_cagr: null, profit_cagr: null,
  operating_margin: null, change_pct: null, return_1m: null, return_1y: null, ...o,
});
const mk = (symbol: string, o: Partial<Row> = {}): Item => withScores([row(symbol, o)])[0];
/** A company with a Prism score and the same value on each part (technical views: the score less 50). */
const pr = (symbol: string, final: number | null, label: string | null, o: Partial<Row> = {}) =>
  mk(symbol, { prism_state: label ? "stored" : "none", prism_final: final, prism_label: label, prism_status: final == null ? (label ? "NOT RATED" : null) : "RATED", prism_fundamental: final, prism_valuation: final,
    prism_quality: final, prism_risk: final, prism_st_score: final == null ? null : final - 50, prism_lt_score: final == null ? null : 50 - final, ...o });
const syms = (r: Item[]) => r.map((x) => x.symbol);
const PZ = [pr("S", 85, "STRONG"), pr("H", 66, "HEALTHY"), pr("A", 55, "AVERAGE"), pr("W", 40, "WEAK"), pr("P", 20, "POOR"), pr("N", null, "NOT RATED"), pr("X", null, null)];

describe("rows", () => {
  it("size is by market value in rupees crore (task #262): Large above 75,000, Mid 25,000 to 75,000, Small 10,000 to 25,000, Micro below; no market cap means no size", () => {
    const rows = [75_001, 75_000, 25_000, 10_000, 9_999, 1, 24_999].map((v, i) => row("S" + i, { market_cap: v }));
    rows.push(row("NOCAP", { market_cap: null }), row("ZERO", { market_cap: 0 }), row("NOPRICE", { price: null, market_cap: 5e6 }));
    const by = Object.fromEntries(withScores(rows).map((r) => [r.symbol, r.cap]));
    expect([by.S0, by.S1, by.S2, by.S3, by.S4, by.S5, by.S6]).toEqual(["Large", "Mid", "Mid", "Small", "Micro", "Micro", "Small"]);
    expect([by.NOCAP, by.ZERO, by.NOPRICE]).toEqual([null, null, "Large"]);
  });
  it("no row carries a figure worked out from the retired score (task #283)", () => {
    const r = mk("A", { overall: 90, pillar_quality: 90 }) as Item & Record<string, unknown>;
    expect("f" in r).toBe(false); expect("t" in r).toBe(false);
  });
});

describe("ranges", () => {
  it("a missing score never passes a range, and no range keeps everything", () => {
    expect(inRange(null, { min: 0, max: 100 })).toBe(false);
    expect(inRange(null, { min: null, max: 40 })).toBe(false);
    expect(inRange(null, { min: null, max: null })).toBe(true);
  });
  it("min-max is inclusive, either end may be open", () => {
    const r = { min: 45, max: 77 };
    expect([44, 45, 77, 78].map((v) => inRange(v, r))).toEqual([false, true, true, false]);
    expect([10, 90].map((v) => inRange(v, { min: 50, max: null }))).toEqual([false, true]);
    expect([10, 90].map((v) => inRange(v, { min: null, max: 50 }))).toEqual([true, false]);
  });
});

describe("applying filters", () => {
  const items = [
    pr("A", 90, "STRONG", { sector: "Banks", market_cap: 180000 }), pr("B", 70, "HEALTHY", { sector: "IT", market_cap: 160000 }), pr("C", 50, "AVERAGE", { sector: "IT", market_cap: 140000 }),
    pr("D", null, null, { sector: "Auto", market_cap: 120000 }), pr("E", 44, "WEAK", { sector: null, market_cap: 100000 }), pr("F", 80, "STRONG", { sector: "Banks", market_cap: 80000 }),
  ];
  it("empty filters keep every company, including ones with no scores", () => { expect(applyFilters(items, emptyFilters())).toHaveLength(6); });
  it("the 'down from 52-week high' range keeps companies within it and leaves out those with no figure (task #60)", () => {
    const rows = [{ ...items[0], pct_from_high: 3 }, { ...items[1], pct_from_high: 18 }, { ...items[2], pct_from_high: 45 }, { ...items[3] }] as typeof items;
    const f = emptyFilters(); f.ranges.dh = { min: null, max: 20 };
    expect(syms(applyFilters(rows, f))).toEqual(["A", "B"]);
    f.ranges.dh = { min: 30, max: null };
    expect(syms(applyFilters(rows, f))).toEqual(["C"]);
    expect(parseState(serializeState({ filters: f, sort: DEFAULT_SORT, size: 25, page: 0 }, "advanced"), "advanced").filters.ranges.dh).toEqual({ min: 30, max: null });
  });
  it("multi-select sectors is OR within the group", () => {
    const f = emptyFilters(); f.sectors = ["IT", "Auto"];
    expect(syms(applyFilters(items, f))).toEqual(["B", "C", "D"]);
  });
  it("a company with no sector never matches a sector filter", () => {
    const f = emptyFilters(); f.sectors = ["Banks"];
    expect(syms(applyFilters(items, f))).not.toContain("E");
  });
  it("the Prism range keeps 80 and drops a missing score", () => {
    const f = emptyFilters(); f.ranges.z = { min: 80, max: null };
    expect(syms(applyFilters(items, f))).toEqual(["A", "F"]);
  });
  it("size filter is multi-select", () => {
    const x = withScores([row("L", { market_cap: 80_000 }), row("M", { market_cap: 30_000 }), row("X", { market_cap: 5_000 })]);
    const f = emptyFilters(); f.caps = ["Large", "Mid"];
    expect(applyFilters(x, f)).toHaveLength(2);
  });
  it("counts beside options follow the other filters but not their own group", () => {
    const f = emptyFilters(); f.sectors = ["IT"]; f.ranges.z = { min: 65, max: null };
    const c = facetCounts(items, f);
    expect(Object.fromEntries(c.sectors)).toEqual({ Banks: 2, IT: 1, Auto: 0 });   // sector counts ignore the sector choice itself
    expect(c.caps.Large).toBe(1);                                                    // B only: IT, Prism 65+
  });
  it("the retired score's figures never filter: a row's stored overall and pillars are not read", () => {
    const x = [mk("P", { overall: 90, pillar_quality: 90 }), mk("Q", { overall: 10, pillar_quality: 10 })];
    expect(syms(applyFilters(x, parseState(new URLSearchParams("omin=50&qual=high&f=high&iql=strong&top=10"), "advanced").filters))).toEqual(["P", "Q"]);
  });
});

describe("validation", () => {
  it("flags out of range and min above max on the Prism ranges", () => {
    const f = emptyFilters(); f.ranges.z = { min: 90, max: 10 }; f.ranges.zq = { min: -5, max: null }; f.ranges.zv = { min: 0, max: 100 };
    expect(Object.keys(validate(f))).toEqual(["z", "zq"]);
  });
});

describe("chips", () => {
  it("one chip per active filter, each removable", () => {
    const f = emptyFilters(); f.caps = ["Mid", "Large"]; f.sectors = ["IT", "Auto"]; f.ranges.dh = { min: null, max: 20 };
    const ch = chipsFor(f);
    expect(ch.map((c) => c.label)).toEqual(["Market cap: Large, Mid", "IT", "Auto", "Down from 52-week high: 20 or less%"]);
    expect(chipsFor(removeChip(f, "sector:IT")).map((c) => c.id)).toEqual(["caps", "sector:Auto", "range:dh"]);
    expect(chipsFor(removeChip(removeChip(f, "caps"), "range:dh")).map((c) => c.id)).toEqual(["sector:IT", "sector:Auto"]);
    expect(chipsFor(emptyFilters())).toEqual([]);
  });
  it("no chip names the retired score", () => {
    const f = parseState(new URLSearchParams("cap=Large&omin=50&ovr=high&iql=strong&top=10&zmin=60&pl=strong"), "advanced").filters;
    expect(chipsFor(f).map((c) => c.label)).toEqual(["Market cap: Large", "Total Fundamental Score: 60 or more", "Prism rating: Strong"]);   // the Prism ones only
  });
});

describe("sorting and paging", () => {
  const items = [pr("A", 50, "AVERAGE", { prism_lt_score: 10 }), pr("B", null, null, { prism_lt_score: 20 }), pr("C", 70, "HEALTHY", { prism_lt_score: null }), pr("D", 50, "AVERAGE", { prism_lt_score: 30 }), pr("E", 90, "STRONG", { prism_lt_score: 40 })];
  it("sorts numbers both ways with missing values always last", () => {
    expect(syms(sortRows(items, { key: "prism_final", dir: -1 }))).toEqual(["E", "C", "A", "D", "B"]);
    expect(syms(sortRows(items, { key: "prism_final", dir: 1 }))).toEqual(["A", "D", "C", "E", "B"]);
    expect(syms(sortRows(items, { key: "prism_lt_score", dir: 1 }))).toEqual(["A", "B", "D", "E", "C"]);
  });
  it("is stable: ties keep their order in both directions", () => {
    expect(syms(sortRows(items, { key: "prism_final", dir: -1 })).filter((s) => s === "A" || s === "D")).toEqual(["A", "D"]);
    expect(syms(sortRows(items, { key: "prism_final", dir: 1 })).filter((s) => s === "A" || s === "D")).toEqual(["A", "D"]);
  });
  it("sorts text A to Z, missing sector last, and does not change the input", () => {
    const x = [mk("Z", { sector: "IT" }), mk("Y", { sector: null }), mk("X", { sector: "Auto" })];
    expect(syms(sortRows(x, { key: "sector", dir: 1 }))).toEqual(["X", "Z", "Y"]);
    expect(syms(sortRows(x, { key: "sector", dir: -1 }))).toEqual(["Z", "X", "Y"]);
    expect(syms(x)).toEqual(["Z", "Y", "X"]);
  });
  it("heading clicks: new column starts high to low (text A to Z), same column flips", () => {
    expect(nextSort(DEFAULT_SORT, "prism_final")).toEqual({ key: "prism_final", dir: -1 });
    expect(nextSort({ key: "prism_final", dir: -1 }, "prism_final")).toEqual({ key: "prism_final", dir: 1 });
    expect(nextSort(DEFAULT_SORT, "name")).toEqual({ key: "name", dir: 1 });
  });
  it("the sort list has no column of the retired score", () => {
    for (const k of ["overall", "f", "t", "pillar_quality", "pillar_growth", "pillar_profitability", "pillar_balance"]) expect(SORT_KEYS as string[]).not.toContain(k);
  });
  it("paging clamps the page and reports the range", () => {
    const rows = Array.from({ length: 23 }, (_, i) => i);
    expect(pageOf(rows, 2, 10)).toMatchObject({ page: 2, pages: 3, from: 21, to: 23, view: [20, 21, 22] });
    expect(pageOf(rows, 9, 10).page).toBe(2);
    expect(pageOf(rows, -3, 10).page).toBe(0);
    expect(pageOf([], 0, 10)).toMatchObject({ pages: 1, from: 0, to: 0, view: [] });
  });
  it("page numbers leave gaps", () => {
    expect(pageList(0, 3)).toEqual([0, 1, 2]);
    expect(pageList(5, 12)).toEqual([0, null, 3, 4, 5, 6, 7, null, 11]);
  });
});

describe("summary", () => {
  it("median ignores missing values and averages the middle pair", () => {
    expect(median([10, null, 30, 20])).toBe(20);
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([null, null])).toBeNull();
    expect(median([])).toBeNull();
  });
  it("summarises the whole filtered set on Prism", () => {
    expect(summarize(PZ)).toMatchObject({ found: 7, sectors: 1, nZ: 5, medZ: 55 });
    expect(summarize([])).toMatchObject({ found: 0, nZ: 0, medZ: null });
  });
  it("sector concentration sums to the whole result", () => {
    const rows = [..."aaaabbbccd"].map((s, i) => mk("S" + i, { sector: s })).concat(mk("N", { sector: null }));
    const c = concentration(rows, 2);
    expect(c.map((x) => [x.label, x.n])).toEqual([["a", 4], ["b", 3], ["Other sectors", 3], ["Sector not listed", 1]]);
    expect(c.reduce((a, x) => a + x.pct, 0)).toBeCloseTo(100);
    expect(concentration([])).toEqual([]);
  });
});

describe("URL state", () => {
  it("round-trips every control", () => {
    const f = emptyFilters(); f.caps = ["Large", "Mid"]; f.sectors = ["IT", "Banks, Private"]; f.labels = ["STRONG", "NOT RATED"]; f.rated = true;
    f.ranges.z = { min: 40, max: 90.5 }; f.ranges.zv = { min: 55, max: null }; f.ranges.dh = { min: null, max: 20 }; f.tech.st = ["pos"]; f.trend.lt = ["u"];
    const s = { filters: f, sort: { key: "prism_quality" as const, dir: 1 as const }, size: 50, page: 2 };
    expect(parseState(new URLSearchParams(serializeState(s).toString()))).toEqual(s);
    expect(parseState(serializeState(s, "advanced"), "advanced")).toEqual(s);
  });
  it("defaults leave the address empty", () => {
    expect(serializeState(parseState(new URLSearchParams())).toString()).toBe("");
  });
  it("still reads the size and sector of an older link, and leaves out the retired score's parameters (task #283)", () => {
    const s = parseState(new URLSearchParams("cap=Mid&sector=IT&f=high&t=low,mid&qual=high&ovr=high&omin=70&iql=strong&top=10&sort=overall&dir=desc"), "advanced");
    expect(s.filters).toMatchObject({ caps: ["Mid"], sectors: ["IT"] });
    expect(filtersKey(s.filters)).toBe(filtersKey({ ...emptyFilters(), caps: ["Mid"], sectors: ["IT"] }));
    expect(s.sort).toEqual(DEFAULT_SORT);                                                 // sort=overall is no sort any more
    expect(serializeState(s, "advanced").toString()).toBe("size=mid&sector=IT");          // and it is not written back
  });
  it("an older link's band list in ?q= is not read as a search", async () => {
    const { isBandList } = await import("./scoreScreen");
    expect(isBandList("high")).toBe(true); expect(isBandList("low,mid")).toBe(true); expect(isBandList("tata")).toBe(false); expect(isBandList(null)).toBe(false);
  });
  it("ignores junk and clamps", () => {
    const s = parseState(new URLSearchParams("cap=Huge&zmin=abc&zqmin=-5&zqmax=500&zrmin=80&zrmax=20&sort=evil&size=7&page=-4"));
    expect(s.filters.caps).toEqual([]);
    expect(s.filters.ranges.z).toEqual({ min: null, max: null });
    expect(s.filters.ranges.zq).toEqual({ min: 0, max: 100 });
    expect(s.filters.ranges.zr).toEqual({ min: 20, max: 80 });
    expect(s.sort).toEqual(DEFAULT_SORT); expect(s.size).toBe(25); expect(s.page).toBe(0);
  });
});

describe("Prism filters", () => {
  it("rated-only keeps companies with a Prism score and drops both 'not rated' kinds", () => {
    const f = emptyFilters(); f.rated = true;
    expect(syms(applyFilters(PZ, f))).toEqual(["S", "H", "A", "W", "P"]);
  });
  it("label chips are OR within the group; the word follows the Prism score, and Not rated is every company without one (task #258, SHARED §4)", () => {
    const f = emptyFilters(); f.labels = ["STRONG", "NOT RATED"];
    expect(syms(applyFilters(PZ, f))).toEqual(["S", "N", "X"]);
  });
  it("the Prism range is inclusive and a missing score never passes it or counts as zero", () => {
    const f = emptyFilters(); f.ranges.z = { min: 55, max: 85 };
    expect(syms(applyFilters(PZ, f))).toEqual(["S", "H", "A"]);
    f.ranges.z = { min: null, max: 30 };
    expect(syms(applyFilters(PZ, f))).toEqual(["P"]);
  });
  it("each part has its own range", () => {
    const x = [pr("A", 70, "HEALTHY", { prism_quality: 90, prism_valuation: 10 }), pr("B", 70, "HEALTHY", { prism_quality: 90, prism_valuation: 60 })];
    const f = emptyFilters(); f.ranges.zq = { min: 80, max: null }; f.ranges.zv = { min: 50, max: null };
    expect(syms(applyFilters(x, f))).toEqual(["B"]);
  });
  it("rows from a plan or a server without Prism fields simply have no rating", () => {
    const bare = mk("Z");
    const f = emptyFilters(); f.rated = true;
    expect(applyFilters([bare], f)).toEqual([]);
    expect(applyFilters([bare], emptyFilters())).toHaveLength(1);
  });
});

describe("Prism sorting", () => {
  it("every score column sorts both ways with missing last", () => {
    for (const key of ["prism_final", "prism_fundamental", "prism_valuation", "prism_quality", "prism_risk", "prism_st_score", "prism_lt_score"] as const) {
      expect(SORT_KEYS).toContain(key);
      const down = sortRows(PZ, { key, dir: -1 }), up = sortRows(PZ, { key, dir: 1 });
      expect(syms(down).slice(-2)).toEqual(["N", "X"]); expect(syms(up).slice(-2)).toEqual(["N", "X"]);
    }
    expect(syms(sortRows(PZ, { key: "prism_final", dir: -1 })).slice(0, 5)).toEqual(["S", "H", "A", "W", "P"]);
    expect(syms(sortRows(PZ, { key: "prism_lt_score", dir: -1 })).slice(0, 2)).toEqual(["P", "W"]);
  });
});

describe("Prism presets (advanced screener: Prism parts only)", () => {
  const items = [
    pr("A", 85, "STRONG", { prism_fundamental: 80, prism_valuation: 55, prism_risk: 70, prism_st_score: 30, prism_lt_score: 25 }),
    pr("B", 85, "STRONG", { prism_fundamental: 80, prism_valuation: 40, prism_risk: 50, prism_st_score: 30, prism_lt_score: 10 }),
    pr("C", 60, "AVERAGE", { prism_fundamental: 66, prism_valuation: 60, prism_risk: 90, prism_st_score: 5, prism_lt_score: 45 }),
    pr("D", null, null, {})];
  const run = (id: string) => syms(applyFilters(items, withPrismPreset(emptyFilters(), PRISM_PRESETS.find((p) => p.id === id)!)));
  it("has the four views, each on Prism's own ranges", () => {
    expect(PRISM_PRESETS.map((p) => p.label)).toEqual(["Prism strong and lower risk", "Strong Growth & Profitability at a fair valuation", "Uptrend on both technical views", "Growth & Profitability strong but valuation weak"]);
    PRISM_PRESETS.forEach((p) => expect(Object.keys(p.ranges).every((k) => ["z", "zf", "zv", "zq", "zr"].includes(k))).toBe(true));
  });
  it("Prism strong and lower risk: Prism 80+ and Risk 65+", () => expect(run("strongsafe")).toEqual(["A"]));
  it("Strong Growth & Profitability at a fair valuation: Growth & Profitability 65+ and Valuation 50+", () => expect(run("fairvalue")).toEqual(["A", "C"]));
  it("Uptrend on both technical views: both scores at +20 or more", () => expect(run("bothtech")).toEqual(["A"]));
  it("Growth & Profitability strong but valuation weak: Growth & Profitability 65+ and Valuation below 50", () => expect(run("weakvalue")).toEqual(["B"]));
  it("a preset owns the Prism filters (sets exactly its own), keeps the others, and is recognised and removable", () => {
    const f = emptyFilters(); f.sectors = ["IT"]; f.ranges.z = { min: 10, max: 20 }; f.labels = ["POOR"]; f.tech.st = ["neg"]; f.ranges.dh = { min: null, max: 20 };
    const n = withPrismPreset(f, PRISM_PRESETS[1]);
    expect(n.sectors).toEqual(["IT"]); expect(n.ranges.z).toEqual({ min: null, max: null }); expect(n.labels).toEqual([]); expect(n.tech).toEqual({ st: [], lt: [] });
    expect(n.ranges.dh).toEqual({ min: null, max: 20 });
    expect(activePrismPreset(n)).toBe("fairvalue"); expect(activePrismPreset(emptyFilters())).toBeNull();
    const t = withPrismPreset(emptyFilters(), PRISM_PRESETS[2]);
    expect(t.tech).toEqual({ st: ["pos"], lt: ["pos"] }); expect(activePrismPreset(t)).toBe("bothtech");
    const off = withoutPrismPreset(n);
    expect(activePrismPreset(off)).toBeNull(); expect(chipsFor(off).map((c) => c.id)).toEqual(["sector:IT", "range:dh"]);
  });
  it("uses no advice wording", () => {
    const text = PRISM_PRESETS.map((p) => p.label + " " + p.say).join(" ").toLowerCase();
    expect(text).not.toMatch(/\b(buy|sell|hold|reduce|avoid|accumulate|target)\b/);
  });
});

describe("technical view bands", () => {
  it("use the Prism card's edges: +20 and above Positive (strong uptrend included), above -20 Neutral, -20 and below Negative", () => {
    expect([100, 50, 20, 19.9, 0, -19.9, -20, -50, -100].map(techBandOf)).toEqual(["pos", "pos", "pos", "neutral", "neutral", "neutral", "neg", "neg", "neg"]);
    expect(techBandOf(null)).toBeNull(); expect(techBandOf(undefined)).toBeNull();
  });
  it("filter by band on either view; a missing score never passes; bands are OR within a view and AND across the two", () => {
    const x = [pr("A", 80, "STRONG", { prism_st_score: 30, prism_lt_score: -30 }), pr("B", 80, "STRONG", { prism_st_score: 0, prism_lt_score: 0 }), pr("C", 80, "STRONG", { prism_st_score: null, prism_lt_score: null }), pr("D", null, null)];
    const f = emptyFilters(); f.tech.st = ["pos", "neutral"];
    expect(syms(applyFilters(x, f))).toEqual(["A", "B"]);
    f.tech.lt = ["neg"]; expect(syms(applyFilters(x, f))).toEqual(["A"]);
  });
  it("words come from the score (the site's descriptive words), whatever the model said", () => {
    expect(trendWord(22.5)).toBe("Uptrend"); expect(trendWord(-60)).toBe("Strong downtrend"); expect(trendWord(null)).toBeNull();
  });
  it("chips, address and removal", () => {
    const f = emptyFilters(); f.tech.st = ["neg", "pos"]; f.tech.lt = ["neutral"];
    expect(chipsFor(f).map((c) => c.label)).toEqual(["Short-term technical: Uptrend, Downtrend", "Long-term technical: Sideways"]);
    const qs = serializeState({ filters: f, sort: DEFAULT_SORT, size: 25, page: 0 }).toString();
    expect(qs).toBe("st=pos%2Cneg&lt=neutral");
    expect(parseState(new URLSearchParams(qs)).filters.tech).toEqual({ st: ["pos", "neg"], lt: ["neutral"] });
    expect(parseState(new URLSearchParams("st=bogus&lt=")).filters.tech).toEqual({ st: [], lt: [] });
    expect(removeChip(f, "tech:st").tech).toEqual({ st: [], lt: ["neutral"] });
  });
});

describe("Prism chips, address and summary", () => {
  it("one removable chip each for the labels, the rated switch and each Prism range", () => {
    const f = emptyFilters(); f.labels = ["HEALTHY", "STRONG"]; f.rated = true; f.ranges.z = { min: 60, max: null }; f.ranges.zr = { min: null, max: 40 };
    expect(chipsFor(f).map((c) => c.label)).toEqual(["Total Fundamental Score: 60 or more", "Prism Risk: 40 or less", "Prism rating: Strong, Healthy", "Only companies rated by Prism"]);
    expect(chipsFor(removeChip(removeChip(f, "labels"), "rated")).map((c) => c.id)).toEqual(["range:z", "range:zr"]);
  });
  it("round-trips through the address and ignores junk", () => {
    const f = emptyFilters(); f.labels = ["STRONG", "NOT RATED"]; f.rated = true; f.ranges.z = { min: 40, max: 90 }; f.ranges.zv = { min: 55, max: null };
    const s = { filters: f, sort: { key: "prism_quality" as const, dir: 1 as const }, size: 50, page: 1 };
    const qs = serializeState(s).toString();
    expect(qs).toContain("pl=strong%2Cnotrated"); expect(qs).toContain("rated=1");
    expect(parseState(new URLSearchParams(qs))).toEqual(s);
    const bad = parseState(new URLSearchParams("pl=bogus,Strong&rated=yes&zmin=abc&zmax=500&sort=prism_evil"));
    expect(bad.filters.labels).toEqual([]); expect(bad.filters.rated).toBe(false); expect(bad.filters.ranges.z).toEqual({ min: null, max: 100 }); expect(bad.sort).toEqual(DEFAULT_SORT);
  });
});

describe("colour rule", () => {
  it("scores are coloured by the site's one rule (70 / 50)", async () => {
    const { level } = await import("./scoreScreen");
    expect([level(70), level(69), level(50), level(49), level(null)]).toEqual(["hi", "mid", "mid", "lo", "na"]);
  });
});

describe("the two valuation views split at 50 (issue 30.b)", () => {
  const vals: [string, number | null][] = [["GLAXO", 49.75], ["ICICILIFE", 49.7], ["OFSS", 49.69], ["EDGE", 49.99], ["AT50", 50], ["JUST", 50.01], ["ZERO", 0], ["TOP", 100], ["BLANK", null]];
  const items = vals.map(([s, v]) => pr(s, 80, "STRONG", { prism_fundamental: 70, prism_valuation: v as number, prism_risk: 60, prism_st_score: 0, prism_lt_score: 0 }));
  const run = (id: string) => syms(applyFilters(items, withPrismPreset(emptyFilters(), PRISM_PRESETS.find((p) => p.id === id)!)));
  it("Valuation below 50 is weak (GLAXO 49.75, ICICILIFE 49.70, OFSS 49.69), 50 and above is fair, and 50.0 is on the fair side", () => {
    expect(run("weakvalue")).toEqual(["GLAXO", "ICICILIFE", "OFSS", "EDGE", "ZERO"]);
    expect(run("fairvalue")).toEqual(["AT50", "JUST", "TOP"]);
  });
  it("no stock with a Valuation score falls into neither view, or into both", () => {
    const weak = run("weakvalue"), fair = run("fairvalue");
    items.filter((r) => r.prism_valuation != null).forEach((r) => expect([weak.includes(r.symbol), fair.includes(r.symbol)].filter(Boolean)).toHaveLength(1));
  });
  it("the weak view is recognised again from its address and says 'below 50'", () => {
    const f = withPrismPreset(emptyFilters(), PRISM_PRESETS.find((p) => p.id === "weakvalue")!);
    expect(activePrismPreset(f)).toBe("weakvalue");
    const qs = serializeState({ filters: f, sort: DEFAULT_SORT, size: 25, page: 0 }).toString();
    expect(qs).toContain("zvlt=50"); expect(qs).not.toContain("zvmax");
    const back = parseState(new URLSearchParams(qs), "advanced").filters;
    expect(activePrismPreset(back)).toBe("weakvalue"); expect(back.ranges.zv).toEqual({ min: null, max: 50, maxExcl: true });
    expect(chipsFor(f).map((c) => c.label).find((l) => /Valuation/.test(l))).toMatch(/Valuation.*: Poor, Weak$/);   // band names, never the cut-off (14 Nov N-31)
    expect(inRange(49.99, back.ranges.zv)).toBe(true); expect(inRange(50, back.ranges.zv)).toBe(false);
  });
  it("an exact maximum typed in the boxes stays inclusive", () => expect(inRange(50, { min: null, max: 50 })).toBe(true));
});

describe("Prism band chips as a Min - Max range (Poor < 35, Weak 35, Average 50, Healthy 65, Strong 80)", () => {
  it("each chip maps to a half-open range with no gaps", () => {
    expect(pBandsToRange(["poor"])).toEqual({ min: null, max: 35, maxExcl: true });
    expect(pBandsToRange(["average"])).toEqual({ min: 50, max: 65, maxExcl: true });
    expect(pBandsToRange(["strong"])).toEqual({ min: 80, max: null });
    expect(pBandsToRange(["healthy", "strong"])).toEqual({ min: 65, max: null });
    for (const v of [34.99, 35, 49.99, 50, 64.99, 65, 79.99, 80]) { const hit = (["poor", "weak", "average", "healthy", "strong"] as const).filter((b) => inRange(v, pBandsToRange([b]))); expect(hit).toHaveLength(1); }
  });
  it("toggling joins neighbours, restarts otherwise, and a typed range lights no chip", () => {
    const none = { min: null, max: null };
    const a = togglePRangeBand(none, "poor"), b = togglePRangeBand(a, "weak");
    expect(rangeToPBands(a)).toEqual(["poor"]); expect(rangeToPBands(b)).toEqual(["poor", "weak"]);
    expect(rangeToPBands(togglePRangeBand(a, "strong"))).toEqual(["strong"]);       // not next to it: starts over
    expect(togglePRangeBand(a, "poor")).toEqual(none);
    expect(rangeToPBands({ min: 52, max: 70 })).toEqual([]);
  });
  it("URL round trip of a chip-set range (zvlt / zqmin)", () => {
    const f = emptyFilters(); f.ranges.zv = pBandsToRange(["poor"]); f.ranges.zq = pBandsToRange(["healthy", "strong"]);
    const p = serializeState({ filters: f, sort: DEFAULT_SORT, size: 25, page: 0 });
    expect(p.get("zvlt")).toBe("35"); expect(p.get("zqmin")).toBe("65");
    const back = parseState(p, "advanced").filters;
    expect(rangeToPBands(back.ranges.zv)).toEqual(["poor"]); expect(rangeToPBands(back.ranges.zq)).toEqual(["healthy", "strong"]);
  });
});
