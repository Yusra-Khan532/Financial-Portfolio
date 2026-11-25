import { describe, expect, it } from "vitest";
import { DEFAULTS, PRESETS, apiParams, chipsFor, figureOf, isDefault, listPath, migrateSavedQuery, parseQuery, presetOn, queryToParams, statusSplit, withRange, type ScreenRow } from "./mfScreen";
import { NUM, unitText, rangeText, NUM_BY } from "./mfScreenDefs";

const P = (s: string) => parseQuery(new URLSearchParams(s));

describe("query round trip", () => {
  it("task #369: a fresh page preselects nothing and asks the server for every scheme (it asked for Direct, Growth, still publishing: 1,719 funds)", () => {
    const q = P("");
    expect(isDefault(q)).toBe(true);
    expect(queryToParams(q).toString()).toBe("");
    expect(q).toMatchObject({ plans: [], options: [], inst: [], status: "both" });
    expect(chipsFor(q)).toEqual([]);
    const api = apiParams(q);
    expect(api.getAll("plans")).toEqual([]);
    expect(api.getAll("options")).toEqual([]);
    expect(api.get("option")).toBe("All");    // the server alone would answer Growth options only
    expect(api.get("status")).toBe("both");   // the server alone would answer schemes still publishing only
  });
  it("keeps what differs and drops unknown fields and bad numbers", () => {
    const q = P("rng=ter:0:1&rng=bogus:1:2&rng=r3y:x:y&cap=mid&plans=Direct,Regular&sort=ter&dir=asc&page=3&status=nonsense");
    expect(q.rng).toEqual({ ter: ["0", "1"] });
    expect(q.cap).toEqual(["mid"]);
    expect(q.plans).toEqual(["Direct", "Regular"]);
    expect(q.status).toBe("both");
    expect(q.page).toBe(3);
    const back = P(queryToParams(q).toString());
    expect(back).toEqual(q);
    expect(P("status=active&options=Growth")).toMatchObject({ status: "active", options: ["Growth"] });
    expect(P(queryToParams(P("status=stopped")).toString()).status).toBe("stopped");
  });
  it("all options is expressed to the server as option=All, and kept out of the address", () => {
    for (const s of ["options=", "option=All", ""]) {
      const q = P(s);
      expect(q.options).toEqual([]);
      expect(apiParams(q).get("option")).toBe("All");
      expect(queryToParams(q).toString()).toBe("");
    }
  });
  it("a chosen plan, option or status is a removable chip that goes back to none", () => {
    const q = P("plans=Direct&options=Growth&status=active");
    expect(chipsFor(q).map((c) => c.label)).toEqual(["Plan: Direct", "Option: Growth", "Still publishing"]);
    let r = q; for (const c of chipsFor(q)) r = c.clear(r);
    expect(isDefault(r)).toBe(true);
  });
  it("the count line splits every scheme into still publishing and stopped, only when the two add up to the total", () => {
    expect(statusSplit(P(""), { active: 8345, stopped: 5660 }, 14005)).toBe("8,345 still publishing a NAV, 5,660 stopped");
    expect(statusSplit(P(""), { active: 8345, stopped: 5660 }, 1719)).toBeNull();   // an answer for another query
    expect(statusSplit(P("status=active"), { active: 8345, stopped: 0 }, 8345)).toBeNull();
  });
  it("a screen saved before task #369 keeps the old defaults it left out, so it opens the same funds", () => {
    expect(P(migrateSavedQuery("cap=mid"))).toMatchObject({ cap: ["mid"], plans: ["Direct"], options: ["Growth"], status: "active" });
    expect(P(migrateSavedQuery("plans=&options=&status=both"))).toMatchObject({ plans: [], options: [], status: "both" });
    expect(P(migrateSavedQuery("plans=Regular&option=All&status=stopped"))).toMatchObject({ plans: ["Regular"], options: [], status: "stopped" });
  });
  it("no-data keeps only fields that have a range", () => {
    expect(P("nd=ter&rng=r3y:5:").nd).toEqual([]);
    expect(apiParams(P("nd=r3y&rng=r3y:5:")).getAll("nd")).toEqual(["r3y"]);
  });
  it("fund house names are not split on commas", () => {
    expect(P("amcs=A, B Mutual Fund").amcs).toEqual(["A, B Mutual Fund"]);
  });
  it("list path asks for the screener figures", () => {
    expect(listPath(P(""))).toContain("extra=true");
  });
});

