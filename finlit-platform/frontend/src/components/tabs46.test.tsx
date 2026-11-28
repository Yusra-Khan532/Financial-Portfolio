// @vitest-environment jsdom
// Developer file 46 (founder, 27 Nov 2026: "make sure we highlight wherever there are tabs like these, so that the user notices he has to click it"):
// every TabGroup bar marks the views not opened yet, offers "See N more →", looks pressable, and nudges when it first comes into view.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabGroup } from "./TabGroup";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const views = [
  { key: "m", label: "Monthly returns", content: <p>panel M</p> },
  { key: "d", label: "Distance from high", content: <p>panel D</p> },
  { key: "b", label: "How bumpy", content: <p>panel B</p> },
];
const tabs = () => screen.getAllByRole("tab");
const unseen = () => tabs().filter((t) => t.classList.contains("unseen")).map((t) => t.textContent);

describe("the views not opened yet are marked, and one button opens the next", () => {
  it("the open view is seen; the others carry the dot; the header says See 2 more instead of its hint; the tabs' text is unchanged", () => {
    const { container } = render(<TabGroup label="Price statistics" hint="Monthly returns shown here" views={views} />);
    expect(unseen()).toEqual(["2Distance from high", "3How bumpy"]);
    expect(tabs()[1].classList.contains("up-next")).toBe(true);
    expect(container.querySelector(".ctabs-h")!.textContent).toBe("⇆3 viewsSee 2 more→");   // in place of the hint, so the header keeps its width
    expect(screen.getByRole("button", { name: "See 2 more views: opens Distance from high" })).toBeTruthy();
  });
  it("See N more opens the next view not opened yet; once all are opened the hint is back", () => {
    const { container } = render(<TabGroup label="Price statistics" hint="Monthly returns shown here" views={views} />);
    fireEvent.click(screen.getByRole("button", { name: /See 2 more/ }));
    expect(tabs()[1].getAttribute("aria-selected")).toBe("true");
    expect(unseen()).toEqual(["3How bumpy"]);
    fireEvent.click(screen.getByRole("button", { name: /See 1 more views: opens How bumpy/ }));
    expect(tabs()[2].getAttribute("aria-selected")).toBe("true");
    expect(unseen()).toEqual([]);
    expect(container.querySelector(".ctabs-h")!.textContent).toBe("⇆3 viewsMonthly returns shown here");
    expect(container.querySelector(".ct-more")).toBeNull();
    fireEvent.click(tabs()[0]);
    expect(unseen()).toEqual([]);                                                       // going back keeps them seen
  });
  it("the next view not opened yet is counted after the open one, wrapping round", () => {
    render(<TabGroup label="x" initial="b" views={views} />);
    expect(unseen()).toEqual(["1Monthly returns", "2Distance from high"]);
    expect(tabs()[0].classList.contains("up-next")).toBe(true);
  });
  it("a bar the page drives (value and onChange) counts what the page opens too", () => {
    const { rerender } = render(<TabGroup label="x" value="m" onChange={() => {}} views={views.map(({ key, label }) => ({ key, label }))} />);
    rerender(<TabGroup label="x" value="b" onChange={() => {}} views={views.map(({ key, label }) => ({ key, label }))} />);
    expect(unseen()).toEqual(["2Distance from high"]);
  });
});

describe("the nudge runs when the bar first comes into view, until it is used", () => {
  it("not on page load: only when at least 60% of the bar shows; it stops after a few pulses and for good once a tab is pressed", () => {
    vi.useFakeTimers();
    let cb: ((e: { isIntersecting: boolean }[]) => void) | null = null, opts: IntersectionObserverInit | undefined;
    vi.stubGlobal("IntersectionObserver", class { constructor(f: typeof cb, o?: IntersectionObserverInit) { cb = f; opts = o; } observe() {} disconnect() {} });
    const { container } = render(<TabGroup label="x" views={views} />);
    const bar = container.querySelector(".ctabs")!;
    expect(bar.classList.contains("nudge")).toBe(false);
    expect(opts?.threshold).toBe(0.6);
    act(() => cb!([{ isIntersecting: true }]));
    expect(bar.classList.contains("nudge")).toBe(true);
    act(() => { vi.advanceTimersByTime(7000); });
    expect(bar.classList.contains("nudge")).toBe(false);
    act(() => cb!([{ isIntersecting: true }]));
    fireEvent.click(tabs()[2]);
    expect(bar.classList.contains("nudge")).toBe(false);
  });
  it("the styles: raised tabs, the dot, the ink button, the nudge on the next view, nothing that moves for reduced motion, no gold", () => {
    const css = readFileSync(resolve(__dirname, "../styles/tabgroup.css"), "utf8");
    expect(css).toContain(".ct-list button.unseen::after { content: \"\"; position: absolute; top: 5px; right: 5px; width: 8px; height: 8px; border-radius: 50%; background: var(--ui-on-bg);");
    expect(css).toMatch(/\.ct-more \{[^}]*background: var\(--ui-on-bg\); color: var\(--ui-on-fg\);/);
    expect(css).toContain(".ctabs.nudge .ct-list button.up-next { animation: ctNudge 1.8s ease-in-out 3;");
    expect(css).not.toContain(".ctabs:not(.used) .ct-list button[aria-selected=\"true\"] + button");   // the old nudge ran on page load
    expect(css).toContain(".ctabs .ct-list button, .ctabs .ct-more span { animation: none; }");
    expect(css).not.toMatch(/--gold/);
  });
});
