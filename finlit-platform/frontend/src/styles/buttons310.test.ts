// Task #310 PR B: one main button colour (green), the gold gradient for Prism actions only, and one selected look (black on cream in light, cream on dark
// green in dark: --ui-on-bg / --ui-on-fg), marked by aria-selected / aria-pressed / aria-current / aria-checked, never by a class.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const files = (dir: string, ext: RegExp): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p, ext) : ext.test(f) && !/\.test\./.test(f) ? [p] : []; });
const ALL_CSS = files(SRC, /\.css$/).map((p) => ({ p: p.slice(SRC.length + 1), css: strip(readFileSync(p, "utf8")) }));
const rules = (css: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));

describe("the main button", () => {
  it("the shared .btn.primary is the green main action in both themes, with no gold or forest gradient", () => {
    expect(strip(read("styles/luxe.css"))).toMatch(/:root \.btn\.primary \{ border: 1px solid var\(--btn-bg\); color: var\(--btn-fg\); background: var\(--btn-bg\); box-shadow: none; \}/);
    expect(strip(read("styles/finlit.css"))).toMatch(/\.btn\.primary \{ border: 1px solid var\(--btn-bg\); color: var\(--btn-fg\); background: var\(--btn-bg\);/);
    for (const f of ["styles/luxe.css", "styles/finlit.css", "styles/tools.css"]) {
      for (const r of rules(strip(read(f))).filter((x) => /\.btn\.primary/.test(x.sel) && !/::after/.test(x.sel))) expect(r.body, `${f}: ${r.sel}`).not.toMatch(/gradient|--forest|--gold|--mint/);
    }
  });
  it("Ask FinLit AI is the shared second button with its icon; the navy of --action-primary is gone from it", () => {
    expect(read("components/Layout.tsx")).toMatch(/<button type="button" className=\{buttonClass\("secondary", "md", "ai-top"\)\}.*aria-label="Ask FinLit AI"[^\n]*<Icon name="spark" \/><span>Ask FinLit AI<\/span><\/button>/);
    // task #320 made the box golden: its colours may come from the gold tokens only; never --action-primary, a typed colour or its own corners
    for (const r of rules(strip(read("styles/ai-top.css"))).filter((x) => /\.ai-top/.test(x.sel))) {
      expect(r.body, r.sel).not.toMatch(/--action-primary|border-radius|#[0-9a-f]{3,8}\b|rgba?\(/i);
      for (const d of r.body.match(/(?:background|color|border-color)\s*:[^;]*/g) ?? []) expect(d, r.sel).toMatch(/var\(--(gold|gold-soft|gold-2|gold-deep|text|ui-on-prism)\)|currentColor/);   // #320 rework: the Prism gold gradient, dark words
    }
  });
  it("named cases: Create an alert and Add are the main button, Fund Screener and the other quick links the second button, Prism actions gold", () => {
    expect(read("components/dashboard/NewsBlocks.tsx")).toContain('<Link className={buttonClass("primary", "md")} to="/alerts">Create an alert</Link>');
    expect(read("pages/Holdings.tsx")).toContain('<button className={buttonClass("primary", "md", "pfx-solid")}>Add</button>');
    expect(read("components/PageHeader.tsx")).toContain('className={buttonClass("secondary", "sm", "ph-lk")}');
    expect(strip(read("styles/page-header.css"))).not.toMatch(/\.ph-lk\.primary/);
    expect(read("stock/PrismCompare.tsx")).toMatch(/className=\{buttonClass\("prism", "sm", "dk-b"\)\} to=\{`\/prism\//);
    expect(read("stock/DiscoverThemes.tsx")).toContain('<em className="ui-chip ui-chip--gold">Main theme</em>');   // a tag, not a button
    expect(strip(read("styles/dth.css"))).not.toMatch(/\.dth-btn \{[^}]*background/);
  });
});

describe("the one selected look", () => {
  it("no .btn, tab or pill is marked selected by the .on class in the shared sheets", () => {
    for (const { p, css } of ALL_CSS) expect(css, p).not.toMatch(/\.btn\.on\b|\.sp-vbtn\.on\b|\.own-chip\.on\b|\.chip-b\.on\b|\.xsh-box\.on\b|\.pfx-pillbtn\.on\b|\.sp-tab\.on \{/);
    expect(strip(read("styles/finlit.css"))).toMatch(/\.btn\[aria-pressed="true"\], \.btn\[aria-current="page"\] \{ background: var\(--ui-on-bg\); border-color: var\(--ui-on-bg\); color: var\(--ui-on-fg\);/);
  });
  it("the shared segmented control (.seg: 1Y, EMA 50, Direct, Growth) and the report's tab bars use it", () => {
    expect(strip(read("styles/finlit.css"))).toMatch(/\.seg button\[aria-pressed="true"\] \{ background: var\(--ui-on-bg\); color: var\(--ui-on-fg\);/);
    expect(strip(read("styles/forecast215.css"))).toMatch(/\.fcst-chips button\[aria-pressed="true"\] \{ border-color: var\(--ui-on-bg\); background: var\(--ui-on-bg\); color: var\(--ui-on-fg\); \}/);
    expect(strip(read("styles/dashboard.css"))).toMatch(/\.dsh-mr-tabs button\[aria-selected="true"\] \{ background: var\(--ui-on-bg\);/);
    expect(strip(read("styles/mf.css"))).toMatch(/\.mf-tabs button\[aria-selected="true"\], \.mf-tabs button\[aria-selected="true"\]:hover \{ background: var\(--ui-on-bg\); \}/);
    expect(read("components/screener/ScreenerHead.tsx")).toContain('<nav className="ui-tabs xsh-nav" aria-label="Screeners">');
  });
  it("a selected tab, pill or toggle never fills with a chart or score colour, teal, blue or gold", () => {
    const SELECTED = /\[(aria-pressed|aria-selected|aria-checked)=("?)true\2\]|\[aria-current=("?)page\3\]/;
    const bad: string[] = [];
    for (const { p, css } of ALL_CSS) for (const r of rules(css)) {
      if (!SELECTED.test(r.sel) || !/(btn|button|tab|pill|chip|seg|toggle|\ba\b|vbtn|\[role)/.test(r.sel) || /:not\(\[aria-(pressed|selected)/.test(r.sel)) continue;
      const bg = r.body.match(/(?:^|;|\s)background(?:-color)?\s*:\s*([^;]+)/);
      if (bg && /var\(--(k\d|c\d|p-|pz-|pzr-|band-|ld-|x-tab|x-blue|va\b|rt-ag|mi-shares|dsc-teal|gp-teal|aq\b|gold\b|gold-soft)|#0e6471|#2a78d6/i.test(bg[1])) bad.push(`${p}: ${r.sel}`);
    }
    expect(bad).toEqual([]);
  });
});
