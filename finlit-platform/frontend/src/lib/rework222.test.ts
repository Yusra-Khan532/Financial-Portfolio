// Task #222 rework (19 Nov pack, finlit-company-report-update-19nov): the rules of 17 Dividends (D1, W1), 18 News and filings (S1), 14's short list
// (B2) and 02's heading (S2), against the pack's own TD Power events feed (reference/events-TDPOWERSYS-19nov.json) and its after-figures.
import { describe, expect, it } from "vitest";
import raw from "./__fixtures__/events-TDPOWERSYS-19nov.json";
import type { Events } from "./api";
import { divPlain, divView } from "./dividends17";
import { cleanTitle, filingsPlain, groupOf, highlights, sortFilings } from "./filings";
import { median, shortList } from "./standsList";
import { macroHeading } from "../stock/MacroOutlook";

// the feed as the fixed API sends it (D1: the 18 Nov interim keeps its ₹0.65; FY27 0.65; yield 0.19)
const fixed = (): Events => {
  const e = JSON.parse(JSON.stringify(raw)) as Events;
  e.actions = e.actions.map((a) => (a.date === "2026-11-18" ? { ...a, adjustedAmount: 0.65 } : a));
  e.dividendsByFY.dps = e.dividendsByFY.dps.map((v, i) => (e.dividendsByFY.periods[i] === "FY27" ? 0.65 : v));
  e.dividendYieldTtm = 0.19;
  return e;
};
const TODAY = new Date("2026-11-19T12:00:00+05:30");
const n = (x: number, dp: number) => x.toFixed(dp);

describe("17 Dividends (D1, W1)", () => {
  it("the pack's after-figures: +33% a year from FY21 to FY26, 7 of 7, FY27 so far, the average of ended years, ₹1.20 in the last 12 months", () => {
    const d = divView(fixed(), TODAY);
    expect(Math.round(d.cagr!)).toBe(33);
    expect([d.first!.p, d.first!.v, d.last!.p, d.last!.v]).toEqual(["FY21", 0.25, "FY26", 1.05]);
    expect(d.partial).toEqual({ p: "FY27", v: 0.65, part: true });
    expect([d.streak, d.total]).toEqual([7, 7]);
    expect(d.avg).toBeCloseTo(3.325 / 6, 6);                    // FY21-FY26 only
    expect(d.ttm).toBe(1.2); expect(d.ttmAdjusted).toBe(true); expect(d.ttmSplit).toBe(true);
    expect(Math.round(100 * d.ttm)).toBe(120);                  // 100 shares: ₹120, ≈ ₹10 a month
    expect((d.ttm / 633.25) * 100).toBeCloseTo(0.19, 2);
  });
  it("the simple-words line has no '0 years running' and no advice-like sentence (W1)", () => {
    const e = fixed(), d = divView(e, TODAY);
    const s = divPlain(e.dividendYieldTtm!, d, 14, n);
    expect(s).toBe("For every ₹100 invested at today's price, this company pays about ₹0.19 a year. It has paid a dividend in each of the last 7 financial years. It keeps about 86% of its profit to grow the business.");
    expect(s).not.toMatch(/growth rather than income|years running/);
  });
  it("a year in progress with nothing declared yet is not counted and never breaks the run", () => {
    const e = fixed(); e.dividendsByFY.dps = e.dividendsByFY.dps.map((v, i) => (e.dividendsByFY.periods[i] === "FY27" ? 0 : v));
    const d = divView(e, TODAY);
    expect([d.streak, d.total]).toEqual([6, 6]);
  });
  it("a company with no year in progress keeps its figures (the ★ check on a stock with no recent split)", () => {
    const e: Events = { ...fixed(), dividendsByFY: { periods: ["FY24", "FY25", "FY26"], dps: [5, 5.5, 6], dpsUnadjusted: [5, 5.5, 6], basis: "x", partial: [] } };
    const d = divView(e, TODAY);
    expect([d.partial, d.first!.v, d.last!.v, d.streak, d.total, d.rising]).toEqual([null, 5, 6, 3, 3, 2]);
  });
});

