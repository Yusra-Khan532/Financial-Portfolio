// @vitest-environment jsdom
// Task #332 (developer file 31): the rules of the six additions and the new layout, one test per rule, including the ones that would have caught the live faults.
import { describe, expect, it, beforeEach } from "vitest";
import rot from "./__fixtures__/rotation-6nov.json";
import type { RotationMap, RotationRow } from "./rotation";
import type { Card } from "./pulsePack";
import {
  READ_SENTENCE, headlineTone, inInside, inResFilter, insideStart, insideTop, mineOf, openTab, pickTwo, playFrames, priceWeak, readTogether, resultsFor, sharesFor, weeksText,
} from "./rotation332";
import { beatOrTrail, gw, yourRotationCards } from "./rotationPack";
import { renderHook } from "@testing-library/react";
import { useShowWords } from "./groupWords";
import { toGroups } from "./rotationWords";

const M = rot as unknown as RotationMap;
const row = (o: Partial<RotationRow>) => ({ name: "Healthcare", slug: "healthcare", industries: [], corner: "ahead_gaining", rank: 2, ranked: 19, tail: [], rank_history: [], ...o }) as unknown as RotationRow;

describe("Price against results: the fixed sentence table", () => {
  it("weak or strong price side, from the box", () => {
    expect([priceWeak("behind_gaining"), priceWeak("behind_slipping"), priceWeak("ahead_gaining"), priceWeak("ahead_slowing")]).toEqual([true, true, false, false]);
  });
  it("every row of the table, word for word", () => {
    expect(READ_SENTENCE[readTogether("behind_slipping", ["Ahead", "Ahead", "In line"])]).toBe("Price is weak while results are ahead of the market.");
    expect(READ_SENTENCE[readTogether("behind_gaining", ["Behind"])]).toBe("Price and results are both behind.");
    expect(READ_SENTENCE[readTogether("ahead_gaining", ["Ahead"])]).toBe("Price and results are both ahead.");
    expect(READ_SENTENCE[readTogether("ahead_slowing", ["Behind", "Behind", "Ahead"])]).toBe("Price is strong while results are behind the market.");
    expect(READ_SENTENCE[readTogether("ahead_gaining", ["Ahead", "In line"])]).toBe("Results are mixed across its industries.");
    expect(READ_SENTENCE[readTogether("behind_slipping", ["Ahead", "Behind", "In line"])]).toBe("Results are mixed across its industries.");
    expect(READ_SENTENCE[readTogether("behind_slipping", ["In line"])]).toBe("Results are in line with the market.");
  });
  it("no sentence suggests an action", () => {
    for (const s of Object.values(READ_SENTENCE)) expect(s).not.toMatch(/\b(buy|sell|hold|reduce|avoid|accumulate|target|best|consider|should)\b/i);
  });
  it("the filters show every matching row", () => {
    expect(inResFilter("all", "mixed", false)).toBe(true);
    expect(inResFilter("mine", "mixed", true) && !inResFilter("mine", "mixed", false)).toBe(true);
    expect(inResFilter("weak_ahead", "weak_ahead", false) && !inResFilter("strong_ahead", "weak_ahead", false)).toBe(true);
  });
});

describe("Price against results: the sector to results-groups join", () => {
  const groups = [{ name: "Finance", withNumbers: 400, vsMarket: "Behind" as const }, { name: "Banks", withNumbers: 40, vsMarket: "In line" as const },
    { name: "Capital Markets", withNumbers: 90, vsMarket: "Ahead" as const }, { name: "Financial Services", withNumbers: 30, vsMarket: "Ahead" as const }, { name: "Oil Gas & Consumable Fuels", withNumbers: 12 }];
  it("Sectors view: its own industries largest first, then 'Other <sector> (N smaller industries together)'", () => {
    const r = row({ name: "Financial Services", industries: ["Finance", "Banks", "Capital Markets", "Insurance", "Financial Technology (Fintech)"] });
    const out = resultsFor(r, groups, true);
    expect(out.map((x) => x.label)).toEqual(["Finance", "Capital Markets", "Banks", "Other Financial Services (2 smaller industries together)"]);
  });
  it("a sector whose industries are all small reads as itself; punctuation does not break the match", () => {
    expect(resultsFor(row({ name: "Oil, Gas & Consumable Fuels", industries: ["Oil", "Petroleum Products"] }), groups, true).map((x) => x.label)).toEqual(["Oil Gas & Consumable Fuels"]);
  });
  it("Industries view: the one matching group", () => {
    expect(resultsFor(row({ name: "Banks" }), groups, false).map((x) => x.label)).toEqual(["Banks"]);
    expect(resultsFor(row({ name: "Telecommunication" }), groups, false)).toEqual([]);
  });
});

