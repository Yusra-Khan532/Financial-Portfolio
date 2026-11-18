// @vitest-environment jsdom
// Task #230: the "i" of section 09's meter cards and of the Prism card's Technical analysis heading sits right after the label's last word.
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LabelI } from "./Sections3";
import { clipRight, nearRightEdge } from "./PrismCardView";
afterEach(cleanup);
const css = (f: string) => readFileSync(join(__dirname, "../styles", f), "utf8");

describe("meter labels keep the i with the last word", () => {
  it("two words: the first wraps freely, the last word and the i never part", () => {
    const { container: c } = render(<span className="label"><LabelI text="Dividend yield"><button className="info">i</button></LabelI></span>);
    expect(c.textContent).toBe("Dividend yieldi");
    const nw = c.querySelector(".li-nw")!;
    expect(nw.textContent).toBe("yieldi"); expect(nw.querySelector("button.info")).not.toBeNull();
  });
  it("one word and three words", () => {
    expect(render(<LabelI text="ROE"><b>i</b></LabelI>).container.querySelector(".li-nw")!.textContent).toBe("ROEi");
    cleanup();
    const { container: c } = render(<LabelI text="Debt / equity"><b>i</b></LabelI>);
    expect(c.textContent).toBe("Debt / equityi"); expect(c.querySelector(".li-nw")!.textContent).toBe("equityi");
  });
  it("the CSS: the glued part never wraps, the pill never shrinks", () => {
    const s = css("stock2.css");
    expect(s).toMatch(/\.mtr-h \.li-nw \{ display: inline-flex; align-items: center; gap: 6px; white-space: nowrap/);
    expect(s).toMatch(/\.mtr-pill \{ flex: none; white-space: nowrap; \}/);
    expect(s).toMatch(/\.mtr-h \.label \{[^}]*min-width: 0/);
  });
});

describe("the Prism heading's i", () => {
  it("sits inside the heading, glued to its last word (no flex row pushing it to the far right)", () => {
    const s = css("prism-card.css");
    expect(s).not.toMatch(/\.pcx-hrow \{ display: flex/);
    expect(s).toMatch(/\.pcx-nw \{ white-space: nowrap; \}/);
    const src = readFileSync(join(__dirname, "PrismCardView.tsx"), "utf8");
    expect(src).toContain('<h3 className="pcx-hrow">Technical <span className="pcx-nw">analysis<InfoTip text={TECH_NOTE} /></span></h3>');
  });
  it("its tip opens leftwards when the clipping card's right edge is near, not only the window's", () => {
    const card = document.createElement("div"); card.style.overflow = "hidden"; const i = document.createElement("span"); card.appendChild(i); document.body.appendChild(card);
    card.getBoundingClientRect = () => ({ left: 100, right: 600, top: 0, bottom: 10, width: 500, height: 10, x: 100, y: 0, toJSON: () => ({}) });
    expect(clipRight(i)).toBe(600);
    expect(nearRightEdge(400, clipRight(i))).toBe(true);           // 400 - 8 + 340 > 588: opens leftwards inside the card
    expect(nearRightEdge(400, 1900)).toBe(false);                 // the old window-only check let it run past the card
    const free = document.createElement("div"), j = document.createElement("span"); free.appendChild(j); document.body.appendChild(free);
    expect(clipRight(j)).toBe(innerWidth); free.remove();
    card.remove();
  });
});
