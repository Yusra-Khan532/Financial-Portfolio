// Task #252 ("correct the rupee symbol alignment everywhere"): the company page's price had its ₹ raised .38em above the figures by a global ".rs" rule
// (finlit.css); the same class name is used for unrelated things (the radar chart's series, tools.css), so the rule also leaked. The ₹ now sits on the
// baseline, styled only inside the price, and no stylesheet raises a rupee again.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(SRC);

describe("#252: the rupee symbol sits on the baseline", () => {
  it("the company price's ₹ uses its own class, on the baseline", () => {
    const hero = readFileSync(join(SRC, "stock/Hero.tsx"), "utf8");
    expect(hero).toMatch(/<span className="hx-price"><span className="hx-rs">₹<\/span>/);
    const css = readFileSync(join(SRC, "styles/report216.css"), "utf8");
    expect(css).toMatch(/\.hx-d \.hx-price \.hx-rs \{[^}]*vertical-align: baseline;/);
  });
  it("no global '.rs' rupee rule is left to raise a ₹ (or leak onto the radar chart's '.rs' series)", () => {
    const fin = readFileSync(join(SRC, "styles/finlit.css"), "utf8");
    expect(fin).not.toMatch(/(^|[\s}])\.rs \{[^}]*vertical-align/);
  });
  it("no stylesheet raises or lowers the rupee by a fraction of a line", () => {
    const raised = files.filter((f) => f.endsWith(".css")).flatMap((f) => readFileSync(f, "utf8").split("}").filter((r) => /(rupee|rs|cur|inr)[^{]*\{[^]*vertical-align:\s*(-?\.?\d|super|sub|text-top)/i.test(r)).map((r) => f.replace(SRC, "") + ": " + r.trim().slice(0, 80)));
    expect(raised).toEqual([]);
  });
  it("the alert composer's ₹ (and the unit after the number) are centred on the typed number, not pinned a fixed distance down", () => {
    const css = readFileSync(join(SRC, "styles/account.css"), "utf8");
    expect(css).toMatch(/\.alx-pre \{[^}]*top: 50%; transform: translateY\(-50%\); line-height: 1;/);
    expect(css).toMatch(/\.alx-suf \{[^}]*top: 50%; transform: translateY\(-50%\); line-height: 1;/);
  });
  it("no ₹ is put in a <sup> or a raised inline style", () => {
    const bad = files.filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f)).filter((f) => /<sup[^>]*>₹|verticalAlign:[^,}]*\}\}>₹/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
});
