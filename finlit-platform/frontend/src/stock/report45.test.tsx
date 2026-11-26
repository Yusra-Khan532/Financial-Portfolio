// @vitest-environment jsdom
// Developer file 45, the founder's "too many colours? yes" (27 Nov 2026): the company report's colour roles (styles/report45.css).
//  1 the brand gold for every section's number, name and icon and every card's edge and icon
//  2 green and red only for up and down
//  3 blue for this company in a chart, grey (--cmp) for context and comparison
//  4 a palette only where categories must be told apart, five colours with no green or red, then grey
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionHead } from "./Sections";
import { segmentColors } from "../lib/segmentMix";
import { COLOR as OWN } from "../lib/ownView";
import { GROUPS } from "../lib/filings";

const SRC = resolve(__dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const files = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(n) && !/\.test\./.test(n) ? [p] : []; });
const report = files(__dirname).map((f) => [f.slice(SRC.length + 1), readFileSync(f, "utf8")] as const);
const GREEN_RED = /var\(--(k3|k6|k8|gain|loss|p-growth)\)/;

describe("1 · one gold for the page's structure", () => {
  it("a section head takes no colour: its number, name and icon are the brand gold", () => {
    const { container } = render(<SectionHead id="ratios" no="Ratios" icon="gauge" title="Valuation, returns, margins and debt" />);
    expect((container.querySelector(".sh") as HTMLElement).style.getPropertyValue("--sc")).toBe("var(--gold)");
  });
  it("no report section, head or card sets a colour of its own (they used 6 colours for the numbers and 5 for the Ratios cards)", () => {
    for (const [f, s] of report) {
      expect(s, f).not.toMatch(/<SectionHead[^>]* color="--/);
      expect(s, f).not.toMatch(/<section className="block[^"]*"[^>]* style=\{\{ "--sc"/);
      expect(s, f).not.toMatch(/"--ac": "var\(--(p-|c\d|k\d)/);
      expect(s, f).not.toMatch(/<Card ac=/);
    }
    expect(read("stock/own/OwnershipSection.tsx")).not.toContain('color: "--p-balance"');
    expect(read("stock/Sections3.tsx")).not.toContain("GROUP_COLOR");
    expect(read("styles/report45.css")).toContain("section.block .card { --ac: var(--gold); }");
  });
  it("the Discover rows and card, the forecast box and a neutral plain-words note are gold too (purple, green and blue before)", () => {
    expect(read("styles/dth.css")).toContain(".dth, .dth-card { --dth-p: var(--gold);");
    expect(read("styles/dth.css")).not.toMatch(/#6b46c1|#a68bf5/);
    expect(read("styles/forecast215.css")).toMatch(/\.fcst \{[^}]*color-mix\(in srgb, var\(--gold\) 45%/);
    expect(read("styles/report45.css")).toContain("section.block .plain:not(.pl-good):not(.pl-warn) { --pl: var(--gold); }");
    expect(read("stock/Sections2.tsx")).toMatch(/\["cap", "Market cap", [^\]]*"--gold"\]/);
  });
});

describe("2 · green and red mean only up and down", () => {
  it("the quarter's key rows and tiles are marked in gold, not green", () => {
    const css = read("styles/stock2.css");
    expect(css).toMatch(/\.qtt tr\.hl td, \.qtt tr\.sub\.hl td \{ background: color-mix\(in srgb, var\(--gold\) 14%/);
    expect(css).toMatch(/\.qt\.hl \{ border-color: color-mix\(in srgb, var\(--gold\)/);
  });
  it("categories never take green or red: segments, owners, filing kinds, corporate actions, the assets", () => {
    expect(Object.values(OWN)).not.toContain("#0B7A4B");
    for (const g of GROUPS) expect(g.colour, g.key).not.toMatch(GREEN_RED);
    const atlas = read("charts/Atlas.tsx");
    expect(atlas).toContain('{ dividend: "var(--c1)", bonus: "var(--c2)", split: "var(--c3)", rights: "var(--c4)", other: "var(--cmp)" }');
    expect(read("stock/MoreCharts.tsx")).toContain('["Cash", "cash", "var(--cmp)"]');
  });
  it("inside the report the palette's third and fourth colours are violet and teal, not green", () => {
    expect(read("styles/report45.css")).toContain("section.block { --c3: var(--k7); --c4: color-mix(in srgb, var(--k1) 45%, var(--k3)); }");
  });
});

describe("3 · blue is this company, grey is context", () => {
  it("revenue and net profit are blue (the latest period full), the margin line the palette's second colour", () => {
    const fin = read("charts/FinChart.tsx");
    expect(fin).toContain('const gRev = vgrad(s, css("--c1"), 0.45, 0.18), gGold = vgrad(s, css("--c1"), 1, 0.55), gNp = gRev');
    expect(fin).toContain('stroke: css("--c2"), "stroke-width": 2.4');
  });
  it("the quarter tiles and the trend cards: one line is blue, a pair is blue and orange", () => {
    const s4 = read("stock/Sections4.tsx");
    expect(s4).toContain('const ONE = "var(--c1)", TWO = "var(--c2)";');
    expect(s4).not.toMatch(/\b(INK|STONE|DEEP)\b|\bG\b(?= *[,}])/);
    expect(s4).toMatch(/label: "Borrowings"[^}]*color: TWO/);
  });
  it("volume, the average lines and the industry's breadth are grey (--cmp)", () => {
    expect(read("styles/report45.css")).toContain(":root { --cmp: var(--faint); }");
    expect(read("charts/PriceChart.tsx")).toContain('vg = vgrad(svgEl, css("--cmp"), 0.55, 0.15)');
    expect(read("charts/IntradayChart.tsx")).toContain('vg = vgrad(svgEl, css("--cmp"), 0.55, 0.15)');
    expect(read("stock/Sections3.tsx")).toContain('avg={mean} avgColor="var(--cmp)"');
    expect(read("stock/pack/stands.css")).toContain(".ws-line { stroke: var(--cmp);");
  });
  it("the drawn charts read their colours where they sit, so the report's palette reaches them", () => {
    for (const f of ["charts/PriceChart.tsx", "charts/IntradayChart.tsx", "charts/FinChart.tsx"]) expect(read(f), f).toMatch(/const css = \(v: string\) => cssAt\(v, (svgEl|s)\);/);
  });
});

describe("4 · a palette of five, then grey", () => {
  it("segments take --c1 to --c5; a single sixth keeps its name in grey; more are grouped", () => {
    const { color, grouped } = segmentColors(["A", "B", "C", "D", "E", "F"]);
    expect(["A", "B", "C", "D", "E"].map((n) => color[n])).toEqual(["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"]);
    expect(color.F).toBe("var(--muted)");
    expect(grouped).toEqual([]);
    expect(segmentColors(["A", "B", "C", "D", "E", "F", "G"]).grouped).toEqual(["F", "G"]);
  });
});
