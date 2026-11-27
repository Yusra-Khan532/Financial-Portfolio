// Owner, 27 Nov 2026: "We want our company's logo at that fav icon". The tab icon was a crop of the logo's "L + chart bars"; it is now the whole
// FinLit mark (scripts/make-favicons.py), and /favicon.ico exists (it returned 404, and some browsers and search engines ask for it first).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FE = process.cwd();
const html = readFileSync(resolve(FE, "index.html"), "utf8");

/** Width and height of a PNG from its IHDR chunk. */
const pngSize = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];

describe("tab icon: the FinLit logo", () => {
  it("index.html links favicon.ico and the 16, 32, 48 and 96 px icons, and each file is there at its size", () => {
    expect(html).toContain('href="%BASE_URL%favicon.ico"');
    for (const n of [16, 32, 48, 96]) {
      expect(html).toContain(`sizes="${n}x${n}" href="%BASE_URL%favicon-${n}.png"`);
      expect(pngSize(readFileSync(resolve(FE, `public/favicon-${n}.png`)))).toEqual([n, n]);
    }
  });

  it("favicon.ico holds 16, 32 and 48 px images", () => {
    const b = readFileSync(resolve(FE, "public/favicon.ico"));
    expect(b.readUInt16LE(2)).toBe(1);                                  // an icon file
    const sizes = Array.from({ length: b.readUInt16LE(4) }, (_, i) => b[6 + i * 16] || 256).sort((x, y) => x - y);
    expect(sizes).toEqual([16, 32, 48]);
  });

  it("the icon is the full mark (a larger file than the old one-letter crop) and no unused size is shipped", () => {
    expect(readFileSync(resolve(FE, "public/favicon-48.png")).length).toBeGreaterThan(1000);
    expect(existsSync(resolve(FE, "public/favicon-64.png"))).toBe(false);
  });
});
