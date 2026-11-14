// "Where Reliance stands" (board 17 of the final pages pack), checked with the pack's own Reliance figures of 6-9 Nov 2026.
import { describe, expect, it } from "vitest";
import { headline, industryCards, peerCards, priceCards, riskCards, rotationLine } from "./standsPack";

const rot = { corner: "ahead_gaining", rank: 2, ranked: 37, strength_pts: 19.2, change_pts: 0 } as never;
const S = { symbol: "RELIANCE", rank_6m: 12, ranked_6m: 12, quarter: 4, return_6m_pct: -8.1 } as never;
const pt = (symbol: string) => ({ symbol, rank_6m: 1, return_6m_pct: 10 });
const P = { stocks: [pt("GANDHAR"), pt("SOTL"), pt("PANAMAPET")] } as never;
const L = { rank: 7, label: "laggard", rawLabel: "in_line", peerGroup: { ranked: 11, short: "energy" }, benchmarks: { sector: { name: "Nifty Energy" }, market: { name: "Nifty 50" } }, rel: { w52: -0.138, w52Market: -0.09, w13: 0.036 } } as never;

describe("Where Reliance stands", () => {
  it("the lead sentence", () => {
    const h = headline("Reliance", "Petroleum Products", "Bouncing back", S, rot, L)!;
    expect(h.lead + h.rest).toBe("A strong industry, a lagging share. Petroleum Products is bouncing back and is the 2nd strongest of 37 industries, but Reliance is its weakest stock over 6 months and 7th of 11 energy peers.");
    expect(h.recent).toBe("The recent direction is better: this week's peer reading says In line.");
  });
  it("Its industry: the three cards and the rotation line", () => {
    expect(industryCards("Reliance", "Petroleum Products", S, P, rot, "bouncing")).toEqual([
      { kind: "good", title: "A strong industry", text: "Petroleum Products is the 2nd strongest of 37 industries and its stocks have just bounced together." },
      { kind: "warning", title: "Reliance is its weakest stock", text: "Of the 12 counted Petroleum Products stocks, Reliance ranks 12th over 6 months (−8.1%). GANDHAR and SOTL led the industry." },
      { kind: "insight", title: "What it means", text: "The industry is not what is holding Reliance back: most of its industry has done better over 6 months." }]);
    expect(rotationLine("Petroleum Products", rot)).toBe("Petroleum Products has done better than the average industry over the last several months, and it is the 2nd strongest of 37.");
  });
  it("Against peers: the cards", () => {
    const c = peerCards("Reliance", L, { pe: 21.7, roe: 8.7, peers: [{ pe: 4.4, roe: 20.3 }, { pe: 8.8, roe: 15.6 }, { pe: 57.2, roe: 2.7 }, { pe: 7.0, roe: 25.9 }] });
    expect(c[0]).toEqual({ kind: "warning", title: "A laggard among energy companies", text: "Reliance ranks 7th of 11 by price over 12 months: 13.8 points behind Nifty Energy and 9.0 behind Nifty 50." });
    expect(c[1]).toEqual({ kind: "good", title: "But the recent direction has turned", text: "Over the last 3 months it is 3.6 points ahead of Nifty Energy, and this week's reading says In line. If next week agrees, the label changes." });
    expect(c[2].text).toBe("Reliance trades at 21.7 times profit, within the range of the other companies in its industry (4 to 57 times), with a lower return on equity (8.7%) than their average (16.1%).");
  });
  it("Price chart and Risk", () => {
    const c = priceCards({ last: 1302.5, high52: 1592.3, m1: 8.1, m12: -11.9, vs50: 3, vs200: 0.5, rsi: 67, align: "Bounce in a downtrend" });
    expect(c.map((x) => `${x.kind}: ${x.title} | ${x.text}`)).toEqual([
      "good: A bounce inside a downtrend | Up 8.1% in the last month, but still 18% below its 1-year high and down 12% over the year.",
      "watch: The long-term trend has not turned | The price is above its medium-term average but only just above its long-term one (0.5%). A clear turn would need a few more weeks of gains.",
      "insight: Momentum is normal | The momentum reading (RSI 67) is in the normal range: neither stretched nor weak."]);
    expect(riskCards("Reliance", 86, -11.9, -2.1)).toEqual([
      { kind: "good", title: "One of the steadier shares on NSE", text: "Prism Risk 86 puts Reliance among the lower-risk companies on NSE." },
      { kind: "insight", title: "Lower risk is not the same as a good return", text: "Over the last 12 months the share fell 12% while the Nifty 50 fell 2%. Steady and strong are different things." }]);
  });
  it("never advises", () => {
    const all = JSON.stringify([industryCards("R", "X", S, P, rot, "sold_off"), peerCards("R", L, null), priceCards({ last: 1, high52: 2, m1: -1, m12: -1, vs50: -1, vs200: -5, rsi: 20, align: "Falling on both" }), riskCards("R", 30, 5, 1)]);
    expect(all).not.toMatch(/\b(buy|sell|hold|avoid|target|best|should)\b/i);
  });
});
