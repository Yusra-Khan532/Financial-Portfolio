// @vitest-environment jsdom
// Task #325 D2 (developer file 25, section 1 rows 5 to 9 and section 4): options in one line, the summary line, the name's i, Emerging tech with Discover.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ScreenNote, ScreenOptions } from "./ScreenView";
import { SummaryLine } from "./ScreenParts";
import { FilingMenu, advChips } from "./AdvScreenFilters";
import { DiscBlock } from "../ChartPanel";
import { NO_BAR, barCount, barParams, type BarFilter, type PresetChip, type PresetDetail } from "../../../lib/presets";

afterEach(cleanup);
const SUBS: PresetChip[] = [
  { id: "defence", label: "Defence, aerospace and shipbuilding", default: false, description: "Only companies in Defence.", sub: true },
  { id: "ev", label: "EV and batteries", default: false, description: "Only companies in EV.", sub: true },
];
const ALL: PresetChip = { id: "show-all-theme", label: "Show all theme members", default: false, description: "Drops the Growth & Profitability and Risk gates." };

describe("options in one line (row 5)", () => {
  it("Emerging tech: the sub-themes as one group, largest first, with counts and one i; the other option has its own i; no description printed", () => {
    function O() { const [on, setOn] = useState<string[]>([]); return <ScreenOptions chips={[ALL, ...SUBS]} on={on} toggle={(id) => setOn((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))}
      counts={{ "Defence, aerospace and shipbuilding": 12, "EV and batteries": 3 }} />; }
    const { container } = render(<O />);
    const g = screen.getByRole("group", { name: "Screen options" });
    expect(g.querySelector(".psx-optk")!.textContent).toBe("Sub-theme");
    expect(within(g).getAllByRole("button").filter((b) => b.classList.contains("psx-chip")).map((b) => b.textContent))
      .toEqual(["Defence, aerospace and shipbuilding12", "EV and batteries3", "Show all theme members"]);
    expect(within(g).getAllByRole("button", { name: /^About/ }).map((b) => b.getAttribute("aria-label"))).toEqual(["About Sub-themes", "About Show all theme members"]);
    expect(container.textContent).not.toContain("Only companies in");          // descriptions only behind the i
    fireEvent.click(screen.getByRole("button", { name: /^EV and batteries/ }));
    expect(screen.getByRole("button", { name: /^EV and batteries/ }).getAttribute("aria-pressed")).toBe("true");
  });
  it("any other screen: 'Options', each option followed by its i", () => {
    render(<ScreenOptions chips={[{ id: "include-provisional", label: "Include provisional", default: false, description: "Also lists Provisional ratings." }, { id: "all-caps", label: "All caps", default: false, description: "Also small and micro caps." }]} on={["all-caps"]} toggle={() => undefined} />);
    const g = screen.getByRole("group", { name: "Screen options" });
    expect(g.querySelector(".psx-optk")!.textContent).toBe("Options");
    expect([...g.querySelectorAll(".psx-opt1")].map((x) => x.textContent)).toEqual(["Include provisionali", "✓All capsi"]);
  });
});

describe("the summary beside the list date (row 7)", () => {
  it("names the uptrend, downtrend, near-high and Healthy or Strong counts of the list", () => {
    render(<SummaryLine s={{ count: 62, held: 62, up: 24, down: 27, nearHigh: 11, highHeld: 60, sound: 18 }} />);
    expect([...screen.getByLabelText("This list in brief").children].map((x) => x.textContent))
      .toEqual(["24 of 62 in a long-term uptrend", "27 in a downtrend", "11 within 10% of the 52-week high", "18 rated Healthy or Strong"]);
  });
  it("an empty list or no summary shows nothing", () => {
    const { container } = render(<><SummaryLine s={undefined} /><SummaryLine s={{ count: 0, held: 0, up: 0, down: 0, nearHigh: 0, highHeld: 0, sound: 0 }} /></>);
    expect(container.textContent).toBe("");
  });
});

describe("the name's i (row 8)", () => {
  it("holds what the screen lists, a new screen's note and How this screen works", () => {
    const { container } = render(<ScreenNote text="Rated stocks in an uptrend." about={{ shows: "Shows X.", use: ["Use one"] }} how={["Rule one", "Rule two"]} />);
    expect(container.textContent).toBe("What it listsRated stocks in an uptrend.What it showsShows X.How to use itUse oneHow this screen worksRule oneRule two");
  });
});

describe("Emerging tech with Discover (section 4)", () => {
  it("'Filings, 90 days' lists the four kinds with their counts, sends filing=, counts as a filter and shows a removable chip", () => {
    const d = { discover: true, facets: { filings: { order: 5, capacity: 3, partnership: 0, mna: 1 } } } as unknown as PresetDetail;
    function F() { const [b, setB] = useState<BarFilter>(NO_BAR); return <><FilingMenu d={d} bar={b} set={setB} /><output data-testid="p">{barParams(b).join("&")}</output><output data-testid="n">{barCount(b)}</output>
      <span data-testid="c">{advChips(b, setB).map((c) => c.label).join("|")}</span></>; }
    render(<F />);
    fireEvent.click(screen.getByRole("button", { name: /Filings, 90 days/ }));
    expect(screen.getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(["Order win5", "New capacity3", "Partnership0", "Acquisition or merger1"]);
    fireEvent.click(screen.getByRole("checkbox", { name: /Order win/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /New capacity/ }));
    expect(screen.getByTestId("p").textContent).toBe("filing=order,capacity");
    expect(screen.getByTestId("n").textContent).toBe("2");
    expect(screen.getByTestId("c").textContent).toBe("Filings, 90 days: Order win, New capacity");
  });
  it("the chart panel's From Discover block: themes, stage, the four counts, the latest filing and the way to Discover; or why it is not placed", () => {
    render(<MemoryRouter><DiscBlock name="Bharat Shield Ltd" d={{ placed: true, stage: "Under execution", themes: ["Defence & Aerospace", "Electronics"], ev: { order: 2, capacity: 1 },
      latest: { d: "2026-11-18", el: "Order win", t: "Order worth Rs 90 crore", l: "https://nsearchives.nseindia.com/o.pdf" } }} /></MemoryRouter>);
    const b = screen.getByLabelText("From Discover");
    expect([...b.querySelectorAll("dt")].map((x) => x.textContent)).toEqual(["Themes", "Stage it describes", "Filings, 90 days", "Latest filing"]);
    expect([...b.querySelectorAll("dd")].map((x) => x.textContent)).toEqual(["Defence & Aerospace, Electronics", "Under execution",
      "Order win 2 · New capacity 1 · Partnership 0 · Acquisition or merger 0", "Order win, 18 Nov 2026: Order worth Rs 90 crore"]);
    expect(within(b).getByRole("link", { name: "Open in Discover ›" }).getAttribute("href")).toMatch(/^\/discover\/themes\/.+\?q=Bharat%20Shield%20Ltd$/);
    cleanup();
    render(<MemoryRouter><DiscBlock name="X" d={{ placed: false }} /></MemoryRouter>);
    expect(screen.getByLabelText("From Discover").textContent).toBe("From DiscoverNo investor presentation on file yet, so Discover has not placed this company.");
  });
});
