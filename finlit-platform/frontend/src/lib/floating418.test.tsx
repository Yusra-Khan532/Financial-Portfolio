// @vitest-environment jsdom
// Task #418 (DCF and Reverse valuation): an (i) near the foot of the window opened its explanation as a short strip with its own scrollbar (Net debt showed two
// and a half lines of six), sitting on the Market cap and Share price fields. The placement preferred cutting the box to covering any control. Now the glossary
// popover opens whole: a side where all of it fits wins, it keeps off the field it explains, lines up with that field, and is measured at its natural size
// (the old code measured a new explanation while the last one's short height cap was still set, so one cut box made the next ones cut too).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ownField, placeFloating } from "./floating";

type R = { left: number; top: number; width: number; height: number };
const rect = (el: Element, r: R) => { (el as HTMLElement).getBoundingClientRect = () => ({ ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => ({}) }) as DOMRect; };
const size = (el: HTMLElement, w: number, h: number) => { Object.defineProperty(el, "offsetWidth", { configurable: true, value: w }); Object.defineProperty(el, "offsetHeight", { configurable: true, value: h }); };

beforeEach(() => {
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 1536 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 816 });
});
afterEach(() => { cleanup(); document.body.innerHTML = ""; });

/** The DCF form as the team saw it at 1536 × 816: Market cap / Share price inputs above, the Net debt field with its (i), Shares to its right. */
function dcfForm() {
  document.body.innerHTML = `
    <div class="dcx-f" id="mc"><label>Market cap</label><input id="mci" /></div>
    <div class="dcx-f" id="nd"><div class="dcx-fl"><label>Net debt</label><button class="info" id="i">i</button></div><input id="ndi" /></div>
    <div class="dcx-f" id="sh"><input id="shi" /></div>
    <div class="pop" id="pop"></div>`;
  const $ = (id: string) => document.getElementById(id)!;
  rect($("mci"), { left: 237, top: 540, width: 370, height: 100 });   // Market cap and Share price fields with their presets, above Net debt
  rect($("nd"), { left: 237, top: 652, width: 180, height: 110 });
  rect($("i"), { left: 301, top: 652, width: 20, height: 20 });
  rect($("ndi"), { left: 237, top: 684, width: 180, height: 40 });   // Net debt input, right under the (i)
  rect($("shi"), { left: 427, top: 684, width: 180, height: 40 });
  rect($("mc"), { left: 237, top: 570, width: 180, height: 70 });
  rect($("sh"), { left: 427, top: 652, width: 180, height: 110 });
  const pop = $("pop"); size(pop, 310, 228); rect(pop, { left: 0, top: 0, width: 310, height: 228 });
  return { anchor: $("i"), pop, field: $("nd") };
}

describe("placeFloating with `whole` (task #418)", () => {
  it("the old placement cut Net debt to a scrolling strip; with `whole` it opens in full above, where it fits", () => {
    const { anchor, pop } = dcfForm();
    const old = placeFloating(anchor, pop);
    expect(old.maxH).toBeLessThan(228);                       // the bug: a box shorter than its content, so it scrolled
    const now = placeFloating(anchor, pop, { whole: true, own: ownField(anchor) });
    expect(now.maxH).toBe(228);                               // all of it
    expect(now.side).toBe("above");
    expect(now.top).toBeGreaterThanOrEqual(8);                // inside the window
    expect(now.top + now.maxH).toBeLessThanOrEqual(652 - 8 + 0.5);   // and clear of the (i) and its field
  });
  it("lines up with the left edge of the field it explains, instead of hanging over the side menu", () => {
    const { anchor, pop } = dcfForm();
    expect(placeFloating(anchor, pop, { whole: true, own: ownField(anchor) }).left).toBe(237);
    expect(placeFloating(anchor, pop, { whole: true }).left).toBe(301 + 10 - 155);   // without a field: centred on the (i), as before
  });
  it("prefers a side that keeps off its own field when two sides fit", () => {
    const { anchor, pop, field } = dcfForm();
    rect(document.getElementById("mci")!, { left: 237, top: 590, width: 180, height: 50 });   // a smaller field above
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1200 });   // room both above and below
    expect(placeFloating(anchor, pop, { whole: true }).side).toBe("below");             // counting every control alike, below looked a little cheaper
    expect(placeFloating(anchor, pop, { whole: true, own: field }).side).toBe("above"); // but below sits on the Net debt input itself
  });
  it("ownField finds the DCF field, the Reverse valuation field or a label round an (i)", () => {
    document.body.innerHTML = `<div class="dcx-f"><span><button id="a">i</button></span></div><label class="rv-f"><span><button id="b">i</button></span></label><h2><button id="c">i</button></h2>`;
    expect(ownField(document.getElementById("a")!)?.className).toBe("dcx-f");
    expect(ownField(document.getElementById("b")!)?.className).toBe("rv-f");
    expect(ownField(document.getElementById("c")!)).toBeNull();
  });
  it("other floating tips keep their placement: `whole` is only what the glossary popover asks for", () => {
    const { anchor, pop } = dcfForm();
    expect(placeFloating(anchor, pop)).toEqual(placeFloating(anchor, pop, {}));
  });
});

