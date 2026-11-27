// Task #399: the SIP calculator without sliders. Wide typed limits, and figures that fit their boxes at any size (team image 2: ₹10,00,000 a month,
// 50 years, 30% showed "₹10873743 Cr" and "181229.05× what you put in" spilling out of the ring).
import { describe, expect, it } from "vitest";
import { LIMITS, fromQuery, money, project, rupees, short, times, toInput, DEFAULT_STATE } from "./sip";

describe("task #399: limits", () => {
  it("are wide now the sliders are gone: ₹10 crore a month, 60 years, 50% a year, a ₹1,000 crore one-time amount", () => {
    expect(LIMITS.monthlyMax).toBe(100_000_000);
    expect(LIMITS.yearsMax).toBe(60);
    expect(LIMITS.returnMax).toBe(50);
    expect(LIMITS.lumpMax).toBe(10_000_000_000);
    expect(LIMITS.inflationMax).toBe(30);
  });
  it("the maths stays finite at the very top of every limit", () => {
    const r = project(toInput({ ...DEFAULT_STATE, monthly: LIMITS.monthlyMax, years: LIMITS.yearsMax, annualReturn: LIMITS.returnMax, lumpSum: LIMITS.lumpMax, stepKind: "pct", stepValue: LIMITS.stepPctMax }));
    for (const v of [r.value, r.invested, r.gain]) { expect(Number.isFinite(v)).toBe(true); expect(Number.isNaN(v)).toBe(false); }
    expect(r.value).toBeGreaterThan(r.invested);
  });
  it("a link with the team's image-2 values is read as given, not cut back to the old caps", () => {
    const s = fromQuery(new URLSearchParams("p=1000000&y=50&r=30"));
    expect([s.monthly, s.years, s.annualReturn]).toEqual([1_000_000, 50, 30]);
    const big = fromQuery(new URLSearchParams("p=50000000&y=60&r=45"));
    expect([big.monthly, big.years, big.annualReturn]).toEqual([50_000_000, 60, 45]);
  });
});

describe("task #399: figures fit their boxes", () => {
  const r = project(toInput({ ...DEFAULT_STATE, monthly: 1_000_000, years: 50, annualReturn: 30 }));
  it("the ring reads lakh crore with Indian grouping, never a long run of digits", () => {
    expect(short(r.value)).toMatch(/^₹[\d,]+(\.\d+)? L Cr$/);
    expect(short(r.value).length).toBeLessThanOrEqual(13);
    expect(short(1.0873743e14)).toBe("₹109 L Cr");
    expect(short(5e9)).toBe("₹500 Cr");
    expect(short(1.2345e10)).toBe("₹1,235 Cr");
    expect(short(Infinity)).toBe("—");
  });
  it("the multiple is grouped: 1,81,229× rather than 181229.05×", () => {
    expect(times(181229.05)).toBe("1,81,229×");
    expect(times(1.92)).toBe("1.92×");
    expect(times(186.44)).toBe("186.4×");
    expect(times(0)).toBe("0×");
  });
  it("a box shows the full amount up to ₹999 crore and the short form above it (the full amount stays in the title)", () => {
    expect(money(575097)).toBe("₹5,75,097");
    expect(money(9_999_999_999)).toBe(rupees(9_999_999_999));
    expect(money(6e9 * 10)).toBe("₹6,000 Cr");
    expect(money(1.0873743e14)).toBe("₹109 L Cr");
  });
});
