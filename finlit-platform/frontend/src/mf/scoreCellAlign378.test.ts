// Task #378 (team, 24 Nov 2026), the Mutual Fund Score cell in the funds list: "in this center align is not proper and score shall be larger and the
// pillars PRCQ shall be distanced a bit and when hovered over shall score and name of pillar in mutual fund".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const mf = readFileSync(join(process.cwd(), "src/styles/mf.css"), "utf8");
const t371 = readFileSync(join(process.cwd(), "src/styles/task371.css"), "utf8");
const cell = readFileSync(join(process.cwd(), "src/mf/ScoreCell.tsx"), "utf8");

describe("task #378: the score cell centred, a larger score, P R C Q apart, a name and a rating on hover", () => {
  it("the cell centres the score, its word and the parts on one axis (it pushed the score to the right)", () => {
    expect(mf).toMatch(/\.mfs-cell \{ display: inline-flex; flex-direction: column; align-items: center; text-align: center;/);
    expect(mf).not.toMatch(/\.mfs-cell \{[^}]*align-items: flex-end/);
    expect(mf).toContain(".mfs-cell .mfs-inh { display: block; text-align: center; }");
  });
  it("the score is 20px in both tables", () => {
    expect(t371).toContain(".mfs-cell .mfs-pv { font-size: var(--fs-20); }");
    expect(t371).toContain(":root .mfs-table td.mfs-hs .mfs-pv { font-size: var(--fs-20);");
  });
  it("P R C Q are 8px apart", () => { expect(t371).toContain(".mfs-cell .mfs-parts { gap: 8px;"); });
  it("each part names itself, its figure and its rating on hover, focus or tap (reopened 25 Nov: the figure was missing; see scoreParts378.test.tsx)", () => {
    expect(cell).toContain("partTip(p.name, parts[p.key], scores?.[p.key])");
    expect(cell).toMatch(/tabIndex=\{0\} title="" data-tip=\{tips\[i\]\} aria-label=\{tips\[i\]\}/);
  });
});
