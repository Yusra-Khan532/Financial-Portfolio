// @vitest-environment jsdom
// Developer file 38 (founder, 24 Nov 2026): "the 'worth a closer look' one was a pop-up, that comes when we passed or reached section 5 of the company
// report and disappears when we have scrolled the whole section 5, or if the user wants to cancel the pop-up can do that with the x button."
// The layer is rendered as on the company report (the results bar, then section 05) and the reader's scrolling is played by moving the two boxes.
// Founder, 26 Nov 2026: "why is there a pop on section 3, it opens when we reach section 5 and closes when section 5 ends": the card waits until the
// section's start is in the top 35% of the screen (it came up at 70% before, over the section above, and stayed over it on the way back up).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Financials, Table } from "../lib/api";
import { PlFlagsLayer, zoneOf } from "./PlFlagsLayer";

const tbl = (t: unknown) => ({ unit: "Cr", period: "yearly", ...(t as object) }) as Table;
// KOTAKBANK's reported figures, as in PlFlagsLayer.test.tsx: one alert ("worth a closer look")
const FIN = {
  yearly: { pl: tbl({ periods: ["FY24", "FY25", "FY26"], periodEnds: ["2024-03-31", "2025-03-31", "2026-03-31"], rows: { revenue: [56236.63, 65668.83, 69781.21], net_profit: [18213.21, 22125.99, 19287.89] } }) },
  quarterly: { pl: tbl({ period: "quarterly", periods: ["Jun 2025", "Sep 2025", "Dec 2025", "Mar 2026", "Jun 2026", "Sep 2026"],
    periodEnds: ["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30", "2026-09-30"],
    rows: { revenue: [17248.31, 17198.74, 17506.8, 17827.36, 18354.57, 19855.87], net_profit: [4472.18, 4468.27, 4924.29, 5423.15, 5480.46, 5645.38] } }) },
} as unknown as Financials;

const VH = 800, SEC = 1600;     // a screen 800 px high; section 05 is 1,600 px tall
let barTop = 2000;              // where the results bar (just above section 05) is on screen; the section starts 40 px under it
const rect = (top: number, h: number) => ({ top, bottom: top + h, left: 0, right: 1000, width: 1000, height: h, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

beforeEach(() => {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: VH });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.classList.contains("plf-bar")) return rect(barTop, 30);
    if (this.tagName === "SECTION" && this.querySelector("#quarter")) return rect(barTop + 40, SEC);
    return rect(0, 0);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const page = () => render(<main><PlFlagsLayer f={FIN} lender /><section className="block"><div className="sh" id="quarter">05 · Latest quarter</div></section></main>);
const scrollTo = (top: number) => act(() => { barTop = top; window.dispatchEvent(new Event("scroll")); });
const card = () => document.querySelector(".plf-note");
const edge = () => document.querySelector(".plf-edge");

describe("the earnings alert pops up over section 05, from its start to its end", () => {
  it("nothing shows before the reader reaches section 05", () => {
    page();
    expect(card()).toBeNull(); expect(edge()).toBeNull();
    scrollTo(700);                                                   // the section's start is just under the fold
    expect(card()).toBeNull();
    scrollTo(400);                                                   // half-way up the screen: the section above still fills the top half
    expect(card()).toBeNull();
  });

  it("pops up when section 05 is reached, as a floating card", () => {
    page(); scrollTo(250);                                           // the section's start in the top 35% of the screen
    expect(card()).not.toBeNull();
    expect(screen.getByText("Worth a closer look")).toBeTruthy();
    expect(card()!.classList.contains("plf-floating")).toBe(false);  // the in-place pop-up; .plf-floating is only the one opened from the edge tab
  });

  it("stays while the reader is anywhere inside section 05, and goes once the whole of it has been scrolled past", () => {
    page(); scrollTo(250);
    scrollTo(-700); expect(card()).not.toBeNull();                   // the middle of the section
    scrollTo(-SEC - 40 + 200); expect(card()).not.toBeNull();        // its last 200 px still on screen
    scrollTo(-SEC - 40 + 100); expect(card()).toBeNull();            // its end has gone up under the page header
    expect(edge()).not.toBeNull();                                   // the tab on the right edge brings it back (desktop)
  });

  it("comes back each time the reader returns to section 05 (founder, 5 Nov), and goes when they scroll back above it", () => {
    page(); scrollTo(250); scrollTo(-3000);
    expect(card()).toBeNull();
    scrollTo(-900); expect(card()).not.toBeNull();
    scrollTo(350); expect(card()).toBeNull();                        // back up: the section above fills the top of the screen again
  });

  it("the x cancels it: it does not come back on scrolling, until Show details is pressed", () => {
    page(); scrollTo(250);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(card()).toBeNull(); expect(edge()).toBeNull();
    scrollTo(-3000); scrollTo(-500);
    expect(card()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(card()).not.toBeNull();
  });

  it("a reader who lands in the middle of section 05 (a reload part-way down, a fast fling) gets it too; before, only the results bar passing through the screen showed it", () => {
    barTop = -600; page();
    expect(card()).not.toBeNull();
  });

  it("section 05 is measured by its own box, not by the card or the edge tab that sit between it and the bar", () => {
    page(); scrollTo(400);
    const bar = document.querySelector<HTMLElement>(".plf-bar")!;
    expect(zoneOf(bar)).toEqual([400, 400 + 40 + SEC]);
  });
});

describe("the stylesheet: a pop-up, never a card in the page", () => {
  const css = readFileSync(resolve(__dirname, "../styles/plflags.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("the card is fixed over the page, with its drop-in animation; no rule puts it into the page flow", () => {
    const base = css.match(/^\.plf-note\s*\{([^}]*)\}/m)![1];
    expect(base).toMatch(/position:\s*fixed/);
    expect(base).toMatch(/animation:\s*plf-drop/);
    expect(css).not.toMatch(/\.plf-note[^{]*\{[^}]*position:\s*(relative|static)/);
  });
});
