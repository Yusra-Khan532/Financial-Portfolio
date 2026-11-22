// Task #310: the design rules as variables (ui-tokens.css), the shared ui- classes (ui.css) and the first fixes made in the source.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(__dirname, f), "utf8");
const tokens = read("ui-tokens.css");
const ui = read("ui.css");
const main = readFileSync(join(__dirname, "../main.tsx"), "utf8");
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

describe("ui-tokens.css", () => {
  it("is loaded after every theme layer (site-green.css included) and before overlay.css, with ui.css right after it", () => {
    const at = (f: string) => main.indexOf(`import "./styles/${f}"`);
    for (const f of ["typescale.css", "finlit.css", "premium.css", "luxe.css", "design-system.css", "calm.css", "type227.css", "site-green.css"]) expect(at(f), f).toBeLessThan(at("ui-tokens.css"));
    expect(at("ui-tokens.css")).toBeLessThan(at("ui.css"));
    expect(at("ui.css")).toBeLessThan(at("overlay.css"));
  });

  it("every new variable starts with --ui- (an earlier --fs-h2 / --fs-h3 clashed with names the site reads)", () => {
    const declared = [...noComments(tokens).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    const existing = new Set(["--r-ctl", "--r-card", "--r-s", "--r-m", "--r-l", "--btn-bg", "--btn-fg", "--btn-hover", "--bg-elevated", "--bg-page", "--bg-surface", "--bg-subtle",
      "--bg-selected", "--text-primary", "--text-body", "--text-secondary", "--text-muted", "--text-link", "--border-subtle", "--border-control", "--focus-ring", "--financial-positive", "--financial-negative"]);
    for (const v of declared) expect(v.startsWith("--ui-") || existing.has(v), v).toBe(true);
    expect(noComments(tokens)).not.toMatch(/--fs-(h2|h3|page-title)\s*:/);   // --fs-page-title stays in typescale.css, with its 28px phone step
  });

  it("corners: four values; the older 4/6/8px tokens point at them; calm.css and premium.css no longer set their own", () => {
    expect(tokens).toMatch(/--ui-r-mark: 4px;/);
    expect(tokens).toMatch(/--r-ctl: 12px;/);
    expect(tokens).toMatch(/--r-card: 18px;/);
    expect(tokens).toMatch(/--ui-r-pill: 999px;/);
    expect(tokens).toMatch(/--r-s: var\(--ui-r-mark\);/);
    expect(tokens).toMatch(/--r-m: var\(--r-ctl\);/);
    expect(tokens).toMatch(/--r-l: var\(--r-ctl\);/);
    expect(noComments(read("calm.css"))).not.toMatch(/--r-(card|ctl)\s*:/);
    expect(noComments(read("premium.css"))).not.toMatch(/:root \{ --r-s:/);
  });

  it("main button: green in light, the existing mint in dark; one selected colour from --text and --s1", () => {
    const light = noComments(tokens).match(/:root\[data-theme="light"\] \{([^}]*--btn-bg[^}]*)\}/)![1];
    expect(light).toMatch(/--btn-bg: #1F7A55;/);
    expect(light).toMatch(/--btn-fg: #FFFDF7;/);
    expect(light).toMatch(/--bg-elevated: var\(--s1\);/);
    expect(tokens).toMatch(/:root\[data-theme="dark"\],\s*:root:not\(\[data-theme="light"\]\) \{\s*--btn-bg: var\(--mint\);[^}]*--btn-fg: var\(--on-mint\);[^}]*--btn-hover: var\(--mint-hover\);/);
    expect(tokens).toMatch(/--ui-on-bg: var\(--text\);/);
    expect(tokens).toMatch(/--ui-on-fg: var\(--s1\);/);
    expect(read("premium.css")).toMatch(/\.skip \{ background: var\(--btn-bg\); color: var\(--btn-fg\);/);   // the skip link takes the main-button colour
  });

  it("the older variable set points at the current one (all of it in light; in dark the four that still differed)", () => {
    const blocks = noComments(tokens);
    const light = [...blocks.matchAll(/:root\[data-theme="light"\] \{([^}]*)\}/g)].map((m) => m[1]).join("");
    for (const [old, cur] of [["--bg-page", "--bg"], ["--bg-surface", "--s1"], ["--bg-subtle", "--s2"], ["--bg-selected", "--sel"], ["--text-primary", "--text"], ["--text-body", "--muted"],
      ["--text-secondary", "--muted"], ["--text-muted", "--faint"], ["--text-link", "--gold"], ["--border-subtle", "--border"], ["--border-control", "--border-strong"],
      ["--focus-ring", "--focus"], ["--financial-positive", "--gain"], ["--financial-negative", "--loss"]]) expect(light, old).toContain(`${old}: var(${cur});`);
    const dark = blocks.match(/:root\[data-theme="dark"\],\s*:root:not\(\[data-theme="light"\]\) \{\s*--text-link([^}]*)\}/);
    expect(dark).not.toBeNull();
    for (const s of ["--focus-ring: var(--focus);", "--financial-positive: var(--gain);", "--financial-negative: var(--loss);"]) expect(dark![1]).toContain(s);
    expect(dark![1]).not.toMatch(/--border-control/);   // the photo's sage stays (task #206, siteGreen.test.ts)
    expect(blocks).not.toMatch(/--action-primary\s*:/);  // left alone: only "Ask FinLit AI" reads it
  });
});

