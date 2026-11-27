// F&O Academy payoff maths (lib/payoff.ts): every structure at key prices, its breakevens and its largest profit and loss, against hand-worked
// figures (the same numbers the lessons of modules 3 and 7 print).
import { describe, expect, it } from "vitest";
import { STRUCTURES, analyse, buildLegs, legValue, payoffAt, priceRange, structure, type StructureId } from "./payoff";

const at = (id: StructureId, prices: number[], writer = false) => { const s = structure(id); const legs = buildLegs(s, s.preset, 1, writer); return prices.map((p) => payoffAt(legs, p, s.lotSize)); };
const an = (id: StructureId, writer = false) => { const s = structure(id); return analyse(buildLegs(s, s.preset, 1, writer), s.lotSize); };

describe("payoff at expiry", () => {
  it("one leg per unit: call, put and shares, for the buyer and the writer", () => {
    expect(legValue({ kind: "call", side: 1, strike: 100, premium: 5, lots: 1 }, 112)).toBe(7);
    expect(legValue({ kind: "call", side: -1, strike: 100, premium: 5, lots: 1 }, 112)).toBe(-7);
    expect(legValue({ kind: "put", side: 1, strike: 100, premium: 5, lots: 1 }, 112)).toBe(-5);
    expect(legValue({ kind: "put", side: -1, strike: 100, premium: 5, lots: 1 }, 90)).toBe(-5);
    expect(legValue({ kind: "shares", side: 1, strike: 100, premium: 0, lots: 1 }, 90)).toBe(-10);
  });
  it("call (buyer): 24,000 at ₹180, lot 65", () => {
    expect(at("long-call", [23800, 24000, 24180, 24500])).toEqual([-11700, -11700, 0, 20800]);
    expect(an("long-call")).toMatchObject({ breakevens: [24180], maxLoss: { value: -11700, unlimited: false, at: "at 24,000 and below" }, maxProfit: { unlimited: true }, netPremium: 180 });
  });
  it("put (buyer): 24,000 at ₹150", () => {
    expect(at("long-put", [23600, 23700, 23850, 24200])).toEqual([16250, 9750, 0, -9750]);
    expect(an("long-put")).toMatchObject({ breakevens: [23850], maxLoss: { value: -9750, at: "at 24,000 and above" }, maxProfit: { value: (24000 - 150) * 65, at: "if the price fell to 0" } });
  });
  it("covered call: shares from 1,200, 1,260 call written at ₹22, 500 shares", () => {
    expect(at("covered-call", [0, 1150, 1178, 1260, 1400])).toEqual([-589000, -14000, 0, 41000, 41000]);
    expect(an("covered-call")).toMatchObject({ breakevens: [1178], maxProfit: { value: 41000, at: "at 1,260 and above", unlimited: false }, maxLoss: { value: -589000, at: "if the price fell to 0" }, netPremium: -22 });
  });
  it("protective put: shares from 1,200, 1,150 put at ₹18", () => {
    expect(at("protective-put", [900, 1150, 1218, 1300])).toEqual([-34000, -34000, 0, 41000]);
    expect(an("protective-put")).toMatchObject({ breakevens: [1218], maxLoss: { value: -34000, at: "at 1,150 and below" }, maxProfit: { unlimited: true } });
  });
  it("call spread: 24,000 at ₹180, 24,200 written at ₹90", () => {
    expect(at("call-spread", [23900, 24090, 24200, 24600])).toEqual([-5850, 0, 7150, 7150]);
    expect(an("call-spread")).toMatchObject({ breakevens: [24090], maxProfit: { value: 7150, at: "at 24,200 and above" }, maxLoss: { value: -5850, at: "at 24,000 and below" }, netPremium: 90 });
  });
  it("put spread: 24,000 at ₹160, 23,800 written at ₹85", () => {
    expect(at("put-spread", [23500, 23800, 23925, 24100])).toEqual([8125, 8125, 0, -4875]);
    expect(an("put-spread")).toMatchObject({ breakevens: [23925], maxProfit: { value: 8125, at: "at 23,800 and below" }, maxLoss: { value: -4875, at: "at 24,000 and above" } });
  });
  it("straddle, both sides: 24,000 call ₹180 and put ₹160", () => {
    expect(at("straddle", [23500, 23660, 24000, 24340, 24600])).toEqual([10400, 0, -22100, 0, 16900]);
    expect(an("straddle")).toMatchObject({ breakevens: [23660, 24340], maxLoss: { value: -22100, at: "at 24,000" }, maxProfit: { unlimited: true }, netPremium: 340 });
    expect(at("straddle", [24000, 24600], true)).toEqual([22100, -16900]);
    expect(an("straddle", true)).toMatchObject({ breakevens: [23660, 24340], maxProfit: { value: 22100, at: "at 24,000" }, maxLoss: { unlimited: true }, netPremium: -340 });
  });
  it("strangle: 23,800 put ₹85 and 24,200 call ₹90", () => {
    expect(at("strangle", [23500, 23625, 24000, 24375, 24500])).toEqual([8125, 0, -11375, 0, 8125]);
    expect(an("strangle")).toMatchObject({ breakevens: [23625, 24375], maxLoss: { value: -11375, at: "from 23,800 to 24,200" } });
    expect(an("strangle", true)).toMatchObject({ maxProfit: { value: 11375, at: "from 23,800 to 24,200" }, maxLoss: { unlimited: true } });
  });
  it("iron condor: puts 23,600/23,800, calls 24,200/24,400, net credit 90", () => {
    expect(at("iron-condor", [23000, 23600, 23710, 24000, 24290, 24350, 25000])).toEqual([-7150, -7150, 0, 5850, 0, -3900, -7150]);
    expect(an("iron-condor")).toMatchObject({ breakevens: [23710, 24290], netPremium: -90,
      maxProfit: { value: 5850, at: "from 23,800 to 24,200", unlimited: false }, maxLoss: { value: -7150, at: "at 23,600 and below or at 24,400 and above", unlimited: false } });
  });
  it("lots multiply every result; a breakeven does not move with lots", () => {
    const s = structure("call-spread");
    const two = buildLegs(s, s.preset, 2);
    expect(payoffAt(two, 24600, s.lotSize)).toBe(14300);
    expect(analyse(two, s.lotSize).breakevens).toEqual([24090]);
    expect(analyse(two, s.lotSize).netPremium).toBe(180);
  });
  it("the writer's side is offered only where flipping makes sense", () => {
    expect(STRUCTURES.filter((s) => s.flip).map((s) => s.id)).toEqual(["straddle", "strangle"]);
    const cc = structure("covered-call");
    expect(buildLegs(cc, cc.preset, 1, true)).toEqual(buildLegs(cc, cc.preset, 1, false));
  });
  it("input checks: strikes in the wrong order are named", () => {
    expect(structure("call-spread").check!({ k1: 24200, c1: 90, k2: 24000, c2: 180 })).toMatch(/lower strike/);
    expect(structure("iron-condor").check!({ k1: 23800, p1: 1, k2: 23600, p2: 1, k3: 24200, c3: 1, k4: 24400, c4: 1 })).toMatch(/rise/);
    expect(structure("strangle").check!(structure("strangle").preset)).toBeNull();
  });
  it("the drawn price range holds every strike, breakeven and the price now", () => {
    for (const s of STRUCTURES) {
      const legs = buildLegs(s, s.preset, 1), a = analyse(legs, s.lotSize), [lo, hi] = priceRange(legs, s.spot, a);
      for (const x of [s.spot, ...a.kinks, ...a.breakevens]) { expect(x, s.id).toBeGreaterThan(lo); expect(x, s.id).toBeLessThan(hi); }
      expect(lo, s.id).toBeGreaterThanOrEqual(0);
    }
  });
});
