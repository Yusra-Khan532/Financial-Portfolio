import { describe, expect, it } from "vitest";
import { axisUnit, niceCeil, niceRange, niceTicks } from "./chartUnits";

describe("statement chart units and ticks", () => {
  it("draws in rupees crore until one lakh crore, so a ₹3,000 Cr company never reads 0.03", () => {
    expect(axisUnit(3125)).toEqual({ div: 1, label: "₹ Cr", digits: 0 });
    expect(axisUnit(99999).div).toBe(1);
    expect(axisUnit(250000)).toEqual({ div: 1e5, label: "₹ lakh Cr", digits: 2 });
  });
  it("tops an axis at a round number and puts the ticks at zero, half and the top", () => {
    expect(niceCeil(4873)).toBe(5000); expect(niceCeil(3480)).toBe(5000); expect(niceCeil(2300)).toBe(2500); expect(niceCeil(1)).toBe(1); expect(niceCeil(0)).toBe(1); expect(niceCeil(87)).toBe(100);
    expect(niceTicks(4873)).toEqual({ top: 5000, ticks: [0, 2500, 5000] });
  });
  it("a two-sided axis covers losses and gains with a round step", () => {
    const r = niceRange(-1800, 5200);
    expect(r.lo).toBeLessThanOrEqual(-1800); expect(r.hi).toBeGreaterThanOrEqual(5200); expect(r.lo % 1000 === 0 || r.lo % 500 === 0).toBe(true);
    expect(niceRange(0, 900)).toEqual({ lo: 0, hi: 1000 });
  });
});
