// Task #264 (20 Nov 2026, the team: "ui issue at the header of the tables", Discover's theme table in dark): the site-wide dark header shade was mixed
// with transparent (70% see-through) and outranks the tables' own header rules, so every pinned header showed the rows scrolling under it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const cssFiles = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith(".css") ? [p] : []; });
/** Every rule of every stylesheet, comments dropped: [selector, body]. */
const rules = cssFiles(root).flatMap((f) => [...readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2], f.slice(root.length + 1)] as const));
const seeThrough = (bg: string) => /transparent|rgba\([^)]*,\s*0?\.\d+\s*\)|\/\s*0?\.\d+\s*\)/.test(bg);
const background = (body: string) => /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/.exec(body)?.[1] ?? "";

describe("table headers are never see-through where they can be pinned (task #264)", () => {
  it("the site-wide dark header shade is solid: mixed with the card colour, not with transparent", () => {
    const r = rules.find(([sel, , f]) => f === "styles/theme.css" && sel === ':root:not([data-theme="light"]) th');
    expect(r).toBeTruthy();
    expect(background(r![1])).toBe("color-mix(in srgb, var(--s2) 70%, var(--s1))");
  });

  it("no rule that pins a header cell (position: sticky on a th) gives it a see-through background", () => {
    const bad = rules.filter(([sel, body]) => /\bth\b/.test(sel) && /position\s*:\s*sticky/.test(body) && seeThrough(background(body)))
      .map(([sel, , f]) => `${f}: ${sel}`);
    expect(bad).toEqual([]);
  });

  it("a pinned header is not made see-through by a later rule either: .pm-t th (Markets, Portfolio, the reports) stays solid", () => {
    const pinned = new Set(rules.filter(([, body]) => /position\s*:\s*sticky/.test(body)).flatMap(([sel]) => sel.split(",").map((x) => x.trim())).filter((x) => /\bth\b/.test(x)));
    const bad = rules.filter(([sel, body]) => sel.split(",").some((x) => pinned.has(x.trim())) && seeThrough(background(body))).map(([sel, , f]) => `${f}: ${sel}`);
    expect(bad).toEqual([]);
  });
});
