// @vitest-environment jsdom
// Task #259 (pack 03 §1, SHARED §5): the second header row sticks at the first row's real height, measured again when that row changes.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HScroll } from "./HScroll";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("HScroll: --hr1 follows the first header row", () => {
  it("measures the first header row, watches it, and measures again when the header changes", async () => {
    const watched: Element[] = [];
    vi.stubGlobal("ResizeObserver", class { constructor(_cb: () => void) {} observe(el: Element) { watched.push(el); } unobserve() {} disconnect() {} });
    let h = 31;
    const proto = HTMLTableRowElement.prototype as unknown as { offsetHeight: number };
    const orig = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(proto, "offsetHeight", { configurable: true, get() { return h; } });
    const { container, rerender } = render(<HScroll tall controls={false}><table><thead><tr><th>Group</th></tr><tr><th>Col</th></tr></thead><tbody /></table></HScroll>);
    const box = container.querySelector(".tw") as HTMLElement;
    expect(box.style.getPropertyValue("--hr1")).toBe("31px");
    expect(watched.some((el) => el.tagName === "TR")).toBe(true);           // the first header row itself is watched
    h = 44;
    await act(async () => { rerender(<HScroll tall controls={false}><table><thead><tr><th>Group, taller</th><th>New</th></tr><tr><th>Col</th><th>Col 2</th></tr></thead><tbody /></table></HScroll>); await Promise.resolve(); });
    expect(box.style.getPropertyValue("--hr1")).toBe("44px");               // a header change measures again
    delete (proto as { offsetHeight?: number }).offsetHeight;
    if (orig) Object.defineProperty(HTMLElement.prototype, "offsetHeight", orig);
  });
});
