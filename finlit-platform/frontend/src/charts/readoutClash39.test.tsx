// Developer file 39 (founder, 24 Nov 2026, a screenshot of the company report): "why does this O H L C Vol come - it should not come".
// The line over Chart Lab's price chart (the day and O, H, L, C, Vol of the candle under the pointer) is the readout of charts/Atlas.tsx, class "rd"
// (styles/account.css). The Stock screener's Custom ratio drawer used the same class for its box, with `position: fixed`, 600 px wide on the right
// (full width on a phone), in styles/ratiodrawer.css. That file loads with the screener; after any visit to the screener, in the same tab, every
// readout on the company report became that panel: the five lines stacked in a dark column over the right of the page.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Candles } from "./Atlas";

const SRC = resolve(__dirname, "..");
const cssFiles = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === "node_modules" ? [] : cssFiles(p)) : n.endsWith(".css") ? [p] : []; });
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
// a selector that reaches the bare class "rd" (not rd-head, rd-drawer ...)
const BARE_RD = /(^|[\s,>+~(}])\.rd(?![\w-])/;

describe("the chart readout and the Custom ratio drawer no longer share a class", () => {
  it("only the chart readout's own rules (account.css) style the bare .rd class", () => {
    const hits = cssFiles(SRC).filter((f) => strip(readFileSync(f, "utf8")).split("{").some((sel) => BARE_RD.test(sel.slice(sel.lastIndexOf("}") + 1))));
    expect(hits.map((f) => f.slice(SRC.length + 1))).toEqual(["styles/account.css"]);
    expect(strip(readFileSync(join(SRC, "styles/account.css"), "utf8"))).not.toMatch(/\.rd\s*\{[^}]*position:\s*fixed/);
  });

  it("the drawer's box is .rd-drawer: still fixed on the right, 600 px, full width on a phone", () => {
    const css = strip(readFileSync(join(SRC, "styles/ratiodrawer.css"), "utf8"));
    const box = css.match(/^\.rd-drawer\s*\{([^}]*)\}/m)![1];
    expect(box).toMatch(/position:\s*fixed/); expect(box).toMatch(/right:\s*0/); expect(box).toMatch(/width:\s*min\(600px, 100vw\)/);
    expect(css).toMatch(/@media \(max-width: 640px\) \{ \.rd-drawer \{ width: 100vw; \}/);
    expect(readFileSync(join(SRC, "components/screener/RatioDrawer.tsx"), "utf8")).toContain('<div className="rd-drawer" role="dialog"');
  });

  it("the price chart's readout is one line of the chart (class rd), with the day and O H L C Vol", () => {
    const t = ["2026-11-20", "2026-11-23", "2026-11-24"], n = [1377.6, 1352.5, 1360];
    const html = renderToStaticMarkup(<Candles t={t} o={n} h={n.map((x) => x + 10)} l={n.map((x) => x - 10)} c={n} v={[558137, 600000, 500000]} />);
    expect(html).toMatch(/<div class="rd" aria-live="polite"><b>24 Nov 2026<\/b>/);
    for (const k of ["O ", "H ", "L ", "C ", "Vol "]) expect(html).toContain(`<span>${k}`);
  });
});

describe("nearby, in the same screenshot: a value in a trend card's tooltip stays on one line", () => {
  it("Cash and borrowings showed 'Borrowings 3.15' with 'L' on the next line; the value no longer breaks", () => {
    const css = strip(readFileSync(join(SRC, "styles/tools.css"), "utf8"));
    expect(css).toMatch(/\.mb-tip em \{ white-space: nowrap; \}/);
  });
});
