// The site header's class is `top` (styles/finlit.css: sticky, z-index 40, header background). Any other element given that bare class sticks to the top of the window
// over the navigation: that is how the dashboard's FII/DII bars once drew across the header. Only components/Layout.tsx may use it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f) ? [p] : []; });
const BARE = /className=(?:"|\{"|\{`|\{')(?:[^"`'}]*\s)?top(?:\s[^"`']*)?["`']/;

describe("the header's class", () => {
  it("is used by the site header only", () => {
    const bad = files(SRC).filter((p) => !p.endsWith(join("components", "Layout.tsx"))).flatMap((p) => readFileSync(p, "utf8").split("\n").map((l, i) => (BARE.test(l) ? `${p.slice(SRC.length + 1)}:${i + 1}` : null)).filter(Boolean));
    expect(bad).toEqual([]);
  });
  it("the pattern catches a bare `top` and lets prefixed names through", () => {
    expect(BARE.test('<span className="top">')).toBe(true); expect(BARE.test('<span className="b top on">')).toBe(true); expect(BARE.test('<div className={"top" + x}>')).toBe(true);
    expect(BARE.test('<div className="xt-top">')).toBe(false); expect(BARE.test('<div className="side-top is-on">')).toBe(false); expect(BARE.test('<button className="ai-top">')).toBe(false);
  });
});
