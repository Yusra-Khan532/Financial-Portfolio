// Task #376 (team, 24 Nov 2026), the Mutual funds list: (1) "How to read this table" as a drop-down, closed at first, at the top where the team's arrow
// points (above the filters and the table); (2)+(3) every scheme and no filter at the start (task #369, PR #921, already does this: checked here);
// (4) Reset filters beside Hide filters, the two in proportion.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_DEFAULTS, parseQuery, queryToParams } from "../lib/mf";

const page = readFileSync(join(process.cwd(), "src/pages/Funds.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/styles/task376.css"), "utf8");

describe("task #376: How to read this table, every fund, no filter, Reset filters", () => {
  it("the notes are one closed drop-down above the filters and the table, and no longer under the table", () => {
    const how = page.indexOf('<details className="mf-howto">'), layout = page.indexOf('<div className={"mf-layout"');
    expect(how).toBeGreaterThan(0); expect(how).toBeLessThan(layout);
    expect(page).not.toMatch(/<details className="mf-howto" open/);
    expect(page.match(/<Legend /g)?.length).toBe(1);
    expect(page.slice(how, how + 600)).toContain("How to read this table");
    expect(page).not.toContain('<PhoneFold page="funds" id="legend"');
  });
  it("the page starts with every scheme and no filter (task #369)", () => {
    const q = parseQuery(new URLSearchParams(""));
    expect(q).toEqual(PAGE_DEFAULTS);
    expect(q).toMatchObject({ tab: "all", cats: null, plan: "", option: "All", status: "", q: "", amc: "" });
    expect(queryToParams(PAGE_DEFAULTS).toString()).toBe("");
  });
  it("Reset filters sits beside Hide filters, both small buttons, and goes back to the start", () => {
    const head = page.slice(page.indexOf('<div className="mf-side-h">'), page.indexOf("</span></div>", page.indexOf('<div className="mf-side-h">')));
    expect(head.indexOf("mf-resetf")).toBeGreaterThan(0); expect(head.indexOf("mf-resetf")).toBeLessThan(head.indexOf("mf-hidef"));
    expect(head).toContain('className="btn sm mf-resetf"'); expect(head).toContain('className="btn sm mf-hidef"');
    expect(head).toContain("disabled={atStart}");
    expect(page).toMatch(/const resetAll = \(\) => \{ setText\(""\); setSp\(queryToParams\(\{ \.\.\.PAGE_DEFAULTS, \.\.\.keep \}\)/);
    expect(page).toMatch(/const keep = \{ view: q\.view, sort: q\.sort, dir: q\.dir, size: q\.size \};/);
  });
  it("the pair has one height (36px, 44px on a phone) and the drop-down row is a full tap target", () => {
    expect(css).toMatch(/\.mf-side-acts \.btn\.sm \{ min-height: var\(--ui-ctl-h-sm\); \}/);
    expect(css).toMatch(/\.mf-side-acts \{ flex: 1 0 100%; display: grid; grid-template-columns: 1fr 1fr;/);   // equal widths
    expect(css).toMatch(/@media \(max-width: 860px\) \{ \.mf-list \.mf-side-acts \.btn\.sm \{ min-height: var\(--ui-ctl-h\); \} \}/);
    expect(css).toMatch(/\.mf-howto > summary \{[^}]*min-height: var\(--ui-ctl-h\)/);
  });
});
