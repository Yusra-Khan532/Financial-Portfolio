// Task #274 (the 20 Nov equity pack, change 9): Key figures as plain answers. The trend card is checked on the pack's own 15 shares (their long- and
// short-term scores, src/lib/__fixtures__/trend-20nov-pack.json): it must say what the pack says, "11 of 15 are in a long-term uptrend, but 8 of them are
// resting or dipping in recent weeks", with the bar Rising 3 · Resting or dipping 8 · Flat 1 · Falling 3.
import { describe, expect, it } from "vitest";
import { divAnswers, portfolioAnswers, riskAnswers } from "./keyAnswers";
import type { Share } from "./equityPack";
import type { RiskAnswer } from "./eqRisk";
import FX from "./__fixtures__/trend-20nov-pack.json";

const peer = (label: "leader" | "in_line" | "laggard", rank: number, of: number) => ({ label, raw: null, rank, of, group: "g", vs: 0, bench: "peer average", direction: null });
const PEERS: Record<string, ReturnType<typeof peer> | null> = { TECHM: peer("leader", 1, 13), "526433": peer("leader", 2, 25), CHENNPETRO: peer("leader", 1, 6), SKYGOLD: peer("leader", 2, 9), APOLLO: peer("leader", 3, 30), GLENMARK: peer("leader", 4, 40),
  PERSISTENT: peer("in_line", 5, 13), MARINE: peer("in_line", 4, 9), AEROFLEX: peer("in_line", 5, 12), YESBANK: peer("laggard", 12, 12), INFY: peer("laggard", 10, 13), RELIANCE: peer("laggard", 4, 6), ZENSARTECH: peer("laggard", 9, 13),
  TIPSMUSIC: null, KINGFA: null };
const VAL: Record<string, number> = { CHENNPETRO: 72, YESBANK: 75, TECHM: 55, PERSISTENT: 60, SKYGOLD: 52 };
const shares: Share[] = FX.shares.map((s) => ({ symbol: s.symbol, name: s.name, industry: null, size: null, chg: null, prism: s.prism, prismWord: null, valuation: VAL[s.symbol] ?? 30, risk: null,
  st: s.st, lt: s.lt, below52: null, m1: null, peer: PEERS[s.symbol], notCompared: PEERS[s.symbol] ? null : "trades too thinly to rank fairly" })) as unknown as Share[];
const lab = (s: Share) => (s.symbol === "526433" ? "ASM Technologies" : s.symbol);

describe("Portfolio's Key figures", () => {
  const [peers, trend, val] = portfolioAnswers(shares, true, lab);
  it("against similar companies: a full sentence with the counts, the bar and who is furthest behind", () => {
    expect(peers.sentence).toBe("6 of 15 were among the strongest in their peer group over the last 12 months; 4 were among the weakest.");
    expect(peers.bar.map((b) => `${b.label} ${b.n}`)).toEqual(["Strongest 6", "Middle 3", "Weakest 4", "Not compared 2"]);
    expect(peers.rests).toBe("Furthest behind: YESBANK (12th of 12) and INFY (10th of 13). 3 sit in the middle; TIPSMUSIC and KINGFA trade too thinly to rank fairly.");
    expect(peers.go).toBe("See peers");
  });
  it("price trend: the pack's sentence on the pack's shares", () => {
    expect(trend.sentence).toBe("11 of 15 are in a long-term uptrend, but 8 of them are resting or dipping in recent weeks.");
    expect(trend.bar.map((b) => `${b.label} ${b.n}`)).toEqual(["Rising 3", "Resting or dipping 8", "Flat 1", "Falling 3"]);
    expect(trend.rests).toMatch(/^3 are in a long-term downtrend and 1 is flat\. Long term is the trend over months, short term the last few weeks/);
  });
  it("valuation: weak first when most read weak, the average out of 100, the strong ones named, and a link that sorts the table", () => {
    expect(val.sentence).toBe("10 of 15 read weak on valuation: you pay above-typical prices for them.");
    expect(val.bar.map((b) => `${b.label} ${b.n}`)).toEqual(["Strong 2", "Fair 3", "Weak 10"]);
    expect(val.rests).toBe("The list averages 41 out of 100 on FinLit Prism's valuation reading. CHENNPETRO and YESBANK read strong; 3 read fair.");
    expect(val.go).toBe("Sort the table by valuation"); expect(val.sort).toBe("p_valuation");
  });
  it("no vague headlines remain", () => {
    const all = portfolioAnswers(shares, true, lab).map((c) => c.sentence + c.rests).join(" ");
    expect(all).not.toMatch(/Mostly rising|Mostly falling|\bSplit\b|Similar\b|Weak · /);
  });
  it("Silver: only the peers card (Prism trend and valuation are Gold); a card with nothing to say is left out", () => {
    expect(portfolioAnswers(shares, false, lab).map((c) => c.k)).toEqual(["Against similar companies"]);
    expect(portfolioAnswers(shares.map((s) => ({ ...s, peer: null })), false)).toEqual([]);
  });
});

