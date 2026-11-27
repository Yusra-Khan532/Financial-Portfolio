import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Task #428 (27 Nov 2026): "i want this much gap for every page present in the website this much gap between the all pages box and the header that opens
// for every page". The All pages box sits 22px under the top bar at rest AND while the page scrolls (it was sticky 12px under the bar), and the main column's
// first card starts 30px under the bar on every page with the side menu (it was anywhere from 12 to 40px).
const side = readFileSync(new URL("./sidebar.css", import.meta.url), "utf8");
const finlit = readFileSync(new URL("./finlit.css", import.meta.url), "utf8");
const block = side.slice(side.indexOf("task #428"));
const desk = block.slice(block.indexOf("@media (min-width: 861px)"), block.indexOf("/* ---- phone / tablet drawer"));
const px = (name: string) => Number((block.match(new RegExp(`${name}: (\\d+)px`)) ?? [])[1]);

describe("task #428: one gap under the top bar on every page with the side menu", () => {
  it("the gap tokens: the top bar's own height, 22px for the box, 18px + the card's 12px for the first card", () => {
    expect(px("--shell-top-h")).toBe(62);
    expect(finlit).toMatch(/\.top \.wrap \{[^}]*height: 62px/);   // the token follows the real top bar
    expect(px("--shell-gap")).toBe(22);
    expect(px("--shell-first")).toBe(18);
  });

  it("the All pages box keeps the same gap while scrolling: sticky top = bar + gap, and the same gap above it at rest", () => {
    expect(desk).toMatch(/\.side \{[^}]*top: calc\(var\(--shell-top-h\) \+ var\(--shell-gap\)\)/);
    expect(desk).toMatch(/\.side \{[^}]*margin-top: var\(--shell-gap\)/);
    expect(desk).toMatch(/\.side \{[^}]*max-height: calc\(100dvh - var\(--shell-top-h\) - 2 \* var\(--shell-gap\)\)/);
    // the later rule wins over the old 74px sticky top, which stays only as the base (and is overridden on every desktop width)
    expect(side.indexOf("task #428")).toBeGreaterThan(side.indexOf("top: 74px"));
  });

  it("the first card starts at the same place on every page: shared rule in the shell, not page by page", () => {
    expect(desk).toContain(".shell-main > :first-child:has(> :first-child:is(.card, .gate)) { padding-top: var(--shell-first) !important; }");
    expect(desk).toContain(".shell-main > :first-child:has(> :first-child:has(> :first-child:is(.card, .gate))) { padding-top: 0 !important; }");   // an outer wrapper adds none
    expect(desk).toContain(".shell-main > :first-child > :first-child:has(> :first-child:is(.card, .gate)) { padding-top: var(--shell-first) !important; }");
    expect(desk).toContain(".shell-main > :first-child > .gate:first-child > :first-child > .card:first-child { margin-top: 12px; }");
  });

  it("phones keep the drawer: nothing of this applies at 860px and below", () => {
    expect(block).toMatch(/\.shell \{ --shell-top-h: 62px; --shell-gap: 22px; --shell-first: 18px; \}\n@media \(min-width: 861px\) \{/);
    const phone = side.slice(side.indexOf("/* ---- phone / tablet drawer"));
    expect(phone).toMatch(/\.side \{ position: fixed; top: 0;/);
  });
});
