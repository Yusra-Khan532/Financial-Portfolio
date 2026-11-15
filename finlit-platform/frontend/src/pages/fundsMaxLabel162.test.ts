import { describe, expect, it } from "vitest";
import { maxLabel } from "./Funds";

// Task #162: the full NAV history is kept from AMFI's first day (1 April 2006). "Since launch" is only true for a fund whose NAVs start later.
describe("NAV chart: the longest range's label", () => {
  it("says since launch for a fund that started after AMFI's history begins", () => {
    expect(maxLabel("2019-01-01")).toBe("Since launch");
  });
  it("says since 2006 when the history reaches AMFI's first day (the fund may be older)", () => {
    expect(maxLabel("2006-04-03")).toBe("Since 2006");
    expect(maxLabel(undefined)).toBe("Since 2006");
  });
});
