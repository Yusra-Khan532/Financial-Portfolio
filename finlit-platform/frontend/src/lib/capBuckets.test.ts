import { describe, expect, it } from "vitest";
import { CAP_BUCKETS, capBucket } from "./capBuckets";
import { capSize } from "./format";

describe("capBucket", () => {
  it("has the three sizes of the one site-wide scale, biggest first: no Mega, no Micro, no Nano", () => {
    expect(CAP_BUCKETS.map((b) => b.label)).toEqual(["Large cap", "Mid cap", "Small cap"]);
    expect(CAP_BUCKETS.map((b) => b.range)).toEqual(["Above ₹50,000 Cr", "₹10,000–50,000 Cr", "Below ₹10,000 Cr"]);
  });
  it("puts a market value in its size, edges going to the size whose range ends there", () => {
    const id = (v: number) => capBucket(v)?.id;
    expect(id(2000000)).toBe("large"); expect(id(50001)).toBe("large"); expect(id(50000)).toBe("mid");
    expect(id(10001)).toBe("mid"); expect(id(10000)).toBe("small"); expect(id(500)).toBe("small"); expect(id(0)).toBe("small"); expect(id(12.5)).toBe("small");
  });
  it("is the one rule behind the size word on every page", () => {
    expect([capSize(60000), capSize(30000), capSize(9000), capSize(null)]).toEqual(["Large cap", "Mid cap", "Small cap", null]);
  });
  it("says nothing when the value is not known", () => {
    expect(capBucket(null)).toBeNull(); expect(capBucket(undefined)).toBeNull(); expect(capBucket(NaN)).toBeNull(); expect(capBucket(-5)).toBeNull();
  });
});
