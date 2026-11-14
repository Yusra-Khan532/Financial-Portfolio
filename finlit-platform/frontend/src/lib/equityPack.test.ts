// The Equity portfolio's words as the final pages pack writes them (docs/design/finlit-final-pages/12-14), checked with the pack's own test portfolio of 6 Nov 2026.
import { describe, expect, it } from "vitest";
import { leaderCards, peerCards, peerSentence, riskCards, riskLead, scoreTiles, sharesCards, spreadCards, standsOut, type Share } from "./equityPack";

const sh = (symbol: string, o: Partial<Share> = {}): Share => ({ symbol, industry: "Software & Consulting", size: "Large", chg: 0.5, prism: 70, prismWord: "Healthy", valuation: 45, risk: 70, st: 30, lt: 30, below52: 10, m1: 2, peer: null, notCompared: null, ...o });
const peer = (label: "leader" | "in_line" | "laggard", rank: number, of: number, o: Partial<NonNullable<Share["peer"]>> = {}) => ({ label, raw: null, rank, of, group: "IT", vs: 38.1, bench: "Nifty IT", direction: "gaining" as const, ...o });

describe("Portfolio tab", () => {
  it("writes the three cards above the table", () => {
    const c = sharesCards([
      sh("TECHM", { peer: peer("leader", 1, 13), prism: 77, below52: 1.6 }),
      sh("KINGFA", { size: "Small", chg: -12.6 }), sh("MARINE", { size: "Small", chg: -11.0 }), sh("AEROFLEX", { size: "Small", chg: -10.6 }),
      sh("APOLLO", { prism: 44, lt: 40 }), sh("GLENMARK", { prism: 45, lt: 35 }),
    ], "Friday");
    expect(c[0]).toEqual({ kind: "good", title: "TECHM is your strongest all-rounder", text: "First of 13 IT peers, healthy Prism (77), uptrend in both the short and long term, and near its 1-year high." });
    expect(c[1]).toEqual({ kind: "warning", title: "3 shares fell 10% or more on Friday", text: "KINGFA −12.6%, MARINE −11.0% and AEROFLEX −10.6%. All three are small companies, which tend to swing more." });
    expect(c[2]).toEqual({ kind: "watch", title: "Weak Prism, strong price: APOLLO and GLENMARK", text: "Both have weak business scores (44 and 45) but rising prices. Prices can run ahead of the business; check why." });
  });
  it("against their peers: the sentence and the cards", () => {
    const xs = [sh("TECHM", { peer: peer("leader", 1, 13) }), sh("PERSISTENT", { peer: peer("leader", 4, 13) }), sh("INFY", { peer: peer("laggard", 10, 13) }), sh("ZENSARTECH", { peer: peer("laggard", 13, 18) }),
      sh("GLENMARK", { industry: "Pharmaceuticals", peer: peer("in_line", 5, 16, { raw: "leader" }) }), sh("RELIANCE", { industry: "Refineries", peer: peer("laggard", 7, 11, { raw: "in_line" }) }),
      sh("KINGFA", { industry: "Plastic", notCompared: "trades too thinly to rank fairly" }), sh("TIPSMUSIC", { industry: "Media", notCompared: "trades too thinly to rank fairly" }), sh("CHENNPETRO", { industry: "Refineries", notCompared: "has under a year of prices" })];
    expect(peerSentence(xs)).toBe("Two of your 9 shares lead their peers and three lag. Among your four software & consulting shares, TECHM and PERSISTENT lead while INFY and ZENSARTECH lag.");
    const c = peerCards(xs);
    expect(c[0].text).toBe("GLENMARK reads Leader and RELIANCE reads In line this week. Labels change only if the next weekly reading agrees.");
    expect(c[1]).toEqual({ kind: "watch", title: "Not compared: 3 shares", text: "KINGFA and TIPSMUSIC trade too thinly to rank fairly; CHENNPETRO has under a year of prices." });
  });
  it("what if you had owned the group leader", () => {
    const c = leaderCards([
      { symbol: "INFY", leader: "TECHM", group: "IT", mine: 80497, theirs: 129457, leaderBigger: true, nextWeek: null, gaining: false },
      { symbol: "RELIANCE", leader: "ANTELOPUS", group: "Energy", mine: 88102, theirs: 166667, leaderBigger: false, nextWeek: "in_line", gaining: false },
      { symbol: "YESBANK", leader: "KARURVYSYA", group: "private banks", mine: 76005, theirs: 149974, leaderBigger: true, nextWeek: null, gaining: false },
      { symbol: "ZENSARTECH", leader: "NAZARA", group: "Packaged Software", mine: 80395, theirs: 158114, leaderBigger: true, nextWeek: null, gaining: true },
    ]);
    expect(c[0].text).toBe("₹4 lakh split across your four laggards a year ago is worth about ₹3.25 lakh today; the same money in the four group leaders, about ₹6.04 lakh.");
    expect(c[1].text).toContain("(ANTELOPUS against RELIANCE)");
    expect(c[2].text).toBe("RELIANCE may move to In line next week, and ZENSARTECH has been gaining on its peers over the last 3 months.");
  });
});

