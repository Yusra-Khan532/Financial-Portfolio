// Task #408 (the founder's 27 Nov Watchlists pack): the page's rules and words, against the pack's own sentences and its sample list (SBIN and RELIANCE,
// 26 Nov 2026 at 3:28 pm). Needs a look (04), the column sets and sorting (02), Group by, the alerts summary line (05) and the wording bans (01).
import { describe, expect, it } from "vitest";
import {
  ASC_FIRST, COLS, DEFAULT_ALERTS, EMPTY_LIST, LIST_SUB, PAGE_DESC, PLAIN, QUIET_EMPTY, QUIET_NO_TARGET, QUIET_TARGET, alertsLine, band, colsOf, dMon, dayCounts, dist, distText,
  fullText, groupHeads, groupStocks, highNote, lookCards, pc, pendingNote, pricesAt, pts, quietLine, rangeNote, rankMove, rs, since, sortStocks, sortValue, trend, type LookCtx, type WStock,
} from "./watchlistPack";
import { lastResults, yoy } from "./watchlistData";

const base: WStock = {
  s: "X", name: "X Ltd", logo: null, added: null, addedPrice: null, target: null, note: "", nearAlert: true, px: null, chgp: null, h52: null, l52: null, quoteAsOf: null,
  m1: null, m3: null, y1: null, prism: null, prismWord: null, gp: null, val: null, qual: null, risk: null, stS: null, stW: null, ltS: null, ltW: null,
  peer: null, peerRank: null, peerOf: null, peerGroup: null, peerWhy: null, noLabelYet: false, rawLabel: null, pending: null, labelSince: null, leadAsOf: null, labelBefore: null,
  vixName: null, vix52: null, vix13: null, grp1: null, mcap: null, pe: null, pb: null, dy: null, roe: null, revY: null, revCr: null, npY: null, npCr: null, resD: null, resQ: null, filings: [],
  theme: null, themeStatus: null, ind: null, sec: null, scr: [],
};
const SEC = { slug: "", sector: null, pulseCode: null, pulse: null, pulseTone: "", pulseO: null, pulseNote: null, pulseTip: null, breadth: null, n: null, corner: null, cornerTone: "", cornerO: null, cornerNote: null, cornerTip: null, rank: null, of: null, rk1: null, rk4: null, hist: [], s6: null, s1: null };
// the pack's sample list (reference/sample-data.json)
const SBIN: WStock = { ...base, s: "SBIN", name: "State Bank Of India", added: Date.parse("2026-11-23T06:00:00Z"), addedPrice: 1132.65, px: 1136.65, chgp: -0.13, h52: 1234.8, l52: 933.85, quoteAsOf: "2026-11-26T15:28:00+05:30",
  m1: 18.7, m3: 8.6, y1: 20, prism: 60.62, prismWord: "Average", gp: 75.12, val: 49.74, qual: 33.89, risk: 88.75, stS: 27.6, stW: "Uptrend", ltS: 18.5, ltW: "Sideways",
  peer: "in_line", peerRank: 4, peerOf: 9, peerGroup: "PSU bank", rawLabel: "in_line", labelSince: "2026-09-25", leadAsOf: "2026-11-20", vixName: "Nifty PSU Bank", vix52: 1.9, vix13: -3.5,
  mcap: 1049215, pe: 11.62, pb: 1.52, dy: 1.52, roe: 13.05, revY: 10.2, npY: 20, ind: "Banks", sec: { ...SEC, slug: "banks", pulseO: 2, cornerO: 0, rank: 1, of: 37 },
  scr: [{ id: "a", name: "Fresh close above a base", group: "Chart patterns", added_on: "2026-11-20", baseline: true, position: 6, count: 15 },
        { id: "b", name: "Setups with the sector behind them", group: "Sectors", added_on: "2026-11-20", baseline: false, position: 8, count: 125 },
        { id: "c", name: "Growth with a stretched valuation", group: "Prism views", added_on: "2026-11-19", baseline: false, position: 133, count: 327 },
        { id: "d", name: "Low-volatility names", group: "Safety", added_on: "2026-11-11", baseline: true, position: 14, count: 27 }] };
