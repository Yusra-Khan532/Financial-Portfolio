// @vitest-environment jsdom
// Task #453 (team, 28 Nov 2026): "in this mutual fund screener add nav in the columns. 1st column Mutual fund score then nav".
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ResultTable } from "./Results";
import { DEFAULTS, type ScreenRow, type SQ } from "../../lib/mfScreen";

const row = (over: Partial<ScreenRow>): ScreenRow => ({
  code: 1, name: "Alpha Flexi Cap Fund", amc: "Alpha Mutual Fund", category: "Equity Scheme - Flexi Cap Fund", plan: "Direct", option: "Growth",
  nav: 96.5013, navDate: "2026-11-26", active: true, r1y: 0.016, r3y: 0.133, r5y: 0.126, ...over,
} as unknown as ScreenRow);

function mount(rows: ScreenRow[], q: Partial<SQ> = {}, onSort = vi.fn()) {
  render(<MemoryRouter><ResultTable rows={rows} q={{ ...DEFAULTS, ...q }} onSort={onSort} loading={false}
    score={{ gold: true, items: new Map(), loading: false }} pick={{ picked: [], onPick: () => {} }} /></MemoryRouter>);
  return onSort;
}

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
afterEach(cleanup);
describe("task #453: the NAV column", () => {
  it("comes straight after the Mutual Fund Score, before the returns", () => {
    mount([row({})]);
    const heads = [...document.querySelectorAll(".mfs-table thead th")].map((th) => th.textContent!.trim());
    expect(heads.slice(1, 4)).toEqual(["Mutual Fund Score", "NAV", "1 year"]);
  });
  it("shows the NAV and the day it is for, and the fund cell no longer repeats it", () => {
    mount([row({})]);
    const td = document.querySelector("tbody td.mfs-navc")!;
    expect(td.querySelector(".mfs-navv > span")!.textContent).toBe("₹96.5013");
    expect(td.querySelector("small")!.textContent).toBe("26 Nov");
    expect(document.querySelector("tbody th.mfs-n")!.textContent).not.toMatch(/NAV|96\.50/);
  });
  it("a plan without a NAV shows a dash with its reason", () => {
    mount([row({ nav: null, navDate: null })]);
    const na = document.querySelector("tbody td.mfs-navc .mf-na")!;
    expect(na.textContent).toBe("—");
    expect(na.getAttribute("title")).toMatch(/AMFI has not published a NAV/);
  });
  it("sorts by NAV and marks the sorted column", () => {
    const onSort = mount([row({})], { sort: "nav", dir: "desc" });
    const th = document.querySelector("thead th.mfs-navc")!;
    expect(th.getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(th.querySelector("button")!);
    expect(onSort).toHaveBeenCalledWith("nav");
  });
});