describe("Diversification and Risk analytics", () => {
  it("spread cards", () => {
    const c = spreadCards({ "Software & Consulting": 28.6, "Refineries & Marketing": 14.3, Pharma: 7.1 }, { "Software & Consulting": ["TECHM", "PERSISTENT", "INFY", "ZENSARTECH"], "Refineries & Marketing": ["RELIANCE", "CHENNPETRO"], Pharma: ["GLENMARK"] },
      { Large: 6, Mid: 4, Small: 4 }, [{ members: ["TECHM", "PERSISTENT", "INFY", "ZENSARTECH"], avg: 0.63, name: "Software & Consulting" }]);
    expect(c[0].text).toBe("Apart from software & consulting (4 shares) and refineries & marketing (2 shares), every industry in the list has just one share.");
    expect(c[1]).toEqual({ kind: "watch", title: "Software & Consulting is 29% of the list", text: "TECHM, PERSISTENT, INFY and ZENSARTECH tend to move together. A bad month for software & consulting hits four shares at once." });
    const part = spreadCards({ Banks: 33 }, { Banks: ["HDFCBANK", "ICICIBANK", "SBIN", "BAJFINANCE"] }, { Large: 4, Mid: 0, Small: 0 }, [{ members: ["HDFCBANK", "ICICIBANK"], avg: 0.56, name: "Banks" }]);
    expect(part.find((x) => x.title === "Banks is 33% of the list")?.text).toBe("HDFCBANK, ICICIBANK, SBIN and BAJFINANCE are in the same industry. A bad month for banks hits four shares at once.");
    expect(c[2]).toEqual({ kind: "insight", title: "Balanced by size", text: "6 large, 4 mid and 4 small companies. Large companies steady the list; the small ones add most of the swings." });
  });
  it("risk at a glance and its cards", () => {
    const l = riskLead({ beta: 1.06, vol: 23.3, vol_nifty: 14.4, max_fall: -18.5, max_fall_nifty: -14.8, worst10_list: -3.9, worst10_nifty: -3.2 }, { symbols: ["APOLLO", "MARINE", "AEROFLEX"], risk: 40, money: 21.3 });
    expect(l.lead + l.rest).toBe("Your list moves roughly in step with the Nifty 50 (beta 1.06), but its swings are bigger: 23.3% in a typical year against 14.4%.");
    expect(l.more).toBe("In the market's worst weeks it fell a little more than the index. Three shares, APOLLO, MARINE and AEROFLEX, carry 40% of the ups and downs, though they are only 21% of the list.");
    const c = riskCards([sh("APOLLO", { risk: 32, prism: 44 }), sh("KINGFA", { size: "Small", chg: -12.6, risk: 80 }), sh("MARINE", { size: "Small", chg: -11, risk: 50 }), sh("AEROFLEX", { size: "Small", chg: -10.6, risk: 63 }),
      sh("GLENMARK", { risk: 93 }), sh("RELIANCE", { risk: 86 }), sh("TECHM", { risk: 83 }), sh("TIPSMUSIC", { risk: 83 })], { APOLLO: 14.8 }, { APOLLO: 7.1 }, "Friday");
    expect(c[0]).toEqual({ kind: "warning", title: "APOLLO is the riskiest share", text: "Prism Risk 32 and a weak business score (44). It is 7% of the list but 15% of the ups and downs." });
    expect(c[1].title).toBe("Three small-company falls on Friday");
    expect(c[2].title).toBe("Five shares steady the list");
    expect(standsOut(sh("MARINE", { m1: -17.5, chg: -11.0, below52: 19.8 }), true, "Friday")).toBe("Big price swings · Fell 18% last month · −11.0% on Friday");
    expect(standsOut(sh("INFY", { m1: 16.6, chg: 1, below52: 31.7 }), false, "Friday")).toBe("Far below its 1-year high");
  });
  it("the score tiles", () => {
    const t = scoreTiles([sh("A", { peer: peer("leader", 1, 5), lt: 40 }), sh("B", { prism: 45, peer: peer("laggard", 5, 5), lt: -40 }), sh("C", { prism: null })],
      { valuation: { word: "Weak" }, concentration: { word: "Needs quantities" } } as never, { score: { score: 80, band: "Widely spread", effective_stocks: 6.5 }, market: { eq: { beta: 1.06, vol: 23.3, vol_nifty: 14.4 } }, order: Array(13).fill("x") }, 11, 3, { n: 4, name: "Software" });
    expect(t.map((x) => `${x.k}: ${x.v} | ${x.sub}`)).toEqual([
      "Holding strength: Fair · 58 | Average Prism: 1 strong · 0 fair · 1 weak · 1 not scored", "Against peers: 1 lead · 1 lag | 0 in line · 1 not compared",
      "Price trend: Mostly rising | 67% of the list in a long-term uptrend; 33% in a downtrend", "Diversification: 80 · Widely spread | 11 industries, all three sizes",
      "Moves like: 6.5 of 13 | independent shares; the four software shares move as a pack", "Risk vs the index: In line · β 1.06 | but bigger swings: 23.3% a year vs 14.4%",
      "Valuation: Weak | Average Prism valuation reading: you pay above-typical prices", "Concentration: Needs quantities | Largest holding and top five, once amounts are in"]);
  });
});