describe("Diversification's Key figures", () => {
  it("largest sector, the group that moves together and the separate bets", () => {
    const [a, b, c] = divAnswers({ N: 15, sectors: [{ name: "Information Technology", n: 5 }, { name: "Energy", n: 2 }, { name: "Financials", n: 2 }, { name: "Industrials", n: 3 }, { name: "Health Care", n: 2 }, { name: "Consumer Discretionary", n: 1 }],
      sectorLevelOfTop: ["IT - Software"], groups: [{ members: ["INFY", "TECHM", "PERSISTENT", "ZENSARTECH"], cross: false }], eff: 7.4, counted: 15 });
    expect(a.sentence).toBe("Information Technology holds 5 of your 15 shares (33%)."); expect(a.bar).toHaveLength(6);
    expect(b.sentence).toBe("One group of 4 shares tends to move together, and all 4 are in one sector.");
    expect(b.bar.map((x) => `${x.label} ${x.n}`)).toEqual(["In a group 4", "Move on their own 11"]);
    expect(c.sentence).toBe("Your 15 shares behave like about 7.4 separate ones.");
  });
});

describe("Risk's Key figures", () => {
  const r = { to: "2026-11-19", from: "", counted: 15, unknown: [], missingIndex: [], ranges: [], glance: { nifty: { swing: 13.6, worstFall: null } as never, worst10: { list: null, nifty: null }, weighted: 1.1 },
    betas: { weighted: 1.1, blended: null, nifty: null, weightedBand: { key: "similar", word: "Similar" }, blendedBand: null, niftyBand: null },
    sizes: [{ size: "Large", adds: 0.25 }, { size: "Mid", adds: 0.1 }, { size: "Small", adds: 0.33 }, { size: "Micro", adds: 0.42 }],
    shares: [{ symbol: "APOLLO", beta: 2.27, benchmark: "Nifty Smallcap 250" }, { symbol: "526433", beta: 1.9, benchmark: "Nifty Microcap 250" }, { symbol: "TECHM", beta: 0.8, benchmark: "Nifty 100" }, { symbol: "KINGFA", beta: 1.4, benchmark: "x" }] } as unknown as RiskAnswer;
  const [m, w, s] = riskAnswers(r, { Large: { list: 27, risk: 20 }, Mid: { list: 13, risk: 11 }, Small: { list: 33, risk: 39 }, Micro: { list: 27, risk: 30 } }, (x) => (x === "526433" ? "ASM Technologies" : x));
  it("moves with the market, with what each size adds", () => {
    expect(m.sentence).toBe("The list has moved about 1.1% for each 1% move in its markets (β 1.10, similar).");
    expect(m.bar.map((b) => b.label)).toEqual(["Large 0.25", "Mid 0.10", "Small 0.33", "Micro 0.42"]);
  });
  it("where the risk comes from", () => { expect(w.sentence).toBe("Small companies are 33% of the list but carry 39% of its ups and downs."); });
  it("swings the most: the highest beta and the three highest as rows with a line at 1.00", () => {
    expect(s.sentence).toBe("APOLLO has moved about 2.3% for each 1% move in the Nifty Smallcap 250 (β 2.27).");
    expect(s.rows!.map((x) => x.label)).toEqual(["APOLLO", "ASM Technologies", "KINGFA"]);
  });
});
