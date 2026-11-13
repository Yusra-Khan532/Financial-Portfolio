// Task #116 (13 Nov 2026): the compact, sticky Peer Comparison header on Compare companies.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const tsx = readFileSync(join(__dirname, "Compare.tsx"), "utf8");
const css = readFileSync(join(__dirname, "..", "styles", "tools.css"), "utf8");

describe("Peer Comparison header (#116)", () => {
  it("has the analytics icon, the heading and the subtitle on the left", () => {
    expect(tsx).toContain('<span className="cmp-peer-ic" aria-hidden="true"><Icon name="bars" /></span>');
    expect(tsx).toContain("<b>Peer Comparison</b><small>Compare key financial &amp; valuation metrics across companies</small>");
  });
  it("shows each chosen company as a chip with its colour mark and a remove button, only when two or more are chosen", () => {
    expect(tsx).toMatch(/const showPeer = picked\.length >= 2;/);
    expect(tsx).toMatch(/className=\{"cmp-chip c" \+ i\}/);
    expect(tsx).toMatch(/aria-label=\{`Remove \$\{r\.name \|\| r\.symbol\} from the comparison`\}/);
    expect(tsx).toMatch(/onClick=\{\(\) => setIds\(ids\.filter\(\(x\) => x !== r\.symbol\)\)\}/);
  });
  it("is sticky under the site bar, with a subtle divider, and the names row of each tab sticks under it", () => {
    expect(css).toMatch(/\.cmpw \.cmp-peer \{ position: sticky; top: var\(--cmp-top, 62px\);/);
    expect(css).toMatch(/\.cmpw \.cmp-peer-t \{[^}]*border-right: 1px solid var\(--peer-line\)/);
    expect(css).toMatch(/\.cmpw \.mt-h, \.cmpw \.sp-h \{ top: calc\(var\(--cmp-top, 62px\) \+ var\(--cmp-peer, 0px\) \+ 8px\); \}/);
    expect(tsx).toContain('w.style.setProperty("--cmp-peer"');
  });
  it("marks the first company green and the second blue, a deep green panel in the dark theme, and no two chips alike", () => {
    expect(css).toMatch(/:root\[data-theme="dark"\] \.cmpw \{ --peer-bg: linear-gradient\(180deg, #0F2A1E, #0B2117\);[^}]*--peer-a: #7FD8A6; --peer-b: #4A93F0; \}/);
    expect(css).toMatch(/\.cmp-chip\.c0 \{ --cc: var\(--peer-a\); \} \.cmpw \.cmp-chip\.c1 \{ --cc: var\(--peer-b\); \} \.cmpw \.cmp-chip\.c3 \{ --cc: #8B6FE8; \}/);
  });
});
