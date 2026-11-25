// Task #372 (team, 24 Nov 2026): in the Mutual Fund Screener the Mutual Fund Score is the topmost filter; the section headings are bigger than the
// group titles (a sound ratio); the score group shows a crown, not a green edge.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GROUPS } from "../mf/screen/Panel";

const css = readFileSync(new URL("./task372.css", import.meta.url), "utf8");
const fgx = readFileSync(new URL("./fgx.css", import.meta.url), "utf8");
const old = readFileSync(new URL("./task358.css", import.meta.url), "utf8");
const panel = readFileSync(new URL("../mf/screen/Panel.tsx", import.meta.url), "utf8");
const px: Record<string, number> = { "--fs-12": 12, "--fs-13": 13, "--fs-14": 14, "--fs-16": 16, "--fs-18": 18, "--fs-20": 20 };

describe("task #372: the score filter on top, headings in proportion, a crown", () => {
  it("the score group is the first group and comes first on the page, under Quick shortlist", () => {
    expect(GROUPS[0].id).toBe("score");
    const i = (t: string) => panel.indexOf(t);
    expect(i('id="mfs-sec-short"')).toBeLessThan(i('<FilterGroup id="score"'));
    expect(i('<FilterGroup id="score"')).toBeLessThan(i('id="mfs-sec-start"'));
    expect(i('id="mfs-sec-start"')).toBeLessThan(i('<FilterGroup id="type"'));
  });
  it("section headings are bigger than the group titles, by 1.2 to 1.4 times", () => {
    const sec = /\.mfs-panel \.mfs-sec \{[^}]*font: 700 var\((--fs-\d+)\)/.exec(css)![1];
    const title = /\.mfs-panel \.fgx-g \.fgx-t \{ font-size: var\((--fs-\d+)\)/.exec(fgx)![1];
    const r = px[sec] / px[title];
    expect(r).toBeGreaterThanOrEqual(1.2); expect(r).toBeLessThanOrEqual(1.4);
    expect(css).toMatch(/\.mfs-panel \.mfs-sec \{[^}]*text-transform: none;[^}]*color: var\(--text\)/);
  });
  it("the score group has a gold crown and no green edge", () => {
    expect(panel).toMatch(/<FilterGroup id="score" icon="crown"/);
    expect(fgx).toMatch(/\[data-fgx="score"\] \.fgx-gi \{[^}]*color: var\(--gold\)/);
    expect(css).toMatch(/\[data-fgx="score"\] \{ box-shadow: none; \}/);
    expect(old).not.toMatch(/\[data-fgx="score"\] \{ box-shadow: inset/);
  });
});
