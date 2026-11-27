import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CAP_BUCKETS, SIZE_LINES, SIZE_SHORTS, capBucket, sizeShort } from "./capBuckets";
import { capSize } from "./format";

describe("capBucket (task #262: the owner's four sizes of 20 Nov 2026)", () => {
  it("has the four sizes of the one site-wide scale, biggest first", () => {
    expect(CAP_BUCKETS.map((b) => b.id)).toEqual(["large", "mid", "small", "micro"]);
    expect(CAP_BUCKETS.map((b) => b.label)).toEqual(["Large cap", "Mid cap", "Small cap", "Micro cap"]);
    expect(SIZE_SHORTS).toEqual(["Large", "Mid", "Small", "Micro"]);
    expect(CAP_BUCKETS.map((b) => b.range)).toEqual(["Above ₹75,000 Cr", "₹25,000–75,000 Cr", "₹10,000–25,000 Cr", "Below ₹10,000 Cr"]);
    expect(SIZE_LINES).toEqual({ largeAbove: 75000, midFrom: 25000, smallFrom: 10000 });
  });
  it("puts the pack's cases in the right size", () => {
    const id = (v: number | null) => capBucket(v)?.id ?? null;
    expect(id(9999.99)).toBe("micro");
    expect(id(10000)).toBe("small");
    expect(id(24999.99)).toBe("small");
    expect(id(25000)).toBe("mid");
    expect(id(75000)).toBe("mid");
    expect(id(75000.01)).toBe("large");
    expect(id(null)).toBeNull();
  });
  it("covers the whole range, with no gap and no overlap", () => {
    const id = (v: number) => capBucket(v)?.id;
    expect([0, 12.5, 500, 9999, 10001, 24000, 25001, 74999, 2000000].map(id)).toEqual(["micro", "micro", "micro", "micro", "small", "small", "mid", "mid", "large"]);
  });
  it("is the one rule behind the size word on every page", () => {
    expect([capSize(80000), capSize(30000), capSize(15000), capSize(9000), capSize(null)]).toEqual(["Large cap", "Mid cap", "Small cap", "Micro cap", null]);
    expect([sizeShort(80000), sizeShort(9000), sizeShort(undefined)]).toEqual(["Large", "Micro", null]);
  });
  it("says nothing when the value is not known", () => {
    expect(capBucket(null)).toBeNull(); expect(capBucket(undefined)).toBeNull(); expect(capBucket(NaN)).toBeNull(); expect(capBucket(-5)).toBeNull();
  });
});

// Guard: no source file outside capBuckets.ts may carry the old three-size copy.
const SRC = join(process.cwd(), "src");
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === "__fixtures__" ? [] : files(p)) : /\.(tsx?|json|css)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []; });
describe("no old size copy anywhere on the site", () => {
  it("has no 'three sizes', no 'Small below ₹10,000' and no ₹50,000 Cr size line outside capBuckets.ts", () => {
    const bad: string[] = [];
    for (const f of files(SRC)) {
      if (f.endsWith(join("lib", "capBuckets.ts"))) continue;
      const t = readFileSync(f, "utf8");
      if (/three sizes/i.test(t)) bad.push(`${f}: "three sizes"`);
      if (/small (cap )?below ₹10,000/i.test(t)) bad.push(`${f}: "Small below ₹10,000"`);
      if (/(large|large cap)\s+above ₹50,000|above ₹50,000 (Cr|crore)|₹10,000(–| to )50,000 Cr|₹10,000 crore to ₹50,000 crore/i.test(t)) bad.push(`${f}: an old ₹50,000 Cr size line`);
    }
    expect(bad).toEqual([]);
  });
});
