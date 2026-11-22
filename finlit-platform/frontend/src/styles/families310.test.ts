import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkText } from "../../scripts/check-ui.mjs";

// Task #310 part F (UI consistency pack, pages/01 to 08): each page family's corners, font sizes and weights come from the design
// tokens (01-design-rules.md): corners --ui-r-mark (4px, marks under 32px tall), --r-ctl (12px), --r-card (18px), --ui-r-pill;
// sizes var(--fs-12 ... 40) and --ui-fs-64; weights 400/500/600/700 only. One describe block per family locks its key rules.
const SRC = new URL("../", import.meta.url).pathname;
const read = (f: string) => readFileSync(join(SRC, f), "utf8");
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
/** hand-typed corners, sizes and off-rule weights left in a file (raw colours are counted by the baseline, not here) */
const shapeFindings = (f: string) =>
  (checkText(read(f), { css: f.endsWith(".css") }) as { line: number; rule: string; value: string }[])
    .filter((x) => x.rule !== "raw colour" && x.rule !== "chart colour on a control").map((x) => `${f}:${x.line} ${x.rule} ${x.value}`);
/** the declarations of every rule whose selector matches `sel` */
function rulesFor(css: string, sel: RegExp): string[] {
  const out: string[] = [];
  for (const m of noComments(css).matchAll(/([^{}]*)\{([^{}]*)\}/g)) if (sel.test(m[1])) out.push(m[1].trim() + " { " + m[2].trim() + " }");
  return out;
}
const NUMERIC_SHAPE = /(border(-[a-z]+)*-radius|font-size)\s*:\s*[\d.]+px|font-weight\s*:\s*(800|900|650|300)|font\s*:\s*(800|900|650|300)\s/;
export { shapeFindings, rulesFor, NUMERIC_SHAPE };

