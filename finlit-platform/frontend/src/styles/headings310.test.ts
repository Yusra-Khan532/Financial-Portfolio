import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Task #310 PR C (UI consistency pack, 02 section 2): three title styles (tool 32px, long read 40px, marketing 64px; ui-title), one H2
// (serif 24px/500, 40px on marketing pages), one H3 (sans 16px/600) and the label (12px/600 uppercase). Measured before: 10 title styles
// and about 40 heading pairs.
const SRC = new URL("../", import.meta.url).pathname;
const read = (f: string) => readFileSync(join(SRC, f), "utf8");
function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

describe("page titles (task #310)", () => {
  it("every page h1 is drawn as ui-title (tool), ui-title--read or ui-title--marketing", () => {
    const bad: string[] = [];
    for (const f of walk(SRC, /\.tsx$/)) {
      const t = readFileSync(f, "utf8");
      for (const m of t.matchAll(/<h1\b[^>]*>/g)) {
        if (/sr-only|ui-title|titleCls/.test(m[0])) continue;
        bad.push(`${relative(SRC, f)}: ${m[0].slice(0, 80)}`);
      }
      // a title never sets its own size inline again
      for (const m of t.matchAll(/<h1\b[^>]*style=\{\{[^}]*(font|fontSize)\b[^>]*>/g)) bad.push(`${relative(SRC, f)} inline font: ${m[0].slice(0, 80)}`);
    }
    expect(bad).toEqual([]);
  });

  it("the shared page header draws its title as ui-title, open (no card), with the read size for the long reads", () => {
    const ph = read("components/PageHeader.tsx");
    expect(ph).toContain('"ph-title ui-title" + (titleVariant === "read" ? " ui-title--read" : "")');
    const css = noComments(read("styles/page-header.css"));
    expect(css).toMatch(/\.ph-title \{ margin: 0; letter-spacing/);
    expect(css).not.toMatch(/\.ph-title \{[^}]*font/);
    expect(css).not.toMatch(/\.ph \{[^}]*(background|border:)/);   // the title starts at the left edge of the content column
    for (const f of ["pages/LearnSectorRotation.tsx", "pages/LearnSectorSignals.tsx", "pages/MfScoreMethod.tsx"]) expect(read(f)).toContain('titleVariant="read"');
  });

  it("the three title sizes come from the tokens, with the phone steps 28 / 32 / 40", () => {
    const ui = noComments(read("styles/ui.css"));
    expect(ui).toMatch(/\.ui-title \{[^}]*var\(--fs-page-title\)/);
    expect(ui).toMatch(/\.ui-title--read \{ font-size: var\(--ui-fs-title-read\)/);
    expect(ui).toMatch(/\.ui-title--marketing \{ font-size: var\(--ui-fs-title-marketing\)/);
    expect(ui).toMatch(/max-width: 860px\)[\s\S]*\.ui-title \{ font-size: var\(--fs-28\)[\s\S]*\.ui-title--read \{ font-size: var\(--fs-32\)[\s\S]*\.ui-title--marketing \{ font-size: var\(--fs-40\)/);
  });

  it("luxe.css's phone heading rule no longer overrides the roles", () => {
    const luxe = noComments(read("styles/luxe.css"));
    expect(luxe).toContain("h1:not(.ui-title), .pagehead h1:not(.ui-title), .hh-hero h1:not(.ui-title), .dash-h h1:not(.ui-title) { font-size: var(--fs-28) !important;");
    expect(luxe).not.toMatch(/(^|[\s,}])h2[^{}]*\{[^}]*font-size[^}]*!important/);
    expect(luxe).not.toMatch(/font-weight: 3[45]0/);
  });
});

describe("H2 and H3 (task #310)", () => {
  // every rule whose selectors all end in an h2 or h3 element and that sets a size uses the role tokens (the print layout .pp keeps pt sizes)
  const END = /(?:^|[\s>+~(])(h2|h3)(?:[.#:[][^\s>+~]*)?\)?\s*$/;
  const ROLE = /var\(--ui-fs-h2\)|var\(--ui-fs-h2-marketing\)|var\(--ui-fs-h3\)|var\(--fs-label\)/;
  it("every heading rule sizes its h2 / h3 with the role tokens", () => {
    const bad: string[] = [];
    for (const f of walk(SRC, /\.css$/)) {
      if (/stress\/stresslab\.css$/.test(f)) continue;   // the Stress Lab's own document styles (scoped to its frame)
      const t = noComments(readFileSync(f, "utf8"));
      for (const m of t.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
        const sels = m[1].trim().split(/,(?![^()]*\))/).map((s) => s.trim()).filter(Boolean);
        if (!sels.length || sels.some((s) => s.startsWith("@") || s.startsWith(".pp ")) || !sels.every((s) => END.test(s))) continue;
        const size = m[2].match(/(?:^|;)\s*font(?:-size)?\s*:[^;]*/g);
        if (!size) continue;
        for (const d of size) if (/\d(px|pt|em|rem)|clamp\(|var\(--fs-(?!label)/.test(d) && !ROLE.test(d)) bad.push(`${relative(SRC, f)}: ${sels.join(", ").slice(0, 60)} { ${d.trim().slice(0, 60)} }`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("the base h2 and h3 are the roles; weights only 400 to 700 on them", () => {
    expect(read("styles/finlit.css")).toMatch(/\nh2 \{ font: var\(--ui-fw-medium\) var\(--ui-fs-h2\)\/var\(--lh-24\) var\(--font-serif\)/);
    expect(read("styles/luxe.css")).toMatch(/h2 \{ font: var\(--ui-fw-medium\) var\(--ui-fs-h2\)/);
    expect(read("styles/type227.css")).toContain(":where(main) h3 { font: var(--ui-fw-semibold) var(--ui-fs-h3)/var(--lh-16) var(--font-sans); }");
  });

  it("marketing pages mark their section titles ui-h2--marketing (40px), and it wins over a section rule", () => {
    for (const f of ["pages/About.tsx", "pages/Why.tsx", "pages/Services.tsx", "pages/LeadershipLabel.tsx", "pages/ConnectAI.tsx"]) {
      const t = read(f);
      expect(t, f).not.toMatch(/<h2>/);
      expect(t, f).toContain('<h2 className="ui-h2--marketing">');
    }
    expect(noComments(read("styles/ui.css"))).toContain(".ui-h2--marketing, h2.ui-h2--marketing { font-size: var(--ui-fs-h2-marketing)");
  });
});