describe("18 News and filings (S1)", () => {
  const fs = sortFilings(raw.announcements as Events["announcements"]);
  it("groups the 25 filings as the pack counts them: 24 shown, 1 routine", () => {
    const c = (g: string) => fs.filter((f) => f.group === g && !f.routine).length;
    expect([c("res"), c("div"), c("inv"), c("ord"), c("shr"), fs.filter((f) => f.routine).length]).toEqual([2, 4, 7, 2, 9, 1]);
    expect(fs.find((f) => f.routine)!.date).toBe("2026-10-08");
    expect(groupOf({ category: "General Updates", description: "about Communication To Shareholders Regarding TDS" }).group).toBe("div");
  });
  it("cleans the titles", () => {
    expect(cleanTitle("TD Power Systems Limited has informed the Exchange regarding allotment of 7741935  securities pursuant to Qualified Institution Placement")).toBe("Allotment of 77,41,935 securities pursuant to Qualified Institution Placement");
    expect(cleanTitle("TD Power Systems Limited has submitted to the Exchange, the financial results for the period ended September 30, 2026.")).toBe("Financial results for the period ended September 30, 2026.");
    expect(cleanTitle("TD Power Systems Limited has informed the Exchange regarding 'Receipt of listing approval for 12,50,000 equity shares'.")).toBe("Receipt of listing approval for 12,50,000 equity shares.");
    expect(fs.every((f) => !/has (informed|submitted)/.test(f.title))).toBe(true);
  });
  it("the latest in each group: results, the dividend (titled from actions), shares, orders", () => {
    expect(highlights(fs, raw.actions as Events["actions"]).map((h) => [h.group, h.title, h.filing.date])).toEqual([
      ["res", "Financial results for the period ended September 30, 2026.", "2026-11-12"],
      ["div", "Interim dividend · ₹0.65 per share · record date 18 Nov 2026", "2026-11-12"],
      ["shr", "Allotment of 77,41,935 securities pursuant to Qualified Institution Placement at its meeting…", "2026-10-12"],
      ["ord", "Bagging/Receiving of orders/contracts", "2026-10-01"]]);
  });
  it("In simple words", () => {
    expect(filingsPlain("TD Power Systems", fs, raw.actions as Events["actions"])).toBe("TD Power Systems has made 24 filings with NSE since 11 Aug 2026, the latest on 16 Nov. Its results for the period ended 30 Sep 2026 were filed on 12 Nov, with an interim dividend of ₹0.65 a share.");
  });
});

describe("14 Inside its industry (B2) and 02's heading (S2)", () => {
  it("TD Power, 18th of 50: ranks 1-5, 10 more, 16-20, 25 more, 46-50; 15 or fewer show all; ends merge", () => {
    const view = (it: ReturnType<typeof shortList>) => it.map((x) => (x.kind === "gap" ? `+${x.n}` : String(x.i + 1))).join(" ");
    expect(view(shortList(50, 17))).toBe("1 2 3 4 5 +10 16 17 18 19 20 +25 46 47 48 49 50");
    expect(shortList(15, 3).length).toBe(15);
    expect(view(shortList(30, 2))).toBe("1 2 3 4 5 +20 26 27 28 29 30");
    expect(shortList(50, 17, true).length).toBe(50);
    expect(median([3, 1, 2])).toBe(2); expect(median([4, 1, 2, 3])).toBe(2.5);
  });
  it("02: one sector group, several, or not known yet", () => {
    expect(macroHeading({ mapping: { sectorName: "Capital goods", basis: "primary" } })).toEqual({ title: "Is the economy helping its sector?", sub: "How interest rates, credit, commodity prices and growth are affecting Capital goods, this company's sector group." });
    expect(macroHeading({ mapping: { sectorName: "x", basis: "revenue_weighted" }, segments: [{ name: "Power" }, { name: "Oil and gas" }, { name: "Chemicals" }] }))
      .toEqual({ title: "Is the economy helping its sectors?", sub: "How interest rates, credit, commodity prices and growth are affecting its sectors: Power, Oil and gas and Chemicals." });
    expect(macroHeading(null).title).toBe("Is the economy helping its sector?");
  });
});
