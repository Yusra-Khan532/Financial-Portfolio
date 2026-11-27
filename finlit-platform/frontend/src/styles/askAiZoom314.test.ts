// Task #314 (the team, 22 Nov 2026: "feels a lot zoomed in make it a bit zoomed out for the chatbot ans interface. The ans shall most of the times fit in
// single window. rest keep the ui same"). FinLit AI's full window is drawn one step smaller: the answer and the question at 14px (was 16px), tighter
// section blocks, a shorter top row and ask bar, a narrower side rail. Measured on a local build with the team's 4-section answer: 736px tall before,
// 599px after, so it now fits the team's 1534x820 window (671px of conversation before, 695px after) and 1366x768.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/ask-ai.css", "utf8");
const block = css.slice(css.indexOf("/* ---- Task #314"), css.indexOf("/* ---- The founder, 25 Nov 2026") > 0 ? css.indexOf("/* ---- The founder, 25 Nov 2026") : undefined);   // up to the pop-up (25 Nov 2026), which has its own tests
const rule = (sel: string) => { const all = [...block.matchAll(new RegExp(sel.replace(/[.()>:]/g, "\\$&") + " \\{([^}]*)\\}", "g"))]; return all[all.length - 1]?.[1] ?? ""; };

describe("task #314: FinLit AI's full window, one step smaller", () => {
  it("the answer and the question are 14px in the full window (16px before)", () => {
    expect(rule(".aif.full .bub")).toMatch(/font-size: var\(--fs-14\)/);
    expect(rule(".aif.full .aif-a-h")).toMatch(/font-size: var\(--fs-14\)/);
  });
  it("section blocks, the top row and the ask bar are tighter", () => {
    expect(rule(".aif.full .aif-a-sec")).toMatch(/padding: 7px 11px 8px/);
    expect(css).toMatch(/\.aif\.full > header\.aif-hd \{ position: relative;[^}]*min-height: 48px;[^}]*padding: 6px max\(24px/);   // task #226's own top row, made shorter
    expect(rule(".aif.full > .aif-inw > form")).toMatch(/min-height: 50px/);
  });
  it("the ask box keeps 16px text (a phone zooms into a field under 16px)", () => {
    expect(block).not.toMatch(/form input \{[^}]*font-size/);
  });
  it("the narrower side rail applies only where the rail shows (above 980px), so the phone layout is unchanged", () => {
    expect(block).toMatch(/@media \(min-width: 981px\) \{ \.aif\.full \{ grid-template-columns: 240px minmax\(0, 1fr\); \}/);
  });
  it("every rule of the change is scoped to the full window (the small window and other pages are untouched)", () => {
    const selectors = block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]*\{/g, "").match(/[^{}]+(?=\{)/g) ?? [];
    for (const s of selectors.map((x) => x.trim()).filter(Boolean)) for (const one of s.split(",")) expect(one.trim(), one).toMatch(/^\.aif\.full\b/);
  });
});
