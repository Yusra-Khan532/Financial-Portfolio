// Task #310 part G (08-dark-theme.md, 22 Nov 2026): the dark-theme fixes, locked. Every fix here moves dark only; the light theme renders as before
// (two dark-aware tokens whose light value is the old one, rules scoped to :root[data-theme="dark"], and fallbacks dropped only where :root defines
// the token in both themes). Checked in a browser on 35 pages at 1440 and 390 (contrast) and on the same pages in light (style diff, no change).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { heat } from "../lib/macro";

const SRC = join(__dirname, "..");
const read = (f: string) => readFileSync(join(SRC, f), "utf8");
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const cssFiles = (d = SRC, out: string[] = []): string[] => {
  for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) cssFiles(p, out); else if (n.endsWith(".css")) out.push(p); }
  return out;
};
/** [selector list, body] of every plain rule (good enough for these flat sheets). */
const rules = (css: string) => [...noComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]] as const);

// WCAG contrast of two opaque colours, and a colour-mix(in srgb, a p, b) / a over b at alpha p
type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, p: number): RGB => a.map((v, i) => v * p + b[i] * (1 - p)) as RGB;
const lum = (c: RGB) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const cr = (a: RGB, b: RGB) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// the dark theme's values (site-green.css for the surfaces and text; finlit.css for --gain / --loss)
const D = { bg: hex("#173125"), s1: hex("#0D1B15"), s2: hex("#14241D"), text: hex("#F3EEE2"), faint: hex("#A6B8AD"), gain: hex("#4FC08C"), loss: hex("#F2878F"), control: hex("#5D997F"), strong: hex("#39604F") };
const SCALE = 0.66;

