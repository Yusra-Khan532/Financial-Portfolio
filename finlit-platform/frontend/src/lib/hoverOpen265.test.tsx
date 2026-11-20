// @vitest-environment jsdom
// Task #265 (20 Nov 2026, the team: "i button doesnt work until clicked", Discover's filters): the Discover i, the screens' i and the company page's
// i buttons open on hover and on keyboard focus, as the site's shared i does; a click or a tap pins the note; leaving closes an unpinned one after a moment.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I } from "../discovery/Info";
import { PsxInfo } from "../components/screener/presets/PsxInfo";
import { CLOSE_DELAY } from "./hoverOpen";

// jsdom has no PointerEvent, so the pointer's kind (mouse or touch) would be lost: a small stand-in carries it, as a browser does
class PE extends MouseEvent { pointerType: string; constructor(t: string, init: PointerEventInit = {}) { super(t, init); this.pointerType = init.pointerType ?? ""; } }
if (typeof window.PointerEvent === "undefined") (window as unknown as { PointerEvent: typeof PE }).PointerEvent = PE;
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
const mouse = { pointerType: "mouse" };
const wait = (ms = CLOSE_DELAY + 20) => act(() => { vi.advanceTimersByTime(ms); });

const cases: [string, () => void][] = [
  ["the Discover filter i (Stage)", () => render(<I k="stage" label="About Stage" />)],
  ["the screens' i", () => render(<PsxInfo text="What this column means." label="Stage" />)],
];

describe.each(cases)("%s (task #265)", (_n, mount) => {
  const btn = () => screen.getByRole("button", { name: /About Stage/ });
  const note = () => screen.queryByRole("note");

  it("opens on a mouse hover, without a click, and closes a moment after the mouse leaves", () => {
    mount();
    expect(note()).toBeNull();
    fireEvent.pointerEnter(btn(), mouse);
    expect(note()).not.toBeNull();
    expect(btn().getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerLeave(btn(), mouse);
    expect(note()).not.toBeNull();                      // not at once: the pointer may be on its way to the note
    wait();
    expect(note()).toBeNull();
  });

  it("stays open while the pointer is over the note, and closes when it leaves the note", () => {
    mount();
    fireEvent.pointerEnter(btn(), mouse);
    fireEvent.pointerLeave(btn(), mouse);
    fireEvent.pointerEnter(note()!, mouse);
    wait(1000);
    expect(note()).not.toBeNull();
    fireEvent.pointerLeave(note()!, mouse);
    wait();
    expect(note()).toBeNull();
  });

  it("a click on a hovered i pins it open; a second click closes it", () => {
    mount();
    fireEvent.pointerEnter(btn(), mouse);
    fireEvent.click(btn());
    fireEvent.pointerLeave(btn(), mouse);
    wait(1000);
    expect(note()).not.toBeNull();
    fireEvent.click(btn());
    expect(note()).toBeNull();
  });

  it("a tap (no hover on a phone) opens it and it stays; a touch pointer does not open or close it on its own", () => {
    mount();
    fireEvent.pointerEnter(btn(), { pointerType: "touch" });
    expect(note()).toBeNull();
    fireEvent.click(btn());
    expect(note()).not.toBeNull();
    fireEvent.pointerLeave(btn(), { pointerType: "touch" });
    wait(1000);
    expect(note()).not.toBeNull();
  });

  it("Escape closes it", () => {
    mount();
    fireEvent.pointerEnter(btn(), mouse);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(note()).toBeNull();
  });
});