describe("ranges and chips", () => {
  it("withRange sets and clears, and clearing drops the no-data flag", () => {
    let q = withRange(DEFAULTS, "ter", "0", "1");
    q = { ...q, nd: ["ter"] };
    expect(chipsFor(q).some((c) => c.label.includes("Expense ratio"))).toBe(true);
    q = withRange(q, "ter", "", "");
    expect(q.rng).toEqual({}); expect(q.nd).toEqual([]);
  });
  it("every active filter is a removable chip", () => {
    const q = P("subs=mid-cap&tags=defence&tick=noneg36&exit=none&rng=aum:500:&holds=reliance");
    const chips = chipsFor(q);
    expect(chips.length).toBe(6);
    for (const c of chips) expect(isDefault(c.clear(q)) || chipsFor(c.clear(q)).length === 5).toBe(true);
  });
  it("text of a range", () => {
    expect(rangeText(NUM_BY.r3y, 12, null)).toBe("+12.0% or more");
    expect(unitText(NUM_BY.aum, 2000)).toBe("₹2,000 Cr");
    expect(rangeText(NUM_BY.ter, null, 1)).toBe("up to 1.00%");
  });
  it("every numeric field has a label, a unit and sorted presets", () => {
    for (const n of NUM) { expect(n.label.length).toBeGreaterThanOrEqual(3); for (const p of n.presets) if (p.lo != null && p.hi != null) expect(p.lo).toBeLessThan(p.hi); }
  });
});

describe("preset screens", () => {
  it("each working preset turns on, and editing it turns it off", () => {
    for (const p of PRESETS.filter((x) => !x.off)) {
      const q = p.set(DEFAULTS);
      expect(presetOn(q, p), p.id).toBe(true);
      expect(presetOn({ ...q, family: true }, p), p.id).toBe(false);
    }
  });
  it("task #350: the score preset works now (Gold): total 65 or more and expense ratio at or below the category median", () => {
    const p = PRESETS.find((x) => x.id === "score-cost")!;
    expect(p.off).toBeFalsy(); expect(p.gold).toBe(true); expect(presetOn(DEFAULTS, p)).toBe(false);
    const q = p.set(DEFAULTS);
    expect(q.sc).toEqual({ total: ["65", ""] }); expect(q.rng.ter_rel).toEqual(["", "1"]);
    expect(queryToParams(q).getAll("sc")).toEqual(["total:65:"]);
  });
  it("preset names never recommend", () => {
    const words = /\b(buy|sell|hold|reduce|avoid|accumulate|target|best|top pick)\b/i;
    for (const p of PRESETS) { expect(p.label).not.toMatch(words); expect(p.say).not.toMatch(words); }
  });
});

describe("calendar years, biggest monthly gain, downside deviation, volatility against the category", () => {
  it("each has a filter definition with words that describe, never advise", () => {
    const words = /\b(buy|sell|hold|reduce|avoid|accumulate|target|best|top pick)\b/i;
    for (const k of ["cy1", "cy2", "cy3", "up_m", "down_dev", "vol_rel"]) {
      const d = NUM_BY[k];
      expect(d, k).toBeTruthy();
      expect(d.label + " " + (d.hint ?? "")).not.toMatch(words);
    }
  });
  it("a row's value is read from the screener figures, and a missing one stays missing", () => {
    const x = { risk: { upMonth: 6.2, downDev: 4.1, volRel: 0.93 }, calYears: { "1": 14.5, "2": -3.2, "3": null } };
    const row = { x } as unknown as ScreenRow;
    expect(figureOf(row, "cy1")).toBe(14.5); expect(figureOf(row, "cy2")).toBe(-3.2); expect(figureOf(row, "cy3")).toBeNull();
    expect(figureOf(row, "up_m")).toBe(6.2); expect(figureOf(row, "down_dev")).toBe(4.1); expect(figureOf(row, "vol_rel")).toBe(0.93);
    expect(figureOf({ x: { risk: {} } } as unknown as ScreenRow, "cy1")).toBeNull();
  });
});
