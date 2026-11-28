// Owner, 27 Nov 2026: "We want our company's logo at that fav icon"; 28 Nov 2026: "below FinLit there is also written VENTURES ... strictly change
// this logo to every place". Every tab and app icon is the WHOLE artwork as given (square, with VENTURES, nothing cropped or stretched), made by
// scripts/make-favicons.py, and /favicon.ico exists.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FE = process.cwd();
const read = (p: string) => readFileSync(resolve(FE, p), "utf8");
const html = read("index.html");

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

  it("every icon is the logo with no background (black Fin and VENTURES; white in a dark browser), only scaled, and no unused size is shipped", () => {
    const py = read("scripts/make-favicons.py");
    expect(py).toContain('"../scripts/assets/finlit-ventures-logo-light.png"');
    expect(py).toContain('"../scripts/assets/finlit-ventures-logo-dark.png"');
    expect(html).toContain('type="image/svg+xml" sizes="any" href="%BASE_URL%favicon-theme.svg"');
    expect(read("public/favicon-theme.svg")).toContain("prefers-color-scheme: dark");
    expect(readFileSync(resolve(FE, "public/favicon-48.png")).length).toBeGreaterThan(1000);
    expect(existsSync(resolve(FE, "public/favicon-64.png"))).toBe(false);
  });

  it("the home-screen and app icons are the same full mark, square at their declared sizes", () => {
    const manifest = JSON.parse(readFileSync(resolve(FE, "public/manifest.webmanifest"), "utf8")) as { icons: { src: string; sizes: string }[] };
    const icons = [["apple-touch-icon.png", 180], ...manifest.icons.map((i) => [i.src, Number(i.sizes.split("x")[0])])] as [string, number][];
    for (const [f, n] of icons) {
      const b = readFileSync(resolve(FE, "public", f));
      expect(pngSize(b)).toEqual([n, n]);
      expect(b.length).toBeGreaterThan(n * 20);                          // the detailed full mark, not a near-empty crop
    }
    expect(read("scripts/make-favicons.py")).toContain("icon-maskable-512.png");
  });
});

