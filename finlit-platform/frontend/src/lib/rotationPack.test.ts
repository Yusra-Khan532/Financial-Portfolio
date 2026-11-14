// The Sector Rotation pack's sentences and tables (docs/design/finlit-final-pages/08 and 09) worked out from the 6 Nov 2026 weekly close: each expectation is the pack's own text.
import { describe, expect, it } from "vitest";
import rot from "./__fixtures__/rotation-6nov.json";
import board from "./__fixtures__/pulse-board-6nov.json";
import type { RotationMap } from "./rotation";
import type { Board, GroupRow } from "./sectors";
import { short } from "./pulsePack";
import {
  aheadCards, boxCounts, breadthWord, byBox, changeMeaning, climbers26, fullCards, mapCards, mayMoveMeaning, mayMoveRows, movedRows, nextBox, pulseAgrees, rankMoveCards, rotationHeadline,
  rotationTodayCards, rowSummary, sixMonthRankCards, turned, twelveWeekCards, yourRotationCards,
} from "./rotationPack";

const M = rot as unknown as RotationMap;
const B = board as unknown as Board;
const pulse = new Map<string, GroupRow>(B.rows.map((g) => [g.slug, g]));
const row = (n: string) => M.rows.find((r) => short(r.name) === n)!;
// The pack's sample portfolio: 14 shares in 9 industries (Banks among them).
const MINE = ["pharmaceuticals-biotechnology", "petroleum-products", "aerospace-defense", "media-entertainment-publication", "banks", "industrial-manufacturing", "industrial-products", "consumer-durables", "it-software"];
const mine = new Set(MINE.filter((s) => M.rows.some((r) => r.slug === s)));

describe("Today in one minute", () => {
  it("counts the boxes now and last week", () => {
    const c = Object.fromEntries(boxCounts(M).map((x) => [x.box, [x.now, x.last]]));
    expect(c).toEqual({ ahead_gaining: [10, 10], ahead_slowing: [10, 10], behind_gaining: [6, 7], behind_slipping: [12, 11] });
  });
  it("writes the headline and the line under it", () => {
    const h = rotationHeadline(M, mine);
    expect(h.lead).toBe("Leadership is shifting.");
    expect(h.rest).toBe(" Automobiles jumped into the top box this week; Banks and Finance may start gaining next week.");
    expect(h.line).toBe("8 industries changed box this week: 3 moved to a better box, 5 to a weaker one. 7 more may change next week.");
  });
  it("has the pack's four cards", () => {
    const c = rotationTodayCards(M, mine, pulse);
    expect(c.map((x) => x.title)).toEqual(["Automobiles made the biggest jump", "The leaders are steady", "7 industries may change box next week", "Electrical Equipment is sliding fast"]);
    expect(c[0].text).toBe("From Behind and slipping to Ahead and gaining in one week, and up 23 places in 4 weeks to rank 4. It beat the average industry by +10.8% last month.");
    expect(c[1].text).toBe("Pharma & Biotech, Petroleum Products and Aerospace & Defense take the top 3 places. Pharma & Biotech has stayed in the top 8 for all of the last 26 weeks.");
    expect(c[2].text).toBe("Banks, Finance and Realty are among them, all moving towards gaining. It fits what Sector Pulse shows: their stocks have started rising.");
    expect(c[3].text).toBe("Down 21 places in 4 weeks to rank 32. IT - Services and Chemicals also fell more than 15 places.");
  });
});

describe("Your industries", () => {
  it("five are ahead and gaining; Banks may jump", () => {
    const rows = M.rows.filter((r) => mine.has(r.slug));
    const c = yourRotationCards(rows, new Map(), new Map([["banks", ["YESBANK"]]]), pulse);
    expect(c[0].title).toBe("5 of your 9 industries are ahead and gaining");
    expect(c[1].title).toBe("Banks is behind, but may jump next week");
    expect(c[1].text).toBe("YESBANK's industry is in Behind and slipping, yet its newest reading points to Ahead and gaining. Sector Pulse shows bank stocks rising too.");
  });
});

