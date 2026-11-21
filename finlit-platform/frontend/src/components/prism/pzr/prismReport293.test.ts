// Task #293 (21 Nov 2026, the team's Prism report pack): layout fixes on /prism/:symbol and the engine's benchmark note in plain words.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { benchmarkNote } from "./Health";

const css = (f: string) => readFileSync(join(process.cwd(), "src/styles", f), "utf8");
const src = (f: string) => readFileSync(join(process.cwd(), "src/components/prism/pzr", f), "utf8");

describe("Prism report fixes (task #293)", () => {
  it("1: the trend map's row labels may wrap and have room (112px, 78px on phones, SHORT- / TERM)", () => {
    const t = css("prism-technical.css");
    expect(t).toContain(".pzt-map thead td { width: 112px; }");
    expect(t).toMatch(/\.pzt-map th \{ white-space: normal; \}/);
    expect(css("prism220.css")).toMatch(/@media \(max-width: 560px\) \{\s*\.pzr-rep \.pzt-map thead td \{ width: 78px; \}\s*\.pzr-rep \.pzt-map th small \{ overflow-wrap: normal;/);
  });
  it("2: the Trend alignment row follows its own width (container query), so the diamond stays on line 1 in the narrow card", () => {
    const c = css("prism-card.css");
    expect(c).toContain(".pcx-al { container-type: inline-size; }");
    expect(c).toMatch(/@container \(max-width: 520px\) \{\s*\.pcx-asp \{ display: none; \}/);
  });
  it("3: 'Sideways · 0' stays on one line", () => {
    expect(css("prism-card.css")).toContain(".pcx-sl span:nth-child(2) { white-space: nowrap; }");
  });
  it("4: every valuation card has the same header shape and starts its bars at the top", () => {
    const p = css("prism.css");
    expect(p).toContain(".pzr-peer-h { flex-direction: column; align-items: flex-start; gap: 2px; }");
    expect(p).toContain(".pzr-peer { align-content: start; }");
  });
  it("5 and 6: the search grows, the filter button is centred, and phones get the short placeholder", () => {
    const p = css("prism.css");
    expect(p).toContain(".pzr-pagebar > .pzr-pick { flex: 1 1 420px; min-width: 0; }");
    expect(p).toContain(".pzr-search .sf-inline { top: 12px; }");
    expect(src("Landing.tsx")).toContain('placeholder={narrow ? "Company name or symbol" : "Company name or symbol, for example TCS"}');
  });
  it("7: in dark the map's labels have no shaded box or line (the site-wide dark th rule is out-ranked)", () => {
    expect(css("prism220.css")).toContain(":root .pzr-rep .pzt-map th, :root .pzr-rep .pzt-map thead td { background: none; border: 0; }");
  });
  it("8: the engine's internal status is never shown; members read plain words; the medians sentence stays; anything else is not shown", () => {
    const raw = "No peer calculation required, or industry universe unavailable or exceeds the on-demand limit.";
    expect(benchmarkNote(raw)).toBe("The sector benchmarks above come from the data provider; FinLit did not work out its own peer average for this company.");
    const med = "Medians use at least five available positive multiples from the FinEdge industry peer universe.";
    expect(benchmarkNote(med)).toBe(med);
    expect(benchmarkNote("ERR_PEERS_TIMEOUT")).toBeNull();
    expect(benchmarkNote(null)).toBeNull();
    expect(src("Health.tsx")).not.toContain("{report.benchmark.note}");
  });
});