describe("ui.css: the shared pieces", () => {
  it("has every class the components render, and the selected look comes from the attribute, not a class", () => {
    for (const c of ["ui-btn", "ui-btn--primary", "ui-btn--secondary", "ui-btn--quiet", "ui-btn--prism", "ui-btn--sm", "ui-tabs", "ui-tab", "ui-title", "ui-title--read", "ui-title--marketing",
      "ui-eyebrow", "ui-lede", "ui-h2", "ui-h2--marketing", "ui-h3", "ui-label", "ui-card", "ui-card--sm", "ui-input", "ui-chip", "ui-chip--gold", "ui-page", "ui-page--wide", "ui-page--read"])
      expect(ui, c).toMatch(new RegExp(`\\.${c}[\\s{,:\\[]`));
    expect(ui).toMatch(/\.ui-tab\[aria-selected="true"\], \.ui-tab\[aria-pressed="true"\], \.ui-tab\[aria-current="page"\] \{ background: var\(--ui-on-bg\); color: var\(--ui-on-fg\);/);
    expect(ui).toMatch(/\.ui-btn--primary \{ background: var\(--btn-bg\); color: var\(--btn-fg\); \}/);
    expect(noComments(ui)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);   // no colour typed in: variables only
  });

  it("no other stylesheet declares a ui- class (the prefix belongs to the shared pieces)", () => {
    const walk = (d: string, out: string[] = []): string[] => {
      for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p, out); else if (n.endsWith(".css")) out.push(p); }
      return out;
    };
    const src = join(__dirname, "..");
    const others = walk(src).filter((f) => !f.endsWith("ui.css") && /(^|[\s,}])\.ui-[a-z]/m.test(noComments(readFileSync(f, "utf8"))));
    expect(others.map((f) => relative(src, f))).toEqual([]);
  });
});

describe("first fixes, in the source (task #310)", () => {
  it("no pure-white cards in the light theme: the .card / .qt / .ftile rule uses --s1", () => {
    const css = read("account.css");
    expect(css).toContain(':root[data-theme="light"] .card, :root[data-theme="light"] .qt, :root[data-theme="light"] .ftile { background: var(--s1);');
    expect(css).not.toMatch(/\.ftile \{ background: #fff/i);
  });
  it("the blue (score history) and teal (Sector Pulse) selected states take the one selected colour", () => {
    expect(read("scoremoves.css")).toContain('.scm216-card .scm-rng button[aria-pressed="true"] { background: var(--ui-on-bg); border-color: var(--ui-on-bg); color: var(--ui-on-fg); }');
    // on the company report the "1 week" score-history pill is drawn by MacroOutlook (.mo-rng): the same rule under another name
    expect(read("macro-outlook.css")).toContain('.mo-rng button[aria-pressed="true"] { background: var(--ui-on-bg); border-color: var(--ui-on-bg); color: var(--ui-on-fg); }');
    expect(read("sectors-pack.css")).toContain(".sp-tab.on { background: var(--ui-on-bg); border-color: var(--ui-on-bg); color: var(--ui-on-fg); }");
  });
});
