// Task #258 (20 Nov handoff): the Advanced screener's three NSE levels, the rating words, the five trend words and the address.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NSE_INDUSTRIES, NSE_MACROS, NSE_SECTORS } from "./nseTree";
import { applyFilters, chipsFor, emptyFilters, levelOptions, nsePath, parseState, pickLevel, prismOnCount, ratingOfScore, removeChip, scoreCounts, serializeState,
  trend5Of, withScores, withoutScoreFilters, DEFAULT_SORT, type Item } from "./scoreScreen";
import type { Row } from "./screener";

const row = (symbol: string, o: Partial<Row> = {}): Row => ({
  symbol, name: symbol, sector: "X", overall: 60, band: "healthy", pillar_quality: 60, pillar_growth: 60, pillar_profitability: 60, pillar_balance: 60, pillar_technical: 60,
  price: 100, market_cap: 1000, pe: null, pb: null, roe: null, roce: null, dividend_yield: null, debt_to_equity: null, sales_cagr: null, profit_cagr: null,
  operating_margin: null, change_pct: null, return_1m: null, return_1y: null, ...o,
});
const at = (symbol: string, ind: string | null, o: Partial<Row> = {}): Item => {
  const p = NSE_INDUSTRIES.find((i) => i.name === ind);
  return withScores([row(symbol, { cls_macro: p?.macro ?? null, cls_sector: p?.sector ?? null, cls_industry: ind, ...o })])[0];
};
const syms = (r: Item[]) => r.map((x) => x.symbol);
const U = [
  at("BANK1", "Banks", { market_cap: 90_000, prism_final: 85, prism_st_score: 60, prism_lt_score: 10 }),
  at("BANK2", "Banks", { market_cap: 30_000, prism_final: 66, prism_st_score: 25, prism_lt_score: -30 }),
  at("NBFC", "Finance", { market_cap: 5_000, prism_final: 52, prism_st_score: 0, prism_lt_score: -70 }),
  at("STEEL", "Ferrous Metals", { market_cap: 80_000, prism_final: 40, prism_st_score: -25 }),
  at("CHEM", "Chemicals & Petrochemicals", { market_cap: 3_000, prism_final: 20 }),
  at("ELEC", "Electrical Equipment", { market_cap: 15_000, prism_final: null }),
  at("BSEONLY", null, { market_cap: 800 }),
];

describe("the NSE tree the page lists", () => {
  it("is NSE's 12 macro sectors, 22 sectors and 59 industries, the same as the backend's classification file", () => {
    const src = JSON.parse(readFileSync(resolve(__dirname, "../../../backend/finlit/data/nse_classification.json"), "utf-8")).basic_industries as { macro_sector: string; sector: string; industry: string }[];
    expect(NSE_MACROS).toHaveLength(12); expect(NSE_SECTORS).toHaveLength(22); expect(NSE_INDUSTRIES).toHaveLength(59);
    expect(new Set(NSE_MACROS)).toEqual(new Set(src.map((r) => r.macro_sector)));
    const k = (s: string) => s.toLowerCase().replace(/[^a-z0-9|]/g, "");   // the site's taxonomy writes "Oil Gas & ...", NSE's file "Oil, Gas & ..."
    expect(new Set(NSE_SECTORS.map((s) => k(`${s.macro}|${s.name}`)))).toEqual(new Set(src.map((r) => k(`${r.macro_sector}|${r.sector}`))));
    // one known difference between the two shared lists (the site taxonomy of task #183 lists "Trading", NSE's file of task #192 "Public Services"); anything else fails
    const a = new Set(NSE_INDUSTRIES.map((s) => k(`${s.macro}|${s.sector}|${s.name}`))), b = new Set(src.map((r) => k(`${r.macro_sector}|${r.sector}|${r.industry}`)));
    expect([[...a].filter((x) => !b.has(x)), [...b].filter((x) => !a.has(x))]).toEqual([["services|services|trading"], ["services|services|publicservices"]]);
  });
});

