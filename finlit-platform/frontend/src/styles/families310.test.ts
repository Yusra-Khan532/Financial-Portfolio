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

describe("family 3: portfolios and dashboard (task #310 F, pages/03)", () => {
  const SHEETS = ["dashboard", "dash-shared", "dash223", "dash248", "dash316", "dash-cards", "myinvest", "mi7", "watchlist-pack", "alerts272", "etfportfolio",
    "mfportfolio", "mfspread", "steps-bar", "pdfimport", "portfolio-disc", "hideable", "calendar-sync"].map((n) => `styles/${n}.css`);
  const OWN = ["portfolio/pf.css", "portfolio/kit/kit.css", "portfolio/holdings-kit.css", "portfolio/view-kit.css", "portfolio/add-shares.css",
    "portfolio/pack/equity-pack.css", "portfolio/pack/div-pack.css", "portfolio/pack/eq-top.css", "portfolio/pack/eq-themes.css", "portfolio/pack/pagetop.css",
    "portfolio/pack/risk-pack.css", "portfolio/pack/market-fall.css", "portfolio/pack/key-answers.css", "holdings/holdings.css", "mf/pack/mf-pack.css",
    "components/diversification/diversification.css", "components/clearportfolio.css", "components/removeall.css", "components/dashboard/global-markets.css"];
  it("the dashboard, three portfolios, all my investments, watchlists, alerts and baskets have no hand-typed corners, sizes or weights", () => {
    expect([...SHEETS, ...OWN].flatMap(shapeFindings)).toEqual([]);
  });

  it("dashboard heat-map tiles keep the mark corner (--ui-r-mark), cards the card corner", () => {
    const d = noComments(read("styles/dashboard.css"));
    expect(d).not.toMatch(/border-radius:\s*(16|14|10|8|4)px/);
    expect(d).toMatch(/var\(--ui-r-mark\)/);
    expect(d).toMatch(/var\(--r-card\)/);
  });

  it("all my investments: figures on the light dark-theme blocks use the dark ink, and the disclaimer heading weight is 700", () => {
    const mi = noComments(read("styles/myinvest.css"));
    // part G: the score box itself (.mi-sbox) is excluded; its word sits on --s2 and keeps the text colour (dark310.test.ts)
    expect(mi).toMatch(/:root\[data-theme="dark"\] \.mi :is\(\.t-pos:not\(\.mi-sbox\), \.t-mid:not\(\.mi-sbox\), \.t-neg:not\(\.mi-sbox\),[^{]*\{ color: var\(--on-mint\); \}/);
    expect(mi).toMatch(/\.mi \.mi-fold summary b \{ font-weight: 700; \}/);
  });
});

describe("family 4: markets, results and news (task #310 F, pages/04)", () => {
  const SHEETS = ["sectors", "sectors-pack", "rotation", "rotation-pack", "rotation-charts", "industry-pack", "macro", "flows", "commodities", "market-events",
    "results-pack", "results-calendar", "results224", "qresults", "news-page", "ipo-all", "ipo-all-compact", "ipo-calendar", "ipo-gmp", "ipo-report"].map((n) => `styles/${n}.css`);
  it("Sector Pulse, Rotation, macro, FII/DII, commodities, market events, results, news and IPO sheets have no hand-typed corners, sizes or weights", () => {
    expect(SHEETS.flatMap(shapeFindings)).toEqual([]);
  });

  it("heat squares keep the mark corner; FII/DII bars use the dark ink in the dark theme", () => {
    const fl = noComments(read("styles/flows.css"));
    expect(rulesFor(fl, /^\s*\.fl-cell\s*$/).join("")).toMatch(/border-radius: var\(--ui-r-mark\)/);
    expect(fl).toMatch(/:root\[data-theme="dark"\] \.fl-oi-bar i \{ color: var\(--on-mint\); \}/);
  });

  it("news filters are ui-tab and their topic tags ui-chip; IPO cards are small cards; macro tabs take the one selected look", () => {
    const n = read("pages/News.tsx");
    expect(n.match(/className=\{"ui-tab chip-b" \+/g)?.length).toBe(2);
    expect(n).toMatch(/className=\{"ui-chip p4-tp t-" \+/);
    expect(read("pages/Ipo.tsx")).toMatch(/className="card ui-card ui-card--sm ipo-c p4-ic"/);
    expect(rulesFor(read("styles/macro.css"), /\.mc-tabs button\.on/).join("")).toMatch(/background: var\(--ui-on-bg\)/);
  });

  it("Sector Pulse's closed phone rows carry live figures where the section has them", () => {
    const sp = read("pages/SectorPulse.tsx");
    for (const id of ["bystate", "standouts", "counted"]) expect(sp).toContain(`line={foldLine.${id}}`);
    expect(sp).toMatch(/groupsN\(b\.rows\.length\)\} with a reading/);
  });
});

describe("family 5: mutual funds and ETFs (task #310 F, pages/05)", () => {
  const SHEETS = ["mf", "mfscreen", "mfcompare", "mfinsights", "mfup", "mf-showcase", "etf", "etfvs", "ask-funds", "planScore", "tools"].map((n) => `styles/${n}.css`);
  it("the funds list, fund screener, compare, score screener, ETFs and fund page sheets have no hand-typed corners, sizes or weights", () => {
    expect(SHEETS.flatMap(shapeFindings)).toEqual([]);
  });

  it("bold text inside semibold labels stops at 700 (no computed 900), site-wide", () => {
    expect(noComments(read("styles/typescale.css"))).toMatch(/\nb, strong \{ font-weight: 700; \}/);
  });

  it("the funds quick links stay secondary buttons, not the gold pill", () => {
    const ph = read("components/PageHeader.tsx");
    expect(ph).toMatch(/buttonClass\("secondary", "sm", "ph-lk"\)/);
    expect(noComments(read("styles/page-header.css"))).not.toMatch(/\.ph-lk\.primary \{[^}]*background: var\(--gold\)/);
  });
});

describe("family 6: calculators and charts (task #310 F, pages/06)", () => {
  const SHEETS = ["dcf", "dcf-redesign", "eps", "reverse", "sip", "graphs", "advcharts", "advfx", "options", "depth3d"].map((n) => `styles/${n}.css`);
  it("the DCF, reverse valuation, P/E-EPS-PEG, SIP, chart builder and correlation sheets have no hand-typed corners, sizes or weights", () => {
    expect(SHEETS.flatMap(shapeFindings)).toEqual([]);
  });
  it("the chart builder's 7px toggles and the correlation page's 8/9px buttons are on the control corner", () => {
    for (const f of ["styles/graphs.css", "styles/advcharts.css"]) expect(noComments(read(f))).not.toMatch(/border-radius:\s*[5-9]px/);
  });
});

describe("family 7: account, learn and help (task #310 F, pages/07)", () => {
  const SHEETS = ["account", "adminView", "glossary-pack", "extension", "forum", "feedback", "pagefaqs", "pagefeedback", "ask-ai", "explore-tools", "callout",
    "search", "ai-top"].map((n) => `styles/${n}.css`);
  it("account, console, glossary, learn, extension, forum, feedback and FAQ sheets have no hand-typed corners, sizes or weights", () => {
    expect(SHEETS.flatMap(shapeFindings)).toEqual([]);
  });

  it("widths: account and FAQ on the reading width, feedback on the tool width", () => {
    expect(rulesFor(read("styles/account.css"), /^\s*\.acct\s*$/).join("")).toMatch(/max-width: var\(--ui-w-read\)/);
    expect(rulesFor(read("styles/pagefaqs.css"), /^\s*\.pfq-hub\s*$/).join("")).toMatch(/max-width: var\(--ui-w-read\)/);
    expect(noComments(read("styles/feedback.css"))).toMatch(/\.wrap\.fb \{ max-width: var\(--ui-w-app\); \}/);
  });

  it("glossary: term rows on the cream surface (no white), letters are pills with the one selected look", () => {
    const g = noComments(read("styles/glossary-pack.css"));
    expect(g).toMatch(/--gp-row: var\(--s1\);/);
    expect(g).not.toMatch(/#FFFFFF|#fff\b/i);
    expect(g).toMatch(/\.gp-letters button\[aria-pressed="true"\] \{ background: var\(--ui-on-bg\); color: var\(--ui-on-fg\); \}/);
  });

  it("no IBM Plex for code or the extension preview; no white extension preview in the light theme; no 15px", () => {
    expect(noComments(read("styles/calm.css"))).not.toMatch(/Plex/);
    const x = noComments(read("styles/extension.css"));
    expect(x).toMatch(/:root\[data-theme="light"\] \.ext-demo \{ background: var\(--s1\); \}/);
    expect(x).not.toMatch(/--fs-15|15px/);
  });
});

describe("family 8: marketing and legal (task #310 F, pages/08)", () => {
  const SHEETS = ["site", "human-home", "human-pages", "platform-grid", "feature-demo", "leadership", "connectai", "blog", "luxe"].map((n) => `styles/${n}.css`);
  it("home, about, why, contact, plans, services, blog, MCP, leadership label and legal sheets have no hand-typed corners, sizes or weights", () => {
    expect(SHEETS.flatMap(shapeFindings)).toEqual([]);
  });

  it("the hero's Explore button takes the main button colour from its token (no page-own #1F7A55)", () => {
    expect(rulesFor(read("styles/human-home.css"), /\.hh \.btn\.hh-go:not\(\.primary\)\s*$/).join("")).toMatch(/background: var\(--btn-bg\); color: var\(--btn-fg\);/);
  });

  it("no IBM Plex anywhere: the font files are not loaded and no chart, canvas or variable names it", () => {
    expect(read("main.tsx")).not.toMatch(/ibm-plex/);
    const files = ["styles/finlit.css", "styles/calm.css", "styles/tools.css", "components/PageArt.tsx", "components/DrawLayer.tsx", "three/Plot3D.tsx",
      "charts/PriceChart.tsx", "charts/IntradayChart.tsx", "charts/FinChart.tsx", "charts/Small.tsx", "stock/Sections3.tsx"];
    for (const f of files) expect(noComments(read(f)), f).not.toMatch(/IBM Plex/);
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
