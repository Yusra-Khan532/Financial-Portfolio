// Task #370 (team, 24 Nov 2026): "reduce button sizes so they fit properly in the green image shown in filter box of mutual funds".
// Cause: .btn.sm was only written in dcf.css (loaded with the DCF pages) and never overrode the base .btn height (42px), so every "btn sm" button,
// including the filter box's Clear and Hide filters, showed full size. These tests keep the small button global and small.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(__dirname, f), "utf8");
describe("task #370: the small button (.btn.sm) is small on every page", () => {
  it("is defined once, in a file main.tsx loads for every page", () => {
    expect(read("../main.tsx")).toContain('import "./styles/task370.css";');
    const files = readdirSync(__dirname).filter((f) => f.endsWith(".css") && /^\.btn\.sm\s*\{/m.test(read(f)));
    expect(files).toEqual(["task370.css"]);                    // not in a page's own file (dcf.css had it, so it worked only after a DCF page)
  });
  it("overrides the base button height and uses the design system's small size", () => {
    const css = read("task370.css");
    expect(css).toMatch(/^\.btn\.sm \{ height: auto; min-height: var\(--ui-ctl-h-sm\); padding: 0 12px; font-size: var\(--fs-13\);/m);
    expect(read("finlit.css")).toMatch(/^\.btn \{[^}]*height: 42px;/m);   // the base it has to beat
  });
  it("keeps a 44px tap target on a phone, also in the filter box header (which mfscreen.css sets to 32px on desktop)", () => {
    const css = read("task370.css");
    expect(css).toMatch(/@media \(max-width: 860px\) \{\s*:root \.btn\.sm, :root \.mfs-sh-top \.btn\.sm \{ min-height: var\(--ui-ctl-h\); \}/);
    expect(read("mfscreen.css")).toContain(".mfs-sh-top .btn.sm { min-height: 32px; }");
  });
  it("the filter box header still uses the small buttons", () => {
    const tsx = read("../pages/MfScreener.tsx");
    expect(tsx).toContain('className="btn sm" onClick={reset}>Clear</button>');
    expect(tsx).toContain('className="btn sm mfs-hidef"');
  });
});
