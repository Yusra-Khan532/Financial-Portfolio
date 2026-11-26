// @vitest-environment jsdom
// Task #398: an (i) opened by a tap on a phone stays open (the browser's made-up "mouse leave" and blur after a tap used to close it at once) until a tap
// outside it; a mouse still opens it on hover and closes it on leaving, as before.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Info, InfoProvider } from "./Info";
import type { Glossary } from "../lib/api";

afterEach(() => { cleanup(); vi.useRealTimers(); });
const g = { key: "x", label: "Exit multiple", what: "Enterprise value divided by EBITDA at the end of the forecast." } as Glossary;
const open = () => render(<InfoProvider><p>outside</p><Info g={g} /></InfoProvider>);
const pop = () => document.querySelector(".pop[role=tooltip]") as HTMLElement;
const touch = (el: Element, type: "pointerdown") => { const e = new Event(type, { bubbles: true }); Object.assign(e, { pointerType: "touch" }); el.dispatchEvent(e); };

describe("(i) popover on a phone (#398)", () => {
  it("stays open after a tap, through the made-up mouse leave and blur, and closes on a tap outside", () => {
    vi.useFakeTimers(); open();
    const b = screen.getByRole("button", { name: "What is Exit multiple?" });
    act(() => { touch(b, "pointerdown"); fireEvent.mouseEnter(b); fireEvent.focus(b); fireEvent.click(b); fireEvent.mouseLeave(b); fireEvent.blur(b); vi.advanceTimersByTime(500); });
    expect(pop().hidden).toBe(false);
    expect(pop().textContent).toMatch(/^Exit multipleEnterprise value divided by EBITDA/);
    act(() => { touch(screen.getByText("outside"), "pointerdown"); });
    expect(pop().hidden).toBe(true);
  });
  it("still opens on mouse hover and closes when the mouse leaves", () => {
    vi.useFakeTimers(); open();
    const b = screen.getByRole("button", { name: "What is Exit multiple?" });
    act(() => { fireEvent.mouseEnter(b); });
    expect(pop().hidden).toBe(false);
    act(() => { fireEvent.mouseLeave(b); vi.advanceTimersByTime(300); });
    expect(pop().hidden).toBe(true);
  });
});
