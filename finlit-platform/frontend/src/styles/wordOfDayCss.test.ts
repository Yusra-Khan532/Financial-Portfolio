// Task #315 (r4): the formula pills keep whole words. A pill wraps only at spaces and is never narrower than its longest word, so
// "Equity multiplier" can never break as "multiplie / r" again; the row of pills wraps instead.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "word-of-day.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
/** Every rule as selector and body (rules inside @media included). */
const rules = [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));

describe("Word of the Day formula pills", () => {
  it("never break inside a word: no `anywhere`, no `break-all`, and a pill or its part is never allowed below its longest word", () => {
    const fx = rules.filter((r) => /\.wod-fx-(pill|part|row)/.test(r.sel));
    expect(fx.length).toBeGreaterThan(2);
    for (const r of fx) {
      expect(r.body, r.sel).not.toMatch(/anywhere|break-all/);
      expect(r.body, r.sel).not.toMatch(/min-width:\s*0\b/);
    }
    const pill = rules.find((r) => r.sel === ".wod-fx-pill")!;
    expect(pill.body).toMatch(/word-break:\s*normal/);
    expect(pill.body).toMatch(/max-width:\s*100%/);                 // a very long word widens its pill up to the box, never past the panel
  });
  it("the row of pills wraps onto a new line when it runs out of room (no flex-wrap: nowrap in the formula box)", () => {
    for (const r of rules.filter((x) => /\.wod-fx/.test(x.sel))) expect(r.body, r.sel).not.toMatch(/flex-wrap:\s*nowrap/);
    expect(rules.find((r) => r.sel === ".wod-fx-row")!.body).toMatch(/flex-wrap:\s*wrap/);
    expect(rules.find((r) => r.sel === ".wod-fx-text")!.body).not.toMatch(/anywhere|break-all/);
  });
});