const REL: WStock = { ...base, s: "RELIANCE", name: "Reliance Industries Ltd", added: Date.parse("2026-11-25T06:00:00Z"), addedPrice: 1373.9, px: 1396.2, chgp: 1.62, h52: 1611.2, l52: 1152.3, quoteAsOf: "2026-11-26T15:28:00+05:30",
  m1: 15.3, m3: 4.2, y1: -10.8, prism: 57, prismWord: "Average", gp: 55, val: 40, qual: 72, risk: 80, stS: 39, stW: "Uptrend", ltS: -21, ltW: "Downtrend",
  peer: "laggard", peerRank: 4, peerOf: 6, peerGroup: "Petroleum Products", rawLabel: "in_line", pending: "This week’s reading says In line.", labelSince: "2026-03-13", leadAsOf: "2026-11-20",
  vixName: "Nifty Oil & Gas", vix52: -6.1, vix13: 1.3, mcap: 1889413, pe: 22.6, pb: 1.97, dy: 0.44, roe: 8.7, revY: 28.6, npY: 40.6, ind: "Petroleum Products",
  sec: { ...SEC, slug: "petroleum-products", pulseO: 1, cornerO: 1, rank: 2, of: 37 } };
const CTX: LookCtx = { results: {}, filings: [], moved: [{ slug: "petroleum-products", name: "Petroleum Products", from: "Ahead and gaining", to: "Ahead but slowing" }], rotDate: "2026-11-20", sectors: true, scrAsOf: "2026-11-23", today: "2026-11-26" };
const ADVICE = /\b(buy|sell|hold|recommend\w*|undervalued|overvalued|bullish|bearish|consider|opportunity|watch out|best|thrust)\b/i;

