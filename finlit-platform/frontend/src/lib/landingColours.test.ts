// Tasks #118-#120 (13 Nov 2026): the landing page uses only the logo's three colours (green, golden, yellow) and neutrals, and its figures are true.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STATS } from "./platformTools";

const css = (f: string) => readFileSync(join(__dirname, "..", "styles", f), "utf8");
const hexes = (t: string) => [...t.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toUpperCase());
/** a colour with a clear hue other than green or yellow/golden (blue, purple, pink, teal, orange, red) */
function offPalette(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.12) return false;                                     // a neutral (white, cream, near-black, grey)
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  return !(h >= 32 && h <= 62) && !(h >= 95 && h <= 165);         // golden/yellow 32-62°, green 95-165°
}

describe("landing colours (#120)", () => {
  it("the hero and the platform part use no colour outside green, golden and yellow", () => {
    const bad = [...hexes(css("human-home.css")), ...hexes(css("explore-tools.css"))].filter(offPalette);
    expect(bad).toEqual([]);
  });
  it("the six groups take their accents only from the logo tokens (no blue, purple, pink, teal or orange)", () => {
    const t = css("explore-tools.css");
    for (const old of ["#2b6cb0", "#6b43b0", "#b4235a", "#0e7490", "#a15c07", "#c4a5ff", "#f28bb0", "#7a8594"]) expect(t.toLowerCase()).not.toContain(old);
    expect(t).toMatch(/\[data-group="company-360"\][^{]*\{ --ac: var\(--hh-au-fill\)/);
  });
  it("the offPalette check itself catches the old colours and passes the logo's", () => {
    for (const c of ["#2B6CB0", "#6B43B0", "#B4235A", "#0E7490", "#F28BB0"]) expect(offPalette(c)).toBe(true);
    for (const c of ["#1F6B49", "#7FD8A6", "#C9A24E", "#7A5B16", "#E8D29B", "#F7F3E8", "#0B2A1E"]) expect(offPalette(c)).toBe(false);
  });
});

describe("landing figures (#119)", () => {
  it("22 sectors is NSE's own count in the backend's classification file", () => {
    const raw = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "backend", "finlit_technicals", "data", "nse_industries.json"), "utf8")).stocks as Record<string, unknown>;
    const sectors = new Set(Object.values(raw).filter((v): v is string[] => Array.isArray(v) && v.length > 1).map((v) => v[1]));
    expect(STATS.find((s) => s.label === "Sectors")!.value).toBe(String(sectors.size));
  });
  it("every figure names its source", () => { for (const s of STATS) expect(s.source.length).toBeGreaterThan(10); });
});
