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

describe("Word of the Day panel has an edge of its own (task #335)", () => {
  it("a 2px gold-mixed border, after the base rule, so it reads on the dark page; the phone sheet keeps no bottom edge", () => {
    const edge = rules.filter((r) => r.sel === ".wod-panel" && /border:/.test(r.body));
    expect(edge.at(-1)!.body).toMatch(/border:\s*2px solid color-mix\(in srgb, var\(--gold\) 55%, var\(--border-strong\)\)/);
    expect(css).toMatch(/\.wod-panel \{ top: auto;[^}]*border-bottom: 0;/);
  });
});

describe("Word of the Day formula: pills sized to their words, a division drawn as a fraction (owner's screenshot of 23 Nov)", () => {
  it("no pill or part takes an equal share of the line (the rule that squeezed '(CPI now − CPI a year ago)' into four lines is gone)", () => {
    for (const r of rules.filter((x) => /\.wod-fx/.test(x.sel))) expect(r.body, r.sel).not.toMatch(/flex:\s*1\b|flex:\s*1 1 0/);
    expect(css).not.toMatch(/wod-fx-row--few/);
  });
  it("a fraction stacks its top and bottom with a full-width line between them", () => {
    expect(rules.find((r) => r.sel === ".wod-fx-frac")!.body).toMatch(/flex-direction:\s*column/);
    expect(rules.find((r) => r.sel === ".wod-fx-bar")!.body).toMatch(/align-self:\s*stretch[\s\S]*border-top:\s*2px solid var\(--text\)/);
  });
});

describe("Word of the Day formula is centred in its box (task #441, the team's marked screenshot of 28 Nov)", () => {
  const body = (sel: string) => rules.filter((r) => r.sel === sel).map((r) => r.body).join(";");
  it("each row, and the part after '=' when it moves under the name, centre their pieces", () => {
    expect(body(".wod-fx-row")).toMatch(/justify-content:\s*center/);
    expect(body(".wod-fx-rhs")).toMatch(/justify-content:\s*center/);
    for (const r of rules.filter((x) => /\.wod-fx-(row|rhs)\b/.test(x.sel))) expect(r.body, r.sel).not.toMatch(/justify-content:\s*(flex-start|start|left|space-between)/);
  });
  it("a clause shown as written and each line of a fraction are centred, with balanced lines; a pill's own text stays centred", () => {
    expect(body(".wod-fx-text")).toMatch(/text-align:\s*center/);
    expect(body(".wod-fx-text")).toMatch(/text-wrap:\s*balance/);
    expect(body(".wod-fx-fn")).toMatch(/text-align:\s*center/);
    expect(body(".wod-fx-pill")).toMatch(/text-align:\s*center/);
    for (const sel of [".wod-fx-pill", ".wod-fx-fn"]) expect(body(sel), sel).toMatch(/text-wrap:\s*balance/);
    expect(body(".wod-fx-frac")).toMatch(/align-items:\s*center/);
  });
  it("the box keeps its column, and nothing in it gets a fixed width that could overflow a 390 px phone", () => {
    expect(body(".wod-fx")).toMatch(/flex-direction:\s*column/);
    for (const r of rules.filter((x) => /\.wod-fx/.test(x.sel))) expect(r.body, r.sel).not.toMatch(/(?<![-\w])width:\s*\d+px/);
  });
});
