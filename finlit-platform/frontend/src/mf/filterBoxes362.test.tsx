// @vitest-environment jsdom
// Task #362 (Chinmay, 24 Nov 2026): the fund-type boxes of the Mutual funds filter panel: every box starts closed when the page opens; opening one closes
// the one that was open; the open box's own header closes it. The type the list shows keeps its tick and "N of M selected" while folded.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CategoryPicker } from "./Dashboard";
import type { ListQuery, SubCat } from "../lib/mf";

afterEach(() => { cleanup(); localStorage.clear(); });
// task #427: the boxes sit inside the "Fund type" drop-down (closed at first), so each test opens it first
const types = () => fireEvent.click(screen.getByRole("button", { name: /^Fund type/ }));
const Q = { q: "", amc: "", plan: "", option: "", status: "", sort: "", dir: "desc", page: 1, size: 25, min1y: "", max1y: "", min5y: "", max5y: "", view: "", tab: "equity", cats: null } as ListQuery;
const SUBS: SubCat[] = [{ key: "a", label: "Aggressive Hybrid", names: [], count: 30 }, { key: "b", label: "Arbitrage", names: [], count: 35 }];
let tabs: string[] = [];
function Harness() {
  const [q, setQ] = useState<ListQuery>(Q);
  return <CategoryPicker side q={q} subs={SUBS} loading={false} onTab={(t) => { tabs.push(t); setQ((s) => ({ ...s, tab: t, cats: null })); }} onCats={(c) => setQ((s) => ({ ...s, cats: c }))} />;
}
const head = (name: string) => screen.getByRole("button", { name: new RegExp("^.?" + name) });
const opened = () => [...document.querySelectorAll(".mf-acc-b")].map((r) => r.getAttribute("aria-labelledby"));

describe("task #362: the filter boxes on Mutual funds", () => {
  it("all boxes are closed when the page opens, and the type in use still shows its tick and count", () => {
    tabs = []; render(<Harness />);
    expect(opened()).toEqual([]);
    types();
    for (const b of document.querySelectorAll(".mf-acc-h")) expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(head("Equity").textContent).toMatch(/2 of 2 selected/);
    expect(head("Equity").querySelector(".mf-acc-box.all")).toBeTruthy();
  });
  it("opening a box closes the one that was open, and its own header closes it", () => {
    tabs = []; render(<Harness />);
    types();
    fireEvent.click(head("Equity"));
    expect(opened()).toEqual(["mf-acc-equity"]);
    expect(tabs).toEqual([]);                                    // already the type in use: nothing reloads
    fireEvent.click(head("Hybrid"));
    expect(opened()).toEqual(["mf-acc-hybrid"]);                 // Equity closed by itself
    expect(tabs).toEqual(["hybrid"]);                            // and the list switched to Hybrid, as before
    expect(screen.getByText("Aggressive Hybrid")).toBeTruthy();
    fireEvent.click(head("Hybrid"));
    expect(opened()).toEqual([]);                                // the open box closes on its own header
    expect(head("Hybrid").textContent).toMatch(/2 of 2 selected/);
  });
});
