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

const rotationCard = vi.hoisted(() => vi.fn((): unknown => undefined));
const st = vi.hoisted(() => ({ board: null as unknown, page: null as unknown, stock: null as unknown }));
const q = (d: unknown) => (d instanceof Error ? { data: undefined, isLoading: false, isError: true, error: d, refetch: () => {} } : { data: d, isLoading: false, isError: false, error: null, refetch: () => {} });
vi.mock("../lib/sectors", async (orig) => ({ ...(await orig<typeof import("../lib/sectors")>()), useSectorBoard: () => q(st.board), useSectorPage: () => q(st.page), useStockSector: () => q(st.stock) }));
vi.mock("../lib/sectorExtra", async (orig) => ({ ...(await orig<typeof import("../lib/sectorExtra")>()), useIndustryMap: () => ({ data: undefined }), useIndustryYear: () => ({ data: undefined }) }));   // the map and the year are tested in ExtraCharts.test.tsx
vi.mock("../lib/sectorHistory", async (orig) => ({ ...(await orig<typeof import("../lib/sectorHistory")>()), useSectorHistory: () => ({ data: undefined }) }));
vi.mock("../lib/leadership", async (orig) => ({ ...(await orig<typeof import("../lib/leadership")>()), useLeadership: () => ({ data: undefined }) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "basic", upgrade: vi.fn(), has: () => true }), TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
vi.mock("../lib/rotation", async (orig) => ({ ...(await orig<typeof import("../lib/rotation")>()), useRotationMap: () => ({ data: undefined, isLoading: false, isError: false }), useRotationCard: () => ({ data: rotationCard(), isLoading: false, isError: false }) }));   // the rotation card has its own tests (Rotation.test.tsx)
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../lib/planScore", async (orig) => ({ ...(await orig<typeof import("../lib/planScore")>()), usePlanModel: () => "iq", usePlanPrism: () => ({}) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), usePrice: () => ({ data: undefined }) }));
import { LearnSectorSignalsPage } from "./LearnSectorSignals";
import { WhereStands } from "../stock/pack/WhereStands";

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

// "Where it stands" (final pages pack, board 17) replaced the stock page's Sector & peers section: its industry tab, from the same sector JSON.
const SUM = { returns: [], quote: { price: 100, high52: 120, marketCapCr: 8000 }, keyMetrics: [] } as never;
const where = (sym = "SAMBHV", name = "Sambhv Steel Tubes") => render(<MemoryRouter><WhereStands symbol={sym} name={name} s={SUM} /></MemoryRouter>);
describe("stock page section", () => {
  it("shows the industry's rotation box, rank, figures and the box that may change", () => {
    st.stock = { ...S, rotation: null };
    vi.mocked(rotationCard).mockReturnValue({ corner: "ahead_slowing", corner_name: "Ahead but slowing", weeks_in_corner: 1, this_week_reading_name: "Ahead and gaining", rank: 7, ranked: 37, rank_change_1w: 1, rank_change_4w: -3, strength_pts: 7.8, change_pts: -2.1 });
    where();
    const t = screen.getByTestId("where-stands").textContent ?? "";
    expect(t).toContain("Sector Rotation · the last few months"); expect(t).toContain("7 of 37 ▲1"); expect(t).toContain("+7.8 pts"); expect(t).toContain("−2.1 pts");
    expect(t).toContain("May change box next week"); expect(t).toContain("This week's reading is Ahead and gaining");
    vi.mocked(rotationCard).mockReturnValue(undefined);
  });
  it("writes where the stock ranks inside its industry, from the sector JSON", () => {
    where();
    const t = screen.getByTestId("where-stands").textContent ?? "";
    expect(t).toContain("Where Sambhv Steel Tubes stands"); expect(t).toContain("20th of 105");
    expect(t).toContain("Inside its industry: 6-month return"); expect(t).toContain("Sector Pulse · the last few days");
    expect(screen.getByRole("link", { name: /Open the .* page/ }).getAttribute("href")).toBe("/sectors/industrial-products");
    expect(t).toContain("not a recommendation");
  });
  it("below Gold: the industry's state and what Gold adds, no rank", () => {
    // below Gold the stock's sector answer leaves out the breadth figures: they come from the industry page, which every plan sees
    st.stock = { symbol: "SAMBHV", name: "Sambhv Steel Tubes Limited", group: { ...S.group!, summary: undefined, breadth: undefined, stocks_counted: undefined }, in_group: null, locked: { stock: "gold" } };
    where("SAMBHV", "Sambhv");
    expect(screen.getByTestId("where-stands").textContent).toContain(`${P.stocks_counted} of ${P.stocks_listed}`);
    const t = screen.getByTestId("where-stands").textContent ?? "";
    expect(t).toContain("Where the stock ranks inside its industry is part of the Gold plan"); expect(t).not.toContain("20th of");
  });
  it("not counted, unclassified and unavailable each say why", () => {
    st.stock = { ...S, in_group: false, rank_6m: null, note: "Not counted: traded value under Rs 1 crore a day." };
    st.page = { ...P, stocks: null };
    where("X", "X");
    expect(screen.getByText("Not counted: traded value under Rs 1 crore a day.")).toBeTruthy();
    cleanup();
    st.stock = { symbol: "NEWCO", group: null, in_group: false, note: "Industry not yet classified.", locked: {} };
    where("NEWCO", "Newco");
    expect(screen.getAllByText(/Industry not yet classified/).length).toBeGreaterThan(0);
    cleanup();
    st.stock = notLoaded();
    where("X", "X");
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
