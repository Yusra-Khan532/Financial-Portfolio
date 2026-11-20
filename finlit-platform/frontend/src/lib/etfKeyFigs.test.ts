// Task #276 (ETF portfolio, 20 Nov pack): the Key figures of the three views, the windows of every beta and index figure, and the companies inside the ETFs,
// on the 20 Nov figures of the pack's four ETFs (GOLDBEES, MID150BEES, SILVERBEES, SMALL250) with the server's number fixes 2-5 applied.
import LIST from "./__fixtures__/etf276-list.json";
import RISK from "./__fixtures__/etf276-risk.json";
import INSIDE from "./__fixtures__/etf276-inside.json";
import { describe, expect, it } from "vitest";
import type { EtfPortfolio, EtfRisk, Inside } from "./etfPortfolio";
import { benchText, betaWindowText, costCard, etfKeyFigures, insideCompanies, insideLine, metalGaps, priceVsValue, sameIndexTwice, swingCheck, whereTheMoneyIs } from "./etfKeyFigs";
import { pickCards } from "../portfolio/kit/keyFigs";

const clone = <T,>(x: unknown) => JSON.parse(JSON.stringify(x)) as T;
const d = () => clone<EtfPortfolio>(LIST), rk = () => clone<EtfRisk>(RISK), ins = () => clone<Inside>(INSIDE);
const say = (c: { lead: string; rest?: string }) => c.lead + (c.rest ?? "");