describe("family 1: company report and Prism (task #310 F, pages/01)", () => {
  const SHEETS = ["stock2", "report216", "report-polish", "prism", "prism-card", "prism-compare", "prism-report", "prism-showcase", "prism-technical", "prism220",
    "outlook", "compare", "concall", "concall-compact", "company-brief", "dth", "dupont", "earnings", "earningscash", "earningsintel", "forecast215", "industry-card",
    "plflags", "profitreality", "ratio-reading", "revenue-cash", "scoremoves", "filing-scores", "headerscore", "ownership", "what-changed", "macro-outlook",
    "news-filings", "preparing", "minibar", "insights", "score-ring", "chartsays", "chartzoom", "charthelp", "drawlayer", "droptile"].map((n) => `styles/${n}.css`);
  const CODE = ["stock/pack/stands.css", "stress/stresslab.css", "stock/Sections.tsx", "stock/Sections2.tsx", "stock/Sections3.tsx", "stock/Sections4.tsx",
    "stock/Hero.tsx", "pages/PremiumReport.tsx", "pages/Prism.tsx", "pages/Compare.tsx", "pages/Outlook.tsx", "pages/StressLab.tsx", "pages/Documents.tsx", "pages/ConcallMonitor.tsx"];

  it("the report, Prism, compare, forecast, Stress Lab, documents and concall sheets have no hand-typed corners, sizes or weights", () => {
    expect([...SHEETS, ...CODE].flatMap(shapeFindings)).toEqual([]);
  });

  it('"Set alert", "Watching", "Value (DCF)" and "Share" are four secondary small buttons in one row; Watching shows aria-pressed', () => {
    const h = read("stock/Hero.tsx");
    expect(h.match(/className="ui-btn ui-btn--secondary ui-btn--sm"/g)?.length).toBe(4);
    expect(h).toMatch(/className="ui-btn ui-btn--secondary ui-btn--sm" aria-pressed=\{watch\}/);
    expect(noComments(read("styles/report216.css"))).toMatch(/\.hx-d \.hx-acts \.actions \{ flex-wrap: nowrap;/);
  });

  it("report cards use the card corner (no 14px/10px card tokens), and the forecast figure is on the scale", () => {
    const rp = noComments(read("styles/report-polish.css"));
    expect(rp).toMatch(/section\.block \.card \{ border-radius: var\(--r-card\)/);
    expect(rp).toMatch(/section\.block \.card \.card \{ border-radius: var\(--r-ctl\)/);
    expect(read("styles/forecast215.css")).not.toMatch(/--fs-21/);
  });

  it("documents are small cards, the Concall Monitor has the tool width, and compare has no IBM Plex", () => {
    expect(read("pages/Documents.tsx")).toMatch(/className="card ui-card ui-card--sm doc-c"/);
    expect(read("pages/ConcallMonitor.tsx")).toMatch(/className="page ccm p4 ui-page"/);
    for (const r of rulesFor(read("styles/tools.css"), /\.radar \.r[lr]\b/)) expect(r).not.toMatch(/Plex/);
    expect(read("components/DrawLayer.tsx")).not.toMatch(/Plex/);
  });
});

describe("family 2: screeners and Discover (task #310 F, pages/02)", () => {
  const SHEETS = ["stockscreener", "screens243", "screeners243", "presets", "readyScreens", "advfx", "chartpanel", "ratiodrawer", "sectorTree", "searchfilters",
    "scorescreen", "qbuilder", "fgx", "superinvestors", "companies", "glossary"].map((n) => `styles/${n}.css`);
  it("the screener, query builder, Discover, superinvestor and A to Z sheets have no hand-typed corners, sizes or weights", () => {
    expect([...SHEETS, "discovery/discover.css"].flatMap(shapeFindings)).toEqual([]);
  });

  it('"Your rules / Ready-made / Custom ratio" is the shared ui-tabs, selected by aria-selected', () => {
    const rs = read("components/screener/ReadyScreens.tsx");
    expect(rs).toMatch(/className="ui-tabs xsp-tabs" role="tablist"/);
    expect(rs).toMatch(/className=\{"ui-tab" \+ \(t\.id === "ratio" \? " xsp-t-ratio" : ""\)\}/);
    // the side panel keeps only its fit: no own track, corner or weight on the tabs
    for (const r of rulesFor(read("styles/screeners243.css"), /^\s*\.xsp-tabs( \[role="tab"\])?\s*$/)) expect(r).not.toMatch(/border-radius|font: 700|background: var\(--s2\)/);
  });

  it("the three screener switch stays the shared page tabs, and screener h1 sizes are the tool title", () => {
    expect(read("components/screener/ScreenerHead.tsx")).toMatch(/ui-tab/);
    for (const f of ["styles/scorescreen.css", "styles/stockscreener.css"]) for (const r of rulesFor(read(f), /\bh1\b/)) expect(r).not.toMatch(/clamp\(/);
  });
});

describe("shared sheets (task #310 F)", () => {
  it("the shared navigation and table pieces have no hand-typed corners, sizes or weights", () => {
    const files = ["styles/tabgroup.css", "styles/section-nav.css", "styles/tablesort.css", "styles/table-grid.css", "styles/theme.css", "styles/type227.css",
      "styles/update-banner.css", "styles/logo-loader.css", "styles/frozen.css", "styles/headerlinks.css"];
    expect(files.flatMap(shapeFindings)).toEqual([]);
  });

  it("the report's tab groups (ct-list) use the control corner and the shared card corner", () => {
    const tg = rulesFor(read("styles/tabgroup.css"), /\.ct-list button\b/);
    expect(tg.join("\n")).toMatch(/border-radius: var\(--r-ctl\)/);
    for (const r of tg) expect(r).not.toMatch(NUMERIC_SHAPE);
  });

  it("the site-wide card, table and chip rules in finlit.css carry no 800/900 weights or hand-typed font sizes", () => {
    const css = read("styles/finlit.css");
    for (const r of rulesFor(css, /(^|[\s,])\.(card|chip|tbl|seg|btn)\b/)) expect(r).not.toMatch(/font-weight\s*:\s*(800|900|650)|font-size\s*:\s*[\d.]+px/);
  });
});
