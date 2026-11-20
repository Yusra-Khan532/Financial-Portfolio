// @vitest-environment jsdom
// Task #257 (Basic screener pack, SPEC 2, 3 and 4): an open Basic screen's header row is Market cap · Macro sector · Sector · Industry · FinLit IQ · More filters.
// The three NSE lists are #258's (all 12 / 22 / 59, narrowed only by the parent, "Not on this list · N"); the FinLit IQ panel has the rating in three groups
// with counts (zero greyed) and 0-100 ranges for the FinLit IQ and its five scores; each filter adds a chip; the server gets iqg / omin ... ptmax.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { FilterChips, FilterMenus } from "./ScreenParts";
import { iqCount } from "./BasicScreenFilters";
import { NO_BAR, barCount, barParams, type BarFilter, type PresetDetail } from "../../../lib/presets";

afterEach(cleanup);
const D = { facets: { sizes: { Large: 40, Mid: 60, Small: 45, Micro: 5 }, sectors: [], strong: 49, anyRating: 150, new: 9, ahead: 70, nse: 140, bse: 5,
  macros: [["Financial Services", 30], ["Information Technology", 12]], nsecs: [["Financial Services", 30], ["Information Technology", 12]],
  industries: [["Banks", 20], ["IT - Software", 12], ["Finance", 10]], iqGroups: { good: 49, below: 80, nr: 0 } } } as unknown as PresetDetail;
let last: BarFilter = NO_BAR;
function F({ basic = true }: { basic?: boolean }) {
  const [b, setB] = useState<BarFilter>(NO_BAR); last = b;
  return <MemoryRouter><FilterMenus d={D} f={{ bar: b, set: setB }} basic={basic} onAddRule={() => {}} /><FilterChips f={{ bar: b, set: setB }} basic={basic} /></MemoryRouter>;
}
const open = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

describe("an open Basic screen", () => {
  it("the header row; each menu opens as a bottom sheet on a phone (psx3-sheet)", () => {
    render(<F />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Market cap ▾", "Macro sector ▾", "Sector ▾", "Industry ▾", "FinLit IQ ▾", "More filters ▾"]);
    for (const n of [/^Market cap/, /^Macro sector/, /^FinLit IQ/, /^More filters/]) {
      open(n); expect(document.querySelector(".psx3-ddp")!.className).toContain("psx3-sheet"); fireEvent.keyDown(document, { key: "Escape" });
    }
    cleanup(); render(<F basic={false} />);
    open(/^Macro sector/); expect(document.querySelector(".psx3-ddp")!.className).not.toContain("psx3-sheet");     // Advanced keeps its drop-downs
  });
  it("Sector lists all 22, those on this list first by count, the rest greyed under 'Not on this list · 20'", () => {
    render(<F />); open(/^Sector/);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(22);
    expect(boxes.slice(0, 2).map((c) => c.closest("label")!.textContent)).toEqual(["Financial Services30", "Information Technology12"]);
    expect(screen.getByText("Not on this list · 20")).toBeTruthy();
    expect(boxes.slice(2).every((c) => (c as HTMLInputElement).disabled)).toBe(true);
  });
  it("a level pick adds a chip and goes to the server as macro / nsec / indu", () => {
    render(<F />); open(/^Industry/);
    fireEvent.click(screen.getByRole("checkbox", { name: /^Banks/ }));
    expect(last.indus).toEqual(["Banks"]);
    expect(screen.getByRole("group", { name: "Filters on" }).textContent).toContain("Industry: Banks");
    expect(barParams(last)).toContain("indu=Banks");
  });
  it("FinLit IQ: three rating groups with counts (zero greyed), 0-100 ranges held, 'FinLit IQ · 2', chips, Clear score filters", () => {
    render(<F />); open(/^FinLit IQ/);
    const g = screen.getByRole("group", { name: "FinLit IQ rating" });
    expect(within(g).getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(["Strong or Healthy49", "Below Healthy80", "Not rated0"]);
    expect((within(g).getByRole("checkbox", { name: /Not rated/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("Counts are for this list")).toBeTruthy();
    fireEvent.click(within(g).getByRole("checkbox", { name: /Strong or Healthy/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Quality from" }), { target: { value: "150" } });
    expect(last.rg?.pq).toEqual([100, null]);
    expect(screen.getByRole("button", { name: /^FinLit IQ · 2/ })).toBeTruthy();
    expect(screen.getByText("2 on")).toBeTruthy();
    const chips = screen.getByRole("group", { name: "Filters on" }).textContent!;
    expect(chips).toContain("FinLit IQ: Strong or Healthy"); expect(chips).toContain("Quality: 100 or more");
    expect(barParams(last)).toEqual(expect.arrayContaining(["iqg=good", "pqmin=100"]));
    fireEvent.click(screen.getByRole("button", { name: "Clear score filters" }));
    expect(iqCount(last)).toBe(0);
  });
  it("counts: rating groups and ranges count as filters", () => {
    const b: BarFilter = { ...NO_BAR, iqg: ["good", "nr"], rg: { o: [60, null], pt: [null, 80] } };
    expect(iqCount(b)).toBe(4); expect(barCount(b)).toBe(4);
    expect(barParams(b)).toEqual(["omin=60", "ptmax=80", "iqg=good,nr"]);
  });
});
