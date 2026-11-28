// Developer file 50: the founder's "highlight this" (27 Nov 2026, 3:54 pm) on 01's "See the theme in Discover".
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(resolve(__dirname, ".."), p), "utf8");

describe("See the theme in Discover stands out", () => {
  it("is the card's main button, filled in the card's gold with the surface colour as text, never the action green", () => {
    expect(read("stock/DiscoverThemes.tsx")).toContain('<Link className={buttonClass("primary", "md", "dth-btn dth-go")} to={themeLink(d.main?.name ?? c.theme, co)}>See the theme in Discover<Arrow /></Link>');
    const css = read("styles/dth.css");
    expect(css).toContain(".dtc .dtc-acts a.dth-btn.dth-go { background: var(--gold); border-color: var(--gold); color: var(--s1); font-weight: 600;");
    expect(css).toMatch(/\.dtc \.dtc-acts a\.dth-btn\.dth-go:hover \{ background: color-mix\(in srgb, var\(--gold\) 86%, var\(--text\)\);/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce) { .dtc .dtc-acts a.dth-btn.dth-go svg { transition: none; }");
  });
});