describe("Key figures: a card with nothing to say is skipped (fix 8, code F)", () => {
  it("shows the first three non-null of an ordered list", () => {
    const n = () => null, c = (id: string) => () => ({ id, tone: "info" as const, k: id, lead: id, go: { label: "x", kind: "jump" as const, arg: "x" } });
    expect(pickCards([n, c("a"), n, c("b"), c("c"), c("d")], {}).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(pickCards([n, n], {})).toEqual([]);
  });
  it("Same index twice is null when no two ETFs share an index (never 'None')", () => {
    expect(sameIndexTwice({ d: d() })).toBeNull();
  });
  it("Price against value is labelled by sign: furthest below for a discount, furthest above for a premium; null when every ETF is within 0.1%", () => {
    const below = priceVsValue({ d: d() })!;
    expect(below.k).toBe("Furthest below its value");
    expect(say(below)).toBe("SILVERBEES traded 0.48% below its value on 19 Nov, the furthest of the four.");
    const x = d(); x.items.find((e) => e.symbol === "SILVERBEES")!.premium = 0.9;
    expect(priceVsValue({ d: x })!.k).toBe("Furthest above its value");
    const y = d(); y.items.forEach((e) => { e.premium = 0.05; });
    expect(priceVsValue({ d: y })).toBeNull();
  });
});

describe("Key figures of each view (the README's table)", () => {
  it("Your ETFs: what they cost, price against value, the past year", () => {
    const cs = etfKeyFigures("etfs", { d: d(), ins: ins(), rk: rk() });
    expect(cs.map((c) => c.k)).toEqual(["What they cost", "Furthest below its value", "The past year"]);
    expect(say(cs[0])).toBe("0.50% a year on average: about ₹500 on ₹1 lakh.");
    expect(cs[0].rows!.map((r) => `${r.label} ${r.text}`)).toEqual(["GOLDBEES 0.81%", "SILVERBEES 0.58%", "SMALL250 0.33%", "MID150BEES 0.28%"]);
    expect(cs[0].go).toEqual({ label: "Sort by cost", kind: "sort", arg: "ter" });
    expect(cs[1].go.kind).toBe("cols");
    expect(say(cs[2])).toBe("+3.10% on average over the past year, price only.");
    expect(cs[2].go).toEqual({ label: "Sort by 1 year", kind: "sort", arg: "r1" });
  });
  it("What's inside: silver shows as silver in Where the money is (fix 2)", () => {
    const cs = etfKeyFigures("inside", { d: d(), ins: ins(), rk: rk() });
    expect(cs.map((c) => c.k)).toEqual(["Where the money is", "Largest sector underneath", "Company sizes underneath"]);
    expect(cs[0].stack!.map((p) => p.label)).toEqual(["Indian shares", "Gold", "Silver", "Debt and cash"]);
    expect(say(cs[0])).toBe("Indian shares: 50%. Gold 24.6%, silver 25%, debt and cash under 1%.");
    expect(cs[0].note).toBe("");
    expect(say(cs[1])).toBe("Financial Services: 11.3% of your list, just ahead of Consumer Discretionary at 11.0%.");
    expect(say(cs[2])).toBe("Mostly mid-sized companies: 22.8% of your list.");
  });
  it("names the metal ETF read without its metal, the reason the money shows as debt (before the server's fix 2)", () => {
    const i = ins(); i.mix = { indian: 50, abroad: 0, gold: 24.6, silver: 0, debt: 25.4 };
    expect(metalGaps(d(), i)).toEqual(["SILVERBEES"]);
    expect(whereTheMoneyIs({ d: d(), ins: i })!.note).toMatch(/^Data to check: SILVERBEES is read without its metal/);
  });
  it("Risk: beta with its window, where the swings come from, how much it swings against the Nifty 500 with the index's window", () => {
    const cs = etfKeyFigures("risk", { d: d(), ins: ins(), rk: rk() });
    expect(cs.map((c) => say(c))).toEqual(["Beta 0.54: it has moved about 5% when the Nifty 500 moved 10%.", "SILVERBEES: 54% of the swings, from 25% of the list.", "17.0% in a typical year, against 14.4% for the Nifty 500."]);
    expect(cs[0].from).toBe("vs Nifty 500 · weekly · past year");
    expect(cs[0].line).toBe(1);
    expect(cs[2].from).toBe("Nifty 500 14.4% · 3 yrs, daily");
  });
});

describe("Windows and the list's swing (fixes 3, 4, 5)", () => {
  it("prints the window under each beta and beside the index figure, with or without the server's fields", () => {
    expect(betaWindowText(rk().etfs[0].betaWindow)).toBe("vs Nifty 500 · weekly · past year");
    expect(betaWindowText(undefined)).toBe("vs Nifty 500 · weekly · past year");
    expect(benchText(rk().bench)).toBe("Nifty 500: 14.4% (3 yrs, daily)");
    const b = rk().bench as EtfRisk["bench"]; delete b.years; delete b.grain;
    expect(benchText(b)).toBe("Nifty 500: 14.4% (3 yrs, daily)");
  });
  it("the list swing is not above the highest single ETF's swing nor their average; a breach is flagged", () => {
    const r = rk(), c = swingCheck(r);
    expect(c.cap).toBeCloseTo(23.8, 1);
    expect(c.over).toBe(false);
    expect(r.list.swing!).toBeLessThanOrEqual(Math.max(...r.etfs.map((e) => e.swing!)));
    r.list.swing = 25.3;
    expect(swingCheck(r).over).toBe(true);
  });
  it("the cost card averages AMFI's expense ratios: 0.50% a year, about ₹500 on ₹1 lakh", () => {
    const c = costCard(d());
    expect(c.ter!.toFixed(2)).toBe("0.50");
    expect(c.perLakh).toBe(500);
  });
});

describe("What changed: the companies inside the ETFs (change 19)", () => {
  it("lists the companies that are 0.3% or more of the ETFs, with their weight and ETF", () => {
    const cos = insideCompanies(d(), ins());
    expect(cos.every((c) => c.w >= 0.3)).toBe(true);
    const by = new Map(cos.map((c) => [c.symbol, c]));
    expect(insideLine(by.get("WELCORP")!)).toBe("0.36% of your ETFs · SMALL250");
    expect(insideLine(by.get("GVT&D")!)).toBe("0.33% of your ETFs · MID150BEES");
    expect(by.has("CO001")).toBe(false);
  });
  it("without the server's ETFs per company, names the top-holdings table's ETFs, or leaves the ETF out (never guesses)", () => {
    const i = ins();
    for (const c of Object.values(i.lookThrough!.macro)) for (const s of c.stocks) delete s.etfs;
    const by = new Map(insideCompanies(d(), i).map((c) => [c.symbol, c]));
    expect(by.get("LAURUSLABS")!.etfs).toEqual(["MID150BEES"]);
    expect(insideLine(by.get("WELCORP")!)).toBe("0.36% of your ETFs");
  });
});
