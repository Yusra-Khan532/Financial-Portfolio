// @vitest-environment jsdom
// Task #167: a chart drawn at a fixed pixel height kept that height in the enlarged (full screen) view, so the lower part of the screen stayed empty.
// useZoomHeight gives it the room the dialog has left; in the page it keeps its own height.
import { act, cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useZoomHeight } from "./ChartZoom";

let observers: (() => void)[] = [];
class RO { cb: () => void; constructor(cb: () => void) { this.cb = cb; observers.push(cb); } observe() {} unobserve() {} disconnect() {} }
afterEach(() => { cleanup(); observers = []; vi.unstubAllGlobals(); });

function Chart({ onH }: { onH: (h: number) => void }) {
  const [ref, H] = useZoomHeight<HTMLDivElement>(310);
  onH(H);
  return <div><h3>Revenue</h3><div ref={ref} style={{ height: H }} data-plot /><ul><li>legend</li></ul></div>;
}
const rect = (h: number) => ({ height: h, width: 0, top: 0, left: 0, right: 0, bottom: h, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

describe("useZoomHeight (task #167)", () => {
  it("in the page: the chart keeps its own height", () => {
    vi.stubGlobal("ResizeObserver", RO);
    let h = 0;
    render(<Chart onH={(v) => { h = v; }} />);
    act(() => observers.forEach((f) => f()));
    expect(h).toBe(310);
  });
  it("in the enlarged dialog: the chart takes the room left once its title and legend are counted", () => {
    vi.stubGlobal("ResizeObserver", RO);
    const body = document.createElement("div"); body.className = "cz-body";
    const host = document.createElement("div"); host.className = "cz-host";
    body.appendChild(host); document.body.appendChild(body);
    Object.defineProperty(body, "clientHeight", { value: 756 });
    let h = 0;
    render(<Chart onH={(v) => { h = v; }} />, { container: host });
    const plot = host.querySelector("[data-plot]") as HTMLElement;
    plot.getBoundingClientRect = () => rect(310);
    host.getBoundingClientRect = () => rect(310 + 90);   // title row and legend: 90px
    act(() => observers.forEach((f) => f()));
    expect(h).toBe(756 - 90 - 8);
    body.remove();
  });
  it("is used by the forecasting chart and the other charts drawn at a fixed height", () => {
    for (const f of ["charts/OutlookChart.tsx", "components/AdvScatter.tsx", "mf/H2HChart.tsx", "stock/SegmentMix.tsx", "stock/RevenueCash.tsx", "pages/SipCalculator.tsx",
      "components/FlowsCharts.tsx", "pages/Macro.tsx", "components/prism/pzr/History.tsx", "charts/RoeLines.tsx", "charts/Waterfall.tsx"])
      expect(readFileSync(join(process.cwd(), "src", f), "utf8"), f).toMatch(/useZoomHeight</);
  });
});
