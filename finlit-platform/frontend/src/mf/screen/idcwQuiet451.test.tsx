// @vitest-environment jsdom
// Task #451 (team, 28 Nov 2026: "when clicking on the check box we can see this UI issue correct it. the 3rd image shows what we have to remove from the
// content"): on the Mutual Fund Screener an IDCW row's stand-in figures (the same plan's Growth option's returns and score) no longer carry the words
// "Growth option's returns (before payouts)" / "Growth option's score" under them. The figure is in italics with a dotted underline; the words stay in
// the hover text and for screen readers, and the note under the table explains the italics.
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { GROWTH_RETURNS_LABEL, GROWTH_SCORE_LABEL } from "../../lib/mf";
import { parseQuery, type ScreenRow } from "../../lib/mfScreen";
import type { ScoreItem } from "../../lib/mfScore";
import { ScoreCell } from "../ScoreCell";
import { IDCW_NOTE, ResultTable } from "./Results";

afterEach(cleanup);
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
const G = { code: 122639, name: "Parag Parikh Flexi Cap Fund", r1y: 1.0, r3y: 12.5, r5y: 11.7, retDate: "2026-11-26", label: GROWTH_RETURNS_LABEL };
const row = { code: 153964, name: "Parag Parikh Flexi Cap Fund", amc: "PPFAS Mutual Fund", plan: "Regular", option: "Monthly IDCW Payout", optionClass: "IDCW",
  category: "Equity Scheme - Flexi Cap Fund", active: true, nav: 87.8034, navDate: "2026-11-26", r1y: null, r3y: null, r5y: null, ter: 1.29, aum: 147064,
  growthReturns: G, noReturns: null } as unknown as ScreenRow;
const inherited: ScoreItem = { code: 153964, symbol: null, plan: "Regular", group: "EQ-BROAD", final: 63.7, label: "Average", status: "RATED", reason: null, pillars: null,
  rank: null, rankOf: null, flags: [], confidence: 0.9, inherited: { code: 122639, name: "Parag Parikh Flexi Cap Fund", label: GROWTH_SCORE_LABEL, why: "This option pays out." } } as ScoreItem;

function table() {
  return render(<MemoryRouter><ResultTable rows={[row]} q={parseQuery(new URLSearchParams())} onSort={() => {}} loading={false}
    score={{ gold: true, items: new Map([[153964, inherited]]), loading: false }} pick={{ picked: [], onPick: () => {} }} /></MemoryRouter>);
}

describe("task #451: no Growth-option words under an IDCW row's figures on the screener", () => {
  it("the returns show the figure only, in italics, with the words in the hover text and for screen readers", () => {
    const { container } = table();
    const figs = container.querySelectorAll(".mfs-grf451");
    expect(figs.length).toBe(3);
    for (const f of figs) {
      expect(f.querySelector("small"), f.innerHTML).toBeNull();
      expect(f.getAttribute("title")).toContain(GROWTH_RETURNS_LABEL);
      expect(f.querySelector(".sr-only")!.textContent).toContain(GROWTH_RETURNS_LABEL);
    }
    expect(container.querySelector(".mf-gr")).toBeNull();
  });
  it("the score keeps its word but loses the Growth-option line; it is marked and named in the hover text", () => {
    const { container } = table();
    const cell = container.querySelector(".mfs-cell")!;
    expect(cell.querySelector(".mfs-inh")).toBeNull();
    expect(cell.querySelector(".mfs-pv-inh")).toBeTruthy();
    expect(cell.getAttribute("title")).toContain(GROWTH_SCORE_LABEL);
    expect(cell.querySelector(".sr-only")!.textContent).toContain(GROWTH_SCORE_LABEL);
    expect(cell.textContent).toContain("Average");
  });
  it("the note under the table says what the italics mean", () => {
    const { getByTestId } = table();
    expect(getByTestId("plan-note").textContent).toContain(IDCW_NOTE);
  });
  it("other pages keep the visible label (the change is the screener's only)", () => {
    const { container } = render(<ScoreCell item={inherited} locked={false} why="" />);
    expect(container.querySelector(".mfs-inh")!.textContent).toBe(GROWTH_SCORE_LABEL);
    expect(container.querySelector(".mfs-pv-inh")).toBeNull();
  });
  it("the italics style is scoped to the screener table", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/task451.css"), "utf8");
    for (const rule of css.split("}").filter((r) => r.includes("{"))) expect(rule.trim().replace(/\/\*[\s\S]*?\*\//g, "").trim()).toMatch(/^\.mfs-table /);
  });
});
