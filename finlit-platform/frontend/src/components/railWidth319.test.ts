import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #319 (22 Nov 2026): in the folded side menu the current group's tile was 62 px wide while "Dashboard" (64 px in bold) and
// "Calculators" (65 px) were wider, so the words ran past the tile. The rail is now 92 px, each tile fills it with 4 px inside and
// the short names never wrap; the page column leaves the rail plus its 20 px gap.
const css = (f: string) => readFileSync(join(__dirname, "..", "styles", f), "utf8");

describe("folded side menu width (task #319)", () => {
  it("the rail is 92 px and the page column matches it", () => {
    expect(css("sidebar.css")).toContain(".is-collapsed .side { width: 92px; overflow: hidden; }");
    expect(css("account.css")).toContain(".shell.is-collapsed { grid-template-columns: 112px minmax(0, 1fr); }");
  });
  it("each tile spans the rail, keeps its icon centred and its name on one line", () => {
    const rule = css("sidebar.css").match(/\.side-rail-g \{ all: unset;[^}]*\}/)![0];
    expect(rule).toContain("align-items: center");
    expect(rule).toContain("width: 100%");
    expect(rule).toContain("padding: 9px 4px");
    expect(rule).toContain("white-space: nowrap");
    // 92 px rail - 2 px border - 12 px rail padding - 8 px tile padding = 70 px for the name, more than "Calculators" in bold (about 68 px)
    expect(92 - 2 - 12 - 8).toBeGreaterThanOrEqual(68);
  });
});