describe("SPEC §1: three linked lists", () => {
  it("AND across the levels, OR inside one list", () => {
    const f = emptyFilters(); f.macros = ["Financial Services", "Commodities"];
    expect(syms(applyFilters(U, f))).toEqual(["BANK1", "BANK2", "NBFC", "STEEL", "CHEM"]);
    f.industries = ["Banks", "Ferrous Metals"];
    expect(syms(applyFilters(U, f))).toEqual(["BANK1", "BANK2", "STEEL"]);
    f.caps = ["Large"];
    expect(syms(applyFilters(U, f))).toEqual(["BANK1", "STEEL"]);
  });
  it("a lower list is narrowed by the parent picked and lists every name in it, most companies first", () => {
    const f = emptyFilters(); f.macros = ["Commodities"];
    const sec = levelOptions(U, f, "nsec");
    expect(sec.map((o) => o.name).sort()).toEqual(["Chemicals", "Construction Materials", "Forest Materials", "Metals & Mining"]);
    expect(sec.slice(0, 2).map((o) => o.n)).toEqual([1, 1]);
    expect(sec.find((o) => o.name === "Forest Materials")!.n).toBe(0);
    expect(levelOptions(U, emptyFilters(), "ind")).toHaveLength(59);
    expect(levelOptions(U, emptyFilters(), "macro")).toHaveLength(12);
  });
  it("counts follow the other filters but not the list's own picks", () => {
    const f = emptyFilters(); f.caps = ["Large"]; f.macros = ["Financial Services"];
    const m = levelOptions(U, f, "macro");
    expect(m.find((o) => o.name === "Financial Services")!.n).toBe(1);    // BANK1 only (BANK2 is Mid)
    expect(m.find((o) => o.name === "Commodities")!.n).toBe(1);           // STEEL: its own pick is left out of its own count
  });
  it("a pick that no longer fits the parent is taken off, and the page says so", () => {
    let f = emptyFilters();
    f = pickLevel(f, "ind", "Banks").filters;
    f = pickLevel(f, "nsec", "Financial Services").filters;
    expect(f.industries).toEqual(["Banks"]);
    const r = pickLevel(f, "macro", "Commodities");
    expect(r.filters.nsecs).toEqual([]); expect(r.filters.industries).toEqual([]);
    expect(r.message).toBe("Financial Services, Banks were taken off: not inside your other choice.");
    const one = pickLevel(pickLevel(emptyFilters(), "ind", "Banks").filters, "nsec", "Chemicals");
    expect(one.message).toBe("Banks was taken off: not inside your other choice.");
    expect(pickLevel(emptyFilters(), "macro", "Energy").message).toBeNull();
  });
  it("the address keeps the filters (?size=large,mid&sector=Capital+Goods) and an older ?sector= label still works", () => {
    const f = emptyFilters(); f.caps = ["Large", "Mid"]; f.nsecs = ["Capital Goods"]; f.macros = ["Industrials"]; f.industries = ["Electrical Equipment"];
    const qs = serializeState({ filters: f, sort: DEFAULT_SORT, size: 50, page: 0 }, "advanced");
    expect(qs.get("size")).toBe("large,mid"); expect(qs.get("rows")).toBe("50"); expect(qs.getAll("sector")).toEqual(["Capital Goods"]);
    const back = parseState(new URLSearchParams(qs.toString()), "advanced");
    expect(back.filters.caps).toEqual(["Large", "Mid"]); expect(back.filters.nsecs).toEqual(["Capital Goods"]); expect(back.filters.macros).toEqual(["Industrials"]);
    expect(back.filters.industries).toEqual(["Electrical Equipment"]); expect(back.size).toBe(50);
    expect(parseState(new URLSearchParams("size=large,mid&sector=Capital+Goods"), "advanced").filters).toMatchObject({ caps: ["Large", "Mid"], nsecs: ["Capital Goods"], sectors: [] });
    expect(parseState(new URLSearchParams("sector=Banks&size=50"), "advanced")).toMatchObject({ filters: { sectors: ["Banks"], nsecs: [], caps: [] }, size: 50 });   // older links
  });
  it("one chip per pick, each removable", () => {
    const f = emptyFilters(); f.macros = ["Energy"]; f.nsecs = ["Power"]; f.trend.st = ["su", "u"];
    const c = chipsFor(f);
    expect(c.map((x) => x.label)).toEqual(["Macro sector: Energy", "Sector: Power", "Short term: Strong uptrend, Uptrend"]);
    const n = c.reduce((acc, x) => removeChip(acc, x.id), f);
    expect(n.macros).toEqual([]); expect(n.nsecs).toEqual([]); expect(n.trend.st).toEqual([]);
  });
});

describe("SPEC §3 and §4: rating words and trend words", () => {
  it("rating words from the Prism score: 80+, 65-79, 50-64, 35-49, below 35, none", () => {
    expect([80, 79.9, 65, 64.5, 50, 49, 35, 34.9, 0, null].map(ratingOfScore)).toEqual(["STRONG", "HEALTHY", "HEALTHY", "AVERAGE", "AVERAGE", "WEAK", "WEAK", "POOR", "POOR", "NOT RATED"]);
  });
  it("five trend words, from the Prism card's edges", () => {
    expect([60, 25, 0, -25, -70, null].map(trend5Of)).toEqual(["su", "u", "s", "d", "sd", null]);
  });
  it("counts for each rating and trend word follow the other filters", () => {
    const f = emptyFilters(); f.macros = ["Financial Services"];
    const c = scoreCounts(U, f);
    expect(c.labels).toMatchObject({ STRONG: 1, HEALTHY: 1, AVERAGE: 1, WEAK: 0, POOR: 0, "NOT RATED": 0 });
    expect(c.trend.st).toMatchObject({ su: 1, u: 1, s: 1, d: 0, sd: 0 });
    expect(c.trend.lt).toMatchObject({ s: 1, d: 1, sd: 1 });
    f.trend.lt = ["sd"];
    expect(syms(applyFilters(U, f))).toEqual(["NBFC"]);
    expect(scoreCounts(U, f).trend.lt.d).toBe(1);   // its own list is left out of its own counts
    expect(scoreCounts(U, f).labels.STRONG).toBe(0);
  });
  it("'Prism score · N' counts the filters on, and Clear score filters leaves the others", () => {
    const f = emptyFilters(); f.labels = ["STRONG"]; f.ranges.zr = { min: 60, max: null }; f.trend.st = ["u"]; f.macros = ["Energy"];
    expect(prismOnCount(f)).toBe(3);
    const n = withoutScoreFilters(f);
    expect(prismOnCount(n)).toBe(0); expect(n.macros).toEqual(["Energy"]);
  });
  it("the company line's hover path is macro sector › sector › industry; none for a company outside NSE's list", () => {
    expect(nsePath(U[3])).toBe("Commodities › Metals & Mining › Ferrous Metals");
    expect(nsePath(U[6])).toBeNull();
  });
});
