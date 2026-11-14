import { describe, expect, it } from "vitest";
import { opposite, tourLook } from "./tourTheme";

describe("tour look", () => {
  it("is the opposite of the page, so the video stands out", () => {
    expect(tourLook("light")).toBe("dark"); expect(tourLook("dark")).toBe("light");
    expect(opposite("dark")).toBe("light"); expect(opposite("light")).toBe("dark");
  });
});
