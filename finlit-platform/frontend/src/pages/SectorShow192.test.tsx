// @vitest-environment jsdom
// Task #192, S1 (SECTOR-PAGES.md): "Show: Sectors | Industries" on Sector Pulse and Sector Rotation. A switch in the top bar between the page tabs and View, styled
// like the View pills; Sectors is the default; shared by both pages and kept in the link; the words change from "industry" to "sector" everywhere; both views
// are measured against the same yardstick. The Sectors view's data is the server's (GET /api/sectors?show=sectors), never a figure from the pictures.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import board from "../lib/__fixtures__/pulse-board-6nov.json";
import rot from "../lib/__fixtures__/rotation-6nov.json";
import history from "../../public/demo/sector-history.json";
import type { Board } from "../lib/sectors";
import type { RotationMap } from "../lib/rotation";
import { toSectors } from "../lib/groupWords";

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
beforeEach(() => { sessionStorage.clear(); for (const v of ["industries", "sectors"]) sessionStorage.setItem(`finlit:steps:sp:${v}`, JSON.stringify({ mode: "all" }));   /* task #448: every step on the page (the step bar's "All sections") */ localStorage.clear(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); st.loaded = true; st.asked = []; });
afterEach(cleanup);
const at = (el: React.ReactNode, path: string) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}>{el}<Where /></MemoryRouter></QueryClientProvider>);
const sw = () => screen.getByRole("group", { name: "Show sectors or industries" });
const pressed = () => within(sw()).getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent);
/** Every visible "industry" word outside the switch itself and the yardstick ("the average industry" / "industry groups" is the same in both views). */
const industryWords = () => {
  const body = document.body.cloneNode(true) as HTMLElement;
  body.querySelectorAll('[aria-label="Show sectors or industries"], [aria-label="The yardstick"], [data-testid="where"]').forEach((n) => n.remove());
  return (body.textContent ?? "").replace(/average (industry|group)/gi, "").match(/\b[^.]{0,30}\bindustr(y|ies)\b[^.]{0,30}/gi) ?? [];
};

describe("the words follow Show", () => {
  it("swaps industry for sector in any case and keeps the yardstick", () => {
    expect(toSectors("How your industries are doing")).toBe("How your sectors are doing");
    expect(toSectors("An industry moves first; an industry's stocks")).toBe("A sector moves first; a sector's stocks");
    expect(toSectors("INDUSTRY · Industry · Industries")).toBe("SECTOR · Sector · Sectors");
    expect(toSectors("ahead of the average industry over 6 months")).toBe("ahead of the average industry over 6 months");
    expect(toSectors("an NSE industry or sector group")).toBe("an NSE sector");
    expect(toSectors("Banks are up")).toBe("Banks are up");
    // task #333 (file 30): "groups" and "sectors" are never used for the same thing in the Sectors view; the yardstick keeps its name
    expect(toSectors("2 of 19 groups are bouncing back")).toBe("2 of 19 sectors are bouncing back");
    expect(toSectors("All 19 groups, by state")).toBe("All 19 sectors, by state");
    expect(toSectors("against the average group")).toBe("against the average group");
    expect(toSectors("3 inside 3 too-small sector groups")).toBe("3 inside 3 too-small sectors");
  });
});