describe("Changed box this week and May change box next week", () => {
  it("lists the 8 moves by rank with the pack's meaning and Sector Pulse's answer", () => {
    const mv = movedRows(M);
    expect(mv.map((x) => short(x.r.name))).toEqual(["Pharma & Biotech", "Automobiles", "Commercial Services", "Agri & Construction Vehicles", "Oil, Gas & Fuels", "Beverages", "Ferrous Metals", "Power"]);
    const p = mv[0];
    expect(changeMeaning(p.from, p.to, p.r)).toEqual({ kind: "good", lead: "Lead widening again.", text: "The pause is over: it beat the average again lately (+1.2% vs average), on top of a longer-run lead (+18.4% vs average)." });
    expect(changeMeaning(mv[1].from, mv[1].to, mv[1].r).lead).toBe("Turnaround.");
    expect(changeMeaning(mv[4].from, mv[4].to, mv[4].r).text).toBe("Its longer-run lead is gone (−1.5% vs average) and it keeps trailing lately (−3.1% vs average).");
    expect(changeMeaning(mv[7].from, mv[7].to, mv[7].r).text).toBe("It beat the average lately (+0.2% vs average) but is still behind over the longer run (−18.3% vs average). Until that turns, treat it as a bounce.");
    const agree = mv.map((x) => { const a = pulseAgrees(x.from, x.to, pulse.get(x.r.slug)); return a && `${a.word}: ${a.why}`; });
    expect(agree).toEqual(["Not yet: its stocks are still sold off", "Agrees: its stocks just bounced", "Agrees: its stocks are not rising together", "Agrees: its stocks are not rising together",
      "Agrees: its stocks are not rising together", "Agrees: its stocks are not rising together", "Mixed: its stocks just bounced", "Agrees: its stocks just bounced"]);
  });
  it("finds the 7 newest readings in another box", () => {
    const mm = mayMoveRows(M);
    expect(mm.map((x) => `${short(x.r.name)}>${x.to}`)).toEqual(["Petroleum Products>ahead_slowing", "Auto Components>ahead_gaining", "Banks>ahead_gaining", "Healthcare Services>ahead_gaining", "Realty>behind_gaining", "Food Products>behind_gaining", "Finance>behind_gaining"]);
    expect(mayMoveMeaning(mm[2].from, mm[2].to).lead).toBe("If it moves: it would jump from the weakest box to the strongest.");
    expect(mm.map((x) => pulseAgrees(x.from, x.to, pulse.get(x.r.slug))?.word)).toEqual(["Mixed", "Agrees", "Partly", "Agrees", "Not yet", "Agrees", "Agrees"]);
    expect(nextBox(row("Oil"))).toBeNull();
  });
});

describe("The map, Who is ahead, rank moves", () => {
  it("map cards", () => {
    const c = mapCards(M);
    expect(c[0]).toEqual({ kind: "good", title: "Pharma & Biotech is furthest ahead", text: "+18.4% against the average over the longer run, and still gaining. The clearest leader on the map." });
    expect(c[1].title).toBe("Automobiles took the steepest path");
    expect(c[1].text).toBe("Its 8-week path climbs from the bottom-left box to the top-right one. Turn on the paths to see it.");
  });
  it("who is ahead: 8 leaders slipped, 6 laggards gained, the biggest move", () => {
    expect(M.rows.filter(turned).length).toBe(14);
    expect(aheadCards(M).map((c) => c.title)).toEqual(["8 leaders slipped last month", "6 laggards gained last month", "Biggest move last month: Automobiles"]);
    expect(aheadCards(M)[2].text).toBe("+10.8 points against the average industry; the weakest was Industrial Mfg at −7.7.");
  });
  it("rank moves in 4 weeks", () => {
    const c = rankMoveCards(M);
    expect(c[0].text).toBe("A month ago Cement was 37th, Realty 33rd, Automobiles 27th and Telecommunication 24th. Money is moving into industries that had been left behind.");
    expect(c[1].text).toBe("A month ago Chemicals was 5th, IT - Services 8th and Electrical Equipment 11th. All three are now in the bottom half.");
  });
});

describe("Full table (pack 09)", () => {
  it("three cards", () => {
    const c = fullCards(M);
    expect(c[0]).toEqual({ kind: "good", title: "Most leaders are broad", text: "In 6 of the 10 industries ahead and gaining, most stocks are taking part. A lead that many stocks share is sturdier." });
    expect(c[1].text.startsWith("Transport Services, Consumer Durables: ahead and gaining")).toBe(true);
    expect(c[2].text).toBe("Construction and Fertilizers & Agrochem have been behind and slipping for 16 and 26 weeks. A long stay shows a steady trend, not a quick bounce.");
  });
  it("groups by box, strongest rank first, Oil last in its box", () => {
    const g = byBox(M.rows);
    expect(g.map((x) => [x.box, x.rows.length])).toEqual([["ahead_gaining", 10], ["ahead_slowing", 10], ["behind_gaining", 6], ["behind_slipping", 12]]);
    expect(short(g[1].rows[9].name)).toBe("Oil");
    expect(breadthWord(row("Pharma & Biotech"))).toEqual({ w: "Most", pct: 51 });
    expect(breadthWord(row("Textiles & Apparels"))).toEqual({ w: "Some", pct: 45 });
    expect(rowSummary(row("Automobiles"))).toBe("Automobiles is rank 4 of 37, in Ahead and gaining for 1 week. Against the average industry it is +9.0% over 6 months and +10.8% over the last month. Most of its stocks are taking part in the move.");
  });
  it("six months of ranks and twelve weeks", () => {
    const s = sixMonthRankCards(M);
    expect(s.map((c) => c.title)).toEqual(["Biggest climb: Petroleum Products", "Steadiest near the top: Aerospace & Defense", "Biggest fall: Metals & Mining"]);
    expect(s[0].text).toBe("From rank 32 26 weeks ago to rank 2 now.");
    expect(s[1].text).toBe("In the top 5 for 25 of the last 26 weeks.");
    expect(climbers26(M).up[0].r.slug).toBe("petroleum-products");
    const t = twelveWeekCards(M);
    expect(t[0].title).toBe("Automobiles: from 27 to 4 in five weeks");
    expect(t[0].text).toBe("The fastest climb on the board. Telecommunication climbed more steadily, from 23 to 9 over 12 weeks.");
    expect(t[1].title).toBe("Pharma & Biotech never left the top 8");
    expect(t[2].title).toBe("Chemicals and Electrical Equipment faded");
    expect(t[2].text).toBe("Chemicals went from 5 to 23 and Electrical Equipment from 11 to 32 in four weeks. Rows that turn light this fast show money leaving.");
  });
});
