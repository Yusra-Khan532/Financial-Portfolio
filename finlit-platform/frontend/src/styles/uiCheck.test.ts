// Task #310, step 4: the UI build check runs in CI with `npm test`. A file may never have MORE findings (raw colours, hand-typed
// corners and font sizes, off-rule weights, chart colours on controls) than its starting point in ui-baseline.json.
// After a page family moves to the shared pieces, lower the starting point: `npm run ui-check:baseline` (see scripts/check-ui.mjs).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkText, countsOf, readBaseline, scan, worseThan } from "../../scripts/check-ui.mjs";

describe("UI build check (task #310)", () => {
  it("no file has more findings than its starting point in ui-baseline.json", () => {
    const base = readBaseline();
    expect(base, "ui-baseline.json is committed next to package.json").not.toBeNull();
    const results = scan();
    expect(Object.keys(results).length).toBeGreaterThan(50);   // it really read the source
    const worse = worseThan(countsOf(results), base!).map(([f, n]) =>
      `${f}: ${n} findings, starting point ${base![f] || 0}\n` + results[f].slice(0, 8).map((x) => `    line ${x.line}  ${x.rule}  ${x.value}`).join("\n"));
    expect(worse, "use the variables in src/styles/ui-tokens.css; see scripts/check-ui.mjs").toEqual([]);
  });

  it("the shared pieces and the token layer themselves are clean", () => {
    const results = scan();
    for (const f of ["src/styles/ui.css", "src/styles/ui-tokens.css", "src/components/ui/Button.tsx", "src/components/ui/Tabs.tsx", "src/components/ui/Card.tsx",
      "src/components/ui/PageTitle.tsx", "src/components/ui/Input.tsx", "src/components/ui/Chip.tsx"]) expect(results[f], f).toBeUndefined();
  });

  it("the checker flags each kind, allows the tokens, and skips comments", () => {
    const css = [
      ".a { border-radius: 6px; }",
      ".b { border-radius: var(--r-ctl); font-size: var(--fs-14); font-weight: 600; }",
      ".c { font-size: 15px; }",
      ".d { font-weight: 800; }",
      ".e { color: #0E6471; }",
      ".f { border-radius: var(--r-card, 18px); font-size: var(--fs-13, 13px); }",
      ".g { color: var(--text); }   /* task #310: was #0E6471 */",
      "/* a note",
      "   with #FFFFFF inside */",
      ".tab-on {",
      "  background: var(--k1);",
      "}",
    ].join("\n");
    expect(checkText(css, { css: true }).map((x) => `${x.line} ${x.rule}`)).toEqual(["1 radius", "3 font-size", "4 font-weight", "5 raw colour", "11 chart colour on a control"]);
    expect(checkText(".e { color: #0E6471; }", { css: true, isToken: true })).toEqual([]);
    expect(checkText("const s = { borderRadius: 8, fontSize: 13 };   // see task #227").map((x) => x.rule)).toEqual(["radius", "font-size"]);
  });

  it("is wired into CI: the frontend workflow runs `npm test`, and package.json has the check and baseline scripts", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8"));
    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.scripts["ui-check"]).toBe("node scripts/check-ui.mjs");
    expect(pkg.scripts["ui-check:baseline"]).toBe("node scripts/check-ui.mjs --write-baseline");
  });
});
