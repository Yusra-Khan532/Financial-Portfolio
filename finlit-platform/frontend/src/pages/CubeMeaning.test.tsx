// @vitest-environment jsdom
// Task #229: the box that says what the 3D picture under the stock screener's results means.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CubeMeaning } from "./ScreenerPro";

afterEach(cleanup);
describe("the 3D picture's meaning box (task #229)", () => {
  it("names each direction with its column, says how to read and use it, and that it is no ranking", () => {
    render(<CubeMeaning n={25} axes={["Market cap", "Short-term technical", "Long-term technical"]} />);
    const box = screen.getByRole("complementary", { name: "What this picture shows" });
    expect(within(box).getByText("Each dot is one company of this page: the 25 with all three figures.")).toBeTruthy();
    const rows = [...box.querySelectorAll("dl > div")].map((d) => d.textContent);
    expect(rows).toEqual(["UpShort-term technical: lowest at the bottom, highest at the top", "AcrossMarket cap: lowest on the left, highest on the right",
      "DepthLong-term technical: lowest at the back, highest at the front"]);
    expect(box.textContent).toContain("first three number columns of the table");
    expect(box.textContent).toContain("click it to open the company's report");
    expect(box.textContent).toContain("it is not a ranking");
    expect(box.textContent).not.toMatch(/\b(buy|sell|hold|best)\b/i);
  });
});
