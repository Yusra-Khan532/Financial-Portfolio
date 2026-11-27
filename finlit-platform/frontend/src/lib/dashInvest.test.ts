import { describe, expect, it } from "vitest";

describe("QA 24 Nov: one 'held' rule for every holding", () => {
  it("held only with a quantity above 0; ETFs with no quantity read 'in portfolio'", async () => {
    const { heldWord, etfRows } = await import("./dashInvest");
    expect([heldWord(5), heldWord(0), heldWord(null), heldWord(undefined)]).toEqual(["held", "in portfolio", "in portfolio", "in portfolio"]);
    const rows = etfRows([{ symbol: "GOLDBEES", name: "Gold BeES", gone: false, qty: null }, { symbol: "NIFTYBEES", name: "Nifty BeES", gone: false, qty: 10 }]);
    expect(rows.map((r) => r.sub)).toEqual(["Gold BeES · in portfolio", "Nifty BeES · held"]);
  });
});
