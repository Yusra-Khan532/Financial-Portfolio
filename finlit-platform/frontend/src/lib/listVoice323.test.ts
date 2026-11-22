// Task #323 (developer file 22): the equity sections on the Watchlists page speak of a list the member watches, not shares they own.
// The wording table of file 22, line by line, against the equity page's own wording (voice "own", unchanged).
import { describe, expect, it } from "vitest";
import { leaderCards, peerCards, peerSentence, trendCards, type Share } from "./equityPack";
import { portfolioAnswers } from "./keyAnswers";

const peer = (label: "leader" | "in_line" | "laggard", rank: number, of: number) => ({ label, raw: null, rank, of, group: "IT services", vs: 0, bench: "peer average", direction: null });
const sh = (symbol: string, o: Partial<Share> = {}): Share => ({ symbol, name: symbol, industry: "Software & Consulting", size: null, chg: null, prism: null, prismWord: null, valuation: null, risk: null,
  st: null, lt: null, below52: null, m1: null, peer: null, notCompared: null, ...o });

describe("Watchlists wording (voice list)", () => {
  const xs = [sh("TECHM", { peer: peer("leader", 1, 13), valuation: 30 }), sh("PERSISTENT", { peer: peer("leader", 2, 13), valuation: 30 }), sh("INFY", { peer: peer("laggard", 10, 13), valuation: 30 }),
    sh("KINGFA", { industry: "Plastic", notCompared: "trades too thinly to rank fairly", valuation: 70 })];
  it("Against their peers: 'Two of the 4 lead their peers', 'Among the three … companies on this list'", () => {
    expect(peerSentence(xs, "list")).toBe("Two of the 4 lead their peers and one lags. Among the three software & consulting companies on this list, TECHM and PERSISTENT lead while INFY lags.");
    expect(peerSentence(xs)).toBe("Two of your 4 shares lead their peers and one lags. Among your three software & consulting shares, TECHM and PERSISTENT lead while INFY lags.");
    expect(peerSentence([xs[0], xs[2], xs[3]], "list")).toMatch(/^One of the 3 leads its peers and one lags\./);
    expect(peerCards(xs, "list")[0].title).toBe("Not compared: 1 company");
  });
  it("Key figures: valuation trades at above-typical prices, and 'See the list'", () => {
    const v = portfolioAnswers(xs, true, (s) => s.symbol, "list").find((a) => a.k === "Valuation")!;
    expect(v.sentence).toBe("3 of 4 read weak on valuation: they trade at above-typical prices.");
    expect([v.go, v.to, v.sort]).toEqual(["See the list", "wp-list", undefined]);
    const own = portfolioAnswers(xs, true, (s) => s.symbol).find((a) => a.k === "Valuation")!;
    expect(own.sentence).toBe("3 of 4 read weak on valuation: you pay above-typical prices for them.");
    expect(own.go).toBe("Sort the table by valuation");
  });
  it("Trend cards: 'Three companies …', 'Many companies …', 'for one company'", () => {
    const t = { rated: 4, grid: { "1,1": { n: 3, symbols: ["A", "B", "C"] } }, direction: { weakening: 0.5, improving: 0.1 }, business: { strong_down: { n: 1, symbols: ["D"] } } };
    expect(trendCards(t, (x) => x, "list").map((c) => c.title + " | " + c.text)).toEqual([
      "Three companies are Rising on both trends | A, B and C: up over months and up lately.",
      "The short term trails the long term for 50% | Many companies are resting or dipping against their longer trend.",
      "Price behind the business for one company | Their Prism business reading is stronger than their price trend, including D."]);
    expect(trendCards(t)[0].title).toBe("Three shares are Rising on both trends");
  });
  it("Group leader: 'would be about', 'these three laggards', 'why the company lagged'", () => {
    const p = (s: string) => ({ symbol: s, leader: "L" + s, group: "g", mine: 90000, theirs: 140000, leaderBigger: true, nextWeek: null, gaining: false });
    const c = leaderCards([p("A"), p("B"), p("C")], "list");
    expect(c[0].text).toBe("₹3 lakh split across these three laggards a year ago would be about ₹2.70 lakh today; the same money in the three group leaders, about ₹4.20 lakh.");
    expect(c[1].text).toMatch(/Use this to ask why the company lagged:/);
    expect(leaderCards([p("A"), p("B"), p("C")])[0].text).toMatch(/^₹3 lakh split across your three laggards a year ago is worth about/);
  });
});
