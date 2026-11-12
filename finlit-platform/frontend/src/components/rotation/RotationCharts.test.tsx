// @vitest-environment jsdom
// The two new Sector Rotation charts, against the real nightly output of 29 Oct 2026.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import map from "../../lib/__fixtures__/rotation/map.json";
import { changedDirection, lastMonth, sixMonth, type RotationMap } from "../../lib/rotation";
import { AheadChart, RankSixMonths } from "./RotationCharts";

const M: RotationMap = {
  ...(map as unknown as RotationMap),
  insights: { ahead: [{ kind: "watch", title: "Leaders that slipped last month", text: "A and B are still ahead over six months but behind over the last month." }, { kind: "insight", title: "The biggest move last month", text: "IT moved 9.3 points ahead." }], ranks: [{ kind: "good", title: "Biggest climb", text: "X climbed 27 places." }] },
};
beforeEach(() => { localStorage.clear(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(cleanup);
const at = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("Who is ahead, and which way they are moving", () => {
  it("draws one row per industry with its six-month and last-month figures, and marks each change of direction", () => {
    at(<AheadChart m={M} />);
    const rows = within(screen.getByTestId("ahead-chart")).getAllByRole("listitem");
    const usable = M.rows.filter((r) => sixMonth(r) != null && lastMonth(r) != null);
    expect(rows).toHaveLength(usable.length);
    expect(screen.getByTestId("ahead-chart").querySelectorAll(".rc-turn")).toHaveLength(usable.filter(changedDirection).length);
    expect(rows[0].textContent).toMatch(/[+−]\d+\.\d/);
  });
  it("shows the server's insight cards with a word for each kind, and keeps the numbers in a dropdown that is closed", () => {
    at(<AheadChart m={M} />);
    expect(screen.getByText("Leaders that slipped last month")).toBeTruthy(); expect(screen.getByText("Watch out")).toBeTruthy(); expect(screen.getByText("Insight")).toBeTruthy();
    const more = document.querySelector("details.more")!; expect(more.hasAttribute("open")).toBe(false);
    expect(more.querySelector("summary")!.textContent).toMatch(/^Industries that changed direction \(\d+\)$/);
  });
  it("has an i button and can be hidden", () => {
    at(<AheadChart m={M} />);
    expect(screen.getByRole("button", { name: /who is ahead/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide: Who is ahead, and which way they are moving" }));
    expect(screen.queryByTestId("ahead-chart")).toBeNull(); expect(screen.getByText("Hidden")).toBeTruthy();
  });
  it("draws nothing when the run has no figures", () => {
    at(<AheadChart m={{ ...M, rows: M.rows.map((r) => ({ ...r, vs_average: {} })) }} />);
    expect(screen.queryByTestId("ahead-chart")).toBeNull();
  });
});

describe("Six months of ranks", () => {
  it("lists every ranked industry in today's order with its first and latest rank", () => {
    at(<RankSixMonths m={M} />);
    const rows = within(screen.getByTestId("ranks-chart")).getAllByRole("listitem");
    expect(rows.length).toBe(M.rows.length); expect(rows[0].textContent).toMatch(/^1\./); expect(rows[0].textContent).toMatch(/\d+ → 1/);
    expect(screen.getByText("Biggest climb")).toBeTruthy(); expect(screen.getByText("Good sign")).toBeTruthy();
  });
  it("keeps the climbers and fallers table in a closed dropdown", () => {
    at(<RankSixMonths m={M} />);
    const more = document.querySelector("details.more")!; expect(more.hasAttribute("open")).toBe(false);
    expect(more.querySelector("summary")!.textContent).toBe("Biggest climbers and fallers over 26 weeks"); expect(more.querySelectorAll("tbody tr").length).toBeGreaterThanOrEqual(5);
  });
  it("uses no advice wording", () => {
    at(<><AheadChart m={M} /><RankSixMonths m={M} /></>);
    expect(document.body.textContent).not.toMatch(/\b(buy|sell|hold|accumulate|avoid|target|best|worst|signal)\b/i);
  });
});
