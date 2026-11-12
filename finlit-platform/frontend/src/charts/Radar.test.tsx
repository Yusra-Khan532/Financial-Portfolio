// @vitest-environment jsdom
// The spider chart (task #81): a missing figure is never drawn as zero, every marker can be pointed at, overlapping markers share one tooltip, and the ring figures carry the unit the page gives.
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Radar, type RadarSeries } from "./Radar";

const AXES = ["ROE", "ROCE", "Margin", "Low debt", "Low P/E", "Dividend"];
const size = 360, C = size / 2, R = size / 2 - 58;
const A: RadarSeries = { key: "A", label: "Alpha Ltd", cls: "k0", values: [80, 60, 70, 40, 55, 90], tips: AXES.map((a, i) => `Alpha Ltd\n${a}: figure ${i}\nPercentile score: ${[80, 60, 70, 40, 55, 90][i]}`) };
const B: RadarSeries = { key: "B", label: "Beta Ltd", cls: "k1", values: [50, null, 30, 41, 20, null], tips: AXES.map((a, i) => ([50, null, 30, 41, 20, null][i] == null ? null : `Beta Ltd\n${a}: figure ${i}\nPercentile score: ${[50, null, 30, 41, 20, null][i]}`)) };

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(cleanup);
const dist = (cx: number, cy: number) => Math.hypot(cx - C, cy - C);
const tipText = () => document.querySelector(".hv-tip")?.textContent ?? null;

describe("Radar", () => {
  it("draws a missing figure as a gap: no line to the centre, no fill, a cross outside the rings", () => {
    render(<Radar axes={AXES} series={[A, B]} />);
    const shapes = document.querySelectorAll(".rs-layer .rs");
    expect(shapes[0].querySelector(".rs-p")).toBeTruthy();                                       // a complete company is filled (lightly)
    expect(shapes[1].querySelector(".rs-p")).toBeNull();                                         // one with a gap is not: no area is claimed over the gap
    const d = shapes[1].querySelector(".rs-l")!.getAttribute("d")!;
    const points = [...d.matchAll(/([ML])([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[2]), Number(m[3])]);
    expect(points.every(([x, y]) => dist(x, y) > 10)).toBe(true);                                // nothing passes through the centre
    expect((d.match(/M/g) || []).length).toBe(2);                                                // Margin to Low debt and Low debt to Low P/E: lines only join neighbours that both have a figure
    const crosses = [...document.querySelectorAll(".rs-x .rs-hit")].map((c) => dist(Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))));
    expect(crosses).toHaveLength(2);
    expect(crosses.every((r) => r > R * 1.05)).toBe(true);                                       // outside the 100 ring, so never mistaken for a score of 100
  });

  it("draws every shape under every marker, and the shapes never take the pointer", () => {
    render(<Radar axes={AXES} series={[A, B]} />);
    const layer = document.querySelector(".rs-layer")!;
    expect(layer.querySelector(".rs-m, .rs-x")).toBeNull();                                      // no marker hides in the shape layer
    for (const m of document.querySelectorAll(".rs-m, .rs-x")) expect(layer.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelectorAll(".rs-m")).toHaveLength(10);                                 // 6 + 4 figures
    expect(readCss()).toMatch(/\.rs-layer, \.rs-layer \* \{ pointer-events: none; \}/);
  });

  it("shows a marker's company, measure, figure and percentile on hover and on keyboard focus", () => {
    render(<Radar axes={AXES} series={[A, B]} />);
    const marks = document.querySelectorAll(".rs-m");
    fireEvent.mouseMove(marks[0], { clientX: 50, clientY: 50 });
    expect(tipText()).toBe("Alpha Ltd\nROE: figure 0\nPercentile score: 80");
    fireEvent.mouseLeave(marks[0]);
    expect(tipText()).toBeNull();
    fireEvent.focus(marks[2]);
    expect(tipText()).toContain("Margin: figure 2");
    expect(marks[2].getAttribute("tabindex")).toBe("0");
    expect(marks[2].getAttribute("aria-label")).toBe("Alpha Ltd, Margin: figure 2, Percentile score: 70");
  });

  it("gives markers that sit on top of each other one shared tooltip, and the cross its own words", () => {
    render(<Radar axes={AXES} series={[A, B]} />);
    const lowDebt = [...document.querySelectorAll(".rs-m")].filter((m) => /Low debt/.test(m.getAttribute("aria-label") || ""));
    expect(lowDebt).toHaveLength(2);                                                             // 40 and 41: the markers overlap
    fireEvent.focus(lowDebt[1]);
    expect(tipText()).toMatch(/Alpha Ltd[\s\S]*Percentile score: 40[\s\S]*Beta Ltd[\s\S]*Percentile score: 41/);
    fireEvent.blur(lowDebt[1]);
    const margin = [...document.querySelectorAll(".rs-m")].find((m) => /Beta Ltd, Margin/.test(m.getAttribute("aria-label") || ""))!;
    fireEvent.focus(margin);
    expect(tipText()).not.toMatch(/Alpha/);                                                      // 70 and 30 are far apart: each keeps its own tip
    fireEvent.blur(margin);
    const cross = document.querySelector(".rs-x")!;
    fireEvent.focus(cross);
    expect(tipText()).toBe("Beta Ltd\nROCE: no figure, so it is not plotted");
    expect(cross.getAttribute("aria-label")).toBe("Beta Ltd, ROCE: no figure, so it is not plotted");
  });

  it("puts the page's unit after the ring figures and reads the page's scale aloud", () => {
    const { container, rerender } = render(<Radar axes={AXES} series={[A]} />);
    expect([...container.querySelectorAll(".rr")].map((t) => t.textContent)).toEqual(["50", "100"]);   // a score chart is not a percentage chart
    expect(container.querySelector("svg")!.getAttribute("aria-label")).toBe("Radar chart of ROE, ROCE, Margin, Low debt, Low P/E, Dividend for Alpha Ltd. Each axis runs from 0 to 100.");
    rerender(<Radar axes={AXES} series={[A, B]} unit="%" scale="Each axis is a percentile score from 0 to 100: the share of companies beaten" />);
    expect([...container.querySelectorAll(".rr")].map((t) => t.textContent)).toEqual(["50%", "100%"]);
    expect(container.querySelector("svg")!.getAttribute("aria-label")).toMatch(/Each axis is a percentile score from 0 to 100: the share of companies beaten\. A missing figure is left out, not drawn as zero\.$/);
  });

  it("keeps each company's marker shape (circle, square, diamond, triangle) and colour class", () => {
    const four = [0, 1, 2, 3].map((i) => ({ key: "S" + i, label: "S" + i, cls: "k" + i, values: [10 + i, 20, 30, 40, 50, 60] }));
    render(<Radar axes={AXES} series={four} />);
    const shape = (k: number) => document.querySelector(`.rs.k${k} .rs-m`)!.firstElementChild!.tagName.toLowerCase();
    expect([0, 1, 2, 3].map(shape)).toEqual(["circle", "rect", "path", "path"]);
    expect(new Set([2, 3].map((k) => document.querySelector(`.rs.k${k} .rs-m path`)!.getAttribute("d"))).size).toBe(2);   // the diamond and the triangle differ
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
const readCss = () => readFileSync(join(__dirname, "..", "styles", "tools.css"), "utf8");
