// Task #157: the green "Explore the platform" buttons on the landing page turn gold on hover and focus, in both themes, ahead of the site-wide dark hover rule.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("landing: Explore the platform turns gold on hover (task #157)", () => {
  const css = readFileSync(join(__dirname, "..", "styles", "explore-tools.css"), "utf8");
  it("both green buttons (platform part and hero) get a gold fill and dark text on hover and keyboard focus", () => {
    const rule = css.slice(css.indexOf("/* Task #157"));
    for (const sel of [":root .xt .btn.xt-go:not(.primary):hover", ":root .xt .btn.xt-go:not(.primary):focus-visible", ":root .hh .btn.hh-go:not(.primary):hover"]) expect(rule).toContain(sel);
    expect(rule).toMatch(/background: var\(--gold-2\); color: var\(--on-gold, #1A1405\)/);
  });
  it("the rule outranks the site-wide dark hover (:root:not([data-theme=light]) .btn:not(.primary):hover)", () => {
    expect(css).toContain(':root:not([data-theme="light"]) .xt .btn.xt-go:not(.primary):hover');
    expect(css).toContain(':root:not([data-theme="light"]) .hh .btn.hh-go:not(.primary):hover');
  });
});
