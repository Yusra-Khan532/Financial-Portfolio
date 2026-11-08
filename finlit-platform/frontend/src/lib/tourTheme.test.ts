import { describe, expect, it } from "vitest";
import { asChoice, opposite, tourLook } from "./tourTheme";

describe("tour look", () => {
  it("is the opposite of the page by default, so the video stands out", () => {
    expect(tourLook("light", "auto")).toBe("dark"); expect(tourLook("dark", "auto")).toBe("light");
    expect(tourLook("light", null)).toBe("dark"); expect(tourLook("dark", undefined)).toBe("light");
  });
  it("follows an explicit choice whatever the page theme", () => {
    expect(tourLook("light", "light")).toBe("light"); expect(tourLook("dark", "dark")).toBe("dark");
    expect(tourLook("light", "dark")).toBe("dark"); expect(tourLook("dark", "light")).toBe("light");
  });
  it("reads a stored value safely", () => {
    expect(asChoice("light")).toBe("light"); expect(asChoice("dark")).toBe("dark");
    for (const bad of ["", "auto", "blue", null, undefined, 3]) expect(asChoice(bad)).toBe("auto");
    expect(opposite("dark")).toBe("light");
  });
});
