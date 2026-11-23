// Task #341 PR B (the Mutual Funds refinement prompt, section 11): the filters in two rows. Row 1: Search, Fund house, Plan, Option, each labelled;
// row 2: Return range and the stopped-schemes tick. Same controls, same behaviour.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const tsx = readFileSync(join(__dirname, "..", "mf", "Controls.tsx"), "utf8");
const dash = readFileSync(join(__dirname, "..", "mf", "Dashboard.tsx"), "utf8");
const css = readFileSync(join(__dirname, "mf341.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("Mutual funds filters in two rows (task #341 PR B)", () => {
  it("row 1 holds search, fund house, plan and option; row 2 the return range and the stopped tick", () => {
    const r1 = tsx.indexOf('<div className="mf-fbar">'), r2 = tsx.indexOf('<div className="mf-fbar mf-fbar2">');
    expect(r1).toBeGreaterThan(-1); expect(r2).toBeGreaterThan(r1);
    for (const x of ['className="mf-search"', '<Pick label="Fund house"', '<Seg label="Plan"', '<Seg label="Option"']) { const i = tsx.indexOf(x); expect(i, x).toBeGreaterThan(r1); expect(i, x).toBeLessThan(r2); }
    for (const x of ['mf-rangebtn', 'mf-stopck']) expect(tsx.indexOf(x), x).toBeGreaterThan(r2);
  });
  it("Plan and Option show their label (not only to screen readers); 38px controls; phones keep 16px inputs", () => {
    expect(tsx).toContain('<span className="label" id={`seg-${label}`}>{label}</span>');
    expect(css).toMatch(/\.mf-list \.mf-fbar \.mf-search \{ height: 38px; \}/);
    expect(css).toMatch(/@media \(min-width: 761px\) \{ \.mf-list \.mf-fbar \.mf-search input \{ font-size: var\(--fs-14\); \} \}/);
  });
  it("section 10: Select All on its own line with how many are ticked; chips 38px, the same height", () => {
    expect(dash).toContain('<span className="mf-alln" aria-live="polite">{picked} of {n} selected</span>');
    expect(dash).toContain("picked={q.cats === null ? subs.length : subs.filter((s) => q.cats!.includes(s.key)).length}");
    expect(css).toMatch(/\.mf-list \.mf-subgrid \.mf-check \{ min-height: 38px;/);
  });
});
