// Task #417: the tabs of the working, under the "Intrinsic value per share" card, drawn as the team's picture shows:
// one boxed button per tab, the open one filled with the site's action colour, no rule under the row, every tab in view.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/styles/dcf-redesign.css"), "utf8");
const page = readFileSync(join(process.cwd(), "src/pages/Dcf.tsx"), "utf8");
const rule = (sel: string) => {
  const i = css.indexOf(sel + "{");
  expect(i, sel).toBeGreaterThan(-1);
  return css.slice(i + sel.length + 1, css.indexOf("}", i));
};

describe("task #417: the working's tabs as boxed buttons", () => {
  it("the row has no underline rule and wraps instead of hiding tabs in a sideways scroll", () => {
    const row = rule(".dcx-tabs");
    expect(row).toContain("flex-wrap:wrap");
    expect(row).not.toMatch(/border-bottom|overflow-x/);   // the old look: a 1px line under underlined tabs, scrolled sideways on a phone
    expect(css).not.toContain(".dcx-tabs::-webkit-scrollbar");
  });
  it("each tab is a box: its own border, corner, surface and shadow, from the site's tokens", () => {
    const b = rule(".dcx-tabs button");
    for (const d of ["border:1px solid var(--border-strong)", "border-radius:var(--r-ctl)", "background:var(--s2)", "box-shadow:var(--ui-row-shadow)", "color:var(--text)", "min-height:var(--ui-ctl-h-sm)"]) expect(b).toContain(d);
    expect(b).not.toContain("border-bottom:2px");
    expect(b).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);   // no raw colours
  });
  it("the open tab is filled with the action colour (mint with dark text in dark, green with cream text in light)", () => {
    const sel = rule(".dcx-tabs [aria-selected=true],.dcx-tabs [aria-selected=true]:hover");
    expect(sel).toBe("background:var(--btn-bg);border-color:var(--btn-bg);color:var(--btn-fg)");
  });
  it("phone: 44px tap targets, and the boxes share each row; 1100px and under: the row lines up with the panel's padding", () => {
    expect(css).toMatch(/@media \(max-width:860px\)\{[^@]*\.dcx-tabs button\{min-height:var\(--ui-ctl-h\)\}/);
    expect(css).toMatch(/@media \(max-width:560px\)\{[^@]*\.dcx-tabs button\{flex:1 1 auto\}/);
    expect(css).toMatch(/@media \(max-width:1100px\)\{\s*\.dcx-panel\{padding:16px 14px 18px\}\s*\.dcx-tabs\{padding:16px 14px 2px\}/);
  });
  it("only the look changes: the same five tabs, in the same order, as a keyboard tab list", () => {
    expect(page).toContain('const TABS = [["built", "How it is built"], ["years", "Year by year"], ["sens", "Sensitivity"], ["scen", "Bear, base, bull"], ["rev", "Reverse DCF"]] as const;');
    expect(page).toContain('<div className="dcx-tabs" role="tablist" aria-label="The working" ref={list} onKeyDown={key}>');
    expect(page).toContain('role="tab"');
  });
});
