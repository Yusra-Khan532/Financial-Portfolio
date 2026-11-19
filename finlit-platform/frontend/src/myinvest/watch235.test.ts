// Task #235 (pack C3): the Watch-out card on All my investments names the shares that read Weak, with their scores, as in the pack.
import { describe, expect, it } from "vitest";
import { watchTitle } from "./AllTogether";

const R = (symbol: string, score: number | null) => ({ symbol, score });
describe("Watch-out title (pack C3)", () => {
  it("reads as the pack: two shares, the same score", () => {
    expect(watchTitle(2, "Weak", [R("APOLLO", 44), R("GLENMARK", 44.2)])).toBe("Two shares read Weak: APOLLO and GLENMARK, both 44");
  });
  it("one share, different scores, and Weak or Poor together", () => {
    expect(watchTitle(1, "Weak", [R("ITC", 41)])).toBe("One share reads Weak: ITC, 41");
    expect(watchTitle(3, "Poor or Weak", [R("A", 30), R("B", 38), R("C", 44)])).toBe("Three shares read Poor or Weak: A, B and C, 30, 38 and 44");
  });
  it("more than three: three names and the rest counted, no scores; a missing score drops the scores", () => {
    expect(watchTitle(5, "Weak", [R("A", 30), R("B", 31), R("C", 32), R("D", 33), R("E", 34)])).toBe("Five shares read Weak: A, B, C and 2 more");
    expect(watchTitle(2, "Weak", [R("A", 30), R("B", null)])).toBe("Two shares read Weak: A and B");
    expect(watchTitle(2, "Weak", [])).toBe("Two shares read Weak");
  });
});
