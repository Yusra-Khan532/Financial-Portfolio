// @vitest-environment jsdom
// Task #281 round 5: the admin Data health panel shows every fund data gap of the active schemes, with what to run, so a gap shows the next morning.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FundGapsTable } from "./Console";

const G = {
  active: 8345, at: "2026-11-20T13:55:33Z",
  gaps: [
    { key: "exitload", label: "No exit load", count: 8345, of: 8345, among: "active schemes", fix: "AMFI scheme details not read: refresh-portfolios (loads)", examples: ["151130 HSBC Small Cap Fund"] },
    { key: "new", label: "New launch: no score until 12 month-end NAVs", count: 330, of: 3425, among: "active Growth schemes", fix: "nothing to fix: scored by itself after 12 months", examples: [] },
  ],
};

afterEach(cleanup);

describe("fund data gaps on Data health", () => {
  it("lists each gap with its count among the schemes it applies to and what to run", () => {
    render(<FundGapsTable g={G} />);
    expect(screen.getByText("Fund data gaps")).toBeTruthy();
    expect(screen.getByText("No exit load")).toBeTruthy();
    expect(screen.getByText("8,345 of 8,345")).toBeTruthy();
    expect(screen.getByText(/refresh-portfolios \(loads\)/)).toBeTruthy();
    expect(screen.getByText("330 of 3,425").className).not.toContain("neg");   // a new launch is not a fault
  });
  it("an unreadable count says so instead of showing nothing missing", () => {
    render(<FundGapsTable g={null} />);
    expect(screen.getByTestId("fund-gaps").textContent).toMatch(/could not be counted/);
  });
});
