// @vitest-environment jsdom
// Task #115 (13 Nov 2026) tools and eraser; task #124 (14 Nov 2026) the floating markup toolbar that replaced the #115 panel.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DrawLayer, DrawToggle } from "./DrawLayer";
import { hit, hitsAlong, sanitize, TOOLS, type Shape } from "../lib/drawings";

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  // jsdom has no PointerEvent: without it the pointer's position never reaches the handlers
  if (typeof window.PointerEvent === "undefined") (window as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent { pointerId: number; constructor(t: string, i: PointerEventInit = {}) { super(t, i); this.pointerId = i.pointerId ?? 1; } };
});
afterEach(() => { cleanup(); localStorage.clear(); });

// Task #124 (14 Nov 2026) replaced the #115 panel: no panel beside or above the chart; a pencil opens a compact floating Markup toolbar over the chart.
// jsdom has no layout: the chart box is 400 x 300 and its plotting area (the element marked data-plot) starts at (50, 14) and is 300 x 256.
const BOX = { left: 0, top: 0, width: 400, height: 300 }, PLOT = { left: 50, top: 14, width: 300, height: 256 };
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const r = this.hasAttribute("data-plot") || this.getAttribute("data-testid") === "dl-plot" ? PLOT : this.classList.contains("dl") ? BOX : { left: 0, top: 0, width: 0, height: 0 };
    return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON() { return r; } } as DOMRect;
  });
});
afterEach(() => vi.restoreAllMocks());
const Chart = () => <svg><text>axis</text><rect data-plot="" /></svg>;
const open = () => { render(<DrawLayer id="t124"><Chart /></DrawLayer>); fireEvent.click(screen.getByLabelText("Annotate this chart")); return screen.getByRole("toolbar", { name: "Chart markup tools" }); };

