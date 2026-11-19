import { describe, expect, it } from "vitest";
import { companySize, sizeOfRow } from "./companySize";

describe("FinLit's four company sizes (20 Nov pack, SHARED §2)", () => {
  it("puts each edge where the pack says", () => {
    expect(companySize(9999.99)).toBe("micro");
    expect(companySize(10000)).toBe("small");
    expect(companySize(24999.99)).toBe("small");
    expect(companySize(25000)).toBe("mid");
    expect(companySize(75000)).toBe("mid");
    expect(companySize(75000.01)).toBe("large");
    expect(companySize(null)).toBeNull();
    expect(companySize(Number.NaN)).toBeNull();
  });
  it("reads the stored size field first and falls back to the market value", () => {
    expect(sizeOfRow({ size: "Large", market_cap: 100 })).toBe("large");
    expect(sizeOfRow({ size: "x", market_cap: 30000 })).toBe("mid");
    expect(sizeOfRow({ market_cap: 5000 })).toBe("micro");
    expect(sizeOfRow(null)).toBeNull();
  });
});
