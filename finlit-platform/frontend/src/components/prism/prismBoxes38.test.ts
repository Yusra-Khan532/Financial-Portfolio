// Developer file 38 (founder, 24 Nov 2026): "in the FinLit Prism the formatting is not right, there are no boxes". The Prism report's trend cards
// (the score card at the top and 02 Technical view) get the boxes of the approved pack of 18 Nov; 02's copy gets the colour variables it was missing
// (its bar's middle zone, ticks and marker had no colour); the Trend map view is boxed like the Every signal view; the six market facts sit in rows of three.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");
const css = src("styles/prism-trend-boxes.css");
const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (sel: string) => { const i = rules.indexOf(sel + " {"); expect(i, sel).toBeGreaterThanOrEqual(0); return rules.slice(i, rules.indexOf("}", i)); };
const S = ":root:root .pzr-rep :is(.pzr-cardtop, .pzt-clone)";

describe("the Prism report's trend cards are boxes", () => {
  it("is loaded with the Prism report's shell, after its frame", () => {
    const shell = src("components/prism/pzr/Shell.tsx");
    expect(shell.indexOf('import "../../../styles/prism-trend-boxes.css";')).toBeGreaterThan(shell.indexOf('import "../../../styles/prism220.css";'));
  });

  it("each horizon is a box tinted in its band colour, the colour on its left edge", () => {
    const hz = rule(`${S} .pcx-tp > .pcx-hz`);
    expect(hz).toMatch(/border-left: 4px solid var\(--pc\)/);
    expect(hz).toMatch(/border-radius: var\(--r-card\)/);
    expect(hz).toMatch(/background: linear-gradient\(135deg, color-mix\(in srgb, var\(--pc\) 16%, var\(--s1\)\)/);
    expect(rule(`${S} .pcx-tp`)).toMatch(/border: 0;.*background: none/);              // the shared frame around both goes
  });

  it("the trend alignment is a box in its own colour", () => {
    const al = rule(`${S} .pcx-al`);
    expect(al).toMatch(/border-left: 4px solid var\(--pc\)/);
    expect(al).toMatch(/linear-gradient/);
  });

  it("02's copy has the card's colour variables in both themes, so its bar is whole", () => {
    expect(rules).toMatch(/^\.pzr-rep \.pzt-clone \{ --dk-w: 255, 255, 255; --dk-ink: var\(--text\); --dk-b: var\(--s1\); \}/m);
    expect(rules).toMatch(/:root\[data-theme="light"\] \.pzr-rep \.pzt-clone \{ --dk-w: 40, 34, 20; \}/);
    expect(rule(`${S} .pcx-zones .z3`)).toMatch(/var\(--muted\) 22%/);                  // the middle zone no longer depends on them
    expect(rule(`${S} .pcx-sc em`)).toMatch(/border: 3px solid var\(--pc\)/);
  });

  it("only the Prism report page: every rule is scoped to .pzr-rep, so the company report's Prism card is not touched", () => {
    const sels = [...rules.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) => m[2].trim()).filter(Boolean);
    expect(sels.length).toBeGreaterThan(20);
    for (const s of sels) expect(s, s).toMatch(/\.pzr-rep/);
    expect(rules).not.toMatch(/dk-card/);
  });

  it("the Trend map view is a box; on phones its padding leaves the map its width", () => {
    expect(rule(".pzr-rep .pzt-mapblk")).toMatch(/border: 1px solid var\(--border\);.*background: var\(--s2\)/);
    expect(rules).toMatch(/@media \(max-width: 560px\) \{ \.pzr-rep \.pzt-mapblk \{ padding: 14px 0 8px; \}/);
  });

  it("the market facts: rows of three from 900 px (two by two when there are four); the phone keeps one column", () => {
    expect(rules).toMatch(/@media \(min-width: 900px\) \{\s*\.pzr-rep \.pzt-obs:has\(> :nth-child\(4\)\) \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
    expect(rules).toMatch(/\.pzr-rep \.pzt-obs:has\(> :nth-child\(4\):last-child\) \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  });
});
