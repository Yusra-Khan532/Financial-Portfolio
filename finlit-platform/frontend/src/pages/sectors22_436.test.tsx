// @vitest-environment jsdom
// Task #436, bug 3 of the live-site list (27 Nov 2026): Sector Pulse and Sector Rotation said "19 sectors" / "All 19 sectors" while the plans, the landing page and
// the site spec say 22. The founder (28 Nov 2026): "sector count - 22". In the Sectors view every count that names the whole set now says NSE's 22 sectors, and a
// count of the sectors with a reading says so ("19 of the 22 sectors"); the too-small sectors stay listed as too small. The Industries view is unchanged.
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import board from "../lib/__fixtures__/pulse-board-6nov.json";
import rot from "../lib/__fixtures__/rotation-6nov.json";
import history from "../../public/demo/sector-history.json";
import type { Board } from "../lib/sectors";
import type { RotationMap } from "../lib/rotation";
import { renderHook } from "@testing-library/react";
import { useShowWords } from "../lib/groupWords";
import { NSE_SECTOR_COUNT, allChip, allSectors, headline, ofSectors, sectorsIn } from "../lib/pulsePack";

// NSE's own sector names (taxonomy/sectors.csv), put on the fixture's rows: the Sectors view's board has one row per sector, kind "sector"
const SECTOR_NAMES = ["Financial Services", "Healthcare", "Information Technology", "Capital Goods", "Chemicals", "Automobile and Auto Components", "Fast Moving Consumer Goods",
  "Metals & Mining", "Oil, Gas & Consumable Fuels", "Power", "Realty", "Consumer Services", "Consumer Durables", "Construction", "Construction Materials", "Textiles", "Services", "Telecommunication", "Media, Entertainment & Publication"];
const slugOf = (n: string) => n.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const B = board as unknown as Board;
const SB = { ...B, industries: 0, groups: SECTOR_NAMES.length, too_few_stocks: [{ name: "Diversified", slug: "diversified", kind: "sector", stocks_counted: 5 }],
  rows: B.rows.slice(0, SECTOR_NAMES.length).map((r, i) => ({ ...r, name: SECTOR_NAMES[i], slug: slugOf(SECTOR_NAMES[i]), kind: "sector", sector: SECTOR_NAMES[i], industries: r.industries })) } as unknown as Board;
const M = rot as unknown as RotationMap;
const SM = { ...M, rows: M.rows.slice(0, SECTOR_NAMES.length).map((r, i) => ({ ...r, name: SECTOR_NAMES[i], slug: slugOf(SECTOR_NAMES[i]), kind: "sector" })) } as unknown as RotationMap;

const st = vi.hoisted(() => ({ loaded: true as boolean | undefined, asked: [] as string[] }));
const q = (d: unknown) => ({ data: d, isLoading: false, isError: false, error: null, refetch: () => {} });
vi.mock("../lib/sectors", async (orig) => ({ ...(await orig<typeof import("../lib/sectors")>()),
  useSectorBoard: (show = "industries") => { st.asked.push("board:" + show); return q(show === "sectors" ? SB : B); },
  useSectorStatus: () => ({ data: { sectorsViewLoaded: st.loaded }, isLoading: false }) }));
vi.mock("../lib/rotation", async (orig) => ({ ...(await orig<typeof import("../lib/rotation")>()),
  useRotationMap: (show = "industries", enabled = true) => { if (enabled) st.asked.push("rotation:" + show); return q(enabled ? (show === "sectors" ? SM : M) : undefined); } }));
vi.mock("../lib/sectorHistory", async (orig) => ({ ...(await orig<typeof import("../lib/sectorHistory")>()), useSectorHistory: () => ({ data: history }) }));
vi.mock("../lib/sectorExtra", async (orig) => ({ ...(await orig<typeof import("../lib/sectorExtra")>()), useIndustryMap: () => ({ data: undefined }) }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: vi.fn(() => new Promise(() => {})), useSearchIndex: () => ({ data: undefined }) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "gold", upgrade: vi.fn(), has: () => true }), TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { SectorPulsePage } from "./SectorPulse";
import { SectorRotationPage } from "./SectorRotation";

function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; }
beforeEach(() => { localStorage.clear(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); st.loaded = true; st.asked = []; });
afterEach(cleanup);
const at = (el: React.ReactNode, path: string) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}>{el}<Where /></MemoryRouter></QueryClientProvider>);

const N = SECTOR_NAMES.length, T = N + 1;   // the fixture: N sectors with a reading and 1 too small (Diversified)
const text = () => (document.body.textContent ?? "").replace(/\s+/g, " ");
const labels = () => [...document.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") ?? "");
const bare = (n: number) => new RegExp(`(^|[^f] )${n} sectors\\b|All ${n} sectors\\b`);   // "19 sectors" or "All 19 sectors", but not "19 of the 22 sectors"

describe("the words (task #436)", () => {
  it("NSE has 22 sectors; the board's total is the sectors read plus the too-small ones", () => {
    expect(NSE_SECTOR_COUNT).toBe(22);
    expect(sectorsIn(SB)).toBe(T);
    expect(sectorsIn(B)).toBe(22);   // an Industries board falls back to NSE's list
  });
  it("in the Sectors view: '19 of the 22 sectors', 'All 22 sectors' when every one is read, 'All 19 of 22' on a chip", () => {
    const h = renderHook(() => useShowWords("sectors"));
    expect(ofSectors(19, 22)).toBe("19 of the 22 sectors");
    expect(allSectors(19, 22)).toBe("19 of the 22 sectors");
    expect(allSectors(22, 22)).toBe("All 22 sectors");
    expect(allChip(19, 22)).toBe("All 19 of 22");
    expect(allChip(22, 22)).toBe("All 22");
    h.unmount();
  });
  it("in the Industries view the words are as before", () => {
    const h = renderHook(() => useShowWords("industries"));
    expect(allSectors(38)).toBe("All 38 groups");
    expect(allChip(38)).toBe("All 38");
    expect(headline(B.rows, null, null, 22).rest).toMatch(new RegExp(`of ${B.rows.length} groups (is|are) bouncing back`));
    h.unmount();
  });
});

describe("Sector Pulse and Sector Rotation, Sectors view (task #436)", () => {
  it("Sector Pulse names NSE's sectors in full and never 'All N sectors' for the read ones", () => {
    at(<SectorPulsePage />, "/sectors?show=sectors");
    const t = text();
    expect(t).toContain(`NSE's ${T} sectors: ${N} with a reading, 1 too small for one`);
    expect(t).toMatch(new RegExp(`of the ${T} sectors (is|are) bouncing back`));
    expect(t).toContain(`${N} of the ${T} sectors, one square each`);
    expect(t).not.toMatch(bare(N));
    expect(labels().filter((l) => bare(N).test(l))).toEqual([]);
    expect(t).toContain("1 sector too small for a reading");   // the too-small sector is still listed as too small
  });
  it("Sector Rotation says how many of the 22 are ranked and boxed", () => {
    at(<SectorRotationPage />, "/sectors/rotation?show=sectors");
    const t = text();
    expect(t).toMatch(/\d+ of the 22 sectors ranked/);
    expect(t).toContain(`${N} of the 22 sectors by box`);
    expect(t).not.toMatch(bare(N));
    expect(labels().filter((l) => bare(N).test(l))).toEqual([]);
  });
  it("the Industries view keeps its own words", () => {
    at(<SectorPulsePage />, "/sectors?show=industries");
    expect(text()).toContain("as NSE groups them");
    expect(text()).not.toMatch(/of the 22 sectors/);
  });
});
