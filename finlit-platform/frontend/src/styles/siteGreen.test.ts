// Task #161: one green is the dark-mode background of every page, the landing page included, and its surfaces are shades of the same green.
// Task #206: that green is the sage of the team's photo (#5D997F), in steps dark enough that every dark-mode text colour stays readable.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "site-green.css"), "utf8");
const main = readFileSync(resolve(__dirname, "../main.tsx"), "utf8");
const landing = readFileSync(resolve(__dirname, "human-home.css"), "utf8");

describe("site-wide dark green", () => {
  it("uses exactly the landing page's dark background", () => {
    const bg = "#23392F radial-gradient(110% 120% at 80% 0%, rgba(93, 153, 127, .42), #23392F 72%) fixed";
    expect(landing).toContain(bg);
    expect(css).toContain(`:root[data-theme="dark"] body { background: ${bg};`);
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
  it("task #206: every surface is a step of the photo's sage, and every dark-mode text colour reads on it (WCAG AA, 4.5:1)", () => {
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lum = (h: string) => { const [r, g, b] = hex(h).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const hue = (h: string) => { const [r, g, b] = hex(h), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; const v = mx === g ? (b - r) / d + 2 : mx === r ? ((g - b) / d) % 6 : (r - g) / d + 4; return Math.round(v * 60 + 360) % 360; };
    expect(css).toContain("--sage: #5D997F;");
    const surfaces = ["--bg-page", "--bg-surface", "--bg-subtle", "--bg-elevated", "--s1", "--s2", "--s3"].map((t) => css.match(new RegExp(`${t}: (#[0-9A-F]{6})`, "i"))![1]);
    const text = { primary: "#F8F6F1", body: "#D5DEE8", secondary: "#B5BFCC", muted: "#A5B1C2", link: "#93C5FD", gain: "#4ADE80", loss: "#FCA5A5", gold: "#C6A76A" };   // design-system.css, dark
    for (const s of surfaces) {
      expect(Math.abs(hue(s) - hue("#5D997F")), `${s} is the photo's hue`).toBeLessThanOrEqual(3);
      for (const [k, t] of Object.entries(text)) expect(ratio(t, s), `${k} on ${s}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio("#F8F6F1", "#5D997F")).toBeLessThan(4.5);   // why the photo's own colour is not a text background
  });
});
