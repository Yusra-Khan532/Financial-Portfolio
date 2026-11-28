// Task #455 (team, 28 Nov 2026): "make these headings green and this shall be across all filters".
// jsdom does not apply imported CSS, so the rules are read from the style files: the Mutual Fund Screener's section headings use the same
// green token as the group headings of the Mutual Funds and Stock screener filter panels, and the Panel loads the file after task #372's rule.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = (f: string) => readFileSync(resolve(__dirname, "../../styles", f), "utf8");

describe("task #455: filter section headings in green", () => {
  it("the MF screener section headings take var(--gain)", () => {
    expect(css("task455.css")).toMatch(/\.mfs-panel \.mfs-sec\s*\{\s*color:\s*var\(--gain\);\s*\}/);
  });

  it("is the same green as the other filter panels' group headings", () => {
    expect(css("fundType427.css")).toMatch(/\.mf-freq-k\s*\{[^}]*color:\s*var\(--gain\)/);
    expect(css("task364.css")).toMatch(/\.srt-grp[^{]*\{[^}]*color:\s*var\(--gain\)/);
  });

  it("the Panel loads task455.css after task372.css, so the green wins over the text colour", () => {
    const panel = readFileSync(resolve(__dirname, "Panel.tsx"), "utf8");
    const a = panel.indexOf("task372.css"), b = panel.indexOf("task455.css");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
  });

  it("only the section headings change: the filter titles under them are not recoloured", () => {
    expect(css("task455.css")).not.toMatch(/fgx/);
  });
});
