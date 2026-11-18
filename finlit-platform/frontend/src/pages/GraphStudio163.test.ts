// Task #163: "in chart builder: drag and drop feature only one feature can be dropped per graph", the drag-and-drop side of task #114 ("Each attribute
// must have its own independent chart ... Existing charts should remain unchanged when a new attribute is selected").
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { placeFor, type View } from "../lib/graphState";

const view = (cells: { m: string[]; s?: string[] }[], layout = "2x2"): View => ({
  v: 1, layout, basis: "annual", range: "5Y",
  cells: cells.map((c) => ({ chart: "line" as const, series: c.m.flatMap((m) => (c.s ?? ["TCS"]).map((s) => ({ s, m }))) })),
});

describe("one measure per chart, however it is added (#114, #163)", () => {
  it("a measure dropped on an empty chart goes there", () => {
    expect(placeFor(view([{ m: ["price"] }, { m: [] }]), 1, "revenue", 20)).toEqual({ index: 1, layout: "2x2", own: false });
  });
  it("a measure dropped on a chart showing another measure gets a chart of its own; the chart dropped on stays as it is", () => {
    expect(placeFor(view([{ m: ["price"] }, { m: ["eps"] }, { m: [] }, { m: [] }]), 0, "revenue", 20)).toEqual({ index: 2, layout: "2x2", own: true });
    expect(placeFor(view([{ m: ["price"] }, { m: ["eps"] }, { m: ["pe"] }, { m: ["roe"] }]), 1, "revenue", 20)).toEqual({ index: 4, layout: "2x3-5", own: true });
  });
  it("the same measure dropped again stays on its chart (another company joins the same measure)", () => {
    expect(placeFor(view([{ m: ["revenue"], s: ["TCS", "INFY"] }]), 0, "revenue", 20)).toEqual({ index: 0, layout: "2x2", own: false });
  });
  it("an old saved view with two measures on a chart is left as it is; a new measure still gets its own chart", () => {
    expect(placeFor(view([{ m: ["price", "eps"] }, { m: [] }]), 0, "eps", 20)).toEqual({ index: 1, layout: "2x2", own: true });
  });
  it("a full view (20 charts, none empty) gives no place", () => {
    const full = view(Array.from({ length: 20 }, (_, i) => ({ m: [`m${i}`] })), "g20");
    expect(placeFor(full, 3, "revenue", 20)).toBeNull();
  });
});

describe("every way of adding a measure goes through the one rule", () => {
  const src = readFileSync(resolve(__dirname, "GraphStudio.tsx"), "utf8");
  it("the drop, the row's Add menu and the list tick all call place(); addTo() is called only inside place()", () => {
    expect(src).toContain('onDrop={(m) => (m.includes("@") ? place(i, m.split("@")[0], m.split("@")[1], true) : place(i, m, undefined, true))}');
    expect(src).toContain(`if (v !== "" && !Number.isNaN(n)) place(n, m.id, undefined, true);`);
    expect(src).toMatch(/const toggle = [\s\S]*?place\(active, mid\);/);
    const calls = [...src.matchAll(/\baddTo\(/g)].length;
    const body = src.slice(src.indexOf("const place = "), src.indexOf("const toggle = "));
    const inPlace = [...body.matchAll(/\baddTo\(/g)].length;
    expect(inPlace).toBe(3);   // two in place(), one in placeNew() (the Add menu's "An empty chart")
    expect(calls).toBe(inPlace);   // no other caller (the definition reads "const addTo = (")
  });
  it("each row's Add menu names what every chart shows and offers an empty chart", () => {
    expect(src).toContain("<option key={n} value={n}>Chart {n + 1} · {chartHolds(n)}</option>");
    expect(src).toContain('<option value="new">An empty chart</option>');
  });
  it("the Add menu keeps its 104px box, so the longer option names never push it past the panel", () => {
    expect(readFileSync(resolve(__dirname, "../styles/graphs.css"), "utf8")).toContain(".gx-list li select { flex: none; width: 104px; }");
  });
  it("a drop that lands elsewhere says where it went, and the panel says the rule", () => {
    expect(src).toContain("has a chart of its own (Chart ${to.index + 1}): one measure per chart, so measures in different units are never mixed.");
    expect(src).toContain("<b>One measure per chart:</b> a measure dropped on a chart that already shows another gets a chart of its own.");
  });
});
