// Task #197: on a lender's company page (Shriram Finance) the EV/EBITDA and Debt/Equity tiles showed a bare dash. They are not used for banks and
// lenders by design; the tile now says so, and any other blank tile says why.
import { describe, expect, it } from "vitest";
import { blankWhy } from "./Hero";

describe("blank headline tiles", () => {
  it("a lender's Debt/Equity and EV/EBITDA say they are not used for lenders, with the server's reason when it gives one", () => {
    const de = blankWhy("debt_to_equity", "Debt/Equity", true, {});
    expect(de.short).toBe("Not used for lenders");
    expect(de.long).toBe("Debt/Equity is not shown for banks and lenders: their debt is their raw material.");
    const ev = blankWhy("ev_ebitda", "EV/EBITDA", true, { ev_ebitda: "EV/EBITDA is not shown for banks and lenders: their debt is their raw material." });
    expect(ev).toEqual({ short: "Not used for lenders", long: "EV/EBITDA is not shown for banks and lenders: their debt is their raw material." });
  });
  it("any other blank uses the server's reason, or says the provider sent none", () => {
    expect(blankWhy("pe", "P/E", false, { pe: "FinEdge sent no P/E and it cannot be worked out." })).toEqual({ short: "Not available", long: "FinEdge sent no P/E and it cannot be worked out." });
    expect(blankWhy("roce", "ROCE", false, undefined)).toEqual({ short: "Not reported", long: "ROCE: the data provider sent no figure for this company." });
    expect(blankWhy("debt_to_equity", "Debt/Equity", false, {}).short).toBe("Not reported");   // a non-lender's D/E is never called "not used"
  });
});
