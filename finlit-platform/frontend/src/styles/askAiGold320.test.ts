import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #320 (22 Nov 2026): "make this box golden", the Ask FinLit AI button in the header bar.
const css = readFileSync(join(__dirname, "ai-top.css"), "utf8");

describe("Ask FinLit AI is golden (task #320)", () => {
  it("a soft gold fill, a gold edge and a gold spark, from the gold tokens (light and dark follow)", () => {
    expect(css).toContain(".top .ai-top { background: var(--gold-soft); border-color: color-mix(in srgb, var(--gold) 60%, transparent); color: var(--text); }");
    expect(css).toContain(".top .ai-top svg { color: var(--gold); }");
    expect(css).toContain(".top .ai-top:hover { background: color-mix(in srgb, var(--gold) 22%, transparent); border-color: var(--gold); }");
  });
});
