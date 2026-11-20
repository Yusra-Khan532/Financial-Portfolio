// @vitest-environment jsdom
// Task #258 (20 Nov handoff, Advanced screener SPEC §2 and §3): an open Advanced screen lists all 12 / 22 / 59, narrowed only by the parent picked, those on the
// list first by count and the rest under "Not on this list · N", greyed and not clickable; its Prism score panel; the parameters sent to the server.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { NO_BAR, barCount, barParams, type BarFilter, type PresetDetail } from "../../../lib/presets";
import { FilterChips, FilterMenus } from "./ScreenParts";

afterEach(cleanup);
const D = { facets: { sizes: { Large: 2, Mid: 1 }, sectors: [], strong: 1, anyRating: 3, new: 0, ahead: 0, nse: 3, bse: 0,
  macros: [["Financial Services", 2], ["Commodities", 1]], nsecs: [["Financial Services", 2], ["Metals & Mining", 1]], industries: [["Banks", 2], ["Ferrous Metals", 1]],
  ratings: { strong: 1, healthy: 1, average: 0, weak: 1, poor: 0, notrated: 0 }, trend: { st: { su: 1, u: 1, s: 0, d: 1, sd: 0 }, lt: { su: 0, u: 0, s: 1, d: 1, sd: 1 } } } } as unknown as PresetDetail;
let last: BarFilter = NO_BAR;
function F() { const [b, setB] = useState<BarFilter>(NO_BAR); last = b; return <MemoryRouter><FilterMenus d={D} f={{ bar: b, set: setB }} basic={false} onAddRule={() => {}} /><FilterChips f={{ bar: b, set: setB }} basic={false} /></MemoryRouter>; }
const labels = (g: HTMLElement) => within(g).getAllByRole("checkbox").map((c) => c.closest("label")!.textContent);

describe("SPEC §2: every macro sector, sector and industry is listed", () => {
  it("Sector · all 22 — 2 on this list: those on the list first by count, then the rest greyed and not clickable", () => {
    render(<F />);
    fireEvent.click(screen.getByRole("button", { name: "Sector" }));
    expect(document.querySelector(".psx3-lvh")!.textContent).toBe("Sector · all 22 — 2 on this list");
    const g = screen.getByRole("group", { name: "Sector" }), boxes = within(g).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(22);
    expect(labels(g).slice(0, 2)).toEqual(["Financial Services2", "Metals & Mining1"]);
    expect(g.querySelector(".psx3-offh")!.textContent).toBe("Not on this list · 20");
    expect(boxes.slice(2).every((b) => b.disabled)).toBe(true);
  });
  it("a lower list is narrowed only by the parent picked; a pick outside a new parent is taken off and the list says so", () => {
    render(<F />);
    fireEvent.click(screen.getByRole("button", { name: "Industry" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^Banks/ }));
    expect(last.indus).toEqual(["Banks"]);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Macro sector" }));
    expect(within(screen.getByRole("group", { name: "Macro sector" })).getAllByRole("checkbox")).toHaveLength(12);
    fireEvent.click(screen.getByRole("checkbox", { name: /^Commodities/ }));
    expect(last.macros).toEqual(["Commodities"]); expect(last.indus).toEqual([]);
    expect(screen.getByRole("status").textContent).toBe("Banks was taken off: not inside your other choice.");
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Sector" }));
    expect(document.querySelector(".psx3-lvh")!.textContent).toBe("Sector · 4 of 22 — 1 on this list");
    expect(screen.getByRole("group", { name: "Filters on" }).textContent).toContain("Macro sector: Commodities");
  });
});

describe("SPEC §3 on an open screen: the Prism score panel", () => {
  it("rating words, ranges and five trend words, with counts; the button counts what is on and Clear score filters leaves the rest", () => {
    render(<F />);
    fireEvent.click(screen.getByRole("button", { name: "Prism score" }));
    expect(labels(screen.getByRole("group", { name: "Prism fundamental rating" }))).toEqual(["Strong1", "Healthy1", "Average0", "Weak1", "Poor0", "Not rated0"]);
    expect((screen.getByRole("checkbox", { name: /^Average/ }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(screen.getByRole("group", { name: "Prism fundamental rating" })).getByRole("checkbox", { name: /^Strong/ }));
    fireEvent.change(screen.getByLabelText("Risk from"), { target: { value: "65" } });
    fireEvent.change(screen.getByLabelText("Valuation to"), { target: { value: "250" } });
    fireEvent.click(within(screen.getByRole("group", { name: "Short term technical view" })).getByRole("checkbox", { name: /^Uptrend/ }));
    expect(barParams(last)).toEqual(["pl=strong", "zvmax=100", "zrmin=65", "st5=u"]);
    expect(screen.getByRole("button", { name: "Prism score · 4" })).toBeTruthy();
    expect(barCount(last)).toBe(4);
    expect(screen.getByRole("group", { name: "Filters on" }).textContent).toMatch(/Prism rating: Strong.*Valuation: 100 or less.*Risk: 65 or more.*Short term: Uptrend/);
    fireEvent.click(screen.getByRole("button", { name: "Clear score filters" }));
    expect(barParams(last)).toEqual([]);
  });
  it("the server gets the three levels as macro / nsec / indu", () => {
    expect(barParams({ ...NO_BAR, macros: ["Industrials"], nsecs: ["Capital Goods"], indus: ["Electrical Equipment"] })).toEqual(["macro=Industrials", "nsec=Capital%20Goods", "indu=Electrical%20Equipment"]);
  });
});
