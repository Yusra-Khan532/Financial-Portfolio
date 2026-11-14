import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Tasks #110 and #111: the dark theme gives every text input its own box and focus ring (theme.css). A bar that wraps its input in a bordered box of its own
// must be in calm.css's list, or the page shows a box inside the box. A slider has no background, or the browser's field colour shows as a box round it.
const dir = new URL("./", import.meta.url);
const css = (f: string) => readFileSync(new URL("./" + f, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const calm = css("calm.css");
const listed = (calm.match(/([^{}]+)\{\s*border: 0 !important; background: none !important;/) ?? [])[1] ?? "";
describe("one box per search bar, and no box round a slider", () => {
  it("every component rule that makes its input borderless and transparent is in the calm.css list (else the dark theme's input box wins)", () => {
    const want = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".css") && x !== "calm.css")) {
      for (const m of css(f).matchAll(/(\.[a-z0-9-]+(?: label)?) input \{([^}]*)\}/g)) if (/border: ?(0|none)/.test(m[2]) && /background: ?(none|transparent)/.test(m[2]) && !/!important/.test(m[2])) want.add(m[1]);   // a rule with !important already beats the theme
    }
    const missing = [...want].filter((w) => !listed.includes(`${w} input`));
    expect(missing).toEqual([]);
    expect(listed).toContain(".dcf-search input");          // Reverse valuation, DCF and EPS (task #111)
  });
  it("a slider's background is transparent", () => {
    expect(css("site.css")).toMatch(/input\[type="range"\] \{ background-color: transparent; \}/);
  });
});
