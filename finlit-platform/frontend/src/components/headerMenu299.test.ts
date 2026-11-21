// Task #299 (the team, 21 Nov 2026: "in this we see too much content written about each and every feature … we shall provide an i button where a
// person can hover in order to get the information about that specific feature"): the header menus (My portfolio, Research, Markets …) show each
// item's name only; its line is behind an i that shows it on hover, a tap or keyboard focus, and screen readers hear it with the link.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MORE, SECTIONS } from "../lib/nav";

const layout = readFileSync(join(__dirname, "Layout.tsx"), "utf8");
const css = readFileSync(join(__dirname, "..", "styles", "tools.css"), "utf8");

describe("task #299: header menu items are names with an i", () => {
  it("no longer writes each item's line under its name; the line is the i's tooltip and the link's description", () => {
    expect(layout).not.toMatch(/<small>\{it\.sub\}<\/small>/);
    expect(layout).toMatch(/role="tooltip" id=\{tip\} className="ddq-t">\{it\.sub\}</);
    expect(layout).toMatch(/aria-describedby=\{it\.sub \? tip : undefined\}/);
    expect(layout).toMatch(/aria-label=\{`What is \$\{it\.label\}\?`\}/);
  });
  it("shows the tooltip on hover of the i and on keyboard focus of the item, hidden otherwise", () => {
    expect(css).toMatch(/\.ddq-t \{ display: none;/);
    expect(css).toMatch(/\.ddq:hover \.ddq-t, \.ddr:has\(> a:focus-visible\) \.ddq-t \{ display: block; \}/);
  });
  it("every menu item still has its line to show behind the i", () => {
    const items = [...SECTIONS, MORE].flatMap((s) => s.groups.flatMap((g) => g.items));
    expect(items.length).toBeGreaterThan(20);
    expect(items.filter((i) => !i.sub)).toEqual([]);
  });
});
