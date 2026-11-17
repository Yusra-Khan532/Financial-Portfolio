// @vitest-environment jsdom
// Task #195: with no IPO open or announced (or no IPO data), "IPOs open now" is a one-line strip; with IPOs it stays the card with its list.
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

let state: { isLoading: boolean; isError: boolean; data: unknown[] | undefined } = { isLoading: false, isError: false, data: [] };
vi.mock("../../lib/ipo", () => ({ useIpos: () => state }));
const { Ipos } = await import("./NewsBlocks");
const show = () => render(<MemoryRouter><Ipos /></MemoryRouter>).container;
afterEach(cleanup);

describe("IPOs open now", () => {
  it("no IPO: a one-line strip with its reason and the calendar link", () => {
    state = { isLoading: false, isError: false, data: [] };
    const s = show().querySelector("section.dsh-strip1")!;
    expect(s.querySelector("h2")!.textContent).toBe("IPOs open now");
    expect(s.querySelector(".m")!.textContent).toBe("No IPO is open or announced right now.");
    expect(s.querySelector("a")!.getAttribute("href")).toBe("/ipo");
  });
  it("no IPO data: the strip says so", () => {
    state = { isLoading: false, isError: true, data: undefined };
    expect(show().querySelector(".dsh-strip1 .m")!.textContent).toBe("IPO details are not available right now.");
  });
  it("an IPO open: the card with the list, not a strip", () => {
    state = { isLoading: false, isError: false, data: [{ id: 1, name: "SAMPLE POWER LTD", status: "open", openDate: "2026-11-16", closeDate: "2026-11-19", priceLow: 98, priceHigh: 104 }] };
    const c = show();
    expect(c.querySelector(".dsh-strip1")).toBeNull();
    expect(c.textContent).toContain("Sample Power Ltd");
  });
});
