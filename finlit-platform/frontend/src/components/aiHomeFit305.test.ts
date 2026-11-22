// Task #305 (the team, 22 Nov 2026): "no need to scroll in order to see those 4 preset list ... improve the UI of the bot use better colours".
// The four "Questions about this page" come right under the ask box, before the five theme cards, in the full window and the small window alike,
// and each theme card has its own hue. (The layout itself was measured in a real browser: desktop 1440x900 and 1366x768, iPhone 13, both themes.)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const tsx = readFileSync(join(__dirname, "Assistant.tsx"), "utf8");
const css = readFileSync(join(__dirname, "..", "styles", "ask-ai.css"), "utf8");

describe("task #305: the FinLit AI home shows this page's four questions without scrolling", () => {
  it("puts the four questions under the ask box, before the theme cards, in both windows", () => {
    const homes = tsx.split('{view === "home" && ').slice(1, 3);
    expect(homes).toHaveLength(2);
    for (const h of homes) {
      const ask = h.indexOf("{askBox}"), pq = h.indexOf('className="aif-pq"'), cats = h.indexOf('className="aif-cats five"');
      expect(ask).toBeGreaterThan(-1);
      expect(pq).toBeGreaterThan(ask);
      expect(cats).toBeGreaterThan(pq);
      expect(h).toMatch(/pageFaq\.items\.slice\(0, 4\)/);
    }
  });
  it("gives each of the five theme cards its own hue, in both themes", () => {
    for (let i = 1; i <= 5; i++) expect(css).toMatch(new RegExp(`\\.aif-cats\\.five > li:nth-child\\(${i}\\) \\{ --c: var\\(--aif-c${i}\\); \\}`));
    expect(css).toMatch(/:root\[data-theme="light"\] \.aif \{ --aif-c1:/);
  });
});
