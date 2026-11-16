// Task #161: the landing page's deep green is the dark-mode background of every page, and its surfaces are shades of the same green.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "site-green.css"), "utf8");
const main = readFileSync(resolve(__dirname, "../main.tsx"), "utf8");
const landing = readFileSync(resolve(__dirname, "human-home.css"), "utf8");

describe("site-wide dark green", () => {
  it("uses exactly the landing page's dark background", () => {
    expect(landing).toContain("#0C2619 radial-gradient(110% 120% at 80% 0%, #1B4A34, #0C2619 72%) fixed");
    expect(css).toContain(':root[data-theme="dark"] body { background: #0C2619 radial-gradient(110% 120% at 80% 0%, #1B4A34, #0C2619 72%) fixed;');
  });
  it("sets every surface token the older theme layers set, dark mode only", () => {
    for (const t of ["--bg-page", "--bg-surface", "--bg-subtle", "--bg-elevated", "--bg", "--s1", "--s2", "--s3", "--border", "--header"]) expect(css, t).toMatch(new RegExp(`${t}: #`));
    expect(css).not.toMatch(/data-theme="light"/);
    expect(css).not.toMatch(/#0B0C0F|#121317|#0A0D0C|#111513/i);   // none of the old near-blacks
  });
  it("is loaded after every theme layer and before overlay.css", () => {
    const at = (f: string) => main.indexOf(`import "./styles/${f}"`);
    for (const f of ["finlit.css", "luxe.css", "design-system.css", "calm.css"]) expect(at(f), f).toBeLessThan(at("site-green.css"));
    expect(at("site-green.css")).toBeLessThan(at("overlay.css"));
  });
});
