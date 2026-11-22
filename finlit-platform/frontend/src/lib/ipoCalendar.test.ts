// Task #307 (developer file 17 v2): the IPO calendar's rules, one by one, in the pack's words.
import { describe, expect, it } from "vitest";
import type { GmpPoint, Ipo } from "./ipo";
import { GF0, gCat, gPass, gRange, gTally, isCap, listedRecently, median, sectionOrder, share, shortName, titleCase } from "./ipoCalendar";

const pt = (o: Partial<GmpPoint>): GmpPoint => ({ id: 1, name: "X", symbol: null, board: "mainboard", issuePrice: 100, gmp: 0, gmpPct: 0, listingPrice: 100, listingPct: 0,
  listingDate: "2026-11-03", subscription: 10, issueSizeCr: 200, verdict: "band", url: "u", ...o });
const ipo = (o: Partial<Ipo>): Ipo => ({ id: 1, name: "A", symbol: null, kind: "mainboard", sector: null, status: "listed", openDate: "2026-11-01", closeDate: "2026-11-03", listingDate: "2026-11-06",
  priceLow: null, priceHigh: null, lotSize: null, issueSizeCr: null, listingPrice: null, note: null, link: null, ...o });

describe("names: the data is in capitals, so convert it for display", () => {
  it("title-cases a name in capitals and keeps a company's own spelling", () => {
    expect(titleCase("MAHANADI COALFIELDS LIMITED")).toBe("Mahanadi Coalfields Limited");
    expect(titleCase("NATIONAL STOCK EXCHANGE OF INDIA LIMITED")).toBe("National Stock Exchange of India Limited");
    expect(titleCase("HGS (India) Limited")).toBe("HGS (India) Limited");
    expect(shortName("ANTALA INDUSTRIES LIMITED")).toBe("Antala Industries");
    expect(shortName("Watrana Rentals Ltd.")).toBe("Watrana Rentals");
  });
});

describe("Listed: ordered by listing date, newest first; same-day listings by opening date", () => {
  it("puts Antala (listed 11 Nov) before five issues listed on 6 Nov, and orders those by opening date", () => {
    const rows = [ipo({ id: 1, name: "Early open", listingDate: "2026-11-06", openDate: "2026-10-29" }), ipo({ id: 2, name: "Antala", listingDate: "2026-11-11", openDate: "2026-10-29" }),
      ipo({ id: 3, name: "Late open", listingDate: "2026-11-06", openDate: "2026-10-31" })];
    expect([...rows].sort(sectionOrder("listed")).map((r) => r.name)).toEqual(["Antala", "Late open", "Early open"]);
  });
  it("upcoming soonest first; open and closed newest first", () => {
    const a = ipo({ id: 1, status: "upcoming", openDate: "2026-11-30" }), b = ipo({ id: 2, status: "upcoming", openDate: "2026-11-25" });
    expect([a, b].sort(sectionOrder("upcoming")).map((r) => r.id)).toEqual([2, 1]);
    expect([b, a].sort(sectionOrder("open")).map((r) => r.id)).toEqual([1, 2]);
  });
  it("the last 30 days", () => {
    const now = new Date("2026-11-22T12:00:00").getTime();
    expect(listedRecently(ipo({ listingDate: "2026-10-23" }), now)).toBe(true);
    expect(listedRecently(ipo({ listingDate: "2026-10-20" }), now)).toBe(false);
    expect(listedRecently(ipo({ status: "closed", listingDate: "2026-11-21" }), now)).toBe(false);
  });
});

describe("the GMP record: ranges, categories and the +90% cap", () => {
  it("ranges: Below 0% · 0% · 0–10% · 10–25% · 25–50% · 50–90% · 90% and above", () => {
    expect([-0.1, 0, 0.5, 9.99, 10, 24.9, 25, 49.9, 50, 89.9, 90, 126].map(gRange)).toEqual(["neg", "zero", "r0", "r0", "r10", "r10", "r25", "r25", "r50", "r50", "r90", "r90"]);
  });
  it("within 5 points, higher, lower", () => {
    expect(gCat(pt({ gmpPct: 10, listingPct: 15 }))).toBe("band");
    expect(gCat(pt({ gmpPct: 10, listingPct: 15.1 }))).toBe("beat");
    expect(gCat(pt({ gmpPct: 10, listingPct: 4.9 }))).toBe("short");
  });
  it("an SME issue at +90% (±0.6) with a GMP above 85% counts as 'Opened at the +90% cap', never 'fell short'", () => {
    expect(gCat(pt({ board: "sme", gmpPct: 126, listingPct: 90 }))).toBe("cap");
    expect(gCat(pt({ board: "sme", gmpPct: 97, listingPct: 90.5 }))).toBe("cap");
    expect(gCat(pt({ board: "mainboard", gmpPct: 126, listingPct: 90 }))).toBe("short");            // the cap is an SME rule
    expect(gCat(pt({ board: "sme", gmpPct: 40, listingPct: 90 }))).toBe("beat");                    // a capped issue with a lower GMP stays "listed higher" (and gets the ring)
    expect(isCap(pt({ board: "sme", listingPct: 90 }))).toBe(true);
    expect(isCap(pt({ board: "sme", listingPct: 91 }))).toBe(false);
  });
  it("tally: counts by category, the median gap and the typical gap", () => {
    const t = gTally([pt({ gmpPct: 10, listingPct: 12 }), pt({ gmpPct: 10, listingPct: 30 }), pt({ gmpPct: 10, listingPct: 0 }), pt({ board: "sme", gmpPct: 120, listingPct: 90 })]);
    expect(t).toMatchObject({ n: 4, band: 1, beat: 1, short: 1, cap: 1 });
    expect(t.gap).toBe(-4);                       // gaps 2, 20, −10, −30 → median of −10 and 2
    expect(t.abs).toBe(15);                       // sizes 2, 10, 20, 30
    expect(median([])).toBeNull();
    expect(share(1, 3)).toBe("33%"); expect(share(0, 0)).toBe("—");
  });
  it("filters: board, year listed, issue size, subscription and the range; a dropdown counts with its own filter left out", () => {
    const e = pt({ board: "sme", listingDate: "2024-06-01", issueSizeCr: 50, subscription: 60, gmpPct: 30 });
    expect(gPass(e, GF0)).toBe(true);
    expect(gPass(e, { ...GF0, board: "mainboard" })).toBe(false);
    expect(gPass(e, { ...GF0, year: "old" })).toBe(true);
    expect(gPass(e, { ...GF0, year: "2025" })).toBe(false);
    expect(gPass(e, { ...GF0, size: "lt100" })).toBe(true);
    expect(gPass(e, { ...GF0, size: "100to1000" })).toBe(false);
    expect(gPass(e, { ...GF0, sub: "50to100" })).toBe(true);
    expect(gPass(e, { ...GF0, sub: "gt100" })).toBe(false);
    expect(gPass(e, { ...GF0, range: "r25" })).toBe(true);
    expect(gPass(e, { ...GF0, range: "r10" })).toBe(false);
    expect(gPass(e, { ...GF0, range: "r10" }, "range")).toBe(true);
  });
});
