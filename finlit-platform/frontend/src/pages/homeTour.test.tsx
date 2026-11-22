// @vitest-environment jsdom
// Task #152 (14 Nov 2026): "Show in dark/light mode on landing page / remove the red box content completely". The red box is the "Show in Light | Dark"
// switch under the hero's product tour. It is gone with its styles; the tour follows the site's theme switch, and a choice an older visit stored in this
// browser no longer decides the look. Task #310 H (22 Nov 2026): the tour now plays the recording made in the page's OWN theme, with that theme's poster.
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
  it("plays the light recording on the light page and the dark one on the dark page, each with its own poster, and swaps them on the theme switch", async () => {
    document.documentElement.dataset.theme = "light";
    open();
    expect(tour().dataset.look).toBe("light");
    expect(video().getAttribute("src")).toMatch(/landing\/finlit-tour-light-720p\.mp4$/); expect(video().getAttribute("poster")).toMatch(/landing\/finlit-tour-light-poster\.webp$/);
    await act(async () => { document.documentElement.dataset.theme = "dark"; await new Promise((r) => setTimeout(r, 0)); });
    expect(tour().dataset.look).toBe("dark");
    expect(video().getAttribute("src")).toMatch(/landing\/finlit-tour-dark-720p\.mp4$/); expect(video().getAttribute("poster")).toMatch(/landing\/finlit-tour-dark-poster\.webp$/);
    await act(async () => { document.documentElement.dataset.theme = "light"; await new Promise((r) => setTimeout(r, 0)); });
    expect(video().getAttribute("src")).toMatch(/finlit-tour-light-720p\.mp4$/);
  });
  it("does not start by itself for people who ask for less motion: they see the poster", () => {
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try { document.documentElement.dataset.theme = "light"; open(); expect(video().autoplay).toBe(false); expect(video().getAttribute("poster")).toMatch(/light-poster\.webp$/); }
    finally { window.matchMedia = mm; }
  });
  it("frames the tour on the card surface with the card border", () => {
    const css = readFileSync(join(__dirname, "..", "styles", "human-home.css"), "utf8");
    expect(css).toMatch(/\.hh-frame \{[^}]*border: 1px solid var\(--border\);[^}]*background: var\(--s1\);/);
    expect(css).toMatch(/\.hh-video \{[^}]*background: var\(--s1\); border: 1px solid var\(--border\);/);
    expect(css).not.toMatch(/\.hh-top \.hh-video \{ border-color/);
  });
  it("ignores a Light / Dark choice an older visit stored, so nobody is stuck on a look they can no longer change", () => {
    localStorage.setItem("finlit-tour-look", "dark");
    document.documentElement.dataset.theme = "light";
    open();
    expect(tour().dataset.look).toBe("light");
  });
  it("leaves no style or code behind for the switch", () => {
    expect(readFileSync(join(__dirname, "..", "styles", "human-home.css"), "utf8")).not.toMatch(/\.hh-look/);
    expect(readFileSync(join(__dirname, "Home.tsx"), "utf8")).not.toMatch(/hh-look|TOUR_CHOICE_KEY|localStorage/);
  });
});
