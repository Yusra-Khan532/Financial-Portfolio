// Developer file 40 (founder, 25 Nov 2026): "remove the Results filings section from Discover and make the section header better and uniform, like
// adding 'From investor presentations' before Themes ..., and make it feel like the user has to click on them to open the different sections".
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const css = read("discovery/discover.css").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (sel: string) => { const m = new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`).exec(css); expect(m, sel).not.toBeNull(); return m![2]; };

describe("the Discover view bar", () => {
  it("two groups, each with its label above its views: From investor presentations (four views) and From earnings calls", () => {
    const page = read("pages/Discovery.tsx");
    expect(page).toContain('group("dw-g-pres", "From investor presentations", four)');
    expect(page).toContain('group("dw-g-calls", "From earnings calls", calls)');
    expect(page).not.toContain("From calls and results");
    expect(page).not.toMatch(/SOURCES\.results/);
    expect(rule(".dw-glab")).toMatch(/text-transform: uppercase/);
  });
  it("every view is a button to press: a border, the card colour, a darker border on hover; the open one filled as the site marks a selected tab", () => {
    const tab = rule(".dw-tab");
    expect(tab).toMatch(/border: 1px solid var\(--border-strong\)/);
    expect(tab).toMatch(/background: var\(--s1\)/);
    expect(tab).toMatch(/min-height: 40px/);
    expect(tab).toMatch(/cursor: pointer/);
    expect(rule(".dw-tab:hover")).toMatch(/border-color: var\(--text\)/);
    expect(rule(".dw-tab[data-on]")).toBe(" background: var(--ui-on-bg); color: var(--ui-on-fg); border-color: var(--ui-on-bg); ");
    expect(css).not.toMatch(/\.dw-tab\[data-on\]::after/);                        // no underline any more
    expect(css).not.toMatch(/\.dw-tlab/);
  });
  it("the labels show at every width (no rule hides them); a phone's views are 44 px tap targets and the bar scrolls sideways", () => {
    expect(css).not.toMatch(/\.dw-glab \{ display: none/);
    expect(css).toMatch(/\.dw-tab \{ padding: 0 12px; min-height: 44px; \}/);
    expect(rule(".dw-tabs")).toMatch(/overflow-x: auto/);
  });
  it("the Earnings calls note no longer speaks of results filings", () => {
    expect(read("discovery/Sources.tsx")).toContain("every earnings-call view here is open to everyone.");
    expect(read("discovery/Info.tsx")).not.toContain("(results filing)");
  });
});
