// Task #226: in FinLit AI's full window the top row (back arrow, full window, help, close) is a row of its own above the conversation, on the
// conversation's width; it was laid over the conversation, so the first question ran into the buttons and messages slid under them.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/ask-ai.css", "utf8");
const lastRule = (sel: string) => { const all = [...css.matchAll(new RegExp(sel.replace(/[.()>]/g, "\\$&") + " \\{([^}]*)\\}", "g"))]; return all[all.length - 1]?.[1] ?? ""; };

describe("FinLit AI full window: the top row (task #226)", () => {
  it("is a row of its own, not laid over the conversation", () => {
    const hd = lastRule(".aif.full > header.aif-hd");
    expect(hd).toMatch(/position: relative/);
    expect(hd).toMatch(/pointer-events: auto/);
    expect(css.lastIndexOf("position: relative; top: auto")).toBeGreaterThan(css.lastIndexOf("position: absolute; top: 0; right: 0; left: 272px"));   // the later rule wins
  });
  it("lines its back arrow and buttons up with the conversation's edges (1080px wide, 24px inside)", () => {
    expect(lastRule(".aif.full > header.aif-hd")).toMatch(/padding: 10px max\(24px, calc\(\(100% - 1080px\) \/ 2 \+ 24px\)\)/);
    expect(css).toMatch(/\.aif\.full \.ai-body \{ width: min\(1080px, 100%\); \}/);
  });
});
