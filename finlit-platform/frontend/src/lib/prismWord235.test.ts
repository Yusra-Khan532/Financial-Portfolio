// Task #235 (the 18 Nov pack, live bug E2): one Prism word for a score on every page, with the server's edges (80 Strong, 65 Healthy, 50 Average, 35 Weak).
// Before, the Equity table cut at 70 and 50 with three words, so KINGFA 68 read Average there and Healthy on All my investments.
import { describe, expect, it } from "vitest";
import { prismBandWord } from "./scoreBands";
import { prismWord } from "./equityPack";

describe("the Prism word of a score", () => {
  it("reads the pack's examples the same as All my investments, and uses a stored label as it is", () => {
    expect([68, 82, 44, 50, 34.9, 80].map((v) => prismBandWord(v))).toEqual(["Healthy", "Strong", "Weak", "Average", "Poor", "Strong"]);
    expect(prismBandWord(68, "HEALTHY")).toBe("Healthy");
    expect(prismBandWord(null)).toBeNull();
    expect(prismWord(68)).toBe("Healthy");
  });
});
