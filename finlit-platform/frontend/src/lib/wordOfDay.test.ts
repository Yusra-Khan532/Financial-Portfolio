// Task #315: Word of the Day. No repeats in a cycle, the India calendar day, neighbouring days far apart in the alphabet, the formula parts,
// and bookmarks in prefs.
import { beforeEach, describe, expect, it } from "vitest";
import { TERMS, WORD_ORDER, termForDay, termOfTheDay } from "./glossary";
import { WORD_EPOCH, cycleIndex, istDate, istDayNumber, markWordSeen, parseFormula, removeBookmark, toggleBookmark, wordIsNew, wordOrder } from "./wordOfDay";
import { prefs } from "./prefs";

const N = TERMS.length;
const day0 = istDayNumber(Date.parse("2026-11-23T10:00:00+05:30"));
const sortedIds = TERMS.map((t) => t.id).sort();
const rankId = new Map(sortedIds.map((id, i) => [id, i]));
const rankShown = new Map(TERMS.map((t, i) => [t.id, i]));   // the order the glossary page lists them (A to Z by name)

describe("Word of the Day: no repeats (checklist 4)", () => {
  it(`${N} consecutive days give ${N} different terms, every term once`, () => {
    expect(N).toBe(1260);
    const ids = Array.from({ length: N }, (_, k) => termForDay(day0 + 1000 + k).id);
    expect(new Set(ids).size).toBe(N);
    expect([...ids].sort()).toEqual(sortedIds);
    expect(WORD_ORDER).toHaveLength(N);
  });
  it("day N + TERMS.length repeats day N (and only then)", () => {
    for (const d of [day0, day0 + 17, day0 - 300, day0 + 5000]) {
      expect(termForDay(d + N).id).toBe(termForDay(d).id);
      expect(termForDay(d + 1).id).not.toBe(termForDay(d).id);
    }
  });
  it("neighbouring days are never alphabetical neighbours nor the same first letter, across the whole cycle and its wrap", () => {
    for (let k = 0; k < N; k++) {
      const a = termForDay(day0 + k), b = termForDay(day0 + k + 1);
      expect(Math.abs(rankId.get(a.id)! - rankId.get(b.id)!), `${a.id} then ${b.id}`).toBeGreaterThan(1);
      expect(Math.abs(rankShown.get(a.id)! - rankShown.get(b.id)!), `${a.term} then ${b.term}`).toBeGreaterThan(1);
      expect(a.letter, `${a.term} then ${b.term}`).not.toBe(b.letter);
    }
  });
  it("the order is fixed (same input, same order), does not depend on the input's order, and has a stable epoch", () => {
    const ids = TERMS.map((t) => t.id);
    expect(wordOrder(ids)).toEqual(wordOrder([...ids].reverse()));
    expect(WORD_EPOCH).toBe(istDayNumber(Date.parse("2026-11-23T00:00:00+05:30")));
    expect(cycleIndex(WORD_EPOCH, N)).toBe(0);
    expect(cycleIndex(WORD_EPOCH - 1, N)).toBe(N - 1);
  });
  it("the header and the dashboard read one helper: termOfTheDay(now) is the term of the India day", () => {
    const now = Date.parse("2026-12-05T08:00:00Z");
    expect(termOfTheDay(now).id).toBe(termForDay(istDayNumber(now)).id);
  });
});

describe("the India calendar day", () => {
  it("changes at midnight IST (18:30 UTC), not at 05:30 IST", () => {
    const before = Date.parse("2026-11-23T18:29:00Z"), after = Date.parse("2026-11-23T18:31:00Z");
    expect(istDayNumber(after)).toBe(istDayNumber(before) + 1);
    expect(istDate(before)).toBe("2026-11-23");
    expect(istDate(after)).toBe("2026-11-24");
    expect(termOfTheDay(after).id).not.toBe(termOfTheDay(before).id);
    // 00:10 UTC is 05:40 IST: still the same India day as 18:31 UTC the evening before
    expect(istDayNumber(Date.parse("2026-11-24T00:10:00Z"))).toBe(istDayNumber(after));
  });
});

