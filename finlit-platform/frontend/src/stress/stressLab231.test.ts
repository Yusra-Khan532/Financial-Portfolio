// Task #231: Stress Lab's dark mode sits on the site's one green (site-green.css, tasks #161, #206 and #227), not on its old near-black. Its surfaces READ the
// site's own green tokens, so they follow site-green.css; every text colour stays readable (at least 4.5:1) on every surface it can sit on, checked against
// site-green.css's CURRENT values (so a later change there that would make Stress Lab unreadable fails here).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "stresslab.css"), "utf8");
const green = readFileSync(join(__dirname, "../styles/site-green.css"), "utf8");
const block = (src: string, sel: RegExp) => [...src.matchAll(sel)].map((m) => Object.fromEntries([...m[1].matchAll(/(--[\w-]+):\s*([^;]+)/g)].map((x) => [x[1], x[2].trim()])));
const darkBlocks = block(css, /:host\(\[data-theme=dark\]\)[^{]*\{([^}]*)\}/g);
const dark: Record<string, string> = Object.assign({}, ...darkBlocks);
const site: Record<string, string> = Object.assign({}, ...block(green, /:root\[data-theme="dark"\] \{([^}]*)\}/g));

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => "#" + c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
/** A token's colour as the page sees it: var(--x, fallback) read from site-green.css, color-mix(in srgb, A n%, B) worked out. */
function resolve(v: string): string {
  v = v.trim();
  const mix = /^color-mix\(in srgb,\s*(#[0-9a-fA-F]{6})\s+(\d+)%,\s*(.+)\)$/.exec(v);
  if (mix) { const a = rgb(mix[1]), b = rgb(resolve(mix[3])), t = +mix[2] / 100; return hex(a.map((x, i) => x * t + b[i] * (1 - t))); }
  const ref = /^var\((--[\w-]+),\s*(#[0-9a-fA-F]{6})\)$/.exec(v);
  if (ref) return site[ref[1]] ?? ref[2];
  return v;
}
const lum = (h: string) => { const c = rgb(h).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const col = (k: string) => resolve(dark[k]);

describe("Stress Lab dark mode (task #231)", () => {
  it("has two dark blocks, the task #231 one last, so it wins", () => {
    expect(darkBlocks.length).toBe(2);
    expect(css.indexOf("Task #231")).toBeGreaterThan(css.indexOf(":host([data-theme=dark])"));
  });
  it("lets the site's green page show through and reads the site's own green tokens, whose fallbacks are today's values", () => {
    expect(dark["--page"]).toBe("transparent");
    for (const [k, t] of [["--card", "--s1"], ["--line", "--border"], ["--hffffff", "--s2"], ["--hece4d2", "--bg-selected"]] as const) {
      expect(dark[k]).toMatch(new RegExp(`^var\\(${t},`));
      expect(dark[k]).toBe(`var(${t},${site[t]})`);                                       // the fallback is site-green.css's value now
    }
  });
  it("no surface is the old near-black any more", () => {
    for (const k of ["--card", "--pageX", "--hffffff", "--hfffdf8", "--hfaf7f0", "--line2"]) expect(col(k), k).not.toMatch(/^#(0a0d0c|191814|121212|181611|1d1b18)$/i);
  });
  it("every text colour reads at 4.5:1 or more on the card, the controls and the tinted boxes", () => {
    const surfaces = ["--card", "--hffffff", "--pageX", "--line2", "--hece4d2", "--hfffdf8", "--hfaf7f0"].map(col);
    for (const t of ["--ink", "--body", "--muted", "--h5b574f", "--teal", "--up", "--dn", "--amb", "--quant", "--gold"])
      for (const s of surfaces) expect(ratio(col(t), s), `${t} on ${s}`).toBeGreaterThanOrEqual(4.5);
    for (const [t, s] of [["--up", "--upbg"], ["--dn", "--dnbg"], ["--amb", "--ambbg"], ["--teal", "--tintbg"], ["--gold", "--hfbf3dd"]])
      expect(ratio(col(t), col(s)), `${t} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });
  it("light mode is unchanged", () => {
    expect(css).toMatch(/:host,\.sl-root\{--page:#f3eee2;--card:#FDFBF6;--line:#DDD3BD;/);
  });
});
