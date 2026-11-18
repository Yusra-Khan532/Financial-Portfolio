// Task #222: the rules of section 05's "Against its industry this quarter" card, against the pack's own figures (finlit-company-report-update-18nov v3).
import { describe, expect, it } from "vitest";
import { bulletScale, columnScale, edge, gapChip, keyLine, leadParts, nextDir, pace, shortName, signed, sortPeers, verdictTone, type PeerRow } from "./industryCard";
import fx from "./__fixtures__/industryCard-18nov.json";

const text = (p: [string, boolean][]) => p.map(([t]) => t).join("");
const bold = (p: [string, boolean][]) => p.filter(([, b]) => b).map(([t]) => t);

describe("the 3-point rule (never shown on the page)", () => {
  it("within 3 points is 'about as fast as', otherwise faster or slower", () => {
    expect(pace(28.6, 29.8)).toBe("about as fast as");
    expect(pace(32.8, 29.8)).toBe("about as fast as");         // exactly 3 points
    expect(pace(32.9, 29.8)).toBe("faster than");
    expect(pace(26.7, 29.8)).toBe("slower than");
  });
  it("Reliance: both about as fast; the comparison words are the bold part", () => {
    const p = leadParts("Reliance", "Petroleum Products", 28.6, 40.6, 29.8, 37.8);
    expect(text(p)).toBe("Reliance grew about as fast as the typical Petroleum Products company.");
    expect(bold(p)).toEqual(["about as fast as"]);
    expect(text(p)).not.toMatch(/3 (percentage )?points|within/);
  });
  it("TD Power Systems: faster than", () => {
    expect(text(leadParts("TD Power Systems", "Electrical Equipment", 85.9, 105.6, 24.2, 10.9))).toBe("TD Power Systems grew faster than the typical Electrical Equipment company.");
  });
  it("names each one when sales and profit differ", () => {
    const p = leadParts("Acme", "Cement", 20, 2, 10, 9);
    expect(text(p)).toBe("Acme's sales grew faster than and its profit slower than the typical Cement company.");
    expect(bold(p)).toEqual(["faster than", "slower than"]);
  });
  it("the key-points line keeps the numbers", () => {
    expect(keyLine("Petroleum Products", 28.6, 40.6, 29.8, 37.8)).toBe("Sales and profit grew about as fast as the typical Petroleum Products company (+29.8% and +37.8%).");
    expect(keyLine("Cement", 20, 2, 10, 9)).toBe("Sales grew faster than and profit slower than the typical Cement company (+10.0% and +9.0%).");
    expect(keyLine("Cement", 5, 1, 10, -3.5)).toBe("Sales grew slower than and profit faster than the typical Cement company (+10.0% and \u22123.5%).");
  });
});

describe("gap chips", () => {
  it("say the right sign and words", () => {
    expect(gapChip(28.6, 29.8)).toEqual({ cls: "dn", text: "1.2 pts below its industry" });
    expect(gapChip(40.6, 37.8)).toEqual({ cls: "up", text: "+2.8 pts above its industry" });
    expect(gapChip(85.9, 24.2)).toEqual({ cls: "up", text: "+61.7 pts above its industry" });
    expect(gapChip(10.94, 10.9)).toEqual({ cls: "eq", text: "level with its industry" });
  });
});

describe("bars", () => {
  it("the score tile's bullet bar runs from 0 to 1.12 x the highest (the pack's positions)", () => {
    const rev = bulletScale([28.6, 29.8, 16.8]), prof = bulletScale([40.6, 37.8, 10.9]);
    expect(rev(28.6)).toBeCloseTo(85.7, 1); expect(rev(29.8)).toBeCloseTo(89.3, 1); expect(rev(16.8)).toBeCloseTo(50.3, 1);
    expect(prof(40.6)).toBeCloseTo(89.3, 1); expect(prof(37.8)).toBeCloseTo(83.1, 1); expect(prof(10.9)).toBeCloseTo(24.0, 1);
    expect(edge(rev(29.8))).toBe("ar"); expect(edge(prof(37.8))).toBe(""); expect(edge(3)).toBe("al");   // labels near either end align inward
    const neg = bulletScale([-12, 5, 3]);
    expect(neg(-12)).toBe(0); expect(neg(0)).toBeGreaterThan(0);                      // a negative figure starts the scale
  });
  it("a table column shares one scale; bars start at 0 and a negative one grows left of the zero line (the pack's positions)", () => {
    const rv = columnScale([29.8, 28.6, 29.8, 29.8, 26.0, 37.1, 10.1, 27.3, 45.7, 58.9, 122.7]);
    expect(rv.pos(29.8)).toBeCloseTo(24.3, 1); expect(rv.zero).toBe(0);
    const pf = columnScale([37.8, 40.6, 173.8, -21.5, -6.1, 203.0, 212.4, -22.6, 34.9, 422.0, 359.2]);
    expect(pf.zero).toBeCloseTo(5.1, 1); expect(pf.pos(37.8)).toBeCloseTo(13.6, 1);
    expect(pf.bar(40.6).left).toBeCloseTo(5.1, 1); expect(pf.bar(40.6).width).toBeCloseTo(9.1, 1);
    expect(pf.bar(-21.5).left + pf.bar(-21.5).width).toBeCloseTo(pf.zero, 5);       // ends at the zero line
  });
});

