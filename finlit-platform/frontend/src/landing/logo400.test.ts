// Task #400 rework (27 Nov 2026): "The logo has still not changed on the landing page". The header, footer and icons had the FinLit Ventures logo,
// but the product tour (both themes), its posters, the tool pictures and the loading animation still showed the old FinLit logo. These tests keep the
// old logo out: no file name of it is referenced or served, the loader is traced from the new artwork, and both tours are the new recordings whose
// sections start where the landing page's chapter buttons and tool previews expect them.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FE = process.cwd();
const read = (p: string) => readFileSync(resolve(FE, p), "utf8");
const OLD = /finlit-logo\.png|finlit-logo-on-(light|dark)\.png|favicon\.svg/;

function files(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, ext, out);
    else if (ext.test(n)) out.push(p);
  }
  return out;
}

/** The length of an MP4 in seconds, from its movie header (mvhd). */
function mp4Seconds(p: string): number {
  const b = readFileSync(p), i = b.indexOf("mvhd");
  const v = b[i + 4];
  return v === 1 ? Number(b.readBigUInt64BE(i + 4 + 4 + 16 + 4)) / b.readUInt32BE(i + 4 + 4 + 16) : b.readUInt32BE(i + 4 + 4 + 8 + 4) / b.readUInt32BE(i + 4 + 4 + 8);
}

describe("task #400: no old FinLit logo anywhere on the site", () => {
  it("no page, style, script or manifest names an old logo file, and none of them is served", () => {
    const src = [...files(resolve(FE, "src"), /\.(tsx?|jsx?|css)$/), resolve(FE, "index.html"), ...files(resolve(FE, "public"), /\.(html|js|css|json|webmanifest|svg)$/)]
      .filter((p) => !p.endsWith("logo400.test.ts"));
    const hits = src.filter((p) => OLD.test(readFileSync(p, "utf8")));
    expect(hits).toEqual([]);
    for (const f of ["public/brand/finlit-logo.png", "public/brand/finlit-logo-on-light.png", "public/brand/finlit-logo-on-dark.png", "public/favicon.svg"]) expect(existsSync(resolve(FE, f))).toBe(false);
    for (const f of ["logo-on-light", "logo-on-dark"]) expect(existsSync(resolve(FE, `public/brand/finlit-ventures-${f}.png`))).toBe(true);   // the tour's end card (record-home-tour.mjs)
    // owner, 28 Nov 2026: the logo is shown whole, with VENTURES, as the artwork; the cut-down wordmarks without VENTURES are gone
    for (const f of ["wordmark-on-light", "wordmark-on-dark"]) expect(existsSync(resolve(FE, `public/brand/finlit-ventures-${f}.png`))).toBe(false);
    // owner, 28 Nov 2026: the logo has no background: black Fin and VENTURES on the light site, white on the dark site
    for (const v of ["light", "dark"]) expect(existsSync(resolve(FE, `public/brand/finlit-ventures-logo-${v}.webp`))).toBe(true);
    expect(existsSync(resolve(FE, "public/brand/finlit-ventures-logo.webp"))).toBe(false);
    const css = read("src/styles/finlit.css");
    expect(css).toContain('url("/brand/finlit-ventures-logo-light.webp")');
    expect(css).toMatch(/:root\[data-theme="dark"\] \.lg-mark, footer \.lg-mark \{ background-image: url\("\/brand\/finlit-ventures-logo-dark\.webp"\)/);
  });

  it("the loading animation (and the first-load splash) is the earlier one (owner, 28 Nov 2026: a new animation is made separately): no frame, no VENTURES", () => {
    expect(read("src/components/logoPaths.ts")).not.toMatch(/LOGO_VENTURES|LOGO_PANEL/);
    const paths = read("src/components/logoPaths.ts");
    expect(paths).toContain("from scripts/assets/finlit-ventures-logo-source.webp");
    expect(paths).not.toContain("LOGO_HAIR");
    expect(existsSync(resolve(FE, "../scripts/assets/finlit-ventures-logo-source.webp"))).toBe(true);
    const vb = paths.match(/LOGO_VIEWBOX = "([^"]+)"/)?.[1] ?? "";
    expect(read("index.html")).toContain(`viewBox="${vb}"`);                    // the splash is the regenerated markup
    expect(read("src/components/LogoLoader.tsx")).toMatch(/<g className="ll-person"><circle className="ll-ink"/);
    expect(read("src/styles/logo-loader.css")).not.toContain("ll-hair");
  });

  it("both tours are the new recordings, and each section starts where the chapter buttons and the tool previews expect it", () => {
    const rec = read("../scripts/record-home-tour.mjs");
    const LEN = JSON.parse(rec.match(/const LEN = (\[[^\]]+\])/)?.[1] ?? "[]") as number[];
    const FADE = Number(rec.match(/const FADE = ([\d.]+)/)?.[1]);
    expect(LEN.length).toBe(8);                                                  // seven sections and the end card
    const starts = LEN.slice(0, 7).map((_, k) => +(LEN.slice(0, k).reduce((a, b) => a + b, 0) - k * FADE).toFixed(2));
    const js = read("src/landing/golive.js");
    const CH = JSON.parse((js.match(/var CH=(\[\[[^;]+\]\]);/)?.[1] ?? "[]").replace(/'/g, '"')) as [string, number][];
    expect(CH.map((c) => c[1])).toEqual(starts);
    const REC = JSON.parse((js.match(/var REC=(\{[^;]+\});/)?.[1] ?? "{}").replace(/'/g, '"')) as Record<string, [number, number]>;
    for (const [s] of Object.values(REC)) expect(starts).toContain(s);         // every tool preview starts on a section
    const total = LEN.reduce((a, b) => a + b, 0) - (LEN.length - 1) * FADE;
    for (const t of ["light", "dark"]) expect(mp4Seconds(resolve(FE, `public/landing/finlit-tour-${t}-720p.mp4`))).toBeCloseTo(total, 1);
    expect(rec).toContain("finlit-ventures-logo-on-' + theme + '.png");          // the end card shows the new logo in either theme
  });
});
