// Task #161: one green is the dark-mode background of every page, the landing page included, and its surfaces are shades of the same green.
// Task #206: that green is the sage of the team's photo (#5D997F), in steps dark enough that every dark-mode text colour stays readable.
// Task #227: the steps go down to a deep dark green (the team's reference pictures), and the text colours dark mode really uses are cream and sage.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "site-green.css"), "utf8");
const main = readFileSync(resolve(__dirname, "../main.tsx"), "utf8");
const landing = readFileSync(resolve(__dirname, "human-home.css"), "utf8");

describe("site-wide dark green", () => {
  it("uses exactly the landing page's dark background", () => {
    const bg = "#173125 radial-gradient(110% 120% at 80% 0%, rgba(93, 153, 127, .30), #173125 72%) fixed";
    expect(landing).toContain(bg);
    expect(css).toContain(`:root[data-theme="dark"] body { background: ${bg};`);
  });
  it("sets every surface token the older theme layers set, dark mode only", () => {
    for (const t of ["--bg-page", "--bg-surface", "--bg-subtle", "--bg-elevated", "--bg", "--s1", "--s2", "--s3", "--border", "--header"]) expect(css, t).toMatch(new RegExp(`${t}: #`));
    expect(css).not.toMatch(/data-theme="light"/);
    expect(css).not.toMatch(/#0B0C0F|#121317|#0A0D0C|#111513/i);   // none of the old near-blacks
    expect(css).not.toMatch(/#23392F|#273F35/i);   // task #227: nor the lighter sage steps of task #206
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
    // task #227: the colours dark mode really paints with. finlit.css sets --text / --muted / --faint on :root[data-theme="dark"], which outweighs
    // design-system.css's :root mapping, so site-green.css must set them itself (before, the old blue-greys #B1B2B8 and #8F919B were left in place)
    const tok = (t: string) => css.match(new RegExp(`${t}: (#[0-9A-F]{6})`, "i"))![1];
    const text = { text: tok("--text"), muted: tok("--muted"), faint: tok("--faint"), primary: tok("--text-primary"), body: tok("--text-body"), secondary: tok("--text-secondary"),
      quiet: tok("--text-muted"), link: "#93C5FD", gain: "#4FC08C", loss: "#F2878F", gold: "#D9B96C" };
    for (const s of surfaces) {
      expect(Math.abs(hue(s) - hue("#5D997F")), `${s} is the photo's hue`).toBeLessThanOrEqual(3);
      for (const [k, t] of Object.entries(text)) expect(ratio(t, s), `${k} on ${s}`).toBeGreaterThanOrEqual(5.5);
    }
    expect(ratio("#F8F6F1", "#5D997F")).toBeLessThan(4.5);   // why the photo's own colour is not a text background
  });
  it("task #227: a deep dark green with cream and sage text, and no old blue-grey left in dark mode", () => {
    const lightness = (h: string) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return (Math.max(...v) + Math.min(...v)) / 2; };
    const tok = (t: string) => css.match(new RegExp(`${t}: (#[0-9A-F]{6})`, "i"))![1];
    expect(lightness(tok("--bg"))).toBeLessThan(0.16);   // the pictures' page green is about 14% lightness
    expect(lightness(tok("--s1"))).toBeLessThan(0.1);    // and their cards about 6 to 8%
    expect(tok("--text")).toBe("#F3EEE2");                // warm cream
    expect(tok("--muted")).toBe("#C3D0C7");               // sage grey
    expect(tok("--faint")).toBe("#A6B8AD");               // lighter sage
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/#B1B2B8|#8F919B/i);   // in rules, not in the notes
    expect(css).toContain("--border-control: #5D997F");   // the photo's sage stays for control borders
  });
});
