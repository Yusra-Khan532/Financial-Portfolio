// Task #462 (28 Nov 2026): "the box are collapsing into each other when clicked on check box same issue as mutual fund screener".
// A ticked row's tint was a see-through gold on its own, so the pinned name cell let the figures scrolled under it show through.
// Every tint of a ticked row is now laid over a solid colour, in the ETF list and the Mutual fund screener alike.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = (f: string) => readFileSync(join(__dirname, "..", "styles", f), "utf8");
// the background of every rule whose selector names a ticked (or hovered pinned) row
const rules = (src: string, sel: RegExp) => [...src.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => sel.test(m[1])).map((m) => (/background:\s*([^;]+)/.exec(m[2])?.[1] ?? "").trim()).filter(Boolean);

describe("task #462: a ticked row stays opaque under the pinned column", () => {
  for (const [file, sel] of [["etf351.css", /tr\.is-picked|tr:hover > th\.etf-first/], ["mfscreen.css", /tr\.is-picked/]] as const) {
    it(`${file}: every ticked-row background ends on a solid colour`, () => {
      const bgs = rules(css(file), sel);
      expect(bgs.length).toBeGreaterThan(0);
      for (const bg of bgs) {
        expect(bg).not.toBe("var(--gold-soft)");          // the old see-through tint on its own
        expect(bg).toMatch(/,\s*var\(--bg\)$/);              // the last layer is the solid page colour
      }
    });
  }
});
