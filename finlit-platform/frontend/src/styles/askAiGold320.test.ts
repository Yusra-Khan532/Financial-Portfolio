import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #320 (22 Nov 2026): "make this box golden", the Ask FinLit AI button in the header bar.
const css = readFileSync(join(__dirname, "ai-top.css"), "utf8");

describe("Ask FinLit AI is golden (task #320)", () => {
  it("rework (23 Nov, 'still not golden'): the site's gold look (the Prism actions' gradient), dark words and spark, in light and dark", () => {
    expect(css).toContain(".top .ai-top { background: linear-gradient(180deg, var(--gold-2), var(--gold-deep)); border-color: var(--gold-deep); color: var(--ui-on-prism); }");
    expect(css).toContain(".top .ai-top svg { color: currentColor; }");
    expect(css).not.toContain("var(--gold-soft)");
    const ui = readFileSync(join(__dirname, "ui.css"), "utf8");
    expect(ui).toContain(".ui-btn--prism { background: linear-gradient(180deg, var(--gold-2), var(--gold-deep)); color: var(--ui-on-prism); }");   // the same gold as Prism's buttons
  });
});