describe("What moves together", () => {
  it("cells, tiles and cards in the pack's words", async () => {
    const { corrCell, segLine, togetherCards } = await import("./equityPack");
    expect([0.54, -0.02, 0.005, 1, 0.2].map(corrCell)).toEqual([".54", "−.02", ".01", "1.00", ".20"]);
    expect(segLine({ pairs: 6, avg: 0.63, at_least_05: 6, top: [{ a: "TECHM", b: "INFY", corr: 0.78 }] })).toBe("average; all 6 pairs at 0.5 or more. Closest: TECHM and INFY (0.78)");
    expect(segLine({ pairs: 72, avg: 0.21, at_least_05: 0, top: [{ a: "APOLLO", b: "YESBANK", corr: 0.42 }] })).toBe("average; none at 0.5 or more. Closest: APOLLO and YESBANK (0.42)");
    expect(segLine({ pairs: 9, avg: 0.55, at_least_05: 5, top: [] })).toBe("average; 5 of 9 pairs at 0.5 or more.");
    const c = togetherCards([{ members: ["TECHM", "INFY", "PERSISTENT", "ZENSARTECH"], avg: 0.63, name: "Software" }, { members: ["RELIANCE", "CHENNPETRO"], avg: 0.5, name: "Refineries" }], 0.21);
    expect(c).toEqual([
      { kind: "watch", title: "The 4 software shares move almost as one", text: "TECHM, INFY, PERSISTENT and ZENSARTECH: 0.63 on average. For spreading risk, they count closer to one bet than four." },
      { kind: "good", title: "Everything else moves fairly independently", text: "Shares from different sectors average 0.21: owning them does spread your risk." }]);
  });
});
