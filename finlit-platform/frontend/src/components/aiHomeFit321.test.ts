import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #321 (22 Nov 2026): the FinLit AI full window's start screen. The robot's glow was cut by a straight line under the top row, and the
// content sat at the top with 360 to 420 px empty below. It now starts clear of the top row and sits in the middle of the window.
const css = readFileSync(join(__dirname, "..", "styles", "ask-ai.css"), "utf8");
const tsx = readFileSync(join(__dirname, "Assistant.tsx"), "utf8");

describe("FinLit AI start screen fits the window (task #321)", () => {
  it("the full window's start screen marks its body", () => {
    expect(tsx).toContain('<div className={"ai-body" + (view === "home" && big ? " aif-homebody" : "")}>');
  });
  it("sits in the middle with auto margins (a short window still starts at the top and scrolls)", () => {
    expect(css).toContain(".aif.full .ai-body.aif-homebody > :first-child { margin-top: auto; }");
    expect(css).toContain(".aif.full .ai-body.aif-homebody > :last-child { margin-bottom: auto; }");
    expect(css).not.toMatch(/aif-homebody[^{]*\{[^}]*justify-content:\s*center/);   // plain centring would cut the top off when the content is taller
  });
  it("the hello starts clear of the top row so the robot's glow is not cut, less on a short laptop and a phone", () => {
    expect(css).toContain(".aif.full .aif-homebody .aif-hero { padding-top: 22px; }");
    expect(css).toContain("@media (max-height: 799px) { .aif.full .aif-homebody .aif-hero { padding-top: 14px; } }");
    expect(css).toContain("@media (max-width: 720px) { .aif.full .aif-homebody .aif-hero { padding-top: 8px; } }");
  });
  it("on a tall window the robot and the theme cards are one step larger", () => {
    expect(css).toContain("@media (min-width: 981px) and (min-height: 800px)");
    expect(css).toContain(".aif.full .aif-homebody .aif-hero .aif-bot { width: 96px; height: 88px; }");
    expect(css).toContain(".aif.full .aif-homebody .aif-cats.five .aif-cat { min-height: 136px; padding: 16px 18px; }");
  });
});
