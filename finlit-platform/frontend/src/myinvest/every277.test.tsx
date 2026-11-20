// @vitest-environment jsdom
// Task #277 (All my investments pack of 20 Nov 2026, change 18 and README check 17): Step 4's filter row: Find a company · Held · Size · FinLit Prism ·
// Against peers across every company. The fixture is the live page's 430 companies of 20 Nov (as the pack's mockup carries them, every-20nov.json).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Company } from "../lib/myInvest";
import EVERY from "./every-20nov.json";
import { FilterRow, NO_FILTER, SectionsMenu, choicesOf, filterCompanies, type EveryFilter } from "./EveryFilters";

afterEach(cleanup);
const ROWS = EVERY as unknown as Company[];
let last: EveryFilter = NO_FILTER;
function Row({ plan = "gold" as "gold" | "silver" }) { const [f, setF] = useState<EveryFilter>(NO_FILTER); last = f; return <FilterRow rows={ROWS} f={f} set={setF} plan={plan} />; }

describe("Step 4's filter row (change 18)", () => {
  it("README check 17: Held: more than one way leaves 17 of 430", () => {
    expect(ROWS).toHaveLength(430);
    expect(filterCompanies(ROWS, { ...NO_FILTER, held: ["More than one way"] })).toHaveLength(17);
    render(<Row />);
    expect(screen.getByText("430 companies")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Held: All" }));
    const menu = screen.getByRole("group", { name: "Held" });
    expect(within(menu).getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(["More than one way17", `Only direct${ROWS.filter((c) => c.held.join("") === "D").length}`, `Only through funds and ETFs${ROWS.filter((c) => !c.held.includes("D")).length}`]);
    fireEvent.click(within(menu).getByRole("checkbox", { name: /More than one way/ }));
    expect(screen.getByRole("button", { name: "Held: More than one way" }).className).toContain("on");
    expect(screen.getByText("Showing 17 of 430")).toBeTruthy();
  });
  it("each choice counts what it would leave given the other filters; a zero choice is greyed; several picks name the count", () => {
    render(<Row />);
    fireEvent.click(screen.getByRole("button", { name: "Size: All" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^Large/ })); fireEvent.click(screen.getByRole("checkbox", { name: /^Mid/ }));
    expect(screen.getByRole("button", { name: "Size: 2 picked" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Size: 2 picked" }));   // Esc closes and returns focus
    fireEvent.click(screen.getByRole("button", { name: "Against peers: All" }));
    const lm = filterCompanies(ROWS, { ...NO_FILTER, size: ["Large", "Mid"] });
    const lead = screen.getByRole("checkbox", { name: /^Leader/ }).closest("label")!.textContent;
    expect(lead).toBe(`Leader${lm.filter((c) => c.peer === "Leader").length}`);
  });
  it("one chip per choice with ×, the search text as a chip, Clear filters", () => {
    render(<Row />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a company you own" }), { target: { value: "bank" } });
    fireEvent.click(screen.getByRole("button", { name: "FinLit Prism: All" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^Weak/ }));
    const chips = screen.getByRole("group", { name: "Filters on" });
    expect(chips.textContent).toContain("“bank”"); expect(chips.textContent).toContain("Weak");
    fireEvent.click(within(chips).getByRole("button", { name: "Remove Weak" }));
    expect(last.prism).toEqual([]);
    fireEvent.click(within(screen.getByRole("group", { name: "Filters on" })).getByRole("button", { name: "Clear filters" }));
    expect(last).toEqual(NO_FILTER);
  });
  it("FinLit IQ words on Silver; every choice list ends with the blank's own name", () => {
    expect(choicesOf("prism", "silver", ROWS)).toEqual(["Strong", "Healthy", "Mixed", "Watch", "Average", "Weak", "Poor", "No reading"].filter((x, i, a) => a.indexOf(x) === i && (["Strong", "Healthy", "Mixed", "Watch", "No reading"].includes(x) || ROWS.some((c) => c.label === x))));
    expect(choicesOf("size", "gold", ROWS).at(-1)).toBe("Not sized");
    render(<Row plan="silver" />);
    expect(screen.getByRole("button", { name: "FinLit IQ: All" })).toBeTruthy();
  });
  it("Sections ▾: the view's sections with their numbers, You are here, All sections", () => {
    const go: string[] = [];
    render(<SectionsMenu items={[{ id: "a", n: 1, label: "Your money" }, { id: "b", n: 4, label: "Every company" }]} here="b" go={(id) => go.push(id)} all={() => go.push("top")} />);
    fireEvent.click(screen.getByRole("button", { name: /Sections/ }));
    expect(screen.getByRole("button", { name: /Every company/ }).textContent).toContain("You are here");
    fireEvent.click(screen.getByRole("button", { name: /Your money/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sections/ })); fireEvent.click(screen.getByRole("button", { name: "All sections" }));
    expect(go).toEqual(["a", "top"]);
  });
});