describe("Needs a look (04-needs-a-look.md)", () => {
  it("gives the sample list's three cards, in the pack's order, with the pack's sentences", () => {
    const l = lookCards([SBIN, REL], CTX);
    expect(l.map((x) => [x.s, x.kl, x.t])).toEqual([
      ["SBIN", "New in 2 screens", "Setups with the sector behind them (20 Nov) and Growth with a stretched valuation (19 Nov), in the Advanced screener."],
      ["RELIANCE", "Industry slowing", "Petroleum Products moved from Ahead and gaining to Ahead but slowing in the 20 Nov Sector Rotation."],
      ["RELIANCE", "Peer label may change", "A Laggard now; this week’s reading says In line. It changes if next week’s reading agrees."],
    ]);
  });
  it("a target within 5% adds card 1 first, both ways, and 'At your target' within 0.05%", () => {
    expect(lookCards([{ ...REL, target: 1440 }], CTX)[0]).toMatchObject({ k: "tgt", kl: "Near your target", t: "₹1,396.20 is 3.1% below your target of ₹1,440.00" });
    expect(lookCards([{ ...SBIN, target: 1100 }], CTX)[0].t).toBe("₹1,136.65 is 3.2% above your target of ₹1,100.00");
    expect(lookCards([{ ...SBIN, target: 1136.7 }], CTX)[0].t).toBe("At your target of ₹1,136.70");
    expect(lookCards([{ ...SBIN, target: 1300 }], CTX).some((x) => x.k === "tgt")).toBe(false);   // 14% away
  });
  it("cards 2, 3, 4, 5 and 6 follow their rules", () => {
    const up = lookCards([{ ...base, s: "A", px: 1482.4, chgp: 6.2 }], CTX)[0], dn = lookCards([{ ...base, s: "B", px: 1075.3, chgp: -5.4 }], CTX)[0];
    expect([up.kl, up.k, up.t]).toEqual(["Big move", "up", "Up 6.2% today, to ₹1,482.40."]);
    expect([dn.k, dn.t]).toEqual(["dn", "Down 5.4% today, to ₹1,075.30."]);
    expect(lookCards([{ ...base, s: "C", px: 100, chgp: 4.99 }], CTX)).toEqual([]);
    expect(lookCards([{ ...base, s: "D" }], { ...CTX, results: { D: "2026-12-04" } })[0]).toMatchObject({ kl: "Results soon", t: "Board meeting for results on 4 Dec." });
    const ch = { ...base, s: "E", peer: "in_line" as const, labelBefore: "laggard" as const, labelSince: "2026-11-27", leadAsOf: "2026-11-27" };
    expect(lookCards([ch], { ...CTX, today: "2026-11-30" })[0]).toMatchObject({ kl: "Peer label changed", t: "Now In line, after Laggard, in the 27 Nov weekly check." });
    expect(lookCards([ch], { ...CTX, today: "2026-12-05" })).toEqual([]);                              // only for 7 days after the run
    expect(lookCards([{ ...ch, labelSince: "2026-11-20" }], { ...CTX, today: "2026-11-28" })).toEqual([]);   // not this run's change
    const long = "Receipt of an order worth ₹1,200 crore from a state power utility for the supply of transformers and related equipment over two years";
    expect(lookCards([{ ...base, s: "F" }], { ...CTX, filings: [{ s: "F", kind: "Order win", t: long, d: "2026-11-26" }] })[0].t).toBe(`Order win: ${long.slice(0, 80).trimEnd()}…`);
    expect(lookCards([{ ...base, s: "G", px: 1217.5, h52: 1234.8, l52: 900 }], CTX)[0]).toMatchObject({ kl: "Near 52-week high", t: "1.4% below its 52-week high of ₹1,234.80." });
    expect(lookCards([{ ...base, s: "H", px: 942.25, h52: 1234.8, l52: 933.85 }], CTX)[0]).toMatchObject({ kl: "Near 52-week low", t: "0.9% above its 52-week low of ₹933.85." });
  });
  it("names three or more new screens as 'first, second and n more', and Industry gaining when the corner moves up", () => {
    const sc = (n: string, d: string) => ({ id: n, name: n, group: "G", added_on: d, baseline: false, position: 1, count: 2 });
    const l = lookCards([{ ...base, s: "I", scr: [sc("A", "2026-11-21"), sc("B", "2026-11-22"), sc("C", "2026-11-20")] }], CTX)[0];
    expect([l.kl, l.t]).toEqual(["New in 3 screens", "B (22 Nov), A (21 Nov) and 1 more, in the Advanced screener."]);
    const g = lookCards([{ ...base, s: "J", sec: { ...SEC, slug: "banks" } }], { ...CTX, moved: [{ slug: "banks", name: "Banks", from: "Behind but gaining", to: "Ahead and gaining" }] })[0];
    expect([g.kl, g.k]).toEqual(["Industry gaining", "gain"]);
    expect(lookCards([{ ...base, s: "J", sec: { ...SEC, slug: "banks" } }], { ...CTX, sectors: false, moved: [{ slug: "banks", name: "Banks", from: "Behind but gaining", to: "Ahead and gaining" }] })).toEqual([]);
  });
  it("orders by card number, then by the stock's place in the list; a stock can have more than one card", () => {
    const l = lookCards([{ ...SBIN, target: 1150 }, { ...REL, target: 1400 }], CTX);
    expect(l.map((x) => x.s + ":" + x.k)).toEqual(["SBIN:tgt", "RELIANCE:tgt", "SBIN:scr", "RELIANCE:slow", "RELIANCE:pend"]);
  });
  it("the closing line follows the targets and the empty list", () => {
    expect(quietLine([SBIN, REL], lookCards([SBIN, REL], CTX))).toBe(QUIET_NO_TARGET);
    expect(quietLine([{ ...SBIN, target: 1500 }, REL], [])).toBe(QUIET_TARGET);
    expect(quietLine([], [])).toBe(QUIET_EMPTY);
    expect(QUIET_TARGET).toBe("Nothing else today: no results due this week, no move of 5% or more, and no new filing of Discover’s eight kinds.");
  });
});

