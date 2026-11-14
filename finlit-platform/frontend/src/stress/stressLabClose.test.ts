// @vitest-environment jsdom
// Task #148: a cross at the right end of the company strip closes the current company (back to the Stress Lab start, where another is picked).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../public/demo/stress-page.json";
import { draw, peerOf, type Payload } from "./harness";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
Element.prototype.scrollIntoView = () => {};
afterEach(() => { document.body.innerHTML = ""; });
const base = (): Payload => JSON.parse(JSON.stringify(fixture));
const css = readFileSync(join(__dirname, "stresslab.css"), "utf8");

describe("Stress Lab: close the current company (task #148)", () => {
  it("puts a named cross button at the end of the company strip, and clicking it closes the company", () => {
    const onClose = vi.fn();
    const { root } = draw(base(), "single", null, { onClose });
    const strip = root.getElementById("costrip")!;
    const x = strip.querySelector<HTMLButtonElement>("button.coclose")!;
    expect(x).toBeTruthy();
    expect(x.getAttribute("aria-label")).toBe(`Close ${fixture.company.name} and pick another company`);
    expect(x.title).toBe("Close this company");
    expect(strip.lastElementChild === x || x.nextElementSibling?.classList.contains("peerbox") || !x.nextElementSibling).toBe(true);   // after the facts, at the end
    expect(strip.querySelector(".facts")!.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    x.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("is there in Compare two as well, and closes the company the page is about", () => {
    const onClose = vi.fn();
    const p = base(), peer = peerOf(p);
    const { root } = draw({ ...p, plan: "gold" }, "compare", peer, { onClose });
    const x = root.getElementById("costrip")!.querySelector<HTMLButtonElement>("button.coclose")!;
    expect(x).toBeTruthy(); x.click(); expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("is not drawn when the page offers no way to close (nothing that does nothing)", () => {
    const { root } = draw(base(), "single", null, {});
    expect(root.getElementById("costrip")!.querySelector(".coclose")).toBeNull();
  });
  it("sits at the right end of the strip, round, with room kept so it never covers the facts", () => {
    expect(css).toMatch(/\.costrip:has\(\.coclose\)\{position:relative;padding-right:52px\}/);
    expect(css).toMatch(/\.coclose\{position:absolute;top:2px;right:0;width:40px;height:40px;/);
    expect(css).toMatch(/\.coclose:focus-visible\{outline:2px solid var\(--teal\)/);
  });
});
