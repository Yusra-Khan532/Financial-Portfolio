// @vitest-environment jsdom
// Task #257 (Basic screener pack, SPEC 2, 3 and 4, SHARED 1): the Basic open screen's header row is Market cap · Macro sector · Sector · Industry · FinLit IQ ·
// More filters; the three NSE levels list all 12 / 22 / 59 names (narrowed only by the parent picked), on-list names first by count, the rest under
// "Not on this list · N", greyed and not clickable; a choice that no longer fits is taken off with a message; the FinLit IQ panel has three rating groups
// with counts and 0-100 ranges; each filter adds a chip; the server gets mac / nsec / nind / iqg / omin ... in the address.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { FilterChips, FilterMenus, pickLevel } from "./ScreenParts";
import { nseLevels } from "../../../lib/nseTaxonomy";
import { NO_BAR, barCount, barParams, iqCount, type BarFilter, type PresetDetail } from "../../../lib/presets";

afterEach(cleanup);
const D = { facets: { sizes: { Large: 40, Mid: 60, Small: 45 }, sectors: [["Banks", 20]], strong: 49, anyRating: 145, new: 9, ahead: 70, nse: 140, bse: 5,
  macros: { "Financial Services": 30, "Information Technology": 12, Industrials: 3 }, nseSectors: { "Financial Services": 30, "Information Technology": 12, "Capital Goods": 3 },
  industries: { Banks: 20, Finance: 10, "IT - Software": 12, "Industrial Products": 3 }, iqGroups: { good: 49, below: 80, nr: 0 } } } as unknown as PresetDetail;
let last: BarFilter = NO_BAR;
function F({ basic = true }: { basic?: boolean }) {
  const [b, setB] = useState<BarFilter>(NO_BAR); last = b;
  return <MemoryRouter><FilterMenus d={D} f={{ bar: b, set: setB }} basic={basic} onAddRule={() => {}} /><FilterChips f={{ bar: b, set: setB }} basic={basic} /></MemoryRouter>;
}
const open = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

describe("the Basic open screen's header row", () => {
  it("Market cap · Macro sector · Sector · Industry · FinLit IQ · More filters; Advanced keeps Sector and Prism rating", () => {
    render(<F />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Market cap ▾", "Macro sector ▾", "Sector ▾", "Industry ▾", "FinLit IQ ▾", "More filters ▾"]);
    cleanup(); render(<F basic={false} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Market cap ▾", "Sector ▾", "Prism rating ▾", "More filters ▾"]);
  });
  it("Sector lists all 22: the heading says how many are on this list, on-list names first by count, the rest greyed under 'Not on this list · N'", () => {
    render(<F />); open(/^Sector/);
    expect(screen.getByText(/all 22/).closest("p")!.textContent).toBe("Sector · all 22 — 3 on this list");
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(22);
    expect(boxes.slice(0, 3).map((c) => c.closest("label")!.textContent)).toEqual(["Financial Services30", "Information Technology12", "Capital Goods3"]);
    expect(screen.getByText("Not on this list · 19")).toBeTruthy();
    expect(boxes.slice(3).every((c) => (c as HTMLInputElement).disabled)).toBe(true);
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a sector" }), { target: { value: "power" } });
    expect(screen.getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(["Power0"]);
  });
  it("a macro sector narrows Sector and Industry; Industry lists all 59 with none picked", () => {
    render(<F />); open(/^Industry/);
    expect(screen.getAllByRole("checkbox")).toHaveLength(59);
    fireEvent.keyDown(document, { key: "Escape" });
    open(/^Macro sector/); expect(screen.getAllByRole("checkbox")).toHaveLength(12);
    fireEvent.click(screen.getByRole("checkbox", { name: /Information Technology/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    open(/^Industry/);
    const inds = screen.getAllByRole("checkbox").map((c) => c.closest("label")!.querySelector("b")!.textContent!);
    expect(inds.length).toBeGreaterThan(0); expect(inds.length).toBeLessThan(59);
    expect(inds.every((n) => nseLevels(n)?.macro === "Information Technology")).toBe(true);
    expect(last.macs).toEqual(["Information Technology"]);
  });
  it("a choice that no longer fits is taken off with a short message; each level adds a chip; Clear all clears them", () => {
    render(<F />); open(/^Industry/);
    fireEvent.click(screen.getByRole("checkbox", { name: /^Banks/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    open(/^Macro sector/);
    fireEvent.click(screen.getByRole("checkbox", { name: /Information Technology/ }));
    expect(screen.getByRole("status").textContent).toBe("Banks was taken off: not inside your other choice.");
    expect(last.ninds).toEqual([]);
    const chips = screen.getByRole("group", { name: "Filters on" });
    expect(chips.textContent).toContain("Macro sector: Information Technology");
    fireEvent.click(within(chips).getByRole("button", { name: "Clear all" }));
    expect(barCount(last)).toBe(0);
  });
  it("FinLit IQ: three rating groups with counts (zero greyed), 0-100 ranges clamped, 'FinLit IQ · 2', Clear score filters, chips", () => {
    render(<F />); open(/^FinLit IQ/);
    const g = screen.getByRole("group", { name: "FinLit IQ rating" });
    expect(within(g).getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(["Strong or Healthy49", "Below Healthy80", "Not rated0"]);
    expect((within(g).getByRole("checkbox", { name: /Not rated/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("Counts are for this list")).toBeTruthy();
    fireEvent.click(within(g).getByRole("checkbox", { name: /Strong or Healthy/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Quality from" }), { target: { value: "150" } });
    expect(last.rng?.q).toEqual({ min: 100, max: null });
    expect(screen.getByRole("button", { name: /^FinLit IQ · 2/ })).toBeTruthy();
    expect(screen.getByText("2 on")).toBeTruthy();
    const chips = screen.getByRole("group", { name: "Filters on" });
    expect(chips.textContent).toContain("FinLit IQ: Strong or Healthy"); expect(chips.textContent).toContain("Quality 100–100");
    fireEvent.click(screen.getByRole("button", { name: "Clear score filters" }));
    expect(iqCount(last)).toBe(0);
  });
});

describe("what the server gets", () => {
  it("mac, nsec, nind, iqg and each score's min / max; a blank end is left out", () => {
    const b: BarFilter = { ...NO_BAR, macs: ["Financial Services"], nsecs: ["Capital Goods"], ninds: ["Banks"], iqg: ["good", "nr"], rng: { o: { min: 60, max: null }, t: { min: null, max: 80 } } };
    expect(barParams(b)).toEqual(["mac=Financial%20Services", "nsec=Capital%20Goods", "nind=Banks", "iqg=good", "iqg=nr", "omin=60", "tmax=80"]);
    expect(barCount(b)).toBe(7); expect(iqCount(b)).toBe(4);
  });
  it("pickLevel drops lower picks outside a new parent and keeps those inside", () => {
    const r = pickLevel({ ...NO_BAR, nsecs: ["Capital Goods"], ninds: ["Banks", "Finance"] }, "macs", "Financial Services");
    expect(r.bar.nsecs).toEqual([]); expect(r.bar.ninds).toEqual(["Banks", "Finance"]); expect(r.dropped).toEqual(["Capital Goods"]);
  });
});
