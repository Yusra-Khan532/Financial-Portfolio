// @vitest-environment jsdom
// Task #396 (DCF pack: "Tooltips work on desktop and mobile"): on a phone a tap on an (i) opened the note and the browser's emulated mouse-leave right
// after the tap closed it again, so the note never showed. A touch press now keeps it open; a mouse still closes it on leaving; a tap elsewhere closes it.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Info, InfoProvider } from "./Info";

// jsdom has no PointerEvent: a minimal one that carries pointerType, as browsers send it
if (typeof window !== "undefined" && !("PointerEvent" in window)) {
  class PE extends MouseEvent { pointerType: string; constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) { super(type, init); this.pointerType = init.pointerType ?? ""; } }
  (window as unknown as { PointerEvent: typeof PE }).PointerEvent = PE;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
const g = { key: "r", label: "discount rate", what: "The yearly return an investor needs for the risk of this business." };
const later = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const setup = () => { render(<InfoProvider><Info g={g as never} /></InfoProvider>); return { btn: screen.getByRole("button", { name: "What is discount rate?" }), pop: document.querySelector(".pop") as HTMLElement }; };

describe("(i) note on a phone tap (task #396)", () => {
  it("a tap opens the note and the emulated mouse-leave that follows does not close it", () => {
    const { btn, pop } = setup();
    fireEvent.pointerDown(btn, { pointerType: "touch" });
    fireEvent.mouseEnter(btn); fireEvent.click(btn); fireEvent.mouseLeave(btn); later(500);
    expect(pop.hidden).toBe(false);
    expect(pop.textContent).toMatch(/yearly return an investor needs/);
  });
  it("a tap elsewhere closes it (task #398: a tapped note stays until a tap outside it)", () => {
    const { btn, pop } = setup();
    fireEvent.pointerDown(btn, { pointerType: "touch" });
    fireEvent.focus(btn); fireEvent.click(btn);
    fireEvent.blur(btn); later(300);
    expect(pop.hidden).toBe(false);                          // the blur that follows a tap no longer closes it
    fireEvent.pointerDown(document.body, { pointerType: "touch" }); later(50);
    expect(pop.hidden).toBe(true);
  });
  it("with a mouse it still closes when the pointer leaves the (i)", () => {
    const { btn, pop } = setup();
    fireEvent.pointerDown(btn, { pointerType: "mouse" });
    fireEvent.mouseEnter(btn); fireEvent.mouseLeave(btn); later(300);
    expect(pop.hidden).toBe(true);
  });
});
