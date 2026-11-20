// Task #235 (pack C3): the Watch-out card on All my investments names the shares that read Weak, with their scores, as in the pack.
// Task #277 (20 Nov pack, live number fix 9): each name is paired with its own score, and a BSE-only code shows the company's name
// ("GLENMARK, APOLLO and 526433, 44, 45 and 47" read as two lists that did not line up).
import { describe, expect, it } from "vitest";
import { watchTitle } from "./AllTogether";

const R = (symbol: string, score: number | null, name?: string) => ({ symbol, score, name });
describe("Watch-out title", () => {
  it("fix 9: names with their scores, the company's name for a BSE code", () => {
    expect(watchTitle(3, "Weak", [R("GLENMARK", 44), R("APOLLO", 45), R("526433", 47, "ASM Technologies Ltd")])).toBe("Three shares read Weak: GLENMARK 44, APOLLO 45 and ASM Technologies 47");
  });
  it("two shares, the same score; one share; Weak or Poor together", () => {
    expect(watchTitle(2, "Weak", [R("APOLLO", 44), R("GLENMARK", 44.2)])).toBe("Two shares read Weak: APOLLO 44 and GLENMARK 44");
    expect(watchTitle(1, "Weak", [R("ITC", 41)])).toBe("One share reads Weak: ITC 41");
    expect(watchTitle(3, "Poor or Weak", [R("A", 30), R("B", 38), R("C", 44)])).toBe("Three shares read Poor or Weak: A 30, B 38 and C 44");
  });
  it("more than three: three with their scores and the rest counted; a missing score leaves that name bare", () => {
    expect(watchTitle(5, "Weak", [R("A", 30), R("B", 31), R("C", 32), R("D", 33), R("E", 34)])).toBe("Five shares read Weak: A 30, B 31, C 32 and 2 more");
    expect(watchTitle(2, "Weak", [R("A", 30), R("B", null)])).toBe("Two shares read Weak: A 30 and B");
    expect(watchTitle(2, "Weak", [])).toBe("Two shares read Weak");
  });
});
