// @vitest-environment jsdom
// Sector Pulse, the industry page, the stock card and the Learn page, against the real batch output of 29 Oct 2026 (src/lib/__fixtures__/sectors).
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import board from "../lib/__fixtures__/sectors/board.json";
import ferrous from "../lib/__fixtures__/sectors/ferrous-metals.json";
import sambhv from "../lib/__fixtures__/sectors/sambhv.json";
import { ApiError } from "../lib/api";
import { chartGeometry, filterCounts, inFilter, sortRows, type Board, type IndustryPage, type StockSector } from "../lib/sectors";

const st = vi.hoisted(() => ({ board: null as unknown, page: null as unknown, stock: null as unknown }));
const q = (d: unknown) => (d instanceof Error ? { data: undefined, isLoading: false, isError: true, error: d, refetch: () => {} } : { data: d, isLoading: false, isError: false, error: null, refetch: () => {} });
vi.mock("../lib/sectors", async (orig) => ({ ...(await orig<typeof import("../lib/sectors")>()), useSectorBoard: () => q(st.board), useSectorPage: () => q(st.page), useStockSector: () => q(st.stock) }));
vi.mock("../lib/sectorExtra", async (orig) => ({ ...(await orig<typeof import("../lib/sectorExtra")>()), useIndustryMap: () => ({ data: undefined }), useIndustryYear: () => ({ data: undefined }) }));   // the map and the year are tested in ExtraCharts.test.tsx
vi.mock("../lib/sectorHistory", async (orig) => ({ ...(await orig<typeof import("../lib/sectorHistory")>()), useSectorHistory: () => ({ data: undefined }) }));
vi.mock("../lib/leadership", async (orig) => ({ ...(await orig<typeof import("../lib/leadership")>()), useLeadership: () => ({ data: undefined }) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "basic", upgrade: vi.fn(), has: () => true }), TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
vi.mock("../lib/rotation", async (orig) => ({ ...(await orig<typeof import("../lib/rotation")>()), useRotationMap: () => ({ data: undefined, isLoading: false, isError: false }), useRotationCard: () => ({ data: undefined, isLoading: false, isError: false }) }));   // the rotation card has its own tests (Rotation.test.tsx)
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { LearnSectorSignalsPage } from "./LearnSectorSignals";
import { SectorPeersSection, oneLine } from "../stock/SectorPeers";

const B = board as unknown as Board;
const P = ferrous as unknown as IndustryPage;
const S = sambhv as unknown as StockSector;
const basicBoard = (): Board => ({ ...B, rows: B.rows.map((r) => ({ ...r, leader_flags: null })), leader_flags: null, locked: { leader_flags: "silver" } });
const notLoaded = () => new ApiError(503, { status: "not_loaded", reason: "Sector data is not loaded yet: the nightly sector job is switched off on this server." } as never);

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); st.board = B; st.page = P; st.stock = S; });
afterEach(cleanup);
const at = (ui: React.ReactElement, path = "/") => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/sectors/:slug" element={ui} /><Route path="*" element={ui} /></Routes></MemoryRouter>);

describe("helpers", () => {
  it("filters and counts like the design", () => {
    const c = filterCounts(B.rows);
    expect(c).toEqual({ all: 37, thrust: 0, washout: 15, fading: 22, flags: 20 });
    expect(B.rows.filter((r) => inFilter(r, "flags")).every((r) => (r.leader_flags ?? 0) > 0)).toBe(true);
    expect(filterCounts(basicBoard().rows).flags).toBeNull();
  });
  it("sorts with missing values last and keeps the board order for ties", () => {
    const by = sortRows(B.rows, "above_50", "desc");
    expect(by[0].breadth.above_50).toBeGreaterThanOrEqual(by[1].breadth.above_50 ?? 0);
    expect(sortRows(B.rows, "name", "asc")[0].name).toBe([...B.rows].map((r) => r.name).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))[0]);
    expect(sortRows(B.rows, null, "asc").map((r) => r.slug)).toEqual(B.rows.map((r) => r.slug));
    const withNull = sortRows([{ ...B.rows[0], leader_flags: null }, { ...B.rows[1], leader_flags: 3 }], "flags", "asc");
    expect(withNull[0].leader_flags).toBe(3);
  });
  it("places every band and event of the chart on the history", () => {
    const g = chartGeometry(P, 40, 880, 20, 300);
    expect(g.bandRects.length).toBe(P.bands.length);
    expect(g.marks.length).toBe(P.events.filter((e) => P.history.dates.includes(e.date)).length);
    expect(g.path(P.history.above_50).startsWith("M")).toBe(true);
    expect(g.y(0)).toBe(300); expect(g.y(100)).toBe(20);
  });
});

