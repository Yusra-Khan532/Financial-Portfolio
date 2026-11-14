// @vitest-environment jsdom
// Task #152 (14 Nov 2026): "Show in dark/light mode on landing page / remove the red box content completely". The red box is the "Show in Light | Dark"
// switch under the hero's product tour. It is gone with its styles; the tour plays in the opposite theme to the page, follows the site's theme switch, and a
// choice an older visit stored in this browser no longer decides the look.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Tour } from "./Home";

afterEach(() => { cleanup(); delete document.documentElement.dataset.theme; try { localStorage.clear(); } catch { /* none */ } });
const open = () => render(<Tour />);
const tour = () => document.getElementById("tour") as HTMLElement;
const video = () => tour().querySelector("video") as HTMLVideoElement;

describe("task #152: the landing tour has no Show in Light / Dark switch", () => {
  it("shows no switch, no 'Show in' words and no Light or Dark button under the tour", () => {
    open();
    expect(screen.queryByRole("group", { name: /Show the tour in/i })).toBeNull();
    expect(tour().textContent).not.toMatch(/Show in/);
    expect(tour().querySelectorAll("button")).toHaveLength(0);
    expect(tour().querySelector("figcaption")!.textContent).toMatch(/^Product tour/);   // the caption stays
  });
  it("plays the tour in the opposite theme to the page, and follows the site's theme switch", async () => {
    document.documentElement.dataset.theme = "light";
    open();
    expect(tour().dataset.look).toBe("dark"); expect(video().getAttribute("src")).toMatch(/finlit-tour-dark-720p\.mp4$/);
    await act(async () => { document.documentElement.dataset.theme = "dark"; await new Promise((r) => setTimeout(r, 0)); });
    expect(tour().dataset.look).toBe("light"); expect(video().getAttribute("src")).toMatch(/finlit-tour-720p\.mp4$/);
  });
  it("ignores a Light / Dark choice an older visit stored, so nobody is stuck on a look they can no longer change", () => {
    localStorage.setItem("finlit-tour-look", "light");
    document.documentElement.dataset.theme = "light";
    open();
    expect(tour().dataset.look).toBe("dark");
  });
  it("leaves no style or code behind for the switch", () => {
    expect(readFileSync(join(__dirname, "..", "styles", "human-home.css"), "utf8")).not.toMatch(/\.hh-look/);
    expect(readFileSync(join(__dirname, "Home.tsx"), "utf8")).not.toMatch(/hh-look|TOUR_CHOICE_KEY|localStorage/);
  });
});