describe("Column sets, figures and sorting (02-columns.md)", () => {
  it("each set starts with Company and ends with the bell and Details", () => {
    const heads = (v: Parameters<typeof colsOf>[0]) => colsOf(v).map((c) => c.t);
    expect(heads("price")).toEqual(["Company", "Price · today", "Since added", "Your target", "1 month", "52-week range", "Trend", ""]);
    expect(heads("prism")).toEqual(["Company", "Prism", "G&P", "Val.", "Qual.", "Risk", "Short term", "Long term", "Vs its peers", ""]);
    expect(heads("biz")).toEqual(["Company", "Size", "P/E", "P/B", "Div. yield", "ROE", "Revenue", "Net profit", "Results", "Theme", ""]);
    expect(heads("sec")).toEqual(["Company", "Industry", "Reading", "Where it stands", "Rank", "Stock vs index", ""]);
    expect(groupHeads("September 2026").rq[1]).toBe("Return on equity over the last 12 months; revenue and net profit for the quarter to September 2026 against the same quarter a year earlier.");
    expect(groupHeads(null).fs[0]).toBe("FinLit Prism · Fundamental score");
  });
  it("works out since added, the distance to the target, the 52-week note and the trend phrase as the pack does", () => {
    expect(pc(since(SBIN)!)).toBe("+0.35%");
    expect(pc(since(REL)!)).toBe("+1.62%");
    expect(distText(dist({ px: 1136.65, target: 1180 }))).toEqual({ t: "3.8% below target", near: true });
    expect(distText(dist({ px: 1136.65, target: 1300 }))).toEqual({ t: "14.4% below target", near: false });
    expect(distText(dist({ px: 1136.65, target: 1136.7 }))).toEqual({ t: "At your target", near: true });
    expect(rangeNote(1136.65, 1234.8)).toBe("7.9% below high");
    expect(rangeNote(1234, 1234.8)).toBe("At its 52-week high");
    expect(trend(27.6, 18.5)).toEqual({ phrase: "Flat, turning up", st: "↗", lt: "→" });
    expect(trend(39, -21)).toEqual({ phrase: "Falling but bouncing", st: "↗", lt: "↘" });
    expect([band(75), band(61), band(33)]).toEqual(["hi", "mid", "lo"]);
    expect([pts(1.9), pts(-6.1), pc(-0.13), rs(1049215), highNote(-3.4), highNote(0), rankMove(2, "this week"), rankMove(-3, "in 4 weeks")]).toEqual(
      ["+1.9 pts", "−6.1 pts", "−0.13%", "₹10,49,215.00", "3.4% below 1-year high", "At its 1-year high", "Up 2 this week", "Down 3 in 4 weeks"]);
    expect([dMon("2026-12-04"), pricesAt("2026-11-26T15:28:00+05:30")]).toEqual(["4 Dec", "3:28 pm, 26 Nov"]);
  });
  it("sorts every arrowed column both ways, the pack's first direction, missing figures last", () => {
    const L = [SBIN, REL], order = (k: string, d: 1 | -1) => sortStocks(L, k, d).map((s) => s.s);
    const first = (k: string) => (ASC_FIRST.has(k) ? 1 : -1);
    const expectFirst: Record<string, string[]> = { chgp: ["RELIANCE", "SBIN"], since: ["RELIANCE", "SBIN"], m1: ["SBIN", "RELIANCE"], s: ["RELIANCE", "SBIN"], prism: ["SBIN", "RELIANCE"],
      gp: ["SBIN", "RELIANCE"], qual: ["RELIANCE", "SBIN"], stS: ["RELIANCE", "SBIN"], ltS: ["SBIN", "RELIANCE"], pe: ["RELIANCE", "SBIN"], roe: ["SBIN", "RELIANCE"], revY: ["RELIANCE", "SBIN"],
      mcap: ["RELIANCE", "SBIN"], rotRank: ["SBIN", "RELIANCE"], vix: ["SBIN", "RELIANCE"], peerRank: ["SBIN", "RELIANCE"], pulseO: ["RELIANCE", "SBIN"], cornerO: ["SBIN", "RELIANCE"] };
    for (const [k, want] of Object.entries(expectFirst)) {
      expect(order(k, first(k)), k).toEqual(want);
      expect(order(k, (-first(k)) as 1 | -1), k).toEqual([...want].reverse());
    }
    const noTarget = sortStocks([{ ...SBIN }, { ...REL, target: 1440 }], "dist", 1).map((s) => s.s);
    expect(noTarget).toEqual(["RELIANCE", "SBIN"]);                                   // nearest to target first; no target last
    expect(sortStocks([{ ...SBIN }, { ...REL, target: 1440 }], "dist", -1).map((s) => s.s)).toEqual(["RELIANCE", "SBIN"]);   // and still last the other way
    expect(COLS.filter((c) => c.s).every((c) => sortValue(SBIN, c.s!) !== undefined)).toBe(true);
  });
  it("groups Against peers, by Industry or by Size, with the bands' names", () => {
    expect(groupStocks([SBIN, REL], "peers").map((g) => [g.label, g.tone, g.stocks.length])).toEqual([["In line", "mid", 1], ["Laggards", "bad", 1]]);
    expect(groupStocks([SBIN, REL], "industry").map((g) => g.label)).toEqual(["Banks", "Petroleum Products"]);
    expect(groupStocks([SBIN, REL], "size").map((g) => g.label)).toEqual(["Large companies"]);
    expect(groupStocks([SBIN, { ...base, s: "Z" }], "peers").map((g) => g.label)).toEqual(["In line", "No peer label yet"]);
  });
  it("counts the day's moves and names the weekday of the last session", () => {
    expect(dayCounts([SBIN, REL])).toEqual({ up: 1, down: 1, flat: 0, day: "Thursday" });
  });
  it("reads the latest quarter against the same quarter a year earlier, and the latest results filing", () => {
    const pl = { periods: ["Jun 2025", "Sep 2025", "Dec 2025", "Mar 2026", "Jun 2026", "Sep 2026"], rows: { revenue: [248660, 258898, 269496, 298621, 311850, 332861] } };
    const r = yoy(pl, "revenue");
    expect([pc(r.y!, 1), r.cr, r.period]).toEqual(["+28.6%", 332861, "Sep 2026"]);
    expect(yoy({ periods: ["Sep 2026"], rows: { revenue: [5] } }, "revenue").y).toBeNull();
    const ev = { announcements: [
      { date: "2026-10-31", category: "Analysts/Institutional Investor Meet/Con. Call Updates", description: "Audio recording of the discussion on the Unaudited Financial Results" },
      { date: "2026-10-30", category: "Press Release", description: "In continuation of our letter on the Unaudited Financial Results for the quarter ended September 30, 2026" },
      { date: "2026-10-20", category: "Board Meeting Intimation", description: "Intimation of board meeting to consider financial results" }] };
    expect(lastResults(ev, "Sep 2026")).toEqual({ d: "2026-10-30", q: "Sep quarter" });
  });
});

