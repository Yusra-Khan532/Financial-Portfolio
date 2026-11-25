// Task #216, round 1 (company report handover of 17 Nov 2026): the removals. No downloads anywhere in the report, no "What supports and weighs on the rating" and
// no "Show full breakdown" on the Prism card, live section 17 gone (its chart under the Prism card), 02's one-row "Sector impact" gone, 15's trigger cards no longer
// repeating 03's text. Source-level checks, like ReportNumbering.test.ts; the rendering is covered by each section's own test.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_FAQS } from "../content/pageFaqs";
import { NAV } from "../lib/sectionNav";

const files = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(n) && !/\.test\./.test(n) ? [p] : []; });
const read = (f: string) => readFileSync(join(__dirname, f), "utf8");
/** The text a reader can see: JSX text and string literals, with comments taken out. */
const visible = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("task #216 round 1: removals", () => {
  it("the header has no Download button or menu (and no PDF, HTML or CSV export)", () => {
    const hero = visible(read("Hero.tsx"));
    expect(hero).not.toMatch(/download/i); expect(hero).not.toContain("dl-menu"); expect(hero).not.toMatch(/Research note · PDF|Offline copy · HTML|Data · CSV/);
    for (const label of ["Set alert", "Watching", "Value (DCF)", "Share"]) expect(hero).toContain(label);
  });
  it("no section of the report offers a download: no \"Download CSV\" in 09 or 12, no \"Download table (CSV)\" in 10", () => {
    for (const f of files(__dirname)) expect(visible(readFileSync(f, "utf8")), f).not.toMatch(/>[^<{]*download|["'`][^"'`]*\bdownload\b[^"'`]*["'`]/i);
  });
  it("the FAQ has no \"What can I download?\", reads 9 questions, and \"What can I do from the report?\" does not say download", () => {
    const faq = PAGE_FAQS.find((f) => f.id === "company-report")!;
    expect(faq.items).toHaveLength(9);
    expect(faq.items.some((i) => /download/i.test(i.q + i.a))).toBe(false);
    expect(faq.items.find((i) => i.q === "What can I do from the report?")!.a).toBe("Set an alert, add the company to a watchlist, value it in the DCF calculator, or share the report.");
  });
  it("the Prism card has no \"What supports and weighs on the rating\" and no \"Show full breakdown\", for any plan", () => {
    const src = visible(read("PrismCompare.tsx") + read("Hero.tsx"));   // task #283: the old score card (ScoreCard.tsx) is gone
    expect(src).not.toContain("What supports and weighs"); expect(src).not.toMatch(/Show full breakdown|Hide full breakdown|PrismDetail|ScoreDetail|DashToggle/);
  });
  it("live section 17 is gone from the page and the section bar; Community is the last section (17 since developer file 41); the score history sits under the Prism card", () => {
    expect(read("StockPage.tsx")).not.toContain("MethodSection");
    expect(NAV.map(([id]) => id)).not.toContain("method");
    expect(read("CommunitySection.tsx")).toContain('<SectionHead id="community" no="Community"');
    expect(NAV[NAV.length - 1][0]).toBe("community");
    const hero = read("Hero.tsx");
    expect(hero.indexOf("<ScoreMovesCard")).toBeGreaterThan(hero.indexOf("<PrismCompare"));
  });
  it("Economy and sector shows \"Sector impact\" only when it has more than one row", () => {
    expect(read("MacroOutlook.tsx")).toContain("{rows.length > 1 && <SectorTable rows={rows} />}");
  });
  it("Gold insights, with its trigger cards, is gone (developer file 41: the founder removed section 15); the findings stay in What's going well and what to watch", () => {
    expect(read("Sections3.tsx")).not.toContain("export function InsightsSection");
    expect(read("StockPage.tsx")).toContain("<KeyFindings ");
  });
});