describe("glossary popover opens whole (task #418)", () => {
  it("clears the last box's height cap and width before measuring, asks for a whole placement, and keeps the window-height safety net", async () => {
    vi.resetModules();
    const calls: { maxH: string; width: string; opts: unknown }[] = [];
    vi.doMock("./floating", async (orig) => {
      const real = await orig<typeof import("./floating")>();
      return { ...real, placeFloating: (_a: HTMLElement, p: HTMLElement, opts: unknown) => { calls.push({ maxH: p.style.maxHeight, width: p.style.width, opts }); return { left: 10, top: 20, side: "above", maxH: 300 }; } };
    });
    const { Info, InfoProvider } = await import("../components/Info");
    render(<InfoProvider><div className="dcx-f"><Info g={{ key: "a", label: "Net debt", what: "Borrowings minus cash." } as never} /><Info g={{ key: "b", label: "Shares", what: "Shares in issue." } as never} /></div></InfoProvider>);
    const pop = document.querySelector(".pop") as HTMLElement;
    fireEvent.mouseEnter(screen.getByRole("button", { name: "What is Net debt?" }));
    expect(pop.style.maxHeight).toBe("300px");
    pop.style.maxHeight = "124px"; pop.style.width = "440px";   // a cap and width left from an earlier box
    act(() => { fireEvent.mouseEnter(screen.getByRole("button", { name: "What is Shares?" })); });
    const last = calls[calls.length - 1];
    expect(last.maxH).toBe(""); expect(last.width).toBe("");   // measured at its natural size, not the old strip
    expect(last.opts).toMatchObject({ whole: true });
    expect((last.opts as { own: Element }).own.className).toBe("dcx-f");
    expect(pop.style.overflowY).toBe("auto");                  // only a box taller than the window could still scroll (task #204's wheel rule kept)
    vi.doUnmock("./floating"); vi.resetModules();
  });
  it("opens wider when it cannot fit whole at the usual width", async () => {
    vi.resetModules();
    const widths: string[] = [];
    vi.doMock("./floating", async (orig) => {
      const real = await orig<typeof import("./floating")>();
      return { ...real, placeFloating: (_a: HTMLElement, p: HTMLElement) => { widths.push(p.style.width); return { left: 8, top: 8, side: "above", maxH: p.style.width ? 400 : 150 }; } };
    });
    const was = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return (this as HTMLElement).classList.contains("pop") ? 260 : 0; } });
    const { Info, InfoProvider } = await import("../components/Info");
    render(<InfoProvider><Info g={{ key: "a", label: "Discount rate", what: "A long explanation." } as never} /></InfoProvider>);
    fireEvent.mouseEnter(screen.getByRole("button", { name: "What is Discount rate?" }));
    expect(widths).toHaveLength(2); expect(widths[0]).toBe(""); expect(widths[1]).toMatch(/440px/);
    expect((document.querySelector(".pop") as HTMLElement).style.maxHeight).toBe("400px");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", was);
    vi.doUnmock("./floating"); vi.resetModules();
  });
});
