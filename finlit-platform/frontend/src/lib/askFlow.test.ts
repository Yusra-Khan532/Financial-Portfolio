import { describe, expect, it } from "vitest";
import { QUARTERS, financialYears, quarterQuestion } from "./askFlow";

describe("FinLit AI period choice", () => {
  it("financial years run April to March and are named by the year they end in", () => {
    expect(financialYears(new Date(2026, 10, 12))).toEqual(["FY27", "FY26", "FY25", "FY24"]);      // 12 Nov 2026 is inside FY27
    expect(financialYears(new Date(2027, 1, 3))).toEqual(["FY27", "FY26", "FY25", "FY24"]);        // 3 Feb 2027 is still FY27
    expect(financialYears(new Date(2027, 3, 1))[0]).toBe("FY28");                                  // 1 April 2027 starts FY28
  });
  it("a quarter question names the quarter and the year, and still works without a year", () => {
    const q = QUARTERS[1];
    expect(quarterQuestion("TCS", q, "FY26")).toBe("How did TCS do in Q2 of FY26 (Jul–Sep): revenue, profit and margins against the same quarter a year earlier?");
    expect(quarterQuestion("TCS", q)).toContain("latest financial year");
  });
});
