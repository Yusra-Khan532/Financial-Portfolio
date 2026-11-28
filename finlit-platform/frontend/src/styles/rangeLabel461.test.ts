// Task #461 (team, 28 Nov 2026), ETFs: "take this inside the box in etf filter box". The Ranges labels sat on each box's top border
// (a fieldset legend); a floated legend is laid out inside the box, on its own line above the from / to inputs.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "task461.css"), "utf8");
const list = readFileSync(join(__dirname, "../etf/List.tsx"), "utf8");

describe("task #461: the Ranges labels inside their boxes", () => {
  it("the legend is floated full width, so it sits inside the fieldset rather than on its border", () => {
    expect(css).toMatch(/\.etf-list \.etf-range legend\s*\{[^}]*float: left;[^}]*width: 100%;[^}]*padding: 0;/);
  });
  it("each range is still a fieldset named by its legend (the label screen readers announce)", () => {
    expect(list).toContain('<fieldset className="etf-range"><legend>{label}</legend>');
  });
  it("is loaded by the ETF list and scoped to it", () => {
    expect(list).toContain('import "../styles/task461.css";');
    for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.trim()).filter(Boolean)) expect(rule.startsWith(".etf-list ")).toBe(true);
  });
});
