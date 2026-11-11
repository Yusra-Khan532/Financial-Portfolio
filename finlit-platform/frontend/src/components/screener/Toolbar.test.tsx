// @vitest-environment jsdom
// Task #72: the Market cap, Sector and More filters buttons above the screener tables are plain click buttons: no arrow or chevron inside them (they open the filter panel; they are not dropdowns).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toolbar } from "./PageParts";

afterEach(cleanup);
describe("screener toolbar buttons", () => {
  it("have text and a count badge only, and a click does what it says", () => {
    const click = vi.fn();
    render(<Toolbar q="" setQ={() => {}} searchLabel="Search" buttons={[{ id: "cap", label: "Market cap", active: 2, onClick: click }, { id: "sector", label: "Sector", active: 0, onClick: () => {} }, { id: "more", label: "More filters", active: 0, onClick: () => {} }]} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent?.replace(/\d+$/, "").trim())).toEqual(["Market cap", "Sector", "More filters"]);
    for (const b of buttons) { expect(b.querySelector("svg"), b.textContent ?? "").toBeNull(); expect(b.getAttribute("aria-haspopup")).toBeNull(); expect(b.getAttribute("aria-expanded")).toBeNull(); }
    fireEvent.click(screen.getByRole("button", { name: /Market cap/ }));
    expect(click).toHaveBeenCalledTimes(1);
  });
});
