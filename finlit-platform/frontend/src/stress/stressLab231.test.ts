// Task #231: Stress Lab's dark mode sits on the site's one sage green (site-green.css, tasks #161 and #206), not on its old near-black, and every text colour
// stays readable (at least 4.5:1) on every surface it can sit on.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "stresslab.css"), "utf8");
const green = readFileSync(join(__dirname, "../styles/site-green.css"), "utf8");
// the dark tokens as the page sees them: the original dark block, then the task #231 block over it
const darkBlocks = [...css.matchAll(/:host\(\[data-theme=dark\]\)[^{]*\{([^}]*)\}/g)].map((m) => m[1]);
const dark: Record<string, string> = Object.assign({}, ...darkBlocks.map((b) => Object.fromEntries([...b.matchAll(/(--[\w-]+):([^;]+)/g)].map((m) => [m[1], m[2].trim()]))));
const lum = (h: string) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("Stress Lab dark mode (task #231)", () => {
  it("has two dark blocks, the task #231 one last, so it wins", () => {
    expect(darkBlocks.length).toBe(2);
    expect(css.indexOf("Task #231")).toBeGreaterThan(css.indexOf(":host([data-theme=dark])"));
  });
  it("lets the site's green page show through and uses site-green.css's own surfaces", () => {
    expect(dark["--page"]).toBe("transparent");
    for (const [k, site] of [["--card", "--s1"], ["--line", "--border"], ["--hffffff", "--s2"]] as const)
      expect(green).toMatch(new RegExp(`${site}: ${dark[k]};`));
  });
  it("no surface is the old near-black any more", () => {
    for (const k of ["--card", "--pageX", "--hffffff", "--hfffdf8", "--hfaf7f0", "--hf7f3ea", "--line2"]) expect(lum(dark[k]), k).toBeGreaterThan(lum("#23392F") - 0.001);
  });
  it("every text colour reads at 4.5:1 or more on the card, the controls and the tinted boxes", () => {
    const surfaces = ["--card", "--hffffff", "--pageX", "--hfffdf8", "--hfaf7f0"].map((k) => dark[k]);
    for (const t of ["--ink", "--body", "--muted", "--h5b574f", "--teal", "--up", "--dn", "--amb", "--quant", "--gold"])
      for (const s of surfaces) expect(ratio(dark[t], s), `${t} on ${s}`).toBeGreaterThanOrEqual(4.5);
    for (const [t, s] of [["--up", "--upbg"], ["--dn", "--dnbg"], ["--amb", "--ambbg"], ["--teal", "--tintbg"], ["--gold", "--hfbf3dd"]])
      expect(ratio(dark[t], dark[s]), `${t} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });
  it("light mode is unchanged", () => {
    expect(css).toMatch(/:host,\.sl-root\{--page:#f3eee2;--card:#FDFBF6;--line:#DDD3BD;/);
  });
});
