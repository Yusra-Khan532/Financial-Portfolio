// @vitest-environment jsdom
// The two new Sector Pulse charts, on the 6 Nov close state history (the design pack's data).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import data from "../../../public/demo/sector-history.json";
import type { SectorHistory } from "../../lib/sectorHistory";
import { MoodChart, StripChart } from "./PulseCharts";

const H = data as unknown as SectorHistory;
beforeEach(() => { localStorage.clear(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(cleanup);
const at = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("The market's mood, day by day", () => {
  it("draws one stacked column per session, names today's counts for a screen reader and keeps the weekly counts in a closed dropdown", () => {
    at(<MoodChart h={H} />);
    const svg = screen.getByTestId("mood-chart");
    expect(svg.querySelectorAll("g")).toHaveLength(H.dates.length);
    expect(svg.getAttribute("aria-label")).toMatch(/Today: \d+ sold off, \d+ bouncing back, \d+ rising together, \d+ losing steam, \d+ no clear signal/);
    const more = document.querySelector("details.more")!; expect(more.hasAttribute("open")).toBe(false);
    expect(more.querySelector("summary")!.textContent).toBe("See the count, week by week"); expect(more.querySelectorAll("tbody tr")).toHaveLength(H.weeks.length);
  });
  it("shows the server's cards with a word for each kind, an i button, and can be hidden", () => {
    at(<MoodChart h={H} />);
    expect(screen.getByText("Bouncing back now")).toBeTruthy(); expect(screen.getByText("Watch out")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /market's mood/i }).length).toBeGreaterThanOrEqual(2);   // the i button and Hide
    fireEvent.click(screen.getByRole("button", { name: "Hide: The market's mood, day by day" }));
    expect(screen.queryByTestId("mood-chart")).toBeNull(); expect(screen.getByText("Hidden")).toBeTruthy();
  });
});

describe("Six months of every industry", () => {
  it("draws one strip per industry, each with today's state in words", () => {
    at(<StripChart h={H} />);
    const rows = within(screen.getByTestId("strip-chart")).getAllByRole("listitem");
    expect(rows).toHaveLength(H.groups.length); expect(rows[0].textContent).toMatch(/Sold off|Bouncing back|Rising together|Losing steam|No clear signal|–/);
    expect(rows[0].querySelector("svg")!.getAttribute("aria-label")).toMatch(/today$/);
  });
  it("keeps what changed this week in a closed dropdown with the count in its title", () => {
    at(<StripChart h={H} />);
    const more = document.querySelector("details.more")!; expect(more.hasAttribute("open")).toBe(false);
    expect(more.querySelector("summary")!.textContent).toBe(`What changed this week (${H.changed_this_week.length})`);
    expect(more.querySelectorAll("tbody tr")).toHaveLength(H.changed_this_week.length);
  });
  it("uses only the plain state names and no advice wording", () => {
    at(<><MoodChart h={H} /><StripChart h={H} /></>);
    const tx = document.body.textContent ?? "", re = /Washout|Thrust|Confirmed|Fading|\b(?:buy|sell|hold|accumulate|avoid|target|best|worst)\b/, m = re.exec(tx);
    expect(m ? tx.slice(Math.max(0, m.index - 50), m.index + 50) : null).toBeNull();
  });
});
