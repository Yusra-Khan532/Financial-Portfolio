// @vitest-environment jsdom
// Task #274 (the 20 Nov equity pack, change 19): What changed at your companies is step 3 of the Portfolio view and carries "N new" on the step and in
// Sections ▾. (The section, the chip under a share and the order-win notice are the shared block of task #272, tested there; on this page they were
// checked in the browser with live Discover data: 6 of 15 shares filed, 3 new since 12 Nov, chips under TECHM and ZENSARTECH, rows still 88 px.)
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SectionsBar, SectionsMenu, type Sec } from "./PageTop";

afterEach(cleanup);
const secs: Sec[] = [["pf-shares", "Your shares"], ["eq-keys", "Key figures"], ["eq-wc", "What changed", "3 new"], ["eq-trend", "Trends"]];

describe("What changed as step 3 with its new count", () => {
  it("the view bar shows it third, with 3 new", () => {
    render(<SectionsBar tab="portfolio" all={{ portfolio: { label: "Portfolio", secs } }} steps onAll={() => {}} onTab={() => {}} />);
    const chips = within(screen.getByRole("navigation", { name: "Sections on this tab" })).getAllByRole("button").slice(1).map((b) => b.textContent);
    expect(chips).toEqual(["1Your shares", "2Key figures", "3What changed3 new", "4Trends"]);
  });
  it("Sections ▾ carries the same count", () => {
    render(<SectionsMenu secs={secs} here="pf-shares" isHidden={() => false} show={() => {}} onAll={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Sections/ }));
    expect(screen.getByRole("menuitem", { name: /What changed/ }).textContent).toBe("3What changed3 new");
  });
  it("no badge when nothing is new", () => {
    render(<SectionsBar tab="portfolio" all={{ portfolio: { label: "Portfolio", secs: [["eq-wc", "What changed"]] } }} steps onTab={() => {}} />);
    expect(screen.queryByText(/new/)).toBeNull();
  });
});
