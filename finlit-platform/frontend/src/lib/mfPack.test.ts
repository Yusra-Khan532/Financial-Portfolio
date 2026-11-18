// The MF portfolio's names and tags. The tiles, cards and tabs (task #183 part 2) are tested in lib/mfTop.test.ts and mf/pack/mf*183.test.tsx.
import { describe, expect, it } from "vitest";
import { wordCase } from "../mf/pack/MfPack";
import { fundName, fundTag, shortFund } from "./mfPack";

describe("MF portfolio words", () => {
  it("names and tags", () => {
    expect([wordCase("AVERAGE"), wordCase("Healthy"), wordCase(null)]).toEqual(["Average", "Healthy", ""]);
    expect(shortFund("HDFC Flexi Cap Fund - Growth Option - Direct Plan")).toBe("HDFC Flexi Cap");
    expect(shortFund("ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund)")).toBe("ICICI Prudential Large Cap");
    expect(shortFund("SBI SMALL CAP FUND")).toBe("SBI Small Cap");
    expect(fundName("Quant Small Cap Fund - Regular Plan - Growth")).toBe("Quant Small Cap Fund");
    expect(fundTag("HDFC Flexi Cap Fund", "HDFC Mutual Fund", "Flexi Cap")).toBe("HDFC FC");
    expect(fundTag("ICICI Prudential Large Cap Fund", "ICICI Prudential Mutual Fund", "Large Cap")).toBe("ICICI LC");
  });
});