describe("Alerts for this list (05-alerts.md) and the page's words", () => {
  it("the summary line always shows the current choice", () => {
    expect(alertsLine(DEFAULT_ALERTS)).toBe("Target: on · Peer labels: any change · Filings: order win, capacity");
    expect(alertsLine({ target: true, peer: "laggard", filings: ["order", "capacity", "rating"] })).toBe("Target: on · Peer labels: only to laggard · Filings: order win, capacity, credit rating");
    expect(alertsLine({ target: false, peer: "off", filings: ["order", "capacity", "rating", "legal"] })).toBe("Target: off · Peer labels: off · Filings: 4 kinds");
    expect(alertsLine({ target: true, peer: "leader", filings: [] })).toBe("Target: on · Peer labels: only to leader · Filings: off");
  });
  it("the list-is-full line uses the plan's real numbers", () => {
    expect(fullText(30, "silver")).toBe("This list is full: 30 stocks on Silver");
    expect(fullText(1000, "gold")).toBe("This list is full: 1,000 stocks on Gold");
  });
  it("never advises, never says tag, and uses curly apostrophes and true minus signs", () => {
    const all = [PAGE_DESC, LIST_SUB, EMPTY_LIST, QUIET_TARGET, QUIET_NO_TARGET, QUIET_EMPTY, pendingNote("in_line"), ...lookCards([SBIN, REL], CTX).map((x) => x.t + " " + x.kl),
      ...Object.values(groupHeads("September 2026")).flat()].join(" ");
    expect(all).not.toMatch(ADVICE);
    expect(PLAIN.replace("FinLit does not tell you when to buy or sell", "")).not.toMatch(ADVICE);
    expect(all).not.toMatch(/\btags?\b/i);
    expect(all).not.toMatch(/\w'\w/);
    expect(all).not.toMatch(/(?<![\w-])-\d/);
  });
});
