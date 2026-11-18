// @vitest-environment jsdom
// Task #194 (pack finlit-latest-results-15nov): the shared tile and card dropdowns, the quarter menu, and the Industries table with its row drawer.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuarterPicker, QuarterTiles } from "./QuarterTop";
import type { QResp } from "../../../lib/qresults";

vi.mock("../../../lib/watchlist", () => ({ useWatchlist: () => ({ lists: [{ symbols: ["TCS"] }] }) }));
vi.mock("../../../lib/portfolio", () => ({ usePortfolio: () => ({ holdings: [] }) }));
vi.mock("../../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../../../lib/taxonomy", () => ({ useNseName: () => (n: string) => (n === "Paper Forest & Jute Products" ? "Paper, Forest & Jute Products" : n) }));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-query")>()), useQuery: () => ({ data: { groups: { TCS: { name: "IT - Software" } } } }) }));
vi.mock("../../../lib/rotation", () => ({ useRotationMap: () => ({ data: { rows: [{ name: "Finance", corner: "behind_slipping" }, { name: "IT - Software", corner: "ahead_gaining" }] } }) }));
vi.mock("../../../lib/sectors", () => ({ useSectorBoard: () => ({ data: { rows: [
  { name: "Finance", kind: "industry", state_code: "thrust_cap" }, { name: "IT - Software", kind: "industry", state_code: "washout" },
  { name: "Paper Forest & Jute Products", kind: "industry", state_code: "fading" }] } }) }));
vi.mock("../../../lib/qresults", async (orig) => ({ ...(await orig<typeof import("../../../lib/qresults")>()),
  useQuarterResults: () => ({ data: { locked: false, rows: [{ symbol: "BAJFINANCE", cap: "Large", revenueYoY: 21.6, profitYoY: 28.5, verdict: "Good", hasNumbers: true }] }, isLoading: false }) }));
import { IndustriesView, type Ind } from "./IndustriesView";

afterEach(cleanup);
const ind = (name: string, o: Partial<Ind> = {}): Ind => ({ name, companies: 60, declared: 60, withNumbers: 60, medianRevenueYoY: 18.8, medianProfitYoY: 21.5, beatShare: 41, vsMarket: "Ahead",
  revenueUpShare: 77, profitUpShare: 77, marginUpShare: 57, medianNpmChange: 0.5, market: { medianRevenueYoY: 16.8, medianProfitYoY: 11.1, medianNpmChange: -0.3 }, ...o });

describe("the six tiles on the shared DropTile", () => {
  const sum = { companies: 5175, declared: 5166, due: 9, awaiting: 0, withNumbers: 4156, flagged: 0, medianRevenueYoY: 16.8, medianProfitYoY: 11.1, profitUpShare: 58.1, marginUpShare: 45.4, beatShare: 34.1, nRevenue: 3659, nProfit: 2890, nMargin: 3000 };
  const r = { plan: "gold", locked: false, today: "2026-11-17", quarter: { key: "2026-09", label: "Jul to Sep 2026", fiscal: "Q2 FY27", periodEnd: "2026-09-30", from: "", to: "" },
    quarters: [{ key: "2026-09", label: "Jul to Sep 2026", fiscal: "Q2 FY27", total: 5175, declared: 5166, due: 9, periodEnd: "", from: "", to: "" }, { key: "2026-06", label: "Apr to Jun 2026", fiscal: "Q1 FY27", total: 1643, declared: 1643, due: 0, periodEnd: "", from: "", to: "" }],
    totals: sum, summary: sum } as unknown as QResp;
  it("draws six coloured tiles with the pill, and a By size panel that floats and closes on Escape or a click outside", () => {
    render(<MemoryRouter><QuarterTiles r={r} /></MemoryRouter>);
    const tiles = document.querySelectorAll(".rs-q6 > .dtl");
    expect(tiles).toHaveLength(6);
    expect(Array.from(tiles).map((t) => t.className.split(" ")[1])).toEqual(["dtl-blue", "dtl-green", "dtl-green", "dtl-green", "dtl-gold", "dtl-gold"]);
    const profit = screen.getByTestId("qt-medianProfitYoY");
    expect(profit.querySelector(".dtl-n.dtl-good")!.textContent).toBe("+11.1%");
    const btn = within(profit).getByRole("button", { name: /By size/ });
    fireEvent.click(btn);
    const pane = within(profit).getByRole("region");
    expect(pane.className).toBe("dtl-panel");   // absolutely placed (droptile.css), so the tile keeps its height
    expect(within(pane).getAllByRole("row")[0].textContent).toBe("SizeTypical profit growth");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(pane.hidden).toBe(true);
    fireEvent.click(btn); fireEvent.mouseDown(document.body);
    expect(pane.hidden).toBe(true);
  });
});