describe("Sector Pulse: Show: Sectors | Industries", () => {
  it("sits between the page tabs and View, Sectors first and the default, and reads the Sectors board", () => {
    at(<SectorPulsePage />, "/sectors");
    const bar = document.querySelector(".sp-head-bar")!;
    const kids = Array.from(bar.children).map((c) => c.getAttribute("aria-label") ?? c.className);
    expect(kids.indexOf("Sector pages")).toBeLessThan(kids.indexOf("Show sectors or industries"));
    expect(kids.indexOf("Show sectors or industries")).toBeLessThan(kids.indexOf("View"));
    const pills = within(sw()).getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));            // the (i) button beside "Show" is not a pill
    expect(pills.map((b) => b.textContent)).toEqual(["Sectors", "Industries"]);
    expect(pills.every((b) => b.classList.contains("sp-vbtn"))).toBe(true);                                      // styled like the View pills
    expect(pressed()).toEqual(["Sectors"]);
    expect(st.asked).toContain("board:sectors");
    expect(document.body.textContent).toContain(`${SECTOR_NAMES.length + 1} NSE sectors, 1 too small for a reading`);   // task #448 (05 §1): the whole set, then how many are too small
  });
  it("words every section for sectors: no 'industry' is left outside the switch and the yardstick", () => {
    at(<SectorPulsePage />, "/sectors");
    const h2 = screen.getAllByRole("heading", { level: 2 }).map((h) => (h.textContent ?? "").replace(/i$/, ""));
    expect(h2).toEqual(expect.arrayContaining(["Today in one minute", "Momentum and strength, side by side"]));
    expect(screen.getByTestId("no-shares").textContent).toContain("Add them and both pages show your sectors first.");   // task #448: no shares, no Your step
    // task #333: the closed rows and the second box's tabs are worded for sectors too
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => (h.textContent ?? "").replace(/i$/, ""))).toContain("Standout stocks in weak sectors");   // task #448: step 6, no longer a closed row
    expect(within(screen.getByRole("tablist", { name: "Three checks on the price picture" })).getAllByRole("tab").map((t) => t.textContent)).toContain("1Against other sectors");
    expect(industryWords()).toEqual([]);
    expect(document.querySelector(".sp-disclaimer")?.textContent).toMatch(/^Describes price data for NSE sectors; not a recommendation to buy, sell or hold any security\./);
  });
  it("keeps the view in the link, on both page tabs and on every group link", () => {
    at(<SectorPulsePage />, "/sectors?show=sectors");
    const tabs = screen.getByRole("navigation", { name: "Sector pages" });
    expect(within(tabs).getByRole("link", { name: "Sector Rotation" }).getAttribute("href")).toBe("/sectors/rotation?show=sectors");
    const groupLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href^='/sectors/']")).map((a) => a.getAttribute("href")!).filter((h) => !h.startsWith("/sectors/rotation"));
    expect(groupLinks.length).toBeGreaterThan(5);
    expect(groupLinks.every((h) => h.endsWith("?show=sectors"))).toBe(true);
  });
  it("Industries switches the board, the words and the link", () => {
    at(<SectorPulsePage />, "/sectors");
    fireEvent.click(within(sw()).getByRole("button", { name: "Industries" }));
    expect(pressed()).toEqual(["Industries"]);
    expect(screen.getByTestId("where").textContent).toBe("/sectors?show=industries");
    expect(st.asked).toContain("board:industries");
    expect(document.body.textContent).toMatch(/(\d+ NSE industries, read as )?38 groups/);   // task #448 (01 §2): "59 NSE industries, read as 38 groups" once the taxonomy is in
    expect(screen.getByRole("button", { name: "About “NSE industries”" })).toBeTruthy();
    expect(screen.getByTestId("no-shares").textContent).toContain("Add them and both pages show your industries first.");   // task #448: the words follow the view
    const groupLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href^='/sectors/']")).map((a) => a.getAttribute("href")!).filter((h) => !h.startsWith("/sectors/rotation"));
    expect(groupLinks.some((h) => h.includes("show=sectors"))).toBe(false);
  });
  it("before the live data holds the Sectors view: Industries is shown, and the page says why", () => {
    st.loaded = false;
    at(<SectorPulsePage />, "/sectors");
    expect(pressed()).toEqual(["Industries"]);
    expect(document.querySelector(".sp-pending")?.textContent).toMatch(/Sectors view .* next weekend night/);
    expect(st.asked).not.toContain("board:sectors");
  });
});

describe("Sector Rotation: the same switch, the same yardstick", () => {
  it("defaults to Sectors, reads the Sectors rotation and measures it against the industry groups' average", () => {
    at(<SectorRotationPage />, "/sectors/rotation");
    expect(pressed()).toEqual(["Sectors"]);
    expect(st.asked).toContain("rotation:sectors");
    expect(st.asked).toContain("rotation:industries");                              // the yardstick's count is the industry groups'
    const yard = screen.getByLabelText("The yardstick").textContent ?? "";
    expect(yard).toContain(`All ${M.rows.length} industry groups counted equally, as in the Industries view.`);
    expect(yard).toContain("how far a sector is ahead of (+) or behind (−) this average");
    expect(within(screen.getByRole("navigation", { name: "Sector pages" })).getByRole("link", { name: "Sector Pulse" }).getAttribute("href")).toBe("/sectors?show=sectors");
    expect((document.getElementById("sp-find-in") as HTMLInputElement).placeholder).toBe("A sector, e.g. Healthcare");
    expect(industryWords()).toEqual([]);
  });
  it("Industries brings back the industries' map and its own yardstick", () => {
    at(<SectorRotationPage />, "/sectors/rotation?show=industries");
    expect(pressed()).toEqual(["Industries"]);
    expect(screen.getByLabelText("The yardstick").textContent).toContain(`All ${M.rows.length} groups counted equally.`);
  });
});

describe("the Full table views follow Show too", () => {
  it("Sector Pulse Full table: sector words only, the view kept beside ?view=full", () => {
    at(<SectorPulsePage />, "/sectors?view=full&show=sectors");
    expect(pressed()).toEqual(["Sectors"]);
    expect(industryWords()).toEqual([]);
    fireEvent.click(within(screen.getByRole("group", { name: "View" })).getByRole("button", { name: "Simple" }));
    expect(screen.getByTestId("where").textContent).toBe("/sectors?show=sectors");
  });
  it("Sector Rotation Full table: sector words only", () => {
    at(<SectorRotationPage />, "/sectors/rotation?view=full&show=sectors");
    expect(pressed()).toEqual(["Sectors"]);
    expect(industryWords()).toEqual([]);
  });
});