const peers = (sym: string): PeerRow[] => {
  const ind = fx.rows.find((r) => r.symbol === sym)!.industry;
  return fx.rows.filter((r) => r.industry === ind).sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)).slice(0, 10)
    .map((r) => ({ symbol: r.symbol, size: r.cap, rev: r.revenueYoY, profit: r.profitYoY, verdict: r.verdict as PeerRow["verdict"] }));
};

describe("sorting the biggest companies", () => {
  it("Reliance sorted by profit growth, high to low (the pack's order)", () => {
    expect(sortPeers(peers("RELIANCE"), "pf", "desc").map((r) => r.symbol)).toEqual(["SOTL", "PANAMAPET", "CHENNPETRO", "MRPL", "IOC", "RELIANCE", "GULFOILLUB", "HINDPETRO", "BPCL", "CASTROLIND"]);
  });
  it("first click high to low, second the other way; Company A to Z first", () => {
    expect(nextDir("sz", "desc", "pf")).toBe("desc");
    expect(nextDir("pf", "desc", "pf")).toBe("asc");
    expect(nextDir("pf", "asc", "pf")).toBe("desc");
    expect(nextDir("sz", "desc", "co")).toBe("asc");
    expect(sortPeers(peers("RELIANCE"), "pf", "asc").map((r) => r.symbol)[0]).toBe("CASTROLIND");
    expect(sortPeers(peers("RELIANCE"), "co", "asc").map((r) => r.symbol).slice(0, 3)).toEqual(["BPCL", "CASTROLIND", "CHENNPETRO"]);
  });
  it("Size puts Large first, Verdict Strong first, and ties keep the page's order", () => {
    const p = peers("RELIANCE");
    expect(sortPeers(p, "sz", "desc").map((r) => r.symbol)).toEqual(p.map((r) => r.symbol));          // the page's order is by size already
    const v = sortPeers(p, "vd", "desc").map((r) => r.symbol);
    expect(v.slice(0, 4)).toEqual(["IOC", "MRPL", "SOTL", "PANAMAPET"]);                                // the four Strong, in the page's order
    expect(sortPeers(p, "rv", "desc").map((r) => r.symbol).slice(3, 6)).toEqual(["MRPL", "IOC", "BPCL"]);       // both +29.8%: IOC came first on the page
  });
  it("missing figures go last both ways", () => {
    const p: PeerRow[] = [{ symbol: "A", size: "Large", rev: null, profit: 1, verdict: null }, { symbol: "B", size: "Mid", rev: 5, profit: 2, verdict: "Good" }];
    expect(sortPeers(p, "rv", "desc").map((r) => r.symbol)).toEqual(["B", "A"]);
    expect(sortPeers(p, "rv", "asc").map((r) => r.symbol)).toEqual(["B", "A"]);
  });
});

describe("words", () => {
  it("names, signs and verdict colours", () => {
    expect(shortName("Reliance Industries Ltd")).toBe("Reliance");
    expect(shortName("TD Power Systems Ltd")).toBe("TD Power Systems");
    expect(signed(-6.1)).toBe("−6.1%"); expect(signed(40.6)).toBe("+40.6%");
    expect([verdictTone("Strong"), verdictTone("Good"), verdictTone("In line"), verdictTone("Weak"), verdictTone("Poor"), verdictTone("Loss"), verdictTone(null)])
      .toEqual(["v-strong", "v-strong", "v-inline", "v-poor", "v-poor", "v-poor", "v-none"]);
  });
});
