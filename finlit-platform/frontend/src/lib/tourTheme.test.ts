// Task #310 H (22 Nov 2026): the landing tour plays the recording made in the page's own theme, with that theme's poster (the FinLit Prism report card).
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOUR_FILES, tourLook, tourMedia } from "./tourTheme";

const PUB = join(__dirname, "..", "..", "public", "landing");

describe("tour look", () => {
  it("is the page's own theme: light on the light page, dark on the dark page", () => {
    expect(tourLook("light")).toBe("light"); expect(tourLook("dark")).toBe("dark");
  });
  it("gives each theme its own video and its own poster", () => {
    expect(tourMedia("light")).toEqual({ video: "/landing/finlit-tour-light-720p.mp4", poster: "/landing/finlit-tour-light-poster.webp" });
    expect(tourMedia("dark")).toEqual({ video: "/landing/finlit-tour-dark-720p.mp4", poster: "/landing/finlit-tour-dark-poster.webp" });
    expect(tourMedia("light").video).not.toBe(tourMedia("dark").video); expect(tourMedia("light").poster).not.toBe(tourMedia("dark").poster);
  });
  it("puts the files under the site's base path", () => {
    expect(tourMedia("light", "/app/").video).toBe("/app/landing/finlit-tour-light-720p.mp4");
    expect(tourMedia("dark", "/app").poster).toBe("/app/landing/finlit-tour-dark-poster.webp");
  });
  it("ships every file it names, small enough for a hero (video under 4 MB, poster under 120 KB)", () => {
    for (const f of Object.values(TOUR_FILES)) {
      expect(existsSync(join(PUB, f.video))).toBe(true); expect(existsSync(join(PUB, f.poster))).toBe(true);
      expect(statSync(join(PUB, f.video)).size).toBeLessThan(4 * 1024 * 1024); expect(statSync(join(PUB, f.poster)).size).toBeLessThan(120 * 1024);
    }
  });
});
