// @vitest-environment jsdom
// Task #427 (team, 27 Nov 2026): "give a drop down for this also the headigns: plan , fund house etc make them in green like it is in stock screener page
// and increase the size for visibility". The six fund-type boxes of the Mutual funds filter panel sit in one "Fund type" drop-down (closed at first,
// remembered in this browser, its header naming the type in use); every heading of the panel is the stock screener's green and 14px (was 12px grey).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CategoryPicker, TYPES_KEY } from "./Dashboard";
import type { ListQuery, SubCat } from "../lib/mf";

afterEach(() => { cleanup(); localStorage.clear(); });
const css = readFileSync(resolve(process.cwd(), "src", "styles", "mf341.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const screenerCss = readFileSync(resolve(process.cwd(), "src", "styles", "task364.css"), "utf8");
const Q = { q: "", amc: "", plan: "", option: "", status: "", sort: "", dir: "desc", page: 1, size: 25, min1y: "", max1y: "", min5y: "", max5y: "", view: "", tab: "all", cats: null } as ListQuery;
const SUBS: SubCat[] = [{ key: "a", label: "Large Cap Fund", names: [], count: 30 }, { key: "b", label: "Mid Cap Fund", names: [], count: 35 }];
function Harness({ start = Q }: { start?: ListQuery }) {
  const [q, setQ] = useState<ListQuery>(start);
  return <CategoryPicker side q={q} subs={SUBS} loading={false} onTab={(t) => setQ((s) => ({ ...s, tab: t, cats: null }))} onCats={(c) => setQ((s) => ({ ...s, cats: c }))} />;
}
const dd = () => screen.getByRole("button", { name: /^Fund type/ });

describe("task #427: the fund types in one drop-down", () => {
  it("closed at first: one 'Fund type' field naming the type in use, the six boxes hidden", () => {
    render(<Harness />);
    expect(dd().getAttribute("aria-expanded")).toBe("false");
    expect(dd().textContent).toMatch(/^All funds/);
    expect(document.querySelectorAll(".mf-acc")).toHaveLength(0);
  });
  it("opening it shows the six boxes, and they still work (choosing Equity switches the list and the field says so)", () => {
    render(<Harness />);
    fireEvent.click(dd());
    expect(dd().getAttribute("aria-expanded")).toBe("true");
    const names = [...document.querySelectorAll(".mf-acc-t")].map((e) => e.textContent);
    expect(names).toEqual(["Equity", "Hybrid", "Debt", "Solution Oriented", "Others", "All funds"]);
    fireEvent.click(screen.getByRole("button", { name: /^.?Equity/ }));
    expect(screen.getByText("Large Cap Fund")).toBeTruthy();
    expect(dd().textContent).toMatch(/^Equity · 2 of 2 selected/);
    fireEvent.click(screen.getByRole("checkbox", { name: /Mid Cap Fund/ }));
    expect(dd().textContent).toMatch(/1 of 2 selected/);
  });
  it("open or closed is remembered in this browser", () => {
    render(<Harness />);
    fireEvent.click(dd());
    expect(localStorage.getItem(TYPES_KEY)).toBe("open");
    cleanup();
    render(<Harness />);
    expect(dd().getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(dd());
    expect(localStorage.getItem(TYPES_KEY)).toBe("closed");
  });
  it("the panel's headings are the stock screener's green and larger (14px, was 12px)", () => {
    expect(screenerCss).toMatch(/\.wrap\.ssw \.srt-grp, \.wrap\.ssw \.srt-h \{[^}]*color: var\(--gain\);/);
    expect(css).toMatch(/\.mf-list \.mf-side \.label, \.mf-list \.mf-side \.mf-freq-k \{ color: var\(--gain\); font: 600 var\(--fs-14\)\/1\.3 var\(--sans\); letter-spacing: \.08em; text-transform: uppercase; \}/);
    expect(css).toMatch(/\.mf-list \.mf-typedd-h \{[^}]*min-height: 38px;/);
  });
});
