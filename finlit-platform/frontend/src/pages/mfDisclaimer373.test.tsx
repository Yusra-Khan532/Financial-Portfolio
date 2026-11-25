// Task #373 (team, 24 Nov 2026): "give a disclamer drop down box for this so that it looks neat in mutual fund screener". The notes under the table
// fold into a drop-down; the statutory mutual fund line stays in view in the closed row (it must always be readable), everything else opens below.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("./MfScreener.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles/task373.css", import.meta.url), "utf8");
const block = src.slice(src.indexOf('<footer className="mfs-fine'), src.indexOf("</footer>"));

describe("task #373: the screener disclaimer drop-down", () => {
  it("the notes sit in a closed-by-default details box under the table", () => {
    expect(block).toMatch(/<details className="mfs-disc">/);
    expect(block).not.toMatch(/<details[^>]*\bopen\b/);
    expect(src).toMatch(/import "\.\.\/styles\/task373\.css";/);
  });
  it("the closed row carries the Disclaimer tag and the full statutory line", () => {
    const summary = block.slice(block.indexOf("<summary>"), block.indexOf("</summary>"));
    expect(summary).toMatch(/>Disclaimer</);
    expect(summary).toMatch(/Mutual fund investments are subject to market risks; read all scheme-related documents carefully\./);
  });
  it("every earlier note is still there, inside the box", () => {
    const body = block.slice(block.indexOf("</summary>"));
    for (const t of ["{DISCLAIMER}", "not a recommendation", "Risk figures are to the end of last month", "Source: AMFI", "All schemes", "Fund industry trends"]) expect(body).toContain(t);
  });
  it("the drop-down is a full-size tap target with a turning chevron and a visible focus ring", () => {
    expect(css).toMatch(/\.mfs-disc > summary \{[^}]*min-height: var\(--ui-ctl-h\)/);
    expect(css).toMatch(/\.mfs-disc\[open\] \.mfs-disc-more svg \{ transform: rotate\(180deg\)/);
    expect(css).toMatch(/summary:focus-visible \{ outline: 2px solid/);
  });
});
