// Task #341 PR E (the Mutual Funds refinement prompt, sections 15-17): the nine How-to-read cards in three numbered groups (same cards, same text),
// the disclaimer and source in one framed block, the FAQ 40-48px below it; every rule on this page only (.mf-list).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(__dirname, "..", "pages", "Funds.tsx"), "utf8");
const css = readFileSync(join(__dirname, "mf341.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("Mutual funds page, bottom (task #341 PR E)", () => {
  it("the nine cards, each once, in the three groups the reference shows", () => {
    const groups = [...page.matchAll(/<h3 className="mf-ng-h" id="mf-ng-\d"><i aria-hidden="true">\d<\/i>([^<]+)<\/h3>/g)].map((m) => m[1]);
    expect(groups).toEqual(["Understanding returns", "Understanding Mutual Fund Scores", "Fund data and methodology"]);
    const titles = [...page.matchAll(/<NoteCard title="([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual(["Returns", "Return and cost bands", "ELSS", "Mutual Fund Score", "The 5-check checklist", "Fund size bands", "Fund size and expense ratio", "Older schemes", "Source"]);
    expect(page).toContain("      <h4>{title}</h4>");
  });
  it("only this page: every rule starts at .mf-list, the list page's own wrapper", () => {
    expect(page).toContain('<div className="wrap mf mf-list">');
    for (const rule of css.split("}").map((r) => r.trim()).filter((r) => r && !r.startsWith("@media") && r.includes("{"))) {
      const sel = rule.slice(0, rule.indexOf("{")).replace(/^@media[^{]*\{\s*/, "");
      for (const s of sel.split(",")) expect(s.trim(), s).toMatch(/^(\.wrap)?\.mf-list\b/);
    }
  });
  it("the disclaimer framed with a hairline before the source; the FAQ 40-48px below", () => {
    expect(css).toMatch(/\.mf-list \.mf-foot \{ margin-top: 24px; padding: 16px 20px; border: 1px solid var\(--border\);/);
    expect(css).toMatch(/\.wrap\.mf-list \{ padding-bottom: 8px; \}/);
  });
});
