// @vitest-environment jsdom
// Task #216 round 2a (company report handover, 17 Nov 2026, README 1.1, 1.3, 1.5, 1.6, 1.7, 1.9): the compact section heading with its description under the title
// and the counts as coloured chips (0 grey), the one drop-down arrow on the drop-downs that had none, the toggle look, the card accent as a top border, the
// enlarge-button room on tables and the phone rule for wide charts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SectionHead } from "./Sections";

afterEach(cleanup);
const css = (f: string) => readFileSync(join(__dirname, "../styles", f), "utf8");
const src = (f: string) => readFileSync(join(__dirname, f), "utf8");

describe("compact section heading (1.1)", () => {
  it("puts the counts as chips, a dot, then the description under the title; a 0 count is grey", () => {
    const { container } = render(<SectionHead id="notes" no="03 · What's going well and what to watch" icon="notes" tier="silver" sub="Plain-language findings."
      counts={[{ n: 1, label: "red flag", tone: "red" }, { n: 6, label: "to watch", tone: "amb" }, { n: 0, label: "positives", tone: "pos" }]} />);
    const desc = container.querySelector(".sh-tl + .sh-desc")!;   // developer file 47: one heading per section, its chip beside it, the line under both
    expect(desc).toBeTruthy();
    expect([...desc.querySelectorAll(".cchip")].map((c) => `${c.className}|${c.textContent}`)).toEqual(["cchip red|1 red flag", "cchip amb|6 to watch", "cchip zero|0 positives"]);
    expect(desc.querySelector(".sh-dot")).toBeTruthy(); expect(desc.textContent).toContain("Plain-language findings.");
    expect(container.querySelector(".sh-r")).toBeNull();   // the description is no longer on the right
  });
  it("sizes as task #216 set them (number 40, title 24, 44 px above; developer file 47's report47.css, loaded after, makes them 26, 20 and 32)", () => {
    const r = css("report216.css");
    expect(r).toMatch(/:root \{ --fs-num: 40px; --section-gap: 44px; \}/);
    expect(r).toMatch(/max-width: 760px\) \{\s*:root \{ --fs-num: 32px;/);
    expect(css("report-polish.css")).toMatch(/\.sh h2, \.sh-l:has\(\.sh-n\) h2 \{\s*font: var\(--ui-fw-medium\) var\(--ui-fs-h2\)/);   // serif 24px/500 at every width
    expect(r).not.toMatch(/\.sh h2[^{]*\{[^}]*!important/);   // no phone override: luxe.css no longer forces phone h2 sizes
    expect(r).toMatch(/\.sh \.sh-desc \{[^}]*var\(--fs-13, 13px\)/);
    expect(src("StockPage.tsx").indexOf("report216.css")).toBeGreaterThan(src("StockPage.tsx").indexOf("report-polish.css"));
  });
  it("03 and 11 pass their counts as chips", () => {
    expect(src("KeyFindings.tsx")).toContain("counts={counts}");
    expect(src("Sections3.tsx")).toMatch(/counts=\{ef \? \[\{ n: ef\.red/);
  });
});

describe("drop-down arrow, toggles, accent, enlarge room, phones", () => {
  it("\"Each factor explained\", both \"Investor interpretation\" and \"Not ranked this week\" show the round arrow (1.3)", () => {
    expect(src("DuPont.tsx")).toMatch(/<details className="dp-fold xdd"><summary><b>Each factor explained<\/b>.*<DropChev \/><\/summary>/);
    expect(src("EarningsCash.tsx")).toContain("<summary>Investor interpretation<DropChev /></summary>");
    expect(src("EarningsIntel.tsx")).toContain("<summary>Investor interpretation<DropChev /></summary>");
    expect(src("Leadership.tsx")).toContain("Not ranked this week ({lead.notRanked!.length})<DropChev /></summary>");
    expect(css("report216.css")).toMatch(/details\.xdd\[open\] > summary > \.xdd-chev \{ transform: rotate\(180deg\); \}/);
  });
  it("toggles in a heading row are 33 px, not 46 (1.5)", () => {
    expect(css("tools.css")).toMatch(/\.sh-r \.seg button \{[^}]*min-height: 33px/);
    expect(css("tools.css")).not.toMatch(/\.sh-r \.seg button \{[^}]*min-height: 46px/);
  });
  it("the card accent is a 2 px top border, not a bar that runs past the rounded corners (1.7)", () => {
    expect(css("finlit.css")).toMatch(/\.card\.acc \{ border-top: 2px solid/);
    for (const f of ["finlit.css", "premium.css", "theme.css"]) expect(css(f), f).not.toMatch(/\.card\.acc::before/);
  });
  it("a table outside a boxed card makes room for the enlarge button (1.6)", () => {
    expect(readFileSync(join(__dirname, "../components/ChartZoom.tsx"), "utf8")).toContain('(kind === "table" ? "cz-table " : "")');
    expect(css("report216.css")).toMatch(/\.cz\.cz-table:not\(\.cz-boxed\) :is\(th, td\):last-child \{ padding-right: 46px; \}/);
  });
  it("on phones a wide chart keeps 680 px and scrolls inside its box (1.9)", () => {
    expect(css("report216.css")).toMatch(/svg:is\(\[viewBox\^="0 0 720 "\], \[viewBox\^="0 0 760 "\], \[viewBox\^="0 0 1000 "\]\) \{ min-width: 680px;/);
  });
});