describe("floating markup toolbar (#124)", () => {
  it("has no panel: the toolbar floats inside the chart box, so the chart is not moved, shrunk or resized", () => {
    const bar = open();
    expect(screen.queryByText("Edit chart (Annotations)")).toBeNull();
    const outer = document.querySelector(".dl-outer")!, box = document.querySelector(".dl")!;
    expect(outer.children).toHaveLength(1);                                   // nothing beside or above the chart
    expect(box.firstElementChild!.tagName.toLowerCase()).toBe("svg");         // the chart is still the first thing in its box
    expect(bar.parentElement).toBe(box); expect(bar.className).toContain("dlm");
    expect(getComputedStyle(bar).position === "absolute" || bar.style.left !== "").toBe(true);
  });
  it("offers pen, highlighter, eraser, text, shapes, colour, undo and redo, and minimise and done", () => {
    const bar = open();
    for (const l of ["Pen", "Highlighter", "Eraser", "Text", "Undo", "Redo", "Minimise the markup toolbar", "Done drawing", "Move the markup toolbar (drag, or use the arrow keys)"]) expect(within(bar).getByLabelText(l)).toBeTruthy();
    expect(within(bar).getByLabelText(/^Shapes:/)).toBeTruthy();
    expect(within(bar).getByLabelText(/^Colour:/)).toBeTruthy();
    fireEvent.click(within(bar).getByLabelText(/^Shapes:/));
    expect(within(bar).getByRole("menu", { name: "Shapes" }).textContent).toBe("LineArrowDouble arrowRectangleCircleHorizontal lineVertical lineFibonacci");
  });
  it("shows thickness and opacity only for the tools that use them", () => {
    const bar = open();
    const settings = () => bar.querySelector(".dlm-set");
    expect(within(settings() as HTMLElement).getByLabelText("Thickness medium")).toBeTruthy();         // pen
    expect(within(settings() as HTMLElement).getByLabelText("Opacity 100%")).toBeTruthy();
    fireEvent.click(within(bar).getByLabelText("Highlighter"));
    expect(within(settings() as HTMLElement).getByLabelText("Opacity 30%").getAttribute("aria-pressed")).toBe("true");   // a highlighter starts see-through
    fireEvent.click(within(bar).getByLabelText("Text")); expect(settings()).toBeNull();
    fireEvent.click(within(bar).getByLabelText("Eraser")); expect(settings()).toBeNull();
  });
  it("minimises to a small pill and expands again", () => {
    const bar = open();
    fireEvent.click(within(bar).getByLabelText("Minimise the markup toolbar"));
    expect(within(bar).queryByLabelText("Pen")).toBeNull();
    expect(bar.querySelector(".dlm-set")).toBeNull();
    fireEvent.click(within(bar).getByLabelText("Expand the markup toolbar"));
    expect(within(bar).getByLabelText("Pen")).toBeTruthy();
  });
  it("moves with the grip anywhere inside the chart, never outside it, and keeps its place", () => {
    const bar = open(), grip = within(bar).getByLabelText(/^Move the markup toolbar/);
    fireEvent.pointerDown(grip, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: 5000, clientY: -5000, pointerId: 1 });       // far outside: held at the box's edge
    fireEvent.pointerUp(grip, { pointerId: 1 });
    expect(parseFloat(bar.style.top)).toBe(0);
    expect(parseFloat(bar.style.left)).toBeLessThanOrEqual(400);
    expect(JSON.parse(localStorage.getItem("finlit-markup-pos")!).y).toBe(0);
    fireEvent.keyDown(grip, { key: "ArrowDown" });
    expect(parseFloat(bar.style.top)).toBe(10);
  });
  it("draws only inside the plotting area: the drawing surface covers the plot, not the axes, and points are kept as fractions of it", () => {
    open();
    const surf = screen.getByTestId("dl-plot");
    expect([surf.style.left, surf.style.top, surf.getAttribute("width"), surf.getAttribute("height")]).toEqual(["50px", "14px", "300", "256"]);
    fireEvent.pointerDown(surf, { clientX: 50, clientY: 14, pointerId: 1, button: 0 });
    fireEvent.pointerMove(surf, { clientX: 200, clientY: 142, pointerId: 1 });
    fireEvent.pointerMove(surf, { clientX: 900, clientY: 900, pointerId: 1 });          // past the plot: held at its edge
    fireEvent.pointerUp(surf, { pointerId: 1 });
    const saved = JSON.parse(localStorage.getItem("finlit-drawings:t124")!);
    expect(saved.v).toBe(2);
    expect(saved.s[0].pts).toEqual([[0, 0], [0.5, 0.5], [1, 1]]);
  });
  it("moves drawings saved before #124 (fractions of the whole box) into the plotting area once, so they stay where they were drawn", () => {
    localStorage.setItem("finlit-drawings:t124", JSON.stringify([{ id: "a", c: "red", w: 3, k: "line", a: [0.125, 0.0466667], b: [0.875, 0.9] }]));
    render(<DrawLayer id="t124"><Chart /></DrawLayer>);
    const saved = JSON.parse(localStorage.getItem("finlit-drawings:t124")!);
    expect(saved.v).toBe(2);
    expect(saved.s[0].a[0]).toBeCloseTo(0, 3); expect(saved.s[0].a[1]).toBeCloseTo(0, 3);
    expect(saved.s[0].b[0]).toBeCloseTo(1, 3); expect(saved.s[0].b[1]).toBeCloseTo((0.9 * 300 - 14) / 256, 3);
  });
  it("asks before Clear all removes every annotation, and Cancel keeps them", () => {
    localStorage.setItem("finlit-drawings:t124", JSON.stringify({ v: 2, s: [{ id: "a", c: "red", w: 3, k: "hline", a: [0, 0.5] }, { id: "b", c: "red", w: 3, k: "vline", a: [0.5, 0] }] }));
    const bar = open();
    fireEvent.click(within(bar).getByLabelText("Clear all drawings"));
    expect(within(bar).getByRole("alertdialog").textContent).toContain("Remove all 2 annotations");
    fireEvent.click(within(bar).getByText("Cancel"));
    expect(JSON.parse(localStorage.getItem("finlit-drawings:t124")!).s).toHaveLength(2);
    fireEvent.click(within(bar).getByLabelText("Clear all drawings"));
    act(() => { fireEvent.click(bar.querySelector(".dlm-danger")!); });
    expect(localStorage.getItem("finlit-drawings:t124")).toBeNull();
  });
  it("closes with Done and with Esc", () => {
    open(); fireEvent.click(screen.getByLabelText("Done drawing"));
    expect(screen.queryByRole("toolbar")).toBeNull();
    fireEvent.click(screen.getByLabelText("Annotate this chart")); fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("toolbar")).toBeNull();
  });
  it("a page can put the pencil in its own chart controls (Graph Studio): the layer then shows none of its own", () => {
    let o = false; const set = (v: boolean) => { o = v; };
    const { rerender } = render(<><DrawToggle open={o} count={2} onToggle={() => set(!o)} /><DrawLayer id="t124c" open={o} onOpenChange={set}><Chart /></DrawLayer></>);
    expect(screen.getAllByLabelText("Annotate this chart")).toHaveLength(1);      // only the page's pencil
    expect(screen.getByLabelText("2 drawings")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Annotate this chart")); rerender(<><DrawToggle open={o} count={2} onToggle={() => set(!o)} /><DrawLayer id="t124c" open={o} onOpenChange={set}><Chart /></DrawLayer></>);
    expect(screen.getByRole("toolbar", { name: "Chart markup tools" })).toBeTruthy();
  });
});

describe("the new tools and the eraser drag (#115)", () => {
  const W = 400, H = 200;
  it("keeps double arrows and highlights through saving, and hits them", () => {
    const got = sanitize([{ id: "d", c: "blue", w: 3, k: "darrow", a: [0.1, 0.5], b: [0.9, 0.5] }, { id: "h", c: "amber", w: 3, k: "hl", pts: [[0.1, 0.2], [0.5, 0.2]] }]);
    expect(got.map((s) => s.k)).toEqual(["darrow", "hl"]);
    expect(hit(got[0], 200, 101, W, H)).toBe(true);
    expect(hit(got[1], 100, 40 + 12, W, H)).toBe(true);        // a highlight is broad: 12 px off its centre line is still on it
  });
  it("an eraser drag collects every annotation it passes over", () => {
    const shapes = sanitize([{ id: "1", c: "red", w: 3, k: "hline", a: [0, 0.25] }, { id: "2", c: "red", w: 3, k: "hline", a: [0, 0.75] }, { id: "3", c: "red", w: 3, k: "vline", a: [0.9, 0] }]) as Shape[];
    expect([...hitsAlong(shapes, [[0.5, 0.2], [0.5, 0.25], [0.5, 0.5], [0.5, 0.75]], W, H)].sort()).toEqual(["1", "2"]);
  });
  it("every tool is in a group", () => { for (const t of TOOLS) expect(["draw", "text", "erase"]).toContain(t.group); });
});
