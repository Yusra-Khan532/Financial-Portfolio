// The MF portfolio's words, checked with the pack's own sample (board 15, 6 Nov 2026).
import { describe, expect, it } from "vitest";
import { wordCase } from "../mf/pack/MfPack";
import { fundCards, fundTag, mfTiles, shortFund, underCards, type MfRisk, type Under } from "./mfPack";

const h = (code: number, name: string, cat: string, final: number | null, label: string | null) => ({ code, name, categoryLabel: cat, score: { final, label } }) as never;
const HS = [h(1, "Parag Parikh Flexi Cap Fund - Direct Plan - Growth", "Flexi Cap", 78, "Healthy"), h(2, "HDFC Flexi Cap Fund - Growth Option - Direct Plan", "Flexi Cap", 74, "Healthy"),
  h(3, "ICICI Prudential Large Cap Fund - Direct Plan - Growth", "Large Cap", 76, "Healthy"), h(4, "SBI Small Cap Fund - Direct Plan - Growth", "Small Cap", 62, "Average"), h(5, "Nippon India Small Cap Fund - Direct Plan - Growth", "Small Cap", 58, "Average")];
const fr = (code: number, short: string, category: string, swing: number, worstFall: number, beta: number, fallsTaken: number) => ({ code, name: short, short, category, swing, worstFall, beta, fallsTaken, from: null, to: null, years: 3, why: null });
const RK: MfRisk = { count: 5, basis: "equal", bench: { name: "NIFTY 500", swing: 13, worstFall: -16, from: "", to: "" },
  funds: [fr(1, "Parag Parikh Flexi Cap", "Flexi Cap", 11.2, -14.8, 0.74, 62), fr(2, "HDFC Flexi Cap", "Flexi Cap", 13.1, -16.9, 0.88, 81), fr(3, "ICICI Prudential Large Cap", "Large Cap", 12.6, -15.3, 0.92, 86),
    fr(4, "SBI Small Cap", "Small Cap", 17.9, -24.6, 0.98, 83), fr(5, "Nippon India Small Cap", "Small Cap", 19.4, -27.9, 1.07, 97)],
  list: { swing: 14.4, worstFall: -18, level: { word: "A little higher", vs: "the Nifty 500", because: "because of the two small-cap funds", riskier: ["SBI Small Cap", "Nippon India Small Cap"] } } };
const SP = { funds: HS.map((x: { code: number; name: string }) => ({ code: x.code, name: x.name })), readings: { overlap: { word: "High", top: { a: 2, b: 3, pct: 38.2, n: 31 } } } } as never;
const pt = (label: "leader" | "in_line" | "laggard", rank: number, of: number, group: string) => ({ label, raw: null, rank, of, group });
const U = (name: string, w: number, peer: Under["peer"]): Under => ({ name, symbol: null, industry: null, size: "Large", w, funds: [], peer, notCompared: null });
const UNDER = [U("HDFC Bank", 0.061, pt("laggard", 11, 12, "Private banks")), U("ICICI Bank", 0.054, pt("laggard", 3, 12, "Private banks")), U("Reliance Industries", 0.032, pt("laggard", 7, 11, "Energy Minerals")),
  U("Bharti Airtel", 0.029, pt("in_line", 3, 6, "Communications")), U("Infosys", 0.026, pt("laggard", 10, 13, "IT")), U("Axis Bank", 0.024, pt("in_line", 7, 12, "Private banks")),
  U("Bajaj Finance", 0.022, pt("in_line", 12, 33, "Finance")), U("Kotak Mahindra Bank", 0.02, pt("in_line", 4, 12, "Private banks")), U("Larsen & Toubro", 0.019, pt("in_line", 9, 18, "Engineering")), U("ITC", 0.018, pt("laggard", 24, 26, "Consumer"))];

describe("MF portfolio words", () => {
  it("the five tiles", () => {
    expect(mfTiles(HS, false, SP, RK, UNDER).map((t) => `${t.k}: ${t.v} | ${t.sub}`)).toEqual([
      "Funds: 5 | 2 flexi cap · 2 small cap · 1 large cap", "Average health: 70 | 3 healthy · 2 average", "Highest overlap: 38% | HDFC Flexi Cap and ICICI Prudential Large Cap",
      "Top 10 stocks vs peers: 0 lead · 5 lag | 5 in line · the 10 biggest stocks inside your funds", "Risk level: A little higher | than the Nifty 500, because of the two small-cap funds"]);
    expect(mfTiles(HS, false, SP, RK, UNDER)[4].tone).toBe("warn");
    expect(mfTiles(HS, false, SP, { ...RK, list: { ...RK.list, level: { word: "A little lower", vs: "the Nifty 500", because: null, riskier: [] } } }, UNDER)[4]).toMatchObject({ tone: "good", sub: "than the Nifty 500" });
    expect(mfTiles(HS, true, SP, RK, UNDER)[1]).toMatchObject({ v: "Gold plan", sub: "Each fund's Health Score opens with Gold" });
  });
  it("the three cards above Your funds", () => {
    expect(fundCards(RK, HS, false, SP)).toEqual([
      { kind: "good", title: "Parag Parikh Flexi Cap is the steadiest", text: "It took only 62% of the market's falls, with a healthy score of 78." },
      { kind: "watch", title: "The two small-cap funds carry the risk", text: "Nippon India Small Cap and SBI Small Cap swing the most and fell up to 28% in their worst stretch." },
      { kind: "insight", title: "Two funds look alike", text: "HDFC Flexi Cap and ICICI Prudential Large Cap share 38% of their money in the same stocks. See Mix & overlap." }]);
    expect(fundCards(RK, HS, true, SP)[0].text).toBe("It took only 62% of the market's falls.");
    const many = { ...RK, list: { ...RK.list, level: { word: "Higher", vs: "the Nifty 500", because: "because four of your five funds swing more than it", riskier: ["HDFC Flexi Cap", "ICICI Prudential Large Cap", "SBI Small Cap", "Nippon India Small Cap"] } } };
    expect(fundCards(many, HS, true, SP)[1]).toEqual({ kind: "watch", title: "Four of your five funds swing more than the Nifty 500", text: "Nippon India Small Cap and SBI Small Cap swing the most and fell up to 28% in their worst stretch." });
  });
  it("the cards above the largest stocks underneath", () => {
    expect(underCards(UNDER)[0]).toEqual({ kind: "watch", title: "None of the 10 biggest stocks leads its peers", text: "Five lag them, including HDFC Bank and ICICI Bank, your two largest. Together the five laggards are 19.1% of your fund money." });
    expect(underCards(UNDER)[1].text).not.toMatch(/\b(sell|buy|hold)\b/i);
  });
  it("names and tags", () => {
    expect([wordCase("AVERAGE"), wordCase("Healthy"), wordCase(null)]).toEqual(["Average", "Healthy", ""]);
    expect(shortFund("HDFC Flexi Cap Fund - Growth Option - Direct Plan")).toBe("HDFC Flexi Cap");
    expect(shortFund("ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund)")).toBe("ICICI Prudential Large Cap");
    expect(shortFund("SBI SMALL CAP FUND")).toBe("SBI Small Cap");
    expect(fundTag("HDFC Flexi Cap Fund", "HDFC Mutual Fund", "Flexi Cap")).toBe("HDFC FC");
    expect(fundTag("ICICI Prudential Large Cap Fund", "ICICI Prudential Mutual Fund", "Large Cap")).toBe("ICICI LC");
  });
});