describe("the boxes, Today and Your sectors", () => {
  beforeEach(() => localStorage.clear());
  it("box 1 opens on &tab= first, then the member's last tab, tab 1 on a first visit", () => {
    expect(openTab("all", "map", "moves")).toBe("map");
    expect(openTab("all", "nope", "moves")).toBe("moves");
    expect(openTab("all", null, null)).toBe("four");
    expect(openTab("chk", "map", null)).toBe("results");          // &tab= is box 1's only
  });
  it("callouts cut to two: a Warning first, then a Good sign, then the first other", () => {
    const c = (kind: Card["kind"], title: string) => ({ kind, title, text: "" }) as Card;
    expect(pickTwo([c("insight", "a"), c("good", "b"), c("warning", "c")]).map((x) => x.title)).toEqual(["c", "b"]);
    expect(pickTwo([c("insight", "a"), c("watch", "b"), c("good", "d")]).map((x) => x.title)).toEqual(["d", "a"]);
  });
  it("the headline chip is red, amber or green", () => {
    expect(["bad", "watch", "good"]).toContain(headlineTone(M));
  });
  it("a share in both shows once; watchlist shares are marked", () => {
    const ms = { held: new Map([["banks", ["HDFCBANK"]]]), watched: new Map([["banks", ["HDFCBANK", "SBIN"]], ["power", ["NTPC"]]]) };
    expect(sharesFor("both", ms).get("banks")).toEqual([{ sym: "HDFCBANK", watch: false }, { sym: "SBIN", watch: true }]);
    expect(sharesFor("portfolio", ms).has("power")).toBe(false);
    expect(sharesFor("watchlist", ms).get("power")).toEqual([{ sym: "NTPC", watch: true }]);
    expect(mineOf({ held: new Map(), watched: new Map() }).size).toBe(0);          // no shares, no watchlist: nothing gold anywhere
  });
  it("the Good sign counts shares, never money (error 4: it said 'Most of your money' with 2 of 14 shares)", () => {
    const rows = [row({ slug: "a", name: "A", corner: "ahead_gaining" }), row({ slug: "b", name: "B", corner: "behind_slipping" })];
    const held = new Map([["a", ["X", "Y"]], ["b", Array.from({ length: 12 }, (_, i) => `S${i}`)]]);
    const good = yourRotationCards(rows, held, held, new Map()).find((c) => c.kind === "good")!;
    expect(good.text).toContain("2 of your 14 shares are in it.");
    expect(good.text).not.toMatch(/money/);
  });
  it("never 'beat by' with a negative figure (error 5)", () => {
    expect(beatOrTrail(-0.6)).toBe("trailed the average group by 0.6%");
    expect(beatOrTrail(1.25)).toBe("beat the average group by 1.3%");
  });
  it("Sectors view says sectors, never groups; Industries view says groups (three levels)", () => {
    const h = renderHook(() => useShowWords("sectors")); expect([gw(1), gw(19)]).toEqual(["1 sector", "19 sectors"]);
    h.unmount(); expect([gw(1), gw(38)]).toEqual(["1 group", "38 groups"]);
  });
});

describe("Playback, What happened next, Inside a sector, Alert me", () => {
  it("playback: 8 weekly closes, the same weeks as the 8-week paths, the last one the latest close", () => {
    const f = playFrames(M);
    expect(f.length).toBe(8);
    expect(f.at(-1)!.date).toBe(M.date);
    expect(f.map((x) => x.date)).toEqual(M.rows[0].tail.map((p) => p.date));
    const r = M.rows[0], p = r.tail[2];
    expect(f[2].dots[r.slug]).toEqual({ strength: p.strength, change: p.change, corner: p.corner });
  });
  it("'1 week' is singular", () => { expect([weeksText(1), weeksText(5.5), weeksText(null)]).toEqual(["1 week", "5.5 weeks", "–"]); });
  it("Inside: the 12 strongest counted stocks by 6-month return, and the peer counts", () => {
    const st = Array.from({ length: 15 }, (_, i) => ({ symbol: `S${i}`, name: "", return_6m_pct: i === 14 ? null : i, peer_label: i % 3 === 0 ? "Leader" : i % 3 === 1 ? "In line" : "Laggard" }));
    const t = insideTop(st);
    expect(t.top.map((s) => s.symbol)).toEqual(["S13", "S12", "S11", "S10", "S9", "S8", "S7", "S6", "S5", "S4", "S3", "S2"]);
    expect([t.counted, t.leaders, t.inline, t.laggards]).toEqual([14, 5, 5, 4]);
    expect(inInside("leaders", "Leader", null) && !inInside("leaders", "Laggard", null)).toBe(true);
    expect(inInside("prism", null, "Healthy") && inInside("prism", null, "Strong") && !inInside("prism", null, "Average")).toBe(true);
  });
  it("Inside opens on the member's first sector (portfolio, then watchlist), else the first group on the page", () => {
    const rows = [row({ slug: "a" }), row({ slug: "b" }), row({ slug: "c" })];
    expect(insideStart(rows, ["c"], ["b"])).toBe("c");
    expect(insideStart(rows, ["zzz"], ["b"])).toBe("b");
    expect(insideStart(rows, [], [])).toBe("a");
  });
});

describe("Industries view words (three levels)", () => {
  it("the rows are groups; NSE's own industries, one industry and the view's name are kept", () => {
    expect(toGroups("How your industries compare")).toBe("How your groups compare");
    expect(toGroups("Industries can skip a box")).toBe("Groups can skip a box");
    expect(toGroups("a sector group of small industries")).toBe("a sector group of small industries");
    expect(toGroups("All 38 industry groups counted equally, as in the Industries view.")).toBe("All 38 industry groups counted equally, as in the Industries view.");
    expect(toGroups("The industry's stocks")).toBe("The industry's stocks");
  });
});