describe("the cards (the dashboard's shared dropdown cards)", () => {
  it("shows only the kind and headline until the chevron opens the line and every group; Open all / Close all", () => {
    render(<MemoryRouter><IndustriesView inds={[ind("Finance"), ind("Chemicals"), ind("Realty", { vsMarket: "Behind" })]} /></MemoryRouter>);
    const good = screen.getByRole("button", { name: /2 groups are ahead of the market/ });
    expect(good.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(good);
    expect(good.getAttribute("aria-expanded")).toBe("true");
    const body = document.getElementById(good.getAttribute("aria-controls")!)!;
    expect(body.textContent).toMatch(/Their typical company grew revenue and profit faster.*All 2.*Chemicals.*Finance/);
    expect(within(body).getByRole("link", { name: "Chemicals" }).getAttribute("href")).toBe("/results/quarter?industry=Chemicals");
    fireEvent.click(screen.getByRole("button", { name: "Open all" }));
    expect(screen.getAllByRole("button", { expanded: true }).filter((b) => b.className === "dsh-ic-row")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Close all" }));
    expect(screen.queryAllByRole("button", { expanded: true }).filter((b) => b.className === "dsh-ic-row")).toHaveLength(0);
  });
});

describe("the quarter dropdown", () => {
  const q = (key: string, fiscal: string, label: string, total: number, due = 0) => ({ key, fiscal, label, total, declared: total - due, due, periodEnd: "", from: "", to: "" });
  const quarters = [q("2026-09", "Q2 FY27", "Jul to Sep 2026", 5175, 10), q("2026-06", "Q1 FY27", "Apr to Jun 2026", 1643), q("2025-06", "Q1 FY26", "Apr to Jun 2025", 3)];
  it("is one button with the quarter, its months and counts; the menu bars each quarter and marks the partial ones", () => {
    const pick = vi.fn();
    render(<QuarterPicker quarters={quarters} current="2026-09" onPick={pick} />);
    const btn = screen.getByRole("button", { name: /Quarter/ });
    expect(btn.textContent).toBe("Q2 FY27Jul–Sep 20265,165 out · 10 due");
    fireEvent.click(btn);
    const menu = screen.getByRole("listbox", { name: "Quarter" });
    expect(menu.textContent).toContain("Older quarters are only partly loaded.");
    const opts = within(menu).getAllByRole("option");
    expect(opts.map((o) => o.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(opts.map((o) => o.querySelector(".pt")!.textContent)).toEqual(["", "", "Partial"]);
    expect(opts[1].textContent).toContain("1,643 out");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(btn); fireEvent.click(within(screen.getByRole("listbox")).getAllByRole("option")[1]);
    expect(pick).toHaveBeenCalledWith("2026-06");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("the Industries table", () => {
  const inds = [ind("IT - Software", { companies: 150, declared: 150, withNumbers: 150, vsMarket: "Behind" }), ind("Finance"), ind("Paper, Forest & Jute Products", { declared: 24, companies: 24, withNumbers: 24 }), ind("Diversified", { declared: 9, companies: 9, withNumbers: 9 })];
  const view = () => render(<MemoryRouter><IndustriesView inds={inds} /></MemoryRouter>);
  it("groups its headers in three bands with the new names", () => {
    view();
    const t = document.querySelector("table.rs-it") as HTMLElement;
    const [bands, cols] = within(t).getAllByRole("row");
    expect(Array.from(bands.querySelectorAll("th.kit-band")).map((x) => x.textContent)).toEqual(["Results this quarter", "Share prices now", "Together"]);
    expect(Array.from(cols.querySelectorAll("th")).map((x) => x.textContent?.replace(/[↕▲▼]/g, ""))).toEqual(["Group", "Vs marketi", "Revenue growthi", "Profit growthi", "Beat their industryi", "Sector Rotationi", "Sector Pulsei", "Results and pricesi"]);
    expect(t.textContent).not.toMatch(/Doing well|Agree\?|Share prices[^ ]/);
    expect(cols.querySelectorAll("th[aria-sort] button.ts-b")).toHaveLength(8);   // task #224: every heading sorts
  });
  it("opens Finance under its own row by default, one row at a time, by click, Enter or Space", () => {
    view();
    const rowOf = (n: string) => screen.getByRole("row", { name: new RegExp(`^${n}:`) });
    expect(rowOf("Finance").getAttribute("aria-expanded")).toBe("true");
    expect(rowOf("Finance").nextElementSibling!.className).toBe("rs-drawer");
    expect(rowOf("Finance").nextElementSibling!.textContent).toMatch(/How its companies did.*Typical company.*Biggest companies that declared.*All 60 companies in Finance →/);
    fireEvent.click(rowOf("IT - Software"));
    expect(rowOf("IT - Software").getAttribute("aria-expanded")).toBe("true");
    expect(rowOf("Finance").getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelectorAll(".rs-drawer")).toHaveLength(1);
    fireEvent.keyDown(rowOf("Finance"), { key: "Enter" });
    expect(rowOf("Finance").getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(rowOf("Finance"), { key: " " });
    expect(document.querySelectorAll(".rs-drawer")).toHaveLength(0);
  });
  it("shows Rotation and Pulse each as a coloured chip, a reason where there is no reading, and a blue Yours pill", () => {
    view();
    const cells = (n: string) => Array.from(screen.getByRole("row", { name: new RegExp(`^${n}:`) }).querySelectorAll("td"));
    expect(cells("Finance")[5].querySelector(".sp-chip")!.textContent).toContain("Behind and slipping");
    expect(cells("Finance")[6].querySelector(".rs-pchip.rs-p-teal")!.textContent).toBe("Bouncing back after a crash");
    expect(cells("IT - Software")[6].querySelector(".rs-pchip.rs-p-bad")!.textContent).toBe("Sold off");
    expect(cells("Paper, Forest & Jute Products")[6].querySelector(".rs-pchip.rs-p-gold")).toBeTruthy();   // found whatever the commas
    expect(cells("Diversified")[5].textContent).toBe("No reading"); expect(cells("Diversified")[6].textContent).toBe("Too small for a reading");
    expect(cells("IT - Software")[0].querySelector(".rs-yours")!.textContent).toBe("Yours");
  });
});
