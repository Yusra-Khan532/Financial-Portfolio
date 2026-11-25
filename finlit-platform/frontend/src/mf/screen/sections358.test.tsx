// @vitest-environment jsdom
// Task #358 (team, 23 Nov 2026): (1) the screener's filter groups under four headings, as the team's picture: Start here · what and how (Type and category,
// Sub-category, Plan, option and status), Quick shortlist (the Mutual Fund Score), Risk, returns and cost, Narrow down (the rest); (2) each score range
// has a two-handle slider in step with Min and Max (a part snaps to its band edges); (3) the four parts inside the Mutual Fund Score cell, no new column.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { GROUPS } from "./Panel";
import { ScoreFilters } from "./ScoreFilter";
import { Parts, ScoreCell } from "../ScoreCell";
import { DEFAULTS, withScore, type SQ } from "../../lib/mfScreen";

afterEach(cleanup);
describe("task #358: sections", () => {
  it("orders the groups as the picture: what and how, the score, risk/returns/cost, then the rest", () => {
    expect(GROUPS.map((g) => g.id)).toEqual(["type", "subcat", "plan", "score", "risk", "returns", "cost", "size", "house", "cap", "style", "mat", "struct", "portfolio", "tags", "market", "checklist"]);   // task #368: "Data quality and lists" removed
  });
});

let last: SQ = DEFAULTS;
function H() { const [q, setQ] = useState<SQ>(DEFAULTS); last = q; return <MemoryRouter><ScoreFilters sc={q.sc} canScore onSet={(f, lo, hi) => setQ((s) => withScore(s, f, lo, hi))} /></MemoryRouter>; }
describe("task #358: score sliders", () => {
  it("the total's slider sets a free range and applies on release", () => {
    render(<H />);
    const lo = screen.getByRole("slider", { name: "Total score, minimum" }), hi = screen.getByRole("slider", { name: "Total score, maximum" });
    fireEvent.change(lo, { target: { value: "62.5" } }); fireEvent.pointerUp(lo);
    expect(last.sc).toEqual({ total: ["62.5", ""] });
    fireEvent.change(hi, { target: { value: "90" } }); fireEvent.pointerUp(hi);
    expect(last.sc).toEqual({ total: ["62.5", "90"] });
    expect((within(screen.getByRole("region", { name: /^Total score/ })).getByLabelText("Min") as HTMLInputElement).value).toBe("62.5");
  });
  it("a part's slider moves between its band edges only", () => {
    render(<H />);
    const lo = screen.getByRole("slider", { name: "Risk, minimum" });
    expect(lo.getAttribute("max")).toBe("3");
    fireEvent.change(lo, { target: { value: "2" } }); fireEvent.keyUp(lo);
    expect(last.sc).toEqual({ risk: ["70", ""] });
    expect(lo.getAttribute("aria-valuetext")).toBe("70");
  });
});

describe("task #358: the four parts in the score cell", () => {
  it("shows P R C Q tinted by their words, the words in the tooltip, inside the score cell", () => {
    render(<ScoreCell locked={false} why="" item={{ code: 1, symbol: null, plan: "Direct", group: "EQ", final: 72.4, label: "Healthy", status: "RATED", reason: null, rank: null, rankOf: null, flags: [], confidence: null,
      pillars: { performance: "Strong", risk: "Fair", cost: "Weak", quality: "Not scored" } }} />);
    const parts = document.querySelector(".mfs-cell .mfs-parts")!;
    expect([...parts.querySelectorAll(".mfs-part")].map((x) => `${x.textContent}:${x.className.split(" ")[1]}`)).toEqual(["P:b-hi", "R:b-mid", "C:b-lo", "Q:b-na"]);
    // task #371 replaced the one tooltip on the group with one per letter (same words); the group keeps them for screen readers
    expect(parts.getAttribute("aria-label")).toBe("The four parts. Performance: Strong · Risk: Fair · Cost: Weak · Quality: Not scored");
  });
  it("draws nothing without the parts (locked or no score)", () => {
    const { container } = render(<Parts parts={null} />);
    expect(container.innerHTML).toBe("");
  });
});
