// Task #121 (13 Nov 2026): the landing hero as in the team's picture, and the "Quantify the market" line bigger than before (24px desktop, 16px phone).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #407 (26 Nov 2026): the landing page is now the go-live pack's markup (landing/GoLiveMarkup.tsx); its hero keeps #121's heading, paragraph
// and buttons, adds the short line for phones, and puts "Check a company you own" and "Updated after every market close · Information only,
// not investment advice." where the three ticks were.
const markup = readFileSync(join(__dirname, "..", "landing", "GoLiveMarkup.tsx"), "utf8");
const tsx = markup.slice(markup.indexOf('className="hh-top"'), markup.indexOf('id="platform"'));
const css = readFileSync(join(__dirname, "..", "styles", "human-home.css"), "utf8");
/** the font size the last rule for `.hh-strip` sets inside a media query that contains `media` (or outside any query when media is "") */
// task #310 F: the sizes are now the type tokens (var(--fs-28)), read as their px number
function stripSize(media: string): number {
  const re = media ? new RegExp(`@media \\([^)]*${media}[^)]*\\)\\s*\\{[^@]*?\\.hh-strip \\{[^}]*?font-size: (?:var\\(--fs-)?(\\d+)(?:px|\\))`, "g") : /^\.hh-strip \{[^}]*?font-size: (?:var\(--fs-)?(\d+)(?:px|\))/gm;
  const all = [...css.matchAll(re)].map((m) => Number(m[1]));
  return all[all.length - 1];
}

describe("landing hero (#121)", () => {
  it("has the picture's heading, paragraph, buttons and ticks", () => {
    expect(tsx).toContain("<h1 className=\"ui-title ui-title--marketing\" id=\"hh-title\">Research deeper.<br /><em>Invest with clarity.</em></h1>");
    expect(tsx).toContain("Explore statistical scoring models, customizable analytical tools, comprehensive company reports, sector insights and much more—all in one platform.");
    expect(tsx).toMatch(/className="btn lg hh-go"[^>]*href="#platform"[^>]*>Explore the platform/);
    expect(tsx).toContain("See a sample company report");
    for (const t of ["Check a company you own", "Updated after every market close"]) expect(tsx).toContain(t);
    expect(tsx).toContain("Information only, not investment advice.");
  });
  it("drops the #118 pieces the picture does not have, and never says Free", () => {
    for (const gone of ["hh-feats", "hh-curve", "hh-swoosh", "Research with", "Explore every listed company"]) expect(tsx).not.toContain(gone);
    expect(tsx).not.toMatch(/\bfree\b/i);
  });
  it("makes the Quantify line bigger than before on desktop and phone", () => {
    expect(stripSize("min-width: 1100px")).toBeGreaterThan(24);
    expect(stripSize("max-width: 760px")).toBeGreaterThan(16);
    expect(css).toMatch(/\.hh-strip em \{ font-style: normal;/);   // "Track what matters." upright, as in the picture
  });
});
