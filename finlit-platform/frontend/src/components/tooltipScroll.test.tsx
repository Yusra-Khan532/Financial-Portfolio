// @vitest-environment jsdom
// Task #204: a long tooltip showed a scrollbar but closed the moment the pointer left the (i), so it could never be reached and scrolled with the wheel.
// Now the (i) popovers wait a moment before closing, stay open while the pointer is on them, close when it leaves, and a scroll inside them keeps them open.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Info, InfoProvider } from "./Info";
import { Tip } from "./sectors/pack/Common";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
const g = { key: "pe", label: "P/E", what: "The share price divided by EPS. ".repeat(20), read: "How to read it", formula: "Price ÷ EPS" };
const later = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe("glossary (i) popover (task #204)", () => {
  const setup = () => { render(<InfoProvider><Info g={g as never} /></InfoProvider>); return { btn: screen.getByRole("button", { name: "What is P/E?" }), pop: document.querySelector(".pop") as HTMLElement }; };

  it("stays open while the pointer moves from the (i) onto it, and closes when the pointer leaves it", () => {
    const { btn, pop } = setup();
    fireEvent.mouseEnter(btn); expect(pop.hidden).toBe(false);
    fireEvent.mouseLeave(btn); later(60); fireEvent.mouseEnter(pop); later(1000);
    expect(pop.hidden).toBe(false);
    fireEvent.mouseLeave(pop); later(300);
    expect(pop.hidden).toBe(true);
  });
  it("still closes when the pointer leaves the (i) for somewhere else", () => {
    const { btn, pop } = setup();
    fireEvent.mouseEnter(btn); fireEvent.mouseLeave(btn); later(300);
    expect(pop.hidden).toBe(true);
  });
  it("scrolls inside itself: overflow auto, the wheel kept off the page, and the page scroll that closes it is the window's only", () => {
    const { btn, pop } = setup();
    fireEvent.mouseEnter(btn);
    expect(pop.style.overflowY).toBe("auto"); expect(pop.style.overscrollBehavior).toBe("contain");
    fireEvent.mouseLeave(btn); fireEvent.mouseEnter(pop);
    fireEvent.scroll(pop); later(300);
    expect(pop.hidden).toBe(false);
    act(() => { window.dispatchEvent(new Event("scroll")); });
    expect(pop.hidden).toBe(true);
  });
  it("Escape closes it", () => {
    const { btn, pop } = setup();
    fireEvent.mouseEnter(btn); fireEvent.keyDown(window, { key: "Escape" });
    expect(pop.hidden).toBe(true);
  });
});

describe("Sector Pulse (i) (task #204)", () => {
  it("can be reached with the pointer and scrolled without closing", () => {
    render(<Tip text={"A long explanation. ".repeat(40)} />);
    const btn = screen.getByRole("button", { name: "What does this mean?" });
    fireEvent.mouseEnter(btn);
    const pop = () => document.querySelector(".sp-pop") as HTMLElement | null;
    expect(pop()).toBeTruthy();
    fireEvent.mouseLeave(btn); later(60); fireEvent.mouseEnter(pop()!);
    fireEvent.scroll(pop()!); later(1000);
    expect(pop()).toBeTruthy();
    fireEvent.mouseLeave(pop()!); later(300);
    expect(pop()).toBeNull();
  });
  it("caps its height and scrolls inside", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/sectors-pack.css"), "utf8");
    expect(css).toMatch(/\.sp-pop \{ overflow-y: auto; overscroll-behavior: contain;/);
    expect(readFileSync(join(process.cwd(), "src/components/sectors/pack/Common.tsx"), "utf8")).toMatch(/maxHeight: pos\.maxH/);
  });
});

describe("company page leadership tip (task #204)", () => {
  it("a scroll inside the tip does not close it", () => {
    const src = readFileSync(join(process.cwd(), "src/stock/Leadership.tsx"), "utf8");
    expect(src).toMatch(/const scrolled = \(e: Event\) => \{ if \(!tip\.current\?\.contains\(e\.target as Node\)\) setOpen\(false\); \}/);
    expect(src).toMatch(/overscrollBehavior: "contain"/);
  });
});