describe("the formula box", () => {
  it("lays out X = a op b as parts and operators", () => {
    expect(parseFormula("ROE = Net margin × Asset turnover × Equity multiplier")).toEqual([{ lhs: "ROE", parts: ["Net margin", "Asset turnover", "Equity multiplier"], ops: ["×", "×"] }]);
    expect(parseFormula("EV = Market cap + Total debt − Cash and equivalents")).toEqual([{ lhs: "EV", parts: ["Market cap", "Total debt", "Cash and equivalents"], ops: ["+", "−"] }]);
    expect(parseFormula("P/E = Share price ÷ EPS")).toEqual([{ lhs: "P/E", parts: ["Share price", "EPS"], ops: ["÷"] }]);
    expect(parseFormula("Total debits = Total credits")).toEqual([{ lhs: "Total debits", parts: ["Total credits"], ops: [] }]);
    expect(parseFormula("Premium / discount = (Exchange close ÷ NAV − 1) × 100")).toEqual([{ lhs: "Premium / discount", parts: ["(Exchange close ÷ NAV − 1)", "100"], ops: ["×"] }]);
  });
  it("keeps brackets and |…| whole", () => {
    expect(parseFormula("MAD = Median of |Value − Median|")).toEqual([{ lhs: "MAD", parts: ["Median of |Value − Median|"], ops: [] }]);
    expect(parseFormula("Net income = Revenue − All expenses (including interest, depreciation and tax)")![0]).toEqual({ lhs: "Net income", parts: ["Revenue", "All expenses (including interest, depreciation and tax)"], ops: ["−"] });
  });
  it("shows a clause that does not split cleanly as plain text, one row per clause", () => {
    const dupont = parseFormula("ROE = Net margin × Asset turnover × Equity multiplier; five-step: (PAT ÷ PBT) × (PBT ÷ EBIT) × EBIT margin × Asset turnover × Equity multiplier")!;
    expect(dupont).toHaveLength(2);
    expect(dupont[0]).toEqual({ lhs: "ROE", parts: ["Net margin", "Asset turnover", "Equity multiplier"], ops: ["×", "×"] });
    expect(dupont[1]).toEqual({ text: "five-step: (PAT ÷ PBT) × (PBT ÷ EBIT) × EBIT margin × Asset turnover × Equity multiplier" });
    for (const f of ["1 crore = 100 lakh = 10 million", "Price change % ≈ −Modified duration × Change in yield (percentage points)", "Real rate ≈ Nominal rate − Inflation",
      "EMA today = Price × k + EMA yesterday × (1 − k), where k = 2 ÷ (n + 1)", "OBV today = OBV yesterday + Volume (on an up close) or − Volume (on a down close)",
      "HHI = Sum of (Weight)², with weights as fractions of 1", "X = (a + b", "Z = a + b + c + d + e + f + g"]) expect(parseFormula(f), f).toEqual([{ text: f }]);
  });
  it("has no box when there is no formula", () => {
    expect(parseFormula("")).toBeNull();
    expect(parseFormula("   ")).toBeNull();
    expect(parseFormula(undefined)).toBeNull();
  });
  it("every glossary formula gives rows, and every row keeps all of its text", () => {
    for (const t of TERMS.filter((x) => x.formula)) {
      const rows = parseFormula(t.formula)!;
      expect(rows.length, t.id).toBeGreaterThan(0);
      const flat = rows.map((r) => ("text" in r ? r.text : `${r.lhs} = ${r.parts.map((p, i) => (i ? `${r.ops[i - 1]} ${p}` : p)).join(" ")}`)).join(" ");
      expect(flat.replace(/\s+/g, ""), t.id).toBe(t.formula.replace(/[;\n]/g, "").replace(/\s+/g, ""));
    }
  });
});

describe("bookmarks and the gold dot (prefs)", () => {
  beforeEach(() => prefs.set({ wordBookmarks: [], wordSeen: "" }));
  it("toggle adds the word at the top, newest first, and takes it off again", () => {
    expect(toggleBookmark("ebitda")).toBe(true);
    expect(toggleBookmark("dupont-analysis")).toBe(true);
    expect(prefs.get().wordBookmarks).toEqual(["dupont-analysis", "ebitda"]);
    expect(toggleBookmark("ebitda")).toBe(false);
    expect(prefs.get().wordBookmarks).toEqual(["dupont-analysis"]);
    removeBookmark("dupont-analysis");
    expect(prefs.get().wordBookmarks).toEqual([]);
  });
  it("keeps at most 200, drops ids that are not glossary ids, and old saved prefs without the fields load", () => {
    prefs.set({ wordBookmarks: Array.from({ length: 230 }, (_, i) => `t${i}`) });
    expect(prefs.get().wordBookmarks).toHaveLength(200);
    prefs.set({ wordBookmarks: ["ok-id", "Bad Id", "", "ok-id"] as string[], wordSeen: "yesterday" });
    expect(prefs.get().wordBookmarks).toEqual(["ok-id"]);
    expect(prefs.get().wordSeen).toBe("");
    prefs.set({ wordBookmarks: undefined as unknown as string[], wordSeen: undefined as unknown as string });
    expect(prefs.get().wordBookmarks).toEqual([]);
    expect(prefs.get().wordSeen).toBe("");
  });
  it("the dot shows until today's word is opened, and comes back the next India day", () => {
    const now = Date.parse("2026-11-23T10:00:00Z");
    expect(wordIsNew(prefs.get().wordSeen, now)).toBe(true);
    markWordSeen(now);
    expect(prefs.get().wordSeen).toBe("2026-11-23");
    expect(wordIsNew(prefs.get().wordSeen, now)).toBe(false);
    expect(wordIsNew(prefs.get().wordSeen, Date.parse("2026-11-23T18:31:00Z"))).toBe(true);
  });
});
