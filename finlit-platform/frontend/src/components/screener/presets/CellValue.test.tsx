// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CellValue } from "./ScreenView";

afterEach(cleanup);
const text = (v: unknown) => render(<CellValue v={v} f="pct_down" />).container.textContent;

describe("Down from 52-week high cell (task #62)", () => {
  it("shows the distance below the high as a minus", () => {
    expect(text(4.56)).toBe("−4.6%");
    expect(text(10)).toBe("−10.0%");
  });
  it("shows a company at its high as 0.0% and keeps a stored minus as a minus", () => {
    expect(text(0)).toBe("0.0%");
    expect(text(-3.2)).toBe("−3.2%");
  });
  it("shows a dash with a reason when there is no 52-week high", () => {
    expect(render(<CellValue v={null} f="pct_down" />).container.querySelector("[aria-label='not available']")).not.toBeNull();
  });
});
