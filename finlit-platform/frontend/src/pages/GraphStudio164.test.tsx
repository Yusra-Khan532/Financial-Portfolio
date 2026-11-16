// @vitest-environment jsdom
// Task #164: chart builder. Each chart's markup toolbar opens and shuts on its own; the keyboard acts on the chart used last; three charts in a row keep
// their header inside the card; the companies-and-measures panel folds away from an arrow on its edge.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { shiftDraw, toggleDraw } from "./GraphStudio";
import { keysFor, touchLayer } from "../components/DrawLayer";

describe("independent markup toolbars", () => {
  it("opening one chart's toolbar keeps the others open", () => {
    let open: number[] = [];
    open = toggleDraw(open, 0, true); open = toggleDraw(open, 2, true); open = toggleDraw(open, 1, true);
    expect(open).toEqual([0, 1, 2]);
    expect(toggleDraw(open, 1, false)).toEqual([0, 2]);
    expect(toggleDraw(open, 2, true)).toEqual([0, 1, 2]);
  });
  it("removing a chart drops its toolbar and moves the later ones up a place", () => {
    expect(shiftDraw([0, 2, 4], 2)).toEqual([0, 3]);
    expect(shiftDraw([0, 2, 4], 1)).toEqual([0, 1, 3]);
  });
  it("Esc, undo and redo act only on the chart used last", () => {
    touchLayer("gx-a"); expect(keysFor("gx-a")).toBe(true); expect(keysFor("gx-b")).toBe(false);
    touchLayer("gx-b"); expect(keysFor("gx-a")).toBe(false); expect(keysFor("gx-b")).toBe(true);
  });
});

describe("layout", () => {
  const css = readFileSync(resolve(__dirname, "../styles/graphs.css"), "utf8");
  const src = readFileSync(resolve(__dirname, "GraphStudio.tsx"), "utf8");
  it("a narrow chart wraps its header instead of spilling into the next card", () => {
    expect(css).toMatch(/\.gx-cell \{ container-type: inline-size; container-name: gxcell; \}/);
    expect(css).toMatch(/@container gxcell \(max-width: 460px\)[\s\S]*header \{ flex-wrap: wrap;/);
  });
  it("the panel has an edge arrow that folds it and widens the charts, remembered on desktop", () => {
    expect(src).toContain('className="gx-edge" aria-expanded={panel} aria-controls="gx-panel"');
    expect(src).toContain('"wrap gx" + (panel ? "" : " gx-wide")');
    expect(src).toContain('localStorage.setItem(PANEL_KEY, open ? "open" : "shut")');
    expect(css).toMatch(/\.gx\.gx-wide \{ grid-template-columns: 54px minmax\(0, 1fr\); \}/);
  });
});