// Sector Pulse itself (the final pages pack) is tested in SectorPulse.test.tsx.

// The industry page itself (the final pages pack) is tested in SectorIndustry.test.tsx.

describe("stock page section", () => {
  it("adds the rotation line under the industry's state, from sector.rotation", () => {
    st.stock = { ...S, rotation: { corner: "ahead_slowing", corner_name: "Ahead but slowing", weeks_in_corner: 1, this_week_reading_name: "Ahead and gaining", rank: 7, ranked: 37, rank_change_1w: 1, rank_change_4w: -3, strength_pts: 7.8, change_pts: -2.1, breadth: "narrow", breadth_name: "Narrow" } };
    render(<MemoryRouter><SectorPeersSection symbol="SAMBHV" name="Sambhv Steel Tubes" /></MemoryRouter>);
    const line = screen.getByTestId("stock-rotation");
    expect(line.textContent).toContain("Against other industries:"); expect(line.textContent).toContain("Ahead but slowing"); expect(line.textContent).toContain("7 of 37");
    expect(line.textContent).toContain("+7.8 pts"); expect(line.textContent).toContain("New this week; this week reads Ahead and gaining"); expect(line.textContent).toContain("Past returns, not a forecast");
  });
  it("writes the one line and the two cards from the sector JSON", () => {
    expect(oneLine("SAMBHV", S)).toBe("SAMBHV is in the top quarter of Industrial Products stocks over 6 months (+32.4%), and the industry as a whole is in a Washout while the Nifty 50 is below its 200-day exponential average.");
    render(<MemoryRouter><SectorPeersSection symbol="SAMBHV" name="Sambhv Steel Tubes" /></MemoryRouter>);
    const t = screen.getByTestId("sector-peers").textContent ?? "";
    expect(t).toContain("20th of 105 counted Industrial Products stocks by 6-month return");
    expect(t).toContain("−4.1%"); expect(t).toContain("105 of 219");
    expect(t).toContain("No leader flag.");
    expect(screen.getByRole("link", { name: "Open the Industrial Products page" }).getAttribute("href")).toBe("/sectors/industrial-products");
    expect(t).toContain("not a recommendation");
  });
  it("below Gold: the industry's state and what Gold adds, no rank", () => {
    st.stock = { symbol: "SAMBHV", name: "Sambhv Steel Tubes Limited", group: { ...S.group!, summary: undefined }, in_group: null, locked: { stock: "gold" } };
    render(<MemoryRouter><SectorPeersSection symbol="SAMBHV" name="Sambhv" /></MemoryRouter>);
    const t = screen.getByTestId("sector-peers").textContent ?? "";
    expect(t).toContain("The Sector & peers cards are part of the Gold plan"); expect(t).toContain("Sold off"); expect(t).not.toContain("20th of");
  });
  it("not counted, unclassified and unavailable each say why", () => {
    st.stock = { ...S, in_group: false, note: "Not counted: traded value under Rs 1 crore a day.", not_counted_because: ["median traded value under Rs 1 crore a day"] };
    render(<MemoryRouter><SectorPeersSection symbol="X" name="X" /></MemoryRouter>);
    expect(screen.getByText("Not counted: traded value under Rs 1 crore a day.")).toBeTruthy();
    cleanup();
    st.stock = { symbol: "NEWCO", group: null, in_group: false, note: "Industry not yet classified.", locked: {} };
    render(<MemoryRouter><SectorPeersSection symbol="NEWCO" name="Newco" /></MemoryRouter>);
    expect(screen.getAllByText(/Industry not yet classified/).length).toBeGreaterThan(0);
    cleanup();
    st.stock = notLoaded();
    render(<MemoryRouter><SectorPeersSection symbol="X" name="X" /></MemoryRouter>);
    expect(screen.getByTestId("sector-blank").textContent).toContain("Sector data is not loaded yet");
  });
});

describe("Learn page", () => {
  it("explains the states, the three bars, the market backdrop and leader flags without a rule or a study figure", () => {
    at(<LearnSectorSignalsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "How to use Sector Pulse" })).toBeTruthy();
    for (const h of ["What Sector Pulse shows", "The four things to read", "On an industry page", "Good habits"]) expect(screen.getByRole("heading", { name: h })).toBeTruthy();
    const t = document.body.textContent ?? "";
    expect(t).toContain("Sold off"); expect(t).toContain("Bouncing back after a crash"); expect(t).not.toMatch(/Washout|Thrust|Fading/); expect(t).toMatch(/not a recommendation/i);
    expect(t).not.toMatch(/\b(study|threshold|40%|70%|126-session|252-session)\b/i);
  });
});
