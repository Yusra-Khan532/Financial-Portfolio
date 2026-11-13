// @vitest-environment jsdom
// Task #115 (13 Nov 2026): the annotation panel as in the team's picture.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { DrawLayer } from "./DrawLayer";
import { hit, hitsAlong, sanitize, TOOLS, type Shape } from "../lib/drawings";

beforeAll(() => { (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} }; });
afterEach(() => { cleanup(); localStorage.clear(); });

const open = () => { render(<DrawLayer id="t115"><div style={{ height: 200 }}>chart</div></DrawLayer>); fireEvent.click(screen.getByLabelText("Open drawing tools")); return screen.getByRole("toolbar", { name: "Chart drawing tools" }); };

describe("annotation panel (#115)", () => {
  it("has the header with the close button, and the four groups in the picture's order", () => {
    const bar = open();
    expect(within(bar).getByText("Edit chart (Annotations)")).toBeTruthy();
    expect(within(bar).getByLabelText("Close the annotation panel")).toBeTruthy();
    expect([...bar.querySelectorAll(".dl-grp > p")].map((p) => p.textContent)).toEqual(["Draw on chart", "Add text", "Color", "Stroke (thickness)"]);
  });
  it("shows every tool with its icon and its label, in the picture's order (Horizontal line, Vertical line and Fibonacci kept after Circle)", () => {
    const bar = open();
    const draw = bar.querySelector(".dl-grp-draw")!, text = [...bar.querySelectorAll(".dl-grp")][1];
    const labels = (el: Element) => [...el.querySelectorAll(".dl-tool")].map((b) => b.textContent);
    expect(labels(draw)).toEqual(["Pen", "Line", "Arrow", "Double arrow", "Rectangle", "Circle", "Horizontal line", "Vertical line", "Fibonacci"]);
    expect(labels(text)).toEqual(["Text", "Highlight"]);
    for (const b of bar.querySelectorAll(".dl-tool")) expect(b.querySelector("svg")).toBeTruthy();
  });
  it("keeps colours and stroke in their own groups, and Undo, Redo, Erase and Clear all together at the bottom with a prominent Done", () => {
    const bar = open();
    expect([...bar.querySelectorAll(".dl-grp")][2].querySelectorAll(".dl-sw")).toHaveLength(6);
    expect([...bar.querySelectorAll(".dl-grp")][3].querySelectorAll(".dl-wd")).toHaveLength(3);
    expect([...bar.querySelectorAll(".dl-foot .dl-edit button")].map((b) => b.textContent)).toEqual(["Undo", "Redo", "Erase", "Clear all"]);
    expect(bar.querySelector(".dl-foot .dl-done")!.textContent).toBe("Done");
  });
  it("closes with the close button and with Done", () => {
    open(); fireEvent.click(screen.getByLabelText("Close the annotation panel"));
    expect(screen.queryByRole("toolbar")).toBeNull();
    fireEvent.click(screen.getByLabelText("Open drawing tools")); fireEvent.click(screen.getByLabelText("Done drawing"));
    expect(screen.queryByRole("toolbar")).toBeNull();
  });
  it("asks before Clear all removes every annotation, and Cancel keeps them", () => {
    localStorage.setItem("finlit-drawings:t115", JSON.stringify([{ id: "a", c: "red", w: 3, k: "hline", a: [0, 0.5] }, { id: "b", c: "red", w: 3, k: "vline", a: [0.5, 0] }]));
    const bar = open();
    fireEvent.click(within(bar).getByLabelText("Clear all drawings"));
    expect(within(bar).getByRole("alertdialog").textContent).toContain("Remove all 2 annotations");
    fireEvent.click(within(bar).getByText("Cancel"));
    expect(JSON.parse(localStorage.getItem("finlit-drawings:t115")!)).toHaveLength(2);
    fireEvent.click(within(bar).getByLabelText("Clear all drawings"));
    act(() => { fireEvent.click(bar.querySelector(".dl-danger")!); });
    expect(localStorage.getItem("finlit-drawings:t115")).toBeNull();
  });
  it("explains Erase, Clear all and Undo in the help behind the (i) button", () => {
    const bar = open(); fireEvent.click(within(bar).getByLabelText("How the annotation tools work"));
    const t = bar.querySelector(".dl-help")!.textContent!;
    expect(t).toContain("Erase: select it, then click or drag over a specific annotation to remove it.");
    expect(t).toContain("Clear all: removes every annotation from the chart after confirmation.");
    expect(t).toContain("Undo: reverses the last editing action");
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
  it("every tool is in a group of the panel", () => { for (const t of TOOLS) expect(["draw", "text", "erase"]).toContain(t.group); });
});
