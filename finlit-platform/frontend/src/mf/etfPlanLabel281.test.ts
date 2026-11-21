// Task #281: SBI Nifty 50 ETF (135106) read "Plan not stated" on its fund page and in lists. An ETF has no Direct or Regular plan: it reads "ETF".
import { describe, expect, it } from "vitest";
import { isEtfCategory, planLabel } from "./Bits";

describe("an ETF's plan reads ETF", () => {
  it("names ETFs by AMFI's category, as the server does", () => {
    expect(isEtfCategory("Other Scheme - Other ETFs")).toBe(true);
    expect(isEtfCategory("Exchange Traded Funds (ETFs) - Equity ETF")).toBe(true);
    expect(isEtfCategory("Equity Scheme - Small Cap Fund")).toBe(false);
    expect(isEtfCategory("Other Scheme - FoF Domestic")).toBe(false);
    expect(isEtfCategory(null)).toBe(false);
  });
  it("an unstated plan reads ETF for an ETF and 'Plan not stated' otherwise; a stated plan is unchanged", () => {
    expect(planLabel("Unspecified", "Other Scheme - Other ETFs")).toBe("ETF");
    expect(planLabel("Unspecified", "Debt Scheme - Liquid Fund")).toBe("Plan not stated");
    expect(planLabel("Direct", "Other Scheme - Other ETFs")).toBe("Direct");
  });
});