describe("dark-aware tokens (ui-tokens.css)", () => {
  const t = noComments(read("styles/ui-tokens.css"));
  it("--ui-field-line: --border-strong in light (unchanged), --border-control in dark", () => {
    expect(t).toMatch(/:root, :root\[data-theme="light"\] \{\s*--ui-field-line: var\(--border-strong\);\s*--ui-heat-scale: 1;/);
    expect(t).toMatch(/:root\[data-theme="dark"\],\s*:root:not\(\[data-theme="light"\]\) \{\s*--ui-field-line: var\(--border-control\);\s*--ui-heat-scale: \.66;/);
    expect(read("styles/site-green.css")).toMatch(/--border-control: #5D997F/);
  });
  it("the field edge reads 3:1 or more in dark on the page and on a card (the old --border-strong did not)", () => {
    expect(cr(D.control, D.bg)).toBeGreaterThanOrEqual(3);
    expect(cr(D.control, D.s1)).toBeGreaterThanOrEqual(3);
    expect(cr(D.strong, D.bg)).toBeLessThan(3);
  });
  it("the strongest heat cell keeps cream figures at 4.5:1 in dark (was 2.7 to 4.4)", () => {
    expect(cr(D.text, mix(D.gain, D.s1, 0.82 * SCALE))).toBeGreaterThanOrEqual(4.5);   // FII/DII month grid, level 4
    expect(cr(D.text, mix(D.loss, D.s1, 0.82 * SCALE))).toBeGreaterThanOrEqual(4.5);
    expect(cr(D.text, mix(D.loss, D.s1, 0.75 * SCALE))).toBeGreaterThanOrEqual(4.5);   // CPI by division, hottest cell
    expect(cr(D.text, mix(D.gain, D.s2, 0.70 * SCALE))).toBeGreaterThanOrEqual(4.5);   // score history grid (.hc2), k = 1
    expect(cr(D.text, mix(D.loss, D.s2, 0.70 * SCALE))).toBeGreaterThanOrEqual(4.5);
    expect(cr(D.gain, mix(D.gain, D.s1, 0.30 * SCALE))).toBeGreaterThanOrEqual(4.5);   // funds table: green figure on its green tint
    expect(cr(D.text, mix(D.gain, D.s1, 0.82))).toBeLessThan(4.5);                    // before
    expect(cr(D.faint, D.s1)).toBeGreaterThanOrEqual(4.5);                            // Why we exist numerals on --faint
  });
});

describe("fields: one edge token", () => {
  it("the site-wide dark field rule draws its edge with --ui-field-line", () => {
    const th = noComments(read("styles/theme.css"));
    expect(th).toMatch(/:root:not\(\[data-theme="light"\]\) textarea \{ background-color: var\(--s2\); border-color: var\(--ui-field-line\); color: var\(--text\); \}/);
    expect(th).not.toMatch(/textarea:hover \{ border-color: color-mix\(in srgb, var\(--border-strong\)/);
  });
  it("no rule for an input, select or text box draws its border with --border-strong (it is --ui-field-line: the same in light)", () => {
    const FIELD = /(^|[\s>+~])(input|select|textarea)(\[[^\]]*\]|:[\w-]+(\([^)]*\))?|\.[\w-]+)*\s*$/;
    const bad: string[] = [];
    for (const f of cssFiles()) {
      if (f.endsWith("ui-tokens.css")) continue;
      for (const [sel, body] of rules(readFileSync(f, "utf8"))) {
        const sels = sel.split(",").map((s) => s.trim()).filter((s) => s && !/::?(placeholder|-webkit|-moz)/.test(s));
        if (!sels.length || !sels.every((s) => FIELD.test(s) && !/type=["']?(checkbox|radio|range)/.test(s.split(/\s+/).pop() ?? ""))) continue;
        if (/(^|;)\s*border(-(top|right|bottom|left))?(-color)?\s*:[^;]*var\(--border-strong\)/.test(body)) bad.push(f.slice(SRC.length) + " " + sel.slice(0, 60));
      }
    }
    expect(bad).toEqual([]);
  });
  it("the equity portfolio's theme filters use the field edge in dark (they drew --border, 1.6:1)", () => {
    expect(noComments(read("portfolio/pack/eq-themes.css"))).toMatch(/:root\[data-theme="dark"\] \.eqh-f \.eqh-fs select, :root\[data-theme="dark"\] \.eqh-f \.eqh-fq input \{ border-color: var\(--ui-field-line\); \}/);
  });
});

describe("heat maps and tinted cells run through --ui-heat-scale", () => {
  it("CPI by division (lib/macro.ts heat)", () => {
    for (const v of [7, 9, 5, 3, 1]) expect(heat(v).bg).toMatch(/^color-mix\(in srgb, var\(--[\w-]+\) calc\(\d+% \* var\(--ui-heat-scale\)\), transparent\)$/);
    expect(heat(9).bg).toBe("color-mix(in srgb, var(--loss) calc(59% * var(--ui-heat-scale)), transparent)");   // same share as before in light
    expect(heat(null).bg).toBe("transparent");
  });
  it("the score history grid (.hc2) and the FII/DII month grid", () => {
    const ac = noComments(read("styles/account.css"));
    expect(ac).toMatch(/\.hc2\.pos \{ background: color-mix\(in srgb, var\(--gain\) calc\(\(8% \+ var\(--k\) \* 62%\) \* var\(--ui-heat-scale\)\), var\(--s2\)\); \}/);
    expect(ac).toMatch(/\.hc2\.neg \{ background: color-mix\(in srgb, var\(--loss\) calc\(\(8% \+ var\(--k\) \* 62%\) \* var\(--ui-heat-scale\)\), var\(--s2\)\); \}/);
    const fl = noComments(read("styles/flows.css"));
    for (const [l, p] of [["1", 18], ["2", 36], ["3", 58], ["4", 82], ["-1", 18], ["-2", 36], ["-3", 58], ["-4", 82]] as const)
      expect(fl).toContain(`.fl-mg td[data-l="${l}"] { background: color-mix(in srgb, var(${l.startsWith("-") ? "--loss" : "--gain"}) calc(${p}% * var(--ui-heat-scale)), var(--s1)); }`);
  });
  it("the funds table: in dark a tinted cell's figure takes --text and its band word --muted (the tint is the signal)", () => {
    const mf = noComments(read("styles/mf.css"));
    expect(mf).toContain(':root[data-theme="dark"] .mf-table td.mf-tinted :is(.pos, .neg) { color: var(--text); }');
    expect(mf).toContain(':root[data-theme="dark"] .mf-table td.mf-tinted .mf-band { color: var(--muted); }');
  });
  it("the funds table's return tint", () => {
    expect(read("mf/FundTable.tsx")).toContain('"--tint": `color-mix(in srgb, var(${t.tone === "pos" ? "--gain" : "--loss"}) calc(${Math.round(8 + t.k * 22)}% * var(--ui-heat-scale)), transparent)`');
  });
});

describe("contrast and surface fixes from 08-dark-theme.md, dark only", () => {
  const dark = (file: string, sel: string, decl: string) => {
    const css = noComments(read(file));
    const hit = rules(css).find(([s]) => s === sel);
    expect(hit, `${file}: ${sel}`).toBeTruthy();
    expect(hit![1]).toContain(decl);
  };
  it("All my investments: the score box word keeps the text colour (the dark ink read 1.1:1 on --s2)", () => {
    expect(noComments(read("styles/myinvest.css"))).toMatch(/:root\[data-theme="dark"\] \.mi :is\(\.t-pos:not\(\.mi-sbox\), \.t-mid:not\(\.mi-sbox\), \.t-neg:not\(\.mi-sbox\),/);
  });
  it("equity portfolio: the gold +N more on a green trend cell takes --text", () => dark("portfolio/pack/equity-pack.css", ':root[data-theme="dark"] .eq-tg-c .eq-more', "color: var(--text)"));
  it("Why we exist / About: the 01, 02 numerals take --faint", () => dark("styles/premium.css", ':root[data-theme="dark"] .feat .num', "color: var(--faint)"));
  it("company report: the ratio filter buttons are not a light block", () => dark("styles/ratio-reading.css", ':root[data-theme="dark"] .rr-filter button:not([aria-pressed="true"])', "background: var(--s1)"));
  it("company report: step numbers, the Main theme chip and the price chip", () => {
    dark("styles/earningscash.css", ':root[data-theme="dark"] .ec-n', "color: var(--gold)");
    dark("styles/dth.css", ':root[data-theme="dark"] .dtx-main > em', "color: var(--gold-2)");
    dark("styles/report216.css", ':root[data-theme="dark"] .hx-d .hxd-px .chip', "background: color-mix(in srgb, currentColor 8%, transparent)");
  });
  it("home page: both Explore the platform buttons are the main button in dark; the fine print is --muted", () => {
    dark("styles/explore-tools.css", ':root[data-theme="dark"] .xt .btn.xt-go:not(.primary)', "background: var(--btn-bg); color: var(--btn-fg)");
    dark("styles/explore-tools.css", ':root[data-theme="dark"] .xt-foot .xt-fine', "color: var(--muted)");
    const hh = noComments(read("styles/human-home.css"));
    expect(hh).toMatch(/:root\[data-theme="dark"\] \.hh \.btn\.hh-go:not\(\.primary\) \{ background: var\(--btn-bg\); color: var\(--btn-fg\); \}/);
    expect(hh).not.toMatch(/#BAF7D1/i);
  });
  it("selected tabs on the SIP calculator and the account take the one selected colour in dark, not gold", () => {
    dark("styles/sip.css", ':root[data-theme="dark"] .sip-tabs button.on', "color: var(--ui-on-fg); background: var(--ui-on-bg)");
    dark("styles/account.css", ':root[data-theme="dark"] .acct-tabs a.on', "color: var(--ui-on-fg); background: var(--ui-on-bg)");
  });
  it("home page: the Prism card draws on the dark surfaces; every colour it uses is a variable with a dark value", () => {
    const css = noComments(read("styles/prism-showcase.css"));
    const lightVars = new Set([...css.matchAll(/(--hpz-[\w-]+):\s*#/g)].map((m) => m[1]));
    const darkBlock = rules(css).find(([s]) => s === ':root[data-theme="dark"] .hpz')![1];
    const darkVars = new Set([...darkBlock.matchAll(/(--hpz-[\w-]+):/g)].map((m) => m[1]));
    for (const v of ["--hpz-cream", "--hpz-line", "--hpz-ink", "--hpz-mute", "--hpz-part-gold", "--hpz-part-red", "--hpz-part-green", "--hpz-gold-bg", "--hpz-green-bg", "--hpz-red-bg", "--hpz-blue-bg", "--hpz-track", "--hpz-ring-track", "--hpz-knob", "--hpz-lit"])
      { expect(lightVars.has(v), v).toBe(true); expect(darkVars.has(v), v).toBe(true); }
    // no literal colour left in a card rule (the light values live in the .hpz variables)
    const lit = rules(css).filter(([s]) => /\.hpz-(card|bi|sample|score|ring|part|slide|blk)/.test(s) && !s.startsWith(":root")).filter(([, b]) => /#[0-9a-f]{3,8}\b/i.test(b.replace(/--hpz-[\w-]+:[^;]*;/g, "")));
    expect(lit.map(([s]) => s)).toEqual([]);
  });
});

describe("raw colours: fallbacks that can never show are gone", () => {
  it("no stylesheet gives a core token (defined by :root in both themes) a literal fallback, except the ones older tests read", () => {
    const CORE = "bg|s1|s2|s3|border|border-strong|text|muted|faint|gold|gold-2|gold-deep|gold-soft|gain|loss|gain-soft|loss-soft|mint|on-mint|warn|info|on-gold|text-primary|text-secondary|text-muted|text-body|bg-surface|bg-subtle|bg-page|border-subtle|border-control|k[1-6]|c[1-5]";
    const re = new RegExp(`var\\(\\s*--(${CORE})\\s*,\\s*(#[0-9a-fA-F]{3,8}|rgba?\\()`);
    const KEEP = ["stress/stresslab.css", "styles/explore-tools.css", "styles/ui-tokens.css", "styles/design-system.css", "styles/typescale.css", "styles/site-green.css"];
    const bad = cssFiles().filter((f) => !KEEP.some((k) => f.replace(/\\/g, "/").endsWith(k))).filter((f) => re.test(noComments(readFileSync(f, "utf8"))));
    expect(bad.map((f) => f.slice(SRC.length))).toEqual([]);
  });
  it("the price label on the price charts reads the Prism ink token (the same #1A1405 in both themes)", () => {
    for (const f of ["charts/IntradayChart.tsx", "charts/PriceChart.tsx"]) { const t = read(f); expect(t).toContain('fill: css("--ui-on-prism")'); expect(t).not.toMatch(/#1A1405/i); }
    expect(read("styles/ui-tokens.css")).toMatch(/--ui-on-prism: #1A1405;/);
  });
});
